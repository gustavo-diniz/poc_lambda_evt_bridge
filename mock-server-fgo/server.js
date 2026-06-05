'use strict';

const express    = require('express');
const fileUpload = require('express-fileupload');
const fs         = require('fs');
const path       = require('path');

const ARQUIVOS_TESTE_DIR = path.join(__dirname, '..', 'arquivos_teste');
const app = express();

// text/plain para POST /remessa (--data-binary)
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
// multipart/form-data para POST /remessa/upload (Postman / --form)
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));
app.disable('x-powered-by');

const PORT = process.env.PORT || 9002;

// ---------------------------------------------------------------------------
// Helpers de campos posicionais (1-indexed, conforme especificação FGO)
// ---------------------------------------------------------------------------

function campo(linha, inicio, fim) {
  return linha.substring(inicio - 1, fim);
}

function campoTrim(linha, inicio, fim) {
  return campo(linha, inicio, fim).trim();
}

function padL(valor, tamanho) {
  return String(valor).padStart(tamanho, '0');
}

// ---------------------------------------------------------------------------
// Helpers de data / hora / monetário
// ---------------------------------------------------------------------------

function parsearData(str) {
  if (!str || str.length !== 8) return null;
  const yyyy = parseInt(str.substring(0, 4), 10);
  const mm   = parseInt(str.substring(4, 6), 10) - 1;
  const dd   = parseInt(str.substring(6, 8), 10);
  const d    = new Date(yyyy, mm, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm || d.getDate() !== dd) return null;
  return d;
}

function isDataValida(str) {
  return parsearData(str) !== null;
}

