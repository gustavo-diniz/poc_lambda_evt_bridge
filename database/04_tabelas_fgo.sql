-- =============================================================================
-- Schema FGO
-- =============================================================================

-- Foto final do documento FGO — usada para controle da extração CSV e monitoramento.
-- Um CPF pode ter mais de um registro (reprocessamentos).
CREATE TABLE IF NOT EXISTS fgo_documents (
  id                          BIGINT AUTO_INCREMENT PRIMARY KEY,

  -- Campos vindos do CSV da fila
  tipo_produto                VARCHAR(50)      NOT NULL,  -- ex: CARTAO, EMPRESTIMO
  id_acordo                   BIGINT           NOT NULL,
  ibge_cliente                VARCHAR(10),
  cpf                         CHAR(11)         NOT NULL,
  data_acordo                 DATE,
  data_vencimento_operacao    DATE,
  valor_operacao_credito      DECIMAL(15,2),
  valor_subsidio_credito      DECIMAL(15,2),
  valor_condicao_especial     DECIMAL(15,2),
  cpf_qualificador            CHAR(11),
  numero_reserva_pre_validacao VARCHAR(50),
  valor                       DECIMAL(15,2),
  motivo                      TEXT,
  motivo_erro                 TEXT,
  arquivo_origem              VARCHAR(500),

  -- Controle interno
  status_fgo                  ENUM(
    'AGUARDANDO_PRE_VALIDACAO',
    'CONCLUIDO',
    'REJEITADO',
    'EXPIRADO',
    'ERRO_DEFINITIVO'
  )                           DEFAULT 'AGUARDANDO_PRE_VALIDACAO',
  motivo_status_fgo           TEXT,
  concluido                   TINYINT(1)       DEFAULT 0,
  created_at                  DATETIME         DEFAULT NOW(),
  updated_at                  DATETIME         DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_fgo_cpf           (cpf),
  INDEX idx_fgo_id_acordo     (id_acordo),
  INDEX idx_fgo_tipo_produto  (tipo_produto),
  INDEX idx_fgo_status_fgo    (status_fgo),
  INDEX idx_fgo_concluido     (concluido),
  INDEX idx_fgo_arquivo_ori   (arquivo_origem(100))
);

-- Histórico de cada evento processado por documento FGO.
-- Cada chamada à API (tentativa, sucesso, erro) gera uma linha aqui.
CREATE TABLE IF NOT EXISTS fgo_event_history (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id      BIGINT       NOT NULL,  -- FK para fgo_documents.id
  cpf              CHAR(11)     NOT NULL,
  evento           VARCHAR(100) NOT NULL,  -- ex: evt_reserva_pre_validacao
  nr_tentativa     INT          DEFAULT 1,
  protocolo        BIGINT,                 -- protocolo envolvido no evento (-1 se falhou ao obter)
  origem_protocolo VARCHAR(100),           -- endpoint/fluxo que gerou o protocolo
  status_acordo    VARCHAR(50),  
  motivo_status    TEXT,
  tx_response      TEXT,                   -- JSON completo da resposta da API
  dhr_solicitacao  DATETIME     DEFAULT NOW(),
  arquivo_origem   VARCHAR(500),
  arquivo_saida    VARCHAR(200),

  INDEX idx_fgo_eh_cpf        (cpf),
  INDEX idx_fgo_eh_evento     (evento),
  INDEX idx_fgo_eh_dhr        (dhr_solicitacao),
  CONSTRAINT fk_fgo_eh_document
    FOREIGN KEY (document_id) REFERENCES fgo_documents(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);
