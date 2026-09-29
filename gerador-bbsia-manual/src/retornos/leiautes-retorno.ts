'use strict';

import {
  CONDICAO_ESPECIAL,
  FINALIDADE_CREDITO,
  FONTE_RECURSOS,
  MODALIDADE_CREDITO,
  MOTIVO_ENCERRAMENTO,
  MOTIVO_IMPUGNACAO,
  NATUREZA_MOVIMENTACAO,
  PROGRAMA_CREDITO,
  PUBLICO_ALVO,
  REJEICAO_REGISTRO,
  REJEICAO_REMESSA,
  SITUACAO_OPERACAO,
  TIPO_CRONOGRAMA,
  TIPO_FORMALIZACAO,
  TIPO_MOVIMENTACAO,
  TIPO_PENDENCIA,
  TIPO_PESSOA,
} from './tabelas-fgo.js';

/**
 * Leiautes dos arquivos de Retorno do FGO (manual §13.2 a §13.6), declarativos:
 * o leitor e a planilha são genéricos e se guiam só por estas definições.
 */

export const TAMANHO_LINHA_RETORNO = 211;

/**
 * Como o campo é interpretado:
 * - alfa: texto (A); codigo: número que é identificador — mantém zeros à esquerda;
 * - inteiro: quantidade/sequencial; data (AAAAMMDD, zeros = vazio); hora (HHMMSS);
 * - moeda: 2 casas implícitas; decimal: `casas` casas implícitas;
 * - espacos / zeros: preenchimento — não vira coluna, só é conferido;
 * - ignorar: o manual manda desconsiderar — não vira coluna nem é conferido.
 */
export type TipoCampo =
  | 'alfa'
  | 'codigo'
  | 'inteiro'
  | 'data'
  | 'hora'
  | 'moeda'
  | 'decimal'
  | 'espacos'
  | 'zeros'
  | 'ignorar';

export interface TabelaCodigos {
  titulo: string;
  codigos: Readonly<Record<number, string>>;
}

export interface CampoRetorno {
  ini: number;
  fim: number;
  tipo: TipoCampo;
  /** Título curto da coluna na planilha. */
  nome: string;
  /** Descrição do manual (vai na nota do cabeçalho da coluna). */
  descricao: string;
  /** Casas decimais implícitas (só para `decimal`). */
  casas?: number;
  /** Tabela de domínio: gera uma coluna extra com a descrição do código. */
  tabela?: TabelaCodigos;
  /** Tipo declarado no manual quando difere do derivado de `tipo`. */
  tipoManual?: 'A' | 'N' | 'M' | 'D' | 'H';
}

export interface LeiauteRegistro {
  tipoRegistro: string;
  titulo: string;
  /** Nome da aba na planilha (até 31 caracteres). */
  aba: string;
  campos: CampoRetorno[];
}

export interface LeiauteArquivoRetorno {
  /** Nome lógico gravado no header, posições 10-17. */
  nome: string;
  titulo: string;
  secaoManual: string;
  /** Header traz o nº sequencial da Remessa (32-35)? */
  temNumeroRemessa: boolean;
  /** Campo do header com a data do arquivo e o que ela significa. */
  dataHeader?: { ini: number; fim: number; significado: string };
  /** Campo do header com a hora do arquivo. */
  horaHeader?: { ini: number; fim: number; significado: string };
  registros: Record<string, LeiauteRegistro>;
}

// --------------------------------------------------------------------------- tabelas

