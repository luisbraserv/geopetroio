package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.ChaveHidraulicaConfig;
import com.example.demo.models.PesoColunaCalculo;
import com.example.demo.models.SondaData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class SondaService {

    private static final Logger logger = LoggerFactory.getLogger(SondaService.class);

    @Autowired
    private SettingsService settingsService;

    private SondaData sondaAtual;

    private volatile double  torqueTubos             = 0.0;
    private volatile double  torqueFluante           = 0.0;
    private volatile boolean torqueTubosConfigurado   = false;
    private volatile boolean torqueFluanteConfigurado = false;
    private volatile double  pesoColunLbf          = 0.0;
    private volatile boolean pesoColunConfigurado     = false;

    /**
     * Ultimo calculo completo do peso, com os passos intermediarios.
     *
     * <p>Guardado inteiro porque a calibracao em campo precisa ver onde a conta se afasta da carga
     * conhecida — so o valor final nao diz em qual etapa esta o erro.
     */
    private volatile PesoColunaCalculo pesoColunaCalculo = PesoColunaCalculo.naoConfigurado(0);


    public SondaService() {
        this.sondaAtual = new SondaData();
        inicializarDadosPadrao();
    }

    private void inicializarDadosPadrao() {
        sondaAtual.setSondaId("SONDA-001");
        sondaAtual.setPeso(0.0);
        sondaAtual.setPressao01(0.0);
        sondaAtual.setPressao02(0.0);
        sondaAtual.setPressao03(0.0);
        sondaAtual.setPressao04(0.0);
        sondaAtual.setStroke(0.0);
        sondaAtual.setVazao(0.0);
        sondaAtual.setStatus("OK");
        sondaAtual.setAtivo(true);
        sondaAtual.atualizarTimestamp();
    }

    public SondaData obterDadosAtuais() { return sondaAtual; }

    public void atualizarDados(Double peso, Double pressao01, Double pressao02,
                               Double pressao03, Double pressao04, Double stroke) {
        sondaAtual.setPeso(peso         != null ? peso     : 0.0);
        sondaAtual.setPressao01(pressao01 != null ? pressao01 : 0.0);
        sondaAtual.setPressao02(pressao02 != null ? pressao02 : 0.0);
        sondaAtual.setPressao03(pressao03 != null ? pressao03 : 0.0);
        sondaAtual.setPressao04(pressao04 != null ? pressao04 : 0.0);
        sondaAtual.setStroke(stroke     != null ? stroke   : 0.0);
        sondaAtual.calcularVazao();
        sondaAtual.atualizarTimestamp();
        recalcularTorques();
        validarStatus();

        logger.debug("Sonda: P01={} P02={} P03={} P04={} T_tubos={} T_fluante={}",
                pressao01, pressao02, pressao03, pressao04, torqueTubos, torqueFluante);
    }

    public synchronized void updateFlowRate(Double flowRateBblMin, Double stroke) {
        sondaAtual.setVazao(flowRateBblMin != null ? flowRateBblMin : 0.0);
        sondaAtual.setStroke(stroke        != null ? stroke         : 0.0);
        sondaAtual.atualizarTimestamp();
        validarStatus();
    }

    private void recalcularTorques() {
        AppSettings settings = settingsService.loadSettings();

        ChaveHidraulicaConfig chaveTubos   = settings.getChaveTubos();
        ChaveHidraulicaConfig chaveFluante = settings.getChaveFlutuante();
        com.example.demo.models.PesoColunaConfig pesoCol = settings.getPesoColuna();

        torqueTubosConfigurado   = chaveTubos.isConfigurado();
        torqueFluanteConfigurado = chaveFluante.isConfigurado();
        pesoColunConfigurado     = pesoCol != null && pesoCol.isConfigurado();

        torqueTubos = torqueTubosConfigurado
                ? HydraulicTorqueCalculator.calculateTorque(
                        HydraulicTorqueCalculator.calculateEffectivePressurePsi(sondaAtual.getPressao02()),
                        chaveTubos.getDiametroPistaoIn(),
                        chaveTubos.getDiametroHasteIn(),
                        chaveTubos.getBracoAlavancaFt(),
                        chaveTubos.getTipoMovimento())
                : 0.0;

        torqueFluante = torqueFluanteConfigurado
                ? HydraulicTorqueCalculator.calculateTorque(
                        HydraulicTorqueCalculator.calculateEffectivePressurePsi(sondaAtual.getPressao03()),
                        chaveFluante.getDiametroPistaoIn(),
                        chaveFluante.getDiametroHasteIn(),
                        chaveFluante.getBracoAlavancaFt(),
                        chaveFluante.getTipoMovimento())
                : 0.0;

        // O sensor esta no sargento e mede a reacao da linha morta, nao o peso no gancho:
        // a conversao percorre forca -> torque -> tracao -> carga suspensa -> desconto da Catarina.
        pesoColunaCalculo = PesoColunaCalculator.calcular(sondaAtual.getPressao01(), pesoCol);
        pesoColunLbf = Math.round(pesoColunaCalculo.pesoColunaLbf() * 100.0) / 100.0;
    }

    private void validarStatus() {
        if (sondaAtual.getPeso() == null || sondaAtual.getPeso() < 0) {
            sondaAtual.setStatus("ERRO");
        } else if (sondaAtual.getPressao01() > 500 || sondaAtual.getPressao02() > 500) {
            sondaAtual.setStatus("ALERTA");
        } else {
            sondaAtual.setStatus("OK");
        }
    }

    public Double getPeso()      { return sondaAtual.getPeso(); }
    public Double getPressao01() { return sondaAtual.getPressao01(); }
    public Double getPressao02() { return sondaAtual.getPressao02(); }
    public Double getPressao03() { return sondaAtual.getPressao03(); }
    public Double getPressao04() { return sondaAtual.getPressao04(); }
    public Double getVazao()     { return sondaAtual.getVazao(); }
    public Double getStroke()    { return sondaAtual.getStroke(); }
    public String getStatus()    { return sondaAtual.getStatus(); }

    public double  getTorqueTubos()              { return torqueTubos; }
    public double  getTorqueFluante()            { return torqueFluante; }
    public boolean isTorqueTubosConfigurado()    { return torqueTubosConfigurado; }
    public boolean isTorqueFluanteConfigurado()  { return torqueFluanteConfigurado; }
    public double  getPesoColumLbf()             { return pesoColunLbf; }
    public PesoColunaCalculo getPesoColunaCalculo()  { return pesoColunaCalculo; }
    public boolean isPesoColunConfigurado()      { return pesoColunConfigurado; }

    // ------------------------------------------------------------------
    // Valores brutos do CLP (diagnostico)
    // ------------------------------------------------------------------

    /**
     * Ultimo valor lido de cada endereco do DB1, sem conversao.
     *
     * <p>Estado transiente, de proposito fora de {@link SondaData}: serve so a tela e nao deve
     * entrar no historico gravado nem na telemetria.
     *
     * <p>Existe porque a conversao para PSI limita a faixa 4-20 mA — canal em zero e pressao zero
     * de verdade chegam ambos como 0 PSI. O bruto e o que separa os dois casos.
     */
    private final java.util.Map<Integer, Long> valoresBrutos = new java.util.concurrent.ConcurrentHashMap<>();

    /** Escrito pela thread de leitura do CLP, lido pela thread da UI. */
    public void registrarValorBruto(int endereco, long valor) {
        valoresBrutos.put(endereco, valor);
    }

    /** {@code null} enquanto aquele endereco nunca foi lido — a tela mostra "--". */
    public Long getValorBruto(int endereco) {
        return valoresBrutos.get(endereco);
    }

    public void limparValoresBrutos() {
        valoresBrutos.clear();
    }
}
