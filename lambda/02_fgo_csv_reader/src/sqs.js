'use strict';

const { SQSClient, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');

const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'sa-east-1',
  ...(process.env.AWS_ENDPOINT_URL && { endpoint: process.env.AWS_ENDPOINT_URL }),
});

const SQS_FGO_INPUT = process.env.SQS_FGO_INPUT;
const TAMANHO_LOTE  = 10;
const CONCORRENCIA  = 10;

function ofuscarCpf(cpf) {
  const s = String(cpf || '');
  return s.length >= 5 ? `${s.slice(0, 3)}******${s.slice(-2)}` : '***';
}

async function enviarLote(lote, offsetIdx) {
  const entries = lote.map((registro, idx) => {
    console.log(
      `[fgo-csv-reader] → SQS | cpf=${ofuscarCpf(registro.cpf)} | idAcordo=${registro.idAcordo} | tipoProduto=${registro.tipoProduto} | origem=${registro.arquivoOrigem}`,
    );
    return { Id: String(offsetIdx + idx), MessageBody: JSON.stringify(registro) };
  });

  const response = await sqs.send(new SendMessageBatchCommand({
    QueueUrl: SQS_FGO_INPUT,
    Entries: entries,
  }));

  let enviados = response.Successful?.length || 0;
  let erros    = 0;

  if (response.Failed?.length > 0) {
    erros = response.Failed.length;
    response.Failed.forEach((f) => {
      const reg = lote[Number(f.Id) - offsetIdx];
      console.error(`[fgo-csv-reader] ✗ Falha SQS | cpf=${ofuscarCpf(reg?.cpf)} | Id=${f.Id} | ${f.Message}`);
    });
  }

  return { enviados, erros };
}

async function publicarLotes(registros) {
  if (!SQS_FGO_INPUT) throw new Error('SQS_FGO_INPUT não configurado');

  const lotes = [];
  for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
    lotes.push({ lote: registros.slice(i, i + TAMANHO_LOTE), offset: i });
  }

  let totalEnviados = 0;
  let totalErros    = 0;

  for (let i = 0; i < lotes.length; i += CONCORRENCIA) {
    const janela = lotes.slice(i, i + CONCORRENCIA);
    const resultados = await Promise.all(
      janela.map(({ lote, offset }) => enviarLote(lote, offset)),
    );
    totalEnviados += resultados.reduce((acc, r) => acc + r.enviados, 0);
    totalErros    += resultados.reduce((acc, r) => acc + r.erros, 0);
  }

  console.log(`[fgo-csv-reader] SQS_FGO_INPUT — Enviados: ${totalEnviados} | Erros: ${totalErros}`);
  return { totalEnviados, totalErros };
}

module.exports = { publicarLotes };
