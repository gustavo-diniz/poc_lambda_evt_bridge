# BB SIA + FGO — Fluxo de Correlação Envio (GFGF0010) x Retornos (GFGF010R/200R/290R/450R/270R)

> Documento de referência para a **aplicação interna**, cobrindo o fluxo completo desde o envio do arquivo remessa (GFGF0010) até a identificação e aplicação dos retornos do FGO (1º ao 4º Retorno + Informativo Diário), via BB SIA Rest.
> Baseado em: `BB_SIA_Envio_Consulta_Documentos.md`, `Sistema_Integracao_via_Arquivos_BB_SIA_BB_v2026002.pdf` e `FGO_MANUAL.txt` (seções 8, 9, 10 e 13).

---

## Por que o protocolo do BB SIA não resolve a correlação sozinho

O `protocolo` retornado pelo `PUT /gmt-sia-api/upload/...` (e listado em `listaProtocolos`) identifica apenas o **transporte** do arquivo — controla se ele chegou, foi processado e teve sucesso/erro no envio (`codEstadoProtocolo`). Ele **não relaciona** o arquivo de envio com os arquivos de retorno: cada retorno (GFGF010R, GFGF200R, GFGF290R, GFGF450R) é uma transmissão própria do BB para o cliente e recebe **seu próprio protocolo**, sem nenhum campo que aponte de volta para o protocolo da remessa original.

A correlação de negócio real está **dentro do conteúdo dos arquivos** (leiaute posicional do FGO):

| Campo | Onde aparece | Posição | Uso |
|---|---|---|---|
| **Nº sequencial da Remessa** | Header de `GFGF0010` (gerado por você) e repetido no header de **todos** os retornos (`GFGF010R`, `GFGF200R`, `GFGF290R`, `GFGF450R`) | 32–35 | Liga **arquivo de retorno → arquivo de remessa** |
| **Nº sequencial da Remessa substituída** | Header de `GFGF010R` | 50–53 | Indica se este retorno refere-se a uma remessa que substituiu outra do mesmo dia (`0000` = não houve substituição) |
| **Código identificador da operação de crédito** | Detalhe de `GFGF0010` (03/04/05) e repetido nos detalhes de `GFGF200R` (03/04/05), `GFGF290R` (92/93/94/95) e `GFGF450R` (97) | 10–29 | Liga **registro de retorno → registro/operação específica da remessa** |

Portanto, a aplicação precisa **persistir o Nº sequencial da Remessa** que ela mesma gerou no header do `GFGF0010`, e usá-lo para casar com o header de cada retorno recebido depois.

---

## Passo a passo completo

### Passo 0 — Pré-requisito único (fazer uma vez, ou sempre que houver dúvida sobre os códigos)

Consultar os tipos de upload autorizados, para confirmar `fta`/`evento` do `GFGF0010`:

```bash
curl -X GET "$BASE_URL/gmt-catalogo-api/listaUploads/" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Guardar o par `fta`/`evento` correspondente ao GFGF0010 (no ambiente do card, `fta=31916`).

---

### Passo 1 — Evento de início: montar o arquivo remessa (GFGF0010)

Gerar o arquivo posicional `GFGF0010` (header + registros-detalhe 03/04/05 + trailer), seguindo o leiaute da seção 13.1 do `FGO_MANUAL.txt`.

**Antes de enviar, capturar e persistir na sua base:**
- **Nº sequencial da Remessa** (posições 32–35 do header) — o número que você mesmo controla e incrementa a cada remessa aprovada (regra da seção 10 do manual: incrementa quando o 1º Retorno confirma aprovação; repete o mesmo número se a remessa anterior foi rejeitada).
- Nome do arquivo, data/hora de geração, lista de "Código identificador da operação" incluídos no arquivo (um por registro-detalhe).

> Esse número sequencial é a **chave primária de correlação** de todo o fluxo — sem ele, os retornos não podem ser religados ao envio.

---

### Passo 2 — Upload do arquivo remessa

```bash
ARQUIVO="GFGF0010"
MD5=$(openssl md5 -binary "$ARQUIVO" | base64)
TAMANHO=$(stat -c%s "$ARQUIVO")

curl -X PUT "$BASE_URL/gmt-sia-api/upload/31916/1/$ARQUIVO" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-MD5: $MD5" \
  -H "Content-Length: $TAMANHO" \
  --data-binary "@$ARQUIVO"
```

**Resposta (201):**
```json
{ "protocolo": 2026070100005940 }
```

**Persistir na sua base**, associado ao Nº sequencial da Remessa do Passo 1:

| protocolo (BB SIA) | nº sequencial remessa | nome arquivo | dt envio | estado |
|---|---|---|---|---|
| 2026070100005940 | 0042 | GFGF0010 | 2026-07-01T23:07 | aguardando retorno |

---

### Passo 3 — (Opcional) Acompanhar o transporte do envio pelo protocolo

Serve só para saber se o arquivo chegou/foi processado no BB SIA (não traz nada de negócio do FGO):

```bash
curl -X POST "$BASE_URL/gmt-protocolo-api/listaProtocolos" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": { "pagina": 1, "porPagina": 20 },
    "Protocolo": [2026070100005940]
  }'
