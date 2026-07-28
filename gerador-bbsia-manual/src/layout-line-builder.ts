'use strict';

import { ErroGeracaoArquivo } from './formatadores.js';

/**
 * Monta uma linha posicional validando, campo a campo, o tamanho declarado no leiaute.
 * Qualquer divergência aponta a posição exata (INÍCIO-FIM) do campo problemático.
 */
export class LayoutLineBuilder {
  private content = '';
  private currentPos = 1;

  constructor(private contextName: string) {}

  adicionar(valor: string, tamanhoEsperado: number, nomeCampo: string): this {
    const inicioPos = this.currentPos;
    const fimPos = this.currentPos + tamanhoEsperado - 1;

    if (valor.length !== tamanhoEsperado) {
      throw new ErroGeracaoArquivo(
        `Erro de Layout [${this.contextName}] -> O campo "${nomeCampo}" (Posições ${inicioPos} a ${fimPos}) ` +
          `deveria ter tamanho ${tamanhoEsperado}, mas foi gerado com tamanho ${valor.length} (Valor: "${valor}")`
      );
    }

    this.content += valor;
    this.currentPos += tamanhoEsperado;
    return this;
  }

  build(tamanhoTotalEsperado: number): string {
    if (this.content.length !== tamanhoTotalEsperado) {
      throw new ErroGeracaoArquivo(
        `Erro de Layout [${this.contextName}] -> O tamanho final da linha deveria ser exatamente ` +
          `${tamanhoTotalEsperado} caracteres, mas ficou com ${this.content.length} caracteres.`
      );
    }
    return this.content;
  }
}
