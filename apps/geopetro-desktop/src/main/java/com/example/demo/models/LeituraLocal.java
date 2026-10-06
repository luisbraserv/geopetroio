package com.example.demo.models;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * Uma grandeza gravada no H2 local da estação — o registro que não depende de rede.
 *
 * <h2>Por que substituiu {@code SondaReading}</h2>
 * Aquela entidade tinha <b>colunas fixas</b>: peso, dois torques, uma pressão, vazão e stroke. Era o
 * espelho de um mapeamento fixo. Com cards por unidade ela não consegue mais representar a estação —
 * um terceiro card de torque, um de temperatura ou um de tanque não têm coluna, e encaixá-los por
 * posição era a ponte transitória que o passo 7 remove.
 *
 * <h2>Uma linha por grandeza, não por ciclo</h2>
 * É a forma que as consultas pedem: gráfico e carta de operação querem <b>uma série ao longo de uma
 * janela</b>, que aqui é {@code WHERE dispositivoId = ? AND serie = ? AND timestamp BETWEEN}.
 *
 * <p>⚠️ <b>Custo:</b> o número de linhas passa a ser N por ciclo, não 1. Com 8 grandezas a 1 Hz são
 * ~691 mil linhas por dia, contra ~86 mil antes. É o que motivou a poda em
 * {@code PodaDeLeiturasLocais} — antes desta mudança a tabela crescia para sempre e ninguém tinha
 * reparado.
 *
 * <p>O índice por {@code (dispositivoId, timestamp)} é o que mantém a consulta de uma série barata
 * mesmo com a tabela grande; sem ele, cada gráfico varreria tudo.
 */
@Entity
@Table(name = "leitura_local", indexes = {
		@Index(name = "idx_leitura_dispositivo_instante", columnList = "dispositivoId,timestamp"),
		@Index(name = "idx_leitura_instante", columnList = "timestamp")
})
public class LeituraLocal {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private LocalDateTime timestamp;

	/** Gerado pelo backend, {@code <TIPO>_<NN>}, imutável — RN-081. */
	private String dispositivoId;

	/** Distingue as três grandezas de um card de stroke; nulo nas demais — RN-098. */
	private String serie;

	private String tipo;
	private String unidade;

	/** Onde foi lido neste ciclo, como {@code DBW10}. */
	private String enderecoDb;

	private Double valor;

	/** O que veio do CLP antes da conversão — permite reprocessar se uma fórmula for corrigida. */
	private Double valorBruto;

	public LeituraLocal() {
	}

	public LeituraLocal(LocalDateTime timestamp, String dispositivoId, String serie, String tipo,
			String unidade, String enderecoDb, Double valor, Double valorBruto) {
		this.timestamp = timestamp;
		this.dispositivoId = dispositivoId;
		this.serie = serie;
		this.tipo = tipo;
		this.unidade = unidade;
		this.enderecoDb = enderecoDb;
		this.valor = valor;
		this.valorBruto = valorBruto;
	}

	public Long getId() {
		return id;
	}

	public LocalDateTime getTimestamp() {
		return timestamp;
	}

	public String getDispositivoId() {
		return dispositivoId;
	}

	public String getSerie() {
		return serie;
	}

	public String getTipo() {
		return tipo;
	}

	public String getUnidade() {
		return unidade;
	}

	public String getEnderecoDb() {
		return enderecoDb;
	}

	public Double getValor() {
		return valor;
	}

	public Double getValorBruto() {
		return valorBruto;
	}
}
