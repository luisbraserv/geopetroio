package com.example.demo.services;

import com.example.demo.models.ConfiguracaoSondaRemota;

/**
 * Último snapshot de limites de alarme da unidade.
 *
 * <p>As guardas de geração, unidade e revisão estão em {@link EstadoDeDocumento}. O par dos cards é
 * {@link CardsState}.
 */
public class ConfiguracaoRemotaState extends EstadoDeDocumento<ConfiguracaoSondaRemota> {

	public ConfiguracaoRemotaState() {
		this(new ConfiguracaoRemotaStore());
	}

	public ConfiguracaoRemotaState(ConfiguracaoRemotaStore store) {
		super(store);
	}
}
