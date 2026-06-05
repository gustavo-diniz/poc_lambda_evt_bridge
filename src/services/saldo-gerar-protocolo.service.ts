import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { sqsClient } from '../utils/sqs.js'
import { obterAccessToken } from '../hrsso.js'
import {
  registrarSucessoGerarProtocoloSaldo,
  registrarErroGerarProtocoloSaldo,
  registrarAguardandoGerarProtocoloSaldo,
} from '../repositories/saldo-gerar-protocolo.repository.js'
import { ServiceError } from './errors.js'
import { ERRO_CPF_E_ORIGEM_JA_EXISTENTE } from '../constants/eventos.js'
import {
  fetchCaixa,
  CaixaApiKeyExauridoError,
  CaixaRateLimitError,
  motivoApiKeyExaurido,
} from '../utils/caixa-fetch.js'
import type { CaixaFetchResult, OnPrimeiroErroRetentavel } from '../utils/caixa-fetch.js'
import { ofuscarCpf } from '../utils/cpf.js'
import * as DocumentRepository from '../repositories/desenrola-document.repository.js'

const CAIXA_TIMEOUT_MS = 30_000

export type GerarProtocoloSaldoInput = {
  cpf: string
  valorDivida: number
  valorAcordo: number
  arquivoOrigem: string
}

export type GerarProtocoloSaldoResult = {
  protocolo: number
  cpf: string
  valorDivida: number
  valorAcordo: number
  arquivoOrigem: string
}

type CaixaPayload = { protocolo?: number; descricao?: string; codigo?: number; mensagem?: string } | null

export async function gerarProtocoloSaldo(
  input: GerarProtocoloSaldoInput,
): Promise<GerarProtocoloSaldoResult> {
  const { cpf, arquivoOrigem } = input

  const existente = await DocumentRepository.buscarPorCpfEArquivo(cpf, arquivoOrigem)
  if (existente) {
    if (existente.protocoloSaldo !== null) {
      const valoresIguais =
        existente.valorDivida === input.valorDivida &&
        existente.valorAcordo === input.valorAcordo
      if (valoresIguais) {
        console.log(`[${ofuscarCpf(cpf)}] ${ERRO_CPF_E_ORIGEM_JA_EXISTENTE} — protocolo ${existente.protocoloSaldo} já registrado com mesmos valores, reenviando à fila consultar-protocolo-saldo`)
        await publicarNaFila(input, existente.protocoloSaldo, null, '')
        return { protocolo: existente.protocoloSaldo, cpf, valorDivida: input.valorDivida, valorAcordo: input.valorAcordo, arquivoOrigem }
      }
      console.log(`[${ofuscarCpf(cpf)}] ${ERRO_CPF_E_ORIGEM_JA_EXISTENTE} com valores divergentes — rejeitando | arquivo_origem=${arquivoOrigem}`)
      throw new ServiceError(`${ERRO_CPF_E_ORIGEM_JA_EXISTENTE}: cpf=${cpf}, arquivo_origem=${arquivoOrigem}`, false, 400)
    }
    // protocolo ainda não registrado na base — permite continuar e chamar a Caixa normalmente
  }

  const url = montarUrlCaixa(cpf)
  const token = await obterToken()

  const onPrimeiroErro: OnPrimeiroErroRetentavel = async (_tipo, body) => {
    await registrarAguardandoGerarProtocoloSaldo({
      body: input,
      motivo: 'Aguardando reprocessamento em 3 segundos',
      txResponse: body,
    })
  }

  let caixaResult: CaixaFetchResult
  try {
    caixaResult = await chamarApiCaixa(url, token, `saldo-gerar-protocolo[${cpf}]`, onPrimeiroErro)
  } catch (err) {
    if (err instanceof CaixaApiKeyExauridoError) throw new ServiceError(motivoApiKeyExaurido(), true, 429)
    if (err instanceof CaixaRateLimitError) throw new ServiceError('Rate limit atingido na API Caixa — mensagem voltará para reprocessamento', true, 429)
    throw err
  }

  const rawResponse = caixaResult.body
  const payload = parseCaixaJson(rawResponse)

  if ((caixaResult.status === 202 || caixaResult.status === 200) && typeof payload?.protocolo === 'number') {
    return processarSucesso(input, payload.protocolo, payload, rawResponse)
  }

  const descricao = typeof payload?.descricao === 'string' ? payload.descricao : caixaResult.statusText
  const { retryable, httpStatus } = mapCaixaError(caixaResult.status)
  await registrarErroGerarProtocoloSaldo({ body: input, payload, rawResponse, motivo: descricao || 'Requisição rejeitada pela Caixa', retryable })
  throw new ServiceError(descricao || 'Requisição rejeitada pela Caixa', retryable, httpStatus)
}