const T_REJEICAO_REMESSA: TabelaCodigos = { titulo: '§14.1', codigos: REJEICAO_REMESSA };
const T_REJEICAO_REGISTRO: TabelaCodigos = { titulo: '§14.2', codigos: REJEICAO_REGISTRO };
const T_TIPO_PESSOA: TabelaCodigos = { titulo: '§14.3', codigos: TIPO_PESSOA };
const T_PUBLICO_ALVO: TabelaCodigos = { titulo: '§14.4', codigos: PUBLICO_ALVO };
const T_MODALIDADE: TabelaCodigos = { titulo: '§14.5', codigos: MODALIDADE_CREDITO };
const T_FINALIDADE: TabelaCodigos = { titulo: '§14.6', codigos: FINALIDADE_CREDITO };
const T_FONTE: TabelaCodigos = { titulo: '§14.7', codigos: FONTE_RECURSOS };
const T_PROGRAMA: TabelaCodigos = { titulo: '§14.8', codigos: PROGRAMA_CREDITO };
const T_CRONOGRAMA: TabelaCodigos = { titulo: '§14.9', codigos: TIPO_CRONOGRAMA };
const T_CONDICAO_ESPECIAL: TabelaCodigos = { titulo: '§14.10', codigos: CONDICAO_ESPECIAL };
const T_FORMALIZACAO: TabelaCodigos = { titulo: '§14.11', codigos: TIPO_FORMALIZACAO };
const T_TIPO_PENDENCIA: TabelaCodigos = { titulo: '§14.12', codigos: TIPO_PENDENCIA };
const T_MOTIVO_ENCERRAMENTO: TabelaCodigos = { titulo: '§14.13', codigos: MOTIVO_ENCERRAMENTO };
const T_SITUACAO: TabelaCodigos = { titulo: '§14.14', codigos: SITUACAO_OPERACAO };
const T_MOTIVO_IMPUGNACAO: TabelaCodigos = { titulo: '§14.15', codigos: MOTIVO_IMPUGNACAO };
const T_TIPO_MOVIMENTACAO: TabelaCodigos = { titulo: '§14.16', codigos: TIPO_MOVIMENTACAO };
const T_NATUREZA: TabelaCodigos = { titulo: '§14.17', codigos: NATUREZA_MOVIMENTACAO };

// --------------------------------------------------------------------------- helpers

function campo(
  ini: number,
  fim: number,
  tipo: TipoCampo,
  nome: string,
  descricao = nome,
  extra: Partial<CampoRetorno> = {}
): CampoRetorno {
  return { ini, fim, tipo, nome, descricao, ...extra };
}

const espacos = (ini: number, fim: number): CampoRetorno =>
  campo(ini, fim, 'espacos', 'Espaços');

const sequencial = campo(1, 7, 'inteiro', 'Nº sequencial do registro');
const tipoRegistro = campo(8, 9, 'codigo', 'Tipo do registro', 'Código do tipo do registro');
const idOperacao = campo(
  10,
  29,
  'alfa',
  'Código da operação (idAcordo)',
  'Código identificador da operação de crédito no âmbito do Agente'
);

function header(nome: string, especificos: CampoRetorno[]): LeiauteRegistro {
  return {
    tipoRegistro: '01',
    titulo: 'HEADER',
    aba: '01 Header',
    campos: [
      sequencial,
      tipoRegistro,
      campo(10, 17, 'alfa', 'Nome do arquivo retorno', `Nome do Arquivo Retorno "${nome}"`),
      campo(18, 25, 'data', 'Versão do leiaute', 'Versão do leiaute "20170331"'),
      campo(26, 28, 'codigo', 'Código do Agente Financeiro', 'Código do Agente Financeiro, atribuído pelo Administrador'),
      campo(29, 31, 'codigo', 'Código do Fundo Garantidor', 'Código do Fundo Garantidor "010"'),
      ...especificos,
    ],
  };
}

const TRAILER: LeiauteRegistro = {
  tipoRegistro: '99',
  titulo: 'TRAILER',
  aba: '99 Trailer',
  campos: [
    sequencial,
    tipoRegistro,
    campo(
      10,
      16,
      'inteiro',
      'Quantidade de registros',
      'Quantidade de registros no arquivo (inclusive header e trailer)'
    ),
    espacos(17, 211),
  ],
};

const numeroRemessaHeader = campo(
  32,
  35,
  'codigo',
  'Nº da Remessa',
  'Nº sequencial da Remessa à qual se refere este Retorno'
);
const cnpjAgente = campo(56, 69, 'codigo', 'CNPJ do Agente Financeiro');
const rejeicaoRegistro = campo(
  209,
  211,
  'codigo',
  'Código de rejeição',
  'Código de rejeição do registro (item 14.2). 0 = dados válidos.',
  { tabela: T_REJEICAO_REGISTRO }
);

