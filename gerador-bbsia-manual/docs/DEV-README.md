# DEV-README — Fluxo de Envio (GFGF0010) e Correlação de Retornos (BB SIA + FGO)

> Guia prático de implementação: do evento de início até a atualização do status da operação com base nos retornos do FGO.
> Preencher os blocos marcados com `// TODO: preencher retorno real` conforme os testes forem feitos em homologação.

---

## Visão geral do fluxo

```
1. Evento de início
2. Montar arquivo remessa GFGF0010 (persistir Nº sequencial da Remessa)
3. Upload (PUT) -> recebe "protocolo" (transporte)
4. (opcional) Consultar protocolo -> status do transporte
5. Job periódico: listar downloads disponíveis
6. (opcional) Consultar metadados do arquivo de retorno
7. Download do arquivo de retorno
8. Parsear header do retorno -> religar ao Nº sequencial da Remessa
9. Parsear detalhes do retorno -> religar ao Código identificador da operação
10. Atualizar status conforme o tipo de retorno (1º/2º/3º/4º/Informativo)
11. Repetir o job
```

**Chave de correlação (não é a API que resolve isso, é o conteúdo do arquivo):**
- **Nº sequencial da Remessa** (header, posições 32–35) — liga arquivo de retorno → arquivo de remessa enviado.
- **Código identificador da operação de crédito** (detalhe, posições 10–29) — liga registro de retorno → operação específica dentro da remessa.

---

## Passo 0 — Consulta uploads possíveis (executar 1x, ou quando houver dúvida sobre os códigos)

