# BB SIA Rest — Envio de Documentos e Consulta de Retornos

> Documento de referência para a **aplicação interna**, contendo apenas os serviços do BB SIA Rest necessários para **(1) enviar arquivos/documentos** e **(2) consultar os retornos** (status do protocolo e arquivos de retorno disponibilizados pelo BB). O acesso ao BB SIA é feito através do **proxy Axway** (ver documento "BB_SIA_Conexao_Proxy_Axway.md"), que cuida da autenticação/conexão direta com o Banco do Brasil.

---

## Pré-condição

A aplicação consome o token de acesso (`access_token`) já obtido/gerenciado pelo proxy e o envia em todas as chamadas via header:

```
Authorization: Bearer {token}
```

Os exemplos abaixo usam `$ACCESS_TOKEN` e a URL base `$BASE_URL` (apontando para o BB SIA — homologação `https://gmtedi.hm.bb.com.br` ou produção `https://gmtedi.bb.com.br` — ou para o proxy Axway, conforme a interface exposta).

---

## Fluxo resumido

```
1. Consultar uploads possíveis  -> obter (fta, evento) do tipo de documento
2. (Opcional) Pré-upload         -> validar/retomar envio
3. Upload do arquivo (PUT)       -> obter "protocolo"
4. Consultar protocolos          -> acompanhar status do envio
5. Consultar downloads disponíveis -> identificar arquivos de retorno do BB
6. Consultar metadados (opcional)  -> validar tamanho/MD5 antes de baixar
7. Download do arquivo de retorno
```

---

## 1. Consulta de uploads possíveis

Identifica os tipos de arquivo (`fta`/`evento`) que a aplicação está autorizada a enviar. Deve ser consultado uma vez (e sempre que houver dúvida sobre os códigos a usar).

| | |
|---|---|
| **URL** | `/gmt-catalogo-api/listaUploads/` |
| **Método** | `GET` |
| **Header** | `Authorization: Bearer {token}` |

```bash
curl -X GET "$BASE_URL/gmt-catalogo-api/listaUploads/" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta (200):**

```json
{
  "remessa": [
    { "fta": 123, "nome": "Remessa CNAB 240", "evento": 1 }
  ]
}
```

> Guardar os pares `fta`/`evento` correspondentes a cada tipo de documento enviado pela aplicação (configuração estática, raramente muda).

**Erros:** `401` (token não reconhecido), `403` (sem permissão — detalhe em `x-gmt-erro`).

---

## 2. (Opcional) Pré-upload — validar/retomar envio

Recomendado antes de envios grandes ou quando há risco de falha de rede (permite retomar um upload interrompido).

| | |
|---|---|
| **URL** | `/gmt-sia-api/upload/{fta}/{evento}/{nome do arquivo}` |
| **Método** | `HEAD` |
| **Headers** | `Authorization`, `Content-MD5`, `x-gmt-content-length` |

```bash
ARQUIVO="remessa_20260612.txt"
MD5=$(openssl md5 -binary "$ARQUIVO" | base64)
TAMANHO=$(stat -c%s "$ARQUIVO")

curl -I -X HEAD "$BASE_URL/gmt-sia-api/upload/123/1/$ARQUIVO" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-MD5: $MD5" \
  -H "x-gmt-content-length: $TAMANHO"
```

| HTTP | Significado |
|---|---|
| 204 | Apto para envio, sem conteúdo parcial — pode seguir para o upload completo |
| 206 | Há conteúdo parcial; header `Content-Length` indica quantos bytes já foram recebidos (retomar a partir do byte seguinte) |
| 401 | Token não reconhecido |
| 403 | Não autorizado (motivo em `x-gmt-erro`) |

---

## 3. Upload do documento

Envio efetivo do arquivo. Gera um **número de protocolo** para acompanhamento.

| | |
|---|---|
| **URL** | `/gmt-sia-api/upload/{fta}/{evento}/{nome do arquivo}` |
| **Método** | `PUT` |
| **Content-Type** | `application/octet-stream` |
| **Headers obrigatórios** | `Authorization`, `Content-MD5`, `Content-Length` |
| **Header opcional** | `Content-Range` (apenas para retomar upload — ver seção 2) |

> `Chunked Encoding` não é aceito — `Content-Length` deve ser o tamanho real enviado.

### Upload completo

```bash
ARQUIVO="remessa_20260612.txt"
MD5=$(openssl md5 -binary "$ARQUIVO" | base64)
TAMANHO=$(stat -c%s "$ARQUIVO")

