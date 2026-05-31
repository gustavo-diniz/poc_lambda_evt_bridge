-- =============================================================
-- Script 03 — Queries de monitoramento e operação
-- Use para acompanhar o andamento do processamento em produção
-- =============================================================

USE desenrola;

-- ------------------------------------------------------------
-- 1. Painel geral — documentos por status
-- ------------------------------------------------------------
SELECT
  status,
  COUNT(*)                                           AS total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS pct
FROM desenrola_documents
GROUP BY status
ORDER BY total DESC;


-- ------------------------------------------------------------
-- 2. Progresso de exportação — concluídos vs já exportados
-- ------------------------------------------------------------
SELECT
  concluido,
  COUNT(*) AS total
FROM desenrola_documents
WHERE status = 'CONCLUIDO'
GROUP BY concluido;


-- ------------------------------------------------------------
-- 3. Documentos com ERRO_PROTOCOLO — para reprocessamento
-- ------------------------------------------------------------
SELECT
  d.cpf,
  d.arquivo_origem,
  d.created_at,
  d.updated_at,
  h.nr_tentativa,
  h.motivo_status,
  h.dhr_solicitacao AS ultima_tentativa
FROM desenrola_documents d
LEFT JOIN desenrola_event_history h
  ON h.cpf = d.cpf
  AND h.evento = 'evt_gerar_protocolo_consulta-saldo-liquido-simulado'
  AND h.id = (
    SELECT MAX(id) FROM desenrola_event_history
    WHERE cpf = d.cpf AND evento = 'evt_gerar_protocolo_consulta-saldo-liquido-simulado'
  )
WHERE d.status = 'ERRO_PROTOCOLO'
ORDER BY d.updated_at DESC;


-- ------------------------------------------------------------
-- 4. Documentos EXPIRADOS — protocolo gerado mas Caixa não respondeu
-- ------------------------------------------------------------
SELECT
  d.cpf,
  d.protocolo_saldo,
  d.arquivo_origem,
  d.created_at,
  d.updated_at,
  h.nr_tentativa,
  h.motivo_status,
  h.dhr_solicitacao AS ultima_tentativa
FROM desenrola_documents d
LEFT JOIN desenrola_event_history h
  ON h.cpf = d.cpf
  AND h.evento = 'evt_consulta_protocolo_consulta-saldo-liquido-simulado'
  AND h.id = (
    SELECT MAX(id) FROM desenrola_event_history
    WHERE cpf = d.cpf AND evento = 'evt_consulta_protocolo_consulta-saldo-liquido-simulado'
  )
WHERE d.status = 'EXPIRADO'
ORDER BY d.updated_at DESC;


-- ------------------------------------------------------------
-- 5. Documentos CONCLUIDOS ainda não exportados para CSV_B
-- ------------------------------------------------------------
SELECT
  cpf,
  protocolo_saldo,
  vr_maximo_debito,
  arquivo_origem,
  updated_at
FROM desenrola_documents
WHERE status    = 'CONCLUIDO'
  AND concluido = 0
ORDER BY updated_at ASC;


-- ------------------------------------------------------------
-- 6. Arquivos CSV_B gerados e quantos registros cada um contém
-- ------------------------------------------------------------
SELECT
  arquivo_destino,
  COUNT(*)       AS registros,
  MIN(dhr_arquivo_origem) AS primeiro_registro,
  MAX(dhr_arquivo_destino) AS gerado_em
FROM desenrola_documents
WHERE concluido = 1
GROUP BY arquivo_destino
ORDER BY gerado_em DESC;


-- ------------------------------------------------------------
-- 7. Histórico completo de eventos de um CPF específico
-- ------------------------------------------------------------
SELECT
  evento,
  nr_tentativa,
  protocolo,
  origem_protocolo,
  status_acordo,
  motivo_status,
  dhr_solicitacao
FROM desenrola_event_history
WHERE cpf = '00000000000'   -- << substitua pelo CPF desejado
ORDER BY dhr_solicitacao ASC;


-- ------------------------------------------------------------
-- 8. Últimos 20 documentos atualizados — visão geral recente
-- ------------------------------------------------------------
SELECT
  cpf,
  protocolo_saldo,
  vr_maximo_debito,
  status,
  concluido,
  arquivo_destino,
  updated_at
FROM desenrola_documents
ORDER BY updated_at DESC
LIMIT 20;


-- ------------------------------------------------------------
-- 9. Volume de eventos por tipo — visão de throughput
-- ------------------------------------------------------------
SELECT
  evento,
  status_acordo,
  COUNT(*) AS total,
  MIN(dhr_solicitacao) AS primeiro,
  MAX(dhr_solicitacao) AS ultimo
FROM desenrola_event_history
GROUP BY evento, status_acordo
ORDER BY evento, total DESC;


-- ------------------------------------------------------------
-- 10. Reprocessar CPF específico — redefine para AGUARDANDO_PROTOCOLO
--     Use com cuidado — apenas reprocessamento manual autorizado
-- ------------------------------------------------------------
-- UPDATE desenrola_documents
-- SET status     = 'AGUARDANDO_PROTOCOLO',
--     concluido  = 0,
--     updated_at = NOW()
-- WHERE cpf = '00000000000';
