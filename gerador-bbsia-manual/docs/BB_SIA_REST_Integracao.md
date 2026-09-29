# Guia de Integração — BB SIA Rest (Webservices)

> Documento de referência rápida, baseado no manual **"Sistema de Integração via Arquivos do Banco do Brasil — BB SIA"** (versão 2025001, dez/2025), focado exclusivamente na integração via **API REST (BB SIA Rest - Webservices)**.

---

## 1. Visão geral

O **BB SIA Rest** é a interface REST/HTTPS (JSON) do Banco do Brasil para troca de arquivos entre sistemas do cliente e sistemas do BB. Funciona com os princípios:

- Autenticação via **OAuth2** (token + refresh token);
- Cada arquivo trocado gera um **número de protocolo** (16 dígitos) para rastreamento do ciclo de vida;
- Datas/horas seguem o padrão **RFC 3339** (ex.: `2018-11-12T15:46:49.844Z`);
- Arquivos disponibilizados para download ficam acessíveis por até **6 dias**.

### Limite operacional (vigente desde 08/12/2025)

Aplicado a todos os canais (Web, Client e Webservices), por usuário/hora:

| Operação | Limite |
|---|---|
| Uploads de arquivos | 60/hora |
| Downloads de arquivos | 60/hora |

---

## 2. Pré-requisitos

1. **Convênio/cadastro junto ao BB**: acionar o suporte técnico/agência de relacionamento para habilitar o uso do BB SIA e obter:
   - Usuário e senha (ou certificado digital) de acesso;
   - Identificação dos tipos de arquivo (`fta`/`evento`) autorizados para upload e download.
2. **Ambientes disponíveis**:
   - Homologação: `https://gmtedi.hm.bb.com.br`
   - Produção: `https://gmtedi.bb.com.br`
3. **Conectividade**: liberação de saída HTTPS (porta 443) para os hosts acima — e porta **43000** caso use autenticação por certificado digital (mTLS).
4. **Capacidade de calcular hash MD5** dos arquivos (obrigatório em todo upload/validação).
5. Cliente HTTP capaz de enviar `application/x-www-form-urlencoded`, `application/json` e `application/octet-stream`, e de manipular headers customizados (`Content-MD5`, `Content-Range`, `x-gmt-content-length`, etc.).

---

## 3. Endpoints

| Finalidade | Homologação | Produção |
|---|---|---|
| API REST (geral) | `https://gmtedi.hm.bb.com.br` | `https://gmtedi.bb.com.br` |
| Autenticação via **certificado digital** (mTLS) | `https://gmtedi.hm.bb.com.br:43000` | `https://gmtedi.bb.com.br:43000` |

> Os endpoints de mTLS (porta 43000) são usados **somente** para o serviço de autenticação/autorização quando o login é feito via certificado digital (informando o campo `password` em branco).

---

## 4. Fluxo de integração (passo a passo)

```
┌─────────────────────────┐
│ 1. Autenticar            │  POST /gmt-autorizador-api/autoriza
│    -> access_token       │     (usuário/senha ou certificado)
│    -> refresh_token       │
└───────────┬──────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. Consultar uploads      │  GET /gmt-catalogo-api/listaUploads/
│    possíveis (fta/evento) │
└───────────┬──────────────┘
            │
   ┌────────┴────────┐
   ▼                  ▼
ENVIO (upload)     RECEBIMENTO (download)
   │                  │
   ▼                  ▼
3a. Pré-upload     3b. Listar downloads
   (HEAD)             disponíveis (GET)
   │                  │
   ▼                  ▼
4a. Upload (PUT)   4b. Metadados (HEAD)
   │                  │
   ▼                  ▼
5a. Guardar         5b. Download (GET)
   "protocolo"          do arquivo
   │                  │
   └────────┬─────────┘
            ▼
┌─────────────────────────┐
│ 6. Consultar protocolos   │  POST /gmt-protocolo-api/listaProtocolos
│    (acompanhar status)    │
└───────────┬──────────────┘
            │
            ▼
┌─────────────────────────┐
│ 7. Revogar token/refresh  │  POST /gmt-autorizador-api/revogar
│    ao final do uso        │
└─────────────────────────┘
```

Regras importantes do fluxo:

