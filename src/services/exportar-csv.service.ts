import { uploadCsvToOutputBucket } from '../utils/s3.js'
import * as DocumentRepository from '../repositories/desenrola-document.repository.js'
import type { DocumentoExportavel } from '../repositories/desenrola-document.repository.js'

export type ExportarCsvResult = {
  exportados: number
  arquivo: string
  bucket: string
}

const COLUNAS_IGNORADAS = new Set(['concluido', 'created_at', 'updated_at'])

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/

function formatarData(d: Date): string {
  try {
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    const dd = String(d.getDate()).padStart(2, '0')
    const MM = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const HH = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`
  } catch {
    return ''
  }
}

function valorParaString(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return formatarData(v)
  if (typeof v === 'string' && REGEX_DATA.test(v)) return formatarData(new Date(v))
  return String(v)
}

function gerarCsv(rows: DocumentoExportavel[]): string {
  if (rows.length === 0) return ''
  const colunas = Object.keys(rows[0]).filter(c => !COLUNAS_IGNORADAS.has(c))
  const headers = colunas.join(';')
  const linhas = rows.map(row =>
    colunas.map(col => {
      const str = valorParaString(row[col])
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replaceAll('"', '""')}"`
      }
      return str
    }).join(';')
  )
  return [headers, ...linhas].join('\n')
}

function nomeArquivoDestino(): string {
  const agora = new Date()
  const dd = String(agora.getDate()).padStart(2, '0')
  const MM = String(agora.getMonth() + 1).padStart(2, '0')
  const yyyy = agora.getFullYear()
  const HH = String(agora.getHours()).padStart(2, '0')
  const mm = String(agora.getMinutes()).padStart(2, '0')
  const ss = String(agora.getSeconds()).padStart(2, '0')
  return `desenrola_resultado_${dd}${MM}${yyyy}_${HH}${mm}${ss}.csv`
}

export async function exportarCsvFinal(): Promise<ExportarCsvResult | null> {
  const rows = await DocumentRepository.buscarParaExportar()

  if (rows.length === 0) return null

  const arquivoDestino = nomeArquivoDestino()
  const csv = gerarCsv(rows)
  const bucket = await uploadCsvToOutputBucket(arquivoDestino, csv)

  const ids = rows.map(r => r.id as number)
  await DocumentRepository.marcarExportados(ids, arquivoDestino)

  return { exportados: rows.length, arquivo: arquivoDestino, bucket }
}
