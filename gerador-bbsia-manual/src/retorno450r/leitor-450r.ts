'use strict';

import * as fs from 'node:fs';

import {
  DESCRICAO_NATUREZA_MOVIMENTACAO,
  ehTipoMovimentacao,
  NOME_ARQUIVO_RETORNO_450R,
  TAMANHO_LINHA_450R,
  TIPO_REGISTRO_450R_HEADER,
  TIPO_REGISTRO_450R_MOVIMENTACAO,
  TIPO_REGISTRO_450R_TRAILER,
  TIPOS_MOVIMENTACAO,
  type Header450R,
  type Movimentacao450R,
  type Retorno450R,
  type Trailer450R,
} from './tipos-450r.js';

export class ErroLeituraRetorno extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroLeituraRetorno';
  }
}

export interface OpcoesLeitura450R {
  /** Encoding do arquivo físico (padrão latin1, como o BB SIA grava). */
  encoding?: BufferEncoding;
  /**
   * Modo estrito (padrão true): linha com tamanho ≠ 211, sequência quebrada, trailer
   * com quantidade divergente ou tipo de registro desconhecido interrompem a leitura.
   * Em modo tolerante os problemas viram `avisos` e a leitura continua.
   */
  estrito?: boolean;
}

export interface ResultadoLeitura450R {
  retorno: Retorno450R;
  avisos: string[];
}

/**
 * Lê e extrai os dados de um arquivo de Retorno GFGF450R (manual §13.5).
 *
 * Uso:
 *   const { retorno, avisos } = LeitorRetorno450R.lerArquivo('saida/GFGF450R.txt');
 *   retorno.movimentacoes.forEach(m => console.log(m.codigoOperacaoAgente, m.valorLiquidoMovimentado));
 */
export class LeitorRetorno450R {
  private readonly estrito: boolean;
  private readonly avisos: string[] = [];

  constructor(opcoes: OpcoesLeitura450R = {}) {
    this.estrito = opcoes.estrito ?? true;
  }

  static lerArquivo(caminho: string, opcoes: OpcoesLeitura450R = {}): ResultadoLeitura450R {
    if (!fs.existsSync(caminho)) {
      throw new ErroLeituraRetorno(`Arquivo de retorno não encontrado: "${caminho}"`);
    }
    const conteudo = fs.readFileSync(caminho, { encoding: opcoes.encoding ?? 'latin1' });
    return new LeitorRetorno450R(opcoes).ler(conteudo);
  }

  static lerConteudo(conteudo: string, opcoes: OpcoesLeitura450R = {}): ResultadoLeitura450R {
    return new LeitorRetorno450R(opcoes).ler(conteudo);
  }

  ler(conteudo: string): ResultadoLeitura450R {
    this.avisos.length = 0;

    const linhas = conteudo
      .split(/\r?\n/)
      .filter((linha, indice, todas) => !(linha === '' && indice === todas.length - 1));

    if (linhas.length < 2) {
      throw new ErroLeituraRetorno(
        `Arquivo precisa ter ao menos header e trailer; encontradas ${linhas.length} linha(s).`
      );
    }

    let header: Header450R | undefined;
    let trailer: Trailer450R | undefined;
    const movimentacoes: Movimentacao450R[] = [];

    linhas.forEach((linha, indice) => {
      const numeroLinha = indice + 1;
      this.validarTamanho(linha, numeroLinha);

      const tipo = linha.substring(7, 9);
      const sequencial = this.lerNumero(linha, 1, 7, 'noSequencialRegistro', numeroLinha);
      if (sequencial !== numeroLinha) {
        this.reportar(
          `Linha ${numeroLinha}: nº sequencial "${linha.substring(0, 7)}" fora de sequência (esperado ${numeroLinha}).`
        );
      }

      switch (tipo) {
        case TIPO_REGISTRO_450R_HEADER:
          if (numeroLinha !== 1) this.reportar(`Linha ${numeroLinha}: header fora da primeira posição.`);
          header = this.lerHeader(linha, numeroLinha);
          break;
        case TIPO_REGISTRO_450R_MOVIMENTACAO:
          movimentacoes.push(this.lerMovimentacao(linha, numeroLinha));
          break;
        case TIPO_REGISTRO_450R_TRAILER:
          if (numeroLinha !== linhas.length) this.reportar(`Linha ${numeroLinha}: trailer antes do fim do arquivo.`);
          trailer = this.lerTrailer(linha, numeroLinha);
          break;
        default:
          this.reportar(`Linha ${numeroLinha}: tipo de registro desconhecido "${tipo}".`);
      }
    });

    if (!header) throw new ErroLeituraRetorno('Arquivo sem registro 01 (header).');
    if (!trailer) throw new ErroLeituraRetorno('Arquivo sem registro 99 (trailer).');

    if (header.nomeArquivoRetorno !== NOME_ARQUIVO_RETORNO_450R) {
      this.reportar(
        `Header: nome do arquivo "${header.nomeArquivoRetorno}" diferente de "${NOME_ARQUIVO_RETORNO_450R}".`
      );
    }
    if (trailer.quantidadeRegistros !== linhas.length) {
      this.reportar(
        `Trailer informa ${trailer.quantidadeRegistros} registro(s), mas o arquivo tem ${linhas.length} linha(s).`
      );
    }

    const retorno: Retorno450R = {
      header,
      movimentacoes,
      trailer,
      totais: this.calcularTotais(movimentacoes),
    };

    return { retorno, avisos: [...this.avisos] };
  }

