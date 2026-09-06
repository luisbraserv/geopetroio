-- Aplicar uma vez antes do deploy; nao altera os cenarios legados.
CREATE TABLE simulador_pocos (
    id BIGINT NOT NULL AUTO_INCREMENT,
    version BIGINT NOT NULL,
    nome VARCHAR(255) NOT NULL,
    geometria LONGTEXT NOT NULL,
    atualizado_por VARCHAR(255) NOT NULL,
    atualizado_em DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE simulador_cenarios
    ADD COLUMN poco_id BIGINT NULL,
    ADD INDEX idx_cenario_poco (poco_id),
    ADD CONSTRAINT fk_cenario_poco FOREIGN KEY (poco_id)
        REFERENCES simulador_pocos (id) ON DELETE RESTRICT;
