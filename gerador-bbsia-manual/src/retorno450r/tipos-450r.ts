'use strict';

/**
 * Leiaute do 4º Retorno — Movimentação Financeira — GFGF450R (manual §13.5).
 * Tabelas de domínio em §14.16 (tipo de movimentação) e §14.17 (natureza).
 */

export const NOME_ARQUIVO_RETORNO_450R = 'GFGF450R';
export const VERSAO_LEIAUTE_450R = '20170331';

export const TIPO_REGISTRO_450R_HEADER = '01';
export const TIPO_REGISTRO_450R_MOVIMENTACAO = '97';
export const TIPO_REGISTRO_450R_TRAILER = '99';

/** Toda linha do GFGF450R tem exatamente 211 colunas. */
export const TAMANHO_LINHA_450R = 211;

/** §14.17 — Natureza da movimentação financeira. */
export type NaturezaMovimentacao = '1' | '2' | '3';

export const DESCRICAO_NATUREZA_MOVIMENTACAO: Record<NaturezaMovimentacao, string> = {
  '1': 'A favor do FGO',
  '2': 'A favor do Agente Financeiro',
  '3': 'Sem movimentação',
};

/** §14.16 — Tipo de movimentação financeira. */
export type TipoMovimentacao = '01' | '02' | '03' | '04' | '05' | '06' | '07';

export const TIPOS_MOVIMENTACAO: Record<
  TipoMovimentacao,
  { descricao: string; natureza: NaturezaMovimentacao }
> = {
  '01': { descricao: 'Recebimento de CCG', natureza: '1' },
  '02': { descricao: 'Devolução de CCG', natureza: '2' },
  '03': { descricao: 'Honra da garantia', natureza: '2' },
  '04': { descricao: 'Devolução de valor honrado', natureza: '1' },
  '05': { descricao: 'Recuperação de valor honrado', natureza: '1' },
  '06': { descricao: 'Devolução de valor recuperado', natureza: '2' },
  '07': { descricao: 'Abatimento no saldo honrado', natureza: '3' },
};

export function ehTipoMovimentacao(valor: string): valor is TipoMovimentacao {
  return Object.prototype.hasOwnProperty.call(TIPOS_MOVIMENTACAO, valor);
}

/** 01 - HEADER. */
export interface Header450R {
  noSequencialRegistro: number;
  codigoTipoRegistro: '01';
  nomeArquivoRetorno: string;
  versaoLeiaute: string;
  codigoAgenteFinanceiro: number;
  codigoFundoGarantidor: number;
  numeroSequencialRemessa: number;
  cnpjAgenteFinanceiro: string;
}

/** 97 - DETALHE (MOVIMENTAÇÃO FINANCEIRA). */
export interface Movimentacao450R {
  noSequencialRegistro: number;
  codigoTipoRegistro: '97';
  /** Código identificador da operação no âmbito do Agente (idAcordo), sem espaços à direita. */
  codigoOperacaoAgente: string;
  codigoTipoMovimentacao: string;
  /** Descrição do §14.16; `undefined` quando o código não está na tabela. */
  descricaoTipoMovimentacao?: string;
  naturezaMovimentacao?: NaturezaMovimentacao;
  descricaoNaturezaMovimentacao?: string;
  /** AAAA-MM-DD; `null` quando o arquivo traz "00000000" (natureza 3 — sem movimentação). */
  dataMovimentacaoFinanceira: string | null;
  /** AAAA-MM-DD. */
  dataFatoGerador: string | null;
  /** Valores em reais (o arquivo traz centavos sem separador). */
  valorNominalFatoGerador: number;
  valorAtualizacaoMonetaria: number;
  valorIssqn: number;
  valorLiquidoMovimentado: number;
  /** Nº sequencial do registro (da Remessa) que causou a movimentação. */
  noSequencialRegistroCausador: number;
}

/** 99 - TRAILER. */
export interface Trailer450R {
  noSequencialRegistro: number;
  codigoTipoRegistro: '99';
  quantidadeRegistros: number;
}

export interface Retorno450R {
  header: Header450R;
  movimentacoes: Movimentacao450R[];
  trailer: Trailer450R;
  /** Somatório do valor líquido por natureza (1 = a favor do FGO, 2 = a favor do Agente). */
  totais: {
    quantidadeMovimentacoes: number;
    valorLiquidoAFavorDoFgo: number;
    valorLiquidoAFavorDoAgente: number;
    porTipoMovimentacao: Record<string, { quantidade: number; valorLiquido: number }>;
  };
}
