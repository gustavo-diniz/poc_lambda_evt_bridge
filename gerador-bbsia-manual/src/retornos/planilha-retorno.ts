'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';

import ExcelJS from 'exceljs';

import { tipoManualDoCampo, type CampoRetorno, type LeiauteRegistro } from './leiautes-retorno.js';
import { chaveCampo, dataUtc, type ArquivoRetornoLido, type ValorCampo } from './leitor-retorno.js';

/**
 * Nome do arquivo de retorno como o BB SIA entrega:
 * GFG200.C59010.2026070100005940.230703.RET → protocolo começa pela data (AAAAMMDD) e o
 * penúltimo bloco é a hora (HHMMSS) em que o retorno foi disponibilizado.
 */
const NOME_BB_SIA = /^GFG\w+\.C\d+\.(\d{8})\d+\.(\d{6})\.RET$/i;

export interface IdentificacaoPlanilha {
  /** Nome do .xlsx: <arquivo>_<remessa>_<AAAAMMDD>_<HHMMSS>.xlsx (partes ausentes são omitidas). */
  nomeArquivo: string;
  numeroRemessa?: string;
  data?: Date;
  hora?: string;
  origemData?: string;
  origemHora?: string;
}

/**
 * Monta o nome da planilha a partir do header do retorno. Onde o header não traz
 * data/hora (450R, 270R e hora do 200R/290R), usa o nome do arquivo entregue pelo BB SIA.
 */
export function identificarPlanilha(lido: ArquivoRetornoLido): IdentificacaoPlanilha {
  const { leiaute } = lido;
  const header = lido.registros.get('01')?.[0]?.valores ?? {};
  const id: IdentificacaoPlanilha = { nomeArquivo: '' };

  if (leiaute.temNumeroRemessa) {
    const numero = header['32-35'];
    if (typeof numero === 'string' && numero !== '') id.numeroRemessa = numero;
  }

  if (leiaute.dataHeader) {
    const data = header[`${leiaute.dataHeader.ini}-${leiaute.dataHeader.fim}`];
    if (data instanceof Date) {
      id.data = data;
      id.origemData = `header, pos. ${leiaute.dataHeader.ini}-${leiaute.dataHeader.fim} (${leiaute.dataHeader.significado})`;
    }
  }
  if (leiaute.horaHeader) {
    const hora = header[`${leiaute.horaHeader.ini}-${leiaute.horaHeader.fim}`];
    if (typeof hora === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(hora)) {
      id.hora = hora;
      id.origemHora = `header, pos. ${leiaute.horaHeader.ini}-${leiaute.horaHeader.fim} (${leiaute.horaHeader.significado})`;
    }
  }

  const bbSia = path.basename(lido.caminho).match(NOME_BB_SIA);
  if (bbSia) {
    const origem = `nome do arquivo no BB SIA (${path.basename(lido.caminho)})`;
    const dataNome = dataUtc(bbSia[1]!);
    if (!id.data && dataNome) {
      id.data = dataNome;
      id.origemData = `${origem} — data do protocolo`;
    }
    const horaNome = bbSia[2]!;
    if (!id.hora && /^([01]\d|2[0-3])[0-5]\d[0-5]\d$/.test(horaNome)) {
      id.hora = `${horaNome.substring(0, 2)}:${horaNome.substring(2, 4)}:${horaNome.substring(4, 6)}`;
      id.origemHora = `${origem} — hora de disponibilização`;
    }
  }

  const partes = [
    leiaute.nome,
    id.numeroRemessa,
    id.data ? dataIsoCompacta(id.data) : undefined,
    id.hora ? id.hora.replace(/:/g, '') : undefined,
  ].filter((parte): parte is string => Boolean(parte));

  id.nomeArquivo = `${partes.join('_')}.xlsx`;
  return id;
}

