-- =====================================================================
-- Limpeza das tabelas dos modulos `projeto`, `processo` e `observacao`,
-- removidos do projeto em 2026-08-26.
--
-- ⚠️  NAO EXECUTADO AUTOMATICAMENTE. NAO EXECUTE SEM DECISAO EXPLICITA.
--
-- Estas tabelas contem DADOS DE NEGOCIO (projetos, processos operacionais,
-- anotacoes e observacoes de setor). A remocao do codigo Java NAO as apaga,
-- e elas NAO quebram a aplicacao: `ddl-auto=validate` verifica apenas que as
-- entidades mapeadas possuem tabela correspondente, ignorando tabelas extras.
--
-- Antes de rodar:
--   1. Confirme com a area de negocio que os dados nao serao mais necessarios.
--   2. Faca dump das tabelas (comando sugerido no rodape).
--   3. Rode primeiro em homologacao.
--
-- Ordem de exclusao respeita as FKs: dependentes primeiro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASSO 0 (RECOMENDADO) — Inspecione o volume antes de apagar.
-- ---------------------------------------------------------------------
-- SELECT 'projetos'     AS tabela, COUNT(*) AS registros FROM projetos
-- UNION ALL SELECT 'processos',    COUNT(*) FROM processos
-- UNION ALL SELECT 'anotacoes',    COUNT(*) FROM anotacoes
-- UNION ALL SELECT 'observacoes',  COUNT(*) FROM observacoes;


-- ---------------------------------------------------------------------
-- PASSO 1 — Remocao. Descomente apenas apos backup e aprovacao.
-- ---------------------------------------------------------------------

-- -- Dependente de `processos` (FK processo_id, cascade a partir do processo)
-- DROP TABLE IF EXISTS anotacoes;
--
-- -- Dependente de setores, unidades_sondas, projetos e usuarios
-- DROP TABLE IF EXISTS processos;
--
-- -- Dependente de setores e usuarios
-- DROP TABLE IF EXISTS observacoes;
--
-- -- Dependente de regionais e usuarios
-- DROP TABLE IF EXISTS projetos;


-- ---------------------------------------------------------------------
-- PASSO 2 (OPCIONAL) — Vinculo N:N usuario x setor.
--
-- ⚠️  AVALIE COM CUIDADO. A tabela `usuario_interno_setores` foi criada
--     para o modelo de usuario e NAO pertence exclusivamente aos modulos
--     removidos. Hoje ela nao e usada pelo controle de acesso (que olha
--     apenas a regional principal — ver RN-013), mas o cadastro de usuario
--     ainda grava e le esses vinculos.
--
--     NAO APAGUE sem antes decidir OQ-002 (multiplas regionais/setores
--     devem valer para autorizacao?). Se a resposta for "sim", esta tabela
--     volta a ser essencial.
-- ---------------------------------------------------------------------
-- -- DROP TABLE IF EXISTS usuario_interno_setores;   <-- NAO recomendado agora


-- ---------------------------------------------------------------------
-- Backup sugerido (rodar no shell, ANTES do PASSO 1)
-- ---------------------------------------------------------------------
-- mysqldump -u <user> -p geopetro_io \
--   projetos processos anotacoes observacoes \
--   > backup-operacao-$(date +%Y%m%d).sql
