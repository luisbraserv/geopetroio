-- =====================================================================
-- RN-064 — o usuario interno perde o vinculo organizacional.
--
-- IDEMPOTENTE.
--
-- Por que sai: desde 2026-08-27 nenhum destes campos influencia qualquer
-- decisao do sistema. O que decide visibilidade e a role (RN-047) e, para
-- o cliente, a concessao explicita em usuario_cliente_unidades (RN-048) —
-- nenhuma das duas e tocada aqui.
--
-- ⚠️ ESTE SCRIPT DESCARTA DADOS. As associacoes usuario->regional e
-- usuario->setor sao perdidas e nao ha caminho de volta. Nao ha backup do
-- MySQL (decisao de 2026-09-05). Para guardar os vinculos antes, rodar:
--   SELECT * FROM usuario_interno_regionais;
--   SELECT * FROM usuario_interno_setores;
--   SELECT username, regional_id FROM usuarios WHERE regional_id IS NOT NULL;
--
-- Conferencia sugerida apos aplicar:
--   SHOW COLUMNS FROM usuarios LIKE 'regional_id';   -- deve vir vazio
--   SHOW TABLES LIKE 'usuario_interno_%';            -- deve vir vazio
-- =====================================================================

SET NAMES utf8mb4;

-- 1. Tabelas N:N do vinculo organizacional.
DROP TABLE IF EXISTS usuario_interno_regionais;
DROP TABLE IF EXISTS usuario_interno_setores;

-- 2. Regional principal. A FK cai antes da coluna, e o nome dela e
--    descoberto em tempo de execucao: bases criadas em momentos
--    diferentes receberam nomes gerados diferentes do Hibernate.
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'usuarios'
              AND COLUMN_NAME = 'regional_id'
              AND REFERENCED_TABLE_NAME IS NOT NULL
            LIMIT 1);
SET @sql := IF(@fk IS NULL,
  'DO 0',
  CONCAT('ALTER TABLE usuarios DROP FOREIGN KEY ', @fk));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'regional_id');
SET @sql := IF(@coluna = 0,
  'DO 0',
  'ALTER TABLE usuarios DROP COLUMN regional_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
