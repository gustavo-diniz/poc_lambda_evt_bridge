import { pool } from '../db.js'
import { ofuscarCpf } from '../utils/cpf.js'
import {
  EVENTO_GERAR_PROTOCOLO_SALDO,
  EVENTO_GERAR_PROTOCOLO_SALDO_AGUARDANDO,
  EVENTO_ERRO_GERAR_PROTOCOLO_SALDO,
  ORIGEM_PROTOCOLO_SALDO,
} from '../constants/eventos.js'
import * as DocumentRepository from './desenrola-document.repository.js'
import * as EventHistoryRepository from './event-history.repository.js'

export {
  EVENTO_GERAR_PROTOCOLO_SALDO,
  EVENTO_ERRO_GERAR_PROTOCOLO_SALDO,
  ORIGEM_PROTOCOLO_SALDO,
}

type GerarProtocoloDocumento = {
  cpf: string
  valorDivida: number
  valorAcordo: number
  arquivoOrigem: string
}

type CaixaErroPayload = {
  protocolo?: number
  descricao?: string
  codigo?: number
}

export async function registrarErroGerarProtocoloSaldo(params: {
  body: GerarProtocoloDocumento
  payload: CaixaErroPayload | null
  rawResponse: string
  motivo: string
  retryable: boolean
}): Promise<void> {
  const txResponse = params.payload == null ? params.rawResponse || null : JSON.stringify(params.payload)
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const documentId = await DocumentRepository.inserirOuAtualizar(conn, params.body)
    await DocumentRepository.atualizarStatus(
      documentId,
      params.retryable ? 'AGUARDANDO_PROTOCOLO_CONSULTA_SALDO' : 'REJEITADO',
      params.retryable ? null : params.motivo,
      conn,
    )
    await EventHistoryRepository.inserirEvento({
      documentId,
      cpf: params.body.cpf,
      evento: EVENTO_ERRO_GERAR_PROTOCOLO_SALDO,
      protocolo: -1,
      origemProtocolo: ORIGEM_PROTOCOLO_SALDO,
      statusAcordo: params.retryable ? 'AGUARDANDO' : 'REJEITADO',
      motivoStatus: params.motivo || 'Erro no fluxo de saldo.',
      txResponse,
      arquivoOrigem: params.body.arquivoOrigem,
    }, conn)

    await conn.commit()
    console.error(`[${ofuscarCpf(params.body.cpf)}] Erro no fluxo de saldo: ${params.motivo}`)
  } catch (err) {
    await conn.rollback()
    console.error('Falha ao salvar evento de erro no banco:', err)
  } finally {
    conn.release()
  }
}

export async function registrarAguardandoGerarProtocoloSaldo(params: {
  body: GerarProtocoloDocumento
  motivo: string
  txResponse?: string | null
}): Promise<void> {
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const documentId = await DocumentRepository.inserirOuAtualizar(conn, params.body)
    await EventHistoryRepository.inserirEvento({
      documentId,
      cpf: params.body.cpf,
      evento: EVENTO_GERAR_PROTOCOLO_SALDO_AGUARDANDO,
      protocolo: -1,
      origemProtocolo: ORIGEM_PROTOCOLO_SALDO,
      statusAcordo: 'AGUARDANDO',
      motivoStatus: params.motivo,
      txResponse: params.txResponse ?? null,
      arquivoOrigem: params.body.arquivoOrigem,
    }, conn)

    await conn.commit()
    console.log(`[${ofuscarCpf(params.body.cpf)}] Evento aguardando registrado: ${params.motivo}`)
  } catch (err) {
    await conn.rollback()
    console.error('Falha ao salvar evento de aguardando no banco:', err)
  } finally {
    conn.release()
  }
}

export async function registrarSucessoGerarProtocoloSaldo(params: {
  body: GerarProtocoloDocumento
  protocolo: number
  payload: CaixaErroPayload | null
  rawResponse: string
}): Promise<void> {
  const txResponse = params.payload == null ? params.rawResponse || null : JSON.stringify(params.payload)
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const documentId = await DocumentRepository.inserirOuAtualizar(conn, params.body)
    await DocumentRepository.atualizarProtocoloSaldo(conn, documentId, params.protocolo)
    await EventHistoryRepository.inserirEvento({
      documentId,
      cpf: params.body.cpf,
      evento: EVENTO_GERAR_PROTOCOLO_SALDO,
      protocolo: params.protocolo,
      origemProtocolo: ORIGEM_PROTOCOLO_SALDO,
      statusAcordo: 'SUCESSO',
      motivoStatus: `Protocolo de saldo ${params.protocolo} registrado.`,
      txResponse,
      arquivoOrigem: params.body.arquivoOrigem,
    }, conn)

    await conn.commit()
    console.log(`[${ofuscarCpf(params.body.cpf)}] Documento criado com protocolo_saldo=${params.protocolo}.`)
  } catch (err) {
    await conn.rollback()
    console.error('Falha ao persistir protocolo de saldo no banco:', err)
    throw err
  } finally {
    conn.release()
  }
}