function diasEntre(d1, d2) {
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Campo monetário (17M): inteiro em centavos, ex: "00000000001500000" = R$15.000,00
function parsearMonetario(str) {
  if (!str || !/^\d{17}$/.test(str)) return null;
  return parseInt(str, 10);
}

function formatarData(date) {
  const d = date || new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

function formatarHora(date) {
  const d = date || new Date();
  return `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}

// ---------------------------------------------------------------------------
// Validação de CPF (dígitos verificadores, mod-11)
// O campo é 14N — CPF de 11 dígitos com 3 zeros de padding à esquerda
// ---------------------------------------------------------------------------

function validarCPF(cpf11) {
  if (!/^\d{11}$/.test(cpf11)) return false;
  if (/^(\d)\1{10}$/.test(cpf11)) return false; // todos iguais

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf11[i]) * (10 - i);
  let d1 = 11 - (soma % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf11[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf11[i]) * (11 - i);
  let d2 = 11 - (soma % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf11[10]);
}

// ---------------------------------------------------------------------------
// Parser do arquivo GFG0010 (REMESSA)
// ---------------------------------------------------------------------------

const TIPOS_VALIDOS = new Set(['01', '03', '04', '05', '99']);

function parsearArquivo(conteudo) {
  const registros = conteudo
    .split('\n')
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.trim().length > 0)
    .map((raw, idx) => {
      const numSeqStr = campo(raw, 1, 7);
      const tipo      = campo(raw, 8, 9);
      return { indice: idx + 1, numSeqStr, numSeq: parseInt(numSeqStr, 10) || 0, tipo, raw };
    });

  return { registros };
}

// ---------------------------------------------------------------------------
// Validação ESTRUTURAL do 1º Retorno (spec 13.2)
//
// Valida: header, numeração sequencial de todos os registros, trailer.
// Registros-detalhe NÃO são validados nesta etapa.
// ---------------------------------------------------------------------------

function validarEstrutura({ registros }) {
  const erros = [];

  if (registros.length === 0) {
    erros.push({ codigo: '002', descricao: 'Arquivo vazio ou sem registros válidos' });
    return erros;
  }

  const primeiro = registros[0];
  if (primeiro.tipo !== '01') {
    erros.push({ codigo: '017', descricao: `Primeiro registro deve ser HEADER (tipo "01"), encontrado tipo "${primeiro.tipo}"` });
    return erros;
  }

  const rawHeader = primeiro.raw;

  const nomeArquivo = campo(rawHeader, 10, 17);
  if (nomeArquivo !== 'GFGF0010') {
    erros.push({ codigo: '009', descricao: `Nome do arquivo inválido: "${nomeArquivo}". Esperado: "GFGF0010"` });
  }

  const codigoFundo = campo(rawHeader, 29, 31).trim();
  if (codigoFundo !== '010') {
    erros.push({ codigo: '004', descricao: `Código do Fundo Garantidor inválido: "${codigoFundo}". Esperado: "010"` });
  }

  const numSeqRemessa = campo(rawHeader, 32, 35);
  if (numSeqRemessa === '0000') {
    erros.push({ codigo: '005', descricao: 'Número sequencial da Remessa inválido "0000". Deve começar em "0001"' });
  }

  const ultimo = registros[registros.length - 1];
  if (ultimo.tipo !== '99') {
    erros.push({ codigo: '018', descricao: `Último registro deve ser TRAILER (tipo "99"), encontrado tipo "${ultimo.tipo}"` });
    return erros;
  }

  // Largura fixa: cada registro deve ter exatamente 211 caracteres (código 006)
  for (const reg of registros) {
    if (reg.raw.length !== 211) {
      erros.push({
        codigo: '006',
        descricao: `Registro seq ${reg.numSeqStr} (tipo ${reg.tipo}) tem ${reg.raw.length} caractere(s), esperado 211 (arquivo deve ser de largura fixa sem separadores)`,
      });
    }
  }

  for (const reg of registros) {
    if (!TIPOS_VALIDOS.has(reg.tipo)) {
      erros.push({ codigo: '999', descricao: `Tipo de registro desconhecido "${reg.tipo}" no seq ${reg.numSeqStr}` });
    }
  }

  for (let i = 0; i < registros.length; i++) {
    if (registros[i].numSeq !== i + 1) {
      erros.push({
        codigo: '015',
        descricao: `Numeração sequencial inválida: posição ${i + 1} esperava ${padL(i + 1, 7)}, encontrado ${registros[i].numSeqStr}`,
      });
      break;
    }
  }

  const rawTrailer  = ultimo.raw;
  const qtdTrailer  = parseInt(campo(rawTrailer, 10, 16), 10);
  const qtdReal     = registros.length;
  if (isNaN(qtdTrailer) || qtdTrailer !== qtdReal) {
    erros.push({
      codigo: '020',
      descricao: `Quantidade no trailer ("${campo(rawTrailer, 10, 16)}") diverge da quantidade real (${padL(qtdReal, 7)})`,
    });
  }

  return erros;
}

// ---------------------------------------------------------------------------
// Validação de negócio — TIPO 03: FORMALIZAÇÃO DE OPERAÇÃO
// (seção 12 do Manual de Procedimentos Operacionais)
//
// Layout tipo 03:
//   1-7   (7N) seq | 8-9 (2N) tipo "03"
//   10-29 (20A) Código identificador da operação
//   30-33 (4N)  Nº agência
//   34-40 (7N)  Código IBGE do município
//   41-41 (1N)  Tipo de pessoa "1"
//   42-55 (14N) CPF do mutuário (3 zeros + 11 dígitos)
//   56-57 (2N)  Público-alvo "07"
//   58-74 (17M) Renda mensal (centavos)
//   75-91 (17M) Valor da operação (centavos)
//   92-96 (5N)  Percentual garantia FGO "10000"
//   97-97 (1N)  Modalidade de crédito "1"
//   98-98 (1N)  Finalidade do crédito "3"
//   99-101 (3N) Fonte de recursos "011"
//   102-105 (4N) Código do programa "0050"
//   106-113 (8D) Data de formalização
//   114-121 (8D) Data de vencimento
//   122-122 (1N) Tipo de cronograma "1"
//   123-124 (2N) Condição especial "01"
//   125-132 (8D) Data despacho externo "00000000"
//   133-133 (1N) Tipo de formalização "1"
//   134-142 (9N) Número da pré-validação (obrigatório)
//   143-159 (17M) Valor da subvenção (zeros)
//   160-170 (11N) CPF Qualificador (espaços)
//   171-211 (41A) Espaços
// ---------------------------------------------------------------------------

const DATA_MINIMA_FORMALIZACAO = new Date(2026, 4, 5); // 05/05/2026
const VALOR_MAX_OPERACAO       = 1500000; // R$15.000,00 em centavos
const RENDA_MAX_5SM            = 810500;  // R$8.105,00 em centavos (5 salários-mínimos)
const PRAZO_MAX_DIAS           = 1461;    // 48 meses

function validarTipo03(raw, dataEntregaRemessa) {
  const erros = [];

  // Código identificador (10-29): tipo A
  //   - 1º char: letra MAIÚSCULA ou dígito
  //   - demais chars: letras maiúsculas, dígitos ou separadores (. , - / espaço)
  //   - letras minúsculas NÃO são permitidas (spec: "Todas as letras devem ser maiúsculas")
  const codOp        = campo(raw, 10, 29);
  const primeiroChar = codOp[0];
  if (!primeiroChar || !/[A-Z0-9]/.test(primeiroChar)) {
    erros.push({ codigo: 'V03-001', descricao: `Código identificador: 1º caractere deve ser letra MAIÚSCULA ou dígito, encontrado "${primeiroChar}"` });
  }
  const charInvalidoCodOp = [...codOp].find(c => !/[A-Z0-9.,\-\/ ]/.test(c));
  if (charInvalidoCodOp !== undefined) {
    erros.push({ codigo: 'V03-029', descricao: `Código identificador (tipo A): caractere inválido "${charInvalidoCodOp}". Permitidos: letras MAIÚSCULAS, dígitos e separadores (. , - / espaço)` });
  }

  // CPF do mutuário (42-55): 14N → "000" + 11 dígitos
  const cpfCampo = campo(raw, 42, 55);
  if (!/^\d{14}$/.test(cpfCampo)) {
    erros.push({ codigo: 'V03-002', descricao: `CPF do mutuário deve conter 14 dígitos numéricos, encontrado: "${cpfCampo}"` });
  } else {
    const cpf11 = cpfCampo.substring(3); // últimos 11 dígitos
    if (!validarCPF(cpf11)) {
      erros.push({ codigo: 'V03-003', descricao: `CPF do mutuário inválido (dígitos verificadores incorretos): "${cpf11}"` });
    }
  }

  // Agência (30-33): tipo N — apenas dígitos
  const agenciaCampo = campo(raw, 30, 33);
  if (!/^\d{4}$/.test(agenciaCampo)) {
    erros.push({ codigo: 'V03-030', descricao: `Nº da agência (tipo N) deve conter 4 dígitos numéricos, encontrado: "${agenciaCampo}"` });
  }

  // Código IBGE (34-40): tipo N — apenas dígitos
  const ibgeCampo = campo(raw, 34, 40);
  if (!/^\d{7}$/.test(ibgeCampo)) {
    erros.push({ codigo: 'V03-031', descricao: `Código IBGE (tipo N) deve conter 7 dígitos numéricos, encontrado: "${ibgeCampo}"` });
  }

  // Tipo de pessoa (41-41): deve ser "1" (pessoa física)
  const tipoPessoa = campo(raw, 41, 41);
  if (tipoPessoa !== '1') {
    erros.push({ codigo: 'V03-004', descricao: `Tipo de pessoa inválido: "${tipoPessoa}". Esperado: "1" (pessoa física)` });
  }

  // Público-alvo (56-57): deve ser "07"
  const publicoAlvo = campo(raw, 56, 57);
  if (publicoAlvo !== '07') {
    erros.push({ codigo: 'V03-005', descricao: `Código do público-alvo inválido: "${publicoAlvo}". Esperado: "07"` });
  }

  // Renda mensal (58-74): ≤ 5 salários-mínimos = R$8.105,00
  const rendaStr = campo(raw, 58, 74);
  const renda    = parsearMonetario(rendaStr);
  if (renda === null) {
    erros.push({ codigo: 'V03-006', descricao: `Renda mensal com formato inválido: "${rendaStr}"` });
  } else if (renda > RENDA_MAX_5SM) {
    erros.push({ codigo: 'V03-007', descricao: `Renda mensal (${rendaStr}) excede 5 salários-mínimos (R$ 8.105,00 = ${RENDA_MAX_5SM} centavos)` });
  }

  // Valor da operação (75-91): > 0 e ≤ R$15.000,00
  const valorOpStr = campo(raw, 75, 91);
  const valorOp    = parsearMonetario(valorOpStr);
  if (valorOp === null) {
    erros.push({ codigo: 'V03-008', descricao: `Valor da operação com formato inválido: "${valorOpStr}"` });
  } else if (valorOp <= 0) {
    erros.push({ codigo: 'V03-009', descricao: 'Valor da operação deve ser maior que zero' });
  } else if (valorOp > VALOR_MAX_OPERACAO) {
    erros.push({ codigo: 'V03-010', descricao: `Valor da operação (${valorOpStr}) excede o limite por mutuário de R$ 15.000,00 (${VALOR_MAX_OPERACAO} centavos)` });
  }

  // Percentual garantia FGO (92-96): deve ser "10000" (100%)
  const percGarantia = campo(raw, 92, 96);
  if (percGarantia !== '10000') {
    erros.push({ codigo: 'V03-011', descricao: `Percentual da garantia FGO inválido: "${percGarantia}". Esperado: "10000" (100%)` });
  }

  // Modalidade de crédito (97-97): deve ser "1"
  if (campo(raw, 97, 97) !== '1') {
    erros.push({ codigo: 'V03-012', descricao: `Modalidade de crédito inválida: "${campo(raw,97,97)}". Esperado: "1"` });
  }

  // Finalidade do crédito (98-98): deve ser "3"
  if (campo(raw, 98, 98) !== '3') {
    erros.push({ codigo: 'V03-013', descricao: `Finalidade do crédito inválida: "${campo(raw,98,98)}". Esperado: "3"` });
  }

  // Fonte de recursos (99-101): deve ser "011"
  if (campo(raw, 99, 101) !== '011') {
    erros.push({ codigo: 'V03-014', descricao: `Fonte de recursos inválida: "${campo(raw,99,101)}". Esperado: "011"` });
  }

  // Código do programa (102-105): deve ser "0050" para FGO Novo Desenrola Brasil
  if (campo(raw, 102, 105) !== '0050') {
    erros.push({ codigo: 'V03-015', descricao: `Código do programa inválido: "${campo(raw,102,105)}". Esperado: "0050" (FGO Novo Desenrola Brasil)` });
  }

  // Data de formalização (106-113): tipo D — AAAAMMDD, apenas dígitos
  const dataFormStr = campo(raw, 106, 113);
  if (!/^\d{8}$/.test(dataFormStr)) {
    erros.push({ codigo: 'V03-016A', descricao: `Data de formalização (tipo D) deve conter 8 dígitos numéricos no formato AAAAMMDD, encontrado: "${dataFormStr}"` });
  }
  const dataForm    = parsearData(dataFormStr);
  if (!dataForm) {
    erros.push({ codigo: 'V03-016', descricao: `Data de formalização inválida: "${dataFormStr}" (esperado AAAAMMDD)` });
  } else {
    if (dataForm < DATA_MINIMA_FORMALIZACAO) {
      erros.push({ codigo: 'V03-017', descricao: `Data de formalização (${dataFormStr}) deve ser igual ou maior que 05/05/2026` });
    }
    if (dataEntregaRemessa && dataForm > dataEntregaRemessa) {
      erros.push({ codigo: 'V03-018', descricao: `Data de formalização (${dataFormStr}) não pode ser superior à data de entrega da Remessa` });
    }
  }

  // Data de vencimento (114-121): tipo D — apenas dígitos
  const dataVencStr = campo(raw, 114, 121);
  if (!/^\d{8}$/.test(dataVencStr)) {
    erros.push({ codigo: 'V03-019A', descricao: `Data de vencimento (tipo D) deve conter 8 dígitos numéricos, encontrado: "${dataVencStr}"` });
  }
  const dataVenc    = parsearData(dataVencStr);
  if (!dataVenc) {
    erros.push({ codigo: 'V03-019', descricao: `Data de vencimento inválida: "${dataVencStr}" (esperado AAAAMMDD)` });
  } else if (dataForm) {
    if (dataVenc <= dataForm) {
      erros.push({ codigo: 'V03-020', descricao: `Data de vencimento (${dataVencStr}) deve ser maior que a data de formalização (${dataFormStr})` });
    } else {
      const prazo = diasEntre(dataForm, dataVenc);
      if (prazo > PRAZO_MAX_DIAS) {
        erros.push({ codigo: 'V03-021', descricao: `Prazo formalização→vencimento (${prazo} dias) excede o máximo de ${PRAZO_MAX_DIAS} dias (48 meses)` });
      }
    }
  }

  // Tipo de cronograma (122-122): deve ser "1"
  if (campo(raw, 122, 122) !== '1') {
    erros.push({ codigo: 'V03-022', descricao: `Tipo de cronograma inválido: "${campo(raw,122,122)}". Esperado: "1"` });
  }

  // Condição especial (123-124): deve ser "01" (sem condição especial)
  if (campo(raw, 123, 124) !== '01') {
    erros.push({ codigo: 'V03-023', descricao: `Código de condição especial inválido: "${campo(raw,123,124)}". Esperado: "01"` });
  }

  // Data despacho externo (125-132): deve ser "00000000"
  if (campo(raw, 125, 132) !== '00000000') {
    erros.push({ codigo: 'V03-024', descricao: `Data do despacho externo deve ser "00000000", encontrado: "${campo(raw,125,132)}"` });
  }

  // Tipo de formalização (133-133): deve ser "1" (Ordinária)
  if (campo(raw, 133, 133) !== '1') {
    erros.push({ codigo: 'V03-025', descricao: `Tipo de formalização inválido: "${campo(raw,133,133)}". Esperado: "1" (Ordinária)` });
  }

  // Número da pré-validação (134-142): obrigatório para FGO Novo Desenrola Brasil
  const preValidacao = campo(raw, 134, 142);
  if (preValidacao.trim() === '' || preValidacao === '000000000') {
    erros.push({ codigo: 'V03-026', descricao: 'Número da pré-validação não informado (campo obrigatório para FGO Novo Desenrola Brasil)' });
  }

  // Valor da subvenção (143-159): deve ser zeros
  const subvencao = campo(raw, 143, 159);
  if (subvencao !== '00000000000000000') {
    erros.push({ codigo: 'V03-027', descricao: `Valor da subvenção deve ser zeros ("00000000000000000"), encontrado: "${subvencao}"` });
  }

  // CPF Qualificador (160-170): deve permanecer com espaços
  const cpfQualif = campo(raw, 160, 170);
  if (cpfQualif.trim() !== '') {
    erros.push({ codigo: 'V03-028', descricao: 'Campo CPF Qualificador deve permanecer com espaços (não deve ser informado)' });
  }

  return { erros, dataForm, valorOp };
}

// ---------------------------------------------------------------------------
// Validação de negócio — TIPO 04: LIBERAÇÃO DE CRÉDITO
//
// Layout tipo 04:
//   1-7   (7N) seq | 8-9 (2N) tipo "04"
//   10-29 (20A) Código identificador da operação
//   30-37 (8D)  Data da liberação de crédito
//   38-54 (17M) Valor da liberação de crédito (centavos)
//   55-211 (157A) Espaços
// ---------------------------------------------------------------------------

function validarTipo04(raw, dataEntregaRemessa, infoTipo03) {
  const erros = [];

  // Data da liberação (30-37): tipo D — apenas dígitos
  const dataLibStr = campo(raw, 30, 37);
  if (!/^\d{8}$/.test(dataLibStr)) {
    erros.push({ codigo: 'V04-001A', descricao: `Data de liberação (tipo D) deve conter 8 dígitos numéricos, encontrado: "${dataLibStr}"` });
  }
  const dataLib    = parsearData(dataLibStr);
  if (!dataLib) {
    erros.push({ codigo: 'V04-001', descricao: `Data de liberação de crédito inválida: "${dataLibStr}" (esperado AAAAMMDD)` });
  } else {
    // Data liberação ≤ data entrega da Remessa
    if (dataEntregaRemessa && dataLib > dataEntregaRemessa) {
      erros.push({ codigo: 'V04-002', descricao: `Data de liberação (${dataLibStr}) não pode ser superior à data de entrega da Remessa` });
    }
    // Cross-ref com tipo 03 da mesma operação
    if (infoTipo03) {
      if (infoTipo03.dataForm && dataLib < infoTipo03.dataForm) {
        erros.push({ codigo: 'V04-003', descricao: `Data de liberação (${dataLibStr}) deve ser maior ou igual à data de formalização (${formatarData(infoTipo03.dataForm)})` });
      }
      if (infoTipo03.dataVenc && dataLib >= infoTipo03.dataVenc) {
        erros.push({ codigo: 'V04-004', descricao: `Data de liberação (${dataLibStr}) deve ser menor que a data de vencimento (${formatarData(infoTipo03.dataVenc)})` });
      }
    }
  }

  // Valor da liberação (38-54): deve ser maior que zero
  const valorLibStr = campo(raw, 38, 54);
  const valorLib    = parsearMonetario(valorLibStr);
  if (valorLib === null) {
    erros.push({ codigo: 'V04-005', descricao: `Valor da liberação de crédito com formato inválido: "${valorLibStr}"` });
  } else if (valorLib <= 0) {
    erros.push({ codigo: 'V04-006', descricao: 'Valor da liberação de crédito deve ser maior que zero' });
  } else if (infoTipo03?.valorOp && valorLib > infoTipo03.valorOp) {
    erros.push({ codigo: 'V04-007', descricao: `Valor liberado (${valorLibStr}) não pode ser maior que o valor da operação (${padL(infoTipo03.valorOp, 17)})` });
  }

  return { erros, dataLib, valorLib };
}

// ---------------------------------------------------------------------------
// Validação de negócio — TIPO 05: INFORMAÇÃO DE SALDO
//
// Layout tipo 05:
//   1-7    (7N)  seq | 8-9 (2N) tipo "05"
//   10-29  (20A) Código identificador da operação
//   30-37  (8D)  Data de apuração dos saldos
//   38-54  (17M) Saldo devedor capital em normalidade
//   55-71  (17M) Saldo devedor capital em atraso
//   72-88  (17M) Saldo devedor encargos em normalidade
//   89-105 (17M) Saldo devedor encargos em atraso
//   106-107 (2A) Espaços
//   108-115 (8D) Data início da inadimplência de capital
//   116-122 (7N) Índice de perda esperada (0–1 com 6 casas decimais, ex: 0000051)
//   123-211 (89A) Espaços
// ---------------------------------------------------------------------------

function validarTipo05(raw, dataEntregaRemessa, infoTipo04, infoTipo03) {
  const erros = [];

  // Data de apuração dos saldos (30-37): tipo D — apenas dígitos
  const dataApuracaoStr = campo(raw, 30, 37);
  if (!/^\d{8}$/.test(dataApuracaoStr)) {
    erros.push({ codigo: 'V05-001A', descricao: `Data de apuração (tipo D) deve conter 8 dígitos numéricos, encontrado: "${dataApuracaoStr}"` });
  }
  const dataApuracao    = parsearData(dataApuracaoStr);
  if (!dataApuracao) {
    erros.push({ codigo: 'V05-001', descricao: `Data de apuração dos saldos inválida: "${dataApuracaoStr}" (esperado AAAAMMDD)` });
  } else {
    // Deve ser ≤ data de entrega da Remessa
    if (dataEntregaRemessa && dataApuracao > dataEntregaRemessa) {
      erros.push({ codigo: 'V05-002', descricao: `Data de apuração (${dataApuracaoStr}) não pode ser superior à data de entrega da Remessa` });
    }
    // Deve ser o último dia do mês (verifica se o próximo dia é de outro mês)
    const proximoDia = new Date(dataApuracao);
    proximoDia.setDate(proximoDia.getDate() + 1);
    if (proximoDia.getMonth() === dataApuracao.getMonth()) {
      erros.push({ codigo: 'V05-003', descricao: `Data de apuração (${dataApuracaoStr}) deve ser o último dia corrido do mês` });
    }
  }

  // Saldos monetários
  const capNormStr   = campo(raw, 38, 54);
  const capAtrasStr  = campo(raw, 55, 71);
  const encNormStr   = campo(raw, 72, 88);
  const encAtrasStr  = campo(raw, 89, 105);

  const capNorm  = parsearMonetario(capNormStr);
  const capAtras = parsearMonetario(capAtrasStr);
  const encNorm  = parsearMonetario(encNormStr);
  const encAtras = parsearMonetario(encAtrasStr);

  [
    [capNormStr,  capNorm,  'Saldo devedor capital em normalidade',  'V05-004'],
    [capAtrasStr, capAtras, 'Saldo devedor capital em atraso',       'V05-005'],
    [encNormStr,  encNorm,  'Saldo devedor encargos em normalidade', 'V05-006'],
    [encAtrasStr, encAtras, 'Saldo devedor encargos em atraso',      'V05-007'],
  ].forEach(([str, val, nome, cod]) => {
    if (val === null) {
      erros.push({ codigo: cod, descricao: `${nome}: formato inválido "${str}"` });
    } else if (val < 0) {
      erros.push({ codigo: cod, descricao: `${nome} não pode ser negativo` });
    }
  });

  // Data início da inadimplência (108-115)
  const dataInadStr = campo(raw, 108, 115);

  if (capNorm !== null && capAtras !== null) {
    if (capAtras === 0) {
      // Em NORMALIDADE: data inadimplência deve ser "00000000"
      if (dataInadStr !== '00000000') {
        erros.push({ codigo: 'V05-008', descricao: `Operação em normalidade (capital em atraso = 0): data de inadimplência deve ser "00000000", encontrado: "${dataInadStr}"` });
      }
    } else {
      // Em ATRASO: data inadimplência obrigatória
      if (dataInadStr === '00000000') {
        erros.push({ codigo: 'V05-009', descricao: 'Capital em atraso informado, mas data de início da inadimplência não foi preenchida' });
      } else if (!isDataValida(dataInadStr)) {
        erros.push({ codigo: 'V05-010', descricao: `Data de início da inadimplência inválida: "${dataInadStr}" (esperado AAAAMMDD)` });
      } else if (dataEntregaRemessa) {
        const dataInad = parsearData(dataInadStr);
        if (dataInad && dataInad > dataEntregaRemessa) {
          erros.push({ codigo: 'V05-011', descricao: `Data de inadimplência (${dataInadStr}) não pode ser superior à data de entrega da Remessa` });
        }
      }
    }

    // Soma capital normalidade + atraso ≤ valor liberado E ≤ valor da operação (spec 12, tipo 05)
    const somaCapital = capNorm + capAtras;
    if (infoTipo04?.valorLib != null && somaCapital > infoTipo04.valorLib) {
      erros.push({ codigo: 'V05-012', descricao: `Soma dos saldos de capital (${padL(somaCapital, 17)}) excede o valor liberado (${padL(infoTipo04.valorLib, 17)})` });
    }
    if (infoTipo03?.valorOp != null && somaCapital > infoTipo03.valorOp) {
      erros.push({ codigo: 'V05-012B', descricao: `Soma dos saldos de capital (${padL(somaCapital, 17)}) excede o valor da operação (${padL(infoTipo03.valorOp, 17)})` });
    }
  }

  // Campo espaços (106-107): deve ser espaços
  const espaco107 = campo(raw, 106, 107);
  if (espaco107.trim() !== '') {
    erros.push({ codigo: 'V05-013', descricao: `Posições 106-107 devem ser espaços, encontrado: "${espaco107}"` });
  }

  // Índice de perda esperada (116-122): 7N, valor de 0000000 a 1000000
  const indiceStr = campo(raw, 116, 122);
  if (!/^\d{7}$/.test(indiceStr)) {
    erros.push({ codigo: 'V05-014', descricao: `Índice de perda esperada com formato inválido: "${indiceStr}" (esperado 7 dígitos numéricos)` });
  } else {
    const indice = parseInt(indiceStr, 10);
    if (indice < 0 || indice > 1000000) {
      erros.push({ codigo: 'V05-015', descricao: `Índice de perda esperada (${indiceStr}) fora do intervalo válido: 0000000 a 1000000 (representa 0 a 1 com 6 casas decimais)` });
    }
  }

  return { erros };
}

// ---------------------------------------------------------------------------
// Orquestra a validação de negócio de todos os registros-detalhe
// ---------------------------------------------------------------------------

function validarDetalhes({ registros, dataEntregaRemessa }) {
  // Mapeia tipo 03 e tipo 04 por código de operação para cross-reference
  const infoOp03 = {}; // codigoOp → { dataForm, dataVenc, valorOp }
  const infoOp04 = {}; // codigoOp → { dataLib, valorLib }

  // Primeiro passa: coleta dados dos tipo 03 e 04 (sem validar)
  for (const reg of registros) {
    const codOp = campoTrim(reg.raw, 10, 29);
    if (reg.tipo === '03') {
      const dataForm = parsearData(campo(reg.raw, 106, 113));
      const dataVenc = parsearData(campo(reg.raw, 114, 121));
      const valorOp  = parsearMonetario(campo(reg.raw, 75, 91));
      infoOp03[codOp] = { dataForm, dataVenc, valorOp };
    }
    if (reg.tipo === '04') {
      const dataLib  = parsearData(campo(reg.raw, 30, 37));
      const valorLib = parsearMonetario(campo(reg.raw, 38, 54));
      infoOp04[codOp] = { dataLib, valorLib };
    }
  }

  // Segunda passa: valida cada registro-detalhe
  const resultado = [];
  for (const reg of registros) {
    if (!['03', '04', '05'].includes(reg.tipo)) continue;

    const codOp = campoTrim(reg.raw, 10, 29);
    let erros = [];

    if (reg.tipo === '03') {
      const v = validarTipo03(reg.raw, dataEntregaRemessa);
      erros = v.erros;
    } else if (reg.tipo === '04') {
      const v = validarTipo04(reg.raw, dataEntregaRemessa, infoOp03[codOp]);
      erros = v.erros;
    } else if (reg.tipo === '05') {
      const v = validarTipo05(reg.raw, dataEntregaRemessa, infoOp04[codOp], infoOp03[codOp]);
      erros = v.erros;
    }

    resultado.push({
      numSeq:   reg.numSeq,
      tipo:     reg.tipo,
      codigoOp: codOp,
      status:   erros.length === 0 ? 'APROVADO' : 'REJEITADO',
      erros,
    });
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Gera o 1º Arquivo Retorno GFGF010R — 211 chars por linha
// ---------------------------------------------------------------------------

const CNPJ_MOCK = '00000000000191';

function gerarPrimeiroRetorno({ registros, erros, agora }) {
  const rawHeader = registros.length > 0 && registros[0].tipo === '01'
    ? registros[0].raw
    : null;

  const codigoAgente  = rawHeader ? padL(campoTrim(rawHeader, 26, 28), 3) : '000';
  const codigoFundo   = rawHeader ? padL(campoTrim(rawHeader, 29, 31), 3) : '010';
  const numSeqRemessa = rawHeader ? campo(rawHeader, 32, 35)               : '0000';

  const dataEntrega    = formatarData(agora);
  const horaEntrega    = formatarHora(agora);
  const codigoRejeicao = erros.length > 0 ? padL(erros[0].codigo, 3) : '000';

  const linhaHeader = [
    padL(1, 7),
    '01',
    'GFGF010R',
    '20170331',
    codigoAgente,
    codigoFundo,
    numSeqRemessa,
    dataEntrega,
    horaEntrega,
    '0000',
    '  ',
    CNPJ_MOCK,
    ' '.repeat(139),
    codigoRejeicao,
  ].join('');

  const linhaTrailer = [
    padL(2, 7),
    '99',
    padL(2, 7),
    ' '.repeat(195),
  ].join('');

  return `${linhaHeader}\n${linhaTrailer}`;
}

// ---------------------------------------------------------------------------
// POST /remessa — Recebe GFG0010, valida estrutura + negócio, retorna GFGF010R
// ---------------------------------------------------------------------------

app.post('/remessa', (req, res) => {
  console.log('\n[POST] /remessa (FGO)');

  const conteudo = typeof req.body === 'string' ? req.body : '';
  if (!conteudo.trim()) {
    return res.status(400).json({
      erro: 'Body vazio. Envie o conteúdo do arquivo GFG0010 como text/plain.',
    });
  }

  const { registros } = parsearArquivo(conteudo);
  const detalhes      = registros.filter(r => ['03', '04', '05'].includes(r.tipo));

  console.log(`  Registros: ${registros.length} | Header: ${registros[0]?.tipo === '01' ? 'OK' : 'AUSENTE'} | Trailer: ${registros[registros.length-1]?.tipo === '99' ? 'OK' : 'AUSENTE'}`);
  console.log(`  Detalhes: 03=${detalhes.filter(d=>d.tipo==='03').length} 04=${detalhes.filter(d=>d.tipo==='04').length} 05=${detalhes.filter(d=>d.tipo==='05').length}`);

  const errosEstruturais = validarEstrutura({ registros });
  const agora            = new Date();
  const aprovada         = errosEstruturais.length === 0;

  // Valida regras de negócio dos detalhes (simulação do 2º Retorno)
  const registrosValidados = validarDetalhes({
    registros,
    dataEntregaRemessa: agora,
  });

  const totalRejeitados = registrosValidados.filter(r => r.status === 'REJEITADO').length;

  if (aprovada) {
    console.log(`  -> 1º Retorno: APROVADA | Detalhes: ${registrosValidados.length - totalRejeitados} aprovados, ${totalRejeitados} rejeitados`);
  } else {
    console.log(`  -> 1º Retorno: REJEITADA | ${errosEstruturais.length} erro(s) estruturais`);
    errosEstruturais.forEach(e => console.log(`     [${e.codigo}] ${e.descricao}`));
  }

  const retorno = gerarPrimeiroRetorno({ registros, erros: errosEstruturais, agora });

  return res.status(200).json({
    aprovada,
    erros: errosEstruturais,
    resumo: {
      totalRegistros:     registros.length,
      detalhes: {
        formalizacao:     detalhes.filter(d => d.tipo === '03').length,
        liberacao:        detalhes.filter(d => d.tipo === '04').length,
        saldo:            detalhes.filter(d => d.tipo === '05').length,
      },
      registrosAprovados: registrosValidados.filter(r => r.status === 'APROVADO').length,
      registrosRejeitados: totalRejeitados,
    },
    registros: registrosValidados,
    retorno,
  });
});

// ---------------------------------------------------------------------------
// POST /remessa/upload — multipart/form-data (Postman / curl --form)
// curl --location 'http://localhost:9002/remessa/upload' \
//   --form 'arquivo=@"/caminho/arquivo.txt"'
// ---------------------------------------------------------------------------

app.post('/remessa/upload', (req, res) => {
  console.log('\n[POST] /remessa/upload (FGO — multipart)');

  if (!req.files || !req.files.arquivo) {
    return res.status(400).json({ erro: 'Nenhum arquivo recebido. Envie o arquivo no campo "arquivo" via form-data.' });
  }

  const conteudo = req.files.arquivo.data.toString('utf8');
  if (!conteudo.trim()) {
    return res.status(400).json({ erro: 'Arquivo enviado está vazio.' });
  }

  const { registros } = parsearArquivo(conteudo);
  const detalhes      = registros.filter(r => ['03', '04', '05'].includes(r.tipo));

  console.log(`  Arquivo: ${req.files.arquivo.name} (${req.files.arquivo.size} bytes)`);
  console.log(`  Registros: ${registros.length} | Header: ${registros[0]?.tipo === '01' ? 'OK' : 'AUSENTE'} | Trailer: ${registros[registros.length-1]?.tipo === '99' ? 'OK' : 'AUSENTE'}`);
  console.log(`  Detalhes: 03=${detalhes.filter(d=>d.tipo==='03').length} 04=${detalhes.filter(d=>d.tipo==='04').length} 05=${detalhes.filter(d=>d.tipo==='05').length}`);

  const errosEstruturais   = validarEstrutura({ registros });
  const agora              = new Date();
  const aprovada           = errosEstruturais.length === 0;
  const registrosValidados = validarDetalhes({ registros, dataEntregaRemessa: agora });
  const totalRejeitados    = registrosValidados.filter(r => r.status === 'REJEITADO').length;

  if (aprovada) {
    console.log(`  -> 1º Retorno: APROVADA | ${registrosValidados.length - totalRejeitados} aprovados, ${totalRejeitados} rejeitados`);
  } else {
    console.log(`  -> 1º Retorno: REJEITADA | ${errosEstruturais.length} erro(s) estruturais`);
    errosEstruturais.forEach(e => console.log(`     [${e.codigo}] ${e.descricao}`));
  }

  const retorno = gerarPrimeiroRetorno({ registros, erros: errosEstruturais, agora });

  return res.status(200).json({
    aprovada,
    erros: errosEstruturais,
    resumo: {
      totalRegistros: registros.length,
      detalhes: {
        formalizacao: detalhes.filter(d => d.tipo === '03').length,
        liberacao:    detalhes.filter(d => d.tipo === '04').length,
        saldo:        detalhes.filter(d => d.tipo === '05').length,
      },
      registrosAprovados:  registrosValidados.filter(r => r.status === 'APROVADO').length,
      registrosRejeitados: totalRejeitados,
    },
    registros: registrosValidados,
    retorno,
  });
});

// ---------------------------------------------------------------------------
// POST /validar  — Relatório de conformidade campo a campo
// Aceita text/plain (--data-binary) ou multipart/form-data (--form 'arquivo=@')
//
// Diferença em relação ao POST /remessa:
//   - Não gera arquivo GFGF010R
//   - Detalha cada campo de cada registro com valor + status + regra violada
//   - Organiza o relatório por registro e por tipo de validação
// ---------------------------------------------------------------------------

function extrairCamposHeader(raw) {
  return {
    seq:           { pos: '1-7',   val: campo(raw,1,7),   ok: /^\d{7}$/.test(campo(raw,1,7)) },
    tipo:          { pos: '8-9',   val: campo(raw,8,9),   ok: campo(raw,8,9) === '01' },
    nomeArquivo:   { pos: '10-17', val: campo(raw,10,17), ok: campo(raw,10,17) === 'GFGF0010' },
    versaoLeiaute: { pos: '18-25', val: campo(raw,18,25), ok: campo(raw,18,25) === '20170331' },
    agente:        { pos: '26-28', val: campo(raw,26,28), ok: /^\d{3}$/.test(campo(raw,26,28)) },
    fundo:         { pos: '29-31', val: campo(raw,29,31), ok: campo(raw,29,31) === '010' },
    numRemessa:    { pos: '32-35', val: campo(raw,32,35), ok: campo(raw,32,35) !== '0000' && /^\d{4}$/.test(campo(raw,32,35)) },
    espacos:       { pos: '36-211', val: '(176 espaços)',  ok: campo(raw,36,211).trim() === '' },
  };
}

function extrairCamposTipo03(raw) {
  const dtForm = campo(raw,106,113);
  const dtVenc = campo(raw,114,121);
  const cpf14  = campo(raw,42,55);
  const cpf11  = cpf14.substring(3);
  return {
    seq:           { pos: '1-7',    val: campo(raw,1,7),     ok: /^\d{7}$/.test(campo(raw,1,7)) },
    tipo:          { pos: '8-9',    val: campo(raw,8,9),     ok: campo(raw,8,9) === '03' },
    codigoOp:      { pos: '10-29',  val: campo(raw,10,29),   ok: /^[A-Z0-9]/.test(campo(raw,10,29)[0]) },
    agencia:       { pos: '30-33',  val: campo(raw,30,33),   ok: /^\d{4}$/.test(campo(raw,30,33)) },
    ibge:          { pos: '34-40',  val: campo(raw,34,40),   ok: /^\d{7}$/.test(campo(raw,34,40)) },
    tipoPessoa:    { pos: '41',     val: campo(raw,41,41),   ok: campo(raw,41,41) === '1' },
    cpf:           { pos: '42-55',  val: cpf14,              ok: /^\d{14}$/.test(cpf14) && validarCPF(cpf11) },
    publicoAlvo:   { pos: '56-57',  val: campo(raw,56,57),   ok: campo(raw,56,57) === '07' },
    rendaMensal:   { pos: '58-74',  val: campo(raw,58,74),   ok: /^\d{17}$/.test(campo(raw,58,74)) && parsearMonetario(campo(raw,58,74)) <= RENDA_MAX_5SM },
    valorOperacao: { pos: '75-91',  val: campo(raw,75,91),   ok: /^\d{17}$/.test(campo(raw,75,91)) && parsearMonetario(campo(raw,75,91)) > 0 && parsearMonetario(campo(raw,75,91)) <= VALOR_MAX_OPERACAO },
    percGarantia:  { pos: '92-96',  val: campo(raw,92,96),   ok: campo(raw,92,96) === '10000' },
    modalidade:    { pos: '97',     val: campo(raw,97,97),   ok: campo(raw,97,97) === '1' },
    finalidade:    { pos: '98',     val: campo(raw,98,98),   ok: campo(raw,98,98) === '3' },
    fonte:         { pos: '99-101', val: campo(raw,99,101),  ok: campo(raw,99,101) === '011' },
    programa:      { pos: '102-105',val: campo(raw,102,105), ok: campo(raw,102,105) === '0050' },
    dtFormalizacao:{ pos: '106-113',val: dtForm,             ok: /^\d{8}$/.test(dtForm) && parsearData(dtForm) !== null && parsearData(dtForm) >= DATA_MINIMA_FORMALIZACAO },
    dtVencimento:  { pos: '114-121',val: dtVenc,             ok: /^\d{8}$/.test(dtVenc) && parsearData(dtVenc) !== null && (parsearData(dtForm) ? parsearData(dtVenc) > parsearData(dtForm) : true) },
    cronograma:    { pos: '122',    val: campo(raw,122,122), ok: campo(raw,122,122) === '1' },
    condEspecial:  { pos: '123-124',val: campo(raw,123,124), ok: campo(raw,123,124) === '01' },
    dtDespacho:    { pos: '125-132',val: campo(raw,125,132), ok: campo(raw,125,132) === '00000000' },
    tpFormalizacao:{ pos: '133',    val: campo(raw,133,133), ok: campo(raw,133,133) === '1' },
    preValidacao:  { pos: '134-142',val: campo(raw,134,142), ok: campo(raw,134,142).trim() !== '' && campo(raw,134,142) !== '000000000' },
    subvencao:     { pos: '143-159',val: campo(raw,143,159), ok: campo(raw,143,159) === '00000000000000000' },
    cpfQualificador:{ pos: '160-170',val: campo(raw,160,170),ok: campo(raw,160,170).trim() === '' },
    espacosFinal:  { pos: '171-211',val: '(41 espaços)',     ok: campo(raw,171,211).trim() === '' },
  };
}

function extrairCamposTipo04(raw) {
  const dtLib = campo(raw,30,37);
  const vLib  = campo(raw,38,54);
  return {
    seq:          { pos: '1-7',   val: campo(raw,1,7),  ok: /^\d{7}$/.test(campo(raw,1,7)) },
    tipo:         { pos: '8-9',   val: campo(raw,8,9),  ok: campo(raw,8,9) === '04' },
    codigoOp:     { pos: '10-29', val: campo(raw,10,29),ok: /^[A-Z0-9]/.test(campo(raw,10,29)[0]) },
    dtLiberacao:  { pos: '30-37', val: dtLib,           ok: /^\d{8}$/.test(dtLib) && parsearData(dtLib) !== null },
    valorLiberado:{ pos: '38-54', val: vLib,            ok: /^\d{17}$/.test(vLib) && parsearMonetario(vLib) > 0 },
    espacosFinal: { pos: '55-211',val: '(157 espaços)', ok: campo(raw,55,211).trim() === '' },
  };
}

function extrairCamposTipo05(raw) {
  const dtAp   = campo(raw,30,37);
  const dtInad = campo(raw,108,115);
  const capA   = parsearMonetario(campo(raw,55,71));
  return {
    seq:           { pos: '1-7',    val: campo(raw,1,7),    ok: /^\d{7}$/.test(campo(raw,1,7)) },
    tipo:          { pos: '8-9',    val: campo(raw,8,9),    ok: campo(raw,8,9) === '05' },
    codigoOp:      { pos: '10-29',  val: campo(raw,10,29),  ok: /^[A-Z0-9]/.test(campo(raw,10,29)[0]) },
    dtApuracao:    { pos: '30-37',  val: dtAp,              ok: /^\d{8}$/.test(dtAp) && parsearData(dtAp) !== null },
    capNormalidade:{ pos: '38-54',  val: campo(raw,38,54),  ok: /^\d{17}$/.test(campo(raw,38,54)) },
    capAtraso:     { pos: '55-71',  val: campo(raw,55,71),  ok: /^\d{17}$/.test(campo(raw,55,71)) },
    encNormalidade:{ pos: '72-88',  val: campo(raw,72,88),  ok: /^\d{17}$/.test(campo(raw,72,88)) },
    encAtraso:     { pos: '89-105', val: campo(raw,89,105), ok: /^\d{17}$/.test(campo(raw,89,105)) },
    espacos106107: { pos: '106-107',val: campo(raw,106,107),ok: campo(raw,106,107) === '  ' },
    dtInadimplencia:{ pos: '108-115',val: dtInad,           ok: capA === 0 ? dtInad === '00000000' : /^\d{8}$/.test(dtInad) && parsearData(dtInad) !== null },
    indicePerdaEsp:{ pos: '116-122',val: campo(raw,116,122),ok: /^\d{7}$/.test(campo(raw,116,122)) && parseInt(campo(raw,116,122),10) <= 1000000 },
    espacosFinal:  { pos: '123-211',val: '(89 espaços)',    ok: campo(raw,123,211).trim() === '' },
  };
}

function extrairCamposTrailer(raw) {
  return {
    seq:           { pos: '1-7',   val: campo(raw,1,7),   ok: /^\d{7}$/.test(campo(raw,1,7)) },
    tipo:          { pos: '8-9',   val: campo(raw,8,9),   ok: campo(raw,8,9) === '99' },
    qtdRegistros:  { pos: '10-16', val: campo(raw,10,16), ok: /^\d{7}$/.test(campo(raw,10,16)) },
    espacosFinal:  { pos: '17-211',val: '(195 espaços)',  ok: campo(raw,17,211).trim() === '' },
  };
}

function processarValidacao(conteudo) {
  const { registros } = parsearArquivo(conteudo);
  const agora = new Date();

  // validações estruturais existentes
  const errosEstruturais = validarEstrutura({ registros });
  const regrasNegocio    = validarDetalhes({ registros, dataEntregaRemessa: agora });

  // relatório campo a campo
  const relatorio = registros.map(reg => {
    let campos = {};
    if (reg.tipo === '01') campos = extrairCamposHeader(reg.raw);
    else if (reg.tipo === '03') campos = extrairCamposTipo03(reg.raw);
    else if (reg.tipo === '04') campos = extrairCamposTipo04(reg.raw);
    else if (reg.tipo === '05') campos = extrairCamposTipo05(reg.raw);
    else if (reg.tipo === '99') campos = extrairCamposTrailer(reg.raw);

    const camposNok    = Object.entries(campos).filter(([,v]) => !v.ok).map(([k,v]) => ({ campo: k, pos: v.pos, valor: v.val }));
    const regraViolada = regrasNegocio.find(r => r.numSeq === reg.numSeq);

    return {
      numSeq:         reg.numSeq,
      tipo:           reg.tipo,
      largura:        reg.raw.length,
      larguraOk:      reg.raw.length === 211,
      camposInvalidos: camposNok,
      regrasNegocio:  regraViolada?.erros ?? [],
      status:         camposNok.length === 0 && (regraViolada?.erros?.length ?? 0) === 0 ? 'OK' : 'NOK',
    };
  });

  const totalOk  = relatorio.filter(r => r.status === 'OK').length;
  const totalNok = relatorio.filter(r => r.status === 'NOK').length;

  return {
    conforme:         errosEstruturais.length === 0 && totalNok === 0,
    resumo: {
      totalRegistros: registros.length,
      registrosOk:    totalOk,
      registrosNok:   totalNok,
      errosEstruturais: errosEstruturais.length,
    },
    errosEstruturais,
    registros: relatorio,
  };
}

// ---------------------------------------------------------------------------
// Spec posicional fiel ao manual (seção 13.1)
// Cada entrada: { inicio, fim, tipo, descricao, esperado, validar(val, raw) }
// ---------------------------------------------------------------------------

const SPEC = {
  '01': [
    { inicio:1,   fim:7,   tipo:'N', descricao:'Nº sequencial do registro',          esperado:'7 dígitos ex: 0000001',  validar: v => /^\d{7}$/.test(v) },
    { inicio:8,   fim:9,   tipo:'N', descricao:'Código do tipo do registro',          esperado:'"01"',                  validar: v => v === '01' },
    { inicio:10,  fim:17,  tipo:'A', descricao:'Nome do Arquivo Remessa',             esperado:'"GFGF0010"',             validar: v => v === 'GFGF0010' },
    { inicio:18,  fim:25,  tipo:'D', descricao:'Versão do leiaute',                   esperado:'"20170331"',             validar: v => v === '20170331' },
    { inicio:26,  fim:28,  tipo:'N', descricao:'Código do Agente Financeiro',         esperado:'3 dígitos',             validar: v => /^\d{3}$/.test(v) },
    { inicio:29,  fim:31,  tipo:'N', descricao:'Código do Fundo Garantidor',          esperado:'"010"',                 validar: v => v === '010' },
    { inicio:32,  fim:35,  tipo:'N', descricao:'Nº sequencial da Remessa',            esperado:'0001–9999',             validar: v => /^\d{4}$/.test(v) && v !== '0000' },
    { inicio:36,  fim:211, tipo:'A', descricao:'Espaços (176)',                        esperado:'176 espaços',           validar: v => v.trim() === '' },
  ],
  '03': [
    { inicio:1,   fim:7,   tipo:'N', descricao:'Nº sequencial do registro',                    esperado:'7 dígitos',          validar: v => /^\d{7}$/.test(v) },
    { inicio:8,   fim:9,   tipo:'N', descricao:'Código do tipo do registro',                    esperado:'"03"',               validar: v => v === '03' },
    { inicio:10,  fim:29,  tipo:'A', descricao:'Código identificador da operação',              esperado:'1º char letra/dígito maiúsculo', validar: v => /^[A-Z0-9]/.test(v[0]) && /^[A-Z0-9.,\-\/ ]+$/.test(v.trim()) },
    { inicio:30,  fim:33,  tipo:'N', descricao:'Nº da agência (sem dígito verificador)',         esperado:'4 dígitos',          validar: v => /^\d{4}$/.test(v) },
    { inicio:34,  fim:40,  tipo:'N', descricao:'Código IBGE do município (sem DV)',             esperado:'7 dígitos',          validar: v => /^\d{7}$/.test(v) },
    { inicio:41,  fim:41,  tipo:'N', descricao:'Tipo de pessoa do mutuário',                   esperado:'"1" (pessoa física)', validar: v => v === '1' },
    { inicio:42,  fim:55,  tipo:'N', descricao:'CPF do mutuário (000 + 11 dígitos)',            esperado:'14 dígitos numéricos', validar: v => /^\d{14}$/.test(v) && validarCPF(v.substring(3)) },
    { inicio:56,  fim:57,  tipo:'N', descricao:'Código do público-alvo',                       esperado:'"07"',               validar: v => v === '07' },
    { inicio:58,  fim:74,  tipo:'M', descricao:'Valor da renda mensal (centavos)',              esperado:'17 dígitos, ≤ R$8.105,00', validar: v => /^\d{17}$/.test(v) && parseInt(v,10) > 0 && parseInt(v,10) <= RENDA_MAX_5SM },
    { inicio:75,  fim:91,  tipo:'M', descricao:'Valor da operação (centavos)',                  esperado:'17 dígitos, ≤ R$15.000,00', validar: v => /^\d{17}$/.test(v) && parseInt(v,10) > 0 && parseInt(v,10) <= VALOR_MAX_OPERACAO },
    { inicio:92,  fim:96,  tipo:'N', descricao:'Percentual da garantia FGO (2 casas decimais)', esperado:'"10000" = 100%',     validar: v => v === '10000' },
    { inicio:97,  fim:97,  tipo:'N', descricao:'Código da modalidade de crédito',               esperado:'"1"',               validar: v => v === '1' },
    { inicio:98,  fim:98,  tipo:'N', descricao:'Código da finalidade do crédito',               esperado:'"3"',               validar: v => v === '3' },
    { inicio:99,  fim:101, tipo:'N', descricao:'Código da fonte de recursos',                   esperado:'"011"',             validar: v => v === '011' },
    { inicio:102, fim:105, tipo:'N', descricao:'Código do programa de crédito',                 esperado:'"0050" (FGO Novo Desenrola)', validar: v => v === '0050' },
    { inicio:106, fim:113, tipo:'D', descricao:'Data da formalização da operação',              esperado:'AAAAMMDD ≥ 05052026', validar: v => /^\d{8}$/.test(v) && parsearData(v) !== null && parsearData(v) >= DATA_MINIMA_FORMALIZACAO },
    { inicio:114, fim:121, tipo:'D', descricao:'Data de vencimento da operação',                esperado:'AAAAMMDD > dt formalização', validar: (v,r) => /^\d{8}$/.test(v) && parsearData(v) !== null && parsearData(v) > (parsearData(campo(r,106,113)) || new Date(0)) },
    { inicio:122, fim:122, tipo:'N', descricao:'Código do tipo de cronograma de amortizações',  esperado:'"1"',               validar: v => v === '1' },
    { inicio:123, fim:124, tipo:'N', descricao:'Código de condição especial da operação',       esperado:'"01" (sem condição)', validar: v => v === '01' },
    { inicio:125, fim:132, tipo:'D', descricao:'Data do despacho externo',                      esperado:'"00000000"',        validar: v => v === '00000000' },
    { inicio:133, fim:133, tipo:'N', descricao:'Código do tipo de formalização',                esperado:'"1" (Ordinária)',    validar: v => v === '1' },
    { inicio:134, fim:142, tipo:'N', descricao:'Número da pré-validação do evento',             esperado:'9 dígitos não nulos', validar: v => /^\d{9}$/.test(v) && v !== '000000000' },
    { inicio:143, fim:159, tipo:'M', descricao:'Valor da subvenção',                            esperado:'zeros "00000000000000000"', validar: v => v === '00000000000000000' },
    { inicio:160, fim:170, tipo:'N', descricao:'CPF Qualificador da Operação',                  esperado:'11 espaços (não informar)', validar: v => v.trim() === '' },
    { inicio:171, fim:211, tipo:'A', descricao:'Espaços (41)',                                   esperado:'41 espaços',        validar: v => v.trim() === '' },
  ],
  '04': [
    { inicio:1,  fim:7,   tipo:'N', descricao:'Nº sequencial do registro',              esperado:'7 dígitos',        validar: v => /^\d{7}$/.test(v) },
    { inicio:8,  fim:9,   tipo:'N', descricao:'Código do tipo do registro',              esperado:'"04"',             validar: v => v === '04' },
    { inicio:10, fim:29,  tipo:'A', descricao:'Código identificador da operação',        esperado:'1º char maiúsculo/dígito', validar: v => /^[A-Z0-9]/.test(v[0]) },
    { inicio:30, fim:37,  tipo:'D', descricao:'Data da liberação de crédito',            esperado:'AAAAMMDD válida',  validar: v => /^\d{8}$/.test(v) && parsearData(v) !== null },
    { inicio:38, fim:54,  tipo:'M', descricao:'Valor da liberação de crédito (centavos)',esperado:'17 dígitos > 0',   validar: v => /^\d{17}$/.test(v) && parseInt(v,10) > 0 },
    { inicio:55, fim:211, tipo:'A', descricao:'Espaços (157)',                            esperado:'157 espaços',     validar: v => v.trim() === '' },
  ],
  '05': [
    { inicio:1,   fim:7,   tipo:'N', descricao:'Nº sequencial do registro',                    esperado:'7 dígitos',           validar: v => /^\d{7}$/.test(v) },
    { inicio:8,   fim:9,   tipo:'N', descricao:'Código do tipo do registro',                    esperado:'"05"',                validar: v => v === '05' },
    { inicio:10,  fim:29,  tipo:'A', descricao:'Código identificador da operação',              esperado:'1º char maiúsculo/dígito', validar: v => /^[A-Z0-9]/.test(v[0]) },
    { inicio:30,  fim:37,  tipo:'D', descricao:'Data de apuração dos saldos',                   esperado:'AAAAMMDD último dia do mês', validar: v => { if(!/^\d{8}$/.test(v)) return false; const d=parsearData(v); if(!d) return false; const p=new Date(d); p.setDate(p.getDate()+1); return p.getMonth()!==d.getMonth(); } },
    { inicio:38,  fim:54,  tipo:'M', descricao:'Saldo devedor de capital em normalidade',       esperado:'17 dígitos ≥ 0',      validar: v => /^\d{17}$/.test(v) },
    { inicio:55,  fim:71,  tipo:'M', descricao:'Saldo devedor de capital em atraso',            esperado:'17 dígitos ≥ 0',      validar: v => /^\d{17}$/.test(v) },
    { inicio:72,  fim:88,  tipo:'M', descricao:'Saldo devedor de encargos em normalidade',      esperado:'17 dígitos ≥ 0',      validar: v => /^\d{17}$/.test(v) },
    { inicio:89,  fim:105, tipo:'M', descricao:'Saldo devedor de encargos em atraso',           esperado:'17 dígitos ≥ 0',      validar: v => /^\d{17}$/.test(v) },
    { inicio:106, fim:107, tipo:'A', descricao:'Espaços (não preencher com zeros)',              esperado:'2 espaços',           validar: v => v === '  ' },
    { inicio:108, fim:115, tipo:'D', descricao:'Data de início da inadimplência de capital',    esperado:'AAAAMMDD ou "00000000" se sem atraso', validar: (v,r) => { const ca=parseInt(campo(r,55,71),10); return ca===0 ? v==='00000000' : /^\d{8}$/.test(v) && parsearData(v)!==null; } },
    { inicio:116, fim:122, tipo:'N', descricao:'Índice de perda esperada (6 casas decimais)',   esperado:'7 dígitos 0000000–1000000', validar: v => /^\d{7}$/.test(v) && parseInt(v,10) <= 1000000 },
    { inicio:123, fim:211, tipo:'A', descricao:'Espaços (89)',                                   esperado:'89 espaços',          validar: v => v.trim() === '' },
  ],
  '99': [
    { inicio:1,  fim:7,   tipo:'N', descricao:'Nº sequencial do registro',          esperado:'7 dígitos',         validar: v => /^\d{7}$/.test(v) },
    { inicio:8,  fim:9,   tipo:'N', descricao:'Código do tipo do registro',          esperado:'"99"',              validar: v => v === '99' },
    { inicio:10, fim:16,  tipo:'N', descricao:'Quantidade de registros no arquivo', esperado:'total incl. header e trailer', validar: v => /^\d{7}$/.test(v) && parseInt(v,10) > 0 },
    { inicio:17, fim:211, tipo:'A', descricao:'Espaços (195)',                        esperado:'195 espaços',       validar: v => v.trim() === '' },
  ],
};

function validarPosicional(conteudo) {
  const { registros } = parsearArquivo(conteudo);

  return registros.map(reg => {
    const spec = SPEC[reg.tipo];
    if (!spec) {
      return { numSeq: reg.numSeq, tipo: reg.tipo, largura: reg.raw.length, campos: [], erro: `Tipo "${reg.tipo}" não mapeado no spec` };
    }

    const campos = spec.map(s => {
      const valor  = campo(reg.raw, s.inicio, s.fim);
      const ok     = (() => { try { return s.validar(valor, reg.raw); } catch { return false; } })();
      return {
        inicio:    s.inicio,
        fim:       s.fim,
        tamanho:   s.fim - s.inicio + 1,
        tipo:      s.tipo,
        descricao: s.descricao,
        esperado:  s.esperado,
        valor:     valor.length > 30 ? valor.substring(0,30)+'…' : valor,
        status:    ok ? 'OK' : 'ERRO',
      };
    });

    return {
      numSeq:    reg.numSeq,
      tipo:      reg.tipo,
      largura:   reg.raw.length,
      larguraOk: reg.raw.length === 211,
      totalCampos: campos.length,
      camposOk:    campos.filter(c=>c.status==='OK').length,
      camposErro:  campos.filter(c=>c.status==='ERRO').length,
      campos,
    };
  });
}

function responderValidade(conteudo, res) {
  if (!conteudo.trim()) return res.status(400).json({ erro: 'Arquivo vazio.' });
  const registros   = validarPosicional(conteudo);
  const totalCampos = registros.reduce((s,r) => s + r.totalCampos, 0);
  const totalErros  = registros.reduce((s,r) => s + r.camposErro,  0);
  return res.json({
    conforme:     totalErros === 0,
    totalRegistros: registros.length,
    totalCampos,
    totalErros,
    registros,
  });
}

app.post('/remessa/validade', (req, res) => {
  console.log('\n[POST] /remessa/validade (posicional spec)');
  responderValidade(typeof req.body === 'string' ? req.body : '', res);
});

app.post('/remessa/upload/validade', (req, res) => {
  console.log('\n[POST] /remessa/upload/validade (posicional spec — multipart)');
  if (!req.files?.arquivo) return res.status(400).json({ erro: 'Campo "arquivo" não encontrado.' });
  responderValidade(req.files.arquivo.data.toString('utf8'), res);
});

app.post('/validar', (req, res) => {
  console.log('\n[POST] /validar (conformidade campo a campo)');
  const conteudo = typeof req.body === 'string' ? req.body : '';
  if (!conteudo.trim()) return res.status(400).json({ erro: 'Body vazio. Envie o GFG0010 como text/plain.' });
  return res.json(processarValidacao(conteudo));
});

app.post('/validar/upload', (req, res) => {
  console.log('\n[POST] /validar/upload (conformidade — multipart)');
  if (!req.files?.arquivo) return res.status(400).json({ erro: 'Campo "arquivo" não encontrado.' });
  return res.json(processarValidacao(req.files.arquivo.data.toString('utf8')));
});

// ---------------------------------------------------------------------------
// Geradores dos arquivos de Retorno (seções 13.3 a 13.6 do manual)
// Dados baseados no arquivo de teste GFG0010_remessa_teste.txt
//
// Verificação de tamanho embutida — lança erro se qualquer linha ≠ 211 chars.
// ---------------------------------------------------------------------------

const EX_AGENTE  = '001';
const EX_FUNDO   = '010';
const EX_REMESSA = '0001';

function assertar211(linha, contexto) {
  if (linha.length !== 211) throw new Error(`${contexto}: gerado ${linha.length} chars (esperado 211)`);
  return linha;
}

function trailerRetorno(seq) {
  // 7N + 2N + 7N + 195A = 211
  return assertar211(padL(seq, 7) + '99' + padL(seq, 7) + ' '.repeat(195), 'trailer');
}

// ── 2º Retorno: GFGF200R — Validação dos Eventos do Agente ─────────────────
// Header:  7N|2N|8A|8D|3N|3N|4N|8D|12A|14N|142A = 211
// Tipo 03: pos 1-170 cópia remessa | 17A | 3N | 1N | 17M | 3N = 211
// Tipo 04: pos 1-54  cópia remessa | 154A | 3N = 211
// Tipo 05: pos 1-122 cópia remessa | 86A  | 3N = 211
function gerarSegundoRetorno() {
  const hoje = formatarData(new Date());
  const linhas = [];
  let seq = 1;

  linhas.push(assertar211([
    padL(seq++, 7), '01', 'GFGF200R', '20170331',
    padL(EX_AGENTE, 3), padL(EX_FUNDO, 3), padL(EX_REMESSA, 4),
    hoje, ' '.repeat(12), CNPJ_MOCK, ' '.repeat(142),
  ].join(''), 'GFGF200R header'));

  // Helpers internos
  function t03(codOp, ag, ibge, cpf14, renda, valorOp, dtF, dtV, preVal, rej) {
    const d = padL(seq++,7)+'03'+codOp+padL(ag,4)+padL(ibge,7)+'1'+cpf14+'07'
      +padL(renda,17)+padL(valorOp,17)+'10000'+'1'+'3'+'011'+'0050'
      +dtF+dtV+'1'+'01'+'00000000'+'1'+padL(preVal,9)+padL(0,17)+' '.repeat(11);
    // d = 170 chars
    return assertar211(d+' '.repeat(17)+'000'+'0'+padL(0,17)+padL(rej,3), 'GFGF200R t03 '+codOp);
  }
  function t04(codOp, dtLib, valorLib, rej) {
    const d = padL(seq++,7)+'04'+codOp+dtLib+padL(valorLib,17); // 54
    return assertar211(d+' '.repeat(154)+padL(rej,3), 'GFGF200R t04 '+codOp);
  }
  function t05(codOp, dtAp, capN, capA, encN, encA, dtInad, indice, rej) {
    const d = padL(seq++,7)+'05'+codOp+dtAp+padL(capN,17)+padL(capA,17)
      +padL(encN,17)+padL(encA,17)+'  '+dtInad+padL(indice,7); // 122
    return assertar211(d+' '.repeat(86)+padL(rej,3), 'GFGF200R t05 '+codOp);
  }

  // OP001 — todos aprovados (rejeição 000)
  linhas.push(t03('OP001-DESENROLA-2026','0001','0530010','00011144477735', 80000, 500000,'20260510','20280510','123456789',0));
  linhas.push(t04('OP001-DESENROLA-2026','20260515',500000,0));
  linhas.push(t05('OP001-DESENROLA-2026','20260531',450000,0,20000,0,'00000000',51,0));

  // OP002 — todos aprovados
  linhas.push(t03('OP002-DESENROLA-2026','0002','3550308','00052998224725',200000,800000,'20260510','20280510','987654321',0));
  linhas.push(t04('OP002-DESENROLA-2026','20260520',800000,0));
  linhas.push(t05('OP002-DESENROLA-2026','20260531',0,700000,0,50000,'20260525',1500,0));

  linhas.push(trailerRetorno(seq));
  return linhas.join('\r\n');
}

// ── 3º Retorno: GFGF290R — Eventos do Administrador ────────────────────────
// Header:  igual ao 2º (7N|2N|8A|8D|3N|3N|4N|8D|12A|14N|142A) = 211
// Tipo 92 (Pendente):  7N|2N|20A|2N|8D|8D|2N|8D|154A = 211
// Tipo 93 (Encerrada): 7N|2N|20A|2N|8D|172A = 211
// Tipo 94 (Impugnada): 7N|2N|20A|2N|8D|172A = 211
// Tipo 95 (Liq.honra): 7N|2N|20A|8D|174A = 211
function gerarTerceiroRetorno() {
  const hoje = formatarData(new Date());
  const linhas = [];
  let seq = 1;

  linhas.push(assertar211([
    padL(seq++, 7), '01', 'GFGF290R', '20170331',
    padL(EX_AGENTE, 3), padL(EX_FUNDO, 3), padL(EX_REMESSA, 4),
    hoje, ' '.repeat(12), CNPJ_MOCK, ' '.repeat(142),
  ].join(''), 'GFGF290R header'));

  // Tipo 92 — OP002 pendente de informação de saldo (situação ATRASADA)
  linhas.push(assertar211(
    padL(seq++,7)+'92'+'OP002-DESENROLA-2026'
    +'01'         // tipo pendência: 01 = pendente de saldo
    +'20260531'   // dt última informação de saldo
    +'20280510'   // dt vencimento
    +'02'         // situação: 02 = ATRASADA
    +hoje         // dt início da pendência
    +' '.repeat(154),
  'GFGF290R t92'));

  // Tipo 93 — OP001 encerrada pelo Administrador (exemplo)
  linhas.push(assertar211(
    padL(seq++,7)+'93'+'OP001-DESENROLA-2026'
    +'02'         // motivo encerramento: 02 = liquidação sem honra
    +'20261231'   // dt encerramento
    +' '.repeat(172),
  'GFGF290R t93'));

  // Tipo 94 — exemplo de impugnação
  linhas.push(assertar211(
    padL(seq++,7)+'94'+'OP002-DESENROLA-2026'
    +'01'         // motivo impugnação: 01 = dados divergentes
    +'20261001'   // dt impugnação
    +' '.repeat(172),
  'GFGF290R t94'));

  // Tipo 95 — liquidação de saldo honrado
  linhas.push(assertar211(
    padL(seq++,7)+'95'+'OP001-DESENROLA-2026'
    +'20270115'   // dt liquidação do saldo honrado
    +' '.repeat(174),
  'GFGF290R t95'));

  linhas.push(trailerRetorno(seq));
  return linhas.join('\r\n');
}

// ── 4º Retorno: GFGF450R — Movimentação Financeira ─────────────────────────
// Header: 7N|2N|8A|8D|3N|3N|4N|20A|14N|142A = 211
// Tipo 97: 7N|2N|20A|2N|8D|8D|17M|17M|17M|17M|7N|89A = 211
function gerarQuartoRetorno() {
  const hoje = formatarData(new Date());
  const linhas = [];
  let seq = 1;

  linhas.push(assertar211([
    padL(seq++, 7), '01', 'GFGF450R', '20170331',
    padL(EX_AGENTE, 3), padL(EX_FUNDO, 3), padL(EX_REMESSA, 4),
    ' '.repeat(20), CNPJ_MOCK, ' '.repeat(142),
  ].join(''), 'GFGF450R header'));

  function t97(codOp, tipoMov, dtMov, dtFG, nomCent, atzCent, issqnCent, liqCent, seqCaus) {
    return assertar211(
      padL(seq++,7)+'97'+codOp+tipoMov+dtMov+dtFG
      +padL(nomCent,17)+padL(atzCent,17)+padL(issqnCent,17)+padL(liqCent,17)
      +padL(seqCaus,7)+' '.repeat(89),
    'GFGF450R t97 '+codOp);
  }

  // OP001 — formalização (tipo 03 = sem movimentação financeira)
  linhas.push(t97('OP001-DESENROLA-2026','03','00000000','20260510',0,0,0,0,2));
  // OP001 — liberação (tipo 01 = débito ao fundo, CCG = 3% sobre R$5.000,00 = R$150,00)
  linhas.push(t97('OP001-DESENROLA-2026','01',hoje,'20260515',15000,0,0,15000,3));
  // OP002 — formalização
  linhas.push(t97('OP002-DESENROLA-2026','03','00000000','20260510',0,0,0,0,5));
  // OP002 — liberação (CCG 3% sobre R$8.000,00 = R$240,00)
  linhas.push(t97('OP002-DESENROLA-2026','01',hoje,'20260520',24000,0,0,24000,6));

  linhas.push(trailerRetorno(seq));
  return linhas.join('\r\n');
}

// ── Informativo Diário: GFGF270R ─────────────────────────────────────────────
// Header: 7N|2N|8A|8D|3N|3N|24A|14N|142A = 211
// Tipo 91: 7N|2N|4N|17M|1N|8D|17M|155A = 211
// Tipo 96: 7N|2N|17M|17M|17M|17M|17M|17M|5N|8D|87A = 211
// Tipo 98: 7N|2N|20A|8D|17M|157A = 211
function gerarInformativoDiario() {
  const hoje = formatarData(new Date());
  const linhas = [];
  let seq = 1;

  linhas.push(assertar211([
    padL(seq++, 7), '01', 'GFGF270R', '20170331',
    padL(EX_AGENTE, 3), padL(EX_FUNDO, 3),
    ' '.repeat(24), CNPJ_MOCK, ' '.repeat(142),
  ].join(''), 'GFGF270R header'));

  // Tipo 96 — Situação Patrimonial
  linhas.push(assertar211(
    padL(seq++,7)+'96'
    +padL(500000000,17)  // base de cálculo (R$5.000.000,00)
    +padL(0,17)           // zeros
    +padL(500000000,17)  // limite máximo carteira fundo
    +padL(50000000,17)   // limite máximo carteira agente (R$500.000,00)
    +padL(1300000,17)    // comprometido fundo (R$13.000,00 = OP001+OP002)
    +padL(1300000,17)    // comprometido agente
    +padL(0,5)            // zeros (5N)
    +hoje                 // dt situação patrimonial
    +' '.repeat(87),
  'GFGF270R t96'));

  // Tipo 91 — Remessa Pendente de Movimentação Financeira
  // CCG total = R$150 (OP001) + R$240 (OP002) = R$390 = 39000 centavos
  linhas.push(assertar211(
    padL(seq++,7)+'91'
    +padL(EX_REMESSA,4)  // nº remessa
    +padL(39000,17)       // valor a movimentar (R$390,00)
    +'1'                  // natureza: 1 = débito (agente deve ao FGO)
    +hoje                 // dt validade
    +padL(0,17)           // valor ISSQN
    +' '.repeat(155),
  'GFGF270R t91'));

  // Tipo 98 — Saldo Honrado a Recuperar (exemplo: honra de R$5.000 OP001)
  linhas.push(assertar211(
    padL(seq++,7)+'98'
    +'OP001-DESENROLA-2026'
    +'20270115'           // dt validade para cobrança
    +padL(500000,17)      // valor honrado a recuperar (R$5.000,00)
    +' '.repeat(157),
  'GFGF270R t98'));

  linhas.push(trailerRetorno(seq));
  return linhas.join('\r\n');
}

// ---------------------------------------------------------------------------
// GET /retorno/2  → GFGF200R (2º Retorno)
// GET /retorno/3  → GFGF290R (3º Retorno)
// GET /retorno/4  → GFGF450R (4º Retorno)
// GET /informativo → GFGF270R (Informativo Diário)
// ---------------------------------------------------------------------------

function salvarArquivoTeste(nome, conteudo) {
  try {
    fs.writeFileSync(path.join(ARQUIVOS_TESTE_DIR, nome), conteudo, 'utf8');
  } catch (_) {}
}

app.get('/retorno/1', (_req, res) => {
  // Gera um GFGF010R de exemplo com remessa aprovada (código 000)
  const registrosFake = [{
    tipo: '01',
    raw: padL(1,7)+'01'+'GFGF0010'+'20170331'
      +padL(EX_AGENTE,3)+padL(EX_FUNDO,3)+padL(EX_REMESSA,4)
      +' '.repeat(176),
  }];
  const conteudo = gerarPrimeiroRetorno({
    registros: registrosFake,
    erros:     [],
    agora:     new Date(),
  });
  salvarArquivoTeste('GFGF010R_1retorno_exemplo.txt', conteudo);
  res.type('text/plain').send(conteudo);
});

app.get('/retorno/2', (_req, res) => {
  const conteudo = gerarSegundoRetorno();
  salvarArquivoTeste('GFGF200R_2retorno_exemplo.txt', conteudo);
  res.type('text/plain').send(conteudo);
});

app.get('/retorno/3', (_req, res) => {
  const conteudo = gerarTerceiroRetorno();
  salvarArquivoTeste('GFGF290R_3retorno_exemplo.txt', conteudo);
  res.type('text/plain').send(conteudo);
});

app.get('/retorno/4', (_req, res) => {
  const conteudo = gerarQuartoRetorno();
  salvarArquivoTeste('GFGF450R_4retorno_exemplo.txt', conteudo);
  res.type('text/plain').send(conteudo);
});

app.get(['/informativo', '/retorno/informativo'], (_req, res) => {
  const conteudo = gerarInformativoDiario();
  salvarArquivoTeste('GFGF270R_informativo_exemplo.txt', conteudo);
  res.type('text/plain').send(conteudo);
});

// ---------------------------------------------------------------------------
// GET /cenarios
// ---------------------------------------------------------------------------

app.get('/cenarios', (req, res) => {
  res.json({
    descricao: 'Mock FGO — 1º Retorno (GFGF010R) + validações de negócio (seção 12)',
    uso: {
      metodo: 'POST /remessa',
      contentType: 'text/plain',
      formato: 'Arquivo posicional GFG0010 — 211 chars por linha',
    },
    regras_leiaute: {
      tipoA: 'Alfanumérico — alinhado à esquerda, espaços à direita. 1º char: letra MAIÚSCULA ou dígito. Demais: letras maiúsculas, dígitos, separadores (.,- / espaço). Letras minúsculas NÃO permitidas.',
      tipoN: 'Numérico — alinhado à direita, zeros à esquerda. Apenas dígitos. Sem letras, pontos, vírgulas, hífens, espaços.',
      tipoM: 'Moeda — 2 casas decimais implícitas, alinhado à direita, zeros à esquerda. Apenas dígitos.',
      tipoD: 'Data — formato AAAAMMDD. Apenas 8 dígitos numéricos.',
      tipoH: 'Hora — formato HHMMSS. Apenas 6 dígitos numéricos.',
      largura: 'Cada registro deve ter exatamente 211 caracteres. Sem separadores entre registros.',
    },
    validacoes_estruturais_1_retorno: {
      '002': 'Arquivo vazio (seção 14.1 código 002)',
      '004': 'Código do Fundo Garantidor inválido (esperado 010)',
      '005': 'Nº sequencial da Remessa é 0000',
      '006': 'Registro com largura diferente de 211 chars — Dado inválido no campo NÚMERO SEQUENCIAL DO REGISTRO',
      '009': 'Nome do arquivo de remessa inválido (esperado GFGF0010)',
      '015': 'Numeração dos registros fora de sequência',
      '017': 'Primeiro registro não é HEADER (tipo 01)',
      '018': 'Remessa sem registro trailer',
      '020': 'Quantidade de registros da remessa difere da quantidade informada no trailer',
      '999': 'Tipo de registro desconhecido — Remessa rejeitada por outro motivo',
    },
    validacoes_negocio_tipo03: {
      'V03-001':  '1º char do código identificador não é letra MAIÚSCULA ou dígito (tipo A)',
      'V03-029':  'Código identificador contém caractere inválido (tipo A: maiúsculas, dígitos, separadores)',
      'V03-030':  'Agência (tipo N) com formato inválido — deve ser 4 dígitos numéricos',
      'V03-031':  'Código IBGE (tipo N) com formato inválido — deve ser 7 dígitos numéricos',
      'V03-002':  'CPF formato inválido (não são 14 dígitos numéricos)',
      'V03-003': 'CPF com dígitos verificadores incorretos',
      'V03-004': 'Tipo de pessoa inválido (esperado 1)',
      'V03-005': 'Público-alvo inválido (esperado 07)',
      'V03-006': 'Renda mensal com formato inválido',
      'V03-007': 'Renda mensal excede 5 salários-mínimos (R$8.105,00)',
      'V03-008': 'Valor da operação com formato inválido',
      'V03-009': 'Valor da operação deve ser > 0',
      'V03-010': 'Valor da operação excede R$15.000,00',
      'V03-011': 'Percentual garantia inválido (esperado 10000)',
      'V03-012': 'Modalidade de crédito inválida (esperado 1)',
      'V03-013': 'Finalidade do crédito inválida (esperado 3)',
      'V03-014': 'Fonte de recursos inválida (esperado 011)',
      'V03-015': 'Código do programa inválido (esperado 0050)',
      'V03-016A': 'Data de formalização (tipo D) não contém 8 dígitos numéricos',
      'V03-016':  'Data de formalização inválida como data',
      'V03-017':  'Data de formalização anterior a 05/05/2026',
      'V03-018': 'Data de formalização superior à data de entrega',
      'V03-019A': 'Data de vencimento (tipo D) não contém 8 dígitos numéricos',
      'V03-019':  'Data de vencimento inválida como data',
      'V03-020': 'Data de vencimento ≤ data de formalização',
      'V03-021': 'Prazo formalização→vencimento > 1461 dias (48 meses)',
      'V03-022': 'Tipo de cronograma inválido (esperado 1)',
      'V03-023': 'Condição especial inválida (esperado 01)',
      'V03-024': 'Data despacho externo inválida (esperado 00000000)',
      'V03-025': 'Tipo de formalização inválido (esperado 1)',
      'V03-026': 'Número da pré-validação não informado',
      'V03-027': 'Valor da subvenção deve ser zeros',
      'V03-028': 'CPF Qualificador deve ser espaços',
    },
    validacoes_negocio_tipo04: {
      'V04-001': 'Data de liberação inválida',
      'V04-002': 'Data de liberação superior à data de entrega',
      'V04-003': 'Data de liberação anterior à data de formalização',
      'V04-004': 'Data de liberação ≥ data de vencimento',
      'V04-005': 'Valor da liberação com formato inválido',
      'V04-006': 'Valor da liberação deve ser > 0',
      'V04-007': 'Valor liberado > valor da operação',
    },
    validacoes_negocio_tipo05: {
      'V05-001': 'Data de apuração inválida',
      'V05-002': 'Data de apuração superior à data de entrega',
      'V05-003': 'Data de apuração não é o último dia do mês',
      'V05-004': 'Saldo capital normalidade com formato inválido',
      'V05-005': 'Saldo capital atraso com formato inválido',
      'V05-006': 'Saldo encargos normalidade com formato inválido',
      'V05-007': 'Saldo encargos atraso com formato inválido',
      'V05-008': 'Em normalidade (capital atraso=0), data inadimplência deve ser 00000000',
      'V05-009': 'Capital em atraso informado sem data de inadimplência',
      'V05-010': 'Data de inadimplência inválida',
      'V05-011': 'Data de inadimplência superior à data de entrega',
      'V05-012':  'Soma capital (normalidade+atraso) excede valor liberado',
      'V05-012B': 'Soma capital (normalidade+atraso) excede valor da operação (tipo 03)',
      'V05-013': 'Posições 106-107 devem ser espaços',
      'V05-014': 'Índice de perda esperada com formato inválido',
      'V05-015': 'Índice de perda esperada fora do intervalo 0000000–1000000',
    },
  });
});

// ---------------------------------------------------------------------------
// Inicia o servidor
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('  Mock FGO — 1º Retorno (GFGF010R) + validações seção 12');
  console.log(`  Rodando em: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('\nEndpoints:');
  console.log('  POST  /remessa   ->  Recebe GFG0010, valida e retorna GFGF010R');
  console.log('  GET   /cenarios  ->  Documentação dos campos e validações');
  console.log('\n' + '='.repeat(60) + '\n');
});
