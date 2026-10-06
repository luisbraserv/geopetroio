-- =====================================================================
-- Move os nove cadastros de geopetro_io para braserv_core (D-5).
--
-- Execute UMA VEZ, como root, com backend e core parados. O script falha
-- antes do RENAME se a origem estiver incompleta ou se o destino contiver
-- qualquer tabela. As contagens capturadas antes da mudanca sao conferidas
-- depois dela. MySQL 8 e obrigatorio.
-- =====================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS geopetro_io.mover_para_braserv_core//
CREATE PROCEDURE geopetro_io.mover_para_braserv_core()
BEGIN
  DECLARE tabelas_origem INT DEFAULT 0;
  DECLARE tabelas_destino INT DEFAULT 0;
  DECLARE fk_nome VARCHAR(64);
  DECLARE c_regionais, c_setores, c_unidades, c_empresas, c_usuarios BIGINT DEFAULT 0;
  DECLARE c_roles, c_concessoes, c_recuperacao, c_smtp BIGINT DEFAULT 0;

  IF NOT EXISTS (SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'braserv_core') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Database braserv_core nao existe';
  END IF;

  SELECT COUNT(*) INTO tabelas_origem
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = 'geopetro_io'
     AND TABLE_TYPE = 'BASE TABLE'
     AND TABLE_NAME IN ('regionais', 'setores', 'unidades_sondas', 'empresas', 'usuarios',
                        'usuario_roles', 'usuario_cliente_unidades', 'recuperacao_senha',
                        'configuracao_smtp');
  IF tabelas_origem <> 9 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Origem incompleta: esperadas as nove tabelas do core em geopetro_io';
  END IF;

  SELECT COUNT(*) INTO tabelas_destino
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = 'braserv_core' AND TABLE_TYPE = 'BASE TABLE';
  IF tabelas_destino <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Destino nao esta vazio: nenhuma tabela pode existir em braserv_core';
  END IF;

  SELECT COUNT(*) INTO c_regionais FROM geopetro_io.regionais;
  SELECT COUNT(*) INTO c_setores FROM geopetro_io.setores;
  SELECT COUNT(*) INTO c_unidades FROM geopetro_io.unidades_sondas;
  SELECT COUNT(*) INTO c_empresas FROM geopetro_io.empresas;
  SELECT COUNT(*) INTO c_usuarios FROM geopetro_io.usuarios;
  SELECT COUNT(*) INTO c_roles FROM geopetro_io.usuario_roles;
  SELECT COUNT(*) INTO c_concessoes FROM geopetro_io.usuario_cliente_unidades;
  SELECT COUNT(*) INTO c_recuperacao FROM geopetro_io.recuperacao_senha;
  SELECT COUNT(*) INTO c_smtp FROM geopetro_io.configuracao_smtp;

  -- Remove todas as FKs das quatro colunas que passam a referenciar ids do core.
  -- O nome e descoberto porque bases antigas podem ter recebido nomes diferentes.
  SELECT CONSTRAINT_NAME INTO fk_nome FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = 'geopetro_io' AND TABLE_NAME = 'configuracao_sonda'
     AND COLUMN_NAME IN ('unidade_sonda_id', 'unidade_id') AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1;
  IF fk_nome IS NOT NULL THEN
    SET @sql = CONCAT('ALTER TABLE geopetro_io.configuracao_sonda DROP FOREIGN KEY `', REPLACE(fk_nome, '`', '``'), '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;

  SET fk_nome = NULL;
  SELECT CONSTRAINT_NAME INTO fk_nome FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = 'geopetro_io' AND TABLE_NAME = 'configuracao_cards'
     AND COLUMN_NAME IN ('unidade_sonda_id', 'unidade_id') AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1;
  IF fk_nome IS NOT NULL THEN
    SET @sql = CONCAT('ALTER TABLE geopetro_io.configuracao_cards DROP FOREIGN KEY `', REPLACE(fk_nome, '`', '``'), '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;

  SET fk_nome = NULL;
  SELECT CONSTRAINT_NAME INTO fk_nome FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = 'geopetro_io' AND TABLE_NAME = 'evento_alarme'
     AND COLUMN_NAME IN ('unidade_sonda_id', 'unidade_id') AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1;
  IF fk_nome IS NOT NULL THEN
    SET @sql = CONCAT('ALTER TABLE geopetro_io.evento_alarme DROP FOREIGN KEY `', REPLACE(fk_nome, '`', '``'), '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;

  SET fk_nome = NULL;
  SELECT CONSTRAINT_NAME INTO fk_nome FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = 'geopetro_io' AND TABLE_NAME = 'episodio_alarme_extremo'
     AND COLUMN_NAME IN ('unidade_sonda_id', 'unidade_id') AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1;
  IF fk_nome IS NOT NULL THEN
    SET @sql = CONCAT('ALTER TABLE geopetro_io.episodio_alarme_extremo DROP FOREIGN KEY `', REPLACE(fk_nome, '`', '``'), '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;

  RENAME TABLE
    geopetro_io.regionais TO braserv_core.regionais,
    geopetro_io.setores TO braserv_core.setores,
    geopetro_io.unidades_sondas TO braserv_core.unidades,
    geopetro_io.empresas TO braserv_core.empresas,
    geopetro_io.usuarios TO braserv_core.usuarios,
    geopetro_io.usuario_roles TO braserv_core.usuario_roles,
    geopetro_io.usuario_cliente_unidades TO braserv_core.usuario_cliente_unidades,
    geopetro_io.recuperacao_senha TO braserv_core.recuperacao_senha,
    geopetro_io.configuracao_smtp TO braserv_core.configuracao_smtp;

  ALTER TABLE braserv_core.usuario_cliente_unidades
    RENAME COLUMN unidade_sonda_id TO unidade_id;

  SELECT COUNT(*) INTO tabelas_origem
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = 'geopetro_io'
     AND TABLE_NAME IN ('regionais', 'setores', 'unidades_sondas', 'empresas', 'usuarios',
                        'usuario_roles', 'usuario_cliente_unidades', 'recuperacao_senha',
                        'configuracao_smtp');
  IF tabelas_origem <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha na conferencia: tabelas ainda existem na origem';
  END IF;

  IF c_regionais <> (SELECT COUNT(*) FROM braserv_core.regionais)
     OR c_setores <> (SELECT COUNT(*) FROM braserv_core.setores)
     OR c_unidades <> (SELECT COUNT(*) FROM braserv_core.unidades)
     OR c_empresas <> (SELECT COUNT(*) FROM braserv_core.empresas)
     OR c_usuarios <> (SELECT COUNT(*) FROM braserv_core.usuarios)
     OR c_roles <> (SELECT COUNT(*) FROM braserv_core.usuario_roles)
     OR c_concessoes <> (SELECT COUNT(*) FROM braserv_core.usuario_cliente_unidades)
     OR c_recuperacao <> (SELECT COUNT(*) FROM braserv_core.recuperacao_senha)
     OR c_smtp <> (SELECT COUNT(*) FROM braserv_core.configuracao_smtp) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha na conferencia das contagens apos a movimentacao';
  END IF;

  SELECT 'Movimentacao concluida e contagens conferidas' AS resultado,
         c_regionais AS regionais, c_setores AS setores, c_unidades AS unidades,
         c_empresas AS empresas, c_usuarios AS usuarios, c_roles AS roles,
         c_concessoes AS concessoes, c_recuperacao AS recuperacoes, c_smtp AS smtp;
END//

CALL geopetro_io.mover_para_braserv_core()//
DROP PROCEDURE geopetro_io.mover_para_braserv_core//

DELIMITER ;
