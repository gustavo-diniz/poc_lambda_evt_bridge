-- =============================================================================
-- Schema FGO — Completo
-- Cobre: documentos, histórico de eventos, remessa, retorno
--
-- Ordem de criação (respeita FKs):
--   1. fgo_documents
--   2. fgo_event_history
--   3. fgo_remessa
--   4. fgo_remessa_documents
--   5. fgo_remessa_liberacoes
--   6. fgo_remessa_saldos
--   7. fgo_retorno
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. fgo_documents
-- Foto final do documento FGO — controle da extração CSV e monitoramento.
-- Um CPF pode ter mais de um registro (reprocessamentos).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_documents (
  id                           BIGINT AUTO_INCREMENT PRIMARY KEY,

  -- Campos vindos do CSV da fila
  tipo_produto                 VARCHAR(50)   NOT NULL,  -- ex: CARTAO, EMPRESTIMO
  id_acordo                    BIGINT        NOT NULL,
  ibge_cliente                 VARCHAR(10),
  cpf                          CHAR(11)      NOT NULL,
  data_acordo                  DATE,
  data_vencimento_operacao     DATE,
  valor_operacao_credito       DECIMAL(15,2),
  valor_subsidio_credito       DECIMAL(15,2),
  valor_condicao_especial      DECIMAL(15,2),
  cpf_qualificador             CHAR(11),
  numero_reserva_pre_validacao VARCHAR(50),
  valor                        DECIMAL(15,2),
  motivo                       TEXT,
  motivo_erro                  TEXT,
  arquivo_origem               VARCHAR(500),

  -- Controle interno
  status_fgo                   ENUM(
    'AGUARDANDO_PRE_VALIDACAO',
    'CONCLUIDO',
    'REJEITADO',
    'EXPIRADO',
    'ERRO_DEFINITIVO'
  )                            DEFAULT 'AGUARDANDO_PRE_VALIDACAO',
  motivo_status_fgo            TEXT,
  concluido                    TINYINT(1)    DEFAULT 0,
  created_at                   DATETIME      DEFAULT NOW(),
  updated_at                   DATETIME      DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgo_cpf          (cpf),
  INDEX idx_fgo_id_acordo    (id_acordo),
  INDEX idx_fgo_tipo_produto (tipo_produto),
  INDEX idx_fgo_status_fgo   (status_fgo),
  INDEX idx_fgo_concluido    (concluido),
  INDEX idx_fgo_arquivo_ori  (arquivo_origem(100))
);


