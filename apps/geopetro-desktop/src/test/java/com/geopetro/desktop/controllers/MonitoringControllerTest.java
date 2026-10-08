package com.geopetro.desktop.controllers;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.test.util.ReflectionTestUtils;
import com.geopetro.desktop.alarmes.AlarmesDaEstacao;
import com.geopetro.desktop.alarmes.AlarmesLocais;
import com.geopetro.desktop.alarmes.AvaliadorLocalDeAlarme;
import com.geopetro.desktop.aquisicao.PlcConnectionService;
import com.geopetro.desktop.aquisicao.SondaService;
import com.geopetro.desktop.cards.CardsDaUnidade.*;
import com.geopetro.desktop.cards.CardsDaUnidade;
import com.geopetro.desktop.configuracoes.AppSettings;
import com.geopetro.desktop.configuracoes.SettingsService;
import com.geopetro.desktop.services.*;
import com.geopetro.desktop.telemetria.TelemetriaRealtimeService;
import javafx.animation.Animation;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.layout.FlowPane;
import javafx.scene.layout.StackPane;

@EnabledIfSystemProperty(named = "fx.disponivel", matches = "true")
class MonitoringControllerTest {
    @BeforeAll static void toolkit() throws Exception {
        var ready = new CountDownLatch(1);
        try { Platform.startup(ready::countDown); }
        catch (IllegalStateException alreadyStarted) { ready.countDown(); }
        assertTrue(ready.await(20, TimeUnit.SECONDS));
    }

    private static CardsDaUnidade documento(long revisao, String nome, boolean ativo) {
        return new CardsDaUnidade(1, 1, revisao, Conexao.padrao(), List.of(
                new Card("PRESSAO_01", nome, Tipo.PRESSAO, 10, ativo, true, 0, Parametros.vazio()),
                new Card("CONTADOR_STROKE_01", "Bomba", Tipo.CONTADOR_STROKE, 0, ativo, false, 1, Parametros.vazio())), null, null);
    }

    @Test void cardsAparecemSemClpSobrevivemANavegacaoEAtualizamComADefinicao() throws Exception {
        onFx(() -> {
            var doc = new AtomicReference<>(documento(3, "Pressão", true));
            var settings = new AppSettings(); settings.setUnidadeId(1L);
            var settingsService = mock(SettingsService.class); when(settingsService.loadSettings()).thenReturn(settings);
            var realtime = mock(TelemetriaRealtimeService.class);
            when(realtime.cardsAtuais(settings)).thenAnswer(inv -> Optional.ofNullable(doc.get()));
            try (var context = new AnnotationConfigApplicationContext()) {
                context.registerBean(SettingsService.class, () -> settingsService);
                context.registerBean(SondaService.class, SondaService::new);
                context.registerBean(TelemetriaRealtimeService.class, () -> realtime);
                context.registerBean(PlcConnectionService.class, () -> mock(PlcConnectionService.class));
                context.registerBean(AlarmesLocais.class, () -> mock(AlarmesLocais.class));
                // O sininho de cada card consulta a configuracao local; sem o duble o contexto nao sobe.
                context.registerBean(AlarmesDaEstacao.class, () -> mock(AlarmesDaEstacao.class));
                context.register(MonitoringController.class); context.refresh();
                var host = new StackPane(); new Scene(host, 1160, 700);
                var first = montar(host, context);
                assertEquals(4, pane(first.root()).getChildren().size());
                assertTrue(labels(first.root()).contains("CLP desconectado"),
                        "a falta de leitura precisa ter motivo visível no card");
                var timer = (Timeline) ReflectionTestUtils.getField(first.controller(), "timeline");
                assertEquals(Animation.Status.RUNNING, timer.getStatus());
                host.getChildren().clear();
                assertEquals(Animation.Status.STOPPED, timer.getStatus(), "sair da tela encerra a atualização");
                var second = montar(host, context);
                assertNotSame(first.controller(), second.controller());
                assertEquals(4, pane(second.root()).getChildren().size(), "voltar não deixa o painel vazio");
                doc.set(documento(4, "Pressão da linha", true)); second.controller().updateData();
                assertTrue(labels(second.root()).contains("Pressão da linha"));
                doc.set(documento(5, "Pressão da linha", false)); second.controller().updateData();
                assertEquals(0, pane(second.root()).getChildren().size());
                assertTrue(((Label) second.root().lookup("#estadoMonitoramento")).getText().contains("desativados"));
                doc.set(CardsDaUnidade.vazio(1)); second.controller().updateData();
                assertTrue(((Label) second.root().lookup("#estadoMonitoramento")).getText().contains("ainda não tem cards"));
                host.getChildren().clear();
            }
        });
    }

