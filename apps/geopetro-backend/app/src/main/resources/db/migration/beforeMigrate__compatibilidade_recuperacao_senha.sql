-- Bases anteriores ao Flyway podem usar utf8mb4_unicode_ci, enquanto o baseline
-- novo usa utf8mb4_0900_ai_ci. A coluna de uma chave estrangeira textual precisa
-- ter o mesmo charset/collation da coluna referenciada.
--
-- O callback preserva a ordem e os checksums das migrations versionadas: numa
-- base legada, cria a tabela antes da V2026.09.06.3; numa base vazia, usuarios
-- ainda nao existe e o baseline seguido da migration original cria a estrutura.
SET @usuarios_charset := (
    SELECT CHARACTER_SET_NAME
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'username'
);

SET @usuarios_collation := (
    SELECT COLLATION_NAME
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'username'
);

SET @sql := IF(
    @usuarios_charset IS NOT NULL
    AND @usuarios_collation IS NOT NULL
    AND (SELECT COUNT(*)
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'recuperacao_senha') = 0,
    CONCAT(
        'CREATE TABLE recuperacao_senha (',
        'username VARCHAR(255) CHARACTER SET ', @usuarios_charset,
        ' COLLATE ', @usuarios_collation, ' NOT NULL,',
        'token_hash VARCHAR(64) NULL,',
        'credential_hash VARCHAR(64) NOT NULL,',
        'issued_at DATETIME(6) NOT NULL,',
        'expires_at DATETIME(6) NOT NULL,',
        'PRIMARY KEY (username),',
        'UNIQUE KEY uk_recuperacao_token (token_hash),',
        'CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (username) ',
        'REFERENCES usuarios(username) ON DELETE CASCADE',
        ') ENGINE=InnoDB DEFAULT CHARACTER SET ', @usuarios_charset,
        ' COLLATE ', @usuarios_collation
    ),
    'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
