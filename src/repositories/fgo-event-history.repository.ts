import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { executarDb } from './db-error.js'

export type StatusFgoEvento = 'AGUARDANDO' | 'SUCESSO' | 'REJEITADO' | 'CONCLUIDO'

export type InserirEventoFgoParams = {
  documentId: number
  cpf: string
  evento: string
  nrTentativa?: number
  protocolo?: number | string | null
  origemProtocolo?: string
  statusAcordo: StatusFgoEvento
  motivoStatus?: string | null
  txResponse?: string | null
  arquivoOrigem: string
  arquivoSaida?: string | null
}

const SQL_INSERIR = `
  INSERT INTO fgo_event_history
    (document_id, cpf, evento, nr_tentativa, protocolo, origem_protocolo,
     status_acordo, motivo_status, tx_response, arquivo_origem, arquivo_saida)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

export async function inserirEventoFgo(params: InserirEventoFgoParams, conn?: PoolConnection): Promise<void> {
  return executarDb(async () => {
    const executor = conn ?? pool
    await executor.execute(SQL_INSERIR, [
      params.documentId,
      params.cpf,
      params.evento,
      params.nrTentativa ?? 1,
      params.protocolo ?? null,
      params.origemProtocolo ?? null,
      params.statusAcordo,
      params.motivoStatus ?? null,
      params.txResponse ?? null,
      params.arquivoOrigem,
      params.arquivoSaida ?? null,
    ])
  })
}
