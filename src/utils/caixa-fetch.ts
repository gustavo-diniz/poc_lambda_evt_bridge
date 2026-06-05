import { ofuscarCpfNaUrl } from './cpf.js'

const MAX_TENTATIVAS = 20
const DELAY_RETRY_MS = 3_000

export class CaixaApiKeyExauridoError extends Error {
  constructor(readonly host: string, readonly body: string = '') {
    super(`API Key não encontrada após ${MAX_TENTATIVAS} tentativas: ${host}`)
    this.name = 'CaixaApiKeyExauridoError'
  }
}

export class CaixaRateLimitError extends Error {
  constructor(readonly body: string) {
    super(`Rate limit atingido na API Caixa: ${body}`)
    this.name = 'CaixaRateLimitError'
  }
}

export type CaixaFetchResult = {
  status: number
  ok: boolean
  statusText: string
  body: string
}

export type OnPrimeiroErroRetentavel = (tipo: 'api-key' | 'rate-limit', body: string) => Promise<void>

export function motivoApiKeyExaurido(): string {
  return `API Key não encontrada após ${MAX_TENTATIVAS} tentativas consecutivas — requisição rejeitada (${process.env.HOST_API_CAIXA ?? ''})`
}

export async function fetchCaixa(
  url: string,
  options: RequestInit,
  contexto: string,
  onPrimeiroErro?: OnPrimeiroErroRetentavel,
): Promise<CaixaFetchResult> {
  const host = process.env.HOST_API_CAIXA ?? url
  let erroLogado = false

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    logRequest(contexto, url, tentativa, options)

    const res = await fetch(url, options)
    const body = await res.text()

    logResponse(contexto, res.status, res.statusText, body)

    const tipoErro = detectarErroRetentavel(res.status, body)
    if (tipoErro) {
      erroLogado = await notificarPrimeiroErro(tipoErro, body, erroLogado, onPrimeiroErro, contexto)
      if (tentativa < MAX_TENTATIVAS) {
        await aguardarRetry(contexto, tipoErro, tentativa)
        continue
      }
      throw tipoErro === 'rate-limit'
        ? new CaixaRateLimitError(body)
        : new CaixaApiKeyExauridoError(host, body)
    }

    return { status: res.status, ok: res.ok, statusText: res.statusText, body }
  }

  throw new CaixaApiKeyExauridoError(host)
}

function logRequest(contexto: string, url: string, tentativa: number, options: RequestInit): void {
  const urlOfuscada = ofuscarCpfNaUrl(url)
  const sufixo = tentativa > 1 ? ` (tentativa ${tentativa}/${MAX_TENTATIVAS})` : ''
  console.log(`[${ofuscarCpfNaUrl(contexto)}] → ${options.method ?? 'GET'} ${urlOfuscada}${sufixo}`)
  if (options.body && typeof options.body === 'string') {
    console.log(`[${ofuscarCpfNaUrl(contexto)}] request body: ${ofuscarCpfNaUrl(options.body)}`)
  }
}

function logResponse(contexto: string, status: number, statusText: string, body: string): void {
  const nivel = status >= 400 ? 'warn' : 'log'
  console[nivel](`[${ofuscarCpfNaUrl(contexto)}] ← ${status} ${statusText} | body: ${ofuscarCpfNaUrl(body)}`)
}

function detectarErroRetentavel(status: number, body: string): 'rate-limit' | 'api-key' | null {
  if (isRateLimitError(status, body)) return 'rate-limit'
  if (isApiKeyError(status, body)) return 'api-key'
  return null
}

async function notificarPrimeiroErro(
  tipo: 'rate-limit' | 'api-key',
  body: string,
  erroLogado: boolean,
  onPrimeiroErro: OnPrimeiroErroRetentavel | undefined,
  contexto: string,
): Promise<boolean> {
  if (!erroLogado && onPrimeiroErro) {
    await onPrimeiroErro(tipo, body).catch(e =>
      console.error(`[${ofuscarCpfNaUrl(contexto)}] Falha ao registrar evento ${tipo}:`, e),
    )
    return true
  }
  return erroLogado
}

async function aguardarRetry(contexto: string, tipo: string, tentativa: number): Promise<void> {
  console.log(`[${ofuscarCpfNaUrl(contexto)}] tentativa ${tentativa}/${MAX_TENTATIVAS}: ${tipo} — aguardando ${DELAY_RETRY_MS / 1000}s...`)
  await sleep(DELAY_RETRY_MS)
}

function isApiKeyError(status: number, body: string): boolean {
  if (status === 400 || status === 200) {
    try {
      const p = JSON.parse(body) as { mensagem?: string }
      if (p?.mensagem === 'API Key não encontrada') return true
    } catch {}
  }
  return false
}

function isRateLimitError(status: number, body: string): boolean {
  if (status === 429) return true
  try {
    const p = JSON.parse(body) as { erro?: string }
    return p?.erro === '429'
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
