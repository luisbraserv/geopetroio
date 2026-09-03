package com.geopetro.usuario.domain.model;

import java.util.ArrayList;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;

public class UsuarioInterno extends Usuario {

	private Integer matricula;
	// Regional principal (vinculo primario do usuario)
	private Long regionalId;
	private String regionalNome;
	// Todas as regionais a que o usuario pertence
	private List<RegionalRef> regionais = new ArrayList<>();
	// Todos os setores a que o usuario pertence
	private List<SetorRef> setores = new ArrayList<>();

	public UsuarioInterno() {
	}

	// Construtor reduzido (apenas regional principal) - mantido por compatibilidade
	public UsuarioInterno(Integer matricula, Long regionalId, String regionalNome, String username, String password,
			String nome, Telefone telefone, Email email, Endereco endereco, Set<Role> roles) {
		this(matricula, regionalId, regionalNome, new ArrayList<>(), new ArrayList<>(), username, password, nome,
				telefone, email, endereco, roles);
	}

	public UsuarioInterno(Integer matricula, Long regionalId, String regionalNome, List<RegionalRef> regionais,
			List<SetorRef> setores, String username, String password, String nome, Telefone telefone, Email email,
			Endereco endereco, Set<Role> roles) {
		super(username, password, roles, nome, telefone, email, endereco);
		this.matricula = validarMatricula(matricula);
		this.regionalId = regionalId;
		this.regionalNome = regionalNome;
		if (regionais != null) {
			this.regionais = new ArrayList<>(regionais);
		}
		if (setores != null) {
			this.setores = new ArrayList<>(setores);
		}
	}

	public Integer getMatricula() { return matricula; }
	public void setMatricula(Integer matricula) { this.matricula = validarMatricula(matricula); }

	public Long getRegionalId() { return regionalId; }
	public void setRegionalId(Long regionalId) { this.regionalId = regionalId; }
	public String getRegionalNome() { return regionalNome; }
	public void setRegionalNome(String regionalNome) { this.regionalNome = regionalNome; }

	public List<RegionalRef> getRegionais() { return regionais; }
	public void setRegionais(List<RegionalRef> regionais) {
		this.regionais = regionais == null ? new ArrayList<>() : new ArrayList<>(regionais);
	}

	public List<SetorRef> getSetores() { return setores; }
	public void setSetores(List<SetorRef> setores) {
		this.setores = setores == null ? new ArrayList<>() : new ArrayList<>(setores);
	}

	public Set<Long> getRegionalIds() {
		return regionais.stream().map(RegionalRef::id).collect(Collectors.toCollection(LinkedHashSet::new));
	}

	public Set<Long> getSetorIds() {
		return setores.stream().map(SetorRef::id).collect(Collectors.toCollection(LinkedHashSet::new));
	}

	private static Integer validarMatricula(Integer matricula) {
		if (matricula == null || matricula <= 0) {
			throw new UsuarioInvalidoException("Matricula do usuario interno deve ser maior que zero.");
		}
		return matricula;
	}

	public record RegionalRef(Long id, String nome) {
	}

	public record SetorRef(Long id, String nome, Long regionalId, String regionalNome) {
	}
}
