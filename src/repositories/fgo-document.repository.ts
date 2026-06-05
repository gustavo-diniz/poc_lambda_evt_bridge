import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { pool } from '../db.js'
import { executarDb } from './db-error.js'

export type StatusFgo =
  | 'AGUARDANDO_PRE_VALIDACAO'
  | 'CONCLUIDO'
  | 'REJEITADO'
  | 'EXPIRADO'
  | 'ERRO_DEFINITIVO'

export type InserirDocumentoFgoParams = {
  tipoProduto:               string
  idAcordo:                  number
  ibgeCliente:               string | null
  cpf:                       string
  dataAcordo:                string | null   // formato DD/MM/YYYY ou YYYY-MM-DD
  dataVencimentoOperacao:    string | null
  valorOperacaoCredito:      number
  valorSubsidioCredito:      number
  valorCondicaoEspecial:     number
  cpfQualificador:           string | null
  numeroReservaPreValidacao: string | null
  valor:                     number
  motivo:                    string | null
  motivoErro:                string | null
  arquivoOrigem:             string
}

export type BuscarDocumentoFgoResult = {
  id: number
  statusFgo: StatusFgo
  numeroReservaPreValidacao: string | null
}

// Converte DD/MM/YYYY → YYYY-MM-DD para o MySQL; retorna null se inválido
function converterData(valor: string | null): string | null {
  if (!valor) return null
  const [d, m, y] = valor.split('/')
  if (d && m && y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  // aceita formato já em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  return null
}

const SQL_INSERIR = `
  INSERT INTO fgo_documents
    (tipo_produto, id_acordo, ibge_cliente, cpf, data_acordo, data_vencimento_operacao,
     valor_operacao_credito, valor_subsidio_credito, valor_condicao_especial,
     cpf_qualificador, numero_reserva_pre_validacao, valor, motivo, motivo_erro, arquivo_origem,
     status_fgo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGUARDANDO_PRE_VALIDACAO')`

const SQL_BUSCAR_POR_CPF_ACORDO_ARQUIVO = `
  SELECT id, status_fgo, numero_reserva_pre_validacao
  FROM fgo_documents
  WHERE cpf = ? AND id_acordo = ? AND arquivo_origem = ?
  LIMIT 1`

const SQL_ATUALIZAR_STATUS = `
  UPDATE fgo_documents
  SET status_fgo = ?, motivo_status_fgo = ?, updated_at = NOW()
  WHERE id = ?`

export async function buscarPorCpfAcordoArquivo(
  cpf: string,
  idAcordo: number,
  arquivoOrigem: string,
  conn?: PoolConnection,
): Promise<BuscarDocumentoFgoResult | null> {
  return executarDb(async () => {
    const executor = conn ?? pool
    const [rows] = await executor.execute<RowDataPacket[]>(
      SQL_BUSCAR_POR_CPF_ACORDO_ARQUIVO,
      [cpf, idAcordo, arquivoOrigem],
    )
    if (!rows.length) return null
    return {
      id: rows[0].id as number,
      statusFgo: rows[0].status_fgo as StatusFgo,
      numeroReservaPreValidacao: (rows[0].numero_reserva_pre_validacao as string | null) ?? null,
    }
  })
}

export async function inserirDocumento(
  params: InserirDocumentoFgoParams,
  conn?: PoolConnection,
): Promise<number> {
  return executarDb(async () => {
    const executor = conn ?? pool
    const [result] = await executor.execute<ResultSetHeader>(SQL_INSERIR, [
      params.tipoProduto,
      params.idAcordo,
      params.ibgeCliente || null,
      params.cpf,
      converterData(params.dataAcordo),
      converterData(params.dataVencimentoOperacao),
      params.valorOperacaoCredito,
      params.valorSubsidioCredito,
      params.valorCondicaoEspecial,
      params.cpfQualificador || null,
      params.numeroReservaPreValidacao || null,
      params.valor,
      params.motivo || null,
      params.motivoErro || null,
      params.arquivoOrigem,
    ])
    return result.insertId
  })
}

export async function atualizarStatus(
  id: number,
  statusFgo: StatusFgo,
  motivoStatusFgo: string | null,
  conn?: PoolConnection,
): Promise<void> {
  return executarDb(async () => {
    const executor = conn ?? pool
    await executor.execute(SQL_ATUALIZAR_STATUS, [statusFgo, motivoStatusFgo, id])
  })
}
