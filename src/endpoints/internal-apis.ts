import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../db.js'
import { uploadCsvToInputBucket, uploadCsvToFgoInputBucket } from '../utils/s3.js'

const internalApis = new Hono()

internalApis.get('/eventos', async (c) => {
  const cpf = c.req.query('cpf')
  const arquivoOrigem = c.req.query('arquivoOrigem')

  if (!cpf) {
    throw new HTTPException(400, { message: 'Parâmetro obrigatório: cpf' })
  }

  let query = 'SELECT id, cpf, evento, nr_tentativa, protocolo, origem_protocolo, status_acordo, motivo_status, tx_response, arquivo_origem FROM desenrola_event_history WHERE cpf = ? ORDER BY id'
  const params: string[] = [cpf]

  if (arquivoOrigem) {
    query = 'SELECT id, cpf, evento, nr_tentativa, protocolo, origem_protocolo, status_acordo, motivo_status, tx_response, arquivo_origem FROM desenrola_event_history WHERE cpf = ? AND arquivo_origem = ? ORDER BY id'
    params.push(arquivoOrigem)
  }

  const [rows] = await pool.execute<RowDataPacket[]>(query, params)
  return c.json(rows)
})

internalApis.post('/upload-csv', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string') {
    throw new HTTPException(400, { message: 'Campo obrigatório: file (multipart/form-data)' })
  }

  const fileName = file.name
  const csvContent = await file.text()

  await uploadCsvToInputBucket(fileName, csvContent)
  return c.json({ message: 'Arquivo enviado com sucesso', bucket: process.env.S3_INPUT_BUCKET, key: fileName })
})

internalApis.post('/upload-csv-fgo', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string') {
    throw new HTTPException(400, { message: 'Campo obrigatório: file (multipart/form-data)' })
  }

  const fileName = file.name
  const csvContent = await file.text()

  await uploadCsvToFgoInputBucket(fileName, csvContent)
  return c.json({ message: 'Arquivo FGO enviado com sucesso', bucket: process.env.S3_FGO_BUCKET, key: `pendente/${fileName}` })
})

export default internalApis
