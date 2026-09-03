package com.example.braservhorusdesktop;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import org.junit.jupiter.api.Test;

class BraservHorusDesktopApplicationTests {

    @Test
    void classesPrincipaisDevemSerInstanciadas() {
        assertDoesNotThrow(JavaFxApp::new);
        assertDoesNotThrow(Launcher::new);
    }

}
