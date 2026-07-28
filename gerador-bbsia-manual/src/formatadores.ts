'use strict';

export class ErroGeracaoArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroGeracaoArquivo';
  }
}

/**
 * Campo numérico (N): apenas dígitos, alinhado à direita com zeros à esquerda.
 */
export function formatarNumerico(
  valor: string | number | null | undefined,
  tamanho: number,
  nomeCampo: string
): string {
  const texto = String(valor ?? '').trim();
  if (!/^\d*$/.test(texto)) {
    throw new ErroGeracaoArquivo(
      `Campo numérico "${nomeCampo}" contém caracteres não numéricos: "${texto}"`
    );
  }
  if (texto.length > tamanho) {
    throw new ErroGeracaoArquivo(
      `Estouro no campo numérico "${nomeCampo}": "${texto}" excede ${tamanho} posições.`
    );
  }
  return texto.padStart(tamanho, '0');
}

/**
 * Campo alfanumérico (A): alinhado à esquerda, completado com espaços à direita.
 */
export function formatarAlfanumerico(
  valor: string | number | null | undefined,
  tamanho: number,
  nomeCampo: string
): string {
  let texto = String(valor ?? '').toUpperCase();
  if (texto.length > tamanho) {
    console.warn(
      `[WARN] Campo alfanumérico "${nomeCampo}" truncado de ${texto.length} para ${tamanho} posições. Valor original: "${texto}"`
    );
    texto = texto.substring(0, tamanho);
  }
  return texto.padEnd(tamanho, ' ');
}

export function formatarEspacos(tamanho: number): string {
  return ' '.repeat(tamanho);
}

export function formatarZeros(tamanho: number): string {
  return '0'.repeat(tamanho);
}

/**
 * Campo monetário (M): valor em reais convertido para centavos, sem separadores.
 * Aceita "2594,84", "2594.84" ou número.
 */
export function formatarMoeda(
  valor: string | number | null | undefined,
  tamanho: number,
  nomeCampo: string
): string {
  const numero = converterParaNumero(valor, nomeCampo);
  if (numero < 0) {
    throw new ErroGeracaoArquivo(
      `Campo moeda "${nomeCampo}" não pode ser negativo: "${valor}"`
    );
  }
  const centavos = Math.round(numero * 100);
  return formatarNumerico(String(centavos), tamanho, nomeCampo);
}

/**
 * Índice decimal com N casas (ex.: índice de perda esperada, 6 casas em 7 posições).
 * Aceita "0,000051" ou 0.000051.
 */
export function formatarDecimal(
  valor: string | number | null | undefined,
  tamanho: number,
  casasDecimais: number,
  nomeCampo: string
): string {
  const numero = converterParaNumero(valor, nomeCampo);
  if (numero < 0) {
    throw new ErroGeracaoArquivo(
      `Campo decimal "${nomeCampo}" não pode ser negativo: "${valor}"`
    );
  }
  const inteiro = Math.round(numero * Math.pow(10, casasDecimais));
  return formatarNumerico(String(inteiro), tamanho, nomeCampo);
}

export function converterParaNumero(
  valor: string | number | null | undefined,
  nomeCampo: string
): number {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      throw new ErroGeracaoArquivo(`Campo "${nomeCampo}" não é um número válido: "${valor}"`);
    }
    return valor;
  }

  const texto = String(valor ?? '').trim();
  if (texto === '') {
    return 0;
  }

  // Aceita tanto o padrão brasileiro ("1.234,56") quanto o americano ("1234.56").
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) {
    throw new ErroGeracaoArquivo(`Campo "${nomeCampo}" não é um número válido: "${valor}"`);
  }
  return numero;
}

/**
 * Campo data (D) no formato AAAAMMDD.
 * Aceita "21/06/2026", "2026-06-21", "20260621" ou Date.
 * Vazio/zerado resulta em "00000000" quando `permitirZerado` estiver ligado.
 */
export function formatarData(
  valor: string | Date | null | undefined,
  nomeCampo: string,
  opcoes: { permitirZerado?: boolean } = {}
): string {
  const permitirZerado = opcoes.permitirZerado ?? false;

  if (valor instanceof Date) {
    return montarDataAAAAMMDD(valor.getFullYear(), valor.getMonth() + 1, valor.getDate(), nomeCampo);
  }

  const texto = String(valor ?? '').trim();

  if (texto === '' || texto === '0' || texto === '00000000') {
    if (!permitirZerado) {
      throw new ErroGeracaoArquivo(`Campo data "${nomeCampo}" é obrigatório e veio vazio.`);
    }
    return '00000000';
  }

  const brasileiro = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brasileiro) {
    return montarDataAAAAMMDD(
      Number(brasileiro[3]),
      Number(brasileiro[2]),
      Number(brasileiro[1]),
      nomeCampo
    );
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return montarDataAAAAMMDD(Number(iso[1]), Number(iso[2]), Number(iso[3]), nomeCampo);
  }

  const compacto = texto.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compacto) {
    return montarDataAAAAMMDD(
      Number(compacto[1]),
      Number(compacto[2]),
      Number(compacto[3]),
      nomeCampo
    );
  }

  throw new ErroGeracaoArquivo(
    `Campo data "${nomeCampo}" com formato inválido: "${texto}". ` +
      `Formatos aceitos: DD/MM/AAAA, AAAA-MM-DD ou AAAAMMDD.`
  );
}

function montarDataAAAAMMDD(
  ano: number,
  mes: number,
  dia: number,
  nomeCampo: string
): string {
  if (!Number.isInteger(ano) || ano < 1900 || ano > 2999) {
    throw new ErroGeracaoArquivo(`Campo data "${nomeCampo}" com ano inválido: "${ano}"`);
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    throw new ErroGeracaoArquivo(
      `Campo data "${nomeCampo}" possui dia/mês inválidos: "${dia}/${mes}/${ano}"`
    );
  }

  const referencia = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    referencia.getUTCFullYear() !== ano ||
    referencia.getUTCMonth() + 1 !== mes ||
    referencia.getUTCDate() !== dia
  ) {
    throw new ErroGeracaoArquivo(
      `Campo data "${nomeCampo}" não corresponde a uma data existente: "${dia}/${mes}/${ano}"`
    );
  }

  return `${ano}${String(mes).padStart(2, '0')}${String(dia).padStart(2, '0')}`;
}

/**
 * Remove máscara de documentos (CPF/CNPJ) mantendo apenas dígitos.
 */
export function apenasDigitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}
