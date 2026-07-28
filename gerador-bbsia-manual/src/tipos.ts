'use strict';

export const TIPO_REGISTRO_HEADER = '01';
export const TIPO_REGISTRO_FORMALIZACAO = '03';
export const TIPO_REGISTRO_LIBERACAO = '04';
export const TIPO_REGISTRO_SALDO = '05';
export const TIPO_REGISTRO_ALTERACAO = '10';
export const TIPO_REGISTRO_CANCELAMENTO = '11';
export const TIPO_REGISTRO_LIQUIDACAO = '12';
export const TIPO_REGISTRO_TRAILER = '99';

export const TIPOS_DETALHE_SUPORTADOS = [
  TIPO_REGISTRO_FORMALIZACAO,
  TIPO_REGISTRO_LIBERACAO,
  TIPO_REGISTRO_SALDO,
  TIPO_REGISTRO_ALTERACAO,
  TIPO_REGISTRO_CANCELAMENTO,
  TIPO_REGISTRO_LIQUIDACAO,
] as const;

export type TipoDetalhe = (typeof TIPOS_DETALHE_SUPORTADOS)[number];

export const DESCRICAO_TIPO_DETALHE: Record<TipoDetalhe, string> = {
  '03': 'DETALHE (FORMALIZAÇÃO DE OPERAÇÃO)',
  '04': 'DETALHE (LIBERAÇÃO DE CRÉDITO)',
  '05': 'DETALHE (INFORMAÇÃO DE SALDO)',
  '10': 'DETALHE (ALTERAÇÃO DE OPERAÇÃO)',
  '11': 'DETALHE (CANCELAMENTO DE OPERAÇÃO PELO AGENTE)',
  '12': 'DETALHE (LIQUIDAÇÃO DE OPERAÇÃO)',
};

/** 03 — Formalização da operação (manual §13.1). */
export interface DetalheFormalizacao {
  tipoRegistro: '03';
  linhaCsv: number;
  idAcordo: string;
  ibgeCliente: string;
  cpf: string;
  valorRenda: string;
  valorOperacaoCredito: string;
  dataAcordo: string;
  dataVencimentoOperacao: string;
  numeroPreValidacao: string;
  valorSubvencao: string;
}

/** 04 — Liberação de crédito (manual §13.1). */
export interface DetalheLiberacao {
  tipoRegistro: '04';
  linhaCsv: number;
  idAcordo: string;
  dataLiberacaoCredito: string;
  valorLiberacaoCredito: string;
}

/** 05 — Informação de saldo (manual §13.1). */
export interface DetalheSaldo {
  tipoRegistro: '05';
  linhaCsv: number;
  idAcordo: string;
  dataApuracaoSaldos: string;
  valorSaldoCapitalNormalidade: string;
  valorSaldoCapitalAtraso: string;
  valorSaldoEncargosNormalidade: string;
  valorSaldoEncargosAtraso: string;
  dataInicioInadimplenciaCapital: string;
  indicePerdaEsperada: string;
}

/** 10 — Alteração de operação (manual §13.1). */
export interface DetalheAlteracao {
  tipoRegistro: '10';
  linhaCsv: number;
  idAcordo: string;
  /** Vazio ⇒ repete o `idAcordo` atual, conforme o manual. */
  novoIdAcordo: string;
  dataAlteracaoOperacao: string;
  novoIbgeCliente: string;
  novoValorRenda: string;
  dataVencimentoOperacao: string;
}

/** 11 — Cancelamento de operação pelo Agente (manual §13.1). */
export interface DetalheCancelamento {
  tipoRegistro: '11';
  linhaCsv: number;
  idAcordo: string;
  dataCancelamentoOperacao: string;
}

/** 12 — Liquidação de operação (manual §13.1). */
export interface DetalheLiquidacao {
  tipoRegistro: '12';
  linhaCsv: number;
  idAcordo: string;
  dataLiquidacaoOperacao: string;
}

export type RegistroDetalhe =
  | DetalheFormalizacao
  | DetalheLiberacao
  | DetalheSaldo
  | DetalheAlteracao
  | DetalheCancelamento
  | DetalheLiquidacao;
