-- =====================================================================
-- Acesso por MODULO: SONDA, GERENCIA e DIRETORIA saem; MONITORAMENTO,
-- MONITORAMENTO_REAL e SIMULADOR entram.
--
-- IDEMPOTENTE (INSERT IGNORE + DELETE por valor).
--
-- POR QUE ESTE SCRIPT PRECISA EXISTIR
-- Tres valores deixaram de existir no enum Java `Role`. Uma linha remanescente
-- com 'SONDA' faria `valueOf` estourar ao carregar o usuario — o erro
-- apareceria no login, longe da causa. Converter e obrigatorio, nao cosmetico.
--
-- A coluna ja e VARCHAR(255) desde V2026.09.07.3 (em producao, desde
-- V2026.06.04), entao os valores novos nao exigem ALTER. Ver DT-002.
--
-- O QUE MUDOU NA SEMANTICA
-- Antes: uma role da lista bastava — quem tinha CLIENTE via monitoramento,
--        quem tinha CIMENTACAO usava o simulador.
-- Agora: tipo de conta (CLIENTE/INTERNO) + permissao de modulo
--        (MONITORAMENTO, MONITORAMENTO_REAL, SIMULADOR, CIMENTACAO).
--        Ver com.geopetro.security.authorization.RegrasDeAcesso.
--
-- ⚠️ ESTE SCRIPT CONCEDE, E ISSO E DELIBERADO
-- Sem conceder, todo cliente e todo perfil operacional perderia no deploy o que
-- usava ontem, e so um ADMIN reabrindo cada cadastro devolveria. A conversao
-- abaixo reproduz EXATAMENTE o alcance anterior de cada role — nada mais.
-- Quem nao deveria ter tempo real precisa ser ajustado no cadastro depois; para
-- conferir quem ficou com o que:
--   SELECT username, GROUP_CONCAT(role ORDER BY role) FROM usuario_roles
--    GROUP BY username;
-- Para revogar o tempo real de um usuario:
--   DELETE FROM usuario_roles WHERE username = ? AND role = 'MONITORAMENTO_REAL';
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 0. Todo usuario precisa do seu tipo de conta explicito
--
-- Nenhuma permissao de modulo concede nada sozinha: ela vale somada a CLIENTE
-- ou INTERNO. Cadastros antigos podem ter apenas a role operacional — o tipo
-- passou a ser aplicado na gravacao, mas quem foi gravado antes disso nao
-- voltou a passar por lá. Sem este passo, esse usuario sobreviveria a migracao
-- com permissao de modulo e nenhum acesso, e o sintoma ("nao vejo mais nada")
-- nao apontaria para a causa.
--
-- A verdade do tipo esta no discriminador da tabela `usuarios`, nao na role:
-- ele decide qual subclasse o JPA instancia.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO usuario_roles (username, role)
SELECT u.username, u.tipo_usuario
  FROM usuarios u
 WHERE u.tipo_usuario IN ('CLIENTE', 'INTERNO');

-- ---------------------------------------------------------------------
-- 1. Area Sonda/Unidade
--
-- ROLES_MONITORAMENTO era {ADMIN, SONDA, CIMENTACAO, GERENCIA, DIRETORIA,
-- CLIENTE}, e cobria as quatro telas de uma vez: monitoramento, tempo real,
-- limites de alarme e historico. Por isso as duas permissoes novas, e nao so
-- MONITORAMENTO: conceder apenas a primeira tiraria o tempo real de quem ja o
-- acompanha. ADMIN nao aparece aqui porque atravessa as regras sem permissao
-- de modulo.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO usuario_roles (username, role)
SELECT origem.username, 'MONITORAMENTO'
  FROM (SELECT DISTINCT username FROM usuario_roles
         WHERE role IN ('SONDA', 'GERENCIA', 'DIRETORIA', 'CIMENTACAO', 'CLIENTE')) AS origem;

INSERT IGNORE INTO usuario_roles (username, role)
SELECT origem.username, 'MONITORAMENTO_REAL'
  FROM (SELECT DISTINCT username FROM usuario_roles
         WHERE role IN ('SONDA', 'GERENCIA', 'DIRETORIA', 'CIMENTACAO', 'CLIENTE')) AS origem;

-- ---------------------------------------------------------------------
-- 2. Simulador
--
-- ROLES_SIMULADOR era {ADMIN, CIMENTACAO, GERENCIA, DIRETORIA}. O simulador
-- passou a exigir SIMULADOR (a area) + CIMENTACAO (qual simulador), porque
-- outros simuladores estao previstos. Quem entrava por GERENCIA ou DIRETORIA
-- precisa das duas; quem entrava por CIMENTACAO ja tem a segunda.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO usuario_roles (username, role)
SELECT origem.username, 'SIMULADOR'
  FROM (SELECT DISTINCT username FROM usuario_roles
         WHERE role IN ('CIMENTACAO', 'GERENCIA', 'DIRETORIA')) AS origem;

INSERT IGNORE INTO usuario_roles (username, role)
SELECT origem.username, 'CIMENTACAO'
  FROM (SELECT DISTINCT username FROM usuario_roles
         WHERE role IN ('GERENCIA', 'DIRETORIA')) AS origem;

-- ---------------------------------------------------------------------
-- 3. As tres roles extintas saem
--
-- Vem DEPOIS das concessoes, de proposito: os passos acima leem justamente
-- estas linhas para decidir quem recebe o que.
--
-- Nenhum usuario e apagado e nenhum fica sem role: o tipo de conta
-- (CLIENTE/INTERNO) vive em outra linha e nao e tocado aqui.
-- ---------------------------------------------------------------------
DELETE FROM usuario_roles WHERE role IN ('SONDA', 'GERENCIA', 'DIRETORIA');

-- Conferencia sugerida apos aplicar (deve devolver 0):
--   SELECT COUNT(*) FROM usuario_roles
--    WHERE role IN ('SONDA', 'GERENCIA', 'DIRETORIA');