    /**
     * O sininho de cada card, e o destaque que sobrevive a falta de leitura.
     *
     * <p>⚠️ O segundo caso e o que mais custa se quebrar: grandeza sem valor NAO desmente alarme
     * nenhum (RN-099). Condicionar o destaque a ter valor apagava o aviso por FALTA DE DADO — o
     * motor preservava o estado e a tela o jogava fora.
     */
    @Test void oSininhoAparecePorCardEODestaqueSobreviveAFaltaDeLeitura() throws Exception {
        onFx(() -> {
            var settings = new AppSettings(); settings.setUnidadeId(1L);
            var settingsService = mock(SettingsService.class); when(settingsService.loadSettings()).thenReturn(settings);
            var realtime = mock(TelemetriaRealtimeService.class);
            when(realtime.cardsAtuais(settings)).thenReturn(Optional.of(documento(3, "Pressão", true)));

            var alarmesLocais = mock(AlarmesLocais.class);
            when(alarmesLocais.severidadeDe(any())).thenReturn(AvaliadorLocalDeAlarme.Severidade.CRITICO);

            var daEstacao = mock(AlarmesDaEstacao.class);
            when(daEstacao.para(eq("PRESSAO_01"), any()))
                    .thenReturn(new AlarmesDaEstacao.AlarmeLocal("PRESSAO_01", null, null, 120.0, true));

            try (var context = new AnnotationConfigApplicationContext()) {
                context.registerBean(SettingsService.class, () -> settingsService);
                context.registerBean(SondaService.class, SondaService::new);
                context.registerBean(TelemetriaRealtimeService.class, () -> realtime);
                context.registerBean(PlcConnectionService.class, () -> mock(PlcConnectionService.class));
                context.registerBean(AlarmesLocais.class, () -> alarmesLocais);
                context.registerBean(AlarmesDaEstacao.class, () -> daEstacao);
                context.register(MonitoringController.class); context.refresh();

                var host = new StackPane(); new Scene(host, 1160, 700);
                var tela = montar(host, context);

                // Um sininho por card: quatro grandezas, quatro sinos.
                var sinos = tela.root().lookupAll(".button").stream()
                        .filter(javafx.scene.control.Button.class::isInstance)
                        .map(javafx.scene.control.Button.class::cast)
                        .filter(b -> "🔔".equals(b.getText()) || "🔕".equals(b.getText())).toList();
                assertEquals(4, sinos.size(), "cada card tem o seu sininho");

                // Sem leitura do CLP, o destaque vem do motor e nao do ciclo.
                assertTrue(labels(tela.root()).contains("CRÍTICO"),
                        "o alarme segue aceso: nao houve medicao que o desminta");
                host.getChildren().clear();
            }
        });
    }

    private record Tela(Parent root, MonitoringController controller) {}
    private Tela load(AnnotationConfigApplicationContext context) throws Exception {
        var loader = new FXMLLoader(getClass().getResource("/views/monitoring.fxml"));
        loader.setControllerFactory(context::getBean);
        return new Tela(loader.load(), loader.getController());
    }
    /**
     * Prende a tela ao host e força um passo de CSS/layout.
     *
     * <p>O monitoramento passou a ter um {@code ScrollPane} na raiz — é o que devolveu acesso aos
     * cards que não cabem numa tela de 720px. O {@code ScrollPane} só leva seu conteúdo para dentro
     * da árvore que {@code lookup} percorre depois que o skin nasce, e o skin nasce num passo de
     * layout. Sem isto o {@code #cardsPane} aparece como ausente e o teste falha por encanamento, e
     * não por comportamento — a mesma armadilha já anotada no {@code SettingsViewTest}.
     */
    private Tela montar(StackPane host, AnnotationConfigApplicationContext context) throws Exception {
        var tela = load(context);
        host.getChildren().setAll(tela.root());
        host.applyCss();
        host.layout();
        return tela;
    }

