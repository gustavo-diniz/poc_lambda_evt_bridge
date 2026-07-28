'use strict';

import {
  apenasDigitos,
  ErroGeracaoArquivo,
  formatarAlfanumerico,
  formatarData,
  formatarDecimal,
  formatarEspacos,
  formatarMoeda,
  formatarNumerico,
} from './formatadores.js';
import { LayoutLineBuilder } from './layout-line-builder.js';
import type { ParametrosRemessa } from './config.js';
import {
  DESCRICAO_TIPO_DETALHE,
  TIPO_REGISTRO_ALTERACAO,
  TIPO_REGISTRO_CANCELAMENTO,
  TIPO_REGISTRO_FORMALIZACAO,
  TIPO_REGISTRO_HEADER,
  TIPO_REGISTRO_LIBERACAO,
  TIPO_REGISTRO_LIQUIDACAO,
  TIPO_REGISTRO_SALDO,
  TIPO_REGISTRO_TRAILER,
  type DetalheAlteracao,
  type DetalheCancelamento,
  type DetalheFormalizacao,
  type DetalheLiberacao,
  type DetalheLiquidacao,
  type DetalheSaldo,
  type RegistroDetalhe,
} from './tipos.js';

/** Todas as linhas do GFG0010 têm exatamente 211 colunas. */
export const TAMANHO_LINHA = 211;