function detalhe(tipo: string, titulo: string, aba: string, campos: CampoRetorno[]): LeiauteRegistro {
  return { tipoRegistro: tipo, titulo, aba: `${tipo} ${aba}`, campos: [sequencial, tipoRegistro, ...campos] };
}

// ------------------------------------------ campos da Remessa GFGF0010 (§13.1), ecoados no 2º Retorno

const REMESSA: Record<string, CampoRetorno[]> = {
  '03': [
    idOperacao,
    campo(30, 33, 'codigo', 'Agência contratante', 'Código/prefixo da agência ou unidade contratante da operação'),
    campo(34, 40, 'codigo', 'Código IBGE do município', 'Código IBGE do município do endereço residencial do mutuário, sem dígito verificador'),
    campo(41, 41, 'codigo', 'Tipo de pessoa', 'Código do tipo de pessoa do mutuário ("1" - Pessoa Física)', { tabela: T_TIPO_PESSOA }),
    campo(42, 55, 'codigo', 'CPF do mutuário'),
    campo(56, 57, 'codigo', 'Público-alvo', 'Código do público-alvo ("07" - Pessoa Física)', { tabela: T_PUBLICO_ALVO }),
    campo(58, 74, 'moeda', 'Renda mensal', 'Valor da renda mensal do mutuário'),
    campo(75, 91, 'moeda', 'Valor da operação', 'Valor da operação (capital financiado)'),
    campo(92, 96, 'decimal', 'Percentual da garantia (%)', 'Percentual da garantia FGO com duas casas decimais', { casas: 2 }),
    campo(97, 97, 'codigo', 'Modalidade de crédito', 'Código da modalidade de crédito ("1" - Crédito Fixo)', { tabela: T_MODALIDADE }),
    campo(98, 98, 'codigo', 'Finalidade do crédito', 'Código da finalidade do crédito ("3" - Renegociação de dívida)', { tabela: T_FINALIDADE }),
    campo(99, 101, 'codigo', 'Fonte de recursos', 'Código da fonte de recursos ("011" - Recurso próprio)', { tabela: T_FONTE }),
    campo(102, 105, 'codigo', 'Programa de crédito', 'Código do programa de crédito ("0050" - Novo Desenrola Brasil)', { tabela: T_PROGRAMA }),
    campo(106, 113, 'data', 'Data da formalização', 'Data da formalização da operação'),
    campo(114, 121, 'data', 'Data de vencimento', 'Data de vencimento da operação'),
    campo(122, 122, 'codigo', 'Tipo de cronograma', 'Código do tipo de cronograma de amortizações', { tabela: T_CRONOGRAMA }),
    campo(123, 124, 'codigo', 'Condição especial', 'Código de condição especial da operação', { tabela: T_CONDICAO_ESPECIAL }),
    campo(125, 132, 'data', 'Data do despacho externo', 'Data do despacho externo ("00000000")'),
    campo(133, 133, 'codigo', 'Tipo de formalização', 'Código do tipo de formalização ("1" - Ordinária)', { tabela: T_FORMALIZACAO }),
    campo(134, 142, 'codigo', 'Nº da pré-validação', 'Número da pré-validação com reserva do evento'),
    campo(143, 159, 'moeda', 'Valor da subvenção', 'Valor da subvenção, em reais (zeros no Novo Desenrola)'),
    campo(160, 170, 'espacos', 'CPF Qualificador', 'Número do CPF Qualificador (espaços no Novo Desenrola)', { tipoManual: 'N' }),
  ],
  '04': [
    idOperacao,
    campo(30, 37, 'data', 'Data da liberação', 'Data da liberação de crédito'),
    campo(38, 54, 'moeda', 'Valor da liberação', 'Valor da liberação de crédito'),
  ],
  '05': [
    idOperacao,
    campo(30, 37, 'data', 'Data de apuração dos saldos'),
    campo(38, 54, 'moeda', 'Saldo capital em normalidade', 'Valor do saldo devedor de capital (principal) em normalidade'),
    campo(55, 71, 'moeda', 'Saldo capital em atraso', 'Valor do saldo devedor de capital (principal) em atraso'),
    campo(72, 88, 'moeda', 'Saldo encargos em normalidade', 'Valor do saldo devedor de encargos em normalidade'),
    campo(89, 105, 'moeda', 'Saldo encargos em atraso', 'Valor do saldo devedor de encargos em atraso'),
    espacos(106, 107),
    campo(108, 115, 'data', 'Início da inadimplência de capital', 'Data de início da inadimplência de capital (zeros = sem capital em atraso)'),
    campo(116, 122, 'decimal', 'Índice de perda esperada', 'Índice de perda esperada, 6 casas decimais', { casas: 6 }),
  ],
  '06': [
    idOperacao,
    campo(30, 37, 'data', 'Início da inadimplência de capital', 'Data de início da inadimplência de capital que motivou a solicitação de honra'),
    campo(38, 45, 'data', 'Data da solicitação de honra', 'Data da solicitação de honra da garantia'),
    campo(46, 62, 'moeda', 'Saldo-base para honra', 'Valor do saldo base para cálculo do valor a ser honrado'),
  ],
  '07': [
    idOperacao,
    campo(30, 37, 'data', 'Data da recuperação', 'Data da recuperação (data em que o Agente recebeu o valor a favor do FGO)'),
    campo(38, 54, 'moeda', 'Valor recebido do cliente'),
  ],
  '08': [
    idOperacao,
    campo(30, 37, 'data', 'Data da recuperação a cancelar'),
    campo(38, 54, 'moeda', 'Valor recuperado a cancelar'),
    campo(55, 62, 'data', 'Data do cancelamento'),
  ],
  '09': [idOperacao, campo(30, 37, 'data', 'Data da devolução', 'Data da devolução do valor honrado')],
  '10': [
    idOperacao,
    campo(30, 49, 'alfa', 'Novo código da operação', 'Novo código identificador da operação (repete o atual se não houver alteração)'),
    campo(50, 57, 'data', 'Data da alteração', 'Data da alteração da operação'),
    espacos(58, 61),
    campo(62, 68, 'codigo', 'Novo código IBGE do município', 'Novo código IBGE do município do mutuário, sem dígito verificador'),
    espacos(69, 83),
    campo(84, 85, 'codigo', 'Público-alvo', 'Código de público-alvo ("07")', { tabela: T_PUBLICO_ALVO }),
    campo(86, 102, 'moeda', 'Nova renda mensal', 'Novo valor da renda mensal do mutuário'),
    espacos(103, 129),
    campo(130, 133, 'codigo', 'Programa de crédito', 'Código do programa de crédito ("0050")', { tabela: T_PROGRAMA }),
    espacos(134, 141),
    campo(142, 149, 'data', 'Data de vencimento', 'Data de vencimento da operação'),
  ],
  '11': [idOperacao, campo(30, 37, 'data', 'Data do cancelamento', 'Data de cancelamento da operação')],
  '12': [
    idOperacao,
    campo(30, 37, 'data', 'Data da liquidação', 'Data de liquidação da operação'),
    campo(38, 57, 'espacos', 'Campo em branco', 'Deixar este campo em branco'),
  ],
  '13': [idOperacao, campo(30, 37, 'data', 'Data da reativação', 'Data da reativação da operação')],
};

