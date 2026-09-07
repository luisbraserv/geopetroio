-- OQ-021: one recovery record per user; token material is never persisted.
CREATE TABLE IF NOT EXISTS recuperacao_senha (
    username VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NULL,
    credential_hash VARCHAR(64) NOT NULL,
    issued_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    PRIMARY KEY (username),
    UNIQUE KEY uk_recuperacao_token (token_hash),
    CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (username) REFERENCES usuarios(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