/** 01 - HEADER (manual §13.1). */
export function montarHeader(parametros: ParametrosRemessa): string {
  const builder = new LayoutLineBuilder('HEADER');

  builder
    // Nº sequencial do registro "0000001" (1-7)
    .adicionar(formatarNumerico(1, 7, 'noSequencialRegistro'), 7, 'noSequencialRegistro')
    // Código do tipo do registro "01" (8-9)
    .adicionar(TIPO_REGISTRO_HEADER, 2, 'codigoTipoRegistro')
    // Nome do Arquivo Remessa "GFGF0010" (10-17)
    .adicionar(
      formatarAlfanumerico(parametros.nomeArquivoRemessa, 8, 'nomeArquivoRemessa'),
      8,
      'nomeArquivoRemessa'
    )
    // Versão do leiaute "20170331" (18-25)
    .adicionar(formatarNumerico(parametros.versaoLeiaute, 8, 'versaoLeiaute'), 8, 'versaoLeiaute')
    // Código do Agente Financeiro (26-28)
    .adicionar(
      formatarNumerico(parametros.codigoAgenteFinanceiro, 3, 'codigoAgenteFinanceiro'),
      3,
      'codigoAgenteFinanceiro'
    )
    // Código do Fundo Garantidor "010" (29-31)
    .adicionar(
      formatarNumerico(parametros.codigoFundoGarantidor, 3, 'codigoFundoGarantidor'),
      3,
      'codigoFundoGarantidor'
    )
    // Nº sequencial da Remessa (32-35)
    .adicionar(
      formatarNumerico(parametros.numeroSequencialRemessa, 4, 'numeroSequencialRemessa'),
      4,
      'numeroSequencialRemessa'
    )
    // Espaços (36-211)
    .adicionar(formatarEspacos(176), 176, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 03 - DETALHE (FORMALIZAÇÃO DE OPERAÇÃO) (manual §13.1). */
export function montarDetalheFormalizacao(
  registro: DetalheFormalizacao,
  noSequencialRegistro: number,
  parametros: ParametrosRemessa
): string {
  const contexto = rotuloContexto(registro);
  const builder = new LayoutLineBuilder(contexto);

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "03" (8-9)
    .adicionar(TIPO_REGISTRO_FORMALIZACAO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito (10-29)
    .adicionar(formatarAlfanumerico(registro.idAcordo, 20, 'idAcordo'), 20, 'idAcordo')
    // Nº da agência contratante (30-33)
    .adicionar(
      formatarNumerico(parametros.numeroAgenciaContratanteOperacao, 4, 'numeroAgenciaContratante'),
      4,
      'numeroAgenciaContratante'
    )
    // Código IBGE do município (34-40)
    .adicionar(
      formatarNumerico(apenasDigitos(registro.ibgeCliente), 7, 'ibgeCliente'),
      7,
      'ibgeCliente'
    )
    // Código do tipo de pessoa do mutuário (41)
    .adicionar(
      formatarNumerico(parametros.codigoTipoPessoa, 1, 'codigoTipoPessoa'),
      1,
      'codigoTipoPessoa'
    )
    // CPF do mutuário (42-55)
    .adicionar(formatarNumerico(apenasDigitos(registro.cpf), 14, 'cpf'), 14, 'cpf')
    // Código do público-alvo (56-57)
    .adicionar(
      formatarNumerico(parametros.codigoTipoPublicoAlvo, 2, 'codigoTipoPublicoAlvo'),
      2,
      'codigoTipoPublicoAlvo'
    )
    // Valor da renda mensal do mutuário (58-74)
    .adicionar(formatarMoeda(registro.valorRenda, 17, 'valorRenda'), 17, 'valorRenda')
    // Valor da operação (75-91)
    .adicionar(
      formatarMoeda(registro.valorOperacaoCredito, 17, 'valorOperacaoCredito'),
      17,
      'valorOperacaoCredito'
    )
    // Percentual da garantia FGO, 2 casas decimais (92-96)
    .adicionar(
      formatarDecimal(parametros.percentualGarantiaOperacaoCredito, 5, 2, 'percentualGarantia'),
      5,
      'percentualGarantia'
    )
    // Código da modalidade de crédito (97)
    .adicionar(
      formatarNumerico(parametros.codigoTipoModalidadeCredito, 1, 'codigoTipoModalidadeCredito'),
      1,
      'codigoTipoModalidadeCredito'
    )
    // Código da finalidade do crédito (98)
    .adicionar(
      formatarNumerico(parametros.codigoTipoFinalidadeCredito, 1, 'codigoTipoFinalidadeCredito'),
      1,
      'codigoTipoFinalidadeCredito'
    )
    // Código da fonte de recursos (99-101)
    .adicionar(
      formatarNumerico(parametros.codigoTipoFonteRecurso, 3, 'codigoTipoFonteRecurso'),
      3,
      'codigoTipoFonteRecurso'
    )
    // Código do programa de crédito (102-105)
    .adicionar(
      formatarNumerico(parametros.codigoTipoProgramaCredito, 4, 'codigoTipoProgramaCredito'),
      4,
      'codigoTipoProgramaCredito'
    )
    // Data da formalização da operação (106-113)
    .adicionar(formatarData(registro.dataAcordo, 'dataAcordo'), 8, 'dataAcordo')
    // Data de vencimento da operação (114-121)
    .adicionar(
      formatarData(registro.dataVencimentoOperacao, 'dataVencimentoOperacao'),
      8,
      'dataVencimentoOperacao'
    )
    // Código do tipo de cronograma de amortizações (122)
    .adicionar(
      formatarNumerico(parametros.codigoTipoCronogramaAmortizacao, 1, 'codigoTipoCronograma'),
      1,
      'codigoTipoCronograma'
    )
    // Código de condição especial da operação (123-124)
    .adicionar(
      formatarNumerico(parametros.codigoTipoCondicaoEspecial, 2, 'codigoTipoCondicaoEspecial'),
      2,
      'codigoTipoCondicaoEspecial'
    )
    // Data do despacho externo (125-132)
    .adicionar(
      formatarData(String(parametros.dataDespachoExternoOperacao), 'dataDespachoExterno', {
        permitirZerado: true,
      }),
      8,
      'dataDespachoExterno'
    )
    // Código do tipo de formalização (133)
    .adicionar(
      formatarNumerico(parametros.codigoTipoFormalizacao, 1, 'codigoTipoFormalizacao'),
      1,
      'codigoTipoFormalizacao'
    )
    // Número da pré-validação do evento (134-142)
    .adicionar(
      formatarNumerico(apenasDigitos(registro.numeroPreValidacao), 9, 'numeroPreValidacao'),
      9,
      'numeroPreValidacao'
    )
    // Valor da subvenção (143-159) — manual manda zeros
    .adicionar(formatarMoeda(registro.valorSubvencao || 0, 17, 'valorSubvencao'), 17, 'valorSubvencao')
    // Nº do CPF Qualificador (160-170) — manual manda espaços
    .adicionar(formatarEspacos(11), 11, 'cpfQualificador')
    // Espaços (171-211)
    .adicionar(formatarEspacos(41), 41, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 04 - DETALHE (LIBERAÇÃO DE CRÉDITO) (manual §13.1). */
export function montarDetalheLiberacao(
  registro: DetalheLiberacao,
  noSequencialRegistro: number
): string {
  const builder = new LayoutLineBuilder(rotuloContexto(registro));

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "04" (8-9)
    .adicionar(TIPO_REGISTRO_LIBERACAO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito (10-29)
    .adicionar(formatarAlfanumerico(registro.idAcordo, 20, 'idAcordo'), 20, 'idAcordo')
    // Data da liberação de crédito (30-37)
    .adicionar(
      formatarData(registro.dataLiberacaoCredito, 'dataLiberacaoCredito'),
      8,
      'dataLiberacaoCredito'
    )
    // Valor da liberação de crédito (38-54)
    .adicionar(
      formatarMoeda(registro.valorLiberacaoCredito, 17, 'valorLiberacaoCredito'),
      17,
      'valorLiberacaoCredito'
    )
    // Espaços (55-211)
    .adicionar(formatarEspacos(157), 157, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 05 - DETALHE (INFORMAÇÃO DE SALDO) (manual §13.1). */
export function montarDetalheSaldo(
  registro: DetalheSaldo,
  noSequencialRegistro: number
): string {
  const builder = new LayoutLineBuilder(rotuloContexto(registro));

  const dataInadimplencia = formatarData(
    registro.dataInicioInadimplenciaCapital,
    'dataInicioInadimplenciaCapital',
    { permitirZerado: true }
  );

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "05" (8-9)
    .adicionar(TIPO_REGISTRO_SALDO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito (10-29)
    .adicionar(formatarAlfanumerico(registro.idAcordo, 20, 'idAcordo'), 20, 'idAcordo')
    // Data de apuração dos saldos (30-37)
    .adicionar(
      formatarData(registro.dataApuracaoSaldos, 'dataApuracaoSaldos'),
      8,
      'dataApuracaoSaldos'
    )
    // Saldo devedor de capital em normalidade (38-54)
    .adicionar(
      formatarMoeda(registro.valorSaldoCapitalNormalidade, 17, 'valorSaldoCapitalNormalidade'),
      17,
      'valorSaldoCapitalNormalidade'
    )
    // Saldo devedor de capital em atraso (55-71)
    .adicionar(
      formatarMoeda(registro.valorSaldoCapitalAtraso, 17, 'valorSaldoCapitalAtraso'),
      17,
      'valorSaldoCapitalAtraso'
    )
    // Saldo devedor de encargos em normalidade (72-88)
    .adicionar(
      formatarMoeda(registro.valorSaldoEncargosNormalidade, 17, 'valorSaldoEncargosNormalidade'),
      17,
      'valorSaldoEncargosNormalidade'
    )
    // Saldo devedor de encargos em atraso (89-105)
    .adicionar(
      formatarMoeda(registro.valorSaldoEncargosAtraso, 17, 'valorSaldoEncargosAtraso'),
      17,
      'valorSaldoEncargosAtraso'
    )
    // Espaços — não preencher com zeros (106-107)
    .adicionar(formatarEspacos(2), 2, 'espacosReservados')
    // Data de início da inadimplência de capital (108-115)
    .adicionar(dataInadimplencia, 8, 'dataInicioInadimplenciaCapital')
    // Índice de perda esperada, 6 casas decimais (116-122)
    .adicionar(
      formatarDecimal(registro.indicePerdaEsperada, 7, 6, 'indicePerdaEsperada'),
      7,
      'indicePerdaEsperada'
    )
    // Espaços (123-211)
    .adicionar(formatarEspacos(89), 89, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 10 - DETALHE (ALTERAÇÃO DE OPERAÇÃO) (manual §13.1). */
export function montarDetalheAlteracao(
  registro: DetalheAlteracao,
  noSequencialRegistro: number,
  parametros: ParametrosRemessa
): string {
  const builder = new LayoutLineBuilder(rotuloContexto(registro));

  // Manual: "Se não houver alteração, repita o código atual."
  const novoIdAcordo = registro.novoIdAcordo || registro.idAcordo;

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "10" (8-9)
    .adicionar(TIPO_REGISTRO_ALTERACAO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito (10-29)
    .adicionar(formatarAlfanumerico(registro.idAcordo, 20, 'idAcordo'), 20, 'idAcordo')
    // Novo código identificador da operação de crédito (30-49)
    .adicionar(formatarAlfanumerico(novoIdAcordo, 20, 'novoIdAcordo'), 20, 'novoIdAcordo')
    // Data da alteração da operação (50-57)
    .adicionar(
      formatarData(registro.dataAlteracaoOperacao, 'dataAlteracaoOperacao'),
      8,
      'dataAlteracaoOperacao'
    )
    // Espaços (58-61)
    .adicionar(formatarEspacos(4), 4, 'espacosReservados1')
    // Novo código IBGE do município, sem dígito verificador (62-68)
    .adicionar(
      formatarNumerico(apenasDigitos(registro.novoIbgeCliente), 7, 'novoIbgeCliente'),
      7,
      'novoIbgeCliente'
    )
    // Espaços (69-83)
    .adicionar(formatarEspacos(15), 15, 'espacosReservados2')
    // Código do público-alvo (84-85)
    .adicionar(
      formatarNumerico(parametros.codigoTipoPublicoAlvo, 2, 'codigoTipoPublicoAlvo'),
      2,
      'codigoTipoPublicoAlvo'
    )
    // Novo valor da renda mensal do mutuário (86-102)
    .adicionar(formatarMoeda(registro.novoValorRenda, 17, 'novoValorRenda'), 17, 'novoValorRenda')
    // Espaços (103-129)
    .adicionar(formatarEspacos(27), 27, 'espacosReservados3')
    // Código do programa de crédito (130-133)
    .adicionar(
      formatarNumerico(parametros.codigoTipoProgramaCredito, 4, 'codigoTipoProgramaCredito'),
      4,
      'codigoTipoProgramaCredito'
    )
    // Espaços (134-141)
    .adicionar(formatarEspacos(8), 8, 'espacosReservados4')
    // Data de vencimento da operação (142-149)
    .adicionar(
      formatarData(registro.dataVencimentoOperacao, 'dataVencimentoOperacao'),
      8,
      'dataVencimentoOperacao'
    )
    // Espaços (150-211)
    .adicionar(formatarEspacos(62), 62, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 11 - DETALHE (CANCELAMENTO DE OPERAÇÃO PELO AGENTE) (manual §13.1). */
export function montarDetalheCancelamento(
  registro: DetalheCancelamento,
  noSequencialRegistro: number
): string {
  const builder = new LayoutLineBuilder(rotuloContexto(registro));

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "11" (8-9)
    .adicionar(TIPO_REGISTRO_CANCELAMENTO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito (10-29)
    .adicionar(formatarAlfanumerico(registro.idAcordo, 20, 'idAcordo'), 20, 'idAcordo')
    // Data de cancelamento da operação (30-37)
    .adicionar(
      formatarData(registro.dataCancelamentoOperacao, 'dataCancelamentoOperacao'),
      8,
      'dataCancelamentoOperacao'
    )
    // Espaços (38-211)
    .adicionar(formatarEspacos(174), 174, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 12 - DETALHE (LIQUIDAÇÃO DE OPERAÇÃO) (manual §13.1). */
export function montarDetalheLiquidacao(
  registro: DetalheLiquidacao,
  noSequencialRegistro: number
): string {
  const builder = new LayoutLineBuilder(rotuloContexto(registro));

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "12" (8-9)
    .adicionar(TIPO_REGISTRO_LIQUIDACAO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito (10-29)
    .adicionar(formatarAlfanumerico(registro.idAcordo, 20, 'idAcordo'), 20, 'idAcordo')
    // Data de liquidação da operação (30-37)
    .adicionar(
      formatarData(registro.dataLiquidacaoOperacao, 'dataLiquidacaoOperacao'),
      8,
      'dataLiquidacaoOperacao'
    )
    // Campo em branco (38-57)
    .adicionar(formatarEspacos(20), 20, 'campoEmBranco')
    // Espaços (58-211)
    .adicionar(formatarEspacos(154), 154, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** 99 - TRAILER (manual §13.1). */
export function montarTrailer(
  noSequencialRegistro: number,
  quantidadeTotalRegistros: number
): string {
  const builder = new LayoutLineBuilder('TRAILER');

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "99" (8-9)
    .adicionar(TIPO_REGISTRO_TRAILER, 2, 'codigoTipoRegistro')
    // Quantidade de registros no arquivo, inclusive header e trailer (10-16)
    .adicionar(
      formatarNumerico(quantidadeTotalRegistros, 7, 'quantidadeRegistros'),
      7,
      'quantidadeRegistros'
    )
    // Espaços (17-211)
    .adicionar(formatarEspacos(195), 195, 'espacosFinais');

  return builder.build(TAMANHO_LINHA);
}

/** Despacha o registro do CSV para o montador do seu tipo. */
export function montarDetalhe(
  registro: RegistroDetalhe,
  noSequencialRegistro: number,
  parametros: ParametrosRemessa
): string {
  switch (registro.tipoRegistro) {
    case '03':
      return montarDetalheFormalizacao(registro, noSequencialRegistro, parametros);
    case '04':
      return montarDetalheLiberacao(registro, noSequencialRegistro);
    case '05':
      return montarDetalheSaldo(registro, noSequencialRegistro);
    case '10':
      return montarDetalheAlteracao(registro, noSequencialRegistro, parametros);
    case '11':
      return montarDetalheCancelamento(registro, noSequencialRegistro);
    case '12':
      return montarDetalheLiquidacao(registro, noSequencialRegistro);
    default: {
      const tipoDesconhecido = (registro as RegistroDetalhe).tipoRegistro;
      throw new ErroGeracaoArquivo(`Tipo de registro sem montador implementado: "${tipoDesconhecido}"`);
    }
  }
}

function rotuloContexto(registro: RegistroDetalhe): string {
  return (
    `${registro.tipoRegistro} ${DESCRICAO_TIPO_DETALHE[registro.tipoRegistro]} ` +
    `(linha CSV ${registro.linhaCsv}, idAcordo=${registro.idAcordo})`
  );
}
