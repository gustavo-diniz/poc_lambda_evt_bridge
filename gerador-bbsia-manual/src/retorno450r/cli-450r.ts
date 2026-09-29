'use strict';

import { ErroGeracaoArquivo } from '../formatadores.js';
import { gerarArquivoRetorno450RFake } from './gerador-450r.js';
import { ErroLeituraRetorno, LeitorRetorno450R } from './leitor-450r.js';
import { DESCRICAO_NATUREZA_MOVIMENTACAO, TIPOS_MOVIMENTACAO } from './tipos-450r.js';

const AJUDA = `
Retorno GFGF450R (4º Retorno — Movimentação Financeira, manual §13.5).

Uso:
  npx tsx src/retorno450r/cli-450r.ts gerar-fake [opções]
  npx tsx src/retorno450r/cli-450r.ts ler --arquivo <caminho> [--json] [--tolerante]

Opções de gerar-fake:
  --quantidade <n>           Registros 97 a gerar (padrão 10).
  --semente <n>              Semente para dados reproduzíveis (padrão 450).
  --numero-remessa <n>       Nº da Remessa referenciada no header (padrão 1).
  --agente <n>               Código do Agente Financeiro (padrão 59).
  --cnpj <14 dígitos>        CNPJ do Agente Financeiro.
  --saida <diretório>        Diretório de saída (padrão ./saida).
  --nome-arquivo <nome>      Nome do arquivo físico (padrão GFGF450R.txt).

Opções de ler:
  --arquivo <caminho>        Arquivo GFGF450R a ler (obrigatório).
  --json                     Imprime o resultado completo em JSON.
  --tolerante                Não interrompe em erro de leiaute; acumula avisos.
  --help                     Exibe esta ajuda.
`;

interface Argumentos {
  comando: 'gerar-fake' | 'ler';
  quantidade?: number;
  semente?: number;
  numeroRemessa?: number;
  agente?: number;
  cnpj?: string;
  saida?: string;
  nomeArquivo?: string;
  arquivo?: string;
  json: boolean;
  tolerante: boolean;
}

