package com.example.demo.services;

import java.nio.file.Path;

import com.example.demo.config.AppPaths;
import com.example.demo.models.CardsDaUnidade;

/**
 * Cache em disco do documento de cards da unidade.
 *
 * <p>⚠️ <b>É o mais crítico dos dois caches.</b> Sem os limites de alarme o Desktop ainda lê o CLP e
 * publica; sem os cards ele <b>não sabe o que ler</b>, e a telemetria da unidade para por inteiro
 * (RN-088). Numa sonda que reinicia sem rede, é este arquivo que a mantém medindo.
 */
public class CardsStore extends SnapshotStore<CardsDaUnidade> {

	public CardsStore() {
		this(AppPaths.configDir().resolve("cards-da-unidade.json"));
	}

	CardsStore(Path arquivo) {
		super(arquivo, CardsDaUnidade.class, "cards");
	}
}
