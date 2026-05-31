import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { executarDb } from './db-error.js'

export type StatusAcordo = 'AGUARDANDO' | 'SUCESSO' | 'REJEITADO'

export type InserirEventoParams = {
  documentId: number
  cpf: string
  evento: string
  protocolo: number | string
  origemProtocolo: string
  statusAcordo: StatusAcordo
  motivoStatus?: string | null
  txResponse?: string | null
  arquivoOrigem: string
  nrTentativa?: number
}

const SQL_INSERIR = `
  INSERT INTO desenrola_event_history
    (document_id, cpf, evento, nr_tentativa, protocolo, origem_protocolo, status_acordo, motivo_status, tx_response, arquivo_origem)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

export async function inserirEvento(params: InserirEventoParams, conn?: PoolConnection): Promise<void> {
  return executarDb(async () => {
    const executor = conn ?? pool
    await executor.execute(SQL_INSERIR, [
      params.documentId,
      params.cpf,
      params.evento,
      params.nrTentativa ?? 1,
      params.protocolo,
      params.origemProtocolo,
      params.statusAcordo,
      params.motivoStatus ?? null,
      params.txResponse ?? null,
      params.arquivoOrigem,
    ])
  })
}
