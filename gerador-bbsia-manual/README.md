# Gerador BB SIA — Manual (Remessa GFG0010)

Ferramenta de linha de comando **standalone** (sem banco de dados) que gera o arquivo de Remessa
**GFG0010** enviado diariamente ao BBSIA/FGO a partir de uma **planilha `.xlsx`** (recomendado) ou de
um **CSV** de entrada, e de um **JSON** de parâmetros fixos.

Referência: Manual FGO Novo Desenrola Brasil, seção **13.1 — REMESSA - EVENTOS DO AGENTE FINANCEIRO -
GFG0010** (`FGO_MANUAL.txt` na raiz do repositório).

## Tipos de registro suportados

| Tipo | Descrição | Origem dos dados |
|---|---|---|
| `01` | HEADER | JSON de parâmetros |
| `03` | DETALHE (FORMALIZAÇÃO DE OPERAÇÃO) | Entrada + JSON (campos fixos) |
| `04` | DETALHE (LIBERAÇÃO DE CRÉDITO) | Entrada |
| `05` | DETALHE (INFORMAÇÃO DE SALDO) | Entrada |
| `06` | DETALHE (SOLICITAÇÃO DE HONRA DA GARANTIA) | Entrada |
| `07` | DETALHE (RECUPERAÇÃO DO VALOR HONRADO) | Entrada |
| `08` | DETALHE (CANCELAMENTO DE RECUPERAÇÃO DO VALOR HONRADO) | Entrada |
| `09` | DETALHE (DEVOLUÇÃO DO VALOR HONRADO) | Entrada |
| `10` | DETALHE (ALTERAÇÃO DE OPERAÇÃO) | Entrada + JSON (campos fixos) |
| `11` | DETALHE (CANCELAMENTO DE OPERAÇÃO PELO AGENTE) | Entrada |
| `12` | DETALHE (LIQUIDAÇÃO DE OPERAÇÃO) | Entrada |
| `13` | DETALHE (REATIVAÇÃO DE OPERAÇÃO LIQUIDADA) | Entrada |
| `99` | TRAILER | Calculado (quantidade de registros) |

"Entrada" é a planilha `.xlsx` ou o CSV — as colunas são as mesmas nos dois formatos.

São **todos** os tipos de registro da Remessa previstos no manual (§13.1). Os leiautes seguem o
`FGO_MANUAL.txt` versionado em `docs/`, posição a posição.

> Os tipos `92`–`98` pertencem aos arquivos de **Retorno** (3º/4º Retorno e Informativo Diário) e não
> são gerados por esta ferramenta.
>
> A ferramenta valida o **leiaute** (tamanho, tipo e formato de cada campo). As regras de negócio do
> manual (§12) que dependem do estado da operação no FGO — prazos, dia útil, situação permitida,
> janela de 91 a 180 dias da honra etc. — continuam sendo validadas pelo Administrador no 1º/2º Retorno.

Todas as linhas têm exatamente **211 colunas**, terminador `CRLF` e encoding **latin1**.

## Instalação

```bash
cd gerador-bbsia-manual
npm install
```

## Uso

```bash
# usando os arquivos de exemplo
npm run gerar:exemplo-xlsx   # planilha entrada/modelo-remessa.xlsx
npm run gerar:exemplo        # CSV entrada/exemplo-remessa.csv (gera o mesmo arquivo)

# uso geral (Git Bash, CMD, Linux, macOS)
npm run gerar -- --entrada entrada/minha-remessa.xlsx --config config/parametros.json --numero-remessa 12
npm run gerar -- --entrada entrada/meu-arquivo.csv --config config/parametros.json --numero-remessa 12
```

O formato é reconhecido pela extensão: `.xlsx` lê a planilha; qualquer outra lê como CSV. `.xls`,
`.xlsm`, `.xlsb` e `.ods` são recusados — salve como **Pasta de Trabalho do Excel (\*.xlsx)**.

> ⚠️ **Windows PowerShell**: o `--` é consumido pelo próprio PowerShell e os argumentos não chegam ao
> script (o npm passa a interpretá-los como flags dele e nada é gerado). Use uma destas formas:
>
> ```powershell
> npm run gerar "--" --entrada entrada/minha-remessa.xlsx --config config/parametros.json --numero-remessa 12
> # ou, mais simples, chamando direto:
> npx tsx src/index.ts --entrada entrada/minha-remessa.xlsx --config config/parametros.json --numero-remessa 12
> ```

O arquivo é gravado em `saida/GFGF0010.txt` (caminho relativo ao diretório de onde o comando é
executado). Para mudar, use `--saida` / `--nome-arquivo` ou as chaves `diretorioSaida` /
`nomeArquivoFisico` no JSON de parâmetros.

