const REQUEST_TIMEOUT_MS = 30_000

export class EndpointError extends Error {
  constructor(message, status, retryable) {
    super(message)
    this.name = 'EndpointError'
    this.status = status
    this.retryable = retryable
  }
}

function apiBaseUrl() {
  const url = process.env.DESENROLA_API_URL?.trim()
  if (!url) {
    throw new Error('DESENROLA_API_URL não configurada')
  }
  return url.replace(/\/$/, '')
}

function endpointPath() {
  const path = process.env.ENDPOINT_PATH?.trim()
  if (!path) {
    throw new Error('ENDPOINT_PATH não configurado')
  }
  return path.startsWith('/') ? path : `/${path}`
}

export async function chamarExportarCsv() {
  const url = `${apiBaseUrl()}${endpointPath()}`

  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new EndpointError(`Falha na requisição: ${msg}`, 0, true)
  }

  const text = await res.text()
  let payload
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) {
    const detail =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String(payload.message)
        : text || res.statusText

    const retryable = res.status >= 500 || res.status === 429
    throw new EndpointError(
      `Endpoint retornou ${res.status}: ${detail}`,
      res.status,
      retryable,
    )
  }

  return payload
}
