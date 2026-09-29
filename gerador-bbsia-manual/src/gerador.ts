'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ParametrosRemessa } from './config.js';
import { lerCsv, mapearRegistros, type LinhaCsv } from './csv.js';
import { ErroGeracaoArquivo } from './formatadores.js';
import { montarDetalhe, montarHeader, montarTrailer, TAMANHO_LINHA } from './registros.js';
import { TIPOS_DETALHE_SUPORTADOS, type RegistroDetalhe, type TipoDetalhe } from './tipos.js';
import { lerXlsx } from './xlsx.js';

const TERMINADOR_LINHA = '\r\n';

/** O arquivo é gravado em latin1, como espera o BB SIA. */
const ENCODING_ARQUIVO: BufferEncoding = 'latin1';

export interface OpcoesGeracao {
  /** CSV ou planilha .xlsx — o leitor é escolhido pela extensão. */
  caminhoEntrada: string;
  parametros: ParametrosRemessa;
  separadorCsv?: string;
  /** Só para .xlsx: aba a ler (padrão: a primeira). */
  nomeAba?: string;
  /** Agrupa os detalhes na ordem numérica do tipo (03 → 04 → … → 13) em vez de preservar a ordem da entrada. */
  ordenarPorTipo?: boolean;
}

export interface ResultadoGeracao {
  caminhoArquivo: string;
  conteudo: string;
  totalLinhas: number;
  totalDetalhes: number;
  totaisPorTipo: Record<TipoDetalhe, number>;
}

export function gerarConteudoRemessa(
  registros: RegistroDetalhe[],
  parametros: ParametrosRemessa
): string {
  if (registros.length === 0) {
    throw new ErroGeracaoArquivo('Nenhum registro-detalhe encontrado no CSV para gerar a Remessa.');
  }

  const linhas: string[] = [montarHeader(parametros)];

  let noSequencialRegistro = 1;
  for (const registro of registros) {
    noSequencialRegistro += 1;
    linhas.push(montarDetalhe(registro, noSequencialRegistro, parametros));
  }

  noSequencialRegistro += 1;
  const quantidadeTotalRegistros = linhas.length + 1;
  linhas.push(montarTrailer(noSequencialRegistro, quantidadeTotalRegistros));

  validarArquivo(linhas);

  return linhas.join(TERMINADOR_LINHA) + TERMINADOR_LINHA;
}

export async function gerarArquivoRemessa(opcoes: OpcoesGeracao): Promise<ResultadoGeracao> {
  const linhasEntrada = await lerEntrada(opcoes);
  let registros = mapearRegistros(linhasEntrada);

  if (opcoes.ordenarPorTipo) {
    registros = [...registros].sort(
      (a, b) =>
        TIPOS_DETALHE_SUPORTADOS.indexOf(a.tipoRegistro) -
        TIPOS_DETALHE_SUPORTADOS.indexOf(b.tipoRegistro)
    );
  }

  const conteudo = gerarConteudoRemessa(registros, opcoes.parametros);

  const diretorioSaida = opcoes.parametros.diretorioSaida;
  fs.mkdirSync(diretorioSaida, { recursive: true });

  const caminhoArquivo = path.join(diretorioSaida, opcoes.parametros.nomeArquivoFisico);
  fs.writeFileSync(caminhoArquivo, conteudo, { encoding: ENCODING_ARQUIVO });

  const totaisPorTipo = contarPorTipo(registros);

  return {
    caminhoArquivo,
    conteudo,
    totalLinhas: registros.length + 2,
    totalDetalhes: registros.length,
    totaisPorTipo,
  };
}

async function lerEntrada(opcoes: OpcoesGeracao): Promise<LinhaCsv[]> {
  const extensao = path.extname(opcoes.caminhoEntrada).toLowerCase();

  if (extensao === '.xlsx') {
    return lerXlsx(opcoes.caminhoEntrada, opcoes.nomeAba);
  }
  if (extensao === '.xls' || extensao === '.xlsm' || extensao === '.xlsb' || extensao === '.ods') {
    throw new ErroGeracaoArquivo(
      `Formato "${extensao}" não suportado. No Excel, use "Salvar como" > "Pasta de Trabalho do Excel (*.xlsx)".`
    );
  }
  if (opcoes.nomeAba) {
    console.warn('[WARN] --aba só vale para planilha .xlsx e será ignorada.');
  }
  return lerCsv(opcoes.caminhoEntrada, opcoes.separadorCsv);
}

function contarPorTipo(registros: RegistroDetalhe[]): Record<TipoDetalhe, number> {
  const totais = Object.fromEntries(
    TIPOS_DETALHE_SUPORTADOS.map((tipo) => [tipo, 0])
  ) as Record<TipoDetalhe, number>;

  for (const registro of registros) {
    totais[registro.tipoRegistro] += 1;
  }
  return totais;
}

/** Rede de segurança final: toda linha tem 211 colunas e a sequência é contínua a partir de 1. */
function validarArquivo(linhas: string[]): void {
  linhas.forEach((linha, indice) => {
    if (linha.length !== TAMANHO_LINHA) {
      throw new ErroGeracaoArquivo(
        `Linha ${indice + 1} do arquivo ficou com ${linha.length} caracteres (esperado ${TAMANHO_LINHA}).`
      );
    }

    const sequencial = Number(linha.substring(0, 7));
    if (sequencial !== indice + 1) {
      throw new ErroGeracaoArquivo(
        `Linha ${indice + 1} do arquivo tem nº sequencial "${linha.substring(0, 7)}" fora de sequência.`
      );
    }
  });
}
