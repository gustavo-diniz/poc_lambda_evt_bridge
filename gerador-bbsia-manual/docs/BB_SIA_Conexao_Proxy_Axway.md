# Conexão com o BB SIA — Configuração do Proxy (Axway)

> Documento de referência para a equipe que vai configurar a **plataforma proxy (Axway)** responsável por se conectar diretamente ao **BB SIA Rest - Webservices**. Esta camada concentra a conexão/autenticação com o Banco do Brasil; a aplicação interna não acessa o BB diretamente, e sim através deste proxy.

---

## 1. Objetivo

Configurar no Axway (ou plataforma equivalente) a conexão de saída (outbound) para os endpoints do BB SIA, incluindo:

- Resolução de endpoints (homologação/produção);
- Gestão de credenciais e ciclo de vida do token OAuth2 (`access_token`/`refresh_token`);
- (Se aplicável) configuração de mTLS para autenticação via certificado digital;
- Conectividade de rede (firewall/whitelist).

A aplicação interna, então, consome o proxy (que poderá expor uma interface simplificada/normalizada), e o proxy traduz/encaminha as chamadas para o BB SIA.

---

## 2. Endpoints do BB SIA (destino do proxy)

| Finalidade | Homologação | Produção |
|---|---|---|
| API REST (geral) | `https://gmtedi.hm.bb.com.br` | `https://gmtedi.bb.com.br` |
| Autenticação via **certificado digital** (mTLS) | `https://gmtedi.hm.bb.com.br:43000` | `https://gmtedi.bb.com.br:43000` |

> A porta **43000** é usada **somente** para o serviço de autenticação quando o login é feito via certificado digital (SSL mútuo). Os demais serviços usam sempre a porta 443 padrão dos endpoints gerais.

### Conectividade necessária

- Saída HTTPS (porta 443) liberada para os hosts acima, sempre como **cliente** (outbound).
- Caso use autenticação por certificado: saída adicional na porta **43000**.
- IPs de referência informados pelo BB (homologação: `201.33.144.172`; produção: `170.66.14.85` / `170.66.196.48`) — confirmar atualização junto ao suporte técnico antes de configurar whitelists baseadas em IP fixo.

---

## 3. Credenciais

Solicitar ao suporte técnico/agência de relacionamento do BB:

- Usuário e senha de acesso ao BB SIA (ambiente de homologação e produção, separadamente);
- **OU** certificado digital no formato adequado para mTLS, caso a autenticação seja por certificado;
- Lista de tipos de arquivo (`fta`/`evento`) autorizados para o convênio (necessário para os serviços de upload).

As credenciais devem ser armazenadas em **cofre de segredos** do Axway (vault/keystore), nunca em configuração estática versionada.

---

## 4. Serviço de Autenticação e Autorização (core da conexão)

| | |
|---|---|
| **URL** | `/gmt-autorizador-api/autoriza` |
| **Método** | `POST` |
| **Content-Type (entrada)** | `application/x-www-form-urlencoded` |
| **Content-Type (saída)** | `application/json` |

### 4.1 Login inicial (usuário/senha)

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

### 4.2 Login via certificado digital (mTLS, porta 43000)

```bash
curl -X POST "https://gmtedi.hm.bb.com.br:43000/gmt-autorizador-api/autoriza" \
  --cert cliente.crt --key cliente.key \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=SEU_USUARIO" \
  --data-urlencode "password=" \
  --data-urlencode "scope=sia:usuario"
```

### 4.3 Renovação de token (refresh)

```bash
curl -X POST "https://gmtedi.hm.bb.com.br/gmt-autorizador-api/autoriza" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=SEU_REFRESH_TOKEN" \
  --data-urlencode "validade_refresh_token=0"
```

> `validade_refresh_token=0` define validade indefinida para o refresh token — avaliar se é desejável para o caso de uso (alternativa: renovar periodicamente).

### 4.4 Revogação (boa prática ao desligar/rotacionar credencial)

```bash
curl -X POST "https://gmtedi.bb.com.br/gmt-autorizador-api/revogar" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "token=SEU_TOKEN_OU_REFRESH" \
  --data-urlencode "token_type_hint=access_token"
```
*(usar `refresh_token` em `token_type_hint` para revogar o refresh token)*

---

## 5. Regras de ciclo de vida do token

| Item | Validade | Observação |
|---|---|---|
| `access_token` | 30 minutos | Usado em `Authorization: Bearer {token}` para todos os demais serviços |
| `refresh_token` | 1 dia (padrão) | Configurável via `validade_refresh_token` (em dias; `0` = indefinido). Usado **somente** no endpoint `/autoriza` |

**Recomendações de implementação no proxy:**

1. Implementar **cache de token** com renovação proativa (ex.: renovar quando faltar < 5 min para expirar), evitando autenticações desnecessárias.
2. Se o `access_token` expirar e ainda houver `refresh_token` válido, renovar via `grant_type=refresh_token` (sem novo usuário/senha).
3. Se ambos expirarem, reautenticar do zero com as credenciais armazenadas no cofre.
4. Tratar erros `401`/`403` do BB SIA repassando-os de forma normalizada à aplicação interna (ver seção 6).

---

## 6. Erros do serviço de autenticação

| HTTP | Significado |
|---|---|
| 400 | Campo informado incorretamente (`error` / `error_description`) |
| 401 | Usuário ou senha incorretos |
| 403 | Usuário sem nenhuma das permissões solicitadas |

---

## 7. Limites operacionais a observar no proxy

Aplicados por usuário/hora, em todos os canais (incluindo Rest):

| Operação | Limite |
|---|---|
| Uploads de arquivos | 60/hora |
| Downloads de arquivos | 60/hora |

> O proxy deve implementar **throttling/fila** para não exceder estes limites, retornando erro controlado à aplicação interna quando o limite estiver próximo (em vez de deixar o BB SIA rejeitar a chamada).

---

## 8. Checklist de configuração do proxy

1. [ ] Cadastrar endpoints de homologação e produção como ambientes distintos (não usar o mesmo "ambiente" lógico para ambos).
2. [ ] Configurar conectividade outbound (porta 443 e, se aplicável, 43000) para os hosts do BB SIA.
3. [ ] Armazenar credenciais (usuário/senha ou certificado) em cofre de segredos, por ambiente.
4. [ ] Implementar política de obtenção/renovação automática de `access_token` (cache + refresh).
5. [ ] Implementar revogação de tokens em rotinas de desligamento/rotação de credenciais.
6. [ ] Implementar throttling para respeitar os limites de 60 uploads/60 downloads por hora.
7. [ ] Validar todo o fluxo em **homologação** (incluindo "Transmissão de teste" habilitada via BB SIA Web) antes de liberar produção.
8. [ ] Expor, para a aplicação interna, apenas os serviços necessários (ver documento "BB_SIA_Envio_Consulta_Documentos.md"), sem repassar credenciais brutas do BB.

---

## 9. Suporte técnico (BB)

- Dias úteis: segunda a sexta, 09:00–18:00 (via agência de relacionamento, que escala para o Suporte Técnico se necessário).
- Demais horários (finais de semana/feriados, emergências):
  - Telefone: (61) 3104-9944
  - E-mails: `ditec.gesec.convenio@bb.com.br`, `ditec.gprom@bb.com.br`
