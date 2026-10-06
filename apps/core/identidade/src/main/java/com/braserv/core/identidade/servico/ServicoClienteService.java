package com.braserv.core.identidade.servico;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.braserv.core.comum.exception.BusinessException;
import com.braserv.core.comum.exception.ResourceNotFoundException;
import com.braserv.core.usuario.application.port.out.PasswordEncoderPort;

/**
 * Cadastro dos sistemas que chamam as rotas internas — RN-117, D-3.
 *
 * <p>O segredo e gerado pelo core, mostrado uma unica vez e guardado so como hash. Perdeu o
 * segredo? Gera-se outro, e o anterior para de valer na hora.
 */
@Service
public class ServicoClienteService {

	/** Minusculas, digitos e hifen: o id vira {@code sub} do token e aparece em log. */
	private static final Pattern ID_VALIDO = Pattern.compile("^[a-z0-9][a-z0-9-]{2,63}$");
	private static final SecureRandom ALEATORIO = new SecureRandom();

	private final ServicoClienteRepository repository;
	private final PasswordEncoderPort encoder;
	/** Hash de um segredo qualquer: conferir contra ele iguala o tempo de resposta de id inexistente. */
	private final String hashDescartavel;

	public ServicoClienteService(ServicoClienteRepository repository, PasswordEncoderPort encoder) {
		this.repository = repository;
		this.encoder = encoder;
		this.hashDescartavel = encoder.encode(gerarSegredo());
	}

	@Transactional(readOnly = true)
	public List<ServicoClienteEntity> listar() {
		return repository.findAllByOrderByIdAsc();
	}

	@Transactional
	public SegredoGerado criar(String id, String nome, Set<String> escopos) {
		if (id == null || !ID_VALIDO.matcher(id).matches()) {
			throw new BusinessException("Id do sistema invalido: use de 3 a 64 caracteres entre minusculas, digitos e hifen.",
					HttpStatus.BAD_REQUEST);
		}
		if (nome == null || nome.isBlank()) {
			throw new BusinessException("Nome do sistema e obrigatorio.", HttpStatus.BAD_REQUEST);
		}
		if (repository.existsById(id)) {
			throw new BusinessException("Ja existe um sistema com o id " + id + ".", HttpStatus.CONFLICT);
		}
		validarEscopos(escopos);
		String segredo = gerarSegredo();
		Instant agora = Instant.now();
		ServicoClienteEntity cliente = new ServicoClienteEntity();
		cliente.setId(id);
		cliente.setNome(nome.trim());
		cliente.setEscopos(escopos);
		cliente.setSegredoHash(encoder.encode(segredo));
		cliente.setAtivo(true);
		cliente.setCriadoEm(agora);
		cliente.setAtualizadoEm(agora);
		return new SegredoGerado(repository.save(cliente), segredo);
	}

	/** Troca o segredo. O anterior deixa de valer imediatamente. */
	@Transactional
	public SegredoGerado gerarNovoSegredo(String id) {
		ServicoClienteEntity cliente = buscar(id);
		String segredo = gerarSegredo();
		cliente.setSegredoHash(encoder.encode(segredo));
		cliente.setAtualizadoEm(Instant.now());
		return new SegredoGerado(cliente, segredo);
	}

	@Transactional
	public void ativar(String id) {
		alterarAtivo(id, true);
	}

	/** Recusa tokens novos na hora. Os ja emitidos valem ate expirar (15 min). */
	@Transactional
	public void desativar(String id) {
		alterarAtivo(id, false);
	}

	/**
	 * Confere a credencial de um sistema. Vazio para id inexistente, segredo errado ou cliente
	 * desativado, sem distinguir os tres: quem tenta adivinhar nao aprende qual parte errou.
	 */
	@Transactional
	public Optional<ServicoClienteEntity> autenticar(String id, String segredo) {
		if (id == null || segredo == null) {
			return Optional.empty();
		}
		Optional<ServicoClienteEntity> encontrado = repository.findById(id);
		String hash = encontrado.map(ServicoClienteEntity::getSegredoHash).orElse(hashDescartavel);
		boolean confere = encoder.matches(segredo, hash);
		if (encontrado.isEmpty() || !confere || !encontrado.get().isAtivo()) {
			return Optional.empty();
		}
		encontrado.get().setUltimoUsoEm(Instant.now());
		return encontrado;
	}

	/**
	 * Cria o cliente com um segredo informado, se ele ainda nao existir. Serve a primeira subida, em
	 * que o backend precisa de credencial antes de alguem abrir a tela.
	 *
	 * @return true se criou
	 */
	@Transactional
	public boolean garantir(String id, String nome, Set<String> escopos, String segredo) {
		if (repository.existsById(id)) {
			return false;
		}
		validarEscopos(escopos);
		Instant agora = Instant.now();
		ServicoClienteEntity cliente = new ServicoClienteEntity();
		cliente.setId(id);
		cliente.setNome(nome);
		cliente.setEscopos(escopos);
		cliente.setSegredoHash(encoder.encode(segredo));
		cliente.setAtivo(true);
		cliente.setCriadoEm(agora);
		cliente.setAtualizadoEm(agora);
		repository.save(cliente);
		return true;
	}

	private ServicoClienteEntity buscar(String id) {
		return repository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("Sistema nao encontrado."));
	}

	private void alterarAtivo(String id, boolean ativo) {
		ServicoClienteEntity cliente = buscar(id);
		cliente.setAtivo(ativo);
		cliente.setAtualizadoEm(Instant.now());
	}

	private static void validarEscopos(Set<String> escopos) {
		if (escopos == null || escopos.isEmpty()) {
			throw new BusinessException("Informe ao menos um escopo.", HttpStatus.BAD_REQUEST);
		}
		Set<String> desconhecidos = new TreeSet<>(escopos);
		desconhecidos.removeAll(Escopo.CONCEDIVEIS);
		if (!desconhecidos.isEmpty()) {
			throw new BusinessException("Escopo nao concedivel: " + String.join(", ", desconhecidos)
					+ ". Validos: " + String.join(", ", new TreeSet<>(Escopo.CONCEDIVEIS)) + ".", HttpStatus.BAD_REQUEST);
		}
	}

	/** 32 bytes aleatorios em base64url: 43 caracteres. */
	static String gerarSegredo() {
		byte[] bytes = new byte[32];
		ALEATORIO.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	public record SegredoGerado(ServicoClienteEntity cliente, String segredo) {
	}
}