### Opções da CLI

| Opção | Descrição |
|---|---|
| `--entrada <caminho>` | Planilha `.xlsx` ou CSV com os registros-detalhe (**obrigatório**) |
| `--csv <caminho>` | Mesmo que `--entrada` (mantido por compatibilidade) |
| `--aba <nome>` | Aba da planilha `.xlsx` a ler (padrão: a primeira) |
| `--config <caminho>` | JSON com parâmetros fixos e dados de header/trailer |
| `--saida <diretório>` | Diretório de saída (sobrepõe o do JSON) |
| `--nome-arquivo <nome>` | Nome do arquivo físico gerado (sobrepõe o do JSON) |
| `--numero-remessa <n>` | Nº sequencial da Remessa (sobrepõe o do JSON) |
| `--separador <char>` | Separador do CSV (padrão `;`) |
| `--ordenar-por-tipo` | Agrupa os detalhes na ordem numérica do tipo (`03` → `04` → … → `13`) (padrão: preserva a ordem da entrada) |
| `--help` | Ajuda |

## Regra de onde cada campo mora

- **Fixo do leiaute** (ex.: público-alvo `07`, finalidade `3`) → **JSON** `config/parametros.json`.
- **Dinâmico por arquivo** (header/trailer: nº da Remessa, código do agente) → **JSON**.
- **Dinâmico por registro** (campo a campo: CPF, valores, datas) → **planilha `.xlsx` ou CSV**.

## Planilha de entrada (`.xlsx`) — recomendado

Use o modelo **`entrada/modelo-remessa.xlsx`** (recriado com `npm run modelo:xlsx`). Ele já vem com:

- aba **`remessa`** com as linhas de exemplo e ~500 linhas pré-formatadas;
- colunas de **código** (`tipoRegistro`, `idAcordo`, `novoIdAcordo`, `cpf`, `ibgeCliente`,
  `novoIbgeCliente`, `numeroPreValidacao`) formatadas como **Texto**;
- **valores** como número com 2 casas, **índice de perda** com 6 casas e **datas** como data;
- lista suspensa em `tipoRegistro`;
- aba **`instrucoes`** descrevendo cada coluna.

Por que é mais seguro que o CSV: número e data chegam **tipados** da planilha. O CSV exportado pelo
Excel grava `2700` como `2.700` quando a célula tem separador de milhar — texto ambíguo que antes
virava R$ 2,70.

Como cada célula é lida:

