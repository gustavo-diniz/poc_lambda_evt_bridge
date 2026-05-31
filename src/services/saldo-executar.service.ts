import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { sqsClient } from '../utils/sqs.js'
import { obterAccessToken } from '../hrsso.js'
import type { ConsultaSaldoResponse, InclusaoDividaResponse } from '../types/reserva.js'
import { ServiceError } from './errors.js'
import {
  EVENTO_CONSULTA_PROTOCOLO_SALDO,
  EVENTO_CONSULTA_PROTOCOLO_SALDO_AGUARDANDO,
  EVENTO_ERRO_GERAR_PROTOCOLO_SALDO,
  EVENTO_GERAR_PROTOCOLO_RESERVA,
  EVENTO_GERAR_PROTOCOLO_RESERVA_AGUARDANDO,
  ORIGEM_RETORNO_SALDO,
  ORIGEM_RETORNO_SALDO_ERRO,
  ORIGEM_SOLICITACOES_DIVIDA,
} from '../constants/eventos.js'
import {
  fetchCaixa,
  CaixaApiKeyExauridoError,
  CaixaRateLimitError,
  motivoApiKeyExaurido,
} from '../utils/caixa-fetch.js'
import type { OnPrimeiroErroRetentavel } from '../utils/caixa-fetch.js'
import { ofuscarCpf } from '../utils/cpf.js'
import * as DocumentRepository from '../repositories/desenrola-document.repository.js'
import * as EventHistoryRepository from '../repositories/event-history.repository.js'

const VALOR_MAXIMO_RESERVA = 15000

export type ExecutarSaldoInput = {
  cpf: string
  protocolo: string
  vlrDividaAtualizada: number
  vlrAcordoDigio: number
  arquivoOrigem: string
}

export type ExecutarSaldoResult = {
  cpf: string
  protocolo: string
  protocoloReserva: number
  valorReserva: number
}

export function calcularValorReserva(saldoFgts: number, vlrAcordo: number): number {
  return Math.min(vlrAcordo, saldoFgts, VALOR_MAXIMO_RESERVA)
}

export async function executarSaldo(input: ExecutarSaldoInput): Promise<ExecutarSaldoResult> {
  const { cpf, protocolo, vlrDividaAtualizada, vlrAcordoDigio, arquivoOrigem } = input
  const valorDivida = Number(vlrDividaAtualizada)
  const valorAcordo = Number(vlrAcordoDigio)

  const documento = await DocumentRepository.buscarPorCpfComSaldo(cpf, arquivoOrigem)
  if (!documento) throw new ServiceError(`Documento não encontrado para CPF ${cpf}`, false, 404)
  const { id: documentId, vrMaximoDebito: saldoCached } = documento

  if (documento.protocoloReserva !== null) {
    const sqsUrl = process.env.SQS_CONSULTAR_PROTOCOLO_RESERVA
    if (!sqsUrl) throw new ServiceError('SQS_CONSULTAR_PROTOCOLO_RESERVA não configurada', true, 503)
    const valorReservaCached = documento.vlrReserva ?? 0
    const sqsPayload = { cpf, protocolo, protocoloReserva: documento.protocoloReserva, valorDivida, valorAcordo, valorReserva: valorReservaCached, arquivo_origem: arquivoOrigem }
    console.log(`[saldo-executar] protocolo_reserva já registrado (${documento.protocoloReserva}), reenviando → fila ${sqsUrl}:`, JSON.stringify({ ...sqsPayload, cpf: ofuscarCpf(cpf) }, null, 2))
    await sqsClient.send(new SendMessageCommand({ QueueUrl: sqsUrl, MessageBody: JSON.stringify(sqsPayload) }))
    return { cpf, protocolo, protocoloReserva: documento.protocoloReserva, valorReserva: valorReservaCached }
  }

  const accessToken = await obterAccessToken()

  let saldoFgts: number

  if (saldoCached === null) {
    saldoFgts = await consultarProtocoloSaldo({ cpf, protocolo, arquivoOrigem, documentId, accessToken })
  } else {
    console.log(`[${ofuscarCpf(cpf)}] vr_maximo_debito já disponível no DB (${saldoCached}), pulando consulta Caixa`)
    saldoFgts = saldoCached
  }

  const valorReserva = calcularValorReserva(saldoFgts, valorAcordo)

  const protocoloReserva = await solicitarInclusaoDivida({ cpf, protocolo, arquivoOrigem, documentId, accessToken, valorDivida, valorAcordo, valorReserva })

  const sqsUrl = process.env.SQS_CONSULTAR_PROTOCOLO_RESERVA
  if (!sqsUrl) throw new ServiceError('SQS_CONSULTAR_PROTOCOLO_RESERVA não configurada', true, 503)

  const sqsPayload = { cpf, protocolo, protocoloReserva, valorDivida, valorAcordo, valorReserva, arquivo_origem: arquivoOrigem }
  console.log(`[saldo-executar] → fila ${sqsUrl}:`, JSON.stringify({ ...sqsPayload, cpf: ofuscarCpf(cpf) }, null, 2))
  await sqsClient.send(new SendMessageCommand({ QueueUrl: sqsUrl, MessageBody: JSON.stringify(sqsPayload) }))

  return { cpf, protocolo, protocoloReserva, valorReserva }
}