/** Gera a planilha do retorno em `diretorio` e devolve o caminho gravado. */
export async function gerarPlanilhaRetorno(
  lido: ArquivoRetornoLido,
  diretorio: string
): Promise<{ caminho: string; identificacao: IdentificacaoPlanilha }> {
  const identificacao = identificarPlanilha(lido);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'gerador-bbsia-manual';

  montarResumo(workbook, lido, identificacao);

  for (const tipo of ordenarTipos([...lido.registros.keys()])) {
    const leiauteRegistro = lido.leiaute.registros[tipo]!;
    montarAbaRegistro(workbook, leiauteRegistro, lido.registros.get(tipo)!);
  }

  fs.mkdirSync(diretorio, { recursive: true });
  const caminho = path.join(diretorio, identificacao.nomeArquivo);
  await workbook.xlsx.writeFile(caminho);
  return { caminho, identificacao };
}

// ----------------------------------------------------------------------------- abas

/** Header primeiro, trailer por último, detalhes em ordem numérica. */
export function ordenarTipos(tipos: string[]): string[] {
  const peso = (tipo: string) => (tipo === '01' ? -1 : tipo === '99' ? 1000 : Number(tipo));
  return [...tipos].sort((a, b) => peso(a) - peso(b));
}

function camposVisiveis(leiaute: LeiauteRegistro): CampoRetorno[] {
  return leiaute.campos.filter((c) => c.tipo !== 'espacos' && c.tipo !== 'zeros' && c.tipo !== 'ignorar');
}

