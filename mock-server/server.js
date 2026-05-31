'use strict';

const express = require('express');
const app = express();

app.use((req, res, next) => {
  express.json({ strict: false })(req, res, (err) => {
    if (err) return next();
    next();
  });
});

app.disable('x-powered-by');

const PORT = process.env.PORT || 9001;

// ---------------------------------------------------------------------------
// Tabela de cenarios por CPF
// Prefixos:
//   000000 0 XXXX  →  fluxo consulta-saldo-liquido (Lambda 02 POST / Lambda 03 GET)
//   000000 1 XXXX  →  fluxo consulta-saldo-liquido (erros no GET)
//   000000 2 XXXX  →  fluxo inclusao-divida (Lambda 04 POST)
//   000000 3 XXXX  →  comportamentos especiais do GET consulta-saldo
// ---------------------------------------------------------------------------
const CENARIOS = {
  // ── CPFs do CSV de teste — retornam statusProtocolo 3 na 1ª chamada ────────
  '12345678901': { tipo: 'imediato' },
  '98765432100': { tipo: 'imediato' },
  '11122233344': { tipo: 'imediato' },

  // ── Fluxo consulta-saldo: erros no POST (Lambda 02) ──────────────────────
  '00000000400': { fase: 'saldo-post', status: 400, codigo: 3,  descricao: 'CPF invalido.' },
  '00000000407': { fase: 'saldo-post', status: 400, codigo: 7,  descricao: 'Nao e possivel realizar a operacao para o CPF informado.' },
  '00000000401': { fase: 'saldo-post', status: 401, codigo: 1,  descricao: 'Usuario nao autenticado.' },
  '00000000403': { fase: 'saldo-post', status: 403, codigo: 8,  descricao: 'Instituicao Financeira nao possui autorizacao do Trabalhador para o Programa Desenrola 2.0.' },
  '00000000404': { fase: 'saldo-post', status: 404, codigo: 9,  descricao: 'Trabalhador nao localizado na base do FGTS.' },
  '00000000409': { fase: 'saldo-post', status: 409, codigo: 12, descricao: 'Existe uma Operacao do Programa Desenrola 2.0 em andamento. Tente novamente mais tarde.' },
  '00000000500': { fase: 'saldo-post', status: 500, codigo: 2,  descricao: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' },

  // ── Fluxo consulta-saldo: erros no GET (Lambda 03) ───────────────────────
  '00000001401': { fase: 'saldo-get', status: 401, codigo: 1,  descricao: 'Usuario nao autenticado.' },
  '00000001403': { fase: 'saldo-get', status: 403, codigo: 8,  descricao: 'Instituicao Financeira nao possui autorizacao do Trabalhador para o Programa Desenrola 2.0.' },
  '00000001404': { fase: 'saldo-get', status: 404, codigo: 11, descricao: 'Protocolo nao localizado.' },
  '00000001500': { fase: 'saldo-get', status: 500, codigo: 2,  descricao: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' },

  // ── Fluxo consulta-saldo: comportamentos especiais do GET ─────────────────
  '00000002000': { fase: 'saldo-get', tipo: 'rejeitar' },
  '00000003000': { fase: 'saldo-get', tipo: 'imediato' },
  '00000004000': { fase: 'saldo-get', tipo: 'api-key-erro' },

  // ── Fluxo inclusao-divida: erros no POST (Lambda 04) ─────────────────────
  '00000020400': { fase: 'inclusao-post', status: 400, codigo: 4,  descricao: 'Valor Original invalido.' },
  '00000020401': { fase: 'inclusao-post', status: 401, codigo: 1,  descricao: 'Usuario nao autenticado.' },
  '00000020403': { fase: 'inclusao-post', status: 403, codigo: 8,  descricao: 'Instituicao Financeira nao possui autorizacao do Trabalhador para o Programa Desenrola 2.0.' },
  '00000020500': { fase: 'inclusao-post', status: 500, codigo: 2,  descricao: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' },
  '00000020202': { fase: 'inclusao-post', tipo: 'imediato' },

  // ── Rate limit 429 ───────────────────────────────────────────────────────
  '00000009000': { fase: 'saldo-post',    tipo: 'rate-limit' },
  '00000009001': { fase: 'saldo-post',    tipo: 'rate-limit-depois-ok' },
  '00000009010': { fase: 'saldo-get',     tipo: 'rate-limit' },
  '00000009020': { fase: 'inclusao-post', tipo: 'rate-limit' },
  '00000009030': { fase: 'inclusao-get',  tipo: 'rate-limit' },

  // ── CPFs reais de teste ───────────────────────────────────────────────────
  '76086470999': { fase: 'inclusao-get', tipo: 'rejeitar-na-terceira', motivoStatus: 'Nao foi possivel processar. Ja existe informacao de divida desta IF para o CPF informado.' },

  // ── Fluxo inclusao-divida: erros no GET (Lambda 05) ──────────────────────
  '00000041401': { fase: 'inclusao-get', status: 401, codigo: 1,  descricao: 'Usuario nao autenticado.' },
  '00000041403': { fase: 'inclusao-get', status: 403, codigo: 8,  descricao: 'Instituicao Financeira nao possui autorizacao do Trabalhador para o Programa Desenrola 2.0.' },
  '00000041404': { fase: 'inclusao-get', status: 404, codigo: 11, descricao: 'Protocolo nao localizado.' },
  '00000041500': { fase: 'inclusao-get', status: 500, codigo: 2,  descricao: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' },
  '00000042000': { fase: 'inclusao-get', tipo: 'rejeitar' },
  '00000043000': { fase: 'inclusao-get', tipo: 'imediato' },
};

// ---------------------------------------------------------------------------
// CPFs com cenários especiais (scenes)
// Adicione aqui novos CPFs para simular cenários específicos.
// ---------------------------------------------------------------------------
const cpfs_scenes = {
  // terminacao-01: status 3 imediato | saldo vrMaximoDebito: 1500.29 | inclusao normal
  '35264914801': { cena: 'terminacao-01' },
  '48901237601': { cena: 'terminacao-01' },
  '72836451901': { cena: 'terminacao-01' },
  '15794028301': { cena: 'terminacao-01' },
  '63482950701': { cena: 'terminacao-01' },
  '29157384001': { cena: 'terminacao-01' },
  '84703621501': { cena: 'terminacao-01' },
  '57069143801': { cena: 'terminacao-01' },
  '91438607201': { cena: 'terminacao-01' },
  '46821753901': { cena: 'terminacao-01' },

  // terminacao-02: progressao 1 → 2 → 3 no GET (3 tentativas)
  '58392047102': { cena: 'terminacao-02' },
  '74015286302': { cena: 'terminacao-02' },
  '31629487502': { cena: 'terminacao-02' },
  '96841370202': { cena: 'terminacao-02' },
  '47253918602': { cena: 'terminacao-02' },
  '83176540902': { cena: 'terminacao-02' },
  '20958173402': { cena: 'terminacao-02' },
  '65437290102': { cena: 'terminacao-02' },
  '12894365702': { cena: 'terminacao-02' },
  '79320681402': { cena: 'terminacao-02' },

  // terminacao-03: igual ao 01, mas saldo vrMaximoDebito = 0
  '46718253903': { cena: 'terminacao-03' },
  '83059174203': { cena: 'terminacao-03' },
  '27641830503': { cena: 'terminacao-03' },
  '51394762003': { cena: 'terminacao-03' },
  '94827053603': { cena: 'terminacao-03' },
  '38156290703': { cena: 'terminacao-03' },
  '70293841503': { cena: 'terminacao-03' },
  '15748062903': { cena: 'terminacao-03' },
  '62481539703': { cena: 'terminacao-03' },
  '89035274103': { cena: 'terminacao-03' },

  // terminacao-04: polling 1→2→3 no saldo | inclusao retorna statusProtocolo 4 (rejeitada)
  '73816540204': { cena: 'terminacao-04' },
  '40289317604': { cena: 'terminacao-04' },
  '85162094304': { cena: 'terminacao-04' },
  '28437165904': { cena: 'terminacao-04' },
  '67053482104': { cena: 'terminacao-04' },
  '91748320604': { cena: 'terminacao-04' },
  '34675809104': { cena: 'terminacao-04' },
  '56902473804': { cena: 'terminacao-04' },
  '14287630504': { cena: 'terminacao-04' },
  '79541028304': { cena: 'terminacao-04' },

  // terminacao-05: polling 1→2→3 com 3x rate-limit 429 antes de cada status
  '62749380105': { cena: 'terminacao-05' },
  '81053624705': { cena: 'terminacao-05' },
  '34792856105': { cena: 'terminacao-05' },
  '97025413605': { cena: 'terminacao-05' },
  '45381672905': { cena: 'terminacao-05' },
  '20867354105': { cena: 'terminacao-05' },
  '73514986205': { cena: 'terminacao-05' },
  '59238047605': { cena: 'terminacao-05' },
  '16475392805': { cena: 'terminacao-05' },
  '88142753905': { cena: 'terminacao-05' },

  // terminacao-06: polling 1→2→3 | 1ª chamada de cada endpoint retorna 400 API Key
  '54826193706': { cena: 'terminacao-06' },
  '71390428506': { cena: 'terminacao-06' },
  '39075864206': { cena: 'terminacao-06' },
  '87613250906': { cena: 'terminacao-06' },
  '23159487306': { cena: 'terminacao-06' },
  '60482735106': { cena: 'terminacao-06' },
  '95347021806': { cena: 'terminacao-06' },
  '17938456206': { cena: 'terminacao-06' },
  '43681972506': { cena: 'terminacao-06' },
  '28754309106': { cena: 'terminacao-06' },

  // terminacao-07: igual ao 02 (polling 1→2→3) | 1ª chamada → api-key erro, 2ª → rateLimit, 3ª+ normal
  '13579246807': { cena: 'terminacao-07' },
  '24681357907': { cena: 'terminacao-07' },
  '35792468007': { cena: 'terminacao-07' },
  '46803579107': { cena: 'terminacao-07' },
  '57914680207': { cena: 'terminacao-07' },
  '68025791307': { cena: 'terminacao-07' },
  '79136802407': { cena: 'terminacao-07' },
  '80247913507': { cena: 'terminacao-07' },
  '91358024607': { cena: 'terminacao-07' },
  '02469135707': { cena: 'terminacao-07' },

  // terminacao-08: igual ao 01 | saldo-post SEMPRE retorna API Key erro (testa retry infinito via fila)
  '13579246808': { cena: 'terminacao-08' },
  '24681357908': { cena: 'terminacao-08' },
  '35792468008': { cena: 'terminacao-08' },
  '46803579108': { cena: 'terminacao-08' },
  '57914680208': { cena: 'terminacao-08' },
  '68025791308': { cena: 'terminacao-08' },
  '79136802408': { cena: 'terminacao-08' },
  '80247913508': { cena: 'terminacao-08' },
  '91358024608': { cena: 'terminacao-08' },
  '02469135708': { cena: 'terminacao-08' },

  // terminacao-09: igual ao 01 | saldo-post SEMPRE retorna rate limit (testa retry infinito via fila)
  '13579246809': { cena: 'terminacao-09' },
  '24681357909': { cena: 'terminacao-09' },
  '35792468009': { cena: 'terminacao-09' },
  '46803579109': { cena: 'terminacao-09' },
  '57914680209': { cena: 'terminacao-09' },
  '68025791309': { cena: 'terminacao-09' },
  '79136802409': { cena: 'terminacao-09' },
  '80247913509': { cena: 'terminacao-09' },
  '91358024609': { cena: 'terminacao-09' },
  '02469135709': { cena: 'terminacao-09' },
};

function ehCenaTerminacao(cpf) {
  return cpfs_scenes[cpf]?.cena?.startsWith('terminacao-') ?? false;
}

function agora() {
  return new Date().toLocaleString('pt-BR').replace(', ', ' ');
}

function respCenaSaldo(res, protoNum, vrMaximoDebito = 1500.29) {
  const now = agora();
  return res.status(200).json({
    protocoloSolicitacao: protoNum,
    tipoProtocolo:        3,
    dataHoraSolicitacao:  now,
    statusProtocolo:      3,
    dataHoraConsulta:     now,
    vrMaximoDebito,
  });
}

function respCenaInclusao(res, protoNum) {
  const now = agora();
  return res.status(200).json({
    protocoloSolicitacao: protoNum,
    tipoProtocolo:        1,
    dataHoraSolicitacao:  now,
    statusProtocolo:      3,
    vrOriginal:           1000,
    vrRenegociado:        800,
    vrFgts:               800,
  });
}

const pollingCounts = {};
const apiKeyErroCounts = {};
const rateLimitCounts = {};
const protocoloTipo = {}; // protocolo -> 'saldo' | 'inclusao'
let protocoloCounter = 1000;

// Controla quais (cpf + endpoint) já dispararam o erro de API Key no terminacao-06
const apiKeyErroCenaFired = new Set();

function consumirApiKeyErroCena(res, cpf, endpoint) {
  const key = `${cpf}-${endpoint}`;
  if (apiKeyErroCenaFired.has(key)) return false;
  apiKeyErroCenaFired.add(key);
  console.log(`  -> HTTP 200 | scenes terminacao-06 | API Key erro (1ª chamada de ${endpoint})`);
  res.status(200).json({ erro: '400', mensagem: 'API Key não encontrada' });
  return true;
}

// Controla pré-erros do terminacao-07: 1ª chamada → api-key, 2ª → rateLimit, 3ª+ normal
const cena07PreErrors = {};

function consumirCena07PreError(res, cpf, endpoint) {
  const key = `${cpf}-${endpoint}`;
  if (cena07PreErrors[key] === undefined) cena07PreErrors[key] = 0;
  cena07PreErrors[key]++;
  const count = cena07PreErrors[key];

  if (count === 1) {
    console.log(`  -> HTTP 200 | scenes terminacao-07 | API Key erro (1ª chamada de ${endpoint})`);
    res.status(200).json({ erro: '400', mensagem: 'API Key não encontrada' });
    return true;
  }
  if (count === 2) {
    console.log(`  -> HTTP 200 | scenes terminacao-07 | rate limit (2ª chamada de ${endpoint})`);
    res.status(200).json({ erro: '429', mensagem: 'Limite da conta excedido. Detalhe: Not Set|mock|quota?ok|rate?failed' });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function respErro(res, status, codigo, descricao) {
  console.log(`  -> HTTP ${status} | codigo: ${codigo} | ${descricao}`);
  return res.status(status).json({ codigo, descricao });
}

function logReq(method, path, cpf) {
  console.log(`\n[${method}] ${path}`);
  console.log(`  CPF: ${cpf}`);
}

function gerarProtocolo() {
  const protocolo = ++protocoloCounter;
  pollingCounts[protocolo] = 0;
  return protocolo;
}

// ---------------------------------------------------------------------------
// POST /auth/realms/digio-apis/protocol/openid-connect/token  (RHSSO mock)
// ---------------------------------------------------------------------------
app.post('/auth/realms/digio-apis/protocol/openid-connect/token', (req, res) => {
  console.log('\n[POST] /auth/realms/digio-apis/protocol/openid-connect/token');
  console.log('  -> HTTP 200 | mock token emitido');
  return res.status(200).json({
    access_token: 'mock-access-token-desenrola',
    expires_in: 3600,
    token_type: 'Bearer',
  });
});

// ---------------------------------------------------------------------------
// POST /v1/trabalhadores/solicitacoes-consulta-saldo-liquido-simulado/:cpf
// (Lambda 02)
// ---------------------------------------------------------------------------
app.post('/v1/trabalhadores/solicitacoes-consulta-saldo-liquido-simulado/:cpf', (req, res) => {
  const { cpf } = req.params;
  logReq('POST', '/v1/trabalhadores/solicitacoes-consulta-saldo-liquido-simulado/:cpf', cpf);

  const c = CENARIOS[cpf];
  if (verificarRateLimit(res, cpf, 'saldo-post')) return;
  if (c?.fase === 'saldo-post' && c.status) return respErro(res, c.status, c.codigo, c.descricao);

  if (ehCenaTerminacao(cpf)) {
    const cena = cpfs_scenes[cpf].cena;

    if (cena === 'terminacao-08') {
      console.log(`  -> HTTP 200 | scenes terminacao-08 | API Key erro (sempre)`);
      return res.status(200).json({ erro: '400', mensagem: 'API Key não encontrada' });
    }
    if (cena === 'terminacao-09') {
      console.log(`  -> HTTP 200 | scenes terminacao-09 | rate limit (sempre)`);
      return respRateLimit(res);
    }

    const preErrorFired = cena === 'terminacao-07'
      ? consumirCena07PreError(res, cpf, 'saldo-post')
      : consumirApiKeyErroCena(res, cpf, 'saldo-post');
    if (preErrorFired) return;
    const protocolo = Number(cpf.slice(-4));
    protocoloTipo[protocolo] = 'saldo';
    pollingCounts[protocolo] = 0;
    console.log(`  -> HTTP 202 | protocolo (scenes): ${protocolo}`);
    return res.status(202).json({ protocolo });
  }

  const protocolo = gerarProtocolo();
  protocoloTipo[protocolo] = 'saldo';
  console.log(`  -> HTTP 202 | protocolo: ${protocolo}`);
  return res.status(202).json({ protocolo });
});

// ---------------------------------------------------------------------------
// GET /v1/trabalhadores/protocolos/consultas-protocolo/:cpf/:protocolo
// (Lambda 03)
// ---------------------------------------------------------------------------
app.get('/v1/trabalhadores/protocolos/consultas-protocolo/:cpf/:protocolo', (req, res) => {
  const { cpf, protocolo } = req.params;
  logReq('GET', '/v1/trabalhadores/protocolos/consultas-protocolo/:cpf/:protocolo', cpf);
  console.log(`  protocolo: ${protocolo}`);

  if (ehCenaTerminacao(cpf)) return handleCenaTerminacao(res, cpf, protocolo);
  return handleCenarios(res, cpf, protocolo);
});

const cenaGetHandlers = {
  'terminacao-01': (res, cpf, protoNum, isInclusao) => {
    console.log(`  -> HTTP 200 | scenes terminacao-01 | ${isInclusao ? 'inclusao' : 'saldo'} | protocolo: ${protoNum}`);
    return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum);
  },
  'terminacao-02': (res, _cpf, protoNum, isInclusao) => handleCenaTerminacao02(res, protoNum, isInclusao),
  'terminacao-03': (res, cpf, protoNum, isInclusao) => {
    console.log(`  -> HTTP 200 | scenes terminacao-03 | ${isInclusao ? 'inclusao' : 'saldo'} | protocolo: ${protoNum}`);
    return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum, 0);
  },
  'terminacao-04': (res, _cpf, protoNum, isInclusao) => handleCenaTerminacao04(res, protoNum, isInclusao),
  'terminacao-05': (res, _cpf, protoNum, isInclusao) => handleCenaTerminacao05(res, protoNum, isInclusao),
  'terminacao-06': (res, cpf, protoNum, isInclusao) => {
    if (consumirApiKeyErroCena(res, cpf, 'consultar-protocolo')) return;
    return handleCenaTerminacao02(res, protoNum, isInclusao);
  },
  'terminacao-07': (res, cpf, protoNum, isInclusao) => {
    if (consumirCena07PreError(res, cpf, 'consultar-protocolo')) return;
    return handleCenaTerminacao02(res, protoNum, isInclusao);
  },
  'terminacao-08': (res, _cpf, protoNum, isInclusao) => {
    console.log(`  -> HTTP 200 | scenes terminacao-08 | ${isInclusao ? 'inclusao' : 'saldo'} | protocolo: ${protoNum}`);
    return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum);
  },
  'terminacao-09': (res, _cpf, protoNum, isInclusao) => {
    console.log(`  -> HTTP 200 | scenes terminacao-09 | ${isInclusao ? 'inclusao' : 'saldo'} | protocolo: ${protoNum}`);
    return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum);
  },
};

function handleCenaTerminacao(res, cpf, protocolo) {
  const protoNum   = Number(protocolo);
  const cena       = cpfs_scenes[cpf].cena;
  const isInclusao = protocoloTipo[protoNum] === 'inclusao';
  return cenaGetHandlers[cena]?.(res, cpf, protoNum, isInclusao);
}

function handleCenaTerminacao02(res, protoNum, isInclusao) {
  pollingCounts[protoNum] = (pollingCounts[protoNum] ?? 0) + 1;
  const count           = pollingCounts[protoNum];
  const statusProtocolo = Math.min(count, 3);
  console.log(`  -> HTTP 200 | scenes terminacao-02 | ${isInclusao ? 'inclusao' : 'saldo'} | status: ${statusProtocolo} (chamada #${count})`);

  if (statusProtocolo < 3) {
    return res.status(200).json({
      protocoloSolicitacao: protoNum,
      tipoProtocolo:        isInclusao ? 1 : 3,
      dataHoraSolicitacao:  agora(),
      statusProtocolo,
    });
  }
  return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum);
}

function handleCenaTerminacao04(res, protoNum, isInclusao) {
  pollingCounts[protoNum] = (pollingCounts[protoNum] ?? 0) + 1;
  const count           = pollingCounts[protoNum];
  const statusProtocolo = Math.min(count, 3);
  console.log(`  -> HTTP 200 | scenes terminacao-04 | ${isInclusao ? 'inclusao' : 'saldo'} | status: ${statusProtocolo} (chamada #${count})`);

  if (statusProtocolo < 3) {
    return res.status(200).json({
      protocoloSolicitacao: protoNum,
      tipoProtocolo:        isInclusao ? 1 : 3,
      dataHoraSolicitacao:  agora(),
      statusProtocolo,
    });
  }

  if (isInclusao) {
    return res.status(200).json({
      protocoloSolicitacao: protoNum,
      tipoProtocolo:        1,
      dataHoraSolicitacao:  agora(),
      statusProtocolo:      4,
      motivoStatus:         'Não foi possível processar. Já existe informação de dívida desta IF para o CPF informado.',
    });
  }

  return respCenaSaldo(res, protoNum);
}

function handleCenaTerminacao05(res, protoNum, isInclusao) {
  pollingCounts[protoNum] = (pollingCounts[protoNum] ?? 0) + 1;
  const count = pollingCounts[protoNum];
  const mod   = (count - 1) % 4;
  const phase = Math.floor((count - 1) / 4) + 1;

  // Após atingir status 3, repete o retorno final
  if (phase > 3) {
    console.log(`  -> HTTP 200 | scenes terminacao-05 | final (repeat) | protocolo: ${protoNum}`);
    return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum);
  }

  // 3 rate-limits antes de cada status
  if (mod < 3) {
    console.log(`  -> HTTP 200 | scenes terminacao-05 | rate-limit (${mod + 1}/3) antes do status ${phase}`);
    return res.status(200).json({
      erro: '429',
      mensagem: 'Limite da conta excedido. Detalhe: Not Set|l7194d012b9c444587937e201963ef82d7|5710e733-1605-44dc-bbfb-f316c14055ba|quota?ok|rate?failed',
    });
  }

  // 4ª chamada de cada fase: retorna o status
  const statusProtocolo = phase;
  console.log(`  -> HTTP 200 | scenes terminacao-05 | ${isInclusao ? 'inclusao' : 'saldo'} | status: ${statusProtocolo} (chamada #${count})`);

  if (statusProtocolo >= 3) {
    return isInclusao ? respCenaInclusao(res, protoNum) : respCenaSaldo(res, protoNum);
  }

  return res.status(200).json({
    protocoloSolicitacao: protoNum,
    tipoProtocolo:        isInclusao ? 1 : 3,
    dataHoraSolicitacao:  agora(),
    statusProtocolo,
  });
}