function montarUrlCaixa(cpf: string): string {
  const baseUrl = process.env.HOST_API_CAIXA?.trim().replace(/\/$/, '')
  const solicitacaoPath = process.env.API_CAIXA_SOLICITAR_PROTOCOLO_SALDO?.trim()
  if (!baseUrl || !solicitacaoPath) throw new ServiceError('Configuração Caixa ausente', true, 503)
  const pathPrefix = solicitacaoPath.startsWith('/') ? solicitacaoPath : `/${solicitacaoPath}`
  return `${baseUrl}${pathPrefix.replace(/\/$/, '')}/${cpf}`
}

async function obterToken(): Promise<string> {
  try {
    return await obterAccessToken()
  } catch {
    throw new ServiceError('Falha ao obter token RHSSO', true, 503)
  }
}

async function chamarApiCaixa(
  url: string,
  token: string,
  contexto: string,
  onPrimeiroErro: OnPrimeiroErroRetentavel,
): Promise<CaixaFetchResult> {
  try {
    return await fetchCaixa(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(CAIXA_TIMEOUT_MS),
    }, contexto, onPrimeiroErro)
  } catch (err) {
    if (err instanceof CaixaApiKeyExauridoError) throw err
    if (err instanceof CaixaRateLimitError) throw err
    throw new ServiceError('Falha na comunicação com a Caixa', true, 503)
  }
}

async function processarSucesso(
  input: GerarProtocoloSaldoInput,
  protocolo: number,
  payload: CaixaPayload,
  rawResponse: string,
): Promise<GerarProtocoloSaldoResult> {
  try {
    await registrarSucessoGerarProtocoloSaldo({ body: input, protocolo, payload, rawResponse })
  } catch {
    throw new ServiceError('Falha ao persistir protocolo no banco', true, 503)
  }

  await publicarNaFila(input, protocolo, payload, rawResponse)

  console.log(`[${ofuscarCpf(input.cpf)}] Protocolo ${protocolo} publicado na fila consultar-protocolo-saldo`)
  return { protocolo, cpf: input.cpf, valorDivida: input.valorDivida, valorAcordo: input.valorAcordo, arquivoOrigem: input.arquivoOrigem }
}

async function publicarNaFila(input: GerarProtocoloSaldoInput, protocolo: number, payload: CaixaPayload, rawResponse: string): Promise<void> {
  const sqsUrl = process.env.SQS_CONSULTAR_PROTOCOLO_SALDO
  if (!sqsUrl) throw new ServiceError('SQS_CONSULTAR_PROTOCOLO_SALDO não configurada', true, 503)

  const txResponse = payload == null ? rawResponse || null : JSON.stringify(payload)
  const sqsPayload = {
    cpf: input.cpf,
    vlrAcordoDigio: input.valorAcordo,
    vlrDividaAtualizada: input.valorDivida,
    arquivo_origem: input.arquivoOrigem,
    protocolo: String(protocolo),
    dataHoraExecucao: new Date().toISOString(),
    tx_response: txResponse,
  }
  console.log(`[saldo-gerar-protocolo] → fila ${sqsUrl}:`, JSON.stringify({ ...sqsPayload, cpf: ofuscarCpf(input.cpf) }, null, 2))
  try {
    await sqsClient.send(new SendMessageCommand({ QueueUrl: sqsUrl, MessageBody: JSON.stringify(sqsPayload) }))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new ServiceError(`Falha ao publicar na fila: ${detail}`, true, 503)
  }
}

function mapCaixaError(status: number): { retryable: boolean; httpStatus: number } {
  if (status === 500) return { retryable: true, httpStatus: 503 }
  if (status === 503) return { retryable: true, httpStatus: 503 }
  if (status === 403) return { retryable: false, httpStatus: 403 }
  if (status === 404) return { retryable: false, httpStatus: 404 }
  return { retryable: false, httpStatus: 400 }
}

function parseCaixaJson(text: string): CaixaPayload {
  if (text) {
    try {
      return JSON.parse(text) as CaixaPayload
    } catch {
      return null
    }
  }
  return null
}
