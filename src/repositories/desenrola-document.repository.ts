import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool } from '../db.js'
import { executarDb } from './db-error.js'

export type DocumentoRow = {
  id: number
  vrMaximoDebito: number | null
  protocoloReserva: number | null
  vlrReserva: number | null
}

export type InserirOuAtualizarData = {
  cpf: string
  valorAcordo: number
  valorDivida: number
  arquivoOrigem: string
}

export async function buscarPorCpfEArquivo(cpf: string, arquivoOrigem: string): Promise<{
  id: number
  protocoloSaldo: number | null
  valorAcordo: number | null
  valorDivida: number | null
} | null> {
  return executarDb(async () => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, protocolo_saldo, vlr_acordo_digio, vlr_divida_atualizada FROM desenrola_documents WHERE cpf = ? AND arquivo_origem = ? LIMIT 1',
      [cpf, arquivoOrigem],
    )
    if (!rows[0]) return null
    return {
      id: rows[0].id as number,
      protocoloSaldo: rows[0].protocolo_saldo as number | null,
      valorAcordo: rows[0].vlr_acordo_digio == null ? null : Number(rows[0].vlr_acordo_digio),
      valorDivida: rows[0].vlr_divida_atualizada == null ? null : Number(rows[0].vlr_divida_atualizada),
    }
  })
}

export async function buscarPorCpfComSaldo(cpf: string, arquivoOrigem: string): Promise<DocumentoRow | null> {
  return executarDb(async () => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, vr_maximo_debito, protocolo_reserva, vlr_reserva FROM desenrola_documents WHERE cpf = ? AND arquivo_origem = ? ORDER BY id DESC LIMIT 1',
      [cpf, arquivoOrigem],
    )
    if (!rows[0]) return null
    return {
      id: rows[0].id as number,
      vrMaximoDebito: rows[0].vr_maximo_debito as number | null,
      protocoloReserva: rows[0].protocolo_reserva as number | null,
      vlrReserva: rows[0].vlr_reserva as number | null,
    }
  })
}

export async function buscarIdPorCpf(cpf: string): Promise<number | null> {
  return executarDb(async () => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM desenrola_documents WHERE cpf = ? ORDER BY id DESC LIMIT 1',
      [cpf],
    )
    return (rows[0]?.id as number) ?? null
  })
}

export async function inserirOuAtualizar(conn: PoolConnection, data: InserirOuAtualizarData): Promise<number> {
  return executarDb(async () => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM desenrola_documents WHERE cpf = ? AND arquivo_origem = ? LIMIT 1',
      [data.cpf, data.arquivoOrigem],
    )

    if (rows.length > 0) {
      const id = rows[0].id as number
      await conn.execute(
        'UPDATE desenrola_documents SET vlr_acordo_digio = ?, vlr_divida_atualizada = ?, updated_at = NOW() WHERE id = ?',
        [data.valorAcordo, data.valorDivida, id],
      )
      return id
    }

    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO desenrola_documents
         (cpf, vlr_acordo_digio, vlr_divida_atualizada, arquivo_origem, status, dhr_arquivo_origem, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'AGUARDANDO_PROTOCOLO_CONSULTA_SALDO', NOW(), NOW(), NOW())`,
      [data.cpf, data.valorAcordo, data.valorDivida, data.arquivoOrigem],
    )
    return result.insertId
  })
}

export async function atualizarStatus(
  documentId: number,
  status: string,
  motivoStatus: string | null = null,
  conn?: PoolConnection,
): Promise<void> {
  return executarDb(async () => {
    const executor = conn ?? pool
    await executor.execute(
      'UPDATE desenrola_documents SET status = ?, motivo_status = ?, updated_at = NOW() WHERE id = ?',
      [status, motivoStatus, documentId],
    )
  })
}

export async function atualizarProtocoloSaldo(conn: PoolConnection, documentId: number, protocolo: number): Promise<void> {
  return executarDb(async () => {
    await conn.execute(
      `UPDATE desenrola_documents
         SET protocolo_saldo = ?, protocolo_saldo_dhr_solic = NOW(), status = 'AGUARDANDO_CONSULTA_SALDO', updated_at = NOW()
       WHERE id = ?`,
      [protocolo, documentId],
    )
  })
}

export async function atualizarSaldoFgts(documentId: number, vrMaximoDebito: number): Promise<void> {
  return executarDb(async () => {
    await pool.execute(
      'UPDATE desenrola_documents SET vr_maximo_debito = ?, protocolo_saldo_dhr_consulta = NOW() WHERE id = ?',
      [vrMaximoDebito, documentId],
    )
  })
}

export async function atualizarReserva(documentId: number, protocoloReserva: number, valorReserva: number): Promise<void> {
  return executarDb(async () => {
    await pool.execute(
      `UPDATE desenrola_documents
         SET protocolo_reserva = ?, vlr_reserva = ?, protocolo_reserva_dhr_solic = NOW(),
             status = 'AGUARDANDO_CONFIRMACAO_INF_DIVIDA'
       WHERE id = ?`,
      [protocoloReserva, valorReserva, documentId],
    )
  })
}

export async function concluir(documentId: number, vlrReservaConfirmado?: number): Promise<void> {
  return executarDb(async () => {
    if (vlrReservaConfirmado == null) {
      await pool.execute(
        `UPDATE desenrola_documents
           SET protocolo_reserva_dhr_consulta = NOW(), status = 'CONCLUIDO', updated_at = NOW()
         WHERE id = ?`,
        [documentId],
      )
    } else {
      await pool.execute(
        `UPDATE desenrola_documents
           SET protocolo_reserva_dhr_consulta = NOW(), status = 'CONCLUIDO', vlr_reserva = ?, updated_at = NOW()
         WHERE id = ?`,
        [vlrReservaConfirmado, documentId],
      )
    }
  })
}

export type DocumentoExportavel = RowDataPacket & Record<string, unknown>

export async function buscarParaExportar(): Promise<DocumentoExportavel[]> {
  return executarDb(async () => {
    const [rows] = await pool.execute<DocumentoExportavel[]>(
      "SELECT * FROM desenrola_documents WHERE status IN ('CONCLUIDO', 'REJEITADO') AND concluido = 0 ORDER BY arquivo_origem, id",
    )
    return rows
  })
}

export async function marcarExportados(ids: number[], arquivoDestino: string): Promise<void> {
  return executarDb(async () => {
    await pool.execute(
      `UPDATE desenrola_documents
          SET concluido = 1, arquivo_destino = ?, dhr_arquivo_destino = NOW()
        WHERE id IN (${ids.map(() => '?').join(',')})`,
      [arquivoDestino, ...ids],
    )
  })
}
