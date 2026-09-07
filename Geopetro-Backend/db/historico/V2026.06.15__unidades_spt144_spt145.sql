-- =====================================================================
-- Migration: cadastro das unidades de sonda SPT-144 e SPT-145
-- Data: 2026-06-15
-- Banco: MySQL (geopetro_io)
--
-- CONTEXTO:
--   O projeto NAO usa Flyway/Liquibase. Script SQL IDEMPOTENTE (pode rodar
--   varias vezes sem erro). Rode manualmente via console do mysql com SOURCE
--   (NAO use pipe '<', que corrompe os acentos):
--     mysql -u<user> -p
--     USE geopetro_io;
--     SOURCE caminho/para/V2026.06.15__unidades_spt144_spt145.sql;
--
-- O QUE FAZ:
--   Garante as unidades SPT-144 e SPT-145 vinculadas ao setor
--   "Cimentacao Onshore" da regional BRASIL. Essas unidades correspondem
--   aos idSondaUnidade usados no seed de telemetria (InfluxDB).
-- =====================================================================

SET NAMES utf8mb4;

-- Regional e setor de destino (devem existir; ver V2026.06.02__base_regionais_setores.sql)
SET @brasil := (SELECT id FROM regionais WHERE nome = 'BRASIL' LIMIT 1);
SET @setor  := (SELECT id FROM setores
                 WHERE nome = 'Cimentação Onshore' AND regional_id = @brasil
                 LIMIT 1);

-- SPT-144 (coluna nome e UNIQUE -> idempotente via NOT EXISTS)
INSERT INTO unidades_sondas (nome, apelido, setor_id)
SELECT 'SPT-144', 'SPT-144', @setor
 WHERE @setor IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM unidades_sondas WHERE nome = 'SPT-144');

-- SPT-145
INSERT INTO unidades_sondas (nome, apelido, setor_id)
SELECT 'SPT-145', 'SPT-145', @setor
 WHERE @setor IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM unidades_sondas WHERE nome = 'SPT-145');
