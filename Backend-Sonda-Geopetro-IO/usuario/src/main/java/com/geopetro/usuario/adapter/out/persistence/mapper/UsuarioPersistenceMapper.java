package com.geopetro.usuario.adapter.out.persistence.mapper;

import java.util.List;
import java.util.stream.Collectors;

import com.geopetro.empresa.adapter.out.persistence.entity.EmpresaEntity;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioClienteEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioInternoEntity;
import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;
import com.geopetro.usuario.domain.model.Email;
import com.geopetro.usuario.domain.model.Endereco;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Telefone;
import com.geopetro.usuario.domain.model.Usuario;
import com.geopetro.usuario.domain.model.UsuarioCliente;
import com.geopetro.usuario.domain.model.UsuarioInterno;
import com.geopetro.usuario.domain.model.UsuarioInterno.RegionalRef;
import com.geopetro.usuario.domain.model.UsuarioInterno.SetorRef;

public class UsuarioPersistenceMapper {

	public UsuarioEntity toEntity(Usuario usuario) {
		UsuarioEntity entity = criarEntity(usuario);
		entity.setUsername(usuario.getUsername());
		entity.setPassword(usuario.getPassword());
		entity.setRoles(usuario.getRoles());
		entity.setStatus(usuario.getStatus());
		entity.setNome(usuario.getNome());
		entity.setTelefone(usuario.getTelefone().formatado());
		entity.setEmail(usuario.getEmail().formatado());
		if (usuario.getEndereco() != null) {
			entity.setCep(usuario.getEndereco().getCep());
			entity.setLogradouro(usuario.getEndereco().getLogradouro());
			entity.setBairro(usuario.getEndereco().getBairro());
			entity.setCidade(usuario.getEndereco().getCidade());
			entity.setEstado(usuario.getEndereco().getEstado());
			entity.setNumero(usuario.getEndereco().getNumero());
			entity.setComplemento(usuario.getEndereco().getComplemento());
		}
		return entity;
	}

	public Usuario toDomain(UsuarioEntity entity) {
		Telefone telefone = Telefone.comTratamento(entity.getTelefone());
		Email email = Email.comTratamento(entity.getEmail());
		Endereco endereco = null;
		if (entity.getCep() != null) {
			endereco = Endereco.comTratamento(entity.getCep(), entity.getLogradouro(), entity.getBairro(),
					entity.getCidade(), entity.getEstado(), entity.getNumero(), entity.getComplemento());
		}

		Usuario usuario = criarDomain(entity, telefone, email, endereco);
		usuario.setStatus(entity.getStatus());
		return usuario;
	}

	private UsuarioEntity criarEntity(Usuario usuario) {
		if (usuario instanceof UsuarioCliente cliente) {
			UsuarioClienteEntity entity = new UsuarioClienteEntity();
			entity.setClienteId(cliente.getId());
			entity.setEmpresa(cliente.getEmpresa());
			if (cliente.getEmpresaId() != null) {
				EmpresaEntity empresa = new EmpresaEntity();
				empresa.setId(cliente.getEmpresaId());
				entity.setEmpresaRef(empresa);
			}
			entity.setUnidadesSondas(cliente.getUnidadeSondaIds().stream()
					.map(this::referenciaUnidadeSonda)
					.collect(Collectors.toCollection(java.util.LinkedHashSet::new)));
			return entity;
		}

		if (usuario instanceof UsuarioInterno interno) {
			UsuarioInternoEntity entity = new UsuarioInternoEntity();
			entity.setMatricula(interno.getMatricula());
			if (interno.getRegionalId() != null) {
				entity.setRegional(referenciaRegional(interno.getRegionalId()));
			}
			entity.setRegionais(interno.getRegionalIds().stream()
					.map(this::referenciaRegional)
					.collect(Collectors.toCollection(java.util.LinkedHashSet::new)));
			entity.setSetores(interno.getSetorIds().stream()
					.map(this::referenciaSetor)
					.collect(Collectors.toCollection(java.util.LinkedHashSet::new)));
			return entity;
		}

		throw new UsuarioInvalidoException("Tipo de usuario invalido.");
	}

	private Usuario criarDomain(UsuarioEntity entity, Telefone telefone, Email email, Endereco endereco) {
		if (entity.getRoles().contains(Role.CLIENTE) && entity instanceof UsuarioClienteEntity cliente) {
			Long empresaId = cliente.getEmpresaRef() == null ? null : cliente.getEmpresaRef().getId();
			String empresaNome = cliente.getEmpresaRef() == null ? cliente.getEmpresa() : cliente.getEmpresaRef().getNome();
			List<UsuarioCliente.UnidadeSondaRef> unidades = cliente.getUnidadesSondas().stream()
					.map(u -> new UsuarioCliente.UnidadeSondaRef(u.getId(), u.getNome(), u.getApelido()))
					.toList();
			return new UsuarioCliente(cliente.getClienteId(), empresaId, empresaNome, entity.getUsername(),
					entity.getPassword(), entity.getNome(), telefone, email, endereco, entity.getRoles(), unidades);
		}

		if (entity.getRoles().contains(Role.INTERNO) && entity instanceof UsuarioInternoEntity interno) {
			Long regionalId = interno.getRegional() == null ? null : interno.getRegional().getId();
			String regionalNome = interno.getRegional() == null ? null : interno.getRegional().getNome();
			List<RegionalRef> regionais = interno.getRegionais().stream()
					.map(r -> new RegionalRef(r.getId(), r.getNome()))
					.toList();
			List<SetorRef> setores = interno.getSetores().stream()
					.map(s -> new SetorRef(s.getId(), s.getNome(),
							s.getRegional() == null ? null : s.getRegional().getId(),
							s.getRegional() == null ? null : s.getRegional().getNome()))
					.toList();
			return new UsuarioInterno(interno.getMatricula(), regionalId, regionalNome, regionais, setores,
					entity.getUsername(), entity.getPassword(), entity.getNome(), telefone, email, endereco,
					entity.getRoles());
		}

		throw new UsuarioInvalidoException("Tipo de usuario invalido.");
	}

	private RegionalEntity referenciaRegional(Long id) {
		RegionalEntity regional = new RegionalEntity();
		regional.setId(id);
		return regional;
	}

	private SetorEntity referenciaSetor(Long id) {
		SetorEntity setor = new SetorEntity();
		setor.setId(id);
		return setor;
	}

	private UnidadeSondaEntity referenciaUnidadeSonda(Long id) {
		UnidadeSondaEntity unidade = new UnidadeSondaEntity();
		unidade.setId(id);
		return unidade;
	}
}