curl -X PUT "$BASE_URL/gmt-sia-api/upload/123/1/$ARQUIVO" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-MD5: $MD5" \
  -H "Content-Length: $TAMANHO" \
  --data-binary "@$ARQUIVO"
```

**Resposta (201):**

```json
{ "protocolo": 1234567890123456 }
```

> **Persistir o `protocolo`** retornado — é a chave para consultar o status do envio (seção 4).

### Retomada de upload (após HTTP 206 no pré-upload)

```bash
curl -X PUT "$BASE_URL/gmt-sia-api/upload/123/1/$ARQUIVO" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-MD5: $MD5" \
  -H "Content-Length: 500" \
  -H "Content-Range: bytes 734-1233/1234" \
  --data-binary "@arquivo_restante.bin"
```

### Erros possíveis

| HTTP | Significado |
|---|---|
| 201 | Sucesso — retorna `protocolo` |
| 400 | Campo preenchido incorretamente (`codigo`/`mensagem`) |
| 401 | Token não reconhecido |
| 403 | Cliente não autorizado a enviar este arquivo |

---

## 4. Consulta de protocolos — verificar status do envio

Permite acompanhar o ciclo de vida do(s) protocolo(s) gerado(s) (envios e recebimentos), nos últimos **60 dias**.

| | |
|---|---|
| **URL** | `/gmt-protocolo-api/listaProtocolos` |
| **Método** | `POST` |
| **Content-Type** | `application/json` |
| **Header** | `Authorization: Bearer {token}` |

Todos os campos do corpo são opcionais.

```bash
curl -X POST "$BASE_URL/gmt-protocolo-api/listaProtocolos" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": { "pagina": 1, "porPagina": 20 },
    "Protocolo": [1234567890123456]
  }'
```

**Resposta (200)** — trecho relevante:

```json
{
  "metadata": {
    "paginaAtual": 1,
    "paginaTotal": 1,
    "resultadosPagina": 1,
    "resultadosTotal": 1
  },
  "resultados": [
    {
      "protocolo": 1234567890123456,
      "dtCriacao": "2026-06-12T10:00:00Z",
      "codEstadoProtocolo": 6,
      "codFta": 123,
      "vrsFta": 1,
      "nomeFta": "Remessa CNAB 240",
      "codOrientacao": 1,
      "eventos": [
        {
          "codTipoEvento": 1,
          "rc": 0,
          "dtExecucao": "2026-06-12T10:00:05Z",
          "nomeArquivo": "remessa_20260612.txt",
          "textoProtocolo": "Arquivo processado com sucesso"
        }
      ]
    }
  ]
}
```

### Tabela de estados (`codEstadoProtocolo`)

| Código | Estado | Ação sugerida |
|---|---|---|
| 1 | Criado | Aguardar |
| 2, 3 | Em andamento | Aguardar / consultar novamente depois |
| 4 | Parado com erro | Alertar / investigar (`textoProtocolo` traz detalhe) |
| 5, 6 | Encerrado com sucesso | Finalizado — pode liberar para próxima etapa |
| 7 | Encerrado sem sucesso | Alertar / reenviar se aplicável |

> `codOrientacao`: `1` = envio do cliente para o BB (nosso upload); `2` = envio do BB para o cliente (arquivo de retorno disponível para download — ver seção 5).

**Erros:** `401` (token inválido), `403` (sem autorização para o BB SIA Rest).

---

## 5. Consulta de downloads disponíveis — identificar retornos do BB

Lista arquivos que o BB disponibilizou para a aplicação (ex.: arquivos de retorno referentes aos documentos enviados).

| | |
|---|---|
| **URL** | `/gmt-sia-api/listaDownloads` |
| **Método** | `GET` |
| **Header** | `Authorization: Bearer {token}` |

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
      "nome": "retorno_20260612.txt",
      "bytes": 4096,
      "dataCriacao": "2026-06-12T10:00:00Z",
      "usuarioCriador": "BB",
      "md5": "d41d8cd98f00b204e9800998ecf8427e",
      "validade": "2026-06-18T10:00:00Z",
      "qtdDownloads": 0,
      "maxQtdDownloads": 5,
      "codFta": 123,
      "vrsFta": 1,
      "codEvt": 2
    }
  ]
}
```

