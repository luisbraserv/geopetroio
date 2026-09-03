-- =====================================================================
-- Migration: amplia usuario_roles.role para caber roles novas/longas
-- Data: 2026-06-03
-- Banco: MySQL (geopetro_io)
--
-- CONTEXTO:
--   Foram adicionadas roles longas (ex.: SISTEMA_GESTAO_INTEGRADA = 24 chars,
--   DEPARTAMENTO_PESSOAL = 20). Em bases antigas a coluna usuario_roles.role
--   pode ter sido criada menor (ou como ENUM), causando
--   "Data truncated for column 'role'" (ErrorCode 1265) ao cadastrar usuario.
--
--   Idempotente. Rode antes de subir em producao:
--     mysql -u<user> -p <database> -e "SOURCE V2026.06.04__amplia_usuario_roles_role.sql"
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE usuario_roles
    MODIFY COLUMN role VARCHAR(255)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
