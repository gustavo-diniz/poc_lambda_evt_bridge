export const EVENTO_GERAR_PROTOCOLO_SALDO = 'evt_gerar_protocolo_saldo'
export const EVENTO_GERAR_PROTOCOLO_SALDO_AGUARDANDO = 'evt_gerar_protocolo_saldo_aguardando'
export const EVENTO_ERRO_GERAR_PROTOCOLO_SALDO = 'evt_erro_gerar_protocolo_consulta-saldo-liquido-simulado'

export const EVENTO_CONSULTA_PROTOCOLO_SALDO = 'evt_consulta_protocolo_saldo'
export const EVENTO_CONSULTA_PROTOCOLO_SALDO_AGUARDANDO = 'evt_consulta_protocolo_saldo_aguardando'
export const EVENTO_ERRO_CONSULTA_PROTOCOLO_SALDO = 'evt_erro_consulta_protocolo'

export const EVENTO_GERAR_PROTOCOLO_RESERVA = 'evt_gerar_protocolo_reserva'
export const EVENTO_GERAR_PROTOCOLO_RESERVA_AGUARDANDO = 'evt_gerar_protocolo_reserva_aguardando'
export const EVENTO_ERRO_GERAR_PROTOCOLO_RESERVA = 'evt_erro_gerar_protocolo_reserva'

export const EVENTO_CONSULTA_PROTOCOLO_RESERVA = 'evt_consulta_protocolo_reserva'
export const EVENTO_CONSULTA_PROTOCOLO_RESERVA_AGUARDANDO = 'evt_consulta_protocolo_reserva_aguardando'


export const ORIGEM_PROTOCOLO_SALDO = 'solicitacoes-consulta-saldo-liquido-simulado'
export const ORIGEM_RETORNO_SALDO = 'consultas-protocolo'
export const ORIGEM_RETORNO_SALDO_ERRO = 'consultas-protocolo-excecao'

export const ORIGEM_RETORNO_RESERVA = 'consultas-protocolo'
export const ORIGEM_SOLICITACOES_DIVIDA = 'solicitacoes-inclusao-divida'

// casos de retorno de erro:
export const ERRO_CPF_E_ORIGEM_JA_EXISTENTE = 'CPF_JA_EXISTENTE_NESSA_ORIGEM'
export const ERRO_API_KEY_NAO_ENCONTRADA = 'API_KEY_NAO_ENCONTRADA'

// ---------------------------------------------------------------------------
// FGO — Fundo de Garantia de Operações de Crédito
// ---------------------------------------------------------------------------
export const EVENTO_FGO_REGISTRO_RECEBIDO       = 'evt_fgo_registro_recebido'
export const EVENTO_FGO_REGISTRO_DUPLICADO      = 'evt_fgo_registro_duplicado'
export const EVENTO_FGO_REGISTRO_ERRO           = 'evt_fgo_registro_erro'

export const ORIGEM_FGO_CSV_INPUT               = 'fgo_input_file'