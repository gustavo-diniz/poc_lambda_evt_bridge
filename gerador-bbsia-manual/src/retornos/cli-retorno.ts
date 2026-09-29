'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { LEIAUTES_RETORNO } from './leiautes-retorno.js';
import { ErroArquivoRetorno, lerArquivoRetorno } from './leitor-retorno.js';
import { gerarPlanilhaRetorno, ordenarTipos } from './planilha-retorno.js';

const AJUDA = `
Converte arquivos de Retorno do FGO (posicionais) em planilha .xlsx — uma planilha por arquivo.
Reconhece: ${Object.values(LEIAUTES_RETORNO).map((l) => `${l.nome} (${l.titulo})`).join('; ')}.

Uso:
  npm run retorno:xlsx -- --arquivo <retorno> [--arquivo <outro>] [--saida <diretório>]
  npm run retorno:xlsx -- --pasta <diretório com os retornos> [--saida <diretório>]
  (no Windows PowerShell use: npm run retorno:xlsx "--" --arquivo <retorno>
   ou chame direto: npx tsx src/retornos/cli-retorno.ts --arquivo <retorno>)

Opções:
  --arquivo <caminho>   Arquivo de retorno a converter (pode repetir).
  --pasta <diretório>   Converte todos os arquivos de retorno da pasta (os demais são ignorados).
  --saida <diretório>   Onde gravar as planilhas (padrão: ./saida/retornos).
  --help                Exibe esta ajuda.

Nome da planilha: <ARQUIVO>_<nº da remessa>_<AAAAMMDD>_<HHMMSS>.xlsx
  Data e hora vêm do header quando ele traz; senão, do nome do arquivo entregue pelo BB SIA
  (GFG200.C59010.<protocolo>.<HHMMSS>.RET). Partes indisponíveis são omitidas.
`;

interface Argumentos {
  arquivos: string[];
  pasta?: string;
  saida: string;
}

function analisarArgumentos(argv: string[]): Argumentos {
  const argumentos: Argumentos = { arquivos: [], saida: path.join('saida', 'retornos') };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const proximo = () => {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith('--')) {
        throw new ErroArquivoRetorno(`Opção "${arg}" exige um valor.`);
      }
      i += 1;
      return valor;
    };

    switch (arg) {
      case '--arquivo':
        argumentos.arquivos.push(proximo());
        break;
      case '--pasta':
        argumentos.pasta = proximo();
        break;
      case '--saida':
        argumentos.saida = proximo();
        break;
      case '--help':
      case '-h':
        console.log(AJUDA);
        process.exit(0);
        break;
      default:
        throw new ErroArquivoRetorno(`Opção desconhecida: "${arg}". Use --help para ver o uso.`);
    }
  }

  if (argumentos.arquivos.length === 0 && !argumentos.pasta) {
    throw new ErroArquivoRetorno('Informe --arquivo ou --pasta. Use --help para ver o uso.');
  }
  return argumentos;
}

async function converter(caminho: string, saida: string): Promise<void> {
  const lido = lerArquivoRetorno(caminho);
  const { caminho: destino, identificacao } = await gerarPlanilhaRetorno(lido, saida);

  const porTipo = ordenarTipos([...lido.registros.keys()])
    .map((tipo) => `${tipo}: ${lido.registros.get(tipo)!.length}`)
    .join(', ');
  console.log(`\n${path.basename(caminho)}  →  ${destino}`);
  console.log(`  ${lido.leiaute.nome} — ${lido.leiaute.titulo}`);
  console.log(`  Registros ....: ${porTipo}`);
  if (!identificacao.data) console.log('  [WARN] Data do arquivo não disponível no header nem no nome — omitida do nome da planilha.');
  if (!identificacao.hora) console.log('  [WARN] Hora do arquivo não disponível no header nem no nome — omitida do nome da planilha.');
  if (lido.avisos.length > 0) {
    console.log(`  [WARN] ${lido.avisos.length} aviso(s) de leiaute — listados na aba "Resumo":`);
    lido.avisos.slice(0, 5).forEach((aviso) => console.log(`         ${aviso}`));
    if (lido.avisos.length > 5) console.log(`         ... e mais ${lido.avisos.length - 5}.`);
  }
}

async function main(): Promise<void> {
  const argumentos = analisarArgumentos(process.argv.slice(2));
  let falhas = 0;

  for (const arquivo of argumentos.arquivos) {
    try {
      await converter(arquivo, argumentos.saida);
    } catch (erro) {
      if (!(erro instanceof ErroArquivoRetorno)) throw erro;
      console.error(`\n[ERRO] ${erro.message}`);
      falhas += 1;
    }
  }

  if (argumentos.pasta) {
    if (!fs.existsSync(argumentos.pasta) || !fs.statSync(argumentos.pasta).isDirectory()) {
      throw new ErroArquivoRetorno(`Pasta não encontrada: "${argumentos.pasta}"`);
    }
    const arquivos = fs
      .readdirSync(argumentos.pasta)
      .map((nome) => path.join(argumentos.pasta!, nome))
      .filter((caminho) => fs.statSync(caminho).isFile());

    for (const arquivo of arquivos) {
      try {
        await converter(arquivo, argumentos.saida);
      } catch (erro) {
        if (!(erro instanceof ErroArquivoRetorno)) throw erro;
        console.log(`\n[IGNORADO] ${path.basename(arquivo)}: ${erro.message}`);
      }
    }
  }

  if (falhas > 0) process.exit(1);
}

main().catch((erro: unknown) => {
  if (erro instanceof ErroArquivoRetorno) {
    console.error(`\n[ERRO] ${erro.message}\n`);
  } else {
    console.error('\n[ERRO INESPERADO]', erro);
  }
  process.exit(1);
});
