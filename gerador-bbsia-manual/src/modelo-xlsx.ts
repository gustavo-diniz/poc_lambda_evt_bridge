'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';

import ExcelJS from 'exceljs';

import { TIPOS_DETALHE_SUPORTADOS } from './tipos.js';

/**
 * Gera entrada/modelo-remessa.xlsx: aba "remessa" com as colunas já formatadas
 * (códigos como Texto, valores como número, datas como data) e as linhas do
 * exemplo-remessa.csv, e aba "instrucoes" com o que cada coluna espera.
 */

type Formato = 'codigo' | 'data' | 'moeda' | 'indice';

interface Coluna {
  nome: string;
  formato: Formato;
  tipos: string;
  obrigatoria: string;
  observacao: string;
}

const COLUNAS: Coluna[] = [
  { nome: 'tipoRegistro', formato: 'codigo', tipos: 'todos', obrigatoria: 'todos', observacao: TIPOS_DETALHE_SUPORTADOS.join(', ') },
  { nome: 'idAcordo', formato: 'codigo', tipos: 'todos', obrigatoria: 'todos', observacao: 'Até 20 caracteres. Manter como Texto.' },
  { nome: 'ibgeCliente', formato: 'codigo', tipos: '03', obrigatoria: '03', observacao: 'IBGE sem dígito verificador (7 dígitos)' },
  { nome: 'cpf', formato: 'codigo', tipos: '03', obrigatoria: '03', observacao: 'Só dígitos ou com máscara' },
  { nome: 'dataAcordo', formato: 'data', tipos: '03', obrigatoria: '03', observacao: 'Data da formalização' },
  { nome: 'dataVencimentoOperacao', formato: 'data', tipos: '03, 10', obrigatoria: '03, 10', observacao: '' },
  { nome: 'valorOperacaoCredito', formato: 'moeda', tipos: '03', obrigatoria: '03', observacao: 'Em reais' },
  { nome: 'valorRenda', formato: 'moeda', tipos: '03', obrigatoria: '03', observacao: 'Em reais' },
  { nome: 'numeroPreValidacao', formato: 'codigo', tipos: '03', obrigatoria: '03', observacao: 'Nº da pré-validação FGO' },
  { nome: 'valorSubvencao', formato: 'moeda', tipos: '03', obrigatoria: '-', observacao: 'Vazio = zeros' },
  { nome: 'dataLiberacaoCredito', formato: 'data', tipos: '04', obrigatoria: '04', observacao: '' },
  { nome: 'valorLiberacaoCredito', formato: 'moeda', tipos: '04', obrigatoria: '04', observacao: 'Em reais' },
  { nome: 'dataApuracaoSaldos', formato: 'data', tipos: '05', obrigatoria: '05', observacao: '' },
  { nome: 'valorSaldoCapitalNormalidade', formato: 'moeda', tipos: '05', obrigatoria: '05', observacao: 'Em reais' },
  { nome: 'valorSaldoCapitalAtraso', formato: 'moeda', tipos: '05', obrigatoria: '05', observacao: 'Em reais' },
  { nome: 'valorSaldoEncargosNormalidade', formato: 'moeda', tipos: '05', obrigatoria: '05', observacao: 'Em reais' },
  { nome: 'valorSaldoEncargosAtraso', formato: 'moeda', tipos: '05', obrigatoria: '05', observacao: 'Em reais' },
  { nome: 'dataInicioInadimplenciaCapital', formato: 'data', tipos: '05, 06', obrigatoria: '06', observacao: 'No 05, vazio = sem capital em atraso. No 06, igual à do último saldo informado.' },
  { nome: 'indicePerdaEsperada', formato: 'indice', tipos: '05', obrigatoria: '05', observacao: 'Decimal com 6 casas (0,000051). Inteiro é lido no formato bruto do manual.' },
  { nome: 'dataSolicitacaoHonra', formato: 'data', tipos: '06', obrigatoria: '06', observacao: 'Dia útil; igual à data de entrega da Remessa' },
  { nome: 'valorSaldoBaseHonra', formato: 'moeda', tipos: '06', obrigatoria: '06', observacao: 'Saldo-base para cálculo do valor a ser honrado, em reais' },
  { nome: 'dataRecuperacao', formato: 'data', tipos: '07, 08', obrigatoria: '07, 08', observacao: 'No 07, data do recebimento. No 08, data da recuperação a cancelar.' },
  { nome: 'valorRecuperacao', formato: 'moeda', tipos: '07, 08', obrigatoria: '07, 08', observacao: 'No 07, valor recebido do cliente. No 08, valor recuperado a cancelar.' },
  { nome: 'dataCancelamentoRecuperacao', formato: 'data', tipos: '08', obrigatoria: '08', observacao: 'Data do cancelamento' },
  { nome: 'dataDevolucaoHonra', formato: 'data', tipos: '09', obrigatoria: '09', observacao: 'Data da devolução do valor honrado' },
  { nome: 'novoIdAcordo', formato: 'codigo', tipos: '10', obrigatoria: '-', observacao: 'Vazio = repete o idAcordo' },
  { nome: 'dataAlteracaoOperacao', formato: 'data', tipos: '10', obrigatoria: '10', observacao: '' },
  { nome: 'novoIbgeCliente', formato: 'codigo', tipos: '10', obrigatoria: '10', observacao: 'Sem alteração = repita o atual' },
  { nome: 'novoValorRenda', formato: 'moeda', tipos: '10', obrigatoria: '10', observacao: 'Sem alteração = repita o atual' },
  { nome: 'dataCancelamentoOperacao', formato: 'data', tipos: '11', obrigatoria: '11', observacao: '' },
  { nome: 'dataLiquidacaoOperacao', formato: 'data', tipos: '12', obrigatoria: '12', observacao: '' },
  { nome: 'dataReativacaoOperacao', formato: 'data', tipos: '13', obrigatoria: '13', observacao: 'Até 40 dias após a liquidação' },
];

