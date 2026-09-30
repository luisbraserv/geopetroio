-- =====================================================================
-- RN-086 — a role SUPORTE passa a existir.
--
-- IDEMPOTENTE.
--
-- POR QUE ESTE SCRIPT PRECISA EXISTIR
-- Acrescentar um valor ao enum Java normalmente nao exige migration. Aqui
-- exige, por causa de uma divergencia entre ambientes descoberta em revisao
-- (DT-002):
--
--   producao   : usuario_roles.role e VARCHAR(255)
--                V2026.06.04 rodou la, justamente para ampliar a coluna
--   base nova  : usuario_roles.role e ENUM(...) com os sete valores
--                o baseline V2026.09.04 veio das entidades JPA, e o Hibernate
--                gera ENUM para @Enumerated(EnumType.STRING)
--
-- Em producao, gravar 'SUPORTE' funcionaria sem tocar no schema. Numa base
-- nova, falharia com "Data truncated for column 'role'" (ErrorCode 1265) —
-- o mesmo erro que motivou V2026.06.04 em 2026-06-03.
--
-- Este script normaliza para VARCHAR(255) SOMENTE onde ainda e ENUM. Em
-- producao ele nao encosta na tabela: nada de rewrite desnecessario, e a
-- collation existente (utf8mb4_unicode_ci) fica preservada.
--
-- Efeito colateral desejado: elimina a divergencia de tipo entre os dois
-- ambientes.
-- =====================================================================

SET NAMES utf8mb4;

SET @tipo := (SELECT DATA_TYPE FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'usuario_roles'
                AND COLUMN_NAME = 'role');

-- Sem collation explicita: a coluna herda o padrao da tabela. Declarar uma
-- aqui trocaria silenciosamente a collation de producao.
SET @sql := IF(@tipo = 'enum',
  'ALTER TABLE usuario_roles MODIFY COLUMN role VARCHAR(255) NOT NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Conferencia sugerida apos aplicar:
--   SHOW COLUMNS FROM usuario_roles LIKE 'role';   -- deve ser varchar(255)
