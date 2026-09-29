'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  apenasDigitos,
  ErroGeracaoArquivo,
  formatarAlfanumerico,
  formatarData,
  formatarEspacos,
  formatarMoeda,
  formatarNumerico,
} from '../formatadores.js';
import { LayoutLineBuilder } from '../layout-line-builder.js';
import {
  NOME_ARQUIVO_RETORNO_450R,
  TAMANHO_LINHA_450R,
  TIPO_REGISTRO_450R_HEADER,
  TIPO_REGISTRO_450R_MOVIMENTACAO,
  TIPO_REGISTRO_450R_TRAILER,
  TIPOS_MOVIMENTACAO,
  VERSAO_LEIAUTE_450R,
  type TipoMovimentacao,
} from './tipos-450r.js';

const TERMINADOR_LINHA = '\r\n';
const ENCODING_ARQUIVO: BufferEncoding = 'latin1';

/** Dados de entrada de uma movimentação (valores em reais, datas em qualquer formato aceito por `formatarData`). */
export interface MovimentacaoEntrada {
  codigoOperacaoAgente: string;
  codigoTipoMovimentacao: TipoMovimentacao | string;
  /** Vazio/"0" gera "00000000" (natureza 3). */
  dataMovimentacaoFinanceira?: string | Date | null;
  dataFatoGerador: string | Date;
  valorNominalFatoGerador: number | string;
  valorAtualizacaoMonetaria?: number | string;
  valorIssqn?: number | string;
  valorLiquidoMovimentado: number | string;
  noSequencialRegistroCausador: number;
}

export interface ParametrosRetorno450R {
  codigoAgenteFinanceiro: number;
  codigoFundoGarantidor: number;
  numeroSequencialRemessa: number;
  cnpjAgenteFinanceiro: string;
}

/** 01 - HEADER (manual §13.5). */
export function montarHeader450R(parametros: ParametrosRetorno450R): string {
  const builder = new LayoutLineBuilder('HEADER 450R');

  builder
    // Nº sequencial do registro "0000001" (1-7)
    .adicionar(formatarNumerico(1, 7, 'noSequencialRegistro'), 7, 'noSequencialRegistro')
    // Código do tipo do registro "01" (8-9)
    .adicionar(TIPO_REGISTRO_450R_HEADER, 2, 'codigoTipoRegistro')
    // Nome do Arquivo Retorno "GFGF450R" (10-17)
    .adicionar(
      formatarAlfanumerico(NOME_ARQUIVO_RETORNO_450R, 8, 'nomeArquivoRetorno'),
      8,
      'nomeArquivoRetorno'
    )
    // Versão do leiaute "20170331" (18-25)
    .adicionar(formatarNumerico(VERSAO_LEIAUTE_450R, 8, 'versaoLeiaute'), 8, 'versaoLeiaute')
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
    // Nº sequencial da Remessa à qual se refere este Retorno (32-35)
    .adicionar(
      formatarNumerico(parametros.numeroSequencialRemessa, 4, 'numeroSequencialRemessa'),
      4,
      'numeroSequencialRemessa'
    )
    // Espaços (36-55)
    .adicionar(formatarEspacos(20), 20, 'espacos')
    // CNPJ do Agente Financeiro (56-69)
    .adicionar(
      formatarNumerico(apenasDigitos(parametros.cnpjAgenteFinanceiro), 14, 'cnpjAgenteFinanceiro'),
      14,
      'cnpjAgenteFinanceiro'
    )
    // Espaços (70-211)
    .adicionar(formatarEspacos(142), 142, 'espacosFinais');

  return builder.build(TAMANHO_LINHA_450R);
}

