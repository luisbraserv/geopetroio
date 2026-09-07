-- =====================================================================
-- RN-065 — Unidade/Sonda ganha o campo `tipo`.
--
-- IDEMPOTENTE.
--
-- ATENCAO: o passo 2 classifica TODAS as linhas existentes como SONDA.
-- E o padrao coerente com a frota atual, mas a classificacao precisa ser
-- conferida registro a registro na tela de cadastro depois do deploy. Uma
-- unidade de bombeio, slickline, cimentacao ou UCAQ marcada como SONDA nao
-- quebra nada hoje — o tipo e classificacao apenas (RN-074) —, mas fica
-- errada no cadastro. O campo e editavel justamente para isso.
--
-- Conferencia sugerida apos aplicar:
--   SELECT tipo, COUNT(*) FROM unidades_sondas GROUP BY tipo;
-- =====================================================================

SET NAMES utf8mb4;

-- 1. Coluna nula, para a tabela existente aceitar a alteracao.
SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'unidades_sondas' AND COLUMN_NAME = 'tipo');
SET @sql := IF(@coluna = 0,
  'ALTER TABLE unidades_sondas ADD COLUMN tipo VARCHAR(32) NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2. Backfill. Conferir depois, registro a registro.
UPDATE unidades_sondas SET tipo = 'SONDA' WHERE tipo IS NULL;

-- 3. So agora obrigatoria, com o backfill garantindo que nao ha nulo.
ALTER TABLE unidades_sondas MODIFY COLUMN tipo VARCHAR(32) NOT NULL;
