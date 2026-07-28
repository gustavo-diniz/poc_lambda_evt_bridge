# Gerador BB SIA — Manual (Remessa GFG0010)

Ferramenta de linha de comando **standalone** (sem banco de dados) que gera o arquivo de Remessa
**GFG0010** enviado diariamente ao BBSIA/FGO a partir de um **CSV** de entrada e de um **JSON** de
parâmetros fixos.

Referência: Manual FGO Novo Desenrola Brasil, seção **13.1 — REMESSA - EVENTOS DO AGENTE FINANCEIRO -
GFG0010** (`FGO_MANUAL.txt` na raiz do repositório).

## Tipos de registro suportados

| Tipo | Descrição | Origem dos dados |
|---|---|---|
| `01` | HEADER | JSON de parâmetros |
| `03` | DETALHE (FORMALIZAÇÃO DE OPERAÇÃO) | CSV + JSON (campos fixos) |
| `04` | DETALHE (LIBERAÇÃO DE CRÉDITO) | CSV |
| `05` | DETALHE (INFORMAÇÃO DE SALDO) | CSV |
| `10` | DETALHE (ALTERAÇÃO DE OPERAÇÃO) | CSV + JSON (campos fixos) |
| `11` | DETALHE (CANCELAMENTO DE OPERAÇÃO PELO AGENTE) | CSV |
| `12` | DETALHE (LIQUIDAÇÃO DE OPERAÇÃO) | CSV |
| `99` | TRAILER | Calculado (quantidade de registros) |

> Os tipos `92`–`98` pertencem aos arquivos de **Retorno** (3º/4º Retorno e Informativo Diário) e não
> são gerados por esta ferramenta.
>
> O leiaute dos detalhes `10`, `11` e `12` **não consta** na cópia do manual versionada no repositório
> (`FGO_MANUAL.txt`, §13.1) — foi implementado a partir do trecho de leiaute fornecido pelo time.

Todas as linhas têm exatamente **211 colunas**, terminador `CRLF` e encoding **latin1**.

## Instalação

```bash
cd gerador-bbsia-manual
npm install
```

## Uso

```bash
# usando os arquivos de exemplo
npm run gerar:exemplo

# uso geral
npm run gerar -- --csv entrada/meu-arquivo.csv --config config/parametros.json --numero-remessa 12
```

### Opções da CLI

| Opção | Descrição |
|---|---|
| `--csv <caminho>` | CSV de entrada com os registros-detalhe (**obrigatório**) |
| `--config <caminho>` | JSON com parâmetros fixos e dados de header/trailer |
| `--saida <diretório>` | Diretório de saída (sobrepõe o do JSON) |
| `--nome-arquivo <nome>` | Nome do arquivo físico gerado (sobrepõe o do JSON) |
| `--numero-remessa <n>` | Nº sequencial da Remessa (sobrepõe o do JSON) |
| `--separador <char>` | Separador do CSV (padrão `;`) |
| `--ordenar-por-tipo` | Agrupa os detalhes na ordem `03` → `04` → `05` → `10` → `11` → `12` (padrão: preserva a ordem do CSV) |
| `--help` | Ajuda |

## Regra de onde cada campo mora

- **Fixo do leiaute** (ex.: público-alvo `07`, finalidade `3`) → **JSON** `config/parametros.json`.
- **Dinâmico por arquivo** (header/trailer: nº da Remessa, código do agente) → **JSON**.
- **Dinâmico por registro** (campo a campo: CPF, valores, datas) → **CSV**.

## Formato do CSV

Arquivo único, separado por `;`, com a coluna **`tipoRegistro`** identificando o tipo de detalhe
(`03`, `04` ou `05`). As colunas são um *superset*: cada linha preenche apenas as do seu tipo e deixa
as demais vazias. Colunas não reconhecidas são ignoradas (com aviso no console).

A ordem das linhas do CSV é preservada no arquivo gerado, salvo uso de `--ordenar-por-tipo`.

### Colunas por tipo

**Tipo `03` — Formalização de operação**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | Alfanumérico, até 20 posições |
| `ibgeCliente` | sim | 34-40 | Código IBGE sem dígito verificador (7N) |
| `cpf` | sim | 42-55 | Só dígitos; máscara é removida automaticamente |
| `valorRenda` | sim | 58-74 | Reais (`2700` ou `2.700,00`) |
| `valorOperacaoCredito` | sim | 75-91 | Reais (`2594,84`) |
| `dataAcordo` | sim | 106-113 | Data da formalização |
| `dataVencimentoOperacao` | sim | 114-121 | |
| `numeroPreValidacao` | sim | 134-142 | Nº da pré-validação FGO (obrigatório no Novo Desenrola) |
| `valorSubvencao` | não | 143-159 | Manual manda zeros; vazio ⇒ zeros |

O **CPF Qualificador** (160-170) é preenchido com espaços conforme o manual — por isso não há coluna
para ele no CSV.

**Tipo `04` — Liberação de crédito**

| Coluna | Obrigatória | Posições |
|---|---|---|
| `idAcordo` | sim | 10-29 |
| `dataLiberacaoCredito` | sim | 30-37 |
| `valorLiberacaoCredito` | sim | 38-54 |

**Tipo `05` — Informação de saldo**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | |
| `dataApuracaoSaldos` | sim | 30-37 | |
| `valorSaldoCapitalNormalidade` | sim | 38-54 | |
| `valorSaldoCapitalAtraso` | sim | 55-71 | |
| `valorSaldoEncargosNormalidade` | sim | 72-88 | |
| `valorSaldoEncargosAtraso` | sim | 89-105 | |
| `dataInicioInadimplenciaCapital` | não | 108-115 | Vazio ⇒ `00000000` (sem capital em atraso) |
| `indicePerdaEsperada` | sim | 116-122 | Decimal com 6 casas: informe `0,000051` (a ferramenta grava `0000051`) |