const FORMATO_EXCEL: Record<Formato, string> = {
  codigo: '@',
  data: 'dd/mm/yyyy',
  moeda: '#,##0.00',
  indice: '0.000000',
};

const DESCRICAO_FORMATO: Record<Formato, string> = {
  codigo: 'Texto',
  data: 'Data',
  moeda: 'Número (2 casas)',
  indice: 'Número (6 casas)',
};

type Celula = string | number | Date | null;

const d = (dia: number, mes: number, ano: number): Date => new Date(Date.UTC(ano, mes - 1, dia));

/** Mesmas linhas de entrada/exemplo-remessa.csv, já tipadas. */
const EXEMPLOS: Record<string, Celula>[] = [
  { tipoRegistro: '03', idAcordo: '1922951', ibgeCliente: '170070', cpf: '00753760169', dataAcordo: d(21, 6, 2026), dataVencimentoOperacao: d(21, 7, 2026), valorOperacaoCredito: 2594.84, valorRenda: 2700, numeroPreValidacao: '191', valorSubvencao: 0 },
  { tipoRegistro: '03', idAcordo: '1922952', ibgeCliente: '355030', cpf: '12345678909', dataAcordo: d(22, 6, 2026), dataVencimentoOperacao: d(22, 7, 2026), valorOperacaoCredito: 1800, valorRenda: 3500, numeroPreValidacao: '192', valorSubvencao: 0 },
  { tipoRegistro: '04', idAcordo: '1922951', dataLiberacaoCredito: d(21, 6, 2026), valorLiberacaoCredito: 2594.84 },
  { tipoRegistro: '04', idAcordo: '1922952', dataLiberacaoCredito: d(22, 6, 2026), valorLiberacaoCredito: 1800 },
  { tipoRegistro: '05', idAcordo: '1922951', dataApuracaoSaldos: d(30, 6, 2026), valorSaldoCapitalNormalidade: 2594.84, valorSaldoCapitalAtraso: 0, valorSaldoEncargosNormalidade: 35.1, valorSaldoEncargosAtraso: 0, indicePerdaEsperada: 0.000051 },
  { tipoRegistro: '05', idAcordo: '1922952', dataApuracaoSaldos: d(30, 6, 2026), valorSaldoCapitalNormalidade: 1200, valorSaldoCapitalAtraso: 600, valorSaldoEncargosNormalidade: 40, valorSaldoEncargosAtraso: 15.25, dataInicioInadimplenciaCapital: d(15, 6, 2026), indicePerdaEsperada: 0.0125 },
  { tipoRegistro: '10', idAcordo: '1922951', dataVencimentoOperacao: d(21, 8, 2026), dataAlteracaoOperacao: d(25, 6, 2026), novoIbgeCliente: '170070', novoValorRenda: 3100 },
  { tipoRegistro: '10', idAcordo: '1922952', dataVencimentoOperacao: d(22, 7, 2026), novoIdAcordo: '1922952-A', dataAlteracaoOperacao: d(26, 6, 2026), novoIbgeCliente: '355030', novoValorRenda: 3500 },
  { tipoRegistro: '11', idAcordo: '1922953', dataCancelamentoOperacao: d(27, 6, 2026) },
  { tipoRegistro: '12', idAcordo: '1922954', dataLiquidacaoOperacao: d(28, 6, 2026) },
  { tipoRegistro: '06', idAcordo: '1922955', dataInicioInadimplenciaCapital: d(2, 3, 2026), dataSolicitacaoHonra: d(15, 6, 2026), valorSaldoBaseHonra: 4321.09 },
  { tipoRegistro: '07', idAcordo: '1922956', dataRecuperacao: d(22, 6, 2026), valorRecuperacao: 150.5 },
  { tipoRegistro: '08', idAcordo: '1922956', dataRecuperacao: d(22, 6, 2026), valorRecuperacao: 150.5, dataCancelamentoRecuperacao: d(29, 6, 2026) },
  { tipoRegistro: '09', idAcordo: '1922957', dataDevolucaoHonra: d(23, 6, 2026) },
  { tipoRegistro: '13', idAcordo: '1922954', dataReativacaoOperacao: d(30, 6, 2026) },
];

