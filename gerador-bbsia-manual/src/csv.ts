'use strict';

import * as fs from 'node:fs';

import { ErroGeracaoArquivo } from './formatadores.js';
import {
  DESCRICAO_TIPO_DETALHE,
  TIPOS_DETALHE_SUPORTADOS,
  type RegistroDetalhe,
  type TipoDetalhe,
} from './tipos.js';

const SEPARADOR_PADRAO = ';';

/** Colunas obrigatórias por tipo de registro. */
const COLUNAS_OBRIGATORIAS: Record<TipoDetalhe, string[]> = {
  '03': [
    'idAcordo',
    'ibgeCliente',
    'cpf',
    'valorRenda',
    'valorOperacaoCredito',
    'dataAcordo',
    'dataVencimentoOperacao',
    'numeroPreValidacao',
  ],
  '04': ['idAcordo', 'dataLiberacaoCredito', 'valorLiberacaoCredito'],
  '05': [
    'idAcordo',
    'dataApuracaoSaldos',
    'valorSaldoCapitalNormalidade',
    'valorSaldoCapitalAtraso',
    'valorSaldoEncargosNormalidade',
    'valorSaldoEncargosAtraso',
    'indicePerdaEsperada',
  ],
  '10': [
    'idAcordo',
    'dataAlteracaoOperacao',
    'novoIbgeCliente',
    'novoValorRenda',
    'dataVencimentoOperacao',
  ],
  '11': ['idAcordo', 'dataCancelamentoOperacao'],
  '12': ['idAcordo', 'dataLiquidacaoOperacao'],
};

/** Colunas aceitas (usadas ou opcionais). Qualquer outra vira apenas um aviso. */
const COLUNAS_CONHECIDAS = new Set<string>([
  'tipoRegistro',
  // 03
  ...COLUNAS_OBRIGATORIAS['03'],
  'valorSubvencao',
  // 04
  ...COLUNAS_OBRIGATORIAS['04'],
  // 05
  ...COLUNAS_OBRIGATORIAS['05'],
  'dataInicioInadimplenciaCapital',
  // 10
  ...COLUNAS_OBRIGATORIAS['10'],
  'novoIdAcordo',
  // 11
  ...COLUNAS_OBRIGATORIAS['11'],
  // 12
  ...COLUNAS_OBRIGATORIAS['12'],
]);

export interface LinhaCsv {
  numeroLinha: number;
  valores: Record<string, string>;
}

/**
 * Parser de CSV posicional-agnóstico: separador configurável, suporte a aspas duplas
 * e a quebras de linha CRLF/LF. Sem dependências externas.
 */
export function lerCsv(caminho: string, separador = SEPARADOR_PADRAO): LinhaCsv[] {
  if (!fs.existsSync(caminho)) {
    throw new ErroGeracaoArquivo(`Arquivo CSV não encontrado: "${caminho}"`);
  }

  const conteudo = fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  const linhas = conteudo
    .split(/\r?\n/)
    .map((linha, indice) => ({ texto: linha, numeroLinha: indice + 1 }))
    .filter((linha) => linha.texto.trim() !== '');

  if (linhas.length === 0) {
    throw new ErroGeracaoArquivo(`Arquivo CSV "${caminho}" está vazio.`);
  }

  const cabecalho = dividirLinha(linhas[0]!.texto, separador).map((coluna) => coluna.trim());

  if (!cabecalho.includes('tipoRegistro')) {
    throw new ErroGeracaoArquivo(
      `Arquivo CSV "${caminho}" precisa da coluna "tipoRegistro" para identificar o tipo de detalhe (03, 04 ou 05).`
    );
  }

  for (const coluna of cabecalho) {
    if (coluna !== '' && !COLUNAS_CONHECIDAS.has(coluna)) {
      console.warn(`[WARN] Coluna "${coluna}" não é usada pelo leiaute GFG0010 e será ignorada.`);
    }
  }

  return linhas.slice(1).map(({ texto, numeroLinha }) => {
    const campos = dividirLinha(texto, separador);
    const valores: Record<string, string> = {};

    cabecalho.forEach((coluna, indice) => {
      if (coluna !== '') {
        valores[coluna] = (campos[indice] ?? '').trim();
      }
    });

    return { numeroLinha, valores };
  });
}

function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i]!;

    if (dentroDeAspas) {
      if (caractere === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += caractere;
      }
      continue;
    }

    if (caractere === '"') {
      dentroDeAspas = true;
    } else if (caractere === separador) {
      campos.push(atual);
      atual = '';
    } else {
      atual += caractere;
    }
  }

  campos.push(atual);
  return campos;
}