| Célula | Tratamento |
|---|---|
| Número em coluna de valor/índice | usado direto (sem conversão de texto) |
| Data em coluna de data | usada direto; nº serial do Excel (ex.: `46194`) também é convertido |
| Fórmula | usa o resultado calculado |
| Texto | passa pelas mesmas regras do CSV (ver [Formatos aceitos](#formatos-aceitos)) |
| Número em coluna de **código** | aceito só se for inteiro exato (até 15 dígitos); senão **erro** pedindo para formatar como Texto |
| Data fora de coluna de data, VERDADEIRO/FALSO, `#N/D` e afins | **erro** |

Linhas totalmente vazias são ignoradas. Os números de linha nas mensagens de erro são os da planilha.

## Formato do CSV

Arquivo único, separado por `;`, com a coluna **`tipoRegistro`** identificando o tipo de detalhe
(`03` a `13`, exceto os de retorno). As colunas são um *superset*: cada linha preenche apenas as do
seu tipo e deixa as demais vazias. Colunas não reconhecidas são ignoradas (com aviso no console).

A ordem das linhas da entrada é preservada no arquivo gerado, salvo uso de `--ordenar-por-tipo`.

> Evite gerar o CSV pelo "Salvar como CSV" do Excel — prefira mandar a própria planilha `.xlsx`.

### Colunas por tipo

As mesmas colunas valem para a planilha `.xlsx` e para o CSV.

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
para ele na entrada.

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
| `indicePerdaEsperada` | sim | 116-122 | Decimal com 6 casas: informe `0,000051` (a ferramenta grava `0000051`). Se vier só com dígitos, é lido no formato bruto do manual com 6 casas implícitas: `928799` ⇒ `0,928799`, `51` ⇒ `0,000051`, `1000000` ⇒ `1`. Vale também para célula numérica inteira na planilha |

**Tipo `06` — Solicitação de honra da garantia**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | |
| `dataInicioInadimplenciaCapital` | sim | 30-37 | Mesma coluna do tipo `05`; deve ser igual à do último saldo informado |
| `dataSolicitacaoHonra` | sim | 38-45 | Dia útil; igual à data de entrega da Remessa |
| `valorSaldoBaseHonra` | sim | 46-62 | Saldo-base para cálculo do valor a ser honrado |

**Tipo `07` — Recuperação do valor honrado**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | |
| `dataRecuperacao` | sim | 30-37 | Data em que o Agente recebeu o valor a favor do FGO |
| `valorRecuperacao` | sim | 38-54 | Valor efetivamente recebido do cliente |

**Tipo `08` — Cancelamento de recuperação do valor honrado**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | |
| `dataRecuperacao` | sim | 30-37 | Data da recuperação **a cancelar** (mesma coluna do tipo `07`) |
| `valorRecuperacao` | sim | 38-54 | Valor recuperado **a cancelar** (mesma coluna do tipo `07`) |
| `dataCancelamentoRecuperacao` | sim | 55-62 | Data do cancelamento |

**Tipo `09` — Devolução do valor honrado**

| Coluna | Obrigatória | Posições |
|---|---|---|
| `idAcordo` | sim | 10-29 |
| `dataDevolucaoHonra` | sim | 30-37 |

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

**Tipo `13` — Reativação de operação liquidada**

| Coluna | Obrigatória | Posições | Observação |
|---|---|---|---|
| `idAcordo` | sim | 10-29 | |
| `dataReativacaoOperacao` | sim | 30-37 | Até 40 dias corridos após a liquidação |

### Formatos aceitos

- **Datas**: `DD/MM/AAAA`, `AAAA-MM-DD` ou `AAAAMMDD`.
- **Valores**: `2594,84`, `2.594,84`, `2700` ou `2594.84`. São convertidos para centavos (17 posições).
  Texto só com pontos em grupos de 3 dígitos (`2.700`, `1.234.567`) é **recusado por ambiguidade**
  (milhar brasileiro ou decimal americano?) — informe `2700` ou `2.700,00`.
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

- a entrada não tem a coluna `tipoRegistro`, ou o valor não é `03`/`04`/`05`/`06`/`07`/`08`/`09`/`10`/`11`/`12`/`13`;
- a planilha não é `.xlsx`, a aba informada em `--aba` não existe ou uma célula não pode ser lida
  (ver tabela da seção da planilha);
- falta uma coluna obrigatória do tipo da linha;
- um campo numérico contém caractere não numérico ou estoura o tamanho da posição;
- uma data é inválida ou está em formato não reconhecido;
- um valor monetário é negativo, não numérico ou ambíguo (`2.700`);
- qualquer linha do arquivo não fica com exatamente 211 caracteres;
- a numeração sequencial dos registros não é contínua a partir de `0000001`.

Os erros de layout apontam o campo e as posições exatas, por exemplo:

```
[ERRO] Erro de Layout [03 DETALHE (FORMALIZAÇÃO DE OPERAÇÃO) (linha 2 da entrada, idAcordo=1922951)] ->
O campo "ibgeCliente" (Posições 34 a 40) deveria ter tamanho 7, mas foi gerado com tamanho 8
```

## Retornos do FGO → planilha (`.xlsx`)

Faz o caminho inverso: recebe o arquivo posicional de **retorno** entregue pelo FGO/BB SIA e gera
**uma planilha por arquivo**, com o nome de cada campo nas colunas e os valores logo abaixo.

```bash
npm run retorno:xlsx -- --arquivo GFG200.C59010.2026070800005100.230816.RET
npm run retorno:xlsx -- --pasta downloads/retornos --saida saida/retornos   # converte a pasta toda
npm run retorno:exemplo                                                     # converte entrada/retornos-exemplo
```

No PowerShell: `npm run retorno:xlsx "--" --arquivo ...` ou `npx tsx src/retornos/cli-retorno.ts --arquivo ...`.

| Arquivo | Retorno | Registros (uma aba cada) |
|---|---|---|
| `GFGF010R` | 1º — Confirmação de recebimento da Remessa (§13.2) | `01`, `99` |
| `GFGF200R` | 2º — Validação dos eventos do Agente (§13.3) | `01`, `03`–`13`, `99` |
| `GFGF290R` | 3º — Eventos do Administrador (§13.4) | `01`, `92`, `93`, `94`, `95`, `99` |
| `GFGF450R` | 4º — Movimentação financeira (§13.5) | `01`, `97`, `99` |
| `GFGF270R` | Informativo diário (§13.6) | `01`, `91`, `96`, `98`, `99` |

O tipo é reconhecido pelo **header** (posições 10-17), não pelo nome do arquivo. Com `--pasta`, os
arquivos que não são retorno do FGO são ignorados com aviso.

### Como a planilha é montada

- Aba **Resumo**: arquivo de origem, nº da Remessa, data e hora (com a fonte de cada uma), agente,
  CNPJ, quantidade por tipo de registro — no 200R, também quantos foram **rejeitados** — e os avisos
  de leiaute.
- Uma aba **por tipo de registro** presente no arquivo (`01 Header`, `03 Formalização`,
  `97 Movimentação financeira`...), com uma coluna por campo do manual e uma linha por registro.
- A **nota** do cabeçalho de cada coluna traz as posições, o tipo e a descrição do manual.
- Campos com código de tabela ganham uma coluna **"— descrição"** com o texto do manual: rejeição da
  Remessa (§14.1), rejeição do registro (§14.2), pendência (§14.12), encerramento (§14.13), situação
  (§14.14), impugnação (§14.15), tipo e natureza da movimentação (§14.16/§14.17) e, nos campos da
  Remessa ecoados no 200R (tipos 03 e 10), tipo de pessoa, público-alvo, modalidade, finalidade, fonte,
  programa, cronograma, condição especial e formalização (§14.3 a §14.11).
- Datas viram data do Excel (zeros = vazio), valores viram número com 2 casas, índices com as casas do
  manual; códigos (CPF, IBGE, nº da Remessa...) ficam como texto, preservando zeros à esquerda.
- No 200R, os campos ecoados da Remessa são exibidos com os nomes do leiaute da Remessa (§13.1).
- Campos de espaços/zeros não viram coluna, mas são conferidos.

### Nome da planilha

`<ARQUIVO>_<nº da Remessa>_<AAAAMMDD>_<HHMMSS>.xlsx` — ex.: `GFGF010R_0001_20260708_174534.xlsx`.

| Arquivo | Nº da Remessa | Data | Hora |
|---|---|---|---|
| `GFGF010R` | header 32-35 | header 36-43 (entrega da Remessa) | header 44-49 (entrega da Remessa) |
| `GFGF200R` / `GFGF290R` | header 32-35 | header 36-43 (processamento) | nome BB SIA |
| `GFGF450R` | header 32-35 | nome BB SIA | nome BB SIA |
| `GFGF270R` | não existe | nome BB SIA | nome BB SIA |

"Nome BB SIA" é o nome com que o arquivo é baixado, `GFG200.C59010.<protocolo>.<HHMMSS>.RET`: o
protocolo começa pela data (AAAAMMDD) e o penúltimo bloco é a hora de disponibilização. Se o arquivo
foi renomeado e o header não traz a informação, a parte é omitida do nome (com aviso).

### Validações da leitura

A leitura não para em problema de conteúdo — gera a planilha e lista os avisos na aba Resumo e no
console: linha com tamanho diferente de 211, tipo de registro que não existe naquele retorno (a linha é
ignorada), nº sequencial fora de ordem, data/hora inválida, caractere não numérico em campo numérico,
lixo em área de espaços/zeros e quantidade do trailer divergente. Só é recusado o arquivo cujo header
não é de um retorno do FGO.

> O manual traz um erro de posição no tipo `96` do `GFGF270R`: "data da situação patrimonial" em
> 117-125 (tamanho 8) e espaços em 126-211 (tamanho 87). Os tamanhos só fecham 211 colunas como
> **117-124** e **125-211** — é o que a ferramenta usa.

## Estrutura

```
gerador-bbsia-manual/
├── config/parametros.json      # campos fixos + header/trailer
├── entrada/
│   ├── modelo-remessa.xlsx     # modelo de planilha com os 11 tipos de detalhe
│   ├── exemplo-remessa.csv     # mesmo exemplo em CSV
│   └── retornos-exemplo/       # um arquivo fictício de cada retorno (010R, 200R, 290R, 450R, 270R)
├── saida/                      # arquivo gerado (git-ignored)
└── src/
    ├── index.ts                # CLI
    ├── modelo-xlsx.ts          # gera entrada/modelo-remessa.xlsx
    ├── gerador.ts              # orquestração + validação do arquivo
    ├── registros.ts            # montagem posicional de 01, 03 a 13 e 99
    ├── csv.ts                  # leitura do CSV + mapeamento/validação por tipo
    ├── xlsx.ts                 # leitura da planilha .xlsx (exceljs)
    ├── config.ts               # parâmetros e defaults
    ├── formatadores.ts         # N / A / M / D e helpers
    ├── layout-line-builder.ts  # validação campo a campo
    ├── tipos.ts                # tipos e constantes de registro
    ├── retornos/               # retornos do FGO → planilha
    │   ├── cli-retorno.ts      # CLI (npm run retorno:xlsx)
    │   ├── leiautes-retorno.ts # leiautes declarativos §13.2-§13.6
    │   ├── leitor-retorno.ts   # leitura genérica + avisos
    │   ├── planilha-retorno.ts # abas, colunas e nome da planilha
    │   └── tabelas-fgo.ts      # tabelas §14 (extraídas do manual)
    └── retorno450r/            # leitor/gerador fake específico do 450R
```