/** Linhas pré-formatadas além dos exemplos, para quem for preencher. */
const LINHAS_FORMATADAS = 500;

async function main(): Promise<void> {
  const destino = process.argv[2] ?? path.join('entrada', 'modelo-remessa.xlsx');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'gerador-bbsia-manual';

  const remessa = workbook.addWorksheet('remessa', { views: [{ state: 'frozen', ySplit: 1 }] });
  remessa.columns = COLUNAS.map((coluna) => ({
    header: coluna.nome,
    key: coluna.nome,
    width: Math.max(coluna.nome.length + 2, 14),
    style: { numFmt: FORMATO_EXCEL[coluna.formato] },
  }));
  remessa.getRow(1).font = { bold: true };
  remessa.getRow(1).eachCell((celula) => {
    celula.numFmt = '@';
  });

  for (const exemplo of EXEMPLOS) {
    remessa.addRow(exemplo);
  }

  const ultimaLinha = EXEMPLOS.length + 1 + LINHAS_FORMATADAS;
  for (let linha = 2; linha <= ultimaLinha; linha += 1) {
    COLUNAS.forEach((coluna, indice) => {
      const celula = remessa.getCell(linha, indice + 1);
      celula.numFmt = FORMATO_EXCEL[coluna.formato];
      if (coluna.nome === 'tipoRegistro') {
        celula.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${TIPOS_DETALHE_SUPORTADOS.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'tipoRegistro inválido',
          error: `Use ${TIPOS_DETALHE_SUPORTADOS.join(', ')}.`,
        };
      }
    });
  }

  const instrucoes = workbook.addWorksheet('instrucoes');
  instrucoes.columns = [
    { header: 'Coluna', key: 'nome', width: 32 },
    { header: 'Formato da célula', key: 'formato', width: 20 },
    { header: 'Usada nos tipos', key: 'tipos', width: 16 },
    { header: 'Obrigatória nos tipos', key: 'obrigatoria', width: 22 },
    { header: 'Observação', key: 'observacao', width: 70 },
  ];
  instrucoes.getRow(1).font = { bold: true };
  for (const coluna of COLUNAS) {
    instrucoes.addRow({ ...coluna, formato: DESCRICAO_FORMATO[coluna.formato] });
  }
  instrucoes.addRow({});
  for (const aviso of [
    'Preencha só a aba "remessa" (o gerador lê a primeira aba). Cada linha preenche apenas as colunas do seu tipo.',
    'Colunas de código (Texto) não podem virar número: o Excel corta zeros à esquerda e perde dígitos acima de 15.',
    'Valores em reais: digite o número normalmente (2700 ou 2594,84). A formatação de milhar é só visual.',
    'Salve sempre como .xlsx. Não exporte para CSV: o CSV do Excel grava 2700 como "2.700", que é ambíguo.',
  ]) {
    instrucoes.addRow({ nome: aviso });
  }

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await workbook.xlsx.writeFile(destino);
  console.log(`Modelo gerado: ${destino}`);
}

main().catch((erro: unknown) => {
  console.error('\n[ERRO]', erro);
  process.exit(1);
});
