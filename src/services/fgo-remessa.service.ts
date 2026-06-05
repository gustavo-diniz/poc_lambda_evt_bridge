// ---------------------------------------------------------------------------
// Geração do arquivo posicional GFG0010 (Remessa FGO — 211 chars por linha)
// ---------------------------------------------------------------------------

// ── Helpers posicionais ────────────────────────────────────────────────────

function padL(v: string | number, n: number): string {
  return String(v).padStart(n, '0')
}

function padR(v: string, n: number): string {
  return v.padEnd(n, ' ')
}

// Valor monetário: R$ → centavos → 17 dígitos com zeros à esquerda
// Ex: 5000.00 → "00000000000500000"
function toReais(v: number): string {
  return padL(Math.round(v * 100), 17)
}

// Data ISO "YYYY-MM-DD" → "AAAAMMDD"
function toData(d: string): string {
  return d.replace(/-/g, '')
}

// CPF (11 dígitos, só números) → campo 14N (3 zeros + 11 dígitos)
// Ex: "11144477735" → "00011144477735"
function toCPF14(cpf: string): string {
  return cpf.replace(/\D/g, '').padStart(14, '0')
}

// Índice de perda esperada (0–1, 6 casas decimais) → 7N
// Ex: 0.000051 → "0000051"
function toIndice(v: number): string {
  return padL(Math.round(v * 1_000_000), 7)
}

// ── Tipos de entrada ───────────────────────────────────────────────────────

export interface LiberacaoFgoInput {
  /** "YYYY-MM-DD" */
  dataLiberacao: string
  /** R$ com centavos — ex: 5000.00 */
  valorLiberado: number
}

export interface SaldoFgoInput {
  /** "YYYY-MM-DD" — deve ser o último dia do mês anterior */
  dataApuracao: string
  capitalNormalidade: number
  capitalAtraso: number
  encargosNormalidade: number
  encargosAtraso: number
  /** Obrigatório quando capitalAtraso > 0. "YYYY-MM-DD" */
  dataInadimplencia?: string | null
  /** 0 a 1 com até 6 casas decimais. Ex: 0.000051 */
  indicePerdaEsperada: number
}

export interface OperacaoFgoInput {
  /** Máx 20 chars. 1º char deve ser letra ou número */
  codigoOp: string
  /** 4 dígitos */
  agencia: string
  /** 7 dígitos — IBGE sem dígito verificador. Ex: "0530010" (Brasília) */
  ibge: string
  /** CPF do mutuário — 11 dígitos, sem pontos ou hífens */
  cpf: string
  /** Renda mensal em R$ — máx 5 salários-mínimos (R$ 8.105,00) */
  rendaMensal: number
  /** Valor da operação em R$ — máx R$ 15.000,00 */
  valorOperacao: number
  /** "YYYY-MM-DD" — deve ser ≥ 05/05/2026 */
  dataFormalizacao: string
  /** "YYYY-MM-DD" — deve ser > dataFormalizacao e ≤ 1461 dias (48 meses) */
  dataVencimento: string
  /** 9 dígitos — obrigatório para FGO Novo Desenrola Brasil */
  numeroPreValidacao: string
  liberacoes: LiberacaoFgoInput[]
  saldos: SaldoFgoInput[]
}

export interface RemessaFgoInput {
  /** Código do Agente Financeiro — 3 dígitos */
  agente: string
  /** Nº sequencial da remessa — começa em "0001" */
  numRemessa: string
  operacoes: OperacaoFgoInput[]
}

// ── Geração do arquivo ─────────────────────────────────────────────────────