function analisarArgumentos(argv: string[]): Argumentos {
  const [comando, ...resto] = argv;
  if (!comando || comando === '--help' || comando === '-h') {
    console.log(AJUDA);
    process.exit(0);
  }
  if (comando !== 'gerar-fake' && comando !== 'ler') {
    throw new ErroGeracaoArquivo(`Comando desconhecido: "${comando}". Use --help.`);
  }

  const argumentos: Argumentos = { comando, json: false, tolerante: false };

  for (let i = 0; i < resto.length; i += 1) {
    const arg = resto[i]!;
    const proximo = () => {
      const valor = resto[i + 1];
      if (valor === undefined || valor.startsWith('--')) {
        throw new ErroGeracaoArquivo(`Opção "${arg}" exige um valor.`);
      }
      i += 1;
      return valor;
    };
    const inteiro = () => {
      const valor = Number(proximo());
      if (!Number.isInteger(valor) || valor < 1) {
        throw new ErroGeracaoArquivo(`Opção "${arg}" deve ser um inteiro maior ou igual a 1.`);
      }
      return valor;
    };

    switch (arg) {
      case '--quantidade':
        argumentos.quantidade = inteiro();
        break;
      case '--semente':
        argumentos.semente = inteiro();
        break;
      case '--numero-remessa':
        argumentos.numeroRemessa = inteiro();
        break;
      case '--agente':
        argumentos.agente = inteiro();
        break;
      case '--cnpj':
        argumentos.cnpj = proximo();
        break;
      case '--saida':
        argumentos.saida = proximo();
        break;
      case '--nome-arquivo':
        argumentos.nomeArquivo = proximo();
        break;
      case '--arquivo':
        argumentos.arquivo = proximo();
        break;
      case '--json':
        argumentos.json = true;
        break;
      case '--tolerante':
        argumentos.tolerante = true;
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

  if (comando === 'ler' && !argumentos.arquivo) {
    throw new ErroGeracaoArquivo('Informe o arquivo de retorno com --arquivo.');
  }
  return argumentos;
}

function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function executarGerarFake(argumentos: Argumentos): void {
  const resultado = gerarArquivoRetorno450RFake({
    quantidadeMovimentacoes: argumentos.quantidade,
    semente: argumentos.semente,
    numeroSequencialRemessa: argumentos.numeroRemessa,
    codigoAgenteFinanceiro: argumentos.agente,
    cnpjAgenteFinanceiro: argumentos.cnpj,
    diretorioSaida: argumentos.saida,
    nomeArquivoFisico: argumentos.nomeArquivo,
  });

  console.log('Arquivo GFGF450R (fake) gerado com sucesso.');
  console.log(`  Arquivo ............: ${resultado.caminhoArquivo}`);
  console.log(`  Total de linhas ....: ${resultado.totalLinhas} (header + movimentações + trailer)`);
  console.log(`  Movimentações ......: ${resultado.movimentacoes.length}`);
}

function executarLer(argumentos: Argumentos): void {
  const { retorno, avisos } = LeitorRetorno450R.lerArquivo(argumentos.arquivo!, {
    estrito: !argumentos.tolerante,
  });

  if (argumentos.json) {
    console.log(JSON.stringify({ ...retorno, avisos }, null, 2));
    return;
  }

  const h = retorno.header;
  console.log('Retorno GFGF450R lido com sucesso.');
  console.log(`  Arquivo/leiaute ....: ${h.nomeArquivoRetorno} v${h.versaoLeiaute}`);
  console.log(`  Agente / Fundo .....: ${String(h.codigoAgenteFinanceiro).padStart(3, '0')} / ${String(h.codigoFundoGarantidor).padStart(3, '0')}`);
  console.log(`  CNPJ do Agente .....: ${h.cnpjAgenteFinanceiro}`);
  console.log(`  Remessa referida ...: ${String(h.numeroSequencialRemessa).padStart(4, '0')}`);
  console.log(`  Registros (trailer) : ${retorno.trailer.quantidadeRegistros}`);
  console.log(`  Movimentações ......: ${retorno.totais.quantidadeMovimentacoes}`);
  console.log(`  Líquido p/ FGO .....: ${formatarReais(retorno.totais.valorLiquidoAFavorDoFgo)}`);
  console.log(`  Líquido p/ Agente ..: ${formatarReais(retorno.totais.valorLiquidoAFavorDoAgente)}`);

  console.log('\n  Por tipo de movimentação:');
  for (const [codigo, total] of Object.entries(retorno.totais.porTipoMovimentacao)) {
    const tabela = TIPOS_MOVIMENTACAO[codigo as keyof typeof TIPOS_MOVIMENTACAO];
    const descricao = tabela ? `${tabela.descricao} (${DESCRICAO_NATUREZA_MOVIMENTACAO[tabela.natureza]})` : 'desconhecido';
    console.log(`    ${codigo} - ${descricao}: ${total.quantidade} × ${formatarReais(total.valorLiquido)}`);
  }

  console.log('\n  Movimentações:');
  for (const m of retorno.movimentacoes) {
    console.log(
      `    #${String(m.noSequencialRegistro).padStart(7, '0')} ${m.codigoOperacaoAgente.padEnd(20)} ` +
        `${m.codigoTipoMovimentacao} ${(m.descricaoTipoMovimentacao ?? '?').padEnd(30)} ` +
        `fato=${m.dataFatoGerador ?? '—'} mov=${m.dataMovimentacaoFinanceira ?? '—'} ` +
        `nominal=${formatarReais(m.valorNominalFatoGerador)} líquido=${formatarReais(m.valorLiquidoMovimentado)} ` +
        `causador=${m.noSequencialRegistroCausador}`
    );
  }

  if (avisos.length > 0) {
    console.log('\n  Avisos:');
    avisos.forEach((aviso) => console.log(`    - ${aviso}`));
  }
}

try {
  const argumentos = analisarArgumentos(process.argv.slice(2));
  if (argumentos.comando === 'gerar-fake') executarGerarFake(argumentos);
  else executarLer(argumentos);
} catch (erro) {
  if (erro instanceof ErroGeracaoArquivo || erro instanceof ErroLeituraRetorno) {
    console.error(`\n[ERRO] ${erro.message}\n`);
  } else {
    console.error('\n[ERRO INESPERADO]', erro);
  }
  process.exit(1);
}