function handleCenarios(res, cpf, protocolo) {
  const c          = CENARIOS[cpf];
  const isInclusao = protocoloTipo[Number(protocolo)] === 'inclusao' || c?.fase === 'inclusao-get';

  if (verificarRateLimit(res, cpf, isInclusao ? 'inclusao-get' : 'saldo-get')) return;
  if (c?.status && (c.fase === 'saldo-get' || c.fase === 'inclusao-get')) {
    return respErro(res, c.status, c.codigo, c.descricao);
  }
  if (c?.tipo === 'api-key-erro' && responderApiKeyErro(res, cpf)) return;

  const base = montarBase(protocolo, isInclusao);

  if (c?.tipo === 'rejeitar')          return responderRejeitado(res, base, isInclusao, c.motivoStatus);
  if (c?.tipo === 'rejeitar-na-terceira') return responderRejeitarNaTerceira(res, base, protocolo, isInclusao, c.motivoStatus);
  if (c?.tipo === 'imediato')          return responderImediato(res, base, isInclusao);

  return responderProgressao(res, base, protocolo, isInclusao);
}

function respRateLimit(res) {
  console.log(`  -> HTTP 200 | rate limit 429 simulado`);
  return res.status(200).json({ erro: '429', mensagem: 'Limite da conta excedido. Detalhe: Not Set|mock|quota?ok|rate?failed' });
}

