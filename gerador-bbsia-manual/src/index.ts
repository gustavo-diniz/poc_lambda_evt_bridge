'use strict';

import { carregarParametros, type ParametrosRemessa } from './config.js';
import { ErroGeracaoArquivo } from './formatadores.js';
import { gerarArquivoRemessa } from './gerador.js';
import { DESCRICAO_TIPO_DETALHE, TIPOS_DETALHE_SUPORTADOS } from './tipos.js';

interface Argumentos {
  csv: string;
  config?: string;
  saida?: string;
  nomeArquivo?: string;
  numeroRemessa?: number;
  separador?: string;
  ordenarPorTipo: boolean;
}

const AJUDA = `
Gerador manual do arquivo de Remessa GFG0010 (FGO / BB SIA).

Uso:
  npm run gerar -- --csv <arquivo.csv> [opções]

Opções:
  --csv <caminho>            CSV de entrada com os registros-detalhe (obrigatório).
  --config <caminho>         JSON com os parâmetros fixos e dados de header/trailer.
  --saida <diretório>        Diretório de saída (sobrepõe o do JSON).
  --nome-arquivo <nome>      Nome do arquivo físico gerado (sobrepõe o do JSON).
  --numero-remessa <n>       Nº sequencial da Remessa (sobrepõe o do JSON).
  --separador <char>         Separador do CSV (padrão: ";").
  --ordenar-por-tipo         Agrupa os detalhes na ordem 03 -> 04 -> 05.
  --help                     Exibe esta ajuda.

Exemplo:
  npm run gerar -- --csv entrada/exemplo-remessa.csv --config config/parametros.json --numero-remessa 12
`;

function analisarArgumentos(argv: string[]): Argumentos {
  const argumentos: Partial<Argumentos> = { ordenarPorTipo: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const proximo = () => {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith('--')) {
        throw new ErroGeracaoArquivo(`Opção "${arg}" exige um valor.`);
      }
      i += 1;
      return valor;
    };

    switch (arg) {
      case '--csv':
        argumentos.csv = proximo();
        break;
      case '--config':
        argumentos.config = proximo();
        break;
      case '--saida':
        argumentos.saida = proximo();
        break;
      case '--nome-arquivo':
        argumentos.nomeArquivo = proximo();
        break;
      case '--numero-remessa': {
        const valor = Number(proximo());
        if (!Number.isInteger(valor) || valor < 1) {
          throw new ErroGeracaoArquivo('--numero-remessa deve ser um inteiro maior ou igual a 1.');
        }
        argumentos.numeroRemessa = valor;
        break;
      }
      case '--separador':
        argumentos.separador = proximo();
        break;
      case '--ordenar-por-tipo':
        argumentos.ordenarPorTipo = true;
        break;
      case '--help':
      case '-h':
        console.log(AJUDA);
        process.exit(0);
        break;
      default:
        throw new ErroGeracaoArquivo(`Opção desconhecida: "${arg}". Use --help para ver o uso.`);
    }
  }

  if (!argumentos.csv) {
    throw new ErroGeracaoArquivo('Informe o CSV de entrada com --csv. Use --help para ver o uso.');
  }

  return argumentos as Argumentos;
}

function main(): void {
  const argumentos = analisarArgumentos(process.argv.slice(2));

  const parametros: ParametrosRemessa = carregarParametros(argumentos.config);
  if (argumentos.saida) parametros.diretorioSaida = argumentos.saida;
  if (argumentos.nomeArquivo) parametros.nomeArquivoFisico = argumentos.nomeArquivo;
  if (argumentos.numeroRemessa) parametros.numeroSequencialRemessa = argumentos.numeroRemessa;

  const resultado = gerarArquivoRemessa({
    caminhoCsv: argumentos.csv,
    parametros,
    separadorCsv: argumentos.separador,
    ordenarPorTipo: argumentos.ordenarPorTipo,
  });

  console.log('Arquivo de Remessa gerado com sucesso.');
  console.log(`  Arquivo ............: ${resultado.caminhoArquivo}`);
  console.log(
    `  Nº da Remessa ......: ${String(parametros.numeroSequencialRemessa).padStart(4, '0')}`
  );
  console.log(`  Agente Financeiro ..: ${String(parametros.codigoAgenteFinanceiro).padStart(3, '0')}`);
  console.log(`  Total de linhas ....: ${resultado.totalLinhas} (header + detalhes + trailer)`);
  console.log(`  Total de detalhes ..: ${resultado.totalDetalhes}`);

  // Itera a lista declarada para manter a ordem 03 -> 04 -> 05 -> 10 -> 11 -> 12
  // (chaves numéricas em objeto são reordenadas pelo próprio JS).
  for (const tipo of TIPOS_DETALHE_SUPORTADOS) {
    console.log(`    ${tipo} - ${DESCRICAO_TIPO_DETALHE[tipo]}: ${resultado.totaisPorTipo[tipo]}`);
  }
}

try {
  main();
} catch (erro) {
  if (erro instanceof ErroGeracaoArquivo) {
    console.error(`\n[ERRO] ${erro.message}\n`);
  } else {
    console.error('\n[ERRO INESPERADO]', erro);
  }
  process.exit(1);
}
