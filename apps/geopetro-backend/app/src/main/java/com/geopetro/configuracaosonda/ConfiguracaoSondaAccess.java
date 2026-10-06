package com.geopetro.configuracaosonda;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.geopetro.comum.exception.BusinessException;
import com.geopetro.monitoramento.UnidadeMonitoramentoService;
import com.geopetro.security.application.ContaAtivaVerificador;

/**
 * Quem ve a unidade ve e ajusta o alarme dela — RN-069. Soma a conta ativa (RN-062) ao escopo do
 * monitoramento (RN-047, RN-048).
 */
@Service
public class ConfiguracaoSondaAccess {

    private final UnidadeMonitoramentoService monitoramento;
    private final ContaAtivaVerificador contas;

    public ConfiguracaoSondaAccess(UnidadeMonitoramentoService monitoramento, ContaAtivaVerificador contas) {
        this.monitoramento = monitoramento;
        this.contas = contas;
    }

    public boolean permite(String username, long id) {
        return username != null && id > 0 && contas.ativa(username) && monitoramento.usuarioPossuiAcessoAUnidade(username, id);
    }

    public void exigir(String username, long id) {
        if (!permite(username, id)) {
            throw new BusinessException("Sem acesso a esta Unidade.", HttpStatus.FORBIDDEN);
        }
    }

    /** Antes de gravar: a unidade precisa existir agora no Braserv-Core, sem cache (spec §7). */
    public void exigirUnidadeExistente(long id) {
        monitoramento.exigirUnidadeExistente(id);
    }
}
