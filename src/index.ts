import 'dotenv/config'

if (process.env.NODE_ENV === 'production' && process.env.S3_ENDPOINT) {
  console.error('ERRO: S3_ENDPOINT não deve ser definido em produção')
  process.exit(1)
}

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import gerarProtocoloSaldo from './endpoints/1-saldo-gerar-protocolo.js'
import executarSaldo from './endpoints/2-saldo-executar.js'
import executarReserva from './endpoints/3-reserva-executar.js'
import exportarCsvFinal from './endpoints/4-exportar-csv-final.js'
import health from './endpoints/health.js'
import internalApis from './endpoints/internal-apis.js'
import { iniciarWorkerSaldoGerarProtocolo } from './workers/saldo-gerar-protocolo.worker.js'
import { iniciarWorkerSaldoExecutar } from './workers/saldo-executar.worker.js'
import { iniciarWorkerReservaExecutar } from './workers/reserva-executar.worker.js'

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  return c.json({ error: err.message }, 500)
})

app.route('/health', health)
app.route('/internal', internalApis)
app.route('/saldo/gerar-protocolo', gerarProtocoloSaldo)
app.route('/saldo/executar', executarSaldo)
app.route('/reserva/executar', executarReserva)
app.route('/reserva/exportacao/csv', exportarCsvFinal)

const port = Number(process.env.PORT) || 3000

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Server is running :${info.port}`)
})

iniciarWorkerSaldoGerarProtocolo().catch(err => console.error('[worker:saldo-gerar-protocolo] falha fatal:', err))
iniciarWorkerSaldoExecutar().catch(err => console.error('[worker:saldo-executar] falha fatal:', err))
iniciarWorkerReservaExecutar().catch(err => console.error('[worker:reserva-executar] falha fatal:', err))