  // ---------------------------------------------------------------------------
  // Registros
  // ---------------------------------------------------------------------------

  private lerHeader(linha: string, numeroLinha: number): Header450R {
    return {
      noSequencialRegistro: this.lerNumero(linha, 1, 7, 'noSequencialRegistro', numeroLinha),
      codigoTipoRegistro: '01',
      nomeArquivoRetorno: this.lerTexto(linha, 10, 17),
      versaoLeiaute: this.lerTexto(linha, 18, 25),
      codigoAgenteFinanceiro: this.lerNumero(linha, 26, 28, 'codigoAgenteFinanceiro', numeroLinha),
      codigoFundoGarantidor: this.lerNumero(linha, 29, 31, 'codigoFundoGarantidor', numeroLinha),
      numeroSequencialRemessa: this.lerNumero(linha, 32, 35, 'numeroSequencialRemessa', numeroLinha),
      cnpjAgenteFinanceiro: this.lerTexto(linha, 56, 69),
    };
  }

  private lerMovimentacao(linha: string, numeroLinha: number): Movimentacao450R {
    const codigoTipoMovimentacao = this.lerTexto(linha, 30, 31);
    const tabela = ehTipoMovimentacao(codigoTipoMovimentacao)
      ? TIPOS_MOVIMENTACAO[codigoTipoMovimentacao]
      : undefined;

    if (!tabela) {
      this.reportar(
        `Linha ${numeroLinha}: código de tipo de movimentação "${codigoTipoMovimentacao}" não consta no §14.16.`
      );
    }

    const dataMovimentacaoFinanceira = this.lerData(linha, 32, 39, 'dataMovimentacaoFinanceira', numeroLinha);
    if (tabela?.natureza === '3' && dataMovimentacaoFinanceira !== null) {
      this.avisos.push(
        `Linha ${numeroLinha}: movimentação de natureza 3 (sem movimentação) veio com data de movimentação preenchida.`
      );
    }

    return {
      noSequencialRegistro: this.lerNumero(linha, 1, 7, 'noSequencialRegistro', numeroLinha),
      codigoTipoRegistro: '97',
      codigoOperacaoAgente: this.lerTexto(linha, 10, 29),
      codigoTipoMovimentacao,
      descricaoTipoMovimentacao: tabela?.descricao,
      naturezaMovimentacao: tabela?.natureza,
      descricaoNaturezaMovimentacao: tabela ? DESCRICAO_NATUREZA_MOVIMENTACAO[tabela.natureza] : undefined,
      dataMovimentacaoFinanceira,
      dataFatoGerador: this.lerData(linha, 40, 47, 'dataFatoGerador', numeroLinha),
      valorNominalFatoGerador: this.lerMoeda(linha, 48, 64, 'valorNominalFatoGerador', numeroLinha),
      valorAtualizacaoMonetaria: this.lerMoeda(linha, 65, 81, 'valorAtualizacaoMonetaria', numeroLinha),
      valorIssqn: this.lerMoeda(linha, 82, 98, 'valorIssqn', numeroLinha),
      valorLiquidoMovimentado: this.lerMoeda(linha, 99, 115, 'valorLiquidoMovimentado', numeroLinha),
      noSequencialRegistroCausador: this.lerNumero(linha, 116, 122, 'noSequencialRegistroCausador', numeroLinha),
    };
  }

  private lerTrailer(linha: string, numeroLinha: number): Trailer450R {
    return {
      noSequencialRegistro: this.lerNumero(linha, 1, 7, 'noSequencialRegistro', numeroLinha),
      codigoTipoRegistro: '99',
      // O manual declara o campo como "A", mas o conteúdo é a quantidade numérica.
      quantidadeRegistros: this.lerNumero(linha, 10, 16, 'quantidadeRegistros', numeroLinha),
    };
  }

