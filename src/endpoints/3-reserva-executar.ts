import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { executarReserva } from '../services/reserva-executar.service.js'
import { ServiceError } from '../services/errors.js'

const executarReservaRoute = new Hono()

executarReservaRoute.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Body JSON inválido' })
  }

  const { cpf, protocolo, arquivoOrigem } = body
  if (!cpf || !protocolo || !arquivoOrigem) {
    throw new HTTPException(400, { message: 'Campos obrigatórios: cpf, protocolo, arquivoOrigem' })
  }

  try {
    const result = await executarReserva({
      cpf: cpf as string,
      protocolo: protocolo as string,
      arquivoOrigem: arquivoOrigem as string,
    })
    return c.json({ message: 'Protocolo de reserva executado', ...result })
  } catch (err) {
    if (err instanceof ServiceError) {
      throw new HTTPException(err.httpStatus as 400 | 403 | 404 | 500 | 502 | 503, { message: err.message })
    }
    throw err
  }
})

export default executarReservaRoute
