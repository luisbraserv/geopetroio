-- =====================================================================
-- RN-056 / RN-076 — log de eventos de alarme, append-only.
--
-- IDEMPOTENTE.
--
-- Esta e a UNICA fatia do sistema orientada a eventos. O resto segue CRUD
-- com JPA, e nada migra. O que se quer guardar aqui ja e uma sequencia de
-- fatos: uma excursao que atravessa a atencao e chega a critica e UM
-- episodio que escala, e a escalada e mais um fato, nao um UPDATE.
--
-- Sem version e sem coluna de atualizacao: nao ha o que atualizar.
--
-- ATENCAO: um evento por EXCURSAO, nao por leitura. A 1 leitura/s, uma
-- pressao dez minutos acima do limite geraria 600 registros. O que entra
-- aqui e a transicao: ABRIU, ESCALOU, REDUZIU, FECHOU.
--
-- serie e NULA para card de uma grandeza so. Num CONTADOR_STROKE ela
-- distingue as tres series que compartilham o dispositivoId (RN-098) --
-- sem ela, o limite de vazao e o de volume acumulado colidiriam.
--
-- FK sem cascata: o historico de alarmes impede a exclusao da unidade
-- (RN-063), como a configuracao de limites e a de cards ja fazem.
--
-- ATENCAO: o log cresce sem parar e NAO TEM POLITICA DE RETENCAO. A de
-- 5 anos vale para a serie de telemetria e nao foi discutida para
-- alarmes -- ver alarmes.md secao 7, item 1.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS evento_alarme (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    episodio_id      CHAR(36)     NOT NULL,
    unidade_sonda_id BIGINT       NOT NULL,
    dispositivo_id   VARCHAR(64)  NOT NULL,
    serie            VARCHAR(32)  NULL,
    tipo             VARCHAR(16)  NOT NULL,
    severidade       VARCHAR(16)  NOT NULL,
    ocorrido_em      DATETIME(6)  NOT NULL,
    valor            DOUBLE       NOT NULL,
    limite_violado   VARCHAR(8)   NOT NULL,
    PRIMARY KEY (id),
    -- A tela de historico le por unidade e periodo; a reconstrucao da projecao, por episodio.
    KEY idx_evento_alarme_unidade (unidade_sonda_id, ocorrido_em),
    KEY idx_evento_alarme_episodio (episodio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'evento_alarme'
              AND CONSTRAINT_NAME = 'fk_evento_alarme_unidade');
SET @sql := IF(@fk = 0,
  'ALTER TABLE evento_alarme ADD CONSTRAINT fk_evento_alarme_unidade
     FOREIGN KEY (unidade_sonda_id) REFERENCES unidades_sondas (id) ON DELETE RESTRICT',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