  private calcularTotais(movimentacoes: Movimentacao450R[]): Retorno450R['totais'] {
    const totais: Retorno450R['totais'] = {
      quantidadeMovimentacoes: movimentacoes.length,
      valorLiquidoAFavorDoFgo: 0,
      valorLiquidoAFavorDoAgente: 0,
      porTipoMovimentacao: {},
    };

    for (const m of movimentacoes) {
      if (m.naturezaMovimentacao === '1') totais.valorLiquidoAFavorDoFgo += m.valorLiquidoMovimentado;
      if (m.naturezaMovimentacao === '2') totais.valorLiquidoAFavorDoAgente += m.valorLiquidoMovimentado;

      const acumulado = (totais.porTipoMovimentacao[m.codigoTipoMovimentacao] ??= {
        quantidade: 0,
        valorLiquido: 0,
      });
      acumulado.quantidade += 1;
      acumulado.valorLiquido += m.valorLiquidoMovimentado;
    }

    totais.valorLiquidoAFavorDoFgo = arredondar2(totais.valorLiquidoAFavorDoFgo);
    totais.valorLiquidoAFavorDoAgente = arredondar2(totais.valorLiquidoAFavorDoAgente);
    for (const chave of Object.keys(totais.porTipoMovimentacao)) {
      totais.porTipoMovimentacao[chave]!.valorLiquido = arredondar2(
        totais.porTipoMovimentacao[chave]!.valorLiquido
      );
    }
    return totais;
  }

  // ---------------------------------------------------------------------------
  // Leitura de campos (posições do manual: INÍCIO/FIM, base 1, inclusivas)
  // ---------------------------------------------------------------------------

  /** Campo A: recorta e remove os espaços de preenchimento à direita. */
  private lerTexto(linha: string, inicio: number, fim: number): string {
    return linha.substring(inicio - 1, fim).trimEnd();
  }

  /** Campo N: dígitos com zeros à esquerda → inteiro. */
  private lerNumero(
    linha: string,
    inicio: number,
    fim: number,
    nomeCampo: string,
    numeroLinha: number
  ): number {
    const bruto = linha.substring(inicio - 1, fim);
    if (!/^\d+$/.test(bruto)) {
      this.reportar(
        `Linha ${numeroLinha}: campo numérico "${nomeCampo}" (pos ${inicio}-${fim}) com conteúdo inválido "${bruto}".`
      );
      return Number.NaN;
    }
    return Number(bruto);
  }

  /** Campo M: centavos sem separador → reais. */
  private lerMoeda(
    linha: string,
    inicio: number,
    fim: number,
    nomeCampo: string,
    numeroLinha: number
  ): number {
    const centavos = this.lerNumero(linha, inicio, fim, nomeCampo, numeroLinha);
    return Number.isNaN(centavos) ? Number.NaN : centavos / 100;
  }

  /** Campo D: AAAAMMDD → "AAAA-MM-DD"; "00000000" → null. */
  private lerData(
    linha: string,
    inicio: number,
    fim: number,
    nomeCampo: string,
    numeroLinha: number
  ): string | null {
    const bruto = linha.substring(inicio - 1, fim);
    if (bruto === '00000000') return null;

    const partes = bruto.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!partes) {
      this.reportar(
        `Linha ${numeroLinha}: campo data "${nomeCampo}" (pos ${inicio}-${fim}) com conteúdo inválido "${bruto}".`
      );
      return null;
    }

    const [, ano, mes, dia] = partes;
    const referencia = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
    const valida =
      referencia.getUTCFullYear() === Number(ano) &&
      referencia.getUTCMonth() + 1 === Number(mes) &&
      referencia.getUTCDate() === Number(dia);
    if (!valida) {
      this.reportar(`Linha ${numeroLinha}: campo data "${nomeCampo}" não é uma data existente "${bruto}".`);
      return null;
    }
    return `${ano}-${mes}-${dia}`;
  }

  private validarTamanho(linha: string, numeroLinha: number): void {
    if (linha.length !== TAMANHO_LINHA_450R) {
      this.reportar(
        `Linha ${numeroLinha} tem ${linha.length} caracteres (esperado ${TAMANHO_LINHA_450R}).`
      );
    }
  }

  /** Em modo estrito interrompe; em modo tolerante acumula o aviso e segue. */
  private reportar(mensagem: string): void {
    if (this.estrito) {
      throw new ErroLeituraRetorno(mensagem);
    }
    this.avisos.push(mensagem);
  }
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}
