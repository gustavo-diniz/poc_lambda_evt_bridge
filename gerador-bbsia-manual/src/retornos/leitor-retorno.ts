'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  LEIAUTES_RETORNO,
  TAMANHO_LINHA_RETORNO,
  type CampoRetorno,
  type LeiauteArquivoRetorno,
  type LeiauteRegistro,
} from './leiautes-retorno.js';

export class ErroArquivoRetorno extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroArquivoRetorno';
  }
}

export type ValorCampo = string | number | Date | null;

export interface RegistroLido {
  /** Linha do arquivo físico (1 = header). */
  linha: number;
  /** Valores por campo, na chave "ini-fim". */
  valores: Record<string, ValorCampo>;
}

export interface ArquivoRetornoLido {
  caminho: string;
  leiaute: LeiauteArquivoRetorno;
  /** Registros agrupados por tipo, na ordem em que aparecem no arquivo. */
  registros: Map<string, RegistroLido[]>;
  totalLinhas: number;
  avisos: string[];
}

export function chaveCampo(c: CampoRetorno): string {
  return `${c.ini}-${c.fim}`;
}

/**
 * Lê um arquivo de Retorno do FGO (GFGF010R, 200R, 290R, 450R ou 270R), identificado pelo
 * nome gravado no header (pos. 10-17). Problemas de conteúdo não interrompem a leitura:
 * viram avisos, para que a planilha mostre o que veio e o que está fora do leiaute.
 */
