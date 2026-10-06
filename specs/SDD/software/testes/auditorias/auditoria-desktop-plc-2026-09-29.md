# Auditoria da leitura do PLC — 29/09/2026

## Configuração analisada

LOGO em `192.168.0.3`, rack 0, slot 1, DB1 e intervalo 1000 ms.
Contador de stroke em DBD0 (bytes 0–3), constante 0,0324 bbl/stroke.
Peso em DBW4 (bytes 4–5), range 400 bar e calibração local preenchida.
Os endereços coincidem com o mapeamento V apresentado no LOGO!Soft Comfort.
O usuário confirmou `Allow S7 access` habilitado e informou que a sessão conecta.

## Achados e alterações

- A interface informava conexão bem-sucedida antes da primeira leitura. Agora só
  confirma depois de receber e converter os bytes dos cards. Erros mostram o DB,
  a faixa de bytes e o código/mensagem S7 retornado pelo driver.
- A ausência de valor tinha motivo calculado, mas esse motivo não era incluído no
  componente visual. Agora os cards exibem a razão, sem apresentar zero como dado
  válido. O painel mostra também a última leitura e o erro de interrupção.
- Falhas no encaminhamento MQTT/tempo real podiam chegar ao tratamento que
  desconectava o PLC. Agora cada canal é isolado, preservando aquisição e tela local.
- Alterar IP/unidade/conexão durante a aquisição podia misturar a configuração nova
  com a sessão antiga. A leitura agora exige reconexão nesse caso. O acesso ao driver
  é serializado com conectar/desconectar, e valores brutos antigos são limpos ao sair.
- Acrescentado modo opcional de TSAP explícito para LOGO. Configurações existentes
  continuam usando rack/slot. Local/remoto são vistos pelo Desktop, em hexadecimal;
  os valores devem coincidir, cruzados, com os configurados no LOGO.
- Logs passam a persistir em `%USERPROFILE%\.geopetro-io\logs\geopetro-desktop.log`,
  incluindo os bytes recebidos. Rotação de 10 MB, retenção de 7 dias, limite de 100 MB.

## Compatibilidade

O modo TSAP acrescenta `tsapLocal` e `tsapRemoto` opcionais ao documento compartilhado.
O Backend foi ajustado para validar e persistir o par. A cópia entre unidades preserva
os campos. Para usar esse modo é necessário atualizar o Backend; se um servidor antigo
descartar os campos, o Desktop avisa e não apresenta a gravação como concluída.
As correções de leitura e diagnóstico funcionam com a conexão rack/slot já existente.
Não é necessário habilitar TSAP se a sessão atual já conecta e lê o DB corretamente.

## Validação

- 101 testes do Desktop aprovados: aquisição, conversão, configuração, cache offline,
  cópia, monitoramento, calibração/FXML e ajustes da estação.
- Teste adicional aprovado com o driver Moka7 real em TCP contra um servidor S7
  simulado: negociação ISO/S7 e leitura de 6 bytes do DB1, decodificando DBD0=123
  e DBW4=350. Esse teste não usa mock do driver nem escreve no PLC.
- 20 testes do Backend aprovados, incluindo validação de TSAP e regras dos cards.
- Casos cobertos: sessão aberta com DB recusado, timeout de conexão, queda durante
  leitura, falha de ambos os canais de publicação, mudança de IP e configuração TSAP.

## Limite da conclusão

A falha específica no equipamento físico ainda não foi reproduzida. Durante os testes
nesta máquina a Ethernet estava desconectada, o Wi-Fi tinha IP `192.168.10.109/24` e
o acesso TCP a `192.168.0.3:102` expirou, inclusive fora do sandbox. Isso descreve
somente o momento da verificação, não invalida a conexão relatada pelo usuário.
Não houve alteração de programa, memória ou configuração do PLC.

Após instalar, manter inicialmente a conexão atual, conectar e conferir o horário
da leitura e os brutos DBD0/DBW4. Se a sessão abrir e o DB falhar, a tela agora mostra
a resposta do driver. Brutos recebidos mas sem variação exigem conferir os valores
online e o mapeamento VM no LOGO; erro de conversão mostra o motivo no próprio card.

Referências: [conexão LOGO no Snap7](https://snap7.sourceforge.net/logo.html),
[rack/slot e TSAP no Snap7](https://snap7.sourceforge.net/plc_connection.html).

## Entrega

Instalador: [Geopetro Desktop 0.1.0.4](../../../../../Geopetro-Desktop/target/dist/installer/Geopetro%20Desktop-0.1.0.4.exe).
Backend compatível com TSAP: [Geopetro-Backend-0.0.1-SNAPSHOT.jar](../../../../../apps/geopetro-backend/app/target/Geopetro-Backend-0.0.1-SNAPSHOT.jar).
Ambos foram gerados; a instalação do Desktop e a implantação do Backend não foram executadas.