/** Detalhe do 2º Retorno: ecoa a Remessa até `fimEco` e devolve o código de rejeição em 209-211. */
function detalhe200R(tipo: string, titulo: string, aba: string, fimEco: number, entreEcoERejeicao: CampoRetorno[]): LeiauteRegistro {
  const eco = REMESSA[tipo]!.filter((c) => c.fim <= fimEco);
  return detalhe(tipo, titulo, aba, [...eco, ...entreEcoERejeicao, rejeicaoRegistro]);
}

// --------------------------------------------------------------------------- arquivos

const GFGF010R: LeiauteArquivoRetorno = {
  nome: 'GFGF010R',
  titulo: '1º Retorno — Confirmação de recebimento da Remessa',
  secaoManual: '§13.2',
  temNumeroRemessa: true,
  dataHeader: { ini: 36, fim: 43, significado: 'data de entrega da Remessa' },
  horaHeader: { ini: 44, fim: 49, significado: 'hora de entrega da Remessa' },
  registros: {
    '01': header('GFGF010R', [
      numeroRemessaHeader,
      campo(36, 43, 'data', 'Data de entrega da Remessa'),
      campo(44, 49, 'hora', 'Hora de entrega da Remessa'),
      campo(50, 53, 'codigo', 'Nº da Remessa substituída', 'Nº sequencial da Remessa substituída (0000 = não houve substituição)'),
      espacos(54, 55),
      cnpjAgente,
      espacos(70, 208),
      campo(209, 211, 'codigo', 'Código de rejeição da Remessa', 'Código de rejeição da Remessa (item 14.1). 000 = Remessa válida.', {
        tabela: T_REJEICAO_REMESSA,
      }),
    ]),
    '99': TRAILER,
  },
};

