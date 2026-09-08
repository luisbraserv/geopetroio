package com.example.demo.services;

import java.nio.file.Path;

import com.example.demo.config.AppPaths;
import com.example.demo.models.ConfiguracaoSondaRemota;

/**
 * Cache em disco dos limites de alarme da unidade.
 *
 * <p>Toda a mecânica está em {@link SnapshotStore} — esta classe existe para fixar o tipo e o
 * arquivo. O documento de cards tem o seu par em {@link CardsStore}, e os dois compartilham a
 * mesma implementação de propósito: são o mesmo ciclo de vida.
 */
public class ConfiguracaoRemotaStore extends SnapshotStore<ConfiguracaoSondaRemota> {

	public ConfiguracaoRemotaStore() {
		this(AppPaths.configDir().resolve("configuracao-remota.json"));
	}

	ConfiguracaoRemotaStore(Path arquivo) {
		super(arquivo, ConfiguracaoSondaRemota.class, "configuracao");
	}
}
