package com.geopetro.alarmes;

import java.time.Instant;

import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.alarmes.EventoAlarme.Tipo;

import jakarta.persistence.*;

/**
 * O log de eventos, gravado e nunca alterado — RN-076.
 *
 * <p>Sem {@code @Version} e sem {@code setter} público de propósito: não há atualização a fazer. A
 * escalada de um episódio é uma linha nova, não uma coluna trocada.
 */
@Entity
@Table(name = "evento_alarme")
public class EventoAlarmeEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	Long id;

	@Column(name = "episodio_id", nullable = false, length = 36)
	String episodioId;

	@Column(name = "unidade_id", nullable = false)
	Long unidadeId;

	@Column(name = "dispositivo_id", nullable = false, length = 64)
	String dispositivoId;

	/** Nula para card de uma grandeza só — RN-098. */
	@Column(name = "serie", length = 32)
	String serie;

	@Enumerated(EnumType.STRING)
	@Column(name = "tipo", nullable = false, length = 16)
	Tipo tipo;

	@Enumerated(EnumType.STRING)
	@Column(name = "severidade", nullable = false, length = 16)
	Severidade severidade;

	@Column(name = "ocorrido_em", nullable = false)
	Instant ocorridoEm;

	@Column(name = "valor", nullable = false)
	Double valor;

	@Enumerated(EnumType.STRING)
	@Column(name = "limite_violado", nullable = false, length = 8)
	LimiteViolado limiteViolado;

	public EventoAlarmeEntity() {
	}

	static EventoAlarmeEntity de(EventoAlarme evento) {
		var entity = new EventoAlarmeEntity();
		entity.episodioId = evento.episodioId();
		entity.unidadeId = evento.unidadeId();
		entity.dispositivoId = evento.dispositivoId();
		entity.serie = evento.serie();
		entity.tipo = evento.tipo();
		entity.severidade = evento.severidade();
		entity.ocorridoEm = evento.ocorridoEm();
		entity.valor = evento.valor();
		entity.limiteViolado = evento.limiteViolado();
		return entity;
	}

	EventoAlarme paraDominio() {
		return new EventoAlarme(id, episodioId, unidadeId, dispositivoId, serie, tipo, severidade,
				ocorridoEm, valor, limiteViolado);
	}
}
