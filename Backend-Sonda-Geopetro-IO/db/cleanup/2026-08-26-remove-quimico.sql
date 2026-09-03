-- =====================================================================
-- Limpeza das tabelas do modulo `quimico`, removido do projeto em 2026-08-26.
--
-- ⚠️  NAO EXECUTADO AUTOMATICAMENTE. NAO EXECUTE SEM DECISAO EXPLICITA.
--
-- Estas tabelas contem DADOS DE NEGOCIO (estoque de quimicos, operacoes de
-- sonda, historico de movimentacoes). A remocao do codigo Java NAO as apaga,
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
-- Rode este bloco isoladamente e avalie o resultado.
-- ---------------------------------------------------------------------
-- SELECT 'quimicos'                AS tabela, COUNT(*) AS registros FROM quimicos
-- UNION ALL SELECT 'operacoes_sonda',         COUNT(*) FROM operacoes_sonda
-- UNION ALL SELECT 'movimentacoes_quimico',   COUNT(*) FROM movimentacoes_quimico
-- UNION ALL SELECT 'configuracoes_email',     COUNT(*) FROM configuracoes_email
-- UNION ALL SELECT 'alertas_email_quimico',   COUNT(*) FROM alertas_email_quimico;


-- ---------------------------------------------------------------------
-- PASSO 1 — Remocao. Descomente apenas apos backup e aprovacao.
-- ---------------------------------------------------------------------

-- -- Dependentes de `quimicos` e `operacoes_sonda`
-- DROP TABLE IF EXISTS movimentacoes_quimico;
--
-- -- Dependente de `quimicos` (PK composta quimicoId + tipo)
-- DROP TABLE IF EXISTS alertas_email_quimico;
--
-- -- Tabelas raiz do modulo
-- DROP TABLE IF EXISTS quimicos;
-- DROP TABLE IF EXISTS operacoes_sonda;
--
-- -- Configuracao SMTP (singleton id=1).
-- -- ⚠️  Continha a senha SMTP em TEXTO PURO (achado SEC-005).
-- --     Se a conta de e-mail ainda for usada em outro lugar, ROTACIONE a senha
-- --     antes ou depois de apagar — o valor esteve exposto no banco.
-- DROP TABLE IF EXISTS configuracoes_email;


-- ---------------------------------------------------------------------
-- Backup sugerido (rodar no shell, ANTES do PASSO 1)
-- ---------------------------------------------------------------------
-- mysqldump -u <user> -p geopetro_io \
--   quimicos operacoes_sonda movimentacoes_quimico \
--   configuracoes_email alertas_email_quimico \
--   > backup-quimico-$(date +%Y%m%d).sql
--
-- ⚠️  O dump conterá a senha SMTP em texto puro. Trate o arquivo como
--     material sensivel: armazene com acesso restrito e nao versione.
