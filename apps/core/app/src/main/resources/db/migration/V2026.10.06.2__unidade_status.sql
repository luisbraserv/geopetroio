-- =====================================================================
-- RN-116 — Unidade e inativada, e so e excluida se nunca foi usada.
--
-- Toda unidade existente nasce ATIVA: ate aqui nao havia como tirar uma
-- unidade de uso sem apaga-la.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE unidades ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ATIVA';
ALTER TABLE unidades ADD CONSTRAINT ck_unidades_status CHECK (status IN ('ATIVA', 'INATIVA'));
