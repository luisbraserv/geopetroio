-- Somente para instalacao NOVA, depois que os dois Flyways subiram.
-- O baseline historico do backend ainda cria estas tabelas para conseguir
-- migrar bancos antigos. Em uma base nova elas sao duplicatas vazias; este
-- script recusa remove-las se qualquer uma contiver dados.

DELIMITER //
DROP PROCEDURE IF EXISTS geopetro_io.remover_legado_vazio//
CREATE PROCEDURE geopetro_io.remover_legado_vazio()
BEGIN
  DECLARE linhas BIGINT DEFAULT 0;
  DECLARE tabelas INT DEFAULT 0;

  SELECT COUNT(*) INTO tabelas FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = 'geopetro_io'
     AND TABLE_NAME IN ('regionais', 'setores', 'unidades_sondas', 'empresas', 'usuarios',
                        'usuario_roles', 'usuario_cliente_unidades', 'recuperacao_senha',
                        'configuracao_smtp');
  IF tabelas <> 9 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esperadas as nove tabelas legadas em geopetro_io';
  END IF;

  SELECT (SELECT COUNT(*) FROM geopetro_io.regionais)
       + (SELECT COUNT(*) FROM geopetro_io.setores)
       + (SELECT COUNT(*) FROM geopetro_io.unidades_sondas)
       + (SELECT COUNT(*) FROM geopetro_io.empresas)
       + (SELECT COUNT(*) FROM geopetro_io.usuarios)
       + (SELECT COUNT(*) FROM geopetro_io.usuario_roles)
       + (SELECT COUNT(*) FROM geopetro_io.usuario_cliente_unidades)
       + (SELECT COUNT(*) FROM geopetro_io.recuperacao_senha)
       + (SELECT COUNT(*) FROM geopetro_io.configuracao_smtp)
    INTO linhas;
  IF linhas <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tabelas legadas contem dados; use mover-para-core.sql';
  END IF;

  DROP TABLE geopetro_io.usuario_cliente_unidades;
  DROP TABLE geopetro_io.usuario_roles;
  DROP TABLE geopetro_io.recuperacao_senha;
  DROP TABLE geopetro_io.usuarios;
  DROP TABLE geopetro_io.empresas;
  DROP TABLE geopetro_io.unidades_sondas;
  DROP TABLE geopetro_io.setores;
  DROP TABLE geopetro_io.regionais;
  DROP TABLE geopetro_io.configuracao_smtp;

  SELECT 'Tabelas legadas vazias removidas de geopetro_io' AS resultado;
END//
CALL geopetro_io.remover_legado_vazio()//
DROP PROCEDURE geopetro_io.remover_legado_vazio//
DELIMITER ;
