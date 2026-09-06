-- RN-065 — Unidade/Sonda ganha o campo `tipo`.
-- Aplicar uma vez antes do deploy: a entidade declara a coluna NOT NULL e producao roda
-- ddl-auto=validate, entao a aplicacao nao sobe sem este script.
--
-- ATENCAO: o passo 2 classifica TODAS as linhas existentes como SONDA. Esse e o padrao coerente
-- com a frota atual, mas a classificacao precisa ser conferida registro a registro na tela de
-- cadastro depois do deploy. Uma unidade de bombeio, slickline, cimentacao ou UCAQ marcada como
-- SONDA nao quebra nada hoje (o tipo e classificacao apenas — RN-074), mas fica errada no cadastro.

-- 1. Coluna nula, para a tabela existente aceitar a alteracao.
ALTER TABLE unidades_sondas
    ADD COLUMN tipo VARCHAR(32) NULL;

-- 2. Backfill. Conferir depois, registro a registro.
UPDATE unidades_sondas
   SET tipo = 'SONDA'
 WHERE tipo IS NULL;

-- 3. So agora torna obrigatoria, com o backfill garantindo que nao ha nulo.
ALTER TABLE unidades_sondas
    MODIFY COLUMN tipo VARCHAR(32) NOT NULL;

-- Conferencia sugerida apos aplicar:
--   SELECT tipo, COUNT(*) FROM unidades_sondas GROUP BY tipo;
