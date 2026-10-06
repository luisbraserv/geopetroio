-- =====================================================================
-- Braserv-Core (RN-115, RN-119) — o lado do Geopetro-Backend.
--
-- 1. As quatro FKs para unidades_sondas caem: a unidade passa a viver no
--    Braserv-Core, em outro database. A coluna fica como referencia
--    simples ao id do core. Nao fica orfa: o core so apaga uma unidade
--    depois de este backend confirmar que nao ha uso dela (RN-116).
-- 2. unidade_sonda_id passa a se chamar unidade_id (RN-119).
--
-- IDEMPOTENTE: cada passo confere information_schema antes, como as
-- demais migrations (DT-002). Os nomes das FKs sao descobertos em tempo
-- de execucao, porque bases criadas em momentos diferentes receberam
-- nomes diferentes.
--
-- NAO apaga as tabelas de cadastro (usuarios, unidades_sondas...): elas
-- sao MOVIDAS para o braserv_core pelo script de deploy
-- (deploy/vm-unica/core/mover-para-core.sql), com os dados.
--
-- Spec: specs/SDD/software/backend/braserv-core.md, secao 5.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- configuracao_sonda
-- ---------------------------------------------------------------------
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracao_sonda'
              AND COLUMN_NAME = 'unidade_sonda_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'DO 0', CONCAT('ALTER TABLE configuracao_sonda DROP FOREIGN KEY ', @fk));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracao_sonda' AND COLUMN_NAME = 'unidade_sonda_id');
SET @sql := IF(@coluna = 0, 'DO 0',
  'ALTER TABLE configuracao_sonda RENAME COLUMN unidade_sonda_id TO unidade_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- configuracao_cards
-- ---------------------------------------------------------------------
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracao_cards'
              AND COLUMN_NAME = 'unidade_sonda_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'DO 0', CONCAT('ALTER TABLE configuracao_cards DROP FOREIGN KEY ', @fk));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracao_cards' AND COLUMN_NAME = 'unidade_sonda_id');
SET @sql := IF(@coluna = 0, 'DO 0',
  'ALTER TABLE configuracao_cards RENAME COLUMN unidade_sonda_id TO unidade_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- evento_alarme
-- ---------------------------------------------------------------------
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evento_alarme'
              AND COLUMN_NAME = 'unidade_sonda_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'DO 0', CONCAT('ALTER TABLE evento_alarme DROP FOREIGN KEY ', @fk));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evento_alarme' AND COLUMN_NAME = 'unidade_sonda_id');
SET @sql := IF(@coluna = 0, 'DO 0',
  'ALTER TABLE evento_alarme RENAME COLUMN unidade_sonda_id TO unidade_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- episodio_alarme_extremo
-- ---------------------------------------------------------------------
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'episodio_alarme_extremo'
              AND COLUMN_NAME = 'unidade_sonda_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'DO 0', CONCAT('ALTER TABLE episodio_alarme_extremo DROP FOREIGN KEY ', @fk));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'episodio_alarme_extremo' AND COLUMN_NAME = 'unidade_sonda_id');
SET @sql := IF(@coluna = 0, 'DO 0',
  'ALTER TABLE episodio_alarme_extremo RENAME COLUMN unidade_sonda_id TO unidade_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Conferencia sugerida apos aplicar (deve devolver 0):
--   SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
--    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'unidades_sondas'
--      AND TABLE_NAME IN ('configuracao_sonda','configuracao_cards','evento_alarme','episodio_alarme_extremo');
