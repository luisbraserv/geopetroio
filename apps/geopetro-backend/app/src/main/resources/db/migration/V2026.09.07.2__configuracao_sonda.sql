CREATE TABLE configuracao_sonda (
 unidade_sonda_id BIGINT NOT NULL,
 version BIGINT NOT NULL,
 limites_json LONGTEXT NOT NULL,
 atualizado_por VARCHAR(255) NOT NULL,
 atualizado_em DATETIME(6) NOT NULL,
 PRIMARY KEY (unidade_sonda_id),
 CONSTRAINT fk_configuracao_sonda FOREIGN KEY (unidade_sonda_id) REFERENCES unidades_sondas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
