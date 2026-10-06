package com.geopetro.security.braservcore;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;
import com.geopetro.comum.port.CatalogoDeUnidadesPort;

/**
 * O catalogo de unidades do Braserv-Core — spec braserv-core §7.
 *
 * <p>A frota inteira cabe numa resposta (dezenas de unidades) e muda pouco: um cache de
 * {@code core.cache.unidades-segundos} (60 s) basta. Com o core sem resposta, a leitura segue com a
 * ultima lista conhecida — ela so serve para montar telas e conferir escopo, e uma lista de um minuto
 * atras e melhor que nenhuma.
 *
 * <p>A escrita e diferente: {@link #buscarSemCache} pergunta ao core agora, e falha se ele nao
 * responder, porque gravar dado de uma unidade que acabou de ser excluida deixaria referencia orfa.
 */
@Component
public class CatalogoDeUnidadesAdapter implements CatalogoDeUnidadesPort {

	private static final Logger log = LoggerFactory.getLogger(CatalogoDeUnidadesAdapter.class);

	private final BraservCoreHttp core;
	private final Duration validade;
	private final Clock relogio;
	private volatile Lista ultima;

	@Autowired
	public CatalogoDeUnidadesAdapter(BraservCoreHttp core,
			@Value("${core.cache.unidades-segundos:60}") long validadeSegundos) {
		this(core, Duration.ofSeconds(validadeSegundos), Clock.systemUTC());
	}

	CatalogoDeUnidadesAdapter(BraservCoreHttp core, Duration validade, Clock relogio) {
		this.core = core;
		this.validade = validade;
		this.relogio = relogio;
	}

	@Override
	public List<Unidade> listar() {
		Instant agora = relogio.instant();
		Lista atual = ultima;
		if (atual != null && agora.isBefore(atual.obtidaEm().plus(validade))) {
			return atual.unidades();
		}
		try {
			List<Unidade> lidas = core.unidades().stream().map(CatalogoDeUnidadesAdapter::paraPorta).toList();
			ultima = new Lista(lidas, agora);
			return lidas;
		} catch (RuntimeException falha) {
			if (atual != null) {
				log.warn("Braserv-Core sem resposta; usando o catalogo de unidades de {} ({}).", atual.obtidaEm(),
						falha.toString());
				return atual.unidades();
			}
			throw new BraservCoreIndisponivelException("Braserv-Core sem resposta e sem catalogo de unidades.", falha);
		}
	}

	@Override
	public Optional<Unidade> buscar(long id) {
		return listar().stream().filter(u -> u.id() != null && u.id() == id).findFirst();
	}

	@Override
	public Optional<Unidade> buscarPorNome(String nome) {
		return listar().stream().filter(u -> u.nome() != null && u.nome().equals(nome)).findFirst();
	}

	@Override
	public Optional<Unidade> buscarSemCache(long id) {
		try {
			return core.unidade(id).map(CatalogoDeUnidadesAdapter::paraPorta);
		} catch (RuntimeException falha) {
			throw new BraservCoreIndisponivelException("Braserv-Core sem resposta ao confirmar a unidade " + id + ".", falha);
		}
	}

	private static Unidade paraPorta(BraservCoreHttp.UnidadeResposta r) {
		return new Unidade(r.id(), r.nome(), r.apelido(), r.tipo(), r.status(), r.setorId());
	}

	private record Lista(List<Unidade> unidades, Instant obtidaEm) {
	}
}