/**
 * Converte as linhas do CSV em registros-detalhe tipados, validando a presença
 * das colunas obrigatórias de cada tipo.
 */
export function mapearRegistros(linhas: LinhaCsv[]): RegistroDetalhe[] {
  return linhas.map((linha) => mapearRegistro(linha));
}

function mapearRegistro({ numeroLinha, valores }: LinhaCsv): RegistroDetalhe {
  const tipoRegistro = normalizarTipoRegistro(valores['tipoRegistro'], numeroLinha);

  for (const coluna of COLUNAS_OBRIGATORIAS[tipoRegistro]) {
    const valor = valores[coluna];
    if (valor === undefined || valor === '') {
      throw new ErroGeracaoArquivo(
        `Linha ${numeroLinha} do CSV (tipo ${tipoRegistro} - ${DESCRICAO_TIPO_DETALHE[tipoRegistro]}): ` +
          `coluna obrigatória "${coluna}" ausente ou vazia.`
      );
    }
  }

  switch (tipoRegistro) {
    case '03':
      return {
        tipoRegistro,
        linhaCsv: numeroLinha,
        idAcordo: valores['idAcordo']!,
        ibgeCliente: valores['ibgeCliente']!,
        cpf: valores['cpf']!,
        valorRenda: valores['valorRenda']!,
        valorOperacaoCredito: valores['valorOperacaoCredito']!,
        dataAcordo: valores['dataAcordo']!,
        dataVencimentoOperacao: valores['dataVencimentoOperacao']!,
        numeroPreValidacao: valores['numeroPreValidacao']!,
        valorSubvencao: valores['valorSubvencao'] ?? '',
      };

    case '04':
      return {
        tipoRegistro,
        linhaCsv: numeroLinha,
        idAcordo: valores['idAcordo']!,
        dataLiberacaoCredito: valores['dataLiberacaoCredito']!,
        valorLiberacaoCredito: valores['valorLiberacaoCredito']!,
      };

    case '05':
      return {
        tipoRegistro,
        linhaCsv: numeroLinha,
        idAcordo: valores['idAcordo']!,
        dataApuracaoSaldos: valores['dataApuracaoSaldos']!,
        valorSaldoCapitalNormalidade: valores['valorSaldoCapitalNormalidade']!,
        valorSaldoCapitalAtraso: valores['valorSaldoCapitalAtraso']!,
        valorSaldoEncargosNormalidade: valores['valorSaldoEncargosNormalidade']!,
        valorSaldoEncargosAtraso: valores['valorSaldoEncargosAtraso']!,
        dataInicioInadimplenciaCapital: valores['dataInicioInadimplenciaCapital'] ?? '',
        indicePerdaEsperada: valores['indicePerdaEsperada']!,
      };

    case '10':
      return {
        tipoRegistro,
        linhaCsv: numeroLinha,
        idAcordo: valores['idAcordo']!,
        novoIdAcordo: valores['novoIdAcordo'] ?? '',
        dataAlteracaoOperacao: valores['dataAlteracaoOperacao']!,
        novoIbgeCliente: valores['novoIbgeCliente']!,
        novoValorRenda: valores['novoValorRenda']!,
        dataVencimentoOperacao: valores['dataVencimentoOperacao']!,
      };

    case '11':
      return {
        tipoRegistro,
        linhaCsv: numeroLinha,
        idAcordo: valores['idAcordo']!,
        dataCancelamentoOperacao: valores['dataCancelamentoOperacao']!,
      };

    case '12':
      return {
        tipoRegistro,
        linhaCsv: numeroLinha,
        idAcordo: valores['idAcordo']!,
        dataLiquidacaoOperacao: valores['dataLiquidacaoOperacao']!,
      };
  }
}

function normalizarTipoRegistro(valor: string | undefined, numeroLinha: number): TipoDetalhe {
  const texto = String(valor ?? '').trim().padStart(2, '0');

  if (!TIPOS_DETALHE_SUPORTADOS.includes(texto as TipoDetalhe)) {
    throw new ErroGeracaoArquivo(
      `Linha ${numeroLinha} do CSV: tipoRegistro "${valor}" inválido. ` +
        `Valores aceitos: ${TIPOS_DETALHE_SUPORTADOS.join(', ')}.`
    );
  }

  return texto as TipoDetalhe;
}
