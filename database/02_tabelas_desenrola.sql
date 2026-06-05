-- =============================================================================
-- Schema Desenrola 2.0
-- =============================================================================

-- Foto final do documento — usada para extração do CSV_B e monitoramento.
-- Um CPF pode ter mais de um registro (reprocessamentos).
CREATE TABLE IF NOT EXISTS desenrola_documents (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  cpf                   CHAR(11)     NOT NULL,
  vlr_acordo_digio      DECIMAL(15,2),
  vlr_divida_atualizada DECIMAL(15,2),
  protocolo_saldo               BIGINT,
  protocolo_saldo_dhr_solic     DATETIME,
  protocolo_saldo_dhr_consulta  DATETIME,
  vr_maximo_debito      DECIMAL(15,2),
  protocolo_reserva     BIGINT,
  vlr_reserva           DECIMAL(15,2),
  protocolo_reserva_dhr_solic   DATETIME,
  protocolo_reserva_dhr_consulta  DATETIME,
  arquivo_origem        VARCHAR(500),
  dhr_arquivo_origem    DATETIME     DEFAULT NOW(),
  arquivo_destino       VARCHAR(200),
  dhr_arquivo_destino   DATETIME,
  concluido             TINYINT(1)   DEFAULT 0,
  status                ENUM(
    'AGUARDANDO_PROTOCOLO_CONSULTA_SALDO',
    'AGUARDANDO_CONSULTA_SALDO',
    'AGUARDANDO_PROTOCOLO_INF_DIVIDA',
    'AGUARDANDO_CONFIRMACAO_INF_DIVIDA',
    'CONCLUIDO',
    'REJEITADO',
    'EXPIRADO',
    'ERRO_PROTOCOLO'
  ) DEFAULT 'AGUARDANDO_PROTOCOLO_CONSULTA_SALDO',
  motivo_status         TEXT,
  created_at            DATETIME     DEFAULT NOW(),
  updated_at            DATETIME     DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_cpf         (cpf),
  INDEX idx_status      (status),
  INDEX idx_concluido   (concluido),
  INDEX idx_arquivo_ori (arquivo_origem(100))
);

-- Histórico de cada evento processado por documento.
-- Cada chamada à API da Caixa (tentativa, sucesso, erro) gera uma linha aqui.
CREATE TABLE IF NOT EXISTS desenrola_event_history (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id      BIGINT       NOT NULL,  -- FK para desenrola_documents.id
  cpf              CHAR(11)     NOT NULL,
  evento           VARCHAR(100) NOT NULL,  -- ex: evt_gerar_protocolo_consulta-saldo-liquido-simulado
  nr_tentativa     INT          DEFAULT 1,
  protocolo        BIGINT,                 -- protocolo envolvido no evento (-1 se falhou ao obter)
  origem_protocolo VARCHAR(100),           -- endpoint/fluxo que gerou o protocolo (ex: consulta-saldo-liquido-simulado)
  status_acordo           VARCHAR(50),            -- SUCESSO | ERRO_TRANSIENTE | ERRO_DEFINITIVO | LIMITE_TENTATIVAS | EM_PROCESSAMENTO | EXPIRADO | REJEITADO
  motivo_status    TEXT,
  tx_response      TEXT,                   -- JSON completo da resposta da API
  dhr_solicitacao  DATETIME     DEFAULT NOW(),
  arquivo_origem   VARCHAR(500),
  arquivo_saida    VARCHAR(200),

  INDEX idx_eh_cpf        (cpf),
  INDEX idx_eh_evento     (evento),
  INDEX idx_eh_dhr        (dhr_solicitacao),
  CONSTRAINT fk_eh_document
    FOREIGN KEY (document_id) REFERENCES desenrola_documents(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);