function verificarRateLimit(res, cpf, tipo) {
  const c = CENARIOS[cpf];
  if (!c) return false;
  if (c.fase !== tipo) return false;
  if (c.tipo === 'rate-limit') {
    respRateLimit(res);
    return true;
  }
  if (c.tipo === 'rate-limit-depois-ok') {
    if (rateLimitCounts[cpf] === undefined) rateLimitCounts[cpf] = 0;
    rateLimitCounts[cpf]++;
    if (rateLimitCounts[cpf] <= 2) {
      console.log(`  -> rate-limit-depois-ok: tentativa ${rateLimitCounts[cpf]}/2`);
      respRateLimit(res);
      return true;
    }
    console.log(`  -> rate-limit-depois-ok: tentativa ${rateLimitCounts[cpf]}, prosseguindo normalmente`);
    rateLimitCounts[cpf] = 0;
  }
  return false;
}

function responderApiKeyErro(res, cpf) {
  if (apiKeyErroCounts[cpf] === undefined) apiKeyErroCounts[cpf] = 0;
  apiKeyErroCounts[cpf]++;
  const tentativa = apiKeyErroCounts[cpf];
  if (tentativa <= 4) {
    console.log(`  -> HTTP 400 | API Key não encontrada (tentativa ${tentativa}/4)`);
    res.status(400).json({ erro: '400', mensagem: 'API Key não encontrada' });
    return true;
  }
  console.log(`  -> HTTP 200 | API Key erro resolvido na tentativa ${tentativa}, retornando normal`);
  apiKeyErroCounts[cpf] = 0;
  return false;
}

