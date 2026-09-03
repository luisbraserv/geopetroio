-- =====================================================================
-- Migration: vinculo do usuario interno com N regionais e N setores
-- Data: 2026-06-03
-- Banco: MySQL (geopetro_io)
--
-- CONTEXTO:
--   O usuario interno passa a ter:
--     - 1 regional PRINCIPAL  -> coluna usuarios.regional_id (ja existe)
--     - N regionais           -> tabela usuario_interno_regionais (nova)
--     - N setores             -> tabela usuario_interno_setores (ja existe)
--
--   Script IDEMPOTENTE. Rode antes de subir a aplicacao em producao:
--     mysql -u<user> -p <database> -e "SOURCE V2026.06.03__usuario_regionais_setores.sql"
--   (use SOURCE / cliente UTF-8; nao use pipe que corrompe acentos)
-- =====================================================================

SET NAMES utf8mb4;

-- 1) Tabela N:N de regionais do usuario interno
CREATE TABLE IF NOT EXISTS usuario_interno_regionais (
    usuario_username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    regional_id      BIGINT       NOT NULL,
    PRIMARY KEY (usuario_username, regional_id),
    CONSTRAINT fk_uir_usuario  FOREIGN KEY (usuario_username) REFERENCES usuarios (username),
    CONSTRAINT fk_uir_regional FOREIGN KEY (regional_id)      REFERENCES regionais (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Garante PK na tabela legada de setores (evita pares duplicados)
SET @pk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'usuario_interno_setores' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
SET @sql := IF(@pk = 0,
  'ALTER TABLE usuario_interno_setores ADD PRIMARY KEY (usuario_username, setor_id)',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Backfill: a regional principal de cada usuario interno entra na lista de regionais
INSERT IGNORE INTO usuario_interno_regionais (usuario_username, regional_id)
SELECT u.username, u.regional_id
  FROM usuarios u
 WHERE u.tipo_usuario = 'INTERNO'
   AND u.regional_id IS NOT NULL
   AND u.regional_id IN (SELECT id FROM regionais);
