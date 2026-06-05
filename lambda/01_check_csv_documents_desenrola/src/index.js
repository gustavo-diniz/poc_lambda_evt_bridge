const { lerArquivo, marcarComoProcessado, moverParaErros } = require('./s3');
const { parsearCsv } = require('./csv');
const { publicarLotes } = require('./sqs');

exports.handler = async (event) => {
  const registros_s3 = event.Records ?? [];

  if (registros_s3.length === 0) {
    console.log('Nenhum registro S3 no evento. Encerrando.');
    return;
  }

  for (const record of registros_s3) {
    const key = decodeURIComponent(record.s3.object.key.replaceAll('+', ' '));
    await processarArquivo(key);
  }
};

async function processarArquivo(key) {
  console.log(`Iniciando processamento: ${key}`);

  let conteudo;
  try {
    conteudo = await lerArquivo(key);
  } catch (err) {
    console.error(`${key} — Erro ao ler arquivo do S3: ${err.message}`);
    await moverParaErros(key);
    return;
  }

  let registros;
  try {
    registros = parsearCsv(conteudo, key);
  } catch (err) {
    console.error(`${key} — CSV inválido (erro de parse): ${err.message}`);
    await moverParaErros(key);
    return;
  }

  console.log(`${key} — ${registros.length} registros lidos do CSV.`);

  if (registros.length === 0) {
    console.warn(`${key} — CSV vazio ou sem linhas válidas. Movendo para erros.`);
    await moverParaErros(key);
    return;
  }

  const { totalEnviados, totalErros } = await publicarLotes(registros);
  console.log(`${key} — Publicação concluída. Enviados: ${totalEnviados} | Erros: ${totalErros}`);

  await marcarComoProcessado(key);
}