function montarBase(protocolo, isInclusao) {
  return {
    protocoloSolicitacao: Number(protocolo),
    tipoProtocolo:        isInclusao ? 1 : 3,
    dataHoraSolicitacao:  new Date().toLocaleString('pt-BR').replace(', ', ' '),
  };
}

function responderRejeitado(res, base, isInclusao, motivoStatusCustom) {
  const motivoStatus = motivoStatusCustom ?? (isInclusao
    ? 'Inclusao de divida nao autorizada pela Caixa.'
    : 'Trabalhador nao possui saldo suficiente no FGTS.');
  console.log(`  -> HTTP 200 | statusProtocolo: 4 (Rejeitada) | ${motivoStatus}`);
  return res.status(200).json({ ...base, statusProtocolo: 4, motivoStatus });
}

function responderRejeitarNaTerceira(res, base, protocolo, isInclusao, motivoStatusCustom) {
  const protoKey = Number(protocolo);
  if (pollingCounts[protoKey] === undefined) pollingCounts[protoKey] = 0;
  pollingCounts[protoKey]++;
  const count = pollingCounts[protoKey];

  if (count < 3) {
    const statusProtocolo = Math.min(count, 2);
    console.log(`  -> HTTP 200 | statusProtocolo: ${statusProtocolo} (chamada ${count}/3 — rejeita na 3a)`);
    return res.status(200).json({ ...base, statusProtocolo });
  }

  return responderRejeitado(res, base, isInclusao, motivoStatusCustom);
}