/** 97 - DETALHE (MOVIMENTAÇÃO FINANCEIRA) (manual §13.5). */
export function montarMovimentacao450R(
  registro: MovimentacaoEntrada,
  noSequencialRegistro: number
): string {
  const contexto = `97 MOVIMENTAÇÃO FINANCEIRA (seq ${noSequencialRegistro}, operação=${registro.codigoOperacaoAgente})`;
  const builder = new LayoutLineBuilder(contexto);

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "97" (8-9)
    .adicionar(TIPO_REGISTRO_450R_MOVIMENTACAO, 2, 'codigoTipoRegistro')
    // Código identificador da operação de crédito no âmbito do Agente (10-29)
    .adicionar(
      formatarAlfanumerico(registro.codigoOperacaoAgente, 20, 'codigoOperacaoAgente'),
      20,
      'codigoOperacaoAgente'
    )
    // Código do tipo de movimentação (30-31)
    .adicionar(
      formatarNumerico(registro.codigoTipoMovimentacao, 2, 'codigoTipoMovimentacao'),
      2,
      'codigoTipoMovimentacao'
    )
    // Data da movimentação financeira; "00000000" para natureza 3 (32-39)
    .adicionar(
      formatarData(registro.dataMovimentacaoFinanceira, 'dataMovimentacaoFinanceira', {
        permitirZerado: true,
      }),
      8,
      'dataMovimentacaoFinanceira'
    )
    // Data do fato gerador da movimentação (40-47)
    .adicionar(formatarData(registro.dataFatoGerador, 'dataFatoGerador'), 8, 'dataFatoGerador')
    // Valor nominal na data do fato gerador (48-64)
    .adicionar(
      formatarMoeda(registro.valorNominalFatoGerador, 17, 'valorNominalFatoGerador'),
      17,
      'valorNominalFatoGerador'
    )
    // Valor da atualização monetária (65-81)
    .adicionar(
      formatarMoeda(registro.valorAtualizacaoMonetaria ?? 0, 17, 'valorAtualizacaoMonetaria'),
      17,
      'valorAtualizacaoMonetaria'
    )
    // Valor do ISSQN (82-98)
    .adicionar(formatarMoeda(registro.valorIssqn ?? 0, 17, 'valorIssqn'), 17, 'valorIssqn')
    // Valor líquido movimentado (99-115)
    .adicionar(
      formatarMoeda(registro.valorLiquidoMovimentado, 17, 'valorLiquidoMovimentado'),
      17,
      'valorLiquidoMovimentado'
    )
    // Nº sequencial do registro causador da movimentação (116-122)
    .adicionar(
      formatarNumerico(registro.noSequencialRegistroCausador, 7, 'noSequencialRegistroCausador'),
      7,
      'noSequencialRegistroCausador'
    )
    // Espaços (123-211)
    .adicionar(formatarEspacos(89), 89, 'espacosFinais');

  return builder.build(TAMANHO_LINHA_450R);
}

/** 99 - TRAILER (manual §13.5). */
export function montarTrailer450R(
  noSequencialRegistro: number,
  quantidadeTotalRegistros: number
): string {
  const builder = new LayoutLineBuilder('TRAILER 450R');

  builder
    // Nº sequencial do registro (1-7)
    .adicionar(
      formatarNumerico(noSequencialRegistro, 7, 'noSequencialRegistro'),
      7,
      'noSequencialRegistro'
    )
    // Código do tipo do registro "99" (8-9)
    .adicionar(TIPO_REGISTRO_450R_TRAILER, 2, 'codigoTipoRegistro')
    // Quantidade de registros no arquivo, inclusive header e trailer (10-16)
    .adicionar(
      formatarNumerico(quantidadeTotalRegistros, 7, 'quantidadeRegistros'),
      7,
      'quantidadeRegistros'
    )
    // Espaços (17-211)
    .adicionar(formatarEspacos(195), 195, 'espacosFinais');

  return builder.build(TAMANHO_LINHA_450R);
}

/** Monta o conteúdo completo do GFGF450R (header + movimentações + trailer). */
export function gerarConteudoRetorno450R(
  movimentacoes: MovimentacaoEntrada[],
  parametros: ParametrosRetorno450R
): string {
  if (movimentacoes.length === 0) {
    throw new ErroGeracaoArquivo('Nenhuma movimentação informada para gerar o GFGF450R.');
  }

  const linhas: string[] = [montarHeader450R(parametros)];

  let noSequencialRegistro = 1;
  for (const movimentacao of movimentacoes) {
    noSequencialRegistro += 1;
    linhas.push(montarMovimentacao450R(movimentacao, noSequencialRegistro));
  }

  noSequencialRegistro += 1;
  linhas.push(montarTrailer450R(noSequencialRegistro, linhas.length + 1));

  return linhas.join(TERMINADOR_LINHA) + TERMINADOR_LINHA;
}

// ---------------------------------------------------------------------------
// Gerador de arquivo FAKE (dados fictícios, determinísticos por semente)
// ---------------------------------------------------------------------------

export interface OpcoesRetorno450RFake extends Partial<ParametrosRetorno450R> {
  /** Quantidade de registros 97 a gerar (padrão 10). */
  quantidadeMovimentacoes?: number;
  /** Semente do gerador pseudoaleatório — a mesma semente gera o mesmo arquivo (padrão 450). */
  semente?: number;
  /** Data-base das movimentações (padrão hoje). */
  dataBase?: Date;
  diretorioSaida?: string;
  nomeArquivoFisico?: string;
}

