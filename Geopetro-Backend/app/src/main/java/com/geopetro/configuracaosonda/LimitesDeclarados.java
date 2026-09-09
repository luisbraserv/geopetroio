package com.geopetro.configuracaosonda;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.configuracaosonda.ConfiguracaoSonda.Limite;

import tools.jackson.databind.json.JsonMapper;

/**
 * Lê os limites de uma unidade para o caminho interno — o motor de alarmes.
 *
 * <h2>⚠️ Não autoriza, porque não há quem autorizar</h2>
 * {@link ConfiguracaoSondaService} é a porta com autorização, e pede um usuário. Quem avalia uma
 * leitura não é usuário nenhum: é o servidor reagindo ao que a sonda publicou. Exigir um nome ali
 * obrigaria a inventar um usuário de sistema com acesso a toda a frota — uma credencial nova, e uma
 * exceção permanente na regra de escopo por perfil (RN-047), para uma leitura que não sai daqui.
 */
@Component
public class LimitesDeclarados {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final ConfiguracaoSondaRepository repository;

	public LimitesDeclarados(ConfiguracaoSondaRepository repository) {
		this.repository = repository;
	}

	/** Unidade sem documento devolve lista vazia: sonda sem limite não alarma, e é estado normal. */
	@Transactional(readOnly = true)
	public List<Limite> de(long unidadeSondaId) {
		return repository.findById(unidadeSondaId).map(LimitesDeclarados::limites).orElseGet(List::of);
	}

	/**
	 * Quantos limites cada unidade tem — uma consulta para a frota toda.
	 *
	 * @param ativos os que realmente vigiam; {@code declarados} inclui os hibernando com o card
	 *               desativado (RN-091)
	 */
	public record Resumo(long unidadeSondaId, long revisao, int ativos, int declarados,
			String atualizadoPor, Instant atualizadoEm) {
	}

	@Transactional(readOnly = true)
	public List<Resumo> resumos() {
		return repository.findAll().stream().map(entity -> {
			List<Limite> limites = limites(entity);
			int ativos = (int) limites.stream().filter(Limite::ativo).count();
			return new Resumo(entity.unidadeSondaId, entity.version + 1, ativos, limites.size(),
					entity.atualizadoPor, entity.atualizadoEm);
		}).toList();
	}

	private static List<Limite> limites(ConfiguracaoSondaEntity entity) {
		return Arrays.asList(JSON.readValue(entity.limitesJson, Limite[].class));
	}
}