const HEADER_PROCESSAMENTO = (nome: string): LeiauteRegistro =>
  header(nome, [
    numeroRemessaHeader,
    campo(36, 43, 'data', 'Data de processamento', 'Data de processamento dos eventos da Remessa'),
    espacos(44, 55),
    cnpjAgente,
    espacos(70, 211),
  ]);

const GFGF200R: LeiauteArquivoRetorno = {
  nome: 'GFGF200R',
  titulo: '2º Retorno — Validação dos eventos do Agente',
  secaoManual: '§13.3',
  temNumeroRemessa: true,
  dataHeader: { ini: 36, fim: 43, significado: 'data de processamento dos eventos da Remessa' },
  registros: {
    '01': HEADER_PROCESSAMENTO('GFGF200R'),
    '03': detalhe200R('03', 'DETALHE (FORMALIZAÇÃO DE OPERAÇÃO)', 'Formalização', 170, [
      espacos(171, 187),
      campo(188, 190, 'ignorar', 'Ignorar', 'Ignorar (zeros)'),
      campo(191, 191, 'ignorar', 'Ignorar', 'Retorna 0 (zero)'),
      campo(192, 208, 'ignorar', 'Ignorar', 'Retorna zeros', { tipoManual: 'M' }),
    ]),
    '04': detalhe200R('04', 'DETALHE (LIBERAÇÃO DE CRÉDITO)', 'Liberação', 54, [espacos(55, 208)]),
    '05': detalhe200R('05', 'DETALHE (INFORMAÇÃO DE SALDO)', 'Saldo', 122, [espacos(123, 208)]),
    '06': detalhe200R('06', 'DETALHE (SOLICITAÇÃO DE HONRA DA GARANTIA)', 'Solicitação de honra', 62, [espacos(63, 208)]),
    '07': detalhe200R('07', 'DETALHE (RECUPERAÇÃO DO VALOR HONRADO)', 'Recuperação', 54, [espacos(55, 208)]),
    '08': detalhe200R('08', 'DETALHE (CANCELAMENTO DE RECUPERAÇÃO DO VALOR HONRADO)', 'Cancel. recuperação', 62, [espacos(63, 208)]),
    '09': detalhe200R('09', 'DETALHE (DEVOLUÇÃO DO VALOR HONRADO)', 'Devolução honra', 37, [espacos(38, 208)]),
    '10': detalhe200R('10', 'DETALHE (ALTERAÇÃO DE OPERAÇÃO)', 'Alteração', 149, [espacos(150, 208)]),
    '11': detalhe200R('11', 'DETALHE (CANCELAMENTO DE OPERAÇÃO PELO AGENTE)', 'Cancelamento', 37, [espacos(38, 208)]),
    '12': detalhe200R('12', 'DETALHE (LIQUIDAÇÃO DE OPERAÇÃO)', 'Liquidação', 57, [espacos(58, 208)]),
    '13': detalhe200R('13', 'DETALHE (REATIVAÇÃO DE OPERAÇÃO LIQUIDADA)', 'Reativação', 37, [espacos(38, 208)]),
    '99': TRAILER,
  },
};