```bash
curl --location "https://hml-api-internal.digio.com.br/bb-sia/gmt-catalogo-api/listaUploads/" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta real (200):**
```json
{
    "remessa": [
        {
            "fta": 31957,
            "nome": "Fluxo de teste de upload/download via BB SIA",
            "evento": 1
        },
        {
            "fta": 31916,
            "nome": "Contrato 59010 - GFG010 - EVENTOS DO AGENTE FINANCEIRO - Rem.",
            "evento": 1
        }
    ]
}
```

Guardar o par `fta`/`evento` do GFGF0010 (no card em uso: `fta=31916`, `evento=1`). O `fta=31957` ("Fluxo de teste de upload/download via BB SIA") é o fluxo de testes habilitado via BB SIA WEB (Configurações → Transmissão de teste) — não usar em produção, apenas para validar o mecanismo de upload/download ponta a ponta.

---

## Passo 1 — Montar o arquivo remessa (GFGF0010)

Sem chamada de API — geração do arquivo posicional (header + detalhes 03/04/05 + trailer), conforme leiaute da seção 13.1 do `FGO_MANUAL.txt`.

**Antes de enviar, persistir na base própria:**

| Campo | Origem | Uso |
|---|---|---|
| Nº sequencial da Remessa | Header, posições 32–35 | Chave de correlação com os retornos |
| Nome do arquivo | — | Rastreabilidade |
| Códigos identificadores das operações incluídas | Cada detalhe 03/04/05, posições 10–29 | Religar registros dos retornos |
| Data/hora de geração | — | Auditoria |

---

## Passo 2 — Upload do arquivo remessa

```bash
curl --location --request PUT 'http://localhost:9003/gmt-sia-api/upload/31916/1/GFGF0010_teste_erro.txt' \
--header 'Content-MD5: 2a2e8dc30b970b525ca638794b78d225' \
--header 'Content-Range: 2130' \
--header 'Content-Type: application/octet-stream' \
--header 'Accept: application/json' \
--header 'Authorization: Bearer {{access_token}}' \
--data-binary '@/C:/Users/07.912652/Downloads/GFGF0010_teste_erro.txt'
```

**Resposta real (201):**
```json
{
  "protocolo": 1234567890123456
}
```

**Persistir na base, associado ao Nº sequencial da Remessa do Passo 1:**

| protocolo (BB SIA) | nº sequencial remessa | nome arquivo | dt envio | estado |
|---|---|---|---|---|
| 1234567890123456 | 0042 | GFGF0010_teste_erro.txt | 2026-07-08T17:45:34 | aguardando retorno |

---

## Passo 3 — (Opcional) Consultar status do transporte do envio

### 3a. Consultando por protocolo específico

```bash
curl --location 'http://localhost:9003/gmt-protocolo-api/listaProtocolos' \
--header 'Content-Type: application/json' \
--header 'Authorization: ••••••' \
--data '{
    "metadata": {
        "pagina": 1,
        "porPagina": "20"
    },
    "protocolo": [
        "2026070100005940"
    ]
}'
```

**Resposta real (200):**
```json
{
    "metadata": {
        "paginaAtual": 1,
        "paginaTotal": 1,
        "resultadosPaginaAtual": 1,
        "resultadoTotal": 1,
        "colunaOrdenacao": "protocolo",
        "ordenacao": "desc"
    },
    "resultados": [
        {
            "protocolo": 2026070100005940,
            "dtCriacao": "2026-07-01T23:07:04.104-03:00",
            "codEstadoProtocolo": 5,
            "codFta": 31917,
            "vrsFta": 1,
            "nomeFta": "Contrato 59010 - GFG200 - EVENTOS DO AGENTE FINANCEIRO - Ret.",
            "convenio": {
                "formato": "GFG200",
                "contrato": 59010,
                "produto": 222
            },
            "codOrientacao": 2,
            "eventos": [
                {
                    "codTipoEvento": 1,
                    "rc": 0,
                    "evtFta": 1,
                    "etapaFta": 1,
                    "dtExecucao": "2026-07-01T23:07:07.051-03:00",
                    "qtdByte": 424,
                    "nrExecucao": 1,
                    "nomeArquivo": "GFG200.C59010.2026070100005940.230703.RET",
                    "textoProtocolo": "Arquivo retorno do contrato 59010, formato GFG200, disponibilizado com sucesso no BB SIA, com o nome: GFG200.C59010.2026070100005940.230703.RET",
                    "codTipoTrigger": 14,
                    "arquivoSia": {
                        "codArquivo": 3120357,
                        "nomeArquivo": "GFG200.C59010.2026070100005940.230703.RET",
                        "bytes": 424,
                        "dataCriacao": "2026-07-02T02:07:06.000-03:00",
                        "nomeUsuarioCriador": "b2busr",
                        "hashMd5": "4922f7d6a626f4c1e519ebe25834df65"
                    }
                }
            ]
        }
    ]
}
```

> **Atenção:** este resultado é um exemplo de um protocolo de **retorno** (`codOrientacao: 2`, FTA 31917/GFG200), usado aqui só para ilustrar o formato de resposta do serviço. Ao consultar o protocolo do **envio** (retornado no Passo 2), o resultado deve trazer `codOrientacao: 1` e `codFta: 31916`.

### 3b. Consultando sem filtro de protocolo (lista geral, paginada)

```bash
curl --location 'http://localhost:9003/gmt-protocolo-api/listaProtocolos' \
--header 'Content-Type: application/json' \
--header 'Authorization: ••••••' \
--data '{
    "metadata": {
        "pagina": 1,
        "porPagina": "20"
    }
}'
```

**Resposta real (200) — trecho (52 resultados totais, exibindo os 2 primeiros):**
```json
{
    "metadata": {
        "paginaAtual": 1,
        "paginaTotal": 3,
        "resultadosPaginaAtual": 20,
        "resultadoTotal": 52,
        "colunaOrdenacao": "protocolo",
        "ordenacao": "desc"
    },
    "resultados": [
        {
            "protocolo": 2026070900004996,
            "dtCriacao": "2026-07-09T23:06:44.308-03:00",
            "codEstadoProtocolo": 5,
            "codFta": 31917,
            "vrsFta": 1,
            "nomeFta": "Contrato 59010 - GFG200 - EVENTOS DO AGENTE FINANCEIRO - Ret.",
            "convenio": { "formato": "GFG200", "contrato": 59010, "produto": 222 },
            "codOrientacao": 2,
            "eventos": [
                {
                    "codTipoEvento": 1,
                    "rc": 0,
                    "evtFta": 1,
                    "etapaFta": 1,
                    "dtExecucao": "2026-07-09T23:06:47.937-03:00",
                    "qtdByte": 636,
                    "nrExecucao": 1,
                    "nomeArquivo": "GFG200.C59010.2026070900004996.230643.RET",
                    "textoProtocolo": "Arquivo retorno do contrato 59010, formato GFG200, disponibilizado com sucesso no BB SIA, com o nome: GFG200.C59010.2026070900004996.230643.RET",
                    "codTipoTrigger": 14,
                    "arquivoSia": {
                        "codArquivo": 3129571,
                        "nomeArquivo": "GFG200.C59010.2026070900004996.230643.RET",
                        "bytes": 636,
                        "dataCriacao": "2026-07-10T02:06:47.000-03:00",
                        "nomeUsuarioCriador": "b2busr",
                        "hashMd5": "b8dfca29a548f6480d6b849e85725743"
                    }
                }
            ]
        },
        {
            "protocolo": 2026070800005046,
            "dtCriacao": "2026-07-08T17:45:34.913-03:00",
            "codEstadoProtocolo": 5,
            "codFta": 31916,
            "vrsFta": 1,
            "nomeFta": "Contrato 59010 - GFG010 - EVENTOS DO AGENTE FINANCEIRO - Rem.",
            "convenio": { "formato": "GFG010", "contrato": 59010, "produto": 222 },
            "codOrientacao": 1,
            "eventos": [
                {
                    "codTipoEvento": 1,
                    "rc": 0,
                    "evtFta": 1,
                    "etapaFta": 1,
                    "dtExecucao": "2026-07-08T17:45:34.917-03:00",
                    "qtdByte": 2130,
                    "nrExecucao": 1,
                    "nomeArquivo": "GFGF0010_v4.txt",
                    "textoProtocolo": "Arquivo GFGF0010_v4.txt entregue com sucesso ao Banco do Brasil",
                    "codTipoTrigger": 2,
                    "arquivoSia": {
                        "codArquivo": 3127690,
                        "nomeArquivo": "GFGF0010_v4.txt",
                        "bytes": 2130,
                        "dataCriacao": "2026-07-08T20:45:34.000-03:00",
                        "nomeUsuarioCriador": "BB_DIGIOHM_703012245",
                        "hashMd5": "69A570353C101E80BC4699B26A5407F6"
                    }
                },
                {
                    "codTipoEvento": 2,
                    "rc": 0,
                    "evtFta": 2,
                    "etapaFta": 2,
                    "dtExecucao": "2026-07-08T17:45:37.022-03:00",
                    "qtdByte": 2130,
                    "nrExecucao": 1,
                    "nomeArquivo": null,
                    "textoProtocolo": "Arquivo validado com sucesso.",
                    "codTipoTrigger": 4,
                    "arquivoSia": null
                },
                {
                    "codTipoEvento": 1,
                    "rc": 0,
                    "evtFta": 3,
                    "etapaFta": 3,
                    "dtExecucao": "2026-07-08T17:45:38.058-03:00",
                    "qtdByte": 0,
                    "nrExecucao": 1,
                    "nomeArquivo": null,
                    "textoProtocolo": "Arquivo GFGF0010_v4.txt encaminhado para processamento com sucesso",
                    "codTipoTrigger": 4,
                    "arquivoSia": null
                }
            ]
        }
    ]
}
```

> Este exemplo (`codFta: 31916`, `codOrientacao: 1`) é o formato real de um **protocolo de envio**. Verificar `codEstadoProtocolo` (`5`/`6` = sucesso no transporte; `4`/`7` = erro — reenviar).

---

## Passo 4 — Job periódico: listar downloads disponíveis (arquivos de retorno)

```bash
curl --location "https://hml-api-internal.digio.com.br/bb-sia/gmt-sia-api/listaDownloads" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta real (200)** — trecho (25 arquivos disponíveis no momento da consulta, todos `codFta: 31917` / retorno GFG200):
```json
{
    "repositorio": "703012245",
    "subrepositorio": "retorno",
    "arquivos": [
        {
            "id": 3124909,
            "nome": "GFG200.C59010.2026070700003395.171625.RET",
            "bytes": 424,
            "dataCriacao": "2026-07-07T17:16:27.192-03:00",
            "usuarioCriador": "b2busr",
            "md5": "27020cf0e6261f66b1fe6e1d627b197e",
            "validade": null,
            "qtdDownloads": 2,
            "maxQtdDownloads": 3,
            "codFta": 31917,
            "vrsFta": 1,
            "codEvt": 1
        },
        {
            "id": 3131394,
            "nome": "GFG200.C59010.2026071000006985.230816.RET",
            "bytes": 636,
            "dataCriacao": "2026-07-10T23:08:19.856-03:00",
            "usuarioCriador": "b2busr",
            "md5": "4b3d786e693064fd0ea2c7b3469e1fd6",
            "validade": null,
            "qtdDownloads": 0,
            "maxQtdDownloads": 3,
            "codFta": 31917,
            "vrsFta": 1,
            "codEvt": 1
        },
        {
            "id": 3124402,
            "nome": "GFG200.C59010.2026070700002854.150156.RET",
            "bytes": 424,
            "dataCriacao": "2026-07-07T15:01:58.262-03:00",
            "usuarioCriador": "b2busr",
            "md5": "20c1115ac4c82f56ce71377cbbceecbf",
            "validade": null,
            "qtdDownloads": 3,
            "maxQtdDownloads": 3,
            "codFta": 31917,
            "vrsFta": 1,
            "codEvt": 1
        }
    ]
}
```

