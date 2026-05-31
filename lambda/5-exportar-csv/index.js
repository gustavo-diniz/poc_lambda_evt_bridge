import { chamarExportarCsv, EndpointError } from './call-endpoint.js'

/**
 * Lambda 5 — acionado por EventBridge (cron)
 * e chama GET /reserva/exportacao/csv (endpoint 4).
 *
 * Não consome SQS. Dispara a exportação e registra o resultado.
 */
export const handler = async () => {
  try {
    const result = await chamarExportarCsv()

    console.log(JSON.stringify({
      level: 'info',
      message: 'Exportação concluída',
      exportados: result?.exportados ?? 0,
      arquivos: result?.arquivos ?? [],
      bucket: result?.bucket ?? null,
    }))

    return { statusCode: 200, body: JSON.stringify(result) }
  } catch (err) {
    const retryable = err instanceof EndpointError ? err.retryable : false

    console.error(JSON.stringify({
      level: 'error',
      retryable,
      error: err instanceof Error ? err.message : String(err),
    }))

    // Relança para o Lambda registrar falha e o EventBridge logar o erro
    throw err
  }
}
