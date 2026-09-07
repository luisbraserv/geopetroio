package com.geopetro.configuracaosonda;

import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.core.exception.BusinessException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConfiguracaoSondaAccessTest {
    @Test void requiresActiveAccountAndCurrentUnitAccessForEveryRequest() {
        var accounts = mock(ContaAtivaVerificador.class);
        var monitoramento = mock(SondaMonitoramentoService.class);
        var access = new ConfiguracaoSondaAccess(monitoramento, accounts);
        when(accounts.ativa("ana")).thenReturn(true);
        when(monitoramento.usuarioPossuiAcessoAUnidade("ana", 7L)).thenReturn(true);
        assertTrue(access.permite("ana", 7));
        assertFalse(access.permite("ana", 8));
        when(accounts.ativa("ana")).thenReturn(false);
        assertEquals(403, assertThrows(BusinessException.class, () -> access.exigir("ana", 7)).getStatus().value());
        assertFalse(access.permite(null, 7)); assertFalse(access.permite("ana", -1));
    }
}
