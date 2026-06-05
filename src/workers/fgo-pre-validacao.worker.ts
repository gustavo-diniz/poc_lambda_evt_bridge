import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { processarRegistroFgo } from '../services/fgo-pre-validacao.service.js'
import { ServiceError } from '../services/errors.js'
import { sqsClient as sqs } from '../utils/sqs.js'
import { s3Client } from '../utils/s3.js'
import { ofuscarCpf, ofuscarCpfNaUrl } from '../utils/cpf.js'

const WORKER = 'worker:fgo-pre-validacao'

export async function iniciarWorkerFgoPreValidacao(): Promise<void> {
  const queueUrl = process.env.SQS_FGO_INPUT_URL
  if (!queueUrl) {
    console.warn(`[${WORKER}] SQS_FGO_INPUT_URL não configurada — worker desativado`)
    return
  }

  console.log(`[${WORKER}] iniciado`)

  while (true) {
    try {
      const res = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 5,
      }))

      for (const msg of res.Messages ?? []) {
        console.log(`[${WORKER}] mensagem recebida | fila: ${queueUrl} | body: ${ofuscarCpfNaUrl(msg.Body!)}`)
        await processarMensagem(queueUrl, msg.ReceiptHandle!, msg.Body!)
        await sleep(2000)
      }
    } catch (err) {
      console.error(`[${WORKER}] erro no polling:`, err)
      await sleep(5000)
    }
  }
}

async function processarMensagem(queueUrl: string, receiptHandle: string, rawBody: string): Promise<void> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    console.error(`[${WORKER}] mensagem com JSON inválido, descartando`)
    await deletarMensagem(queueUrl, receiptHandle)
    return
  }

  // Evento S3 direto (LocalStack: S3 → SQS sem Lambda intermediário)
  // Detectado pela presença de Records[].s3
  const s3Records = extrairS3Records(parsed)
  if (s3Records.length > 0) {
    console.log(`[${WORKER}] evento S3 detectado — lendo CSV do bucket`)
    for (const record of s3Records) {
      await processarEventoS3(record)
    }
    await deletarMensagem(queueUrl, receiptHandle)
    return
  }

  // Registro já parseado (produção: Lambda → SQS)
  await processarRegistro(queueUrl, receiptHandle, parsed)
}

// Fluxo LocalStack: lê o CSV do S3, parseia e processa cada linha
async function processarEventoS3(record: S3Record): Promise<void> {
  const bucket = record.s3.bucket.name
  const key    = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '))
  const arquivoOrigem = key

  console.log(`[${WORKER}] lendo s3://${bucket}/${key}`)

  let conteudo: string
  try {
    const resp = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    conteudo = await streamParaString(resp.Body)
  } catch (err) {
    console.error(`[${WORKER}] erro ao ler CSV do S3: ${err instanceof Error ? err.message : err}`)
    return
  }

  const registros = parsearCsvFgo(conteudo, arquivoOrigem)
  console.log(`[${WORKER}] ${registros.length} registros lidos de ${key}`)

  for (const reg of registros) {
    try {
      const result = await processarRegistroFgo(reg)
      console.log(`[${WORKER}] ✓ cpf=${ofuscarCpf(result.cpf)} id=${result.documentId} status=${result.status}`)
    } catch (err) {
      console.error(`[${WORKER}] erro ao processar linha cpf=${ofuscarCpf(reg.cpf)}:`, err instanceof Error ? err.message : err)
    }
  }
}

// Fluxo produção: registro já parseado publicado pelo Lambda
async function processarRegistro(queueUrl: string, receiptHandle: string, input: Record<string, unknown>): Promise<void> {
  try {
    const result = await processarRegistroFgo({
      tipoProduto:               String(input.tipoProduto ?? ''),
      idAcordo:                  Number(input.idAcordo ?? 0),
      ibgeCliente:               String(input.ibgeCliente ?? ''),
      cpf:                       String(input.cpf ?? ''),
      dataAcordo:                String(input.dataAcordo ?? ''),
      dataVencimentoOperacao:    String(input.dataVencimentoOperacao ?? ''),
      valorOperacaoCredito:      Number(input.valorOperacaoCredito ?? 0),
      valorSubsidioCredito:      Number(input.valorSubsidioCredito ?? 0),
      valorCondicaoEspecial:     Number(input.valorCondicaoEspecial ?? 0),
      cpfQualificador:           String(input.cpfQualificador ?? ''),
      numeroReservaPreValidacao: input.numeroReservaPreValidacao != null ? String(input.numeroReservaPreValidacao) : null,
      valor:                     Number(input.valor ?? 0),
      motivo:                    input.motivo != null ? String(input.motivo) : null,
      motivoErro:                input.motivoErro != null ? String(input.motivoErro) : null,
      arquivoOrigem:             String(input.arquivoOrigem ?? ''),
    })
    await deletarMensagem(queueUrl, receiptHandle)
    console.log(`[${WORKER}] ✓ cpf=${ofuscarCpf(result.cpf)} id=${result.documentId} status=${result.status}`)
  } catch (err) {
    if (err instanceof ServiceError && !err.retryable) {
      console.error(`[${WORKER}] erro terminal, descartando mensagem:`, err.message)
      await deletarMensagem(queueUrl, receiptHandle)
    } else {
      console.error(`[${WORKER}] erro retentável, mensagem volta à fila:`, err instanceof Error ? err.message : err)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type S3Record = {
  s3: { bucket: { name: string }; object: { key: string } }
}

function extrairS3Records(parsed: Record<string, unknown>): S3Record[] {
  const records = parsed['Records']
  if (!Array.isArray(records)) return []
  return records.filter(
    (r): r is S3Record =>
      typeof r === 'object' && r !== null && 's3' in r,
  )
}

function parsearCsvFgo(conteudo: string, arquivoOrigem: string) {
  const SEPARADOR = ';'
  const linhas = conteudo.split('\n').map(l => l.trim()).filter(Boolean)
  if (linhas.length < 2) return []

  const cabecalho = linhas[0].split(SEPARADOR).map(h => h.trim())

  return linhas.slice(1).map(linha => {
    const cols = linha.split(SEPARADOR)
    const col  = (nome: string) => cols[cabecalho.indexOf(nome)]?.trim() ?? ''
    const dec  = (nome: string) => parseFloat(col(nome).replace(',', '.')) || 0

    return {
      tipoProduto:               col('tipoProduto'),
      idAcordo:                  Number(col('idAcordo')) || 0,
      ibgeCliente:               col('ibgeCliente'),
      cpf:                       col('cpf').replace(/\D/g, ''),
      dataAcordo:                col('dataAcordo'),
      dataVencimentoOperacao:    col('dataVencimentoOperacao'),
      valorOperacaoCredito:      dec('valorOperacaoCredito'),
      valorSubsidioCredito:      dec('valorSubsidioCredito'),
      valorCondicaoEspecial:     dec('valorCondicaoEspecial'),
      cpfQualificador:           col('cpfQualificador').replace(/\D/g, ''),
      numeroReservaPreValidacao: col('numeroReservaPreValidacao') || null,
      valor:                     dec('valor'),
      motivo:                    col('motivo') || null,
      motivoErro:                col('motivo_erro') || null,
      arquivoOrigem,
    }
  })
}

function streamParaString(stream: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const s = stream as NodeJS.ReadableStream
    s.on('data', (chunk: Buffer) => chunks.push(chunk))
    s.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    s.on('error', reject)
  })
}

async function deletarMensagem(queueUrl: string, receiptHandle: string): Promise<void> {
  await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
