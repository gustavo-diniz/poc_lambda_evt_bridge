'use strict';

const { parse } = require('csv-parse/sync');

const SEPARADOR = process.env.CSV_SEPARADOR || ';';

/**
 * Converte o conteúdo bruto do CSV FGO em array de objetos normalizados.
 *
 * Colunas esperadas (separadas por ;):
 *   tipoProduto;idAcordo;ibgeCliente;cpf;dataAcordo;dataVencimentoOperacao;
 *   valorOperacaoCredito;valorSubsidioCredito;valorCondicaoEspecial;
 *   cpfQualificador;numeroReservaPreValidacao;valor;motivo;motivo_erro;arquivoOrigem
 */
function parsearCsv(conteudo, arquivoOrigem) {
  const linhas = parse(conteudo, {
    delimiter: SEPARADOR,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  return linhas.map((linha) => ({
    tipoProduto:               String(linha['tipoProduto'] || '').trim(),
    idAcordo:                  Number(linha['idAcordo'] || 0),
    ibgeCliente:               String(linha['ibgeCliente'] || '').trim(),
    cpf:                       normalizarCpf(linha['cpf']),
    dataAcordo:                String(linha['dataAcordo'] || '').trim(),
    dataVencimentoOperacao:    String(linha['dataVencimentoOperacao'] || '').trim(),
    valorOperacaoCredito:      normalizarDecimal(linha['valorOperacaoCredito']),
    valorSubsidioCredito:      normalizarDecimal(linha['valorSubsidioCredito']),
    valorCondicaoEspecial:     normalizarDecimal(linha['valorCondicaoEspecial']),
    cpfQualificador:           normalizarCpf(linha['cpfQualificador']),
    numeroReservaPreValidacao: String(linha['numeroReservaPreValidacao'] || '').trim() || null,
    valor:                     normalizarDecimal(linha['valor']),
    motivo:                    String(linha['motivo'] || '').trim() || null,
    motivoErro:                String(linha['motivo_erro'] || '').trim() || null,
    arquivoOrigem,
  }));
}

function normalizarCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

function normalizarDecimal(valor) {
  const str = String(valor || '0').replace(',', '.');
  const num = Number.parseFloat(str);
  return Number.isNaN(num) ? 0 : num;
}

module.exports = { parsearCsv };
