package com.geopetro.usuario.adapter.out.persistence.entity;

import java.util.LinkedHashSet;
import java.util.Set;

import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;

@Entity
@DiscriminatorValue("INTERNO")
public class UsuarioInternoEntity extends UsuarioEntity {

	private Integer matricula;

	// Regional principal do usuario
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "regional_id")
	private RegionalEntity regional;

	// Todas as regionais a que o usuario pertence
	@ManyToMany(fetch = FetchType.LAZY)
	@JoinTable(name = "usuario_interno_regionais",
			joinColumns = @JoinColumn(name = "usuario_username"),
			inverseJoinColumns = @JoinColumn(name = "regional_id"))
	private Set<RegionalEntity> regionais = new LinkedHashSet<>();

	// Todos os setores a que o usuario pertence
	@ManyToMany(fetch = FetchType.LAZY)
	@JoinTable(name = "usuario_interno_setores",
			joinColumns = @JoinColumn(name = "usuario_username"),
			inverseJoinColumns = @JoinColumn(name = "setor_id"))
	private Set<SetorEntity> setores = new LinkedHashSet<>();

	public Integer getMatricula() { return matricula; }
	public void setMatricula(Integer matricula) { this.matricula = matricula; }

	public RegionalEntity getRegional() { return regional; }
	public void setRegional(RegionalEntity regional) { this.regional = regional; }

	public Set<RegionalEntity> getRegionais() { return regionais; }
	public void setRegionais(Set<RegionalEntity> regionais) {
		this.regionais = regionais == null ? new LinkedHashSet<>() : new LinkedHashSet<>(regionais);
	}

	public Set<SetorEntity> getSetores() { return setores; }
	public void setSetores(Set<SetorEntity> setores) {
		this.setores = setores == null ? new LinkedHashSet<>() : new LinkedHashSet<>(setores);
	}
}
