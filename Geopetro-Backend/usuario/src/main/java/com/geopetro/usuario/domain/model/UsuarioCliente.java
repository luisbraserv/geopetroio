package com.geopetro.usuario.domain.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;

public class UsuarioCliente extends Usuario {

	private Integer id;
	private Long empresaId;
	private String empresa;

	/**
	 * Unidades/Sondas que este cliente pode visualizar no monitoramento.
	 *
	 * <p>Diferente dos perfis internos, o cliente <b>nao</b> enxerga toda a frota: seu acesso e
	 * explicitamente concedido, unidade a unidade, no cadastro. Lista vazia significa que ele nao
	 * visualiza nenhuma sonda.
	 */
	private List<UnidadeSondaRef> unidadesSondas = new ArrayList<>();

	/** Referencia a uma Unidade/Sonda vinculada ao cliente. */
	public record UnidadeSondaRef(Long id, String nome, String apelido) {
	}

	public UsuarioCliente() {
	}

	public UsuarioCliente(Integer id, String empresa, String username, String password, String nome, Telefone telefone,
			Email email, Endereco endereco) {
		this(id, empresa, username, password, nome, telefone, email, endereco, Set.of(Role.CLIENTE));
	}

	public UsuarioCliente(Integer id, String empresa, String username, String password, String nome, Telefone telefone,
			Email email, Endereco endereco, Set<Role> roles) {
		this(id, null, empresa, username, password, nome, telefone, email, endereco, roles);
	}

	public UsuarioCliente(Integer id, Long empresaId, String empresa, String username, String password, String nome,
			Telefone telefone, Email email, Endereco endereco, Set<Role> roles) {
		this(id, empresaId, empresa, username, password, nome, telefone, email, endereco, roles, List.of());
	}

	public UsuarioCliente(Integer id, Long empresaId, String empresa, String username, String password, String nome,
			Telefone telefone, Email email, Endereco endereco, Set<Role> roles,
			List<UnidadeSondaRef> unidadesSondas) {
		super(username, password, roles, nome, telefone, email, endereco);
		this.id = validarId(id);
		this.empresaId = empresaId;
		this.empresa = validarEmpresa(empresa);
		if (unidadesSondas != null) {
			this.unidadesSondas = new ArrayList<>(unidadesSondas);
		}
	}

	public Integer getId() {
		return id;
	}

	public void setId(Integer id) {
		this.id = validarId(id);
	}

	public String getEmpresa() {
		return empresa;
	}

	public Long getEmpresaId() {
		return empresaId;
	}

	public void setEmpresaId(Long empresaId) {
		this.empresaId = empresaId;
	}

	public void setEmpresa(String empresa) {
		this.empresa = validarEmpresa(empresa);
	}

	public List<UnidadeSondaRef> getUnidadesSondas() {
		return unidadesSondas;
	}

	public void setUnidadesSondas(List<UnidadeSondaRef> unidadesSondas) {
		this.unidadesSondas = unidadesSondas == null ? new ArrayList<>() : new ArrayList<>(unidadesSondas);
	}

	public List<Long> getUnidadeSondaIds() {
		return unidadesSondas.stream().map(UnidadeSondaRef::id).toList();
	}

	/** Regra de acesso do cliente: so enxerga as unidades explicitamente vinculadas a ele. */
	public boolean possuiAcessoAUnidade(String nomeUnidade) {
		if (nomeUnidade == null) {
			return false;
		}
		return unidadesSondas.stream().anyMatch(u -> nomeUnidade.equals(u.nome()));
	}

	private static Integer validarId(Integer id) {
		if (id == null || id <= 0) {
			throw new UsuarioInvalidoException("Id do cliente deve ser maior que zero.");
		}

		return id;
	}

	private static String validarEmpresa(String empresa) {
		if (empresa == null || empresa.trim().isBlank()) {
			throw new UsuarioInvalidoException("Empresa do cliente e obrigatoria.");
		}

		return empresa.trim();
	}
}
