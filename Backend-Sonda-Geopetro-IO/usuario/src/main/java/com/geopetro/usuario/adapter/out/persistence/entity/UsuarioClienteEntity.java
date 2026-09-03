package com.geopetro.usuario.adapter.out.persistence.entity;

import java.util.LinkedHashSet;
import java.util.Set;

import com.geopetro.empresa.adapter.out.persistence.entity.EmpresaEntity;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;

@Entity
@DiscriminatorValue("CLIENTE")
public class UsuarioClienteEntity extends UsuarioEntity {

	private Integer clienteId;
	private String empresa;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "empresa_id")
	private EmpresaEntity empresaRef;

	/**
	 * Unidades/Sondas que este cliente pode visualizar.
	 *
	 * <p>EAGER de proposito: o vinculo e consultado em toda checagem de acesso ao monitoramento,
	 * e o volume e pequeno (poucas unidades por cliente).
	 */
	@ManyToMany(fetch = FetchType.EAGER)
	@JoinTable(name = "usuario_cliente_unidades",
			joinColumns = @JoinColumn(name = "usuario_username"),
			inverseJoinColumns = @JoinColumn(name = "unidade_sonda_id"))
	private Set<UnidadeSondaEntity> unidadesSondas = new LinkedHashSet<>();

	public Integer getClienteId() {
		return clienteId;
	}

	public void setClienteId(Integer clienteId) {
		this.clienteId = clienteId;
	}

	public String getEmpresa() {
		return empresa;
	}

	public void setEmpresa(String empresa) {
		this.empresa = empresa;
	}

	public EmpresaEntity getEmpresaRef() {
		return empresaRef;
	}

	public void setEmpresaRef(EmpresaEntity empresaRef) {
		this.empresaRef = empresaRef;
	}

	public Set<UnidadeSondaEntity> getUnidadesSondas() {
		return unidadesSondas;
	}

	public void setUnidadesSondas(Set<UnidadeSondaEntity> unidadesSondas) {
		this.unidadesSondas = unidadesSondas == null ? new LinkedHashSet<>() : new LinkedHashSet<>(unidadesSondas);
	}
}
