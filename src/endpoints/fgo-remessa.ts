import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { gerarArquivoRemessa, type RemessaFgoInput } from '../services/fgo-remessa.service.js'

const fgoRemessaRoute = new Hono()

/**
 * POST /fgo/remessa/gerar-e-validar
 *
 * Recebe os dados da remessa em JSON, gera o arquivo posicional GFG0010
 * e envia ao mock-server-fgo para validação (1º Retorno + regras de negócio).
 *
 * Retorna o arquivo gerado e o resultado da validação do mock.
 */
fgoRemessaRoute.post('/gerar-e-validar', async (c) => {
  let body: RemessaFgoInput
  try {
    body = await c.req.json<RemessaFgoInput>()
  } catch {
    throw new HTTPException(400, { message: 'Body JSON inválido' })
  }

  const { agente, numRemessa, operacoes } = body

  if (!agente || !numRemessa) {
    throw new HTTPException(400, { message: 'Campos obrigatórios: agente, numRemessa' })
  }
  if (!Array.isArray(operacoes) || operacoes.length === 0) {
    throw new HTTPException(400, { message: 'operacoes deve ser um array não vazio' })
  }

  // ── 1. Gera o arquivo GFG0010 ──────────────────────────────────────────
  let arquivo: string
  try {
    arquivo = gerarArquivoRemessa(body)
  } catch (err) {
    throw new HTTPException(422, {
      message: `Erro ao gerar arquivo: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // ── 2. Valida no mock-server-fgo ───────────────────────────────────────
  const mockUrl = (process.env.HOST_FGO_MOCK_REMESSA ?? 'http://localhost:9002').replace(/\/$/, '')

  let validacao: unknown
  try {
    const resp = await fetch(`${mockUrl}/remessa`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: arquivo,
    })
    validacao = await resp.json()
  } catch (err) {
    throw new HTTPException(502, {
      message: `Não foi possível conectar ao mock FGO (${mockUrl}): ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  return c.json({ arquivo, validacao })
})

export default fgoRemessaRoute