function responderImediato(res, base, isInclusao) {
  console.log(`  -> HTTP 200 | statusProtocolo: 3 (Imediato)`);
  if (isInclusao) {
    return res.status(200).json({ ...base, statusProtocolo: 3, vrOriginal: 1000, vrRenegociado: 800, vrFgts: 500 });
  }
  return res.status(200).json({
    ...base,
    statusProtocolo:  3,
    dataHoraConsulta: new Date().toLocaleString('pt-BR').replace(', ', ' '),
    vrMaximoDebito:   2150.75,
  });
}

function responderProgressao(res, base, protocolo, isInclusao) {
  const protoKey = Number(protocolo);
  if (pollingCounts[protoKey] === undefined) pollingCounts[protoKey] = 0;
  pollingCounts[protoKey]++;
  const count = pollingCounts[protoKey];
  const statusProtocolo = Math.min(count, 3);
  console.log(`  -> HTTP 200 | statusProtocolo: ${statusProtocolo} (chamada #${count})`);

  const payload = { ...base, statusProtocolo };
  if (statusProtocolo === 3) {
    if (isInclusao) {
      payload.vrOriginal    = 1000;
      payload.vrRenegociado = 800;
      payload.vrFgts        = 500;
    } else {
      payload.dataHoraConsulta = new Date().toLocaleString('pt-BR').replace(', ', ' ');
      payload.vrMaximoDebito   = 2150.75;
    }
  }
  return res.status(200).json(payload);
}