> **(demais 22 arquivos omitidos aqui por brevidade — mesmo formato, todos `codFta: 31917`, `codEvt: 1`)**

**Observações importantes tiradas do retorno real (divergem do exemplo genérico do manual):**
- `validade` veio **`null`** em todos os itens deste ambiente (o manual descreve um `validade` com data — pode não estar habilitado nesse repositório/ambiente, ou o campo só é preenchido perto do vencimento dos 6 dias; **confirmar com o suporte técnico** antes de assumir que os arquivos nunca expiram).
- `maxQtdDownloads` é **3** neste convênio (não 5 como no exemplo genérico do manual) — cada arquivo pode ser baixado no máximo 3 vezes antes de não poder mais ser recuperado por este canal.
- `qtdDownloads` já em `2`/`3` indica arquivos que a aplicação (ou outro canal) já baixou antes — ao decidir o que processar, usar o `id` como chave de idempotência (evitar reprocessar o mesmo arquivo).
- O nome do arquivo (`GFG200.C{contrato}.{protocolo do retorno}.{HHMMSS}.RET`) traz o **protocolo do próprio retorno**, não o protocolo do envio original — reforça que a correlação com a remessa é feita pelo conteúdo (Passo 7), não pelo nome do arquivo.

**Erro possível: 404 — nenhum arquivo disponível no momento.**
```json
// TODO: preencher retorno real (sem conteúdo, apenas HTTP 404)
```

