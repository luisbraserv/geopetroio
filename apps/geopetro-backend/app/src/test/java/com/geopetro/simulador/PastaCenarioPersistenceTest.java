package com.geopetro.simulador;

import com.geopetro.comum.exception.ResourceNotFoundException;
import com.geopetro.simulador.adapter.in.web.CenarioSimuladorController;
import com.geopetro.simulador.adapter.in.web.PastaSimuladorController;
import com.geopetro.simulador.adapter.in.web.request.CenarioRequest;
import com.geopetro.simulador.adapter.in.web.request.PastaRequest;
import com.geopetro.simulador.adapter.out.persistence.repository.*;
import com.geopetro.simulador.application.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Controllers e persistência reais com H2 isolado; não acessa o banco do usuário. */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = { PocoPersistenceTest.Config.class, PastaCenarioPersistenceTest.Config.class })
class PastaCenarioPersistenceTest {
    @Configuration static class Config {
        @Bean PastaSimuladorService pastas(PastaSimuladorJpaRepository repository) { return new PastaSimuladorService(repository); }
    }
    @Autowired PastaSimuladorService pastas;
    @Autowired CenarioSimuladorService cenarios;
    @Autowired CenarioSimuladorJpaRepository cenarioRepository;
    @Autowired PastaSimuladorJpaRepository pastaRepository;
    @Autowired PlatformTransactionManager tm;
    private MockMvc http;

    @BeforeEach void setup() {
        cenarioRepository.deleteAll(); pastaRepository.deleteAll();
        http = MockMvcBuilders.standaloneSetup(new CenarioSimuladorController(cenarios), new PastaSimuladorController(pastas)).build();
    }
    private CenarioRequest request(String name, String operation, Long folder) {
        return new CenarioRequest(name, operation, folder,
                "{\"schemaVersion\":2,\"selectedPhaseId\":\"production\"}", null, null,
                "{\"reportSchemaVersion\":1,\"cliente\":\"Cliente A\"}");
    }

    @Test void filtersByOperationAndFolderAndPreservesDataOnRenameAndMove() throws Exception {
        var a = pastas.criar(new PastaRequest("Campanha A", "primaria"), "teste");
        var b = pastas.criar(new PastaRequest("Campanha B", "primaria"), "teste");
        var primary = cenarios.criar(request("Primária", "primaria", a.getId()), "teste");
        cenarios.criar(request("Squeeze", "squeeze", null), "teste");
        cenarios.criar(request("Avulso", "primaria", null), "teste");
        assertThat(cenarios.listar("primaria", a.getId())).extracting("id").containsExactly(primary.getId());
        assertThat(cenarios.listarSemPasta("primaria")).extracting("nome").containsExactly("Avulso");
        var moved = cenarios.atualizar(primary.getId(), request("Renomeado", "primaria", b.getId()));
        assertThat(moved.getId()).isEqualTo(primary.getId());
        assertThat(moved.getFormValue()).contains("selectedPhaseId");
        assertThat(moved.getDadosRelatorio()).contains("Cliente A");
        assertThat(cenarios.listar("primaria", a.getId())).isEmpty();
        http.perform(get("/api/simulador/cenarios").param("operacao", "primaria").param("pastaId", b.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].nome").value("Renomeado"))
                .andExpect(jsonPath("$[0].dadosRelatorio").value(moved.getDadosRelatorio()));
        http.perform(get("/api/simulador/cenarios/sem-pasta").param("operacao", "primaria"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test void rejectsCrossOperationAssociationsAndOperationChangesWithoutModifyingTheScenario() {
        var folder = pastas.criar(new PastaRequest("Squeeze", "squeeze"), "teste");
        var scenario = cenarios.criar(request("Primária", "primaria", null), "teste");
        assertThatThrownBy(() -> cenarios.listar("primaria", folder.getId())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> cenarios.criar(request("Inválido", "primaria", folder.getId()), "teste")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> cenarios.atualizar(scenario.getId(), request("Inválido", "primaria", folder.getId()))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> cenarios.atualizar(scenario.getId(), request("Convertido", "squeeze", null))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> pastas.renomear(folder.getId(), new PastaRequest("Convertida", "primaria"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(cenarios.buscar(scenario.getId()).getNome()).isEqualTo("Primária");
        assertThat(cenarios.buscar(scenario.getId()).getPasta()).isNull();
    }

    @Test void countsFoldersAndDeletesOnlyTheConfirmedFolderContents() throws Exception {
        var folder = pastas.criar(new PastaRequest("Excluir", "primaria"), "teste");
        var one = cenarios.criar(request("Um", "primaria", folder.getId()), "teste");
        var two = cenarios.criar(request("Dois", "primaria", folder.getId()), "teste");
        var preserved = cenarios.criar(request("Avulso", "primaria", null), "teste");
        new TransactionTemplate(tm).executeWithoutResult(tx -> {
            try { http.perform(get("/api/simulador/pastas").param("operacao", "primaria"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$[0].totalCenarios").value(2)); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
        http.perform(delete("/api/simulador/pastas/{id}", folder.getId())).andExpect(status().isNoContent());
        assertThatThrownBy(() -> cenarios.buscar(one.getId())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> cenarios.buscar(two.getId())).isInstanceOf(ResourceNotFoundException.class);
        assertThat(cenarios.buscar(preserved.getId()).getNome()).isEqualTo("Avulso");
    }
}