export function lerArquivoRetorno(caminho: string): ArquivoRetornoLido {
  if (!fs.existsSync(caminho)) {
    throw new ErroArquivoRetorno(`Arquivo de retorno não encontrado: "${caminho}"`);
  }

  // O BB SIA entrega os arquivos em latin1; CRLF ou LF.
  const linhas = fs.readFileSync(caminho).toString('latin1').split(/\r?\n/);
  while (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();

  if (linhas.length === 0) {
    throw new ErroArquivoRetorno(`Arquivo "${caminho}" está vazio.`);
  }

  const nomeLogico = linhas[0]!.substring(9, 17).trim();
  const leiaute = LEIAUTES_RETORNO[nomeLogico];
  if (linhas[0]!.substring(7, 9) !== '01' || !leiaute) {
    throw new ErroArquivoRetorno(
      `"${path.basename(caminho)}" não é um retorno do FGO reconhecido: o header (pos. 10-17) traz ` +
        `"${nomeLogico}". Esperado: ${Object.keys(LEIAUTES_RETORNO).join(', ')}.`
    );
  }

  const avisos: string[] = [];
  const registros = new Map<string, RegistroLido[]>();

  linhas.forEach((original, indice) => {
    const numeroLinha = indice + 1;
    let linha = original;

    if (linha.length !== TAMANHO_LINHA_RETORNO) {
      avisos.push(`Linha ${numeroLinha}: tem ${linha.length} colunas (esperado ${TAMANHO_LINHA_RETORNO}).`);
      linha = linha.padEnd(TAMANHO_LINHA_RETORNO, ' ').substring(0, TAMANHO_LINHA_RETORNO);
    }

    const tipo = linha.substring(7, 9);
    const leiauteRegistro = leiaute.registros[tipo];
    if (!leiauteRegistro) {
      avisos.push(
        `Linha ${numeroLinha}: tipo de registro "${tipo}" não existe no ${leiaute.nome} ` +
          `(${leiaute.secaoManual}). Linha ignorada: "${original.trimEnd()}"`
      );
      return;
    }

    const sequencial = linha.substring(0, 7);
    if (sequencial !== String(numeroLinha).padStart(7, '0')) {
      avisos.push(`Linha ${numeroLinha}: nº sequencial do registro "${sequencial}" fora de sequência.`);
    }

    const lido = lerRegistro(linha, numeroLinha, leiauteRegistro, avisos);
    const lista = registros.get(tipo) ?? [];
    lista.push(lido);
    registros.set(tipo, lista);
  });

  conferirEstrutura(linhas, registros, avisos);

  return { caminho, leiaute, registros, totalLinhas: linhas.length, avisos };
}

function lerRegistro(
  linha: string,
  numeroLinha: number,
  leiaute: LeiauteRegistro,
  avisos: string[]
): RegistroLido {
  const valores: Record<string, ValorCampo> = {};

  for (const c of leiaute.campos) {
    const bruto = linha.substring(c.ini - 1, c.fim);
    const local = `Linha ${numeroLinha} (tipo ${leiaute.tipoRegistro}), pos. ${c.ini}-${c.fim} "${c.nome}"`;
    const { valor, problema } = converter(bruto, c);
    if (problema) avisos.push(`${local}: ${problema}`);
    if (valor !== undefined) valores[chaveCampo(c)] = valor;
  }

  return { linha: numeroLinha, valores };
}

/** `valor: undefined` = campo de preenchimento, que não vira coluna. */
function converter(bruto: string, c: CampoRetorno): { valor?: ValorCampo; problema?: string } {
  switch (c.tipo) {
    case 'ignorar':
      return {};

    case 'espacos':
      return bruto.trim() === '' ? {} : { problema: `deveria conter espaços, veio "${bruto.trim()}".` };

    case 'zeros':
      return /^0+$/.test(bruto) ? {} : { problema: `deveria conter zeros, veio "${bruto}".` };

    case 'alfa':
      return { valor: bruto.trimEnd() };

    case 'codigo': {
      const texto = bruto.trim();
      if (texto !== '' && !/^\d+$/.test(texto)) {
        return { valor: bruto.trimEnd(), problema: `campo numérico com "${texto}".` };
      }
      return { valor: texto };
    }

    case 'inteiro':
    case 'moeda':
    case 'decimal': {
      const texto = bruto.trim();
      if (!/^\d+$/.test(texto)) {
        return { valor: bruto.trimEnd(), problema: `campo numérico com "${texto}".` };
      }
      const numero = Number(texto);
      if (c.tipo === 'inteiro') return { valor: numero };
      const casas = c.tipo === 'moeda' ? 2 : (c.casas ?? 0);
      return { valor: numero / 10 ** casas };
    }

    case 'data': {
      const texto = bruto.trim();
      // Zeros = data não informada (o manual usa "00000000" e, no 97 natureza 3, "0").
      if (texto === '' || /^0+$/.test(texto)) return { valor: null };
      const data = /^\d{8}$/.test(texto) ? dataUtc(texto) : null;
      return data ? { valor: data } : { valor: texto, problema: `data inválida "${texto}".` };
    }

    case 'hora': {
      const texto = bruto.trim();
      const partes = texto.match(/^(\d{2})(\d{2})(\d{2})$/);
      if (!partes || Number(partes[1]) > 23 || Number(partes[2]) > 59 || Number(partes[3]) > 59) {
        return { valor: texto, problema: `hora inválida "${texto}".` };
      }
      return { valor: `${partes[1]}:${partes[2]}:${partes[3]}` };
    }
  }
}

/** AAAAMMDD → Date em UTC (meia-noite), ou null se a data não existe. */
export function dataUtc(aaaammdd: string): Date | null {
  const ano = Number(aaaammdd.substring(0, 4));
  const mes = Number(aaaammdd.substring(4, 6));
  const dia = Number(aaaammdd.substring(6, 8));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const valida =
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return valida ? data : null;
}

function conferirEstrutura(
  linhas: string[],
  registros: Map<string, RegistroLido[]>,
  avisos: string[]
): void {
  if ((registros.get('01') ?? []).length !== 1) {
    avisos.push(`O arquivo tem ${(registros.get('01') ?? []).length} headers (esperado 1).`);
  }

  const ultimo = linhas[linhas.length - 1]!;
  if (ultimo.substring(7, 9) !== '99') {
    avisos.push('O último registro não é o trailer (99).');
    return;
  }
  if ((registros.get('99') ?? []).length !== 1) {
    avisos.push(`O arquivo tem ${(registros.get('99') ?? []).length} trailers (esperado 1).`);
  }

  const quantidade = Number(ultimo.substring(9, 16).trim());
  if (quantidade !== linhas.length) {
    avisos.push(`O trailer informa ${ultimo.substring(9, 16).trim()} registros, mas o arquivo tem ${linhas.length}.`);
  }
}