const GFGF290R: LeiauteArquivoRetorno = {
  nome: 'GFGF290R',
  titulo: '3º Retorno — Eventos do Administrador',
  secaoManual: '§13.4',
  temNumeroRemessa: true,
  dataHeader: { ini: 36, fim: 43, significado: 'data de processamento dos eventos da Remessa' },
  registros: {
    '01': HEADER_PROCESSAMENTO('GFGF290R'),
    '92': detalhe('92', 'DETALHE (OPERAÇÃO PENDENTE)', 'Operação pendente', [
      idOperacao,
      campo(30, 31, 'codigo', 'Tipo da pendência', 'Código do tipo da pendência (§14.12)', { tabela: T_TIPO_PENDENCIA }),
      campo(32, 39, 'data', 'Data do último saldo recebido', 'Data da última informação de saldo devedor recebida pelo Administrador'),
      campo(40, 47, 'data', 'Vencimento no Administrador', 'Data de vencimento da operação no cadastro do Administrador'),
      campo(48, 49, 'codigo', 'Situação da operação', 'Código da situação da operação no cadastro do Administrador (§14.14)', { tabela: T_SITUACAO }),
      campo(50, 57, 'data', 'Data de início da pendência'),
      espacos(58, 211),
    ]),
    '93': detalhe('93', 'DETALHE (OPERAÇÃO ENCERRADA PELO ADMINISTRADOR)', 'Encerrada pelo Adm', [
      idOperacao,
      campo(30, 31, 'codigo', 'Motivo do encerramento', 'Código do motivo de encerramento da operação (§14.13)', { tabela: T_MOTIVO_ENCERRAMENTO }),
      campo(32, 39, 'data', 'Data do encerramento', 'Data de encerramento da operação'),
      espacos(40, 211),
    ]),
    '94': detalhe('94', 'DETALHE (OPERAÇÃO IMPUGNADA PELO ADMINISTRADOR)', 'Impugnada pelo Adm', [
      idOperacao,
      campo(30, 31, 'codigo', 'Motivo da impugnação', 'Código do motivo de impugnação da operação (§14.15)', { tabela: T_MOTIVO_IMPUGNACAO }),
      campo(32, 39, 'data', 'Data da impugnação', 'Data de impugnação da operação'),
      espacos(40, 211),
    ]),
    '95': detalhe('95', 'DETALHE (LIQUIDAÇÃO DO SALDO HONRADO)', 'Liquidação saldo honrado', [
      idOperacao,
      campo(30, 37, 'data', 'Data da liquidação do saldo honrado', 'Data de liquidação do saldo honrado'),
      espacos(38, 211),
    ]),
    '99': TRAILER,
  },
};

const GFGF450R: LeiauteArquivoRetorno = {
  nome: 'GFGF450R',
  titulo: '4º Retorno — Movimentação financeira',
  secaoManual: '§13.5',
  temNumeroRemessa: true,
  registros: {
    '01': header('GFGF450R', [numeroRemessaHeader, espacos(36, 55), cnpjAgente, espacos(70, 211)]),
    '97': detalhe('97', 'DETALHE (MOVIMENTAÇÃO FINANCEIRA)', 'Movimentação financeira', [
      idOperacao,
      campo(30, 31, 'codigo', 'Tipo de movimentação', 'Código do tipo de movimentação (§14.16)', { tabela: T_TIPO_MOVIMENTACAO }),
      campo(32, 39, 'data', 'Data da movimentação financeira', 'Data da movimentação financeira (zero para natureza 3 — sem movimentação)'),
      campo(40, 47, 'data', 'Data do fato gerador', 'Data do fato gerador da movimentação'),
      campo(48, 64, 'moeda', 'Valor nominal', 'Valor nominal na data do fato gerador'),
      campo(65, 81, 'moeda', 'Atualização monetária', 'Valor da atualização monetária, do fato gerador até a movimentação financeira'),
      campo(82, 98, 'moeda', 'Valor do ISSQN'),
      campo(99, 115, 'moeda', 'Valor líquido movimentado'),
      campo(116, 122, 'inteiro', 'Registro causador (nº seq. na Remessa)', 'Nº sequencial do registro causador da movimentação'),
      espacos(123, 211),
    ]),
    '99': TRAILER,
  },
};