**Tipo `10` — Alteração de operação**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | Código atual da operação |
| `novoIdAcordo` | não | 30-49 | Vazio ⇒ repete o `idAcordo`, conforme o manual |
| `dataAlteracaoOperacao` | sim | 50-57 | |
| `novoIbgeCliente` | sim | 62-68 | Sem dígito verificador; sem alteração ⇒ repita o atual |
| `novoValorRenda` | sim | 86-102 | Sem alteração ⇒ repita o valor atual |
| `dataVencimentoOperacao` | sim | 142-149 | Mesma coluna usada pelo tipo `03` |

Público-alvo (84-85) e programa de crédito (130-133) vêm do JSON (`07` e `0050`).

**Tipo `11` — Cancelamento de operação pelo Agente**

| Coluna | Obrigatória | Posições |
|---|---|---|
| `idAcordo` | sim | 10-29 |
| `dataCancelamentoOperacao` | sim | 30-37 |

**Tipo `12` — Liquidação de operação**

| Coluna | Obrigatória | Posições |
|---|---|---|
| `idAcordo` | sim | 10-29 |
| `dataLiquidacaoOperacao` | sim | 30-37 |

O campo 38-57 é enviado em branco, conforme o leiaute.

### Formatos aceitos

- **Datas**: `DD/MM/AAAA`, `AAAA-MM-DD` ou `AAAAMMDD`.
- **Valores**: `2594,84`, `2.594,84` ou `2594.84`. São convertidos para centavos (17 posições).
- **Índice de perda esperada**: `0,000051` (decimal) — não informe o valor já formatado.

## Parâmetros (`config/parametros.json`)

| Chave | Padrão | Posições / uso |
|---|---|---|
| `nomeArquivoRemessa` | `GFGF0010` | Header 10-17 |
| `versaoLeiaute` | `20170331` | Header 18-25 |
| `codigoAgenteFinanceiro` | `59` | Header 26-28 (Digio = `059`) |
| `codigoFundoGarantidor` | `10` | Header 29-31 (`010`) |
| `numeroSequencialRemessa` | `1` | Header 32-35 |
| `numeroAgenciaContratanteOperacao` | `1` | Detalhe 03, 30-33 |
| `codigoTipoPessoa` | `1` | Detalhe 03, 41 |
| `codigoTipoPublicoAlvo` | `7` | Detalhe 03, 56-57 |
| `percentualGarantiaOperacaoCredito` | `100` | Detalhe 03, 92-96 (gravado `10000`) |
| `codigoTipoModalidadeCredito` | `1` | Detalhe 03, 97 |
| `codigoTipoFinalidadeCredito` | `3` | Detalhe 03, 98 |
| `codigoTipoFonteRecurso` | `11` | Detalhe 03, 99-101 |
| `codigoTipoProgramaCredito` | `50` | Detalhe 03, 102-105 |
| `codigoTipoCronogramaAmortizacao` | `1` | Detalhe 03, 122 |
| `codigoTipoCondicaoEspecial` | `1` | Detalhe 03, 123-124 |
| `dataDespachoExternoOperacao` | `0` | Detalhe 03, 125-132 (`00000000`) |
| `codigoTipoFormalizacao` | `1` | Detalhe 03, 133 |
| `diretorioSaida` | `./saida` | Onde o `.txt` é gravado |
| `nomeArquivoFisico` | `GFGF0010.txt` | Nome do arquivo gerado |

> Lembrete de negócio: em caso de rejeição no 1º Retorno (GFGF010R), o `numeroSequencialRemessa`
> **não** deve ser incrementado — a próxima Remessa repete o mesmo número.

## Validações aplicadas

A geração falha (sem gravar arquivo) quando:

- o CSV não tem a coluna `tipoRegistro`, ou o valor não é `03`/`04`/`05`/`10`/`11`/`12`;
- falta uma coluna obrigatória do tipo da linha;
- um campo numérico contém caractere não numérico ou estoura o tamanho da posição;
- uma data é inválida ou está em formato não reconhecido;
- um valor monetário é negativo ou não numérico;
- qualquer linha do arquivo não fica com exatamente 211 caracteres;
- a numeração sequencial dos registros não é contínua a partir de `0000001`.

Os erros de layout apontam o campo e as posições exatas, por exemplo:

```
[ERRO] Erro de Layout [03 DETALHE (FORMALIZAÇÃO DE OPERAÇÃO) (linha CSV 2, idAcordo=1922951)] ->
O campo "ibgeCliente" (Posições 34 a 40) deveria ter tamanho 7, mas foi gerado com tamanho 8
```

## Estrutura

```
gerador-bbsia-manual/
├── config/parametros.json      # campos fixos + header/trailer
├── entrada/exemplo-remessa.csv # CSV de exemplo com os 6 tipos de detalhe
├── saida/                      # arquivo gerado (git-ignored)
└── src/
    ├── index.ts                # CLI
    ├── gerador.ts              # orquestração + validação do arquivo
    ├── registros.ts            # montagem posicional de 01/03/04/05/10/11/12/99
    ├── csv.ts                  # leitura e mapeamento do CSV
    ├── config.ts               # parâmetros e defaults
    ├── formatadores.ts         # N / A / M / D e helpers
    ├── layout-line-builder.ts  # validação campo a campo
    └── tipos.ts                # tipos e constantes de registro
```