// ---------------------------------------------------------------------------
// POST /v1/trabalhadores/solicitacoes-inclusao-divida/:cpf
// (Lambda 04)
// ---------------------------------------------------------------------------
app.post('/v1/trabalhadores/solicitacoes-inclusao-divida/:cpf', (req, res) => {
  const { cpf } = req.params;
  logReq('POST', '/v1/trabalhadores/solicitacoes-inclusao-divida/:cpf', cpf);
  console.log(`  Body: ${JSON.stringify(req.body)}`);

  const c = CENARIOS[cpf];
  if (verificarRateLimit(res, cpf, 'inclusao-post')) return;
  if (c?.fase === 'inclusao-post' && c.status) return respErro(res, c.status, c.codigo, c.descricao);

  if (ehCenaTerminacao(cpf)) {
    const cena = cpfs_scenes[cpf].cena;

    if (cena === 'terminacao-08' || cena === 'terminacao-09') {
      const protocolo = Number(cpf.slice(-5));
      protocoloTipo[protocolo] = 'inclusao';
      pollingCounts[protocolo] = 0;
      console.log(`  -> HTTP 202 | protocolo inclusao (scenes ${cena}): ${protocolo}`);
      return res.status(202).json({ protocolo });
    }

    const preErrorFired = cena === 'terminacao-07'
      ? consumirCena07PreError(res, cpf, 'inclusao-post')
      : consumirApiKeyErroCena(res, cpf, 'inclusao-post');
    if (preErrorFired) return;
    const protocolo = Number(cpf.slice(-5));
    protocoloTipo[protocolo] = 'inclusao';
    pollingCounts[protocolo] = 0;
    console.log(`  -> HTTP 202 | protocolo inclusao (scenes): ${protocolo}`);
    return res.status(202).json({ protocolo });
  }

  const protocolo = gerarProtocolo();
  protocoloTipo[protocolo] = 'inclusao';
  console.log(`  -> HTTP 202 | protocolo inclusao: ${protocolo}`);
  return res.status(202).json({ protocolo });
});