```

Verificar `codEstadoProtocolo`: `5`/`6` = encerrado com sucesso (arquivo chegou ao BB); `4`/`7` = erro no transporte (nesse caso nem haverá retorno de negócio — reenviar).

---

### Passo 4 — Job periódico: buscar arquivos de retorno disponíveis

Rodar em intervalo (respeitando o cronograma do FGO — seção 8 do manual: 1º Retorno de hora em hora das 07h–22h; 2º/3º/4º Retorno e Informativo Diário a partir de ~23h):

```bash
curl -X GET "$BASE_URL/gmt-sia-api/listaDownloads" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta (200):**
```json
{
  "repositorio": "string",
  "subrepositorio": "string",
  "arquivos": [
    {
      "id": 9876543,
      "nome": "GFGF0010.C59010.2026070100005940.230703.RET",
      "bytes": 424,
      "codFta": 31917,
      "codEvt": 1,
      "md5": "...",
      "validade": "2026-07-08T..."
    }
  ]
}
```

Filtrar pelos `codFta` que representam os retornos do FGO (mapear via `listaUploads`/cadastro do convênio — no exemplo do card, `codFta=31917` para o retorno agregado GFG200). Cada tipo de retorno (1º ao 4º + Informativo) tem seu próprio `fta`/evento — confirmar os códigos junto ao suporte técnico/gerência de convênio se ainda não estiverem mapeados.

> **Atenção ao limite de 60 downloads/hora** e à janela de disponibilidade de 6 dias por arquivo.

---

### Passo 5 — (Opcional) Validar metadados antes de baixar

```bash
curl -I -X HEAD "$BASE_URL/gmt-sia-api/download/9876543/GFGF0010.C59010.2026070100005940.230703.RET" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Confere `Content-Length` e `Content-MD5` do arquivo antes de baixar.

---

### Passo 6 — Download do arquivo de retorno

```bash
curl -X GET "$BASE_URL/gmt-sia-api/download/9876543/GFGF0010.C59010.2026070100005940.230703.RET" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o "retorno_recebido.txt"
```

Validar o MD5 do conteúdo baixado contra o obtido no Passo 5 (ou no `md5` do Passo 4).

> Um arquivo já baixado (por qualquer canal — Client/Web/Rest) não é listado novamente pelo `listaDownloads`. Se precisar reprocessar, use o BB SIA WEB (permite re-download).

---

### Passo 7 — Parsear o header do retorno e religar ao envio original

Extrair do header (posições fixas, ver tabela no topo deste documento):

- **Nome do arquivo de retorno** → identifica o tipo (`GFGF010R`, `GFGF200R`, `GFGF290R`, `GFGF450R`, `GFGF270R`).
- **Nº sequencial da Remessa à qual se refere** (posições 32–35) → buscar na sua base o registro salvo no Passo 2 com esse mesmo número.
- Se for `GFGF010R`, checar também **Nº sequencial da Remessa substituída** (posições 50–53).

Isso religa o arquivo de retorno inteiro ao envio (`protocolo` + `Nº sequencial da Remessa`) persistido no Passo 2.

---

### Passo 8 — Parsear os registros-detalhe e religar por operação

Para cada registro-detalhe do retorno, extrair o **Código identificador da operação de crédito** (posições 10–29) e cruzar com o mesmo código enviado na remessa original (Passo 1), atualizando o status daquela operação específica na sua base.

---

### Passo 9 — Atualizar o status conforme o tipo de retorno

| Retorno | O que atualizar |
|---|---|
| **1º Retorno** (`GFGF010R`) | Aprovação/rejeição da remessa inteira na validação inicial (código de rejeição no header, posições 209–211). Se aprovado → incrementar o Nº sequencial da próxima remessa. Se rejeitado → próxima remessa repete o mesmo número. |
| **2º Retorno** (`GFGF200R`) | Aceite/rejeição de cada registro-detalhe (código de rejeição por registro, posições 209–211 de cada detalhe). |
| **3º Retorno** (`GFGF290R`) | Eventos do Administrador por operação: pendente (92), encerrada (93), impugnada (94), liquidação do saldo honrado (95). |
| **4º Retorno** (`GFGF450R`) | Movimentação financeira por operação (valores nominal, atualização monetária, ISSQN, valor líquido). |
| **Informativo Diário** (`GFGF270R`) | Situação patrimonial do Fundo/Agente — não se religa a uma remessa específica, é informativo geral do dia. |

---

### Passo 10 — Repetir o ciclo

Agendar os Passos 4–9 como job recorrente (ex.: a cada 15–30 min durante a janela 23h–00h05, que é quando o processamento noturno do FGO libera 2º/3º/4º Retorno; e de hora em hora das 07h–22h para o 1º Retorno). Sempre respeitar o limite de 60 downloads/hora do BB SIA.

---

## Resumo das chamadas de API usadas no fluxo

| Etapa | Serviço | Método | URL |
|---|---|---|---|
| 0 (uma vez) | Consulta uploads possíveis | `GET` | `/gmt-catalogo-api/listaUploads/` |
| 2 | Upload da remessa | `PUT` | `/gmt-sia-api/upload/{fta}/{evento}/{nome}` |
| 3 (opcional) | Consulta de protocolos (transporte) | `POST` | `/gmt-protocolo-api/listaProtocolos` |
| 4 | Consulta downloads disponíveis | `GET` | `/gmt-sia-api/listaDownloads` |
| 5 (opcional) | Consulta metadados do arquivo | `HEAD` | `/gmt-sia-api/download/{id}/{nome}` |
| 6 | Download do retorno | `GET` | `/gmt-sia-api/download/{id}/{nome}` |

A correlação em si (Passos 7–9) **não é uma chamada de API** — é parsing do leiaute posicional do arquivo baixado, usando o Nº sequencial da Remessa (header) e o Código identificador da operação (detalhe) como chaves.
