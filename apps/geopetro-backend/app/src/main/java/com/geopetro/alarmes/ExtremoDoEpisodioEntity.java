package com.geopetro.alarmes;

import java.time.Instant;

import com.geopetro.alarmes.AvaliadorDeAlarme.Extremo;
import com.geopetro.alarmes.EventoAlarme.LimiteViolado;

import jakarta.persistence.*;

/**
 * O pior valor de um episódio — uma linha por excursão, atualizada enquanto ela durar.
 *
 * <h2>⚠️ Isto não é um fato, e por isso não mora no log</h2>
 * {@link EventoAlarmeEntity} é <i>append-only</i> porque guarda transições, que não se desdizem. O
 * extremo é <b>projeção</b>: muda a cada leitura mais grave da mesma excursão, e a leitura que o
 * estabelece normalmente <b>não gera fato nenhum</b> — é o caso 130 → 200 → 90, em que 200 não muda
 * severidade e o log só registra a abertura e o fechamento.
 *
 * <p>Misturar os dois na mesma tabela obrigaria a escolher entre gravar 600 linhas por excursão ou
 * perder o pico. Uma linha por episódio, atualizada, custa menos que o próprio log — que já grava
 * pelo menos dois fatos por excursão — e responde tanto ao histórico quanto à reconstrução depois
 * de um reinício.
 *
 * <p>A linha <b>sobrevive ao fechamento</b>: é ela que o histórico lê para dizer até onde a pressão
 * chegou, muito depois de o episódio ter terminado.
 */
@Entity
@Table(name = "episodio_alarme_extremo")
public class ExtremoDoEpisodioEntity {

	@Id
	@Column(name = "episodio_id", length = 36)
	String episodioId;

	@Column(name = "unidade_id", nullable = false)
	Long unidadeId;

	@Column(name = "valor", nullable = false)
	Double valor;

	@Enumerated(EnumType.STRING)
	@Column(name = "limite_violado", nullable = false, length = 8)
	LimiteViolado limiteViolado;

	@Column(name = "atualizado_em", nullable = false)
	Instant atualizadoEm;

	public ExtremoDoEpisodioEntity() {
	}

	static ExtremoDoEpisodioEntity de(Extremo extremo, Instant agora) {
		var entity = new ExtremoDoEpisodioEntity();
		entity.episodioId = extremo.episodioId();
		entity.unidadeId = extremo.unidadeId();
		entity.valor = extremo.valor();
		entity.limiteViolado = extremo.limiteViolado();
		entity.atualizadoEm = agora;
		return entity;
	}
}
