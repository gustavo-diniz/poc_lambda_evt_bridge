-- =============================================================
-- Script 01 — Cria o banco de dados e o usuário da aplicação
-- Executar como: root ou usuário admin do MySQL
-- =============================================================

-- Cria o banco
CREATE DATABASE IF NOT EXISTS desenrola
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cria o usuário com senha (trocar 'SENHA_AQUI' antes de executar)
CREATE USER IF NOT EXISTS 'desenrola_user'@'%' IDENTIFIED BY 'SENHA_AQUI';

-- Concede apenas as permissões necessárias — sem acesso de admin
GRANT SELECT, INSERT, UPDATE ON desenrola.* TO 'desenrola_user'@'%';

-- Aplica imediatamente
FLUSH PRIVILEGES;

-- Confirma
SELECT user, host FROM mysql.user WHERE user = 'desenrola_user';
