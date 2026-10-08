package com.geopetro.desktop.historico;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;


/**
 * Lê o H2 local e agrupa por série — a fonte da tela de gráficos e da carta de operação.
 *
 * <h2>Por que num lugar só</h2>
 * Três telas precisam da mesma coisa: gráficos, pré-visualização e o PDF da carta. Cada uma
 * agrupando por conta própria daria três definições de "o que é uma série" para divergirem — e esta
 * base já teve o fator bar-PSI declarado duas vezes com precisões diferentes.
 *
 * <h2>⚠️ Séries têm tamanhos diferentes</h2>
 * Grandeza sem valor não é gravada (RN-099), então um card que ficou sem calibração por um trecho
 * tem menos pontos que os outros. Cada série carrega <b>os seus</b> instantes, e quem desenha usa
 * esses. Completar com zero produziria um gráfico que desce até o chão e volta, como se a medição
 * tivesse caído.
 */
@Service
public class SeriesLocais {

	private final LeituraLocalRepository repository;

	public SeriesLocais(LeituraLocalRepository repository) {
		this.repository = repository;
	}

	/**
	 * Uma série lida do H2 local.
	 *
	 * @param chave  {@code dispositivoId|serie} — identifica a série entre todas da janela
	 * @param rotulo o que aparece na tela; o nome de tela não vai para o histórico (RN-097), então
	 *               aqui o rótulo é o próprio id, que é estável
	 */
	public record SerieLocal(String chave, String dispositivoId, String serie, String rotulo,
			String tipo, String unidade, List<Double> valores, List<LocalDateTime> instantes) {

		public boolean vazia() {
			return valores.isEmpty();
		}
	}

	public List<SerieLocal> carregar(LocalDateTime inicio, LocalDateTime fim) {
		Map<String, List<LeituraLocal>> porChave = repository
				.findByTimestampBetweenOrderByTimestampAsc(inicio, fim).stream()
				.filter(l -> l.getValor() != null)
				.collect(Collectors.groupingBy(SeriesLocais::chave, LinkedHashMap::new, Collectors.toList()));

		List<SerieLocal> series = new ArrayList<>();
		porChave.forEach((chave, pontos) -> {
			LeituraLocal primeiro = pontos.get(0);
			series.add(new SerieLocal(chave, primeiro.getDispositivoId(), primeiro.getSerie(),
					rotulo(primeiro), primeiro.getTipo(), primeiro.getUnidade(),
					pontos.stream().map(LeituraLocal::getValor).toList(),
					pontos.stream().map(LeituraLocal::getTimestamp).toList()));
		});
		return series;
	}

	public static String chave(LeituraLocal leitura) {
		return leitura.getDispositivoId() + "|" + (leitura.getSerie() == null ? "" : leitura.getSerie());
	}

	private static String rotulo(LeituraLocal leitura) {
		return leitura.getSerie() == null
				? leitura.getDispositivoId()
				: leitura.getDispositivoId() + " · " + leitura.getSerie();
	}
}