export function gerarArquivoRemessa(input: RemessaFgoInput): string {
  const linhas: string[] = []
  let seq = 1

  // ── HEADER (tipo 01) ───────────────────────────────────────────────────
  // Pos 1-7   seq | 8-9 tipo | 10-17 nome | 18-25 versão
  // Pos 26-28 agente | 29-31 fundo | 32-35 numRemessa | 36-211 espaços
  linhas.push([
    padL(seq++, 7),
    '01',
    'GFGF0010',                        // nome fixo do arquivo (8A) — spec 13.1
    '20170331',
    padL(input.agente.replace(/\D/g, ''), 3),        // tipo N: apenas dígitos
    '010',
    padL(input.numRemessa.replace(/\D/g, ''), 4),    // tipo N: apenas dígitos
    ' '.repeat(176),
  ].join(''))

  // ── DETALHES por operação ──────────────────────────────────────────────
  for (const op of input.operacoes) {
    // Tipo A: letras MAIÚSCULAS, dígitos e separadores — alinhado à esquerda, espaços à direita
    const codOp = padR(op.codigoOp.substring(0, 20).toUpperCase(), 20)

    // Tipo 03 — Formalização de Operação
    // Pos 10-29 codOp | 30-33 agência | 34-40 IBGE | 41 tipoPessoa
    // Pos 42-55 CPF | 56-57 públicoAlvo | 58-74 renda | 75-91 valorOp
    // Pos 92-96 percentualGarantia | 97 modal | 98 finalidade | 99-101 fonte
    // Pos 102-105 programa | 106-113 dtForm | 114-121 dtVenc
    // Pos 122 cronograma | 123-124 condEsp | 125-132 dtDespacho
    // Pos 133 tpFrm | 134-142 preVal | 143-159 subvencao
    // Pos 160-170 cpfQualif | 171-211 espaços
    linhas.push([
      padL(seq++, 7),
      '03',
      codOp,
      padL(op.agencia.replace(/\D/g, ''), 4),        // tipo N: apenas dígitos
      padL(op.ibge.replace(/\D/g, ''), 7),           // tipo N: apenas dígitos
      '1',
      toCPF14(op.cpf),
      '07',
      toReais(op.rendaMensal),
      toReais(op.valorOperacao),
      '10000',
      '1',
      '3',
      '011',
      '0050',
      toData(op.dataFormalizacao),
      toData(op.dataVencimento),
      '1',
      '01',
      '00000000',
      '1',
      padL(op.numeroPreValidacao.replace(/\D/g, ''), 9),
      '00000000000000000',
      ' '.repeat(11),
      ' '.repeat(41),
    ].join(''))

    // Tipo 04 — Liberação de Crédito
    // Pos 10-29 codOp | 30-37 dtLib | 38-54 valorLib | 55-211 espaços
    for (const lib of op.liberacoes) {
      linhas.push([
        padL(seq++, 7),
        '04',
        codOp,
        toData(lib.dataLiberacao),
        toReais(lib.valorLiberado),
        ' '.repeat(157),
      ].join(''))
    }

    // Tipo 05 — Informação de Saldo
    // Pos 10-29 codOp | 30-37 dtApuração | 38-54 capNorm | 55-71 capAtras
    // Pos 72-88 encNorm | 89-105 encAtras | 106-107 espaços
    // Pos 108-115 dtInadimplencia | 116-122 indice | 123-211 espaços
    for (const saldo of op.saldos) {
      const dataInad = saldo.capitalAtraso > 0 && saldo.dataInadimplencia
        ? toData(saldo.dataInadimplencia)
        : '00000000'

      linhas.push([
        padL(seq++, 7),
        '05',
        codOp,
        toData(saldo.dataApuracao),
        toReais(saldo.capitalNormalidade),
        toReais(saldo.capitalAtraso),
        toReais(saldo.encargosNormalidade),
        toReais(saldo.encargosAtraso),
        '  ',
        dataInad,
        toIndice(saldo.indicePerdaEsperada),
        ' '.repeat(89),
      ].join(''))
    }
  }

  // ── TRAILER (tipo 99) ──────────────────────────────────────────────────
  // seq agora é o número do trailer (= total de registros inclusive ele mesmo)
  // Pos 1-7 seq | 8-9 tipo | 10-16 qtdRegistros | 17-211 espaços
  const trailerSeq = seq
  linhas.push([
    padL(trailerSeq, 7),
    '99',
    padL(trailerSeq, 7),
    ' '.repeat(195),
  ].join(''))

  return linhas.join('\r\n')
}