async function consultarProtocoloSaldo(params: {
  cpf: string
  protocolo: string
  arquivoOrigem: string
  documentId: number
  accessToken: string
}): Promise<number> {
  const { cpf, protocolo, arquivoOrigem, documentId, accessToken } = params
  const urlConsulta = `${process.env.HOST_API_CAIXA ?? ''}${process.env.API_CAIXA_CONSULTAR_PROTOCOLO ?? ''}${cpf}/${protocolo}`

  const onPrimeiroErro: OnPrimeiroErroRetentavel = async (_tipo, body) => {
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_CONSULTA_PROTOCOLO_SALDO_AGUARDANDO,
      protocolo, origemProtocolo: ORIGEM_RETORNO_SALDO_ERRO,
      statusAcordo: 'AGUARDANDO', motivoStatus: 'Aguardando reprocessamento em 3 segundos', txResponse: body,
    })
  }

  let body: string
  let status: number
  let ok: boolean
  let statusText: string

  try {
    const r = await fetchCaixa(urlConsulta, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }, `saldo-executar:consulta[${cpf}]`, onPrimeiroErro)
    body = r.body; status = r.status; ok = r.ok; statusText = r.statusText
  } catch (err) {
    if (err instanceof CaixaApiKeyExauridoError) throw new ServiceError(motivoApiKeyExaurido(), true, 429)
    if (err instanceof CaixaRateLimitError) throw new ServiceError('Rate limit atingido na API Caixa — mensagem voltará para reprocessamento', true, 429)
    throw err
  }

  if (!ok) {
    const payload = parseCaixaJson(body)
    const descricao = typeof payload?.descricao === 'string' ? payload.descricao : statusText
    const { retryable, httpStatus } = mapCaixaError(status)
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_CONSULTA_PROTOCOLO_SALDO_AGUARDANDO,
      protocolo, origemProtocolo: ORIGEM_RETORNO_SALDO_ERRO,
      statusAcordo: 'AGUARDANDO', txResponse: body || null,
    })
    throw new ServiceError(descricao || `Erro ao consultar protocolo Caixa: ${status}`, retryable, httpStatus)
  }

  const dadosSaldo = JSON.parse(body) as ConsultaSaldoResponse

  if (dadosSaldo.statusProtocolo === 1 || dadosSaldo.statusProtocolo === 2) {
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_CONSULTA_PROTOCOLO_SALDO_AGUARDANDO,
      protocolo, origemProtocolo: ORIGEM_RETORNO_SALDO_ERRO,
      statusAcordo: 'AGUARDANDO', txResponse: body,
    })
    throw new ServiceError(`Protocolo de saldo em processamento (statusProtocolo=${dadosSaldo.statusProtocolo})`, true, 503)
  }

  if (dadosSaldo.statusProtocolo === 4) {
    const motivo = dadosSaldo.motivoStatus ?? 'Saldo FGTS insuficiente'
    console.error(`[${ofuscarCpf(cpf)}] Saldo FGTS rejeitado pela Caixa: ${motivo}`)
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_ERRO_GERAR_PROTOCOLO_SALDO,
      protocolo, origemProtocolo: ORIGEM_RETORNO_SALDO,
      statusAcordo: 'REJEITADO', motivoStatus: motivo, txResponse: body,
    })
    await DocumentRepository.atualizarStatus(documentId, 'REJEITADO', motivo)
    throw new ServiceError(motivo, false, 400)
  }

  const saldoFgts = dadosSaldo.vrMaximoDebito
  if (saldoFgts == null) throw new ServiceError('Resposta da Caixa sem vrMaximoDebito', true, 502)

  await DocumentRepository.atualizarSaldoFgts(documentId, saldoFgts)
  await EventHistoryRepository.inserirEvento({
    documentId, cpf, arquivoOrigem,
    evento: EVENTO_CONSULTA_PROTOCOLO_SALDO,
    protocolo, origemProtocolo: ORIGEM_RETORNO_SALDO,
    statusAcordo: 'SUCESSO', txResponse: body,
  })

  return saldoFgts
}

