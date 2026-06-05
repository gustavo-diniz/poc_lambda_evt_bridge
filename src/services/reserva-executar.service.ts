import { obterAccessToken } from '../hrsso.js'
import type { ConsultaReservaResponse } from '../types/reserva.js'
import { ServiceError } from './errors.js'
import {
  EVENTO_CONSULTA_PROTOCOLO_RESERVA,
  EVENTO_CONSULTA_PROTOCOLO_RESERVA_AGUARDANDO,
  ORIGEM_RETORNO_RESERVA,
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

const STATUS_PROCESSADO = 3
const STATUS_REJEITADO  = 4

export type ExecutarReservaInput = {
  cpf: string
  protocolo: string
  arquivoOrigem: string
}

export type ExecutarReservaResult = {
  protocolo: string
  status: 'CONCLUIDO' | 'REJEITADO'
}

export async function executarReserva(input: ExecutarReservaInput): Promise<ExecutarReservaResult> {
  const { cpf, protocolo, arquivoOrigem } = input

  const documentId = await DocumentRepository.buscarIdPorCpf(cpf)
  if (!documentId) throw new ServiceError(`Documento não encontrado para CPF ${cpf}`, false, 404)

  const { body, ok, status, statusText } = await chamarApiReserva({ cpf, protocolo, arquivoOrigem, documentId })

  let jsonConsulta: Record<string, unknown> | null = null
  try { jsonConsulta = JSON.parse(body) } catch {}

  if (!ok) {
    return tratarErroHttp({ cpf, protocolo, arquivoOrigem, documentId, status, statusText, body, jsonConsulta })
  }

  return processarStatusReserva({ cpf, protocolo, arquivoOrigem, documentId, body, dados: jsonConsulta as unknown as ConsultaReservaResponse })
}

async function chamarApiReserva(params: {
  cpf: string
  protocolo: string
  arquivoOrigem: string
  documentId: number
}): Promise<{ body: string; ok: boolean; status: number; statusText: string }> {
  const { cpf, protocolo, arquivoOrigem, documentId } = params
  const urlConsulta = `${process.env.HOST_API_CAIXA ?? ''}${process.env.API_CAIXA_CONSULTAR_PROTOCOLO ?? ''}${cpf}/${protocolo}`
  const accessToken = await obterAccessToken()

  const onPrimeiroErro: OnPrimeiroErroRetentavel = async (_tipo, body) => {
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_CONSULTA_PROTOCOLO_RESERVA_AGUARDANDO,
      protocolo, origemProtocolo: ORIGEM_RETORNO_RESERVA,
      statusAcordo: 'AGUARDANDO', motivoStatus: 'Aguardando reprocessamento em 3 segundos', txResponse: body,
    })
  }

  try {
    const r = await fetchCaixa(urlConsulta, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }, `reserva-executar:consulta[${cpf}]`, onPrimeiroErro)
    return { body: r.body, ok: r.ok, status: r.status, statusText: r.statusText }
  } catch (err) {
    if (err instanceof CaixaApiKeyExauridoError) throw new ServiceError(motivoApiKeyExaurido(), true, 429)
    if (err instanceof CaixaRateLimitError) throw new ServiceError('Rate limit atingido na API Caixa — mensagem voltará para reprocessamento', true, 429)
    throw err
  }
}

function tratarErroHttp(params: {
  cpf: string
  protocolo: string
  arquivoOrigem: string
  documentId: number
  status: number
  statusText: string
  body: string
  jsonConsulta: Record<string, unknown> | null
}): never {
  const { cpf, protocolo, arquivoOrigem, documentId, status, statusText, body, jsonConsulta } = params
  const descricao = typeof jsonConsulta?.descricao === 'string' ? jsonConsulta.descricao : undefined
  const { retryable, httpStatus } = mapCaixaError(status)

  EventHistoryRepository.inserirEvento({
    documentId, cpf, arquivoOrigem,
    evento: EVENTO_CONSULTA_PROTOCOLO_RESERVA_AGUARDANDO,
    protocolo, origemProtocolo: ORIGEM_RETORNO_RESERVA,
    statusAcordo: 'AGUARDANDO', motivoStatus: descricao ?? `Erro HTTP ${status}`, txResponse: body || null,
  }).catch((dbErr) => console.error(`[${ofuscarCpf(cpf)}] Falha ao salvar evento de erro HTTP:`, dbErr))

  throw new ServiceError(descricao || `Erro ao consultar protocolo Caixa: ${statusText}`, retryable, httpStatus)
}

async function processarStatusReserva(params: {
  cpf: string
  protocolo: string
  arquivoOrigem: string
  documentId: number
  body: string
  dados: ConsultaReservaResponse
}): Promise<ExecutarReservaResult> {
  const { cpf, protocolo, arquivoOrigem, documentId, body, dados } = params
  const statusProtocolo = dados.statusProtocolo

  if (![STATUS_PROCESSADO, STATUS_REJEITADO].includes(statusProtocolo)) {
    console.log(`[${ofuscarCpf(cpf)}] statusProtocolo ${statusProtocolo} — ainda em processamento, retentar`)
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_CONSULTA_PROTOCOLO_RESERVA_AGUARDANDO,
      protocolo, origemProtocolo: ORIGEM_RETORNO_RESERVA,
      statusAcordo: 'AGUARDANDO', txResponse: body,
    })
    throw new ServiceError(`Protocolo ainda em processamento (status ${statusProtocolo})`, true, 503)
  }

  if (statusProtocolo === STATUS_REJEITADO) {
    const motivo = dados.motivoStatus ?? 'Inclusão da dívida rejeitada pela Caixa'
    console.error(`[${ofuscarCpf(cpf)}] Inclusão da dívida rejeitada pela Caixa: ${motivo}`)
    await EventHistoryRepository.inserirEvento({
      documentId, cpf, arquivoOrigem,
      evento: EVENTO_CONSULTA_PROTOCOLO_RESERVA,
      protocolo, origemProtocolo: ORIGEM_RETORNO_RESERVA,
      statusAcordo: 'REJEITADO', motivoStatus: motivo, txResponse: body,
    })
    await DocumentRepository.atualizarStatus(documentId, 'REJEITADO', motivo)
    return { protocolo, status: 'REJEITADO' }
  }

  console.log(`[${ofuscarCpf(cpf)}] Inclusão de dívida confirmada`)
  await DocumentRepository.concluir(documentId, dados.vrFgts)
  await EventHistoryRepository.inserirEvento({
    documentId, cpf, arquivoOrigem,
    evento: EVENTO_CONSULTA_PROTOCOLO_RESERVA,
    protocolo, origemProtocolo: ORIGEM_RETORNO_RESERVA,
    statusAcordo: 'SUCESSO', txResponse: body,
  })

  return { protocolo, status: 'CONCLUIDO' }
}

function mapCaixaError(status: number): { retryable: boolean; httpStatus: number } {
  if (status === 500) return { retryable: true, httpStatus: 503 }
  if (status === 503) return { retryable: true, httpStatus: 503 }
  if (status === 404) return { retryable: false, httpStatus: 404 }
  return { retryable: false, httpStatus: 400 }
}
