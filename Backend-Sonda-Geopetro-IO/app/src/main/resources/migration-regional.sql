-- =============================================================
-- MIGRATION: Criação da entidade Regional + dados iniciais
-- Executar ANTES de subir o backend com ddl-auto=validate (prod)
-- Em dev (ddl-auto=update), rodar apenas os passos de dados
-- =============================================================

-- PASSO 1: Criar tabela regionais
CREATE TABLE IF NOT EXISTS regionais (
    id           BIGINT NOT NULL AUTO_INCREMENT,
    nome         VARCHAR(255) NOT NULL,
    centro_custo VARCHAR(255),
    PRIMARY KEY (id),
    UNIQUE KEY uk_regionais_nome (nome)
);

-- PASSO 2: Inserir regionais padrão Braserv
INSERT INTO regionais (nome) VALUES
    ('Bahia'),
    ('Alagoinhas'),
    ('Sergipe'),
    ('Alagoas'),
    ('Espirito Santo'),
    ('Amazonas'),
    ('Rio Grande do Norte')
ON DUPLICATE KEY UPDATE nome = nome;

-- PASSO 3: Popular regionais a partir de valores distintos que já existam em setores.regional
INSERT INTO regionais (nome)
SELECT DISTINCT regional
FROM setores
WHERE regional IS NOT NULL
  AND regional <> ''
  AND regional NOT IN (SELECT nome FROM regionais)
ON DUPLICATE KEY UPDATE nome = nome;

-- PASSO 4: Adicionar coluna regional_id em setores (nullable temporariamente)
ALTER TABLE setores
    ADD COLUMN IF NOT EXISTS regional_id BIGINT NULL,
    ADD CONSTRAINT IF NOT EXISTS fk_setores_regional FOREIGN KEY (regional_id) REFERENCES regionais (id);

-- PASSO 5: Popular setores.regional_id com base no campo antigo setores.regional
UPDATE setores s
    JOIN regionais r ON r.nome = s.regional
SET s.regional_id = r.id
WHERE s.regional_id IS NULL;

-- PASSO 6: Aplicar NOT NULL em setores.regional_id (garantir que todos foram populados antes)
ALTER TABLE setores MODIFY COLUMN regional_id BIGINT NOT NULL;

-- PASSO 7: Remover coluna antiga setores.regional (após validar os dados)
-- ALTER TABLE setores DROP COLUMN regional;

-- PASSO 8: Adicionar coluna regional_id em projetos (nullable temporariamente)
ALTER TABLE projetos
    ADD COLUMN IF NOT EXISTS regional_id BIGINT NULL,
    ADD CONSTRAINT IF NOT EXISTS fk_projetos_regional FOREIGN KEY (regional_id) REFERENCES regionais (id);

-- PASSO 9: Popular projetos.regional_id a partir do setor atual do projeto
UPDATE projetos p
    JOIN setores s ON s.id = p.setor_id
SET p.regional_id = s.regional_id
WHERE p.regional_id IS NULL;

-- PASSO 10: Aplicar NOT NULL em projetos.regional_id
ALTER TABLE projetos MODIFY COLUMN regional_id BIGINT NOT NULL;

-- PASSO 11: Remover setor_id de projetos (após validar os dados)
-- ALTER TABLE projetos DROP FOREIGN KEY fk_projetos_setor;
-- ALTER TABLE projetos DROP COLUMN setor_id;

-- =============================================================
-- NOTA: unidades_sondas NÃO recebe regional_id diretamente.
-- A regional é derivada via: unidade -> setor -> regional
-- =============================================================
