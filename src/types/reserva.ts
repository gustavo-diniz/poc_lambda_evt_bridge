export type ExecutarSaldoBody = {
  cpf: string
  protocolo: string
  vlrDividaAtualizada: number
  vlrAcordoDigio: number
  arquivoOrigem: string
}

export type ExecutarReservaBody = {
  cpf: string
  protocolo: string
  arquivoOrigem: string
}

export type ConsultaSaldoResponse = {
  protocoloSolicitacao: number
  tipoProtocolo: number
  dataHoraSolicitacao: string
  statusProtocolo: number
  dataHoraConsulta: string
  vrMaximoDebito: number
  motivoStatus?: string
}

export type InclusaoDividaResponse = {
  protocoloSolicitacao: number
  [key: string]: unknown
}

export type ConsultaReservaResponse = {
  statusProtocolo: number
  motivoStatus?: string
  vrFgts?: number
}