-- =====================================================================
-- RN-080 / RN-089 — documento de cards da Unidade/Sonda.
--
-- IDEMPOTENTE.
--
-- Um documento por unidade, separado do de limites de alarme
-- (configuracao_sonda). Os dois tem revisao propria porque tem
-- AUTORIDADES diferentes para gravar: card exige ADMIN ou SUPORTE, e
-- limite segue RN-069, onde quem enxerga a sonda ajusta — inclusive
-- CLIENTE. Num documento so, quem ajustasse um limite devolveria o
-- documento inteiro, cards inclusive.
--
-- version e o lock otimista do JPA e a origem da revisao exposta na API.
--
-- FK sem cascata: cards configurados impedem a exclusao da unidade
-- (RN-063), como ja acontece com a configuracao de limites.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS configuracao_cards (
    unidade_sonda_id BIGINT       NOT NULL,
    version          BIGINT       NOT NULL,
    conexao_json     LONGTEXT     NOT NULL,
    cards_json       LONGTEXT     NOT NULL,
    atualizado_por   VARCHAR(255) NOT NULL,
    atualizado_em    DATETIME(6)  NOT NULL,
    PRIMARY KEY (unidade_sonda_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'configuracao_cards'
              AND CONSTRAINT_NAME = 'fk_configuracao_cards_unidade');
SET @sql := IF(@fk = 0,
  'ALTER TABLE configuracao_cards ADD CONSTRAINT fk_configuracao_cards_unidade
     FOREIGN KEY (unidade_sonda_id) REFERENCES unidades_sondas (id) ON DELETE RESTRICT',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