    @Test void gradeMantemProporcoesSemSobreposicaoAoReduzirJanela() throws Exception {
        onFx(() -> {
            var grid = new DashboardGrid();
            var host = new StackPane(grid);
            new Scene(host, 1200, 640);
            String prefix = java.util.UUID.randomUUID().toString();
            for (int i = 0; i < 6; i++) {
                assertTrue(grid.addCard(prefix+i, new StackPane(new Label("Indicador " + i)), i < 2 ? 1 : 2));
            }
            for (double[] size : new double[][] {{1200,640}, {800,420}, {600,300}}) {
                host.resize(size[0],size[1]); host.applyCss(); host.layout();
                var nodes = grid.getChildren();
                double gap = nodes.get(0).getLayoutX()*2;
                assertEquals((nodes.get(0).getLayoutBounds().getWidth()+gap)*2,
                        nodes.get(2).getLayoutBounds().getWidth()+gap, 0.1);
                for (int i = 0; i < nodes.size(); i++) {
                    var a = nodes.get(i).localToParent(nodes.get(i).getLayoutBounds());
                    assertTrue(a.getMinX() >= 0 && a.getMaxX() <= grid.getWidth());
                    assertTrue(a.getMinY() >= 0 && a.getMaxY() <= grid.getHeight());
                    for (int j = i+1; j < nodes.size(); j++) assertFalse(a.intersects(nodes.get(j).localToParent(nodes.get(j).getLayoutBounds())));
                }
            }
            for (int i = 6; i < 16; i++) grid.addCard(prefix+i,new StackPane(new Label("Extra")),2);
            assertTrue(grid.pageCount() > 1);
            grid.showPage(1); host.layout();
            assertFalse(grid.getChildren().get(0).isVisible());
            assertTrue(grid.getChildren().stream().anyMatch(javafx.scene.Node::isVisible));
        });
    }
    @Test void arrasteSobreConteudoMoveTrocaERedimensiona() throws Exception {
        onFx(() -> {
            var grid = new DashboardGrid(false);
            var label = new Label("Arraste aqui");
            label.setOnMousePressed(javafx.scene.input.MouseEvent::consume);
            var content = new StackPane(label);
            grid.addCard("drag-test-a", content, 2);
            grid.addCard("drag-test-b", new StackPane(new Label("Segundo")), 2);
            var host = new StackPane(grid); new Scene(host,800,400);
            host.applyCss(); host.layout();
            var frame = (StackPane)grid.getChildren().get(0);
            var second = grid.getChildren().get(1);
            double originalX = frame.getLayoutX();
            double secondX = second.getLayoutX();
            mouse(label, javafx.scene.input.MouseEvent.MOUSE_PRESSED,0,0);
            mouse(label, javafx.scene.input.MouseEvent.MOUSE_DRAGGED,200,0);
            assertTrue(frame.getPseudoClassStates().contains(javafx.css.PseudoClass.getPseudoClass("dragging")));
            assertEquals(200,frame.getTranslateX(),0.1,"o card acompanha o mouse sobre o texto");
            mouse(label, javafx.scene.input.MouseEvent.MOUSE_RELEASED,200,0);
            host.layout();
            assertFalse(frame.getPseudoClassStates().contains(javafx.css.PseudoClass.getPseudoClass("dragging")));
            assertEquals(secondX,frame.getLayoutX(),0.1,"troca para o lugar ocupado");
            assertEquals(originalX,second.getLayoutX(),0.1);
            mouse(label, javafx.scene.input.MouseEvent.MOUSE_PRESSED,0,0);
            mouse(label, javafx.scene.input.MouseEvent.MOUSE_DRAGGED,0,200);
            mouse(label, javafx.scene.input.MouseEvent.MOUSE_RELEASED,0,200);
            host.layout();
            assertTrue(frame.getLayoutY()>200,"move para a segunda fileira");
            var grip=frame.getChildren().get(1);
            double originalWidth=frame.getWidth();
            mouse(grip, javafx.scene.input.MouseEvent.MOUSE_PRESSED,0,0);
            mouse(grip, javafx.scene.input.MouseEvent.MOUSE_DRAGGED,100,0);
            mouse(grip, javafx.scene.input.MouseEvent.MOUSE_RELEASED,100,0);
            host.layout();
            assertEquals(originalWidth+100,frame.getWidth(),0.1,"redimensiona uma coluna");
        });
    }
    private static void mouse(javafx.scene.Node target, javafx.event.EventType<javafx.scene.input.MouseEvent> type, double x, double y) {
        target.fireEvent(new javafx.scene.input.MouseEvent(type,x,y,x,y,
                javafx.scene.input.MouseButton.PRIMARY,1,false,false,false,false,
                type != javafx.scene.input.MouseEvent.MOUSE_RELEASED,false,false,false,false,false,
                new javafx.scene.input.PickResult(target,x,y)));
    }
    @Test void layoutLocalRestauraTamanhoEPosicaoAoReabrir(@org.junit.jupiter.api.io.TempDir java.nio.file.Path dir) throws Exception {
        onFx(() -> {
            var file = dir.resolve("dashboard-layout.properties");
            var grid = new DashboardGrid(file,true);
            grid.addCard("unidade-1|pressao",new StackPane(new Label("Pressão")),2);
            var host = new StackPane(grid); new Scene(host,800,400); host.applyCss(); host.layout();
            var frame=(StackPane)grid.getChildren().get(0);
            mouse(frame,javafx.scene.input.MouseEvent.MOUSE_PRESSED,0,0);
            mouse(frame,javafx.scene.input.MouseEvent.MOUSE_DRAGGED,200,100);
            mouse(frame,javafx.scene.input.MouseEvent.MOUSE_RELEASED,200,100);
            host.layout();
            var grip=frame.getChildren().get(1);
            mouse(grip,javafx.scene.input.MouseEvent.MOUSE_PRESSED,0,0);
            mouse(grip,javafx.scene.input.MouseEvent.MOUSE_DRAGGED,100,0);
            mouse(grip,javafx.scene.input.MouseEvent.MOUSE_RELEASED,100,0);
            host.layout();
            assertTrue(java.nio.file.Files.exists(file));
            var restored=new DashboardGrid(file,true);
            restored.addCard("unidade-1|pressao",new StackPane(),2);
            host.getChildren().setAll(restored); host.applyCss(); host.layout();
            var tile=restored.getChildren().get(0);
            assertEquals(frame.getLayoutX(),tile.getLayoutX(),0.1);
            assertEquals(frame.getLayoutY(),tile.getLayoutY(),0.1);
            assertEquals(frame.getWidth(),tile.getLayoutBounds().getWidth(),0.1);
            var otherUnit=new DashboardGrid(file,true);
            otherUnit.addCard("unidade-2|pressao",new StackPane(),2);
            host.getChildren().setAll(otherUnit); host.applyCss(); host.layout();
            assertTrue(otherUnit.getChildren().get(0).getLayoutX()<tile.getLayoutX());
        });
    }
    @Test void trocaPeloCardSobMouseMesmoComTamanhosDiferentes() throws Exception {
        onFx(() -> {
            var grid=new DashboardGrid(false);
            for(int i=0;i<4;i++) grid.addCard("pointer-test-"+i,new StackPane(new Label("Card")),i==1 || i==2 ? 1:2);
            var host=new StackPane(grid); new Scene(host,800,400); host.applyCss();host.layout();
            var dragged=grid.getChildren().get(0);
            var target=grid.getChildren().get(2);
            double sourceX=dragged.getLayoutX(), targetX=target.getLayoutX();
            // Grab off-center, drop inside the narrow card; the wide footprint also hits its neighbor.
            mouse(dragged,javafx.scene.input.MouseEvent.MOUSE_PRESSED,140,120);
            mouse(dragged,javafx.scene.input.MouseEvent.MOUSE_DRAGGED,350,100);
            mouse(dragged,javafx.scene.input.MouseEvent.MOUSE_RELEASED,350,100);
            host.layout();
            assertEquals(targetX,dragged.getLayoutX(),0.1);
            assertEquals(sourceX,target.getLayoutX(),0.1);
            assertEquals(190,dragged.getLayoutBounds().getWidth(),0.1);
            assertEquals(90,target.getLayoutBounds().getWidth(),0.1);
            for(var a:grid.getChildren()) for(var b:grid.getChildren()) if(a!=b)
                assertFalse(a.localToParent(a.getLayoutBounds()).intersects(b.localToParent(b.getLayoutBounds())));
        });
    }
    @Test void conteudoReorganizaEInstrumentosCrescemComOCard() throws Exception {
        onFx(() -> {
            var thermometer=new TermometroView(20,150,"°C"); thermometer.setValor(85.0);
            var tank=new TanqueView(FormaTanque.RETANGULAR); tank.atualizar(.55,true);
            var root=new javafx.scene.layout.Pane();
            root.setStyle("-fx-background-color: #f7f9fc;");
            root.getStylesheets().add(getClass().getResource("/views/geopetro-design-system.css").toExternalForm());
            new Scene(root,1020,650);
            var generic=new javafx.scene.shape.SVGPath(); generic.setContent("M12,3A9,9 0 1,0 21,12H18A6,6 0 1,1 12,6Z");
            var visuals=java.util.List.of(thermometer,tank,generic);
            for(int i=0;i<3;i++) {
                var value=new Label(i==0 ? "85.0" : i==1 ? "42.5" : "1250");
                value.getStyleClass().add("card-grandeza-valor");
                var raw=new Label("DBW4  512"); raw.getStyleClass().add("valor-bruto");
                var alarm=new Label(); alarm.setManaged(false); alarm.setVisible(false);
                var card=new IndicatorCardView(i==0 ? "Temperatura" : i==1 ? "Nível Tanque" : "Pressão da linha",
                        i==0 ? "°C" : i==1 ? "bbl" : "psi",visuals.get(i),i<2,value,raw,alarm,new javafx.scene.control.Button("♟"),new javafx.scene.control.Button("⚙"));
                card.getStyleClass().add("card-grandeza");
                card.setManaged(false);
                root.getChildren().add(card);
                card.resizeRelocate(12+i*170,12,156,600);
                root.applyCss(); card.layout();
                assertEquals(0,value.getTransforms().size(),"o valor não é encolhido junto com o card");
                assertTrue(value.getFont().getSize()>=45,"valor legível mesmo em uma coluna");
                if(i==0) {
                    double tall=thermometer.getHeight();
                    card.resize(156,300);card.layout();
                    assertTrue(thermometer.getHeight()<tall*.75);
                    card.resize(156,600);card.layout();
                }
                if(i==1) assertTrue(tank.getHeight()>300,"o desenho ocupa a altura disponível");
            }
            root.applyCss();root.layout();
            for(int i=0;i<2;i++) {
                var value=new Label("1250.5"); value.getStyleClass().add("card-grandeza-valor");
                var alarm=new Label();alarm.setManaged(false);alarm.setVisible(false);
                var icon=new javafx.scene.shape.SVGPath();icon.setContent("M12,3A9,9 0 1,0 21,12H18A6,6 0 1,1 12,6Z");
                var card=new IndicatorCardView("Pressão da linha","psi",icon,false,value,new Label("DBW0  512"),alarm,new javafx.scene.control.Button("♟"),new javafx.scene.control.Button("⚙"));
                card.getStyleClass().add("card-grandeza");card.setManaged(false);
                if(i==1) card.pseudoClassStateChanged(javafx.css.PseudoClass.getPseudoClass("dragging"),true);
                root.getChildren().add(card);card.resizeRelocate(540,12+i*315,i==0 ? 310 : 156,300);
                card.applyCss();card.layout();
                assertTrue(value.getHeight()>=value.getFont().getSize(),"o valor não pode ser cortado na vertical");
            }
            var snapshot=root.snapshot(null,null);
            var buffered=new java.awt.image.BufferedImage((int)snapshot.getWidth(),(int)snapshot.getHeight(),java.awt.image.BufferedImage.TYPE_INT_ARGB);
            var pixels=snapshot.getPixelReader();
            for(int y=0;y<buffered.getHeight();y++) for(int x=0;x<buffered.getWidth();x++) buffered.setRGB(x,y,pixels.getArgb(x,y));
            javax.imageio.ImageIO.write(buffered,"png",java.nio.file.Path.of("target","responsive-cards-preview.png").toFile());
        });
    }
    private static DashboardGrid pane(Parent root) { return (DashboardGrid) root.lookup("#cardsPane"); }
    private static List<String> labels(Parent root) {
        return root.lookupAll(".label").stream().filter(Label.class::isInstance).map(Label.class::cast).map(Label::getText).toList();
    }
    @FunctionalInterface interface FxTask { void run() throws Exception; }
    private static void onFx(FxTask task) throws Exception {
        var done = new CountDownLatch(1); var error = new AtomicReference<Throwable>();
        Platform.runLater(() -> { try { task.run(); } catch (Throwable e) { error.set(e); } finally { done.countDown(); } });
        assertTrue(done.await(30, TimeUnit.SECONDS));
        if (error.get() != null) throw new AssertionError(error.get());
    }
}
