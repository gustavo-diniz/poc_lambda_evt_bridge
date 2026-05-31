import { ServiceError } from '../services/errors.js'

// Códigos MySQL que indicam falha transiente — vale retentar
const CODIGOS_RETENTAVEIS = new Set([
  1040, // ER_TOO_MANY_CONNECTIONS
  1205, // ER_LOCK_WAIT_TIMEOUT
  1213, // ER_LOCK_DEADLOCK
  2003, // Can't connect to MySQL server
  2006, // MySQL server has gone away
  2013, // Lost connection to MySQL server
])

// Códigos de erro de rede Node.js — também transientes
const ERROS_REDE = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'])

function mensagemErro(err: unknown): string {
  if (err instanceof Error) return err.message
  try { return JSON.stringify(err) } catch { return 'erro desconhecido' }
}

export function classificarErroDb(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err

  const code    = (err as { code?: string | number }).code
  const errno   = (err as { errno?: number }).errno
  const numCode = typeof errno === 'number' ? errno : undefined
  const numFromCode = typeof code === 'number' ? code : undefined
  const resolvedCode = numCode ?? numFromCode

  if (resolvedCode !== undefined && CODIGOS_RETENTAVEIS.has(resolvedCode)) {
    return new ServiceError(`Falha transiente no banco (${resolvedCode}): ${mensagemErro(err)}`, true, 503)
  }

  if (typeof code === 'string' && ERROS_REDE.has(code)) {
    return new ServiceError(`Erro de conexão com o banco (${code}): ${mensagemErro(err)}`, true, 503)
  }

  return new ServiceError(`Erro de banco não retentável: ${mensagemErro(err)}`, false, 500)
}

const MAX_TENTATIVAS_DB = 5
const DELAY_RETRY_DB_MS = 3_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function executarDb<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_DB; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      const serviceErr = classificarErroDb(err)

      if (!serviceErr.retryable || tentativa === MAX_TENTATIVAS_DB) {
        throw serviceErr
      }

      console.warn(`[db] falha transiente (tentativa ${tentativa}/${MAX_TENTATIVAS_DB}): ${serviceErr.message} — aguardando ${DELAY_RETRY_DB_MS / 1000}s`)
      await sleep(DELAY_RETRY_DB_MS)
    }
  }

  throw new ServiceError('executarDb: máximo de tentativas atingido', false, 500)
}