const GFGF270R: LeiauteArquivoRetorno = {
  nome: 'GFGF270R',
  titulo: 'Informativo diário',
  secaoManual: '§13.6',
  temNumeroRemessa: false,
  registros: {
    '01': header('GFGF270R', [espacos(32, 55), cnpjAgente, espacos(70, 211)]),
    '91': detalhe('91', 'REMESSA PENDENTE DE MOVIMENTAÇÃO FINANCEIRA', 'Remessa pendente', [
      campo(10, 13, 'codigo', 'Nº da Remessa', 'Nº sequencial da Remessa à qual se refere a pendência'),
      campo(14, 30, 'moeda', 'Valor a ser movimentado'),
      campo(31, 31, 'codigo', 'Natureza da movimentação', 'Código da natureza da movimentação financeira (§14.17)', { tabela: T_NATUREZA }),
      campo(32, 39, 'data', 'Validade do valor', 'Data de validade do valor a ser movimentado'),
      campo(40, 56, 'moeda', 'ISSQN a reter', 'Valor a ser retido para recolhimento do ISSQN'),
      espacos(57, 211),
    ]),
    '96': detalhe('96', 'DETALHE (SITUAÇÃO PATRIMONIAL)', 'Situação patrimonial', [
      campo(10, 26, 'moeda', 'Base de cálculo do limite do Fundo', 'Base de cálculo para o limite máximo da carteira do Fundo Garantidor'),
      campo(27, 43, 'zeros', 'Zeros', 'Zeros', { tipoManual: 'M' }),
      campo(44, 60, 'moeda', 'Limite máximo da carteira do Fundo', 'Limite máximo da carteira do Fundo Garantidor (valores financiados)'),
      campo(61, 77, 'moeda', 'Limite máximo da carteira do Agente', 'Limite máximo da carteira do Agente (valores financiados)'),
      campo(78, 94, 'moeda', 'Comprometido da carteira do Fundo', 'Valor já comprometido da carteira do Fundo Garantidor'),
      campo(95, 111, 'moeda', 'Comprometido da carteira do Agente', 'Valor já comprometido da carteira do Agente'),
      campo(112, 116, 'zeros', 'Zeros', 'Zeros', { tipoManual: 'N' }),
      // O manual indica 117-125 / 126-211, mas os tamanhos declarados (8 e 87) só fecham 211
      // colunas como 117-124 / 125-211 — seguimos os tamanhos.
      campo(117, 124, 'data', 'Data da situação patrimonial'),
      espacos(125, 211),
    ]),
    '98': detalhe('98', 'DETALHE (SALDO HONRADO A RECUPERAR)', 'Saldo honrado a recuperar', [
      idOperacao,
      campo(30, 37, 'data', 'Validade do saldo para cobrança', 'Data de validade do saldo para cobrança ao mutuário'),
      campo(38, 54, 'moeda', 'Saldo honrado a recuperar', 'Valor do saldo honrado a recuperar atualizado'),
      espacos(55, 211),
    ]),
    '99': TRAILER,
  },
};

export const LEIAUTES_RETORNO: Readonly<Record<string, LeiauteArquivoRetorno>> = {
  GFGF010R,
  GFGF200R,
  GFGF290R,
  GFGF450R,
  GFGF270R,
};

/** Tipo do manual (A/N/M/D/H) a partir do tipo do campo. */
export function tipoManualDoCampo(c: CampoRetorno): string {
  if (c.tipoManual) return c.tipoManual;
  switch (c.tipo) {
    case 'alfa':
    case 'espacos':
      return 'A';
    case 'data':
      return 'D';
    case 'hora':
      return 'H';
    case 'moeda':
      return 'M';
    default:
      return 'N';
  }
}

/** Rede de segurança: cada registro cobre as 211 colunas, sem buraco nem sobreposição. */
function conferirLeiautes(): void {
  for (const arquivo of Object.values(LEIAUTES_RETORNO)) {
    for (const registro of Object.values(arquivo.registros)) {
      let proxima = 1;
      for (const c of registro.campos) {
        if (c.ini !== proxima || c.fim < c.ini) {
          throw new Error(
            `Leiaute ${arquivo.nome}/${registro.tipoRegistro}: campo "${c.nome}" em ${c.ini}-${c.fim}, esperado início em ${proxima}.`
          );
        }
        proxima = c.fim + 1;
      }
      if (proxima !== TAMANHO_LINHA_RETORNO + 1) {
        throw new Error(`Leiaute ${arquivo.nome}/${registro.tipoRegistro}: termina em ${proxima - 1}, esperado 211.`);
      }
    }
  }
}

conferirLeiautes();
