'use strict';

import * as fs from 'node:fs';
import { ErroGeracaoArquivo } from './formatadores.js';

/**
 * Parâmetros fixos do leiaute GFG0010 + dados de Header/Trailer.
 * Tudo que é fixo (ou que vale para o arquivo inteiro) mora aqui — nunca no CSV.
 */
export interface ParametrosRemessa {
  /** Header — nome lógico do arquivo (pos 10-17). */
  nomeArquivoRemessa: string;
  /** Header — versão do leiaute (pos 18-25). */
  versaoLeiaute: string;
  /** Header — código do Agente Financeiro atribuído pelo Administrador (pos 26-28). Digio = 59. */
  codigoAgenteFinanceiro: number;
  /** Header — código do Fundo Garantidor (pos 29-31). FGO = 10. */
  codigoFundoGarantidor: number;
  /** Header — nº sequencial da Remessa gerada pelo Agente (pos 32-35). Começa em 1. */
  numeroSequencialRemessa: number;

  /** Detalhe 03 — nº da agência contratante (pos 30-33). */
  numeroAgenciaContratanteOperacao: number;
  /** Detalhe 03 — código do tipo de pessoa do mutuário (pos 41). */
  codigoTipoPessoa: number;
  /** Detalhe 03 — código do público-alvo (pos 56-57). */
  codigoTipoPublicoAlvo: number;
  /** Detalhe 03 — percentual da garantia FGO com 2 casas (pos 92-96). 100 = "10000". */
  percentualGarantiaOperacaoCredito: number;
  /** Detalhe 03 — código da modalidade de crédito (pos 97). */
  codigoTipoModalidadeCredito: number;
  /** Detalhe 03 — código da finalidade do crédito (pos 98). */
  codigoTipoFinalidadeCredito: number;
  /** Detalhe 03 — código da fonte de recursos (pos 99-101). */
  codigoTipoFonteRecurso: number;
  /** Detalhe 03 — código do programa de crédito (pos 102-105). */
  codigoTipoProgramaCredito: number;
  /** Detalhe 03 — código do tipo de cronograma de amortizações (pos 122). */
  codigoTipoCronogramaAmortizacao: number;
  /** Detalhe 03 — código de condição especial da operação (pos 123-124). */
  codigoTipoCondicaoEspecial: number;
  /** Detalhe 03 — data do despacho externo (pos 125-132). Manual manda "00000000". */
  dataDespachoExternoOperacao: number;
  /** Detalhe 03 — código do tipo de formalização (pos 133). */
  codigoTipoFormalizacao: number;

  /** Saída — diretório onde o arquivo físico é gravado. */
  diretorioSaida: string;
  /** Saída — nome do arquivo físico gerado. */
  nomeArquivoFisico: string;
}

export const PARAMETROS_PADRAO: ParametrosRemessa = {
  nomeArquivoRemessa: 'GFGF0010',
  versaoLeiaute: '20170331',
  codigoAgenteFinanceiro: 59,
  codigoFundoGarantidor: 10,
  numeroSequencialRemessa: 1,

  numeroAgenciaContratanteOperacao: 1,
  codigoTipoPessoa: 1,
  codigoTipoPublicoAlvo: 7,
  percentualGarantiaOperacaoCredito: 100,
  codigoTipoModalidadeCredito: 1,
  codigoTipoFinalidadeCredito: 3,
  codigoTipoFonteRecurso: 11,
  codigoTipoProgramaCredito: 50,
  codigoTipoCronogramaAmortizacao: 1,
  codigoTipoCondicaoEspecial: 1,
  dataDespachoExternoOperacao: 0,
  codigoTipoFormalizacao: 1,

  diretorioSaida: './saida',
  nomeArquivoFisico: 'GFGF0010.txt',
};

const CHAVES_CONHECIDAS = new Set(Object.keys(PARAMETROS_PADRAO));

export function carregarParametros(caminhoJson?: string): ParametrosRemessa {
  if (!caminhoJson) {
    return { ...PARAMETROS_PADRAO };
  }

  if (!fs.existsSync(caminhoJson)) {
    throw new ErroGeracaoArquivo(`Arquivo de parâmetros não encontrado: "${caminhoJson}"`);
  }

  let conteudo: unknown;
  try {
    conteudo = JSON.parse(fs.readFileSync(caminhoJson, 'utf8'));
  } catch (erro) {
    throw new ErroGeracaoArquivo(
      `Arquivo de parâmetros "${caminhoJson}" não é um JSON válido: ${(erro as Error).message}`
    );
  }

  if (typeof conteudo !== 'object' || conteudo === null || Array.isArray(conteudo)) {
    throw new ErroGeracaoArquivo(
      `Arquivo de parâmetros "${caminhoJson}" deve conter um objeto JSON na raiz.`
    );
  }

  for (const chave of Object.keys(conteudo as Record<string, unknown>)) {
    if (!CHAVES_CONHECIDAS.has(chave)) {
      console.warn(`[WARN] Parâmetro desconhecido ignorado em "${caminhoJson}": "${chave}"`);
    }
  }

  return { ...PARAMETROS_PADRAO, ...(conteudo as Partial<ParametrosRemessa>) };
}
