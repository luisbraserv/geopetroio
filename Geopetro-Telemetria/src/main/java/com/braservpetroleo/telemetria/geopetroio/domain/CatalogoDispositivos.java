package com.braservpetroleo.telemetria.geopetroio.domain;

import java.util.Map;
import java.util.Optional;

/**
 * Vocabulario fechado de dispositivos da sonda, conforme
 * {@code specs/contracts/mqtt-telemetria.md} secao 4.
 *
 * <p>Serve a dois propositos:
 * <ul>
 *   <li>Enriquecer mensagens no <b>formato antigo</b>, que trazem apenas {@code dispositivo} e
 *       {@code valor}, para que gravem no InfluxDB com as mesmas tags do formato novo. Sem isso, o
 *       historico ficaria dividido em dois esquemas conforme a versao do Desktop-Sonda que publicou.</li>
 *   <li>Validar {@code dispositivoId} desconhecido — sinal de produtor desatualizado ou payload forjado.</li>
 * </ul>
 *
 * <p><b>Nota:</b> B005 alimenta dois indicadores na interface (Bomba de Lama e ESCP) com o mesmo valor
 * fisico. Aqui existe um unico {@code PRESSAO_01} — a duplicacao e apresentacao, nao dado.
 */
public final class CatalogoDispositivos {

	/** Descricao estatica de um dispositivo conhecido. */
	public record Dispositivo(String dispositivoId, String nome, String codigoOrigem, String tipo, String unidade) {
	}

	private static final Map<String, Dispositivo> POR_ID = Map.of(
			"VAZAO_01", new Dispositivo("VAZAO_01", "Vazao", "B001", "VAZAO", "bbl/min"),
			"PESO_COLUNA_01", new Dispositivo("PESO_COLUNA_01", "Peso da Coluna", "B002", "PESO", "lbf"),
			"TORQUE_01", new Dispositivo("TORQUE_01", "Torque Ch. Hid. Tubos", "B003", "TORQUE", "lbf.ft"),
			"TORQUE_02", new Dispositivo("TORQUE_02", "Torque Ch. Flutuante", "B004", "TORQUE", "lbf.ft"),
			"PRESSAO_01", new Dispositivo("PRESSAO_01", "Pressao Bomba de Lama", "B005", "PRESSAO", "psi"));

	private CatalogoDispositivos() {
	}

	public static Optional<Dispositivo> buscar(String dispositivoId) {
		if (dispositivoId == null) {
			return Optional.empty();
		}
		return Optional.ofNullable(POR_ID.get(dispositivoId.trim().toUpperCase()));
	}

	public static boolean conhecido(String dispositivoId) {
		return buscar(dispositivoId).isPresent();
	}
}