Filtrar pelos `codFta` que representam os retornos do FGO (1º/2º/3º/4º Retorno + Informativo Diário). No card em uso já se confirmou `codFta=31917` para o retorno GFG200 — mapear os demais (`GFGF010R`, `GFGF290R`, `GFGF450R`, `GFGF270R`) junto ao suporte técnico/convênio, caso ainda não estejam documentados.

---

## Passo 5 — (Opcional) Consultar metadados do arquivo antes de baixar

```bash
curl -I --location "https://hml-api-internal.digio.com.br/bb-sia/gmt-sia-api/download/3124909/GFG200.C59010.2026070700003395.171625.RET" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta real: HTTP 200 com corpo vazio.**

Neste ambiente o serviço não retornou os headers `Content-Length`/`Content-MD5` documentados no manual — apenas o status `200 OK` sem corpo. Na prática, isso significa que o Passo 5 serve **só como checagem de existência/permissão** (o arquivo existe e você está autorizado a baixá-lo) — a validação de tamanho/MD5 real precisa ser feita depois do download (Passo 6), comparando com o `bytes`/`md5` já recebidos no `listaDownloads` (Passo 4).

---

## Passo 6 — Download do arquivo de retorno

```bash
curl --location "https://hml-api-internal.digio.com.br/bb-sia/gmt-sia-api/download/3124909/GFG200.C59010.2026070700003395.171625.RET" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --output "retorno_recebido.txt"
```

**Resposta real (200):** `Content-Type: application/octet-stream` — corpo é o **conteúdo bruto do arquivo posicional de retorno** (texto ASCII de largura fixa, sem separadores, conforme leiaute da seção 13 do `FGO_MANUAL.txt`), pronto para ser parseado pelos Passos 7 e 8.

Validar o tamanho/MD5 do conteúdo baixado contra o `bytes`/`md5` já obtidos no Passo 4 (`listaDownloads`), já que o `HEAD` (Passo 5) não devolve esses headers neste ambiente.

> Arquivo já baixado (por qualquer canal) não é listado novamente pelo `listaDownloads`.

---

## Passo 7 — Parsear o header do retorno e religar ao envio

Sem chamada de API — leitura posicional do arquivo baixado no Passo 6.

```
INÍCIO FIM TAMANHO TIPO DESCRIÇÃO
1     7   7       N    Nº sequencial do registro
8     9   2       N    Código do tipo do registro "01"
10    17  8       A    Nome do Arquivo Retorno (ex: "GFGF200R")
18    25  8       D    Versão do leiaute
26    28  3       N    Código do Agente Financeiro
29    31  3       N    Código do Fundo Garantidor "010"
32    35  4       N    Nº sequencial da Remessa à qual se refere este Retorno  <-- CHAVE
```

Buscar na base própria o registro salvo no Passo 2 cujo Nº sequencial da Remessa seja igual ao lido aqui.

Se o retorno for `GFGF010R` (1º Retorno), checar também a posição 50–53 (Nº sequencial da Remessa substituída).

---

## Passo 8 — Parsear os detalhes e religar por operação

Sem chamada de API — para cada registro-detalhe, extrair posições 10–29 (Código identificador da operação de crédito) e cruzar com o mesmo código salvo no Passo 1.

---

## Passo 9 — Atualizar status conforme o tipo de retorno

| Retorno | Nome arquivo | O que atualizar |
|---|---|---|
| 1º Retorno | `GFGF010R` | Aprovação/rejeição da remessa inteira (código de rejeição, posições 209–211 do header). Se aprovado → incrementar Nº sequencial da próxima remessa. |
| 2º Retorno | `GFGF200R` | Aceite/rejeição de cada registro-detalhe (código de rejeição por registro). |
| 3º Retorno | `GFGF290R` | Eventos do Administrador por operação: pendente (92), encerrada (93), impugnada (94), liquidação saldo honrado (95). |
| 4º Retorno | `GFGF450R` | Movimentação financeira por operação (valor nominal, atualização monetária, ISSQN, valor líquido). |
| Informativo Diário | `GFGF270R` | Situação geral do Fundo/Agente — não se religa a uma remessa específica. |

---

## Passo 10 — Repetir o ciclo

Agendar os Passos 4–9 como job recorrente:
- **1º Retorno:** de hora em hora, das 07h às 22h, em dias úteis.
- **2º/3º/4º Retorno + Informativo Diário:** a partir de ~23h, em dias úteis (processamento noturno).

Respeitar o limite de **60 downloads/hora** do BB SIA.

---

## Resumo das chamadas de API

| Etapa | Serviço | Método | URL | Exemplo de retorno neste doc |
|---|---|---|---|---|
| 0 | Consulta uploads possíveis | `GET` | `/gmt-catalogo-api/listaUploads/` | ✅ real |
| 2 | Upload da remessa | `PUT` | `/gmt-sia-api/upload/{fta}/{evento}/{nome}` | ✅ real |
| 3 | Consulta de protocolos | `POST` | `/gmt-protocolo-api/listaProtocolos` | ✅ real |
| 4 | Consulta downloads disponíveis | `GET` | `/gmt-sia-api/listaDownloads` | ✅ real |
| 5 | Consulta metadados do arquivo | `HEAD` | `/gmt-sia-api/download/{id}/{nome}` | ✅ real |
| 6 | Download do retorno | `GET` | `/gmt-sia-api/download/{id}/{nome}` | ✅ real |

## Anexo — Retorno GFGF450R (4º Retorno, Movimentação Financeira, manual §13.5)

Código em `src/retorno450r/`:

- `tipos-450r.ts` — constantes do leiaute, tabelas §14.16 (tipo de movimentação) e §14.17 (natureza) e as interfaces `Header450R`, `Movimentacao450R`, `Trailer450R`, `Retorno450R`.
- `gerador-450r.ts` — montadores posicionais (`montarHeader450R`, `montarMovimentacao450R`, `montarTrailer450R`) e `gerarArquivoRetorno450RFake()` para produzir um arquivo fictício reproduzível (semente).
- `leitor-450r.ts` — classe `LeitorRetorno450R` (`lerArquivo` / `lerConteudo`): valida 211 colunas, sequência, header/trailer e converte campos (M → reais, D → `AAAA-MM-DD` ou `null` para `00000000`), enriquecendo cada 97 com descrição/natureza e totalizando por natureza e por tipo.
- `cli-450r.ts` — linha de comando.

```powershell
npm run 450r:gerar-fake                       # grava saida/GFGF450R.txt (10 movimentações)
npx tsx src/retorno450r/cli-450r.ts gerar-fake --quantidade 25 --numero-remessa 12 --cnpj 12345678000199
npm run 450r:ler                              # resumo legível de saida/GFGF450R.txt
npx tsx src/retorno450r/cli-450r.ts ler --arquivo <arquivo> --json        # estrutura completa em JSON
npx tsx src/retorno450r/cli-450r.ts ler --arquivo <arquivo> --tolerante   # não interrompe em erro de leiaute
```

Uso programático:

```ts
import { LeitorRetorno450R } from './retorno450r/leitor-450r.js';

const { retorno, avisos } = LeitorRetorno450R.lerArquivo('saida/GFGF450R.txt');
for (const m of retorno.movimentacoes) {
  // m.codigoOperacaoAgente = idAcordo enviado na Remessa (pos 10-29)
  // m.noSequencialRegistroCausador = nº sequencial do registro da Remessa que gerou a movimentação
}
```

Observação: o manual declara a quantidade de registros do trailer (pos 10-16) como tipo `A`, mas o conteúdo é numérico; o leitor trata como número.
