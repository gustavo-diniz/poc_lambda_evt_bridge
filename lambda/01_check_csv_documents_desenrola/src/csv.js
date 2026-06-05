const { parse } = require('csv-parse/sync');

// Separador | pois os valores monetários usam vírgula como decimal (2000,00)
const SEPARADOR = process.env.CSV_SEPARADOR || '|';

/**
 * Converte o conteúdo bruto do CSV em array de objetos normalizados.
 * Entrada esperada:
 *   CPF         | VLR_ACORDO_DIGIO | VLR_DIVIDA_ATUALIZADA
 *   35264914885 | 2000,00          | 5000,00
 *
 * Saída:
 *   [{ cpf: "35264914885", vlr_acordo_digio: "2000,00", vlr_divida_atualizada: "5000,00" }]
 */
function parsearCsv(conteudo, arquivoOrigem) {
  const linhas = parse(conteudo, {
    delimiter: SEPARADOR,
    columns: true,        // usa a primeira linha como cabeçalho
    skip_empty_lines: true,
    trim: true,           // remove espaços em branco ao redor dos valores
    relax_column_count: true,
  });

  return linhas.map((linha) => ({
    cpf: normalizarCpf(linha['CPF']),
    vlr_acordo_digio: normalizarDecimal(linha['VLR_ACORDO_DIGIO']),
    vlr_divida_atualizada: normalizarDecimal(linha['VLR_DIVIDA_ATUALIZADA']),
    arquivo_origem: arquivoOrigem,
  }));
}

/**
 * Remove qualquer caractere não numérico do CPF.
 * Garante que chegue sem pontos ou traços ao SQS.
 */
function normalizarCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

/**
 * Converte decimal brasileiro (vírgula) para formato SQL (ponto).
 * Ex: "800,00" → 800.00
 */
function normalizarDecimal(valor) {
  return Number.parseFloat(String(valor || '0').replace(',', '.'));
}

module.exports = { parsearCsv };
