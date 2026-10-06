package com.geopetro.cards;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.geopetro.cards.ConfiguracaoCards.*;
import com.geopetro.comum.exception.BusinessException;

class ConfiguracaoTsapTest {
    private void validar(Integer local, Integer remoto) {
        ConfiguracaoCards.validarEIdentificar(new Alteracao(0,
                new Conexao("192.168.0.3", 0, 1, 1, 1000, local, remoto), List.of()), List.of());
    }
    @Test void aceitaLegadoETsapsMasRejeitaParIncompletoOuForaDe16Bits() {
        assertDoesNotThrow(() -> validar(null, null));
        assertDoesNotThrow(() -> validar(0x0300, 0x0200));
        assertThrows(BusinessException.class, () -> validar(0x0300, null));
        assertThrows(BusinessException.class, () -> validar(null, 0x0200));
        assertThrows(BusinessException.class, () -> validar(-1, 0x0200));
        assertThrows(BusinessException.class, () -> validar(0x0300, 0x10000));
    }
}
