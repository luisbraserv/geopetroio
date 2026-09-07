package com.geopetro.configuracaosonda;
import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.core.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
@Service
public class ConfiguracaoSondaAccess {
    private final SondaMonitoramentoService monitoramento;
    private final ContaAtivaVerificador contas;
    public ConfiguracaoSondaAccess(SondaMonitoramentoService monitoramento, ContaAtivaVerificador contas) {
        this.monitoramento = monitoramento; this.contas = contas;
    }
    public boolean permite(String username, long id) {
        return username != null && id > 0 && contas.ativa(username) && monitoramento.usuarioPossuiAcessoAUnidade(username, id);
    }
    public void exigir(String username, long id) {
        if (!permite(username, id)) throw new BusinessException("Sem acesso a esta Unidade/Sonda.", HttpStatus.FORBIDDEN);
    }
}
