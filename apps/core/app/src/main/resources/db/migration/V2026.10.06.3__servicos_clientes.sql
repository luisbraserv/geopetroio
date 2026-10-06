-- =====================================================================
-- RN-117 — sistemas que chamam as rotas internas do Braserv-Core.
--
-- Cada sistema troca id + segredo por um token de servico de 15 min, com
-- os escopos daqui. O segredo nunca e gravado, so o hash BCrypt; ele e
-- mostrado uma unica vez, quando e gerado.
--
-- Spec: specs/SDD/software/backend/braserv-core.md, secao 6.5.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE servicos_clientes (
  id            VARCHAR(64)   NOT NULL,
  nome          VARCHAR(255)  NOT NULL,
  segredo_hash  VARCHAR(255)  NOT NULL,
  escopos       VARCHAR(1024) NOT NULL,
  ativo         BOOLEAN       NOT NULL,
  criado_em     DATETIME(6)   NOT NULL,
  atualizado_em DATETIME(6)   NOT NULL,
  ultimo_uso_em DATETIME(6)   NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
