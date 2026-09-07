-- =====================================================================
-- RN-059 / RN-067 — Poco vira entidade, e o cenario o referencia.
--
-- IDEMPOTENTE. Precisa ser: o MySQL local ja recebeu esta estrutura por
-- efeito colateral, quando a suite de testes subiu o perfil dev com
-- ddl-auto=update em 2026-09-06. Sem as guardas abaixo, o Flyway falharia
-- naquela base ao tentar criar o que ja existe.
-- Ver Backend-Sonda-Geopetro-IO/specs/simulador-pocos.md.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS simulador_pocos (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    version        BIGINT       NOT NULL,
    nome           VARCHAR(255) NOT NULL,
    geometria      LONGTEXT     NOT NULL,
    atualizado_por VARCHAR(255) NOT NULL,
    atualizado_em  DATETIME(6)  NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Coluna de vinculo no cenario. Opcional: cenarios legados seguem sem poco.
SET @coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'simulador_cenarios' AND COLUMN_NAME = 'poco_id');
SET @sql := IF(@coluna = 0,
  'ALTER TABLE simulador_cenarios ADD COLUMN poco_id BIGINT NULL',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @indice := (SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'simulador_cenarios' AND INDEX_NAME = 'idx_cenario_poco');
SET @sql := IF(@indice = 0,
  'ALTER TABLE simulador_cenarios ADD INDEX idx_cenario_poco (poco_id)',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ON DELETE RESTRICT: excluir um poco com cenarios e recusado no banco,
-- alem do bloqueio no servico. Sem cascata — apagar cenarios junto seria
-- perda silenciosa.
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'simulador_cenarios' AND CONSTRAINT_NAME = 'fk_cenario_poco');
SET @sql := IF(@fk = 0,
  'ALTER TABLE simulador_cenarios ADD CONSTRAINT fk_cenario_poco FOREIGN KEY (poco_id) REFERENCES simulador_pocos (id) ON DELETE RESTRICT',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
