CREATE TABLE configuracao_smtp (
    id BIGINT NOT NULL,
    version BIGINT NOT NULL,
    enabled BOOLEAN NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL,
    transport VARCHAR(16) NOT NULL,
    auth BOOLEAN NOT NULL,
    username VARCHAR(255) NOT NULL,
    password_encrypted VARCHAR(8192) NULL,
    sender_address VARCHAR(255) NOT NULL,
    frontend_url VARCHAR(2048) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_smtp_singleton CHECK (id = 1),
    CONSTRAINT ck_smtp_port CHECK (port BETWEEN 1 AND 65535)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
