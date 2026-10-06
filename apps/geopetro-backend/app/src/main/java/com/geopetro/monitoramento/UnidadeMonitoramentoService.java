package com.geopetro.monitoramento;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.geopetro.comum.exception.ResourceNotFoundException;
import com.geopetro.comum.port.AcessoDoUsuarioPort;
import com.geopetro.comum.port.AcessoDoUsuarioPort.AcessoDoUsuario;
import com.geopetro.comum.port.CatalogoDeUnidadesPort;
import com.geopetro.comum.port.CatalogoDeUnidadesPort.Unidade;
import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import com.geopetro.monitoramento.dto.UnidadeDisponivelDTO;
import com.geopetro.security.authorization.PermissoesDoUsuario;
import com.geopetro.security.authorization.RegraDeAcesso;
import com.geopetro.security.authorization.RegrasDeAcesso;

/**
 * Quanto cada usuario enxerga do monitoramento — RN-047, RN-048.
 *
 * <h2>Regra de escopo</h2>
 * <ul>
 *   <li><b>ADMIN</b>, e <b>conta interna com permissao de monitoramento</b> — enxergam
 *       <b>toda a frota</b>.</li>
 *   <li><b>CLIENTE</b> — enxerga <b>apenas</b> as unidades concedidas no cadastro.</li>
 *   <li>Qualquer outro perfil — nenhuma unidade.</li>
 * </ul>
 *
 * <p>Usuario e unidades vem do Braserv-Core: o acesso atual de cada usuario por
 * {@link AcessoDoUsuarioPort} e o catalogo de unidades por {@link CatalogoDeUnidadesPort}.
 *
 * <p><b>Escopo nao e permissao.</b> Quem <i>entra</i> no monitoramento e decidido por
 * {@code RegrasDeAcesso.MONITORAMENTO}; esta classe responde apenas <i>quanto</i> quem entrou
 * enxerga — mas repete a permissao de modulo de proposito, para que um endpoint futuro que reuse
 * este servico sem declarar regra nao entregue a frota a qualquer funcionario.
 *
 * <p><b>Unidade inativa (RN-116):</b> sai da lista de selecao, mas o historico dela continua
 * consultavel por quem ja tinha acesso. Por isso so {@link #listarUnidadesDoUsuario} filtra status.
 */
@Service
public class UnidadeMonitoramentoService {

    /** Perfis que enxergam toda a frota, sem recorte por concessao — RN-047. */
    private static final RegraDeAcesso ACESSO_TOTAL = RegrasDeAcesso.ESCOPO_FROTA_INTEIRA;

    private final CatalogoDeUnidadesPort unidades;
    private final AcessoDoUsuarioPort acessos;
    private final MonitoramentoClient monitoramentoClient;

    public UnidadeMonitoramentoService(CatalogoDeUnidadesPort unidades, AcessoDoUsuarioPort acessos,
                                       MonitoramentoClient monitoramentoClient) {
        this.unidades = unidades;
        this.acessos = acessos;
        this.monitoramentoClient = monitoramentoClient;
    }

    /** Unidades ativas que o usuario pode acompanhar, em ordem de nome. */
    public List<UnidadeDisponivelDTO> listarUnidadesDoUsuario(String username) {
        AcessoDoUsuario acesso = buscarAcesso(username);
        return unidades.listar().stream()
                .filter(Unidade::ativa)
                .filter(unidade -> enxerga(acesso, unidade.id()))
                .sorted(Comparator.comparing(Unidade::nome))
                .map(UnidadeDisponivelDTO::de)
                .toList();
    }

    /**
     * Pelo id numerico, usado nas rotas e no tempo real. Retorna {@code false} para usuario ou
     * unidade inexistente em vez de lancar: no WebSocket isto vira recusa de assinatura.
     */
    public boolean usuarioPossuiAcessoAUnidade(String username, Long unidadeId) {
        if (username == null || unidadeId == null) {
            return false;
        }
        Optional<AcessoDoUsuario> acesso = acessos.buscar(username);
        // Confirma que a unidade existe: sem isto, um id inventado seria "autorizado" para quem ve a
        // frota inteira, e o assinante ficaria preso a um topico que nunca recebe nada.
        return acesso.isPresent() && unidades.buscar(unidadeId).isPresent() && enxerga(acesso.get(), unidadeId);
    }

    /**
     * @param serie qual das series do dispositivo; {@code null} significa a serie unica de um card
     *              de uma grandeza so. Um card {@code CONTADOR_STROKE} grava tres (RN-098)
     * @return vazio se o usuario nao enxerga a unidade ou a Telemetria nao respondeu
     */
    public Optional<MonitoramentoSerieDTO> consultarSerie(String username, long unidadeId,
                                                           String dispositivoId, String serie,
                                                           Instant inicio, Instant fim) {
        if (!usuarioPossuiAcessoAUnidade(username, unidadeId)) {
            return Optional.empty();
        }
		Unidade unidade = unidades.buscar(unidadeId)
				.orElseThrow(() -> new ResourceNotFoundException("Unidade nao encontrada: " + unidadeId));
		// A telemetria continua indexada pelo nome da unidade (RN-018).
		return monitoramentoClient.consultarSerie(unidade.nome(), dispositivoId, serie, inicio, fim);
    }

    /**
     * Antes de gravar limites ou cards: a unidade precisa existir <b>agora</b> no core, sem cache.
     * Sem isto, um documento poderia ser gravado para uma unidade excluida ha segundos.
     */
    public void exigirUnidadeExistente(long unidadeId) {
        if (unidades.buscarSemCache(unidadeId).isEmpty()) {
            throw new ResourceNotFoundException("Unidade nao encontrada: " + unidadeId);
        }
    }

    private boolean enxerga(AcessoDoUsuario acesso, long unidadeId) {
        if (!acesso.ativo()) {
            return false;
        }
        if (ACESSO_TOTAL.satisfeitaPor(PermissoesDoUsuario.roles(acesso.roles()))) {
            return true;
        }
        return acesso.cliente() && acesso.unidadeIds().contains(unidadeId);
    }

    private AcessoDoUsuario buscarAcesso(String username) {
        return acessos.buscar(username)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario nao encontrado: " + username));
    }
}
