'use strict';

import * as fs from 'node:fs';

import ExcelJS from 'exceljs';

import { validarCabecalho, type LinhaCsv } from './csv.js';
import { ErroGeracaoArquivo } from './formatadores.js';

/**
 * Colunas que são códigos (não quantidades). No Excel devem estar formatadas como Texto:
 * número acima de 15 dígitos perde precisão e zeros à esquerda somem.
 */
const COLUNAS_CODIGO = new Set<string>([
  'tipoRegistro',
  'idAcordo',
  'novoIdAcordo',
  'cpf',
  'ibgeCliente',
  'novoIbgeCliente',
  'numeroPreValidacao',
]);

const COLUNAS_DATA = new Set<string>([
  'dataAcordo',
  'dataVencimentoOperacao',
  'dataLiberacaoCredito',
  'dataApuracaoSaldos',
  'dataInicioInadimplenciaCapital',
  'dataSolicitacaoHonra',
  'dataRecuperacao',
  'dataCancelamentoRecuperacao',
  'dataDevolucaoHonra',
  'dataAlteracaoOperacao',
  'dataCancelamentoOperacao',
  'dataLiquidacaoOperacao',
  'dataReativacaoOperacao',
]);

/** Data-base do sistema de datas 1900 do Excel (serial 1 = 01/01/1900, com o bug do 29/02/1900). */
const EPOCA_EXCEL_UTC = Date.UTC(1899, 11, 30);
const MILISSEGUNDOS_DIA = 86_400_000;

/**
 * Lê a planilha (.xlsx) e devolve as linhas no mesmo formato da leitura de CSV, para passar
 * pelas mesmas validações. Células numéricas e de data chegam tipadas, sem o texto ambíguo
 * que o Excel gera ao exportar CSV ("2.700" para 2700).
 */
export async function lerXlsx(caminho: string, nomeAba?: string): Promise<LinhaCsv[]> {
  if (!fs.existsSync(caminho)) {
    throw new ErroGeracaoArquivo(`Planilha não encontrada: "${caminho}"`);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(caminho);
  } catch (erro) {
    throw new ErroGeracaoArquivo(
      `Não foi possível ler a planilha "${caminho}" (é um .xlsx válido?): ${(erro as Error).message}`
    );
  }

  const aba = nomeAba ? workbook.getWorksheet(nomeAba) : workbook.worksheets[0];
  if (!aba) {
    const abas = workbook.worksheets.map((planilha) => `"${planilha.name}"`).join(', ');
    throw new ErroGeracaoArquivo(
      nomeAba
        ? `Aba "${nomeAba}" não encontrada em "${caminho}". Abas disponíveis: ${abas}.`
        : `Planilha "${caminho}" não tem nenhuma aba.`
    );
  }

  const origem = `Planilha "${caminho}" (aba "${aba.name}")`;

  const cabecalho: string[] = [];
  aba.getRow(1).eachCell({ includeEmpty: true }, (celula, coluna) => {
    cabecalho[coluna - 1] = String(valorBruto(celula.value) ?? '').trim();
  });
  if (cabecalho.length === 0) {
    throw new ErroGeracaoArquivo(`${origem} está vazia.`);
  }
  validarCabecalho(cabecalho, origem);

  const linhas: LinhaCsv[] = [];
  for (let numeroLinha = 2; numeroLinha <= aba.rowCount; numeroLinha += 1) {
    const linha = aba.getRow(numeroLinha);
    const valores: Record<string, string> = {};
    let possuiConteudo = false;

    cabecalho.forEach((coluna, indice) => {
      if (coluna === '') return;
      const texto = converterCelula(linha.getCell(indice + 1).value, coluna, numeroLinha, origem);
      valores[coluna] = texto;
      if (texto !== '') possuiConteudo = true;
    });

    if (possuiConteudo) {
      linhas.push({ numeroLinha, valores });
    }
  }

  return linhas;
}

type ValorBruto = string | number | boolean | Date | null;

/** Desembrulha fórmulas, rich text e hyperlinks do ExcelJS até o valor efetivo da célula. */
function valorBruto(valor: ExcelJS.CellValue): ValorBruto {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'object' || valor instanceof Date) return valor;

  if ('error' in valor) {
    throw new ErroGeracaoArquivo(`célula com erro do Excel (${valor.error})`);
  }
  if ('result' in valor) return valorBruto(valor.result as ExcelJS.CellValue);
  if ('formula' in valor || 'sharedFormula' in valor) return null;
  if ('richText' in valor) return valor.richText.map((trecho) => trecho.text).join('');
  if ('text' in valor) return valorBruto(valor.text as ExcelJS.CellValue);
  return null;
}

function converterCelula(
  valor: ExcelJS.CellValue,
  coluna: string,
  numeroLinha: number,
  origem: string
): string {
  const local = `${origem}, linha ${numeroLinha}, coluna "${coluna}"`;

  let bruto: ValorBruto;
  try {
    bruto = valorBruto(valor);
  } catch (erro) {
    throw new ErroGeracaoArquivo(`${local}: ${(erro as Error).message}.`);
  }

  if (bruto === null) return '';
  if (typeof bruto === 'string') return bruto.trim();
  if (typeof bruto === 'boolean') {
    throw new ErroGeracaoArquivo(`${local}: valor lógico (VERDADEIRO/FALSO) não é aceito.`);
  }

  if (bruto instanceof Date) {
    if (!COLUNAS_DATA.has(coluna)) {
      throw new ErroGeracaoArquivo(
        `${local}: a célula está formatada como data, mas a coluna não é de data.`
      );
    }
    return dataIso(bruto);
  }

  // A partir daqui, número.
  if (COLUNAS_CODIGO.has(coluna)) {
    if (!Number.isSafeInteger(bruto) || bruto < 0) {
      throw new ErroGeracaoArquivo(
        `${local}: o código veio como número (${bruto}) e pode ter perdido dígitos. ` +
          `Formate a coluna como Texto no Excel e digite o valor novamente.`
      );
    }
    return String(bruto);
  }

  if (COLUNAS_DATA.has(coluna)) {
    if (bruto === 0) return '0';
    // 8 dígitos = data já digitada como AAAAMMDD; abaixo disso é o nº serial do Excel.
    if (Number.isInteger(bruto) && bruto >= 10_000_000) return String(bruto);
    return dataIso(new Date(EPOCA_EXCEL_UTC + Math.floor(bruto) * MILISSEGUNDOS_DIA));
  }

  // Valores e índices: número JS sem separador de milhar ("2700", "2594.84").
  return String(bruto);
}

/** O ExcelJS devolve datas como meia-noite UTC do dia digitado; lê em UTC para não trocar o dia. */
function dataIso(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
