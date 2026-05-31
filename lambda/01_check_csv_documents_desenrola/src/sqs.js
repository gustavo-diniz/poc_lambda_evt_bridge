const { SQSClient, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');

const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT_URL && { endpoint: process.env.AWS_ENDPOINT_URL }),
});

const SQS_PROTOCOLO_SALDO = process.env.SQS_PROTOCOLO_SALDO;
const TAMANHO_LOTE = 10;

function ofuscarCpf(cpf) {
  const s = String(cpf || '');
  return s.length >= 5 ? `${s.slice(0, 3)}******${s.slice(-2)}` : '***';
}

async function enviarLote(lote, offsetIdx) {
  const entries = lote.map((registro, idx) => {
    console.log(`  → SQS | cpf=${ofuscarCpf(registro.cpf)} | vlr_acordo=${registro.vlr_acordo_digio} | vlr_divida=${registro.vlr_divida_atualizada} | origem=${registro.arquivo_origem}`);
    return { Id: String(offsetIdx + idx), MessageBody: JSON.stringify(registro) };
  });

  const response = await sqs.send(new SendMessageBatchCommand({
    QueueUrl: SQS_PROTOCOLO_SALDO,
    Entries: entries,
  }));

  let enviados = response.Successful?.length || 0;
  let erros = 0;

  if (response.Failed?.length > 0) {
    erros = response.Failed.length;
    response.Failed.forEach((f) => {
      const registro = lote[Number(f.Id) - offsetIdx];
      console.error(`  ✗ Falha SQS | cpf=${ofuscarCpf(registro?.cpf)} | Id=${f.Id} | ${f.Message}`);
    });
  }

  return { enviados, erros };
}

const CONCORRENCIA = 10;

/**
 * Publica todos os registros no SQS em janelas de 10 lotes simultâneos.
 * Falhas individuais são logadas mas não interrompem o processamento.
 */
async function publicarLotes(registros) {
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

  console.log(`SQS_PROTOCOLO_SALDO — Enviados: ${totalEnviados} | Erros: ${totalErros}`);
  return { totalEnviados, totalErros };
}

module.exports = { publicarLotes };