async function solicitarInclusaoDivida(params: {
  cpf: string
  protocolo: string
  arquivoOrigem: string
  documentId: number
  accessToken: string
  valorDivida: number
  valorAcordo: number
  valorReserva: number
}): Promise<number> {
  const { cpf, protocolo, arquivoOrigem, documentId, accessToken, valorDivida, valorAcordo, valorReserva } = params
  const urlInclusao = `${process.env.HOST_API_CAIXA ?? ''}${process.env.API_CAIXA_SOLICITAR_PROTOCOLO_DIVIDA ?? ''}${cpf}`

  const onPrimeiroErro: OnPrimeiroErroRetentavel = async (_tipo, body) => {
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_GERAR_PROTOCOLO_RESERVA_AGUARDANDO,
      protocolo, origemProtocolo: ORIGEM_SOLICITACOES_DIVIDA,
      statusAcordo: 'AGUARDANDO', motivoStatus: 'Aguardando reprocessamento em 3 segundos', txResponse: body,
    })
  }

  let body: string
  let status: number
  let ok: boolean
  let statusText: string

  try {
    const r = await fetchCaixa(urlInclusao, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ vrOriginal: valorDivida, vrRenegociado: valorAcordo, vrFgts: valorReserva }),
    }, `saldo-executar:inclusao[${cpf}]`, onPrimeiroErro)
    body = r.body; status = r.status; ok = r.ok; statusText = r.statusText
  } catch (err) {
    if (err instanceof CaixaApiKeyExauridoError) throw new ServiceError(motivoApiKeyExaurido(), true, 429)
    if (err instanceof CaixaRateLimitError) throw new ServiceError('Rate limit atingido na API Caixa — mensagem voltará para reprocessamento', true, 429)
    throw err
  }

  if (!ok) {
    const payload = parseCaixaJson(body)
    const descricao = typeof payload?.descricao === 'string' ? payload.descricao : statusText
    const { retryable, httpStatus } = mapCaixaError(status)
    throw new ServiceError(descricao || `Erro ao gerar protocolo de reserva: ${status}`, retryable, httpStatus)
  }

  const dadosReserva = JSON.parse(body) as InclusaoDividaResponse & { protocolo?: number }
  const protocoloReserva = dadosReserva.protocoloSolicitacao ?? (dadosReserva.protocolo as number)
  if (protocoloReserva == null) throw new ServiceError('Resposta da Caixa sem protocoloSolicitacao', true, 502)

  await DocumentRepository.atualizarReserva(documentId, protocoloReserva, valorReserva)
  await EventHistoryRepository.inserirEvento({
    documentId, cpf, arquivoOrigem,
    evento: EVENTO_GERAR_PROTOCOLO_RESERVA,
    protocolo: protocoloReserva, origemProtocolo: ORIGEM_SOLICITACOES_DIVIDA,
    statusAcordo: 'SUCESSO', txResponse: body,
  })

  return protocoloReserva
}

function mapCaixaError(status: number): { retryable: boolean; httpStatus: number } {
  if (status === 500) return { retryable: true, httpStatus: 503 }
  if (status === 503) return { retryable: true, httpStatus: 503 }
  if (status === 403) return { retryable: false, httpStatus: 403 }
  if (status === 404) return { retryable: false, httpStatus: 404 }
  return { retryable: false, httpStatus: 400 }
}

function parseCaixaJson(text: string): { descricao?: string } | null {
  if (text) {
    try {
      return JSON.parse(text) as { descricao?: string }
    } catch {
      return null
    }
  }
  return null
}