- `access_token`: válido por **30 minutos**, usado em todos os demais webservices via header `Authorization: Bearer {token}`.
- `refresh_token`: válido por **1 dia** (configurável via `validade_refresh_token`, em dias; `0` = indefinido). Usado **apenas** no endpoint de autorização para emitir novo `access_token` sem repetir usuário/senha.
- Quando ambos expirarem, é necessário reautenticar com usuário/senha (ou certificado).
- O BB SIA Client/Web/Rest compartilham o mesmo repositório: um arquivo já baixado por qualquer canal não será baixado novamente.

---

## 5. Serviço: Autenticação e Autorização

| | |
|---|---|
| **URL** | `/gmt-autorizador-api/autoriza` |
| **Método** | `POST` |
| **Content-Type (entrada)** | `application/x-www-form-urlencoded` |
| **Content-Type (saída)** | `application/json` |

### 5.1 Obter token (usuário e senha)

```bash
curl -X POST "https://gmtedi.hm.bb.com.br/gmt-autorizador-api/autoriza" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=SEU_USUARIO" \
  --data-urlencode "password=SUA_SENHA" \
  --data-urlencode "scope=sia:usuario"
```

**Resposta (HTTP 200):**

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 1800,
  "refresh_token": "abc123...",
  "scope": "sia:usuario",
  "data_expiracao": "2026-06-12T16:00:00Z"
}
```

> Armazene `access_token` e `refresh_token`. Não persista usuário/senha após o primeiro login.

### 5.2 Obter token via certificado digital (mTLS)

Use o endpoint de porta **43000** e apresente o certificado cliente, deixando `password` em branco:

```bash
curl -X POST "https://gmtedi.hm.bb.com.br:43000/gmt-autorizador-api/autoriza" \
  --cert cliente.crt --key cliente.key \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=SEU_USUARIO" \
  --data-urlencode "password=" \
  --data-urlencode "scope=sia:usuario"
```

### 5.3 Renovar token via refresh_token

```bash
curl -X POST "https://gmtedi.hm.bb.com.br/gmt-autorizador-api/autoriza" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=SEU_REFRESH_TOKEN" \
  --data-urlencode "validade_refresh_token=0"
```

### Erros possíveis

| HTTP | Significado |
|---|---|
| 400 | Campo informado incorretamente (`error` / `error_description`) |
| 401 | Usuário ou senha incorretos |
| 403 | Usuário sem nenhuma das permissões solicitadas |

---

## 6. Serviço: Revogação de código de acesso

| | |
|---|---|
| **URL** | `/gmt-autorizador-api/revogar` |
| **Método** | `POST` |
| **Content-Type (entrada)** | `application/x-www-form-urlencoded` |

### Revogar access_token

```bash
curl -X POST "https://gmtedi.bb.com.br/gmt-autorizador-api/revogar" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "token=SEU_ACCESS_TOKEN" \
  --data-urlencode "token_type_hint=access_token"
```

### Revogar refresh_token

```bash
curl -X POST "https://gmtedi.bb.com.br/gmt-autorizador-api/revogar" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "token=SEU_REFRESH_TOKEN" \
  --data-urlencode "token_type_hint=refresh_token"
```

**Sucesso:** HTTP 200, sem conteúdo. **Erro:** HTTP 400 (campo incorreto).

---

## 7. Serviço: Consulta de uploads possíveis

Lista os tipos de arquivo (`fta`/`evento`) que o cliente está autorizado a enviar.

| | |
|---|---|
| **URL** | `/gmt-catalogo-api/listaUploads/` |
| **Método** | `GET` |
| **Header obrigatório** | `Authorization: Bearer {token}` |

```bash
curl -X GET "https://gmtedi.bb.com.br/gmt-catalogo-api/listaUploads/" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta (HTTP 200):**

```json
{
  "remessa": [
    { "fta": 123, "nome": "Remessa CNAB 240", "evento": 1 }
  ]
}
```

> Guarde os pares `fta`/`evento` — são usados nos serviços de pré-upload/upload.

**Erros:** `401` (token não reconhecido), `403` (sem permissão — detalhe no header `x-gmt-erro`).

---

## 8. Serviço: Pré-upload (opcional, recomendado)

Valida se o envio está autorizado e se há conteúdo parcial (resumo de upload interrompido).

| | |
|---|---|
| **URL** | `/gmt-sia-api/upload/{fta}/{evento}/{nome do arquivo}` |
| **Método** | `HEAD` |
| **Headers obrigatórios** | `Authorization`, `Content-MD5`, `x-gmt-content-length` |

