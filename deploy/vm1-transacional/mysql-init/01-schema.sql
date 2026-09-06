-- =====================================================================
-- GeopetroIO — schema base do Backend-Sonda-Geopetro-IO
--
-- GERADO AUTOMATICAMENTE a partir das entidades JPA, com Hibernate
-- `ddl-auto=create` contra um MySQL 8 real, exportado via mysqldump e
-- validado por replay em base limpa.
--
-- Ultima geracao: 2026-08-27 (inclui usuario_cliente_unidades).
--
-- POR QUE ISTO EXISTE
-- O projeto nao usa Flyway/Liquibase, e em producao roda com
-- `ddl-auto=validate` — ou seja, o Hibernate NAO cria tabelas. Sem este
-- script, uma base nova faz a aplicacao falhar no startup.
--
-- COMO USAR
--   Base NOVA  : montado em /docker-entrypoint-initdb.d do MySQL, roda
--                automaticamente na primeira inicializacao.
--   Base EXISTENTE: NAO rode este script. A base ja foi criada e
--                evoluida pelos scripts manuais em
--                app/src/main/resources/db/migration/.
--
-- REGERAR apos mudar entidades: ver deploy/README.md.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `empresas` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `bairro` varchar(255) DEFAULT NULL,
  `cep` varchar(255) DEFAULT NULL,
  `cidade` varchar(255) DEFAULT NULL,
  `cnpj` varchar(255) DEFAULT NULL,
  `complemento` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `estado` varchar(255) DEFAULT NULL,
  `logradouro` varchar(255) DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `numero` varchar(255) DEFAULT NULL,
  `telefone` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_empresas_cnpj` (`cnpj`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `regionais` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `centro_custo` varchar(255) DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK27ug0675i7skbpmaolxrr5m71` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `setores` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `regional_id` bigint NOT NULL,
  `centro_custo` varchar(255) DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKdaoqxjeweusut60l4wlxhfalk` (`regional_id`),
  CONSTRAINT `FKdaoqxjeweusut60l4wlxhfalk` FOREIGN KEY (`regional_id`) REFERENCES `regionais` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `simulador_cenarios` (
  `atualizado_em` datetime(6) DEFAULT NULL,
  `criado_em` datetime(6) DEFAULT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `pasta_id` bigint DEFAULT NULL,
  `operacao` varchar(16) NOT NULL,
  `criado_por` varchar(255) NOT NULL,
  `dados_relatorio` text,
  `form_value` longtext NOT NULL,
  `nome` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKo2oxcdj2f53nycoyxvc6ec9sm` (`pasta_id`),
  CONSTRAINT `FKo2oxcdj2f53nycoyxvc6ec9sm` FOREIGN KEY (`pasta_id`) REFERENCES `simulador_pastas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `simulador_pastas` (
  `atualizado_em` datetime(6) DEFAULT NULL,
  `criado_em` datetime(6) DEFAULT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `operacao` varchar(16) NOT NULL,
  `criado_por` varchar(255) NOT NULL,
  `nome` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `unidades_sondas` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `setor_id` bigint NOT NULL,
  `apelido` varchar(255) DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `tipo` varchar(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKln8rnjb60cn2frjnoob74q110` (`nome`),
  KEY `FKay59q47mja5hq9l9cw8rdkvmh` (`setor_id`),
  CONSTRAINT `FKay59q47mja5hq9l9cw8rdkvmh` FOREIGN KEY (`setor_id`) REFERENCES `setores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `usuario_cliente_unidades` (
  `unidade_sonda_id` bigint NOT NULL,
  `usuario_username` varchar(255) NOT NULL,
  PRIMARY KEY (`unidade_sonda_id`,`usuario_username`),
  KEY `FK60eg0254huo3mc1m5tyt9tn00` (`usuario_username`),
  CONSTRAINT `FK3fh8el8mvqf0e92hjgw6dkjiq` FOREIGN KEY (`unidade_sonda_id`) REFERENCES `unidades_sondas` (`id`),
  CONSTRAINT `FK60eg0254huo3mc1m5tyt9tn00` FOREIGN KEY (`usuario_username`) REFERENCES `usuarios` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `usuario_roles` (
  `username` varchar(255) NOT NULL,
  `role` enum('ADMIN','CIMENTACAO','CLIENTE','DIRETORIA','GERENCIA','INTERNO','SONDA') NOT NULL,
  PRIMARY KEY (`username`,`role`),
  CONSTRAINT `FKltnd1rua3ci56cwufk7mrgnkv` FOREIGN KEY (`username`) REFERENCES `usuarios` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `usuarios` (
  `cliente_id` int DEFAULT NULL,
  `matricula` int DEFAULT NULL,
  `empresa_id` bigint DEFAULT NULL,
  `tipo_usuario` varchar(31) NOT NULL,
  `bairro` varchar(255) DEFAULT NULL,
  `cep` varchar(255) DEFAULT NULL,
  `cidade` varchar(255) DEFAULT NULL,
  `complemento` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `empresa` varchar(255) DEFAULT NULL,
  `estado` varchar(255) DEFAULT NULL,
  `logradouro` varchar(255) DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `numero` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `telefone` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `status` enum('ATIVO','INATIVO') NOT NULL,
  PRIMARY KEY (`username`),
  KEY `FK9v93lqnass5yqhhsyprr9fdv2` (`empresa_id`),
  CONSTRAINT `FK9v93lqnass5yqhhsyprr9fdv2` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `usuarios_chk_1` CHECK ((`tipo_usuario` in (_utf8mb4'CLIENTE',_utf8mb4'INTERNO')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Complemento manual 2026-09-05: Poco e vinculo opcional dos cenarios.
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
