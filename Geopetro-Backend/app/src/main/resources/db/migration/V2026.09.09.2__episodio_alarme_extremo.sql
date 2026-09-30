-- =====================================================================
-- RN-076 — o pior valor de cada episodio de alarme.
--
-- IDEMPOTENTE.
--
-- POR QUE NAO E UMA COLUNA DE evento_alarme: aquele log guarda TRANSICOES
-- e nao se altera. O pico costuma acontecer ENTRE duas transicoes -- 130
-- abre, 200 nao muda severidade e nao gera fato, 90 fecha -- entao ler o
-- extremo dos fatos devolveria 130 e subestimaria a excursao.
--
-- Uma linha por episodio, ATUALIZADA enquanto ele durar. Isso responde as
-- duas perguntas que o log sozinho nao responde:
--   1. o historico de um episodio ja fechado (ate onde chegou?);
--   2. a reconstrucao da projecao depois de um reinicio, sem reduzir o
--      extremo ao valor do ultimo fato gravado.
--
-- A linha SOBREVIVE ao FECHOU: e ela que o historico le meses depois.
--
-- Volume: uma linha por excursao, contra pelo menos duas do log de fatos.
-- A retencao segue a mesma pendencia de evento_alarme -- ver alarmes.md.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS episodio_alarme_extremo (
    episodio_id      CHAR(36)     NOT NULL,
    unidade_sonda_id BIGINT       NOT NULL,
    valor            DOUBLE       NOT NULL,
    limite_violado   VARCHAR(8)   NOT NULL,
    atualizado_em    DATETIME(6)  NOT NULL,
    PRIMARY KEY (episodio_id),
    KEY idx_episodio_extremo_unidade (unidade_sonda_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'episodio_alarme_extremo'
              AND CONSTRAINT_NAME = 'fk_episodio_extremo_unidade');
SET @sql := IF(@fk = 0,
  'ALTER TABLE episodio_alarme_extremo ADD CONSTRAINT fk_episodio_extremo_unidade
     FOREIGN KEY (unidade_sonda_id) REFERENCES unidades_sondas (id) ON DELETE RESTRICT',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Semeia o extremo dos episodios que ja existem, a partir do que o log de
-- fatos permite saber. E o melhor disponivel para o passado: o pico entre
-- transicoes daqueles episodios nao foi gravado por ninguem e nao volta.
-- O lado violado vem da ABERTURA, como EpisodioAlarme.de ja fazia: e ela que
-- descreve a excursao. Um valor de dentro da faixa (o do FECHOU) nunca e mais
-- extremo que um de fora, dos dois lados -- por isso MIN/MAX sobre os fatos
-- nao precisa exclui-lo.
INSERT INTO episodio_alarme_extremo (episodio_id, unidade_sonda_id, valor, limite_violado, atualizado_em)
SELECT g.episodio_id,
       g.unidade_sonda_id,
       IF(a.limite_violado = 'MIN', g.menor, g.maior),
       a.limite_violado,
       g.ultimo
  FROM (SELECT episodio_id,
               MIN(unidade_sonda_id) AS unidade_sonda_id,
               MIN(valor)            AS menor,
               MAX(valor)            AS maior,
               MAX(ocorrido_em)      AS ultimo,
               MIN(id)               AS primeiro_id
          FROM evento_alarme
         GROUP BY episodio_id) g
  JOIN evento_alarme a ON a.id = g.primeiro_id
 WHERE NOT EXISTS (SELECT 1 FROM episodio_alarme_extremo x WHERE x.episodio_id = g.episodio_id);
