-- =====================================================================
-- Migration: base de Regionais e Setores + correcao de orfaos
-- Data: 2026-06-02
-- Banco: MySQL (geopetro_io)
--
-- CONTEXTO:
--   O projeto NAO usa Flyway/Liquibase. Esta migration e um script SQL
--   IDEMPOTENTE (pode rodar varias vezes sem erro). Rode manualmente em
--   producao ANTES de subir a aplicacao:
--     mysql -u<user> -p <database> < V2026.06.02__base_regionais_setores.sql
--
-- O QUE RESOLVE:
--   1. Garante as Regionais cadastradas (inclui BRASIL).
--   2. Garante os Setores de BRASIL: "Cimentacao Onshore" e "Cimentacao Offshore".
--   3. Corrige registros orfaos com regional_id = 0 / NULL / inexistente
--      (que causavam 500 ao listar projetos e setores, pois
--       ProjetoResponse/SetorResponse fazem getRegional().getId() em
--       um regional que nao existe).
--   4. Atribui Regional BRASIL a todo usuario INTERNO sem regional.
--   5. Remove setores duplicados (mesmo nome + regional), repontando refs.
--   6. Cria as FKs de regional (que estavam faltando) para impedir
--      que regional_id invalido volte a entrar.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1) Regionais (nome e UNIQUE -> INSERT IGNORE nao duplica)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO regionais (nome, centro_custo) VALUES
    ('AMAZONAS', NULL),
    ('BAHIA', NULL),
    ('ESPIRITO SANTO', NULL),
    ('ALAGOAS', NULL),
    ('SERGIPE', NULL),
    ('RIO GRANDE DO NORTE', NULL),
    ('BRASIL', NULL);

-- Id da regional BRASIL (referencia para os passos seguintes)
SET @brasil := (SELECT id FROM regionais WHERE nome = 'BRASIL' LIMIT 1);

-- ---------------------------------------------------------------------
-- 2) Corrige orfaos (regional_id = 0 / NULL / inexistente) -> BRASIL
--    Feito ANTES de inserir/deduplicar setores, para nao gerar copias.
-- ---------------------------------------------------------------------
UPDATE setores
   SET regional_id = @brasil
 WHERE regional_id IS NULL
    OR regional_id = 0
    OR regional_id NOT IN (SELECT id FROM regionais);

UPDATE projetos
   SET regional_id = @brasil
 WHERE regional_id IS NULL
    OR regional_id = 0
    OR regional_id NOT IN (SELECT id FROM regionais);

UPDATE usuarios
   SET regional_id = @brasil
 WHERE tipo_usuario = 'INTERNO'
   AND ( regional_id IS NULL
      OR regional_id = 0
      OR regional_id NOT IN (SELECT id FROM regionais) );

-- ---------------------------------------------------------------------
-- 3) Setores de BRASIL (idempotente: so insere se ainda nao existir)
-- ---------------------------------------------------------------------
INSERT INTO setores (nome, centro_custo, regional_id)
SELECT 'Cimentação Onshore', '10507', @brasil
 WHERE NOT EXISTS (
     SELECT 1 FROM setores WHERE nome = 'Cimentação Onshore' AND regional_id = @brasil
 );

INSERT INTO setores (nome, centro_custo, regional_id)
SELECT 'Cimentação Offshore', '10510', @brasil
 WHERE NOT EXISTS (
     SELECT 1 FROM setores WHERE nome = 'Cimentação Offshore' AND regional_id = @brasil
 );

-- ---------------------------------------------------------------------
-- 4) Deduplica setores (mesmo nome + regional): mantem o menor id e
--    reaponta todas as referencias para ele antes de apagar as copias.
-- ---------------------------------------------------------------------
-- 4.1 reaponta referencias
UPDATE unidades_sondas u
  JOIN setores s ON u.setor_id = s.id
  JOIN (SELECT nome, regional_id, MIN(id) AS keep_id FROM setores GROUP BY nome, regional_id) c
    ON s.nome = c.nome AND s.regional_id = c.regional_id
   SET u.setor_id = c.keep_id
 WHERE u.setor_id <> c.keep_id;

UPDATE projetos p
  JOIN setores s ON p.setor_id = s.id
  JOIN (SELECT nome, regional_id, MIN(id) AS keep_id FROM setores GROUP BY nome, regional_id) c
    ON s.nome = c.nome AND s.regional_id = c.regional_id
   SET p.setor_id = c.keep_id
 WHERE p.setor_id <> c.keep_id;

UPDATE usuarios us
  JOIN setores s ON us.setor_id = s.id
  JOIN (SELECT nome, regional_id, MIN(id) AS keep_id FROM setores GROUP BY nome, regional_id) c
    ON s.nome = c.nome AND s.regional_id = c.regional_id
   SET us.setor_id = c.keep_id
 WHERE us.setor_id <> c.keep_id;

-- tabela legada de relacao N:N (pode gerar par repetido -> limpamos depois)
UPDATE usuario_interno_setores uis
  JOIN setores s ON uis.setor_id = s.id
  JOIN (SELECT nome, regional_id, MIN(id) AS keep_id FROM setores GROUP BY nome, regional_id) c
    ON s.nome = c.nome AND s.regional_id = c.regional_id
   SET uis.setor_id = c.keep_id
 WHERE uis.setor_id <> c.keep_id;

-- remove pares duplicados surgidos no reapontamento (tabela legada sem PK):
-- reconstrui o conteudo com DISTINCT
CREATE TEMPORARY TABLE tmp_uis AS
    SELECT DISTINCT usuario_username, setor_id FROM usuario_interno_setores;
DELETE FROM usuario_interno_setores;
INSERT INTO usuario_interno_setores (usuario_username, setor_id)
    SELECT usuario_username, setor_id FROM tmp_uis;
DROP TEMPORARY TABLE tmp_uis;

-- 4.2 apaga as copias (mantendo o menor id por nome+regional)
DELETE s FROM setores s
  JOIN (SELECT nome, regional_id, MIN(id) AS keep_id FROM setores GROUP BY nome, regional_id) c
    ON s.nome = c.nome AND s.regional_id = c.regional_id
 WHERE s.id <> c.keep_id;

-- ---------------------------------------------------------------------
-- 5) Cria as FKs de regional que faltavam (guardado para nao falhar em re-run)
-- ---------------------------------------------------------------------
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'setores' AND CONSTRAINT_NAME = 'fk_setores_regional');
SET @sql := IF(@fk = 0,
  'ALTER TABLE setores ADD CONSTRAINT fk_setores_regional FOREIGN KEY (regional_id) REFERENCES regionais(id)',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'projetos' AND CONSTRAINT_NAME = 'fk_projetos_regional');
SET @sql := IF(@fk = 0,
  'ALTER TABLE projetos ADD CONSTRAINT fk_projetos_regional FOREIGN KEY (regional_id) REFERENCES regionais(id)',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
