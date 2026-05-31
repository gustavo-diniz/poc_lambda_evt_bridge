import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { executarSaldo } from '../services/saldo-executar.service.js'
import { ServiceError } from '../services/errors.js'


const executarSaldoRoute = new Hono()

executarSaldoRoute.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Body JSON inválido' })
  }

  const { cpf, protocolo, vlrDividaAtualizada, vlrAcordoDigio, arquivoOrigem } = body as Record<string, unknown>
  if (!cpf || !protocolo || vlrDividaAtualizada == null || vlrAcordoDigio == null || !arquivoOrigem) {
    throw new HTTPException(400, { message: 'Campos obrigatórios: cpf, protocolo, vlrDividaAtualizada, vlrAcordoDigio, arquivoOrigem' })
  }

  try {
    const result = await executarSaldo({
      cpf: cpf as string,
      protocolo: protocolo as string,
      vlrDividaAtualizada: Number(vlrDividaAtualizada),
      vlrAcordoDigio: Number(vlrAcordoDigio),
      arquivoOrigem: arquivoOrigem as string,
    })
    return c.json({ message: 'Reserva executada com sucesso', ...result })
  } catch (err) {
    if (err instanceof ServiceError) {
      throw new HTTPException(err.httpStatus as 400 | 403 | 404 | 500 | 502 | 503, { message: err.message })
    }
    throw err
  }
})

export default executarSaldoRoute
