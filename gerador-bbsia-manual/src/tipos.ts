'use strict';

export const TIPO_REGISTRO_HEADER = '01';
export const TIPO_REGISTRO_FORMALIZACAO = '03';
export const TIPO_REGISTRO_LIBERACAO = '04';
export const TIPO_REGISTRO_SALDO = '05';
export const TIPO_REGISTRO_SOLICITACAO_HONRA = '06';
export const TIPO_REGISTRO_RECUPERACAO = '07';
export const TIPO_REGISTRO_CANCELAMENTO_RECUPERACAO = '08';
export const TIPO_REGISTRO_DEVOLUCAO = '09';
export const TIPO_REGISTRO_ALTERACAO = '10';
export const TIPO_REGISTRO_CANCELAMENTO = '11';
export const TIPO_REGISTRO_LIQUIDACAO = '12';
export const TIPO_REGISTRO_REATIVACAO = '13';
export const TIPO_REGISTRO_TRAILER = '99';

export const TIPOS_DETALHE_SUPORTADOS = [
  TIPO_REGISTRO_FORMALIZACAO,
  TIPO_REGISTRO_LIBERACAO,
  TIPO_REGISTRO_SALDO,
  TIPO_REGISTRO_SOLICITACAO_HONRA,
  TIPO_REGISTRO_RECUPERACAO,
  TIPO_REGISTRO_CANCELAMENTO_RECUPERACAO,
  TIPO_REGISTRO_DEVOLUCAO,
  TIPO_REGISTRO_ALTERACAO,
  TIPO_REGISTRO_CANCELAMENTO,
  TIPO_REGISTRO_LIQUIDACAO,
  TIPO_REGISTRO_REATIVACAO,
] as const;

export type TipoDetalhe = (typeof TIPOS_DETALHE_SUPORTADOS)[number];

export const DESCRICAO_TIPO_DETALHE: Record<TipoDetalhe, string> = {
  '03': 'DETALHE (FORMALIZAÇÃO DE OPERAÇÃO)',
  '04': 'DETALHE (LIBERAÇÃO DE CRÉDITO)',
  '05': 'DETALHE (INFORMAÇÃO DE SALDO)',
  '06': 'DETALHE (SOLICITAÇÃO DE HONRA DA GARANTIA)',
  '07': 'DETALHE (RECUPERAÇÃO DO VALOR HONRADO)',
  '08': 'DETALHE (CANCELAMENTO DE RECUPERAÇÃO DO VALOR HONRADO)',
  '09': 'DETALHE (DEVOLUÇÃO DO VALOR HONRADO)',
  '10': 'DETALHE (ALTERAÇÃO DE OPERAÇÃO)',
  '11': 'DETALHE (CANCELAMENTO DE OPERAÇÃO PELO AGENTE)',
  '12': 'DETALHE (LIQUIDAÇÃO DE OPERAÇÃO)',
  '13': 'DETALHE (REATIVAÇÃO DE OPERAÇÃO LIQUIDADA)',
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

/** 06 — Solicitação de honra da garantia (manual §13.1). */
export interface DetalheSolicitacaoHonra {
  tipoRegistro: '06';
  linhaCsv: number;
  idAcordo: string;
  /** Mesma coluna do tipo 05; aqui é obrigatória. */
  dataInicioInadimplenciaCapital: string;
  dataSolicitacaoHonra: string;
  valorSaldoBaseHonra: string;
}

/** 07 — Recuperação do valor honrado (manual §13.1). */
export interface DetalheRecuperacao {
  tipoRegistro: '07';
  linhaCsv: number;
  idAcordo: string;
  dataRecuperacao: string;
  /** Valor efetivamente recebido do cliente. */
  valorRecuperacao: string;
}

/** 08 — Cancelamento de recuperação do valor honrado (manual §13.1). */
export interface DetalheCancelamentoRecuperacao {
  tipoRegistro: '08';
  linhaCsv: number;
  idAcordo: string;
  /** Data da recuperação a cancelar (mesma coluna do tipo 07). */
  dataRecuperacao: string;
  /** Valor recuperado a cancelar (mesma coluna do tipo 07). */
  valorRecuperacao: string;
  dataCancelamentoRecuperacao: string;
}

/** 09 — Devolução do valor honrado (manual §13.1). */
export interface DetalheDevolucao {
  tipoRegistro: '09';
  linhaCsv: number;
  idAcordo: string;
  dataDevolucaoHonra: string;
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

/** 13 — Reativação de operação liquidada (manual §13.1). */
export interface DetalheReativacao {
  tipoRegistro: '13';
  linhaCsv: number;
  idAcordo: string;
  dataReativacaoOperacao: string;
}

export type RegistroDetalhe =
  | DetalheFormalizacao
  | DetalheLiberacao
  | DetalheSaldo
  | DetalheSolicitacaoHonra
  | DetalheRecuperacao
  | DetalheCancelamentoRecuperacao
  | DetalheDevolucao
  | DetalheAlteracao
  | DetalheCancelamento
  | DetalheLiquidacao
  | DetalheReativacao;
