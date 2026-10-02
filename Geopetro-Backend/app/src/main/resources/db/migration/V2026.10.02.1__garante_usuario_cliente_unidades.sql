-- Algumas bases anteriores ao Flyway nao possuem a tabela de concessoes do
-- cliente, embora ela seja obrigatoria no mapeamento JPA. A coluna textual usa
-- os metadados de usuarios.username para tambem funcionar nas bases legadas
-- com utf8mb4_unicode_ci e nas bases novas com utf8mb4_0900_ai_ci.
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
    (SELECT COUNT(*)
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuario_cliente_unidades') = 0,
    CONCAT(
        'CREATE TABLE usuario_cliente_unidades (',
        'unidade_sonda_id BIGINT NOT NULL,',
        'usuario_username VARCHAR(255) CHARACTER SET ', @usuarios_charset,
        ' COLLATE ', @usuarios_collation, ' NOT NULL,',
        'PRIMARY KEY (unidade_sonda_id, usuario_username),',
        'KEY idx_usuario_cliente_unidades_usuario (usuario_username),',
        'CONSTRAINT fk_usuario_cliente_unidade FOREIGN KEY (unidade_sonda_id) ',
        'REFERENCES unidades_sondas(id),',
        'CONSTRAINT fk_usuario_cliente_usuario FOREIGN KEY (usuario_username) ',
        'REFERENCES usuarios(username)',
        ') ENGINE=InnoDB DEFAULT CHARACTER SET ', @usuarios_charset,
        ' COLLATE ', @usuarios_collation
    ),
    'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
