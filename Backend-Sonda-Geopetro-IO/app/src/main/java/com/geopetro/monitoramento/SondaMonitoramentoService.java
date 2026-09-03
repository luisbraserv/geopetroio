package com.geopetro.monitoramento;

import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import com.geopetro.monitoramento.dto.SondaDisponivelDTO;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioClienteEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Controle de acesso ao monitoramento de sondas.
 *
 * <h2>Regra de escopo</h2>
 * <ul>
 *   <li><b>ADMIN, SONDA, CIMENTACAO, GERENCIA, DIRETORIA</b> — enxergam <b>toda a frota</b>.</li>
 *   <li><b>CLIENTE</b> — enxerga <b>apenas</b> as Unidades/Sondas concedidas no seu cadastro.</li>
 *   <li>Qualquer outro perfil — nenhuma sonda.</li>
 * </ul>
 *
 * <p><b>Nota sobre a regional.</b> Ate 2026-08-27 o acesso de usuario interno era limitado a sua
 * regional principal. Essa restricao foi <b>removida</b>: os perfis operacionais passam a ver a frota
 * inteira, por decisao de negocio. Com isso, a limitacao descrita em RN-013 deixa de afetar o
 * monitoramento.
 */
@Service
public class SondaMonitoramentoService {

    /** Perfis que enxergam toda a frota, sem recorte por vinculo. */
    private static final Set<Role> ACESSO_TOTAL = Set.of(
            Role.ADMIN, Role.SONDA, Role.CIMENTACAO, Role.GERENCIA, Role.DIRETORIA);

    private final UnidadeSondaJpaRepository unidadeSondaRepository;
    private final UsuarioJpaRepository usuarioRepository;
    private final MonitoramentoClient monitoramentoClient;

    public SondaMonitoramentoService(UnidadeSondaJpaRepository unidadeSondaRepository,
                                     UsuarioJpaRepository usuarioRepository,
                                     MonitoramentoClient monitoramentoClient) {
        this.unidadeSondaRepository = unidadeSondaRepository;
        this.usuarioRepository = usuarioRepository;
        this.monitoramentoClient = monitoramentoClient;
    }

    public List<SondaDisponivelDTO> listarSondasDoUsuario(String username) {
        UsuarioEntity usuario = buscarUsuario(username);

        if (possuiAcessoTotal(usuario)) {
            return unidadeSondaRepository.findAll().stream()
                    .sorted(Comparator.comparing(UnidadeSondaEntity::getNome))
                    .map(this::paraDto)
                    .toList();
        }

        if (usuario instanceof UsuarioClienteEntity cliente) {
            return cliente.getUnidadesSondas().stream()
                    .sorted(Comparator.comparing(UnidadeSondaEntity::getNome))
                    .map(this::paraDto)
                    .toList();
        }

        // Perfil sem acesso definido ao monitoramento: lista vazia em vez de erro, porque a
        // rota ja e protegida por role — chegar aqui significa perfil sem sondas, nao falha.
        return List.of();
    }

    public boolean usuarioPossuiAcessoASonda(String username, String idSondaUnidade) {
        UsuarioEntity usuario = buscarUsuario(username);

        if (possuiAcessoTotal(usuario)) {
            return true;
        }

        if (usuario instanceof UsuarioClienteEntity cliente) {
            return cliente.getUnidadesSondas().stream()
                    .anyMatch(u -> u.getNome().equals(idSondaUnidade));
        }

        return false;
    }

    /**
     * Mesma regra de {@link #usuarioPossuiAcessoASonda}, porem pelo id numerico.
     *
     * <p>Usada pelo canal de tempo real, cujo topico e enderecado por id
     * ({@code /topic/realtime/unidades-sondas/{id}}). O id e preferivel ao nome ali porque e
     * estavel a renomeacoes de unidade — ao contrario do historico, que depende do nome como
     * chave de correlacao no InfluxDB (RN-018).
     *
     * <p>Retorna {@code false} para usuario inexistente em vez de lancar: no fluxo WebSocket isto
     * vira uma recusa de assinatura, nao um erro de servidor.
     */
    public boolean usuarioPossuiAcessoAUnidade(String username, Long unidadeSondaId) {
        if (username == null || unidadeSondaId == null) {
            return false;
        }

        UsuarioEntity usuario = usuarioRepository.findById(username).orElse(null);
        if (usuario == null) {
            return false;
        }

        if (possuiAcessoTotal(usuario)) {
            // Confirma que a unidade existe: sem isto, um id inventado seria "autorizado"
            // e o assinante ficaria preso a um topico que nunca recebe nada.
            return unidadeSondaRepository.existsById(unidadeSondaId);
        }

        if (usuario instanceof UsuarioClienteEntity cliente) {
            return cliente.getUnidadesSondas().stream()
                    .anyMatch(u -> unidadeSondaId.equals(u.getId()));
        }

        return false;
    }

    public Optional<MonitoramentoSerieDTO> consultarSerie(String username, String idSondaUnidade,
                                                           String dispositivoId, Instant inicio, Instant fim) {
        if (!usuarioPossuiAcessoASonda(username, idSondaUnidade)) {
            return Optional.empty();
        }
        UnidadeSondaEntity sonda = unidadeSondaRepository.findByNome(idSondaUnidade)
                .orElseThrow(() -> new ResourceNotFoundException("Sonda não encontrada: " + idSondaUnidade));
        return monitoramentoClient.consultarSerie(sonda.getNome(), dispositivoId, inicio, fim);
    }

    private UsuarioEntity buscarUsuario(String username) {
        return usuarioRepository.findById(username)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado: " + username));
    }

    private boolean possuiAcessoTotal(UsuarioEntity usuario) {
        Set<Role> roles = usuario.getRoles();
        return roles != null && roles.stream().anyMatch(ACESSO_TOTAL::contains);
    }

    private SondaDisponivelDTO paraDto(UnidadeSondaEntity unidade) {
        return new SondaDisponivelDTO(
                unidade.getId(), unidade.getNome(), unidade.getNome(), unidade.getApelido());
    }
}