export interface ResultadoRetorno450RFake {
  caminhoArquivo: string;
  conteudo: string;
  movimentacoes: MovimentacaoEntrada[];
  totalLinhas: number;
}

/** LCG simples — suficiente para dados fake reproduzíveis, sem dependência externa. */
function criarAleatorio(semente: number): () => number {
  let estado = semente >>> 0 || 1;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

function somarDias(data: Date, dias: number): Date {
  const copia = new Date(data.getTime());
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Gera movimentações fictícias coerentes com o §14.16.
 * Os 7 primeiros registros cobrem os 7 tipos na ordem 01..07 (natureza 3 sai com data de
 * movimentação zerada); a partir do 8º o tipo é sorteado e o idAcordo repete um já usado,
 * simulando a mesma operação aparecendo mais de uma vez no mesmo retorno.
 */
export function gerarMovimentacoesFake(opcoes: OpcoesRetorno450RFake = {}): MovimentacaoEntrada[] {
  const quantidade = opcoes.quantidadeMovimentacoes ?? 10;
  const aleatorio = criarAleatorio(opcoes.semente ?? 450);
  const dataBase = opcoes.dataBase ?? new Date();
  const tipos = Object.keys(TIPOS_MOVIMENTACAO) as TipoMovimentacao[];

  const movimentacoes: MovimentacaoEntrada[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    const cobrindoTabela = i < tipos.length;
    const tipo = cobrindoTabela ? tipos[i]! : tipos[Math.floor(aleatorio() * tipos.length)]!;
    const natureza = TIPOS_MOVIMENTACAO[tipo].natureza;
    const indiceOperacao = cobrindoTabela ? i + 1 : Math.floor(aleatorio() * tipos.length) + 1;

    const diasAtras = Math.floor(aleatorio() * 60) + 1;
    const dataFatoGerador = somarDias(dataBase, -diasAtras);
    const dataMovimentacao = somarDias(dataFatoGerador, Math.floor(aleatorio() * 10));

    const valorNominal = arredondar2(aleatorio() * 49_000 + 1_000);
    const atualizacao = natureza === '3' ? 0 : arredondar2(valorNominal * aleatorio() * 0.02);
    const issqn = tipo === '03' ? arredondar2(valorNominal * 0.005) : 0;
    const valorLiquido = arredondar2(valorNominal + atualizacao - issqn);

    movimentacoes.push({
      codigoOperacaoAgente: `DIGIO${String(100000 + indiceOperacao).padStart(6, '0')}`,
      codigoTipoMovimentacao: tipo,
      dataMovimentacaoFinanceira: natureza === '3' ? null : dataMovimentacao,
      dataFatoGerador,
      valorNominalFatoGerador: valorNominal,
      valorAtualizacaoMonetaria: atualizacao,
      valorIssqn: issqn,
      valorLiquidoMovimentado: valorLiquido,
      noSequencialRegistroCausador: i + 2,
    });
  }
  return movimentacoes;
}

/** Gera e grava um GFGF450R fictício (latin1, CRLF, 211 colunas por linha). */
export function gerarArquivoRetorno450RFake(
  opcoes: OpcoesRetorno450RFake = {}
): ResultadoRetorno450RFake {
  const parametros: ParametrosRetorno450R = {
    codigoAgenteFinanceiro: opcoes.codigoAgenteFinanceiro ?? 59,
    codigoFundoGarantidor: opcoes.codigoFundoGarantidor ?? 10,
    numeroSequencialRemessa: opcoes.numeroSequencialRemessa ?? 1,
    cnpjAgenteFinanceiro: opcoes.cnpjAgenteFinanceiro ?? '00000000000191',
  };

  const movimentacoes = gerarMovimentacoesFake(opcoes);
  const conteudo = gerarConteudoRetorno450R(movimentacoes, parametros);

  const diretorioSaida = opcoes.diretorioSaida ?? './saida';
  fs.mkdirSync(diretorioSaida, { recursive: true });

  const caminhoArquivo = path.join(diretorioSaida, opcoes.nomeArquivoFisico ?? 'GFGF450R.txt');
  fs.writeFileSync(caminhoArquivo, conteudo, { encoding: ENCODING_ARQUIVO });

  return { caminhoArquivo, conteudo, movimentacoes, totalLinhas: movimentacoes.length + 2 };
}
