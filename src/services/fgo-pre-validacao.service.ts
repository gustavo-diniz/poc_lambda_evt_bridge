import { pool } from '../db.js'
import { ServiceError } from './errors.js'
import { ofuscarCpf } from '../utils/cpf.js'
import * as FgoDocumentRepository from '../repositories/fgo-document.repository.js'
import { inserirEventoFgo } from '../repositories/fgo-event-history.repository.js'
import {
  EVENTO_FGO_REGISTRO_RECEBIDO,
  EVENTO_FGO_REGISTRO_DUPLICADO,
  EVENTO_FGO_REGISTRO_ERRO,
  ORIGEM_FGO_CSV_INPUT,
} from '../constants/eventos.js'

export type ProcessarRegistroFgoInput = {
  tipoProduto:               string
  idAcordo:                  number
  ibgeCliente:               string
  cpf:                       string
  dataAcordo:                string
  dataVencimentoOperacao:    string
  valorOperacaoCredito:      number
  valorSubsidioCredito:      number
  valorCondicaoEspecial:     number
  cpfQualificador:           string
  numeroReservaPreValidacao: string | null
  valor:                     number
  motivo:                    string | null
  motivoErro:                string | null
  arquivoOrigem:             string
}

export type ProcessarRegistroFgoResult = {
  documentId: number
  cpf:        string
  idAcordo:   number
  status:     'NOVO' | 'DUPLICADO'
}

export async function processarRegistroFgo(
  input: ProcessarRegistroFgoInput,
): Promise<ProcessarRegistroFgoResult> {
  const { cpf, idAcordo, arquivoOrigem } = input

  validarCamposObrigatorios(input)

  const existente = await FgoDocumentRepository.buscarPorCpfAcordoArquivo(cpf, idAcordo, arquivoOrigem)

  if (existente) {
    console.log(
      `[fgo-pre-validacao][${ofuscarCpf(cpf)}] idAcordo=${idAcordo} já existe (id=${existente.id} status=${existente.statusFgo}) — ignorando duplicata`,
    )

    await inserirEventoFgo({
      documentId:      existente.id,
      cpf,
      evento:          EVENTO_FGO_REGISTRO_DUPLICADO,
      origemProtocolo: ORIGEM_FGO_CSV_INPUT,
      statusAcordo:    'AGUARDANDO',
      motivoStatus:    `Registro duplicado ignorado. Status atual: ${existente.statusFgo}`,
      arquivoOrigem,
    })

    return {
      documentId: existente.id,
      cpf,
      idAcordo,
      status: 'DUPLICADO',
    }
  }

  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const documentId = await FgoDocumentRepository.inserirDocumento({
      tipoProduto:               input.tipoProduto,
      idAcordo:                  input.idAcordo,
      ibgeCliente:               input.ibgeCliente || null,
      cpf:                       input.cpf,
      dataAcordo:                input.dataAcordo || null,
      dataVencimentoOperacao:    input.dataVencimentoOperacao || null,
      valorOperacaoCredito:      input.valorOperacaoCredito,
      valorSubsidioCredito:      input.valorSubsidioCredito,
      valorCondicaoEspecial:     input.valorCondicaoEspecial,
      cpfQualificador:           input.cpfQualificador || null,
      numeroReservaPreValidacao: input.numeroReservaPreValidacao || null,
      valor:                     input.valor,
      motivo:                    input.motivo || null,
      motivoErro:                input.motivoErro || null,
      arquivoOrigem:             input.arquivoOrigem,
    }, conn)

    await inserirEventoFgo({
      documentId,
      cpf,
      evento:          EVENTO_FGO_REGISTRO_RECEBIDO,
      origemProtocolo: ORIGEM_FGO_CSV_INPUT,
      statusAcordo:    'CONCLUIDO',
      motivoStatus:    'Registro recebido da fila e persistido. Aguardando pré-validação FGO.',
      arquivoOrigem,
    }, conn)

    await conn.commit()

    console.log(
      `[fgo-pre-validacao][${ofuscarCpf(cpf)}] ✓ documento criado | id=${documentId} idAcordo=${idAcordo} tipoProduto=${input.tipoProduto}`,
    )

    return { documentId, cpf, idAcordo, status: 'NOVO' }
  } catch (err) {
    await conn.rollback()

    // tenta registrar o erro mesmo fora da transação principal
    try {
      await inserirEventoFgo({
        documentId:      -1,
        cpf,
        evento:          EVENTO_FGO_REGISTRO_ERRO,
        origemProtocolo: ORIGEM_FGO_CSV_INPUT,
        statusAcordo:    'REJEITADO',
        motivoStatus:    err instanceof Error ? err.message : String(err),
        arquivoOrigem,
      })
    } catch {
      // não propaga falha secundária de log
    }

    if (err instanceof ServiceError) throw err
    throw new ServiceError(
      `Falha ao persistir registro FGO no banco: ${err instanceof Error ? err.message : String(err)}`,
      true,
      503,
    )
  } finally {
    conn.release()
  }
}

function validarCamposObrigatorios(input: ProcessarRegistroFgoInput): void {
  if (!input.cpf) throw new ServiceError('Campo obrigatório ausente: cpf', false, 400)
  if (!input.tipoProduto) throw new ServiceError('Campo obrigatório ausente: tipoProduto', false, 400)
  if (!input.idAcordo) throw new ServiceError('Campo obrigatório ausente: idAcordo', false, 400)
  if (!input.arquivoOrigem) throw new ServiceError('Campo obrigatório ausente: arquivoOrigem', false, 400)
}
