import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { processarRegistroFgo } from '../services/fgo-pre-validacao.service.js'
import { ServiceError } from '../services/errors.js'

const fgoPreValidacaoRoute = new Hono()

/**
 * Simula o recebimento de um registro da fila fgo_input_file para processamento manual/teste.
 * Mesmo payload que o worker lê do SQS.
 */
fgoPreValidacaoRoute.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Body JSON inválido' })
  }

  const {
    tipoProduto,
    idAcordo,
    ibgeCliente,
    cpf,
    dataAcordo,
    dataVencimentoOperacao,
    valorOperacaoCredito,
    valorSubsidioCredito,
    valorCondicaoEspecial,
    cpfQualificador,
    numeroReservaPreValidacao,
    valor,
    motivo,
    motivoErro,
    arquivoOrigem,
  } = body

  if (!tipoProduto || !idAcordo || !cpf || !arquivoOrigem) {
    throw new HTTPException(400, {
      message: 'Campos obrigatórios: tipoProduto, idAcordo, cpf, arquivoOrigem',
    })
  }

  try {
    const result = await processarRegistroFgo({
      tipoProduto:               String(tipoProduto),
      idAcordo:                  Number(idAcordo),
      ibgeCliente:               ibgeCliente != null ? String(ibgeCliente) : '',
      cpf:                       String(cpf),
      dataAcordo:                dataAcordo != null ? String(dataAcordo) : '',
      dataVencimentoOperacao:    dataVencimentoOperacao != null ? String(dataVencimentoOperacao) : '',
      valorOperacaoCredito:      Number(valorOperacaoCredito ?? 0),
      valorSubsidioCredito:      Number(valorSubsidioCredito ?? 0),
      valorCondicaoEspecial:     Number(valorCondicaoEspecial ?? 0),
      cpfQualificador:           cpfQualificador != null ? String(cpfQualificador) : '',
      numeroReservaPreValidacao: numeroReservaPreValidacao != null ? String(numeroReservaPreValidacao) : null,
      valor:                     Number(valor ?? 0),
      motivo:                    motivo != null ? String(motivo) : null,
      motivoErro:                motivoErro != null ? String(motivoErro) : null,
      arquivoOrigem:             String(arquivoOrigem),
    })

    return c.json({ message: 'Registro FGO processado com sucesso', ...result })
  } catch (err) {
    if (err instanceof ServiceError) {
      throw new HTTPException(err.httpStatus as 400 | 409 | 500, { message: err.message })
    }
    throw err
  }
})

export default fgoPreValidacaoRoute