// ---------------------------------------------------------------------------
// DELETE /v1/trabalhadores/protocolos/solicitacoes-exclusao-divida/:cpf/:protocolo
// ---------------------------------------------------------------------------
app.delete('/v1/trabalhadores/protocolos/solicitacoes-exclusao-divida/:cpf/:protocolo', (req, res) => {
  const { cpf } = req.params;
  logReq('DELETE', '/v1/trabalhadores/protocolos/solicitacoes-exclusao-divida/:cpf/:protocolo', cpf);

  const c = CENARIOS[cpf];
  if (c?.fase === 'inclusao-post' && c.status) return respErro(res, c.status, c.codigo, c.descricao);

  const protocolo = gerarProtocolo();
  console.log(`  -> HTTP 202 | protocolo exclusao: ${protocolo}`);
  return res.status(202).json({ protocolo });
});

// ---------------------------------------------------------------------------
// GET /cenarios
// ---------------------------------------------------------------------------
app.get('/cenarios', (req, res) => {
  res.json({
    descricao: 'CPFs de teste disponiveis no mock da API Caixa',
    cpfs_csv_teste: {
      descricao: 'CPFs do CSV de teste — retornam statusProtocolo 3 imediatamente em todas as fases',
      cpfs: ['12345678901', '98765432100', '11122233344'],
    },
    fluxo_padrao: {
      descricao: 'Qualquer CPF nao listado retorna sucesso com progressao de status (1 → 2 → 3)',
      exemplo_cpf: '99999999999',
    },
    cenarios: {
      consulta_saldo_post: {
        '00000000400': 'HTTP 400 - CPF invalido (codigo 3)',
        '00000000407': 'HTTP 400 - Operacao nao permitida para o CPF (codigo 7)',
        '00000000401': 'HTTP 401 - Nao autenticado',
        '00000000403': 'HTTP 403 - Sem autorizacao',
        '00000000404': 'HTTP 404 - Trabalhador nao localizado',
        '00000000409': 'HTTP 409 - Operacao em andamento',
        '00000000500': 'HTTP 500 - Erro inesperado',
      },
      consulta_saldo_get: {
        '00000001401': 'HTTP 401 - Nao autenticado',
        '00000001403': 'HTTP 403 - Sem autorizacao',
        '00000001404': 'HTTP 404 - Protocolo nao localizado',
        '00000001500': 'HTTP 500 - Erro inesperado',
        '00000002000': 'statusProtocolo 4 (Rejeitada pela Caixa)',
        '00000003000': 'statusProtocolo 3 na 1a chamada (imediato)',
        '00000004000': 'HTTP 400 API Key nao encontrada nas 4 primeiras tentativas, sucesso na 5a (testa retry automatico)',
      },
      inclusao_divida_post: {
        '00000020400': 'HTTP 400 - Valor Original invalido',
        '00000020401': 'HTTP 401 - Nao autenticado',
        '00000020403': 'HTTP 403 - Sem autorizacao',
        '00000020500': 'HTTP 500 - Erro inesperado',
        '00000020202': 'HTTP 202 imediato (cenario padrao — qualquer CPF nao listado tambem retorna 202)',
      },
      inclusao_divida_get: {
        '00000041401': 'HTTP 401 - Nao autenticado',
        '00000041403': 'HTTP 403 - Sem autorizacao',
        '00000041404': 'HTTP 404 - Protocolo nao localizado',
        '00000041500': 'HTTP 500 - Erro inesperado',
        '00000042000': 'statusProtocolo 4 (Inclusao rejeitada pela Caixa)',
        '00000043000': 'statusProtocolo 3 na 1a chamada (imediato)',
        '76086470999': 'statusProtocolo 1→2→4 na 3a tentativa — Ja existe informacao de divida desta IF para o CPF',
        'qualquer_outro': 'Progressao normal: 1 → 2 → 3 com vrOriginal/vrRenegociado/vrFgts',
      },
    },
    scenes: {
      'terminacao-08': 'saldo-post SEMPRE retorna API Key erro — GET/inclusao funcionam normalmente (igual terminacao-01)',
      'terminacao-09': 'saldo-post SEMPRE retorna rate limit  — GET/inclusao funcionam normalmente (igual terminacao-01)',
      exemplo_08: '13579246808',
      exemplo_09: '13579246809',
    },
    observacao: 'O GET /consultas-protocolo identifica automaticamente saldo vs inclusao pelo protocolo gerado no POST',
  });
});

// ---------------------------------------------------------------------------
// Inicia o servidor
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`  Mock API Caixa - FGTS Programa Desenrola 2.0`);
  console.log(`  Rodando em: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('\nEndpoints:');
  console.log(`  POST   /v1/trabalhadores/solicitacoes-consulta-saldo-liquido-simulado/:cpf`);
  console.log(`  GET    /v1/trabalhadores/protocolos/consultas-protocolo/:cpf/:protocolo`);
  console.log(`  POST   /v1/trabalhadores/solicitacoes-inclusao-divida/:cpf`);
  console.log(`  DELETE /v1/trabalhadores/protocolos/solicitacoes-exclusao-divida/:cpf/:protocolo`);
  console.log(`\n  GET    /cenarios  ->  tabela de CPFs de teste`);
  console.log('\n' + '='.repeat(60) + '\n');
});
