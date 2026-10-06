-- =====================================================================
-- Braserv-Core — estrutura inicial (RN-115, RN-119).
--
-- As tabelas do cadastro organizacional e da identidade, como existiam no
-- Geopetro-Backend depois de V2026.10.02.1, com duas mudancas:
--   - unidades_sondas passa a se chamar unidades (RN-119);
--   - usuario_cliente_unidades.unidade_sonda_id passa a ser unidade_id.
--
-- NAO EXECUTADA em base que recebeu as tabelas pelo script de movimentacao
-- (deploy/vm-unica/core/mover-para-core.sql): o Flyway esta com
-- baseline-on-migrate nesta versao, e o script deixa o schema igual a este.
-- Em base vazia, cria tudo.
--
-- Spec: specs/SDD/software/backend/braserv-core.md
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE regionais (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  centro_custo VARCHAR(255) DEFAULT NULL,
  nome         VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_regionais_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE setores (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  regional_id  BIGINT       NOT NULL,
  centro_custo VARCHAR(255) DEFAULT NULL,
  nome         VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_setores_regional (regional_id),
  CONSTRAINT fk_setores_regional FOREIGN KEY (regional_id) REFERENCES regionais (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- nome e a chave de integracao com MQTT e InfluxDB (RN-018).
-- tipo: SONDA, UNIDADE_BOMBEIO, SLICKLINE_WIRELINE, CIMENTACAO, UCAQ (RN-065).
CREATE TABLE unidades (
  id       BIGINT       NOT NULL AUTO_INCREMENT,
  setor_id BIGINT       NOT NULL,
  apelido  VARCHAR(255) DEFAULT NULL,
  nome     VARCHAR(255) NOT NULL,
  tipo     VARCHAR(32)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_unidades_nome (nome),
  KEY idx_unidades_setor (setor_id),
  CONSTRAINT fk_unidades_setor FOREIGN KEY (setor_id) REFERENCES setores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE empresas (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  bairro      VARCHAR(255) DEFAULT NULL,
  cep         VARCHAR(255) DEFAULT NULL,
  cidade      VARCHAR(255) DEFAULT NULL,
  cnpj        VARCHAR(255) DEFAULT NULL,
  complemento VARCHAR(255) DEFAULT NULL,
  email       VARCHAR(255) DEFAULT NULL,
  estado      VARCHAR(255) DEFAULT NULL,
  logradouro  VARCHAR(255) DEFAULT NULL,
  nome        VARCHAR(255) NOT NULL,
  numero      VARCHAR(255) DEFAULT NULL,
  telefone    VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_empresas_cnpj (cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Uma tabela para as duas subclasses JPA, separadas por tipo_usuario.
CREATE TABLE usuarios (
  username     VARCHAR(255) NOT NULL,
  tipo_usuario VARCHAR(31)  NOT NULL,
  cliente_id   INT          DEFAULT NULL,
  matricula    INT          DEFAULT NULL,
  empresa_id   BIGINT       DEFAULT NULL,
  bairro       VARCHAR(255) DEFAULT NULL,
  cep          VARCHAR(255) DEFAULT NULL,
  cidade       VARCHAR(255) DEFAULT NULL,
  complemento  VARCHAR(255) DEFAULT NULL,
  email        VARCHAR(255) NOT NULL,
  empresa      VARCHAR(255) DEFAULT NULL,
  estado       VARCHAR(255) DEFAULT NULL,
  logradouro   VARCHAR(255) DEFAULT NULL,
  nome         VARCHAR(255) NOT NULL,
  numero       VARCHAR(255) DEFAULT NULL,
  password     VARCHAR(255) NOT NULL,
  telefone     VARCHAR(255) NOT NULL,
  status       ENUM('ATIVO','INATIVO') NOT NULL,
  PRIMARY KEY (username),
  KEY idx_usuarios_empresa (empresa_id),
  CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT ck_usuarios_tipo CHECK (tipo_usuario IN ('CLIENTE', 'INTERNO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- VARCHAR, e nao ENUM: uma role nova nao exige migration (DT-002).
CREATE TABLE usuario_roles (
  username VARCHAR(255) NOT NULL,
  role     VARCHAR(255) NOT NULL,
  PRIMARY KEY (username, role),
  CONSTRAINT fk_usuario_roles_usuario FOREIGN KEY (username) REFERENCES usuarios (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Concessao explicita de unidades ao cliente (RN-048).
CREATE TABLE usuario_cliente_unidades (
  unidade_id       BIGINT       NOT NULL,
  usuario_username VARCHAR(255) NOT NULL,
  PRIMARY KEY (unidade_id, usuario_username),
  KEY idx_usuario_cliente_unidades_usuario (usuario_username),
  CONSTRAINT fk_usuario_cliente_unidades_unidade FOREIGN KEY (unidade_id) REFERENCES unidades (id),
  CONSTRAINT fk_usuario_cliente_unidades_usuario FOREIGN KEY (usuario_username) REFERENCES usuarios (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- OQ-021: uma recuperacao por usuario; o token em si nunca e gravado.
CREATE TABLE recuperacao_senha (
  username        VARCHAR(255) NOT NULL,
  token_hash      VARCHAR(64)  NULL,
  credential_hash VARCHAR(64)  NOT NULL,
  issued_at       DATETIME(6)  NOT NULL,
  expires_at      DATETIME(6)  NOT NULL,
  PRIMARY KEY (username),
  UNIQUE KEY uk_recuperacao_token (token_hash),
  CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (username) REFERENCES usuarios (username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Linha unica (id = 1). A senha e gravada cifrada.
CREATE TABLE configuracao_smtp (
  id                 BIGINT        NOT NULL,
  version            BIGINT        NOT NULL,
  enabled            BOOLEAN       NOT NULL,
  host               VARCHAR(255)  NOT NULL,
  port               INT           NOT NULL,
  transport          VARCHAR(16)   NOT NULL,
  auth               BOOLEAN       NOT NULL,
  username           VARCHAR(255)  NOT NULL,
  password_encrypted VARCHAR(8192) NULL,
  sender_address     VARCHAR(255)  NOT NULL,
  frontend_url       VARCHAR(2048) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT ck_smtp_singleton CHECK (id = 1),
  CONSTRAINT ck_smtp_port CHECK (port BETWEEN 1 AND 65535)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