-- -----------------------------------------------------------------------------
-- 2. fgo_event_history
-- Histórico de cada evento processado por documento FGO.
-- Cada chamada à API (tentativa, sucesso, erro) gera uma linha aqui.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_event_history (
  id               BIGINT       AUTO_INCREMENT PRIMARY KEY,
  document_id      BIGINT       NOT NULL,     -- FK → fgo_documents.id
  cpf              CHAR(11)     NOT NULL,
  evento           VARCHAR(100) NOT NULL,     -- ex: evt_reserva_pre_validacao
  nr_tentativa     INT          DEFAULT 1,
  protocolo        BIGINT,                    -- -1 se falhou ao obter
  origem_protocolo VARCHAR(100),
  status_acordo    VARCHAR(50),
  motivo_status    TEXT,
  tx_response      TEXT,                      -- JSON completo da resposta da API
  dhr_solicitacao  DATETIME     DEFAULT NOW(),
  arquivo_origem   VARCHAR(500),
  arquivo_saida    VARCHAR(200),

  INDEX idx_fgo_eh_cpf   (cpf),
  INDEX idx_fgo_eh_evento (evento),
  INDEX idx_fgo_eh_dhr   (dhr_solicitacao),

  CONSTRAINT fk_fgo_eh_document
    FOREIGN KEY (document_id) REFERENCES fgo_documents(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);


-- -----------------------------------------------------------------------------
-- 3. fgo_remessa
-- Representa um arquivo GFG0010 completo (header + detalhes + trailer).
-- Estratégia: apenas campos variáveis — constantes do programa ficam no service.
-- Relação com spec GFG0010:
--   fgo_remessa             → tipo 01 (Header) + tipo 99 (Trailer)
--   fgo_remessa_documents   → tipo 03 (Formalização de Operação)
--   fgo_remessa_liberacoes  → tipo 04 (Liberação de Crédito)
--   fgo_remessa_saldos      → tipo 05 (Informação de Saldo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_remessa (
  id               BIGINT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  numero_remessa   SMALLINT UNSIGNED  NOT NULL,   -- 0001–9999, sequencial por agente
  agente           CHAR(3)            NOT NULL,   -- código do Agente Financeiro

  status           ENUM(
    'GERANDO',      -- arquivo sendo montado
    'PENDENTE',     -- arquivo gerado, ainda não enviado
    'ENVIADO',      -- transmitido ao Administrador
    'APROVADO',     -- 1º retorno: aprovado na validação inicial
    'REJEITADO',    -- 1º retorno: rejeitado (veja codigo_rejeicao)
    'PROCESSADO'    -- 2º retorno recebido e registrado
  )                DEFAULT 'GERANDO',

  codigo_rejeicao  CHAR(3),        -- "000" = aprovado; seção 14.1 do manual
  data_envio       DATETIME,
  arquivo_path     VARCHAR(500),   -- ex: s3://fgo-input-file/remessa/GFG0010_001_0001.txt

  created_at       DATETIME        DEFAULT NOW(),
  updated_at       DATETIME        DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgorem_agente   (agente),
  INDEX idx_fgorem_numero   (numero_remessa),
  INDEX idx_fgorem_status   (status),
  INDEX idx_fgorem_data_env (data_envio)
);


-- -----------------------------------------------------------------------------
-- 4. fgo_remessa_documents  (tipo 03 — Formalização de Operação)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_remessa_documents (
  id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  remessa_id               BIGINT UNSIGNED NOT NULL,  -- FK → fgo_remessa.id
  fgo_document_id          BIGINT,                    -- FK → fgo_documents.id (rastreabilidade)

  codigo_op                VARCHAR(20)   NOT NULL,    -- único por agente
  agencia                  CHAR(4)       NOT NULL,    -- 4N
  ibge                     CHAR(7)       NOT NULL,    -- 7N sem dígito verificador
  cpf                      CHAR(11)      NOT NULL,    -- 11 dígitos
  renda_mensal             DECIMAL(15,2) NOT NULL,    -- máx R$8.105,00
  valor_operacao           DECIMAL(15,2) NOT NULL,    -- máx R$15.000,00
  data_formalizacao        DATE          NOT NULL,    -- ≥ 05/05/2026
  data_vencimento          DATE          NOT NULL,    -- > data_formalizacao, máx 48 meses
  numero_pre_validacao     CHAR(9)       NOT NULL,    -- obrigatório FGO Novo Desenrola

  status_registro          ENUM('PENDENTE','APROVADO','REJEITADO') DEFAULT 'PENDENTE',
  codigo_rejeicao_registro VARCHAR(10),
  motivo_rejeicao          TEXT,

  created_at               DATETIME      DEFAULT NOW(),
  updated_at               DATETIME      DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgoredoc_remessa   (remessa_id),
  INDEX idx_fgoredoc_fgodoc    (fgo_document_id),
  INDEX idx_fgoredoc_cpf       (cpf),
  INDEX idx_fgoredoc_codigo_op (codigo_op),
  INDEX idx_fgoredoc_status    (status_registro),

  CONSTRAINT fk_fgoredoc_remessa
    FOREIGN KEY (remessa_id)      REFERENCES fgo_remessa(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_fgoredoc_fgodoc
    FOREIGN KEY (fgo_document_id) REFERENCES fgo_documents(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);


-- -----------------------------------------------------------------------------
-- 5. fgo_remessa_liberacoes  (tipo 04 — Liberação de Crédito)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_remessa_liberacoes (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  remessa_id       BIGINT UNSIGNED NOT NULL,  -- FK → fgo_remessa.id
  documento_id     BIGINT UNSIGNED NOT NULL,  -- FK → fgo_remessa_documents.id

  data_liberacao   DATE          NOT NULL,    -- ≥ data_formalizacao e < data_vencimento
  valor_liberado   DECIMAL(15,2) NOT NULL,    -- > 0; soma ≤ valor_operacao

  status_registro  ENUM('PENDENTE','APROVADO','REJEITADO') DEFAULT 'PENDENTE',
  codigo_rejeicao  CHAR(3),
  motivo_rejeicao  TEXT,

  created_at       DATETIME      DEFAULT NOW(),
  updated_at       DATETIME      DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgorelib_remessa   (remessa_id),
  INDEX idx_fgorelib_documento (documento_id),
  INDEX idx_fgorelib_data      (data_liberacao),

  CONSTRAINT fk_fgorelib_remessa
    FOREIGN KEY (remessa_id)   REFERENCES fgo_remessa(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_fgorelib_doc
    FOREIGN KEY (documento_id) REFERENCES fgo_remessa_documents(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);


-- -----------------------------------------------------------------------------
-- 6. fgo_remessa_saldos  (tipo 05 — Informação de Saldo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_remessa_saldos (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  remessa_id            BIGINT UNSIGNED NOT NULL,  -- FK → fgo_remessa.id
  documento_id          BIGINT UNSIGNED NOT NULL,  -- FK → fgo_remessa_documents.id

  data_apuracao         DATE          NOT NULL,    -- último dia corrido do mês anterior
  capital_normalidade   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  capital_atraso        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  encargos_normalidade  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  encargos_atraso       DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  data_inadimplencia    DATE,                      -- obrigatório quando capital_atraso > 0
  indice_perda_esperada DECIMAL(7,6)  NOT NULL DEFAULT 0.000000,  -- Res. CMN 4.966

  status_registro       ENUM('PENDENTE','APROVADO','REJEITADO') DEFAULT 'PENDENTE',
  codigo_rejeicao       CHAR(3),
  motivo_rejeicao       TEXT,

  created_at            DATETIME      DEFAULT NOW(),
  updated_at            DATETIME      DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgoresal_remessa   (remessa_id),
  INDEX idx_fgoresal_documento (documento_id),
  INDEX idx_fgoresal_data      (data_apuracao),
  INDEX idx_fgoresal_status    (status_registro),

  CONSTRAINT fk_fgoresal_remessa
    FOREIGN KEY (remessa_id)   REFERENCES fgo_remessa(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_fgoresal_doc
    FOREIGN KEY (documento_id) REFERENCES fgo_remessa_documents(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);


-- -----------------------------------------------------------------------------
-- 7. fgo_retorno
-- Registra cada arquivo de Retorno recebido do Administrador.
-- Uma linha por arquivo recebido — status individuais ficam nas tabelas acima.
-- tipo_retorno cobre os 4 retornos + informativo sem necessidade de nova tabela.
-- arquivo_conteudo (raw) permite reprocessamento sem depender do S3.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fgo_retorno (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  remessa_id          BIGINT UNSIGNED NOT NULL,  -- FK → fgo_remessa.id

  tipo_retorno        ENUM(
    '2',              -- GFGF200R — Validação dos Eventos do Agente
    '3',              -- GFGF290R — Eventos do Administrador
    '4',              -- GFGF450R — Movimentação Financeira
    'INFORMATIVO'     -- GFGF270R — Informativo Diário
  )                   NOT NULL,
  numero_remessa      CHAR(4)      NOT NULL,    -- pos 32-35 do header
  data_processamento  DATE         NOT NULL,    -- pos 36-43 do header

  total_registros     INT UNSIGNED NOT NULL DEFAULT 0,
  total_aprovados     INT UNSIGNED NOT NULL DEFAULT 0,
  total_rejeitados    INT UNSIGNED NOT NULL DEFAULT 0,

  arquivo_path        VARCHAR(500),
  arquivo_conteudo    MEDIUMTEXT,               -- raw 211 chars/linha para auditoria

  status              ENUM(
    'RECEBIDO',       -- arquivo chegou, ainda não processado
    'PROCESSADO',     -- registros atualizados nas tabelas de remessa
    'ERRO'            -- falha no processamento (veja erro_mensagem)
  )                   NOT NULL DEFAULT 'RECEBIDO',
  erro_mensagem       TEXT,

  created_at          DATETIME     DEFAULT NOW(),
  updated_at          DATETIME     DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgoret_remessa   (remessa_id),
  INDEX idx_fgoret_tipo      (tipo_retorno),
  INDEX idx_fgoret_numero    (numero_remessa),
  INDEX idx_fgoret_status    (status),
  INDEX idx_fgoret_data_proc (data_processamento),

  CONSTRAINT fk_fgoret_remessa
    FOREIGN KEY (remessa_id) REFERENCES fgo_remessa(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);


-- =============================================================================
-- INSERTs de dados de teste
-- Baseados no arquivo arquivos_teste/GFG0010_remessa_teste.txt
-- =============================================================================

-- fgo_documents — 2 mutuários de exemplo
INSERT INTO fgo_documents
  (tipo_produto, id_acordo, ibge_cliente, cpf, data_acordo, data_vencimento_operacao,
   valor_operacao_credito, numero_reserva_pre_validacao, status_fgo, concluido)
VALUES
  ('EMPRESTIMO', 1001, '0530010', '11144477735', '2026-05-10', '2028-05-10',
   5000.00, '123456789', 'CONCLUIDO', 1),
  ('EMPRESTIMO', 1002, '3550308', '52998224725', '2026-05-10', '2028-05-10',
   8000.00, '987654321', 'CONCLUIDO', 1);

-- fgo_remessa — arquivo de remessa de exemplo
INSERT INTO fgo_remessa
  (numero_remessa, agente, status, codigo_rejeicao, data_envio, arquivo_path)
VALUES
  (1, '001', 'APROVADO', '000', '2026-05-16 17:30:00',
   's3://fgo-input-file/remessa/GFG0010_001_0001.txt');

-- fgo_remessa_documents — 2 operações (tipo 03)
INSERT INTO fgo_remessa_documents
  (remessa_id, fgo_document_id, codigo_op, agencia, ibge, cpf,
   renda_mensal, valor_operacao, data_formalizacao, data_vencimento,
   numero_pre_validacao, status_registro)
VALUES
  (1, 1, 'OP001-DESENROLA-2026', '0001', '0530010', '11144477735',
   800.00, 5000.00, '2026-05-10', '2028-05-10', '123456789', 'APROVADO'),
  (1, 2, 'OP002-DESENROLA-2026', '0002', '3550308', '52998224725',
   2000.00, 8000.00, '2026-05-10', '2028-05-10', '987654321', 'APROVADO');

-- fgo_remessa_liberacoes — 1 liberação por operação (tipo 04)
INSERT INTO fgo_remessa_liberacoes
  (remessa_id, documento_id, data_liberacao, valor_liberado, status_registro)
VALUES
  (1, 1, '2026-05-15', 5000.00, 'APROVADO'),
  (1, 2, '2026-05-20', 8000.00, 'APROVADO');

-- fgo_remessa_saldos — 1 saldo por operação (tipo 05)
INSERT INTO fgo_remessa_saldos
  (remessa_id, documento_id, data_apuracao,
   capital_normalidade, capital_atraso, encargos_normalidade, encargos_atraso,
   data_inadimplencia, indice_perda_esperada, status_registro)
VALUES
  (1, 1, '2026-05-31', 4500.00, 0.00, 200.00, 0.00,
   NULL, 0.000051, 'APROVADO'),
  (1, 2, '2026-05-31', 0.00, 7000.00, 0.00, 500.00,
   '2026-05-25', 0.001500, 'APROVADO');

-- fgo_retorno — 2º retorno recebido de exemplo
INSERT INTO fgo_retorno
  (remessa_id, tipo_retorno, numero_remessa, data_processamento,
   total_registros, total_aprovados, total_rejeitados, status)
VALUES
  (1, '2', '0001', '2026-05-16', 8, 6, 0, 'PROCESSADO');