> Cada arquivo listado fica disponível por até **6 dias** (`validade`). Um arquivo já baixado anteriormente (por qualquer canal) não aparece novamente.

**Erros:** `401` (token inválido), `403` (sem autorização para usar o BB SIA Rest), `404` (nenhum arquivo no repositório).

---

## 6. (Opcional) Consulta de metadados — validar antes de baixar

| | |
|---|---|
| **URL** | `/gmt-sia-api/download/{id do arquivo}/{nome do arquivo}` |
| **Método** | `HEAD` |
| **Header** | `Authorization: Bearer {token}` |

```bash
curl -I -X HEAD "$BASE_URL/gmt-sia-api/download/9876543/retorno_20260612.txt" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta (200):** headers `Content-Length` (tamanho) e `Content-MD5` (hash) — úteis para validar a integridade após o download.

**Erros:** `401` (token inválido — em `x-gmt-erro`), `403` (download não autorizado — em `x-gmt-erro`), `404` (arquivo não encontrado).

---

## 7. Download do arquivo de retorno

| | |
|---|---|
| **URL** | `/gmt-sia-api/download/{id do arquivo}/{nome do arquivo}` |
| **Método** | `GET` |
| **Header** | `Authorization: Bearer {token}` |
| **Content-Type (saída)** | `application/octet-stream` |

```bash
curl -X GET "$BASE_URL/gmt-sia-api/download/9876543/retorno_20260612.txt" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o "retorno_20260612.txt"
```

> Após o download, validar o arquivo recebido contra o `Content-MD5` obtido na seção 6 (se consultado) ou contra o campo `md5` retornado na seção 5.

**Erros:**

| HTTP | Significado |
|---|---|
| 401 | Token não reconhecido |
| 403 | Não autorizado / limite de downloads atingido / fora da janela de horário permitida (`codigo`/`mensagem`) |
| 404 | Arquivo não localizado |

---

## 8. Limites a respeitar

| Operação | Limite |
|---|---|
| Uploads (seção 3) | 60/hora |
| Downloads (seções 6 e 7) | 60/hora |

---

## 9. Resumo dos serviços usados neste documento

| Etapa | Serviço | Método | URL |
|---|---|---|---|
| Identificar tipo de documento | Consulta uploads possíveis | `GET` | `/gmt-catalogo-api/listaUploads/` |
| (Opcional) validar/retomar envio | Pré-upload | `HEAD` | `/gmt-sia-api/upload/{fta}/{evento}/{nome}` |
| Enviar documento | Upload | `PUT` | `/gmt-sia-api/upload/{fta}/{evento}/{nome}` |
| Checar status do envio | Consulta de protocolos | `POST` | `/gmt-protocolo-api/listaProtocolos` |
| Identificar retornos do BB | Consulta downloads disponíveis | `GET` | `/gmt-sia-api/listaDownloads` |
| (Opcional) validar retorno | Consulta de metadados | `HEAD` | `/gmt-sia-api/download/{id}/{nome}` |
| Baixar retorno | Download | `GET` | `/gmt-sia-api/download/{id}/{nome}` |