function montarAbaRegistro(workbook: ExcelJS.Workbook, leiaute: LeiauteRegistro, registros: { valores: Record<string, ValorCampo> }[]): void {
  const aba = workbook.addWorksheet(leiaute.aba.substring(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  interface Coluna {
    titulo: string;
    nota: string;
    formato?: string;
    valor: (valores: Record<string, ValorCampo>) => ValorCampo;
  }

  const colunas: Coluna[] = [];
  for (const c of camposVisiveis(leiaute)) {
    const chave = chaveCampo(c);
    colunas.push({
      titulo: c.nome,
      nota: `Posições ${c.ini}-${c.fim} · tipo ${tipoManualDoCampo(c)} · ${c.fim - c.ini + 1} posições\n${c.descricao}`,
      formato: formatoExcel(c),
      valor: (valores) => valores[chave] ?? null,
    });
    if (c.tabela) {
      const tabela = c.tabela;
      colunas.push({
        titulo: `${c.nome} — descrição`,
        nota: `Descrição do código conforme a tabela do manual ${tabela.titulo}.`,
        valor: (valores) => {
          const codigo = valores[chave];
          if (typeof codigo !== 'string' || !/^\d+$/.test(codigo)) return null;
          return tabela.codigos[Number(codigo)] ?? `Código ${codigo} não consta na tabela ${tabela.titulo}`;
        },
      });
    }
  }

  const larguras = colunas.map((coluna) => Math.min(Math.max(coluna.titulo.length + 2, 12), 45));

  const cabecalho = aba.getRow(1);
  colunas.forEach((coluna, i) => {
    const celula = cabecalho.getCell(i + 1);
    celula.value = coluna.titulo;
    celula.note = coluna.nota;
    celula.font = { bold: true };
    celula.alignment = { vertical: 'middle', wrapText: true };
  });

  registros.forEach((registro, indice) => {
    const linha = aba.getRow(indice + 2);
    colunas.forEach((coluna, i) => {
      const valor = coluna.valor(registro.valores);
      const celula = linha.getCell(i + 1);
      celula.value = valor;
      if (coluna.formato) celula.numFmt = coluna.formato;
      const tamanho = valor instanceof Date ? 10 : String(valor ?? '').length;
      larguras[i] = Math.min(Math.max(larguras[i]!, tamanho + 2), 60);
    });
  });

  larguras.forEach((largura, i) => {
    aba.getColumn(i + 1).width = largura;
  });
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
}

function formatoExcel(c: CampoRetorno): string | undefined {
  switch (c.tipo) {
    case 'data':
      return 'dd/mm/yyyy';
    case 'moeda':
      return '#,##0.00';
    case 'decimal':
      return `0.${'0'.repeat(c.casas ?? 0)}`;
    case 'inteiro':
      return '0';
    case 'codigo':
    case 'alfa':
    case 'hora':
      return '@';
    default:
      return undefined;
  }
}

function montarResumo(workbook: ExcelJS.Workbook, lido: ArquivoRetornoLido, id: IdentificacaoPlanilha): void {
  const aba = workbook.addWorksheet('Resumo');
  aba.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 60 },
    { key: 'c', width: 14 },
    { key: 'd', width: 14 },
  ];

  const { leiaute } = lido;
  const header = lido.registros.get('01')?.[0]?.valores ?? {};
  const titulo = aba.addRow([`${leiaute.nome} — ${leiaute.titulo}`]);
  titulo.font = { bold: true, size: 14 };
  aba.addRow([]);

  const info: [string, ValorCampo | undefined][] = [
    ['Arquivo de origem', path.basename(lido.caminho)],
    ['Leiaute (Manual FGO)', `${leiaute.secaoManual} — versão ${textoData(header['18-25'])}`],
    ['Nº da Remessa', id.numeroRemessa ?? (leiaute.temNumeroRemessa ? '(não informado)' : '(não se aplica a este arquivo)')],
    ['Data do arquivo', id.data ? `${textoData(id.data)} — fonte: ${id.origemData}` : '(não disponível)'],
    ['Hora do arquivo', id.hora ? `${id.hora} — fonte: ${id.origemHora}` : '(não disponível)'],
    ['Código do Agente Financeiro', header['26-28']],
    ['CNPJ do Agente Financeiro', header['56-69']],
  ];
  if (leiaute.nome === 'GFGF010R') {
    const codigo = header['209-211'];
    const campoRejeicao = leiaute.registros['01']!.campos.find((c) => c.ini === 209)!;
    const descricao = typeof codigo === 'string' ? campoRejeicao.tabela!.codigos[Number(codigo)] : undefined;
    info.push(['Resultado da Remessa', `${codigo ?? ''} — ${descricao ?? 'código fora da tabela §14.1'}`]);
  }
  info.push(['Linhas no arquivo', lido.totalLinhas]);
  info.push(['Quantidade informada no trailer', lido.registros.get('99')?.[0]?.valores['10-16'] ?? '(sem trailer)']);

  for (const [rotulo, valor] of info) {
    const linha = aba.addRow([rotulo, valor ?? '']);
    linha.getCell(1).font = { bold: true };
  }

  aba.addRow([]);
  const temRejeicao = leiaute.nome === 'GFGF200R';
  const cab = aba.addRow(['Tipo de registro', 'Descrição', 'Quantidade', ...(temRejeicao ? ['Rejeitados'] : [])]);
  cab.font = { bold: true };
  for (const tipo of ordenarTipos([...lido.registros.keys()])) {
    const registros = lido.registros.get(tipo)!;
    const rejeitados = temRejeicao && tipo !== '01' && tipo !== '99'
      ? registros.filter((r) => Number(r.valores['209-211'] ?? 0) !== 0).length
      : undefined;
    aba.addRow([tipo, leiaute.registros[tipo]!.titulo, registros.length, ...(rejeitados !== undefined ? [rejeitados] : [])]);
  }

  aba.addRow([]);
  const tituloAvisos = aba.addRow([lido.avisos.length === 0 ? 'Avisos: nenhum — arquivo conforme o leiaute.' : `Avisos (${lido.avisos.length})`]);
  tituloAvisos.font = { bold: true, color: lido.avisos.length === 0 ? undefined : { argb: 'FFC00000' } };
  for (const aviso of lido.avisos) {
    aba.addRow([aviso]);
  }
}

function textoData(valor: ValorCampo | undefined): string {
  if (!(valor instanceof Date)) return String(valor ?? '');
  return `${String(valor.getUTCDate()).padStart(2, '0')}/${String(valor.getUTCMonth() + 1).padStart(2, '0')}/${valor.getUTCFullYear()}`;
}

function dataIsoCompacta(data: Date): string {
  return `${data.getUTCFullYear()}${String(data.getUTCMonth() + 1).padStart(2, '0')}${String(data.getUTCDate()).padStart(2, '0')}`;
}