```bash
ARQUIVO="remessa_20260612.txt"
MD5=$(openssl md5 -binary "$ARQUIVO" | base64)
TAMANHO=$(stat -c%s "$ARQUIVO")  # Linux; no Windows use (Get-Item $ARQUIVO).Length

curl -I -X HEAD "https://gmtedi.bb.com.br/gmt-sia-api/upload/123/1/$ARQUIVO" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-MD5: $MD5" \
  -H "x-gmt-content-length: $TAMANHO"
```

| HTTP | Significado |
|---|---|
| 204 | Apto para envio, sem conteúdo parcial |
| 206 | Apto para envio; header `Content-Length` indica bytes já recebidos (continuar a partir do byte seguinte) |
| 401 | Token não reconhecido |
| 403 | Não autorizado (motivo no header `x-gmt-erro`) |

---

## 9. Serviço: Upload

| | |
|---|---|
| **URL** | `/gmt-sia-api/upload/{fta}/{evento}/{nome do arquivo}` |
| **Método** | `PUT` |
| **Content-Type (entrada)** | `application/octet-stream` |
| **Headers obrigatórios** | `Authorization`, `Content-MD5`, `Content-Length` |
| **Header opcional** | `Content-Range` (apenas para resumo de upload) |

> Não é aceito `Chunked Encoding` — `Content-Length` deve refletir o tamanho real enviado.

### 9.1 Upload completo

```bash
ARQUIVO="remessa_20260612.txt"
MD5=$(openssl md5 -binary "$ARQUIVO" | base64)
TAMANHO=$(stat -c%s "$ARQUIVO")

curl -X PUT "https://gmtedi.bb.com.br/gmt-sia-api/upload/123/1/$ARQUIVO" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-MD5: $MD5" \
  -H "Content-Length: $TAMANHO" \
  --data-binary "@$ARQUIVO"
```

**Resposta (HTTP 201):**

```json
{ "protocolo": 1234567890123456 }
```

### 9.2 Upload em resumo (após HTTP 206 no pré-upload)

Exemplo: arquivo de 1234 bytes, dos quais 734 já foram recebidos — enviar os últimos 500 bytes:

```bash
curl -X PUT "https://gmtedi.bb.com.br/gmt-sia-api/upload/123/1/$ARQUIVO" \
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

## 10. Serviço: Consulta downloads disponíveis

| | |
|---|---|
| **URL** | `/gmt-sia-api/listaDownloads` |
| **Método** | `GET` |
| **Header obrigatório** | `Authorization: Bearer {token}` |

```bash
curl -X GET "https://gmtedi.bb.com.br/gmt-sia-api/listaDownloads" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta (HTTP 200):**

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

**Erros:** `401` (token inválido), `403` (sem autorização para usar o BB SIA Rest), `404` (nenhum arquivo no repositório).

---

## 11. Serviço: Consulta de metadados de arquivo

| | |
|---|---|
| **URL** | `/gmt-sia-api/download/{id do arquivo}/{nome do arquivo}` |
| **Método** | `HEAD` |
| **Header obrigatório** | `Authorization: Bearer {token}` |

```bash
curl -I -X HEAD "https://gmtedi.bb.com.br/gmt-sia-api/download/9876543/retorno_20260612.txt" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Resposta (HTTP 200):** headers `Content-Length` (tamanho total) e `Content-MD5` (hash do arquivo).

**Erros:** `401` (token inválido — motivo em `x-gmt-erro`), `403` (download não autorizado — motivo em `x-gmt-erro`), `404` (arquivo não encontrado).

---

## 12. Serviço: Download

| | |
|---|---|
| **URL** | `/gmt-sia-api/download/{id do arquivo}/{nome do arquivo}` |
| **Método** | `GET` |
| **Header obrigatório** | `Authorization: Bearer {token}` |
| **Content-Type (saída)** | `application/octet-stream` |

```bash
curl -X GET "https://gmtedi.bb.com.br/gmt-sia-api/download/9876543/retorno_20260612.txt" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o "retorno_20260612.txt"
```

> Após o download, valide o arquivo recebido contra o `Content-MD5` obtido na consulta de metadados (seção 11).

**Erros:** `401` (token inválido), `403` (não autorizado / limite de downloads atingido / fora da janela de horário — `codigo`/`mensagem`), `404` (arquivo não localizado).

---

## 13. Serviço: Consulta de protocolos

Permite acompanhar o ciclo de vida de arquivos enviados/recebidos nos últimos **60 dias**.

| | |
|---|---|
| **URL** | `/gmt-protocolo-api/listaProtocolos` |
| **Método** | `POST` |
| **Content-Type (entrada/saída)** | `application/json` |
| **Header obrigatório** | `Authorization: Bearer {token}` |

Todos os campos do corpo são **opcionais** (podem ser informados nenhum, um ou vários).

```bash
curl -X POST "https://gmtedi.bb.com.br/gmt-protocolo-api/listaProtocolos" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": { "pagina": 1, "porPagina": 20 },
    "Protocolo": [1234567890123456],
    "codFta": [123],
    "codEstadoProtocolo": [5, 6],
    "nomeArquivo": "remessa_20260612.txt",
    "dtCriacaoMin": "2026-06-01T00:00:00Z",
    "dtCriacaoMax": "2026-06-12T23:59:59Z"
  }'
