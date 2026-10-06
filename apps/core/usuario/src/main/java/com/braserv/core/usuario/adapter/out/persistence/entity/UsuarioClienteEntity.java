package com.braserv.core.usuario.adapter.out.persistence.entity;

import java.util.LinkedHashSet;
import java.util.Set;

import com.braserv.core.empresa.adapter.out.persistence.entity.EmpresaEntity;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;

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
	 * Unidades que este cliente pode visualizar.
	 *
	 * <p>EAGER de proposito: o vinculo e consultado em toda checagem de acesso ao monitoramento,
	 * e o volume e pequeno (poucas unidades por cliente).
	 */
	@ManyToMany(fetch = FetchType.EAGER)
	@JoinTable(name = "usuario_cliente_unidades",
			joinColumns = @JoinColumn(name = "usuario_username"),
			inverseJoinColumns = @JoinColumn(name = "unidade_id"))
	private Set<UnidadeEntity> unidades = new LinkedHashSet<>();

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

	public Set<UnidadeEntity> getUnidades() {
		return unidades;
	}

	public void setUnidades(Set<UnidadeEntity> unidades) {
		this.unidades = unidades == null ? new LinkedHashSet<>() : new LinkedHashSet<>(unidades);
	}
}
