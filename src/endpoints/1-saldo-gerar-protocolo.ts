import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { gerarProtocoloSaldo } from '../services/saldo-gerar-protocolo.service.js'
import { ServiceError } from '../services/errors.js'

const REQUIRED_BODY_FIELDS = ['cpf', 'valorDivida', 'valorAcordo', 'arquivoOrigem'] as const

const gerarProtocoloSaldoRoute = new Hono()

gerarProtocoloSaldoRoute.post('/', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Body JSON inválido' })
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HTTPException(400, { message: 'Body inválido ou ausente' })
  }

  const record = raw as Record<string, unknown>
  const missing = REQUIRED_BODY_FIELDS.filter((f) => record[f] == null || (typeof record[f] === 'string' && (record[f] as string).trim() === ''))
  if (missing.length > 0) {
    throw new HTTPException(400, { message: `Campos obrigatórios ausentes: ${missing.join(', ')}` })
  }

  try {
    const result = await gerarProtocoloSaldo({
      cpf: record.cpf as string,
      valorDivida: record.valorDivida as number,
      valorAcordo: record.valorAcordo as number,
      arquivoOrigem: record.arquivoOrigem as string,
    })
    return c.json({ message: 'Protocolo de saldo gerado', ...result })
  } catch (err) {
    if (err instanceof ServiceError) {
      throw new HTTPException(err.httpStatus as 400 | 403 | 404 | 500 | 502 | 503, { message: err.message })
    }
    throw err
  }
})

export default gerarProtocoloSaldoRoute
