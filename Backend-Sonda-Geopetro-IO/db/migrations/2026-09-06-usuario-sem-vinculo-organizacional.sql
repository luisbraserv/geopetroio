-- RN-064 — o usuario interno perde o vinculo organizacional.
-- Aplicar uma vez antes do deploy. Producao roda ddl-auto=validate, e as entidades ja nao
-- declaram estes mapeamentos.
--
-- Por que sai: desde 2026-08-27 nenhum destes campos influencia qualquer decisao do sistema. O que
-- decide visibilidade e a role (RN-047) e, para o cliente, a concessao explicita de unidades em
-- usuario_cliente_unidades (RN-048) — nenhuma das duas e tocada aqui.
--
-- ATENCAO: este script DESCARTA DADOS. As associacoes usuario->regional e usuario->setor sao
-- perdidas e nao ha caminho de volta. Nao ha backup do MySQL (decisao de 2026-09-05); se houver
-- qualquer intencao de consultar esses vinculos depois, exportar antes:
--   SELECT * FROM usuario_interno_regionais;
--   SELECT * FROM usuario_interno_setores;
--   SELECT username, regional_id FROM usuarios WHERE regional_id IS NOT NULL;

-- 1. Tabelas N:N do vinculo organizacional.
DROP TABLE IF EXISTS usuario_interno_regionais;
DROP TABLE IF EXISTS usuario_interno_setores;

-- 2. Regional principal. A FK precisa cair antes da coluna.
--    O nome vem do baseline em deploy/vm1-transacional/mysql-init/01-schema.sql, gerado pelo
--    Hibernate. Se o banco de producao divergir, conferir com:
--      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
--       WHERE TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'regional_id'
--         AND REFERENCED_TABLE_NAME IS NOT NULL;
ALTER TABLE usuarios DROP FOREIGN KEY FKa7afr4nsg9pwqh3chxe44pw6w;
ALTER TABLE usuarios DROP COLUMN regional_id;

-- Conferencia sugerida apos aplicar:
--   SHOW COLUMNS FROM usuarios LIKE 'regional_id';   -- deve vir vazio
--   SHOW TABLES LIKE 'usuario_interno_%';            -- deve vir vazio
