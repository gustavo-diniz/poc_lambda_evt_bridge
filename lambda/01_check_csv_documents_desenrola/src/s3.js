const { S3Client, ListObjectsV2Command, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: true,
  }),
});

const BUCKET            = process.env.S3_BUCKET;
const PASTA_PENDENTES   = process.env.S3_PASTA_PENDENTES   || 'pendentes/';
const PASTA_PROCESSADOS = process.env.S3_PASTA_PROCESSADOS || 'processados/';
const PASTA_ERROS       = process.env.S3_PASTA_ERROS       || 'erros/';

/**
 * Lista todos os arquivos .csv na pasta de pendentes.
 * Retorna array de keys (caminhos) dos arquivos encontrados.
 */
async function listarArquivosPendentes() {
  const response = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: PASTA_PENDENTES,
  }));

  if (!response.Contents || response.Contents.length === 0) return [];

  return response.Contents
    .map((obj) => obj.Key)
    .filter((key) => key.endsWith('.csv'));
}

/**
 * Retorna o conteúdo do arquivo como string.
 */
async function lerArquivo(key) {
  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));

  return streamParaString(response.Body);
}

/**
 * Move o arquivo de pendentes/ para processados/ no mesmo bucket.
 * S3 não tem rename — copia e deleta.
 */
async function marcarComoProcessado(key) {
  const nomeArquivo = key.replace(PASTA_PENDENTES, '');
  const destino = `${PASTA_PROCESSADOS}${nomeArquivo}`;

  await s3.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${key}`,
    Key: destino,
  }));

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));

  console.log(`Arquivo movido: ${key} → ${destino}`);
}

function streamParaString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

async function moverParaErros(key) {
  const nomeArquivo = key.replace(PASTA_PENDENTES, '');
  const destino = `${PASTA_ERROS}${nomeArquivo}`;

  await s3.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${key}`,
    Key: destino,
  }));

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));

  console.log(`Arquivo movido para erros: ${key} → ${destino}`);
}

module.exports = { listarArquivosPendentes, lerArquivo, marcarComoProcessado, moverParaErros };
