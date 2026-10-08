package com.geopetro.desktop;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import java.util.Arrays;

/**
 * As regras da organização por assunto — {@code specs/estrutura-de-pacotes.md} §3 e §4.
 *
 * <p>Quebrou? Antes de afrouxar a regra, veja se a classe não está no pacote errado.
 */
@AnalyzeClasses(packages = "com.geopetro.desktop", importOptions = ImportOption.DoNotIncludeTests.class)
class EstruturaDePacotesTest {

    private static final String RAIZ = "com.geopetro.desktop";

    private static final String[] ASSUNTOS = {
            RAIZ + ".app..", RAIZ + ".comum..", RAIZ + ".configuracoes..", RAIZ + ".sessao..",
            RAIZ + ".cards..", RAIZ + ".aquisicao..", RAIZ + ".conversao..", RAIZ + ".calculos..",
            RAIZ + ".monitoramento..", RAIZ + ".alarmes..", RAIZ + ".telemetria..",
            RAIZ + ".historico..", RAIZ + ".cartaoperacao.."
    };

    /** Na raiz fica só a classe principal; todo o resto mora em um assunto. */
    @ArchTest
    static final ArchRule todaClasseMoraEmUmAssunto = classes()
            .that().resideInAPackage(RAIZ + "..")
            .and().doNotHaveSimpleName("GeopetroDesktopApplication")
            .should().resideInAnyPackage(ASSUNTOS);

    /** Regra pura não conhece tela — §4.2. */
    @ArchTest
    static final ArchRule regraPuraNaoConheceTela = noClasses()
            .that().resideInAnyPackage(RAIZ + ".conversao..", RAIZ + ".calculos..")
            .should().dependOnClassesThat().resideInAPackage("javafx..");

    /**
     * Regra pura só depende de si mesma e do documento de cards, que traz os parâmetros de tanque e
     * temperatura.
     */
    @ArchTest
    static final ArchRule regraPuraNaoDependeDoResto = noClasses()
            .that().resideInAnyPackage(RAIZ + ".conversao..", RAIZ + ".calculos..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    RAIZ + ".app..", RAIZ + ".comum..", RAIZ + ".configuracoes..", RAIZ + ".sessao..",
                    RAIZ + ".aquisicao..", RAIZ + ".monitoramento..", RAIZ + ".alarmes..",
                    RAIZ + ".telemetria..", RAIZ + ".historico..", RAIZ + ".cartaoperacao..");

    /** O que todos usam não pode depender de nenhum assunto — §4.3. */
    @ArchTest
    static final ArchRule comumNaoDependeDeAssunto = noClasses()
            .that().resideInAPackage(RAIZ + ".comum..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    Arrays.stream(ASSUNTOS).filter(p -> !p.equals(RAIZ + ".comum..")).toArray(String[]::new));
}
