import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { executarSaldo } from '../services/saldo-executar.service.js'
import { ServiceError } from '../services/errors.js'
import { sqsClient as sqs } from '../utils/sqs.js'
import { ofuscarCpf, ofuscarCpfNaUrl } from '../utils/cpf.js'
const WORKER = 'worker:saldo-executar'

export async function iniciarWorkerSaldoExecutar(): Promise<void> {
  const queueUrl = process.env.SQS_CONSULTAR_PROTOCOLO_SALDO
  if (!queueUrl) {
    console.warn(`[${WORKER}] SQS_CONSULTAR_PROTOCOLO_SALDO não configurada — worker desativado`)
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
  let input: Record<string, unknown>
  try {
    input = JSON.parse(rawBody)
  } catch {
    console.error(`[${WORKER}] mensagem com JSON inválido, descartando`)
    await deletarMensagem(queueUrl, receiptHandle)
    return
  }

  try {
    const arquivoOrigemFallback = typeof input.arquivoOrigem === 'string' ? input.arquivoOrigem : ''
    const arquivoOrigem = typeof input.arquivo_origem === 'string' ? input.arquivo_origem : arquivoOrigemFallback
    const result = await executarSaldo({
      cpf: typeof input.cpf === 'string' ? input.cpf : '',
      protocolo: typeof input.protocolo === 'string' ? input.protocolo : '',
      vlrDividaAtualizada: Number(input.vlrDividaAtualizada),
      vlrAcordoDigio: Number(input.vlrAcordoDigio),
      arquivoOrigem,
    })
    await deletarMensagem(queueUrl, receiptHandle)
    console.log(`[${WORKER}] ✓ cpf=${ofuscarCpf(result.cpf)} protocolo=${result.protocolo} protocoloReserva=${result.protocoloReserva}`)
  } catch (err) {
    if (err instanceof ServiceError && !err.retryable) {
      console.error(`[${WORKER}] erro terminal, descartando mensagem:`, err.message)
      await deletarMensagem(queueUrl, receiptHandle)
    } else {
      console.error(`[${WORKER}] erro retentável, mensagem volta à fila:`, err instanceof Error ? err.message : err)
    }
  }
}

async function deletarMensagem(queueUrl: string, receiptHandle: string): Promise<void> {
  await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