```

### Tabela de estados de protocolo (`codEstadoProtocolo`)

| Código | Estado |
|---|---|
| 1 | Criado |
| 2, 3 | Em andamento |
| 4 | Parado com erro |
| 5, 6 | Encerrado com sucesso |
| 7 | Encerrado sem sucesso |

**Resposta (HTTP 200)** — trecho relevante:

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

> `codOrientacao`: `1` = envio do cliente para o BB; `2` = envio do BB para o cliente.

**Erros:** `401` (token inválido), `403` (sem autorização para o BB SIA Rest).

---

## 14. Implantação — checklist sugerido

1. **Cadastro/convênio**: solicitar ao suporte técnico/agência de relacionamento o acesso ao BB SIA (usuário/senha ou certificado) e a habilitação dos tipos de arquivo (`fta`/`evento`) necessários.
2. **Ambiente de homologação primeiro**: testar todo o fluxo em `https://gmtedi.hm.bb.com.br` antes de produção.
3. **Fluxo de teste**: habilitar a "Transmissão de teste" pelo BB SIA WEB (Configurações) para validar upload/download ponta a ponta com arquivos de até 10 KB, sem depender de convênio real.
4. **Implementar módulo de autenticação**:
   - Armazenar `access_token` (TTL 30 min) e `refresh_token` (TTL configurável) de forma segura (cofre de segredos);
   - Implementar renovação automática via `refresh_token` antes da expiração;
   - Revogar tokens ao final do ciclo de uso (boa prática de segurança).
5. **Implementar módulo de upload**:
   - Consultar `listaUploads` para obter `fta`/`evento` válidos;
   - Calcular `Content-MD5` e `Content-Length` antes de cada envio;
   - (Opcional) Executar pré-upload (`HEAD`) para checar resumo de envio interrompido;
   - Tratar resposta `201` e persistir o `protocolo` retornado para rastreio.
6. **Implementar módulo de download**:
   - Consultar `listaDownloads` periodicamente (respeitando o limite de 60/h);
   - Consultar metadados (`HEAD`) para validar tamanho/MD5;
   - Efetuar `GET` do arquivo e validar integridade (MD5);
   - Considerar que arquivos já baixados por qualquer canal (Client/Web/Rest) não retornam novamente.
7. **Implementar monitoramento de protocolos**:
   - Job periódico consultando `listaProtocolos` para identificar arquivos com `codEstadoProtocolo` de erro (4 ou 7) e disparar alertas/retentativas.
8. **Respeitar limites operacionais**: no máximo 60 uploads e 60 downloads por hora — implementar fila/throttling no lado do cliente.
9. **Tratamento de erros**: mapear todos os `codigo`/`mensagem` (ou `x-gmt-erro`) retornados para logs estruturados e alertas operacionais.
10. **Cutover para produção**: repetir o fluxo de homologação contra `https://gmtedi.bb.com.br`, validando credenciais de produção e tipos de arquivo liberados para o convênio real.

---

## 15. Suporte técnico (BB)

- Dias úteis: segunda a sexta, 09:00–18:00 (via agência de relacionamento, que escala para o Suporte Técnico se necessário).
- Demais horários (finais de semana/feriados, emergências):
  - Telefone: (61) 3104-9944
  - E-mails: `ditec.gesec.convenio@bb.com.br`, `ditec.gprom@bb.com.br`
