-- Roles antigas sem regra de autorizacao sobreviveram em algumas bases anteriores
-- ao alinhamento backend/frontend (DT-011). O enum Java nao deve tentar materializa-las:
-- elas nunca concederam acesso e impedem ate a listagem dos demais usuarios.

DELETE FROM usuario_roles
 WHERE role NOT IN (
   'ADMIN',
   'CLIENTE',
   'INTERNO',
   'MONITORAMENTO',
   'MONITORAMENTO_REAL',
   'SIMULADOR',
   'CIMENTACAO',
   'UNIDADE',
   'SUPORTE'
 );
