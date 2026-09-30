package com.geopetro.cards;

import java.time.Instant;
import java.util.List;

import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.geopetro.cards.ConfiguracaoCards.Alteracao;
import com.geopetro.cards.ConfiguracaoCards.Card;
import com.geopetro.cards.ConfiguracaoCards.Conexao;
import com.geopetro.core.exception.BusinessException;

import tools.jackson.databind.json.JsonMapper;

/** Leitura e gravação do documento de cards — RN-080, RN-089. */
@Service
public class ConfiguracaoCardsService {

	/** Tópico próprio: o documento de cards não viaja junto com o de limites. */
	public static final String TOPICO = "/topic/config/unidades-sondas/%d/cards";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final ConfiguracaoCardsRepository repository;
	private final ConfiguracaoCardsAccess access;
	private final SimpMessagingTemplate messages;

	public ConfiguracaoCardsService(ConfiguracaoCardsRepository repository, ConfiguracaoCardsAccess access,
			SimpMessagingTemplate messages) {
		this.repository = repository;
		this.access = access;
		this.messages = messages;
	}

	/**
	 * Unidade sem configuração devolve revisão {@code 0} e lista vazia, <b>sem criar registro</b>.
	 * É estado normal: a frota nasce vazia (RN-092), e unidade sem card não lê nada (RN-088).
	 */
	@Transactional(readOnly = true)
	public ConfiguracaoCards ler(String username, long id) {
		access.exigirLeitura(username, id);
		return repository.findById(id).map(this::dto)
				.orElseGet(() -> new ConfiguracaoCards(1, id, 0, null, List.of(), null, null));
	}

	@Transactional
	public ConfiguracaoCards salvar(String username, long id, Alteracao update) {
		access.exigirEscrita(username, id);

		var entity = repository.findById(id).orElse(null);
		if (update.revisao() != (entity == null ? 0 : entity.version + 1)) {
			throw conflito();
		}

		List<Card> existentes = entity == null ? List.of() : cards(entity);
		List<Card> identificados = ConfiguracaoCards.validarEIdentificar(update, existentes);

		if (entity == null) {
			entity = new ConfiguracaoCardsEntity();
			entity.unidadeSondaId = id;
		}
		entity.conexaoJson = JSON.writeValueAsString(update.conexao());
		entity.cardsJson = JSON.writeValueAsString(identificados);
		entity.atualizadoPor = username;
		entity.atualizadoEm = Instant.now();

		ConfiguracaoCards snapshot;
		try {
			snapshot = dto(repository.saveAndFlush(entity));
		} catch (DataIntegrityViolationException e) {
			throw conflito();
		}
		publicarAposCommit(id, snapshot);
		return snapshot;
	}

	/**
	 * Publica depois do commit. Falha de publicação <b>não</b> desfaz a gravação: o Desktop pede o
	 * snapshot ao reconectar e a cada 60 s, então a configuração chega de qualquer forma.
	 */
	private void publicarAposCommit(long id, ConfiguracaoCards snapshot) {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				try {
					messages.convertAndSend(TOPICO.formatted(id), snapshot);
				} catch (RuntimeException e) {
					LoggerFactory.getLogger(ConfiguracaoCardsService.class).warn(
							"Cards salvos; publicacao indisponivel. Clientes recuperam na sincronizacao.");
				}
			}
		});
	}

	private List<Card> cards(ConfiguracaoCardsEntity e) {
		return CardsDeclarados.cards(e);
	}

	private ConfiguracaoCards dto(ConfiguracaoCardsEntity e) {
		return new ConfiguracaoCards(1, e.unidadeSondaId, e.version + 1,
				JSON.readValue(e.conexaoJson, Conexao.class), cards(e), e.atualizadoPor, e.atualizadoEm);
	}

	private BusinessException conflito() {
		return new BusinessException("Os cards foram alterados. Recarregue antes de salvar.", HttpStatus.CONFLICT);
	}
}
