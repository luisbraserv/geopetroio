# -*- coding: utf-8 -*-
"""Gera docs/manuais/Guia de Configuracao dos Cards.pdf.

Uso:  python gerar_guia_cards.py      (requer reportlab; fontes Segoe UI e Consolas do Windows)

As formulas e os nomes de campo seguem o codigo do Geopetro-Desktop:
PesoColunaCalculator, ConversaoPressao, HydraulicTorqueCalculator, ConversaoTanque,
peso-coluna-settings.fxml, chave-settings.fxml e cards-config.fxml.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents

import figs
from figs import NAVY, NAVY2, ORANGE, GRAY, LIGHT, LINE

FONTS = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("Segoe", FONTS + "segoeui.ttf"))
pdfmetrics.registerFont(TTFont("SegoeB", FONTS + "segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("SegoeI", FONTS + "segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("SegoeBI", FONTS + "segoeuiz.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONTS + "consola.ttf"))
pdfmetrics.registerFontFamily("Segoe", normal="Segoe", bold="SegoeB", italic="SegoeI", boldItalic="SegoeBI")

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(os.path.dirname(AQUI), "Guia de Configuracao dos Cards.pdf")

# ------------------------------------------------------------------ estilos
BASE = dict(fontName="Segoe", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1F2937"))
S = {
    "body": ParagraphStyle("body", spaceAfter=6, **BASE),
    "small": ParagraphStyle("small", **{**BASE, "fontSize": 8.3, "leading": 11}),
    "cell": ParagraphStyle("cell", **{**BASE, "fontSize": 8.3, "leading": 10.8}),
    "cellb": ParagraphStyle("cellb", **{**BASE, "fontName": "SegoeB", "fontSize": 8.3, "leading": 10.8}),
    "th": ParagraphStyle("th", **{**BASE, "fontName": "SegoeB", "fontSize": 8.3, "leading": 10.8,
                                  "textColor": colors.white}),
    "h1": ParagraphStyle("h1", fontName="SegoeB", fontSize=19, leading=23, textColor=NAVY,
                         spaceBefore=4, spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="SegoeB", fontSize=12.5, leading=16, textColor=NAVY2,
                         spaceBefore=10, spaceAfter=5),
    "cap": ParagraphStyle("cap", **{**BASE, "fontName": "SegoeI", "fontSize": 8, "leading": 10,
                                    "textColor": GRAY, "alignment": TA_CENTER}),
    "mono": ParagraphStyle("mono", **{**BASE, "fontName": "Mono", "fontSize": 8.6, "leading": 12.2}),
    "toc1": ParagraphStyle("toc1", fontName="Segoe", fontSize=10.5, leading=17, textColor=NAVY),
    "bul": ParagraphStyle("bul", leftIndent=12, bulletIndent=2, spaceAfter=2.5, **BASE),
    "num": ParagraphStyle("num", leftIndent=16, bulletIndent=0, spaceAfter=3, **BASE),
}


def P(t, s="body"):
    return Paragraph(t, S[s])


def bullets(items, style="bul"):
    return [Paragraph(t, S[style], bulletText="•") for t in items]


def numbered(items):
    return [Paragraph(t, S["num"], bulletText=f"{i}.") for i, t in enumerate(items, 1)]


def H1(t):
    p = Paragraph(t, S["h1"])
    p._toc = t
    return p


def figura(d, legenda):
    return KeepTogether([Spacer(1, 4), d, Spacer(1, 3), P(legenda, "cap"), Spacer(1, 8)])


def caixa(titulo, corpo, cor=ORANGE, fundo="#FFF7ED"):
    conteudo = [P(f"<b>{titulo}</b>", "small")] + [P(c, "small") for c in corpo]
    t = Table([[conteudo]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(fundo)),
        ("LINEBEFORE", (0, 0), (0, -1), 3, cor),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return KeepTogether([Spacer(1, 3), t, Spacer(1, 8)])


def atencao(corpo, titulo="Atenção"):
    return caixa(titulo, corpo)


def dica(corpo, titulo="Dica"):
    return caixa(titulo, corpo, cor=NAVY2, fundo="#EFF6FF")


def formula(linhas):
    t = Table([[P("<br/>".join(l.replace(" ", "&nbsp;") for l in linhas), "mono")]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return KeepTogether([t, Spacer(1, 8)])


def tabela(cab, linhas, larguras, primeira_negrito=True, zebra=True, altura=None):
    dados = [[P(c, "th") for c in cab]]
    for ln in linhas:
        dados.append([P(c, "cellb" if (i == 0 and primeira_negrito) else "cell") for i, c in enumerate(ln)])
    t = Table(dados, colWidths=[w * mm for w in larguras], repeatRows=1,
              rowHeights=None if altura is None else [None] + [altura] * len(linhas))
    st = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if zebra:
        for r in range(2, len(dados), 2):
            st.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F9FAFB")))
    t.setStyle(TableStyle(st))
    return t


# ------------------------------------------------------------------ exemplo numerico (mesma conta do Desktop)
def calcular_exemplo(ax=150, range_bar=250, sens=1.0, p0=0.0, area=10.0, braco=12.0,
                     tambor=30.0, cabo=1.0, linhas=8, catarina=12000.0, k=1.0):
    fracao = (ax + 50) / 800
    psi = fracao * range_bar * 14.5037738 * sens
    pc = max(0.0, psi - p0)
    forca = pc * area
    torque = forca * braco
    raio = (tambor + cabo) / 2
    tracao = torque / raio * k
    carga = tracao * linhas
    peso = max(0.0, carga - catarina)
    return dict(fracao=fracao, psi=psi, pc=pc, forca=forca, torque=torque, raio=raio,
                tracao=tracao, carga=carga, peso=peso, kgf=peso * 0.45359237, tf=peso * 0.45359237 / 1000)


EX = calcular_exemplo()


def br(v, casas=0):
    s = f"{v:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def en(v, casas=0):
    return f"{v:,.{casas}f}"


DIAG = [("Pressão", f"{en(EX['psi'], 1)} psi"), ("Pressão corrigida", f"{en(EX['pc'], 1)} psi"),
        ("Força do sensor", f"{en(EX['forca'])} lbf"), ("Torque do sargento", f"{en(EX['torque'])} lbf·pol"),
        ("Raio efetivo", f"{en(EX['raio'], 2)} pol"), ("Tração da deadline", f"{en(EX['tracao'])} lbf"),
        ("Linhas", "8"), ("Carga suspensa", f"{en(EX['carga'])} lbf"), ("Peso da Catarina", "12,000 lbf"),
        ("Peso da coluna", (f"{en(EX['peso'])} lbf", f"{en(EX['kgf'])} kgf · {en(EX['tf'], 2)} tf"))]


# ------------------------------------------------------------------ documento
class Doc(BaseDocTemplate):
    def __init__(self, fn):
        super().__init__(fn, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm,
                         bottomMargin=18 * mm, title="Guia de Configuração dos Cards",
                         author="Braserv Petróleo — Desenvolvimento e Automação",
                         subject="GeopetroIO — Geopetro-Desktop")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f")
        self.addPageTemplates([PageTemplate(id="capa", frames=[frame], onPage=self.capa),
                               PageTemplate(id="normal", frames=[frame], onPage=self.rodape)])

    def afterFlowable(self, f):
        if hasattr(f, "_toc"):
            self.notify("TOCEntry", (0, f._toc, self.page))

    @staticmethod
    def rodape(c, doc):
        c.saveState()
        c.setStrokeColor(LINE)
        c.line(20 * mm, 12 * mm, A4[0] - 20 * mm, 12 * mm)
        c.setFont("Segoe", 7.5)
        c.setFillColor(GRAY)
        c.drawString(20 * mm, 8 * mm, "GeopetroIO · Guia de Configuração dos Cards")
        c.drawRightString(A4[0] - 20 * mm, 8 * mm, f"Página {doc.page}")
        c.restoreState()

    @staticmethod
    def capa(c, doc):
        w, h = A4
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(0, h - 120 * mm, w, 120 * mm, fill=1, stroke=0)
        c.setFillColor(ORANGE)
        c.rect(0, h - 123 * mm, w, 3 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Segoe", 11)
        c.drawString(20 * mm, h - 40 * mm, "GEOPETROIO · GEOPETRO-DESKTOP")
        c.setFont("SegoeB", 30)
        c.drawString(20 * mm, h - 62 * mm, "Guia de Configuração")
        c.drawString(20 * mm, h - 76 * mm, "dos Cards")
        c.setFont("Segoe", 12)
        c.drawString(20 * mm, h - 92 * mm, "Como configurar cada tipo de card, com atenção especial ao peso da coluna")
        c.setFillColor(GRAY)
        c.setFont("Segoe", 9)
        c.drawString(20 * mm, 30 * mm, "Braserv Petróleo · Desenvolvimento e Automação")
        c.drawString(20 * mm, 25 * mm, "Versão de outubro de 2026 · Uso interno")
        c.restoreState()


def montar():
    story = []
    from reportlab.platypus import NextPageTemplate

    # ---------------- capa + sumario
    story += [NextPageTemplate("normal"), Spacer(1, 128 * mm)]
    story += [P("<b>Para quem é este guia.</b> Técnicos de campo e equipe de suporte que configuram uma unidade "
                "no Geopetro-Desktop. Você precisa de um usuário com perfil <b>ADMIN</b> ou <b>SUPORTE</b>, "
                "de rede para fazer login e da documentação do CLP e dos sensores em mãos."),
              P("<b>Como usar.</b> Leia a parte 1 uma vez. Depois vá direto ao capítulo do tipo de card que você "
                "vai configurar. O capítulo de <b>peso</b> traz uma folha de levantamento no final, para "
                "imprimir e preencher na sonda antes de abrir o programa.")]
    story.append(PageBreak())
    toc = TableOfContents()
    toc.levelStyles = [S["toc1"]]
    story += [P("Sumário", "h1"), toc, PageBreak()]

    # ---------------- 1. visao geral
    story.append(H1("1. Antes de começar"))
    story.append(P("Cada unidade tem o seu próprio conjunto de cards. Um card diz ao Desktop <b>onde ler</b> no "
                   "CLP, <b>como converter</b> o valor lido e <b>com que nome</b> mostrá-lo na tela. Sem cards "
                   "configurados a unidade não lê nada e não publica telemetria."))
    story.append(P("Existem seis tipos de card. A lista é fechada: um tipo novo exige desenvolvimento."))
    story.append(tabela(["Tipo", "O que mede", "Sinal no CLP", "O que você informa", "Resultado na tela"], [
        ["Pressão", "Pressão de linha, bomba, ESCP", "Word · 2 bytes", "Range do transmissor (bar)", "psi"],
        ["Peso", "Peso da coluna pelo sargento", "Word · 2 bytes", "Range + 8 parâmetros de geometria", "lbf · kgf · tf"],
        ["Torque", "Torque da chave hidráulica", "Word · 2 bytes", "Range + geometria da chave", "lbf·ft"],
        ["Temperatura", "Fluido ou equipamento", "Word · 2 bytes", "Mínimo, máximo e unidade", "°C ou °F"],
        ["Nível do tanque", "Volume do tanque", "Word · 2 bytes", "Forma, medidas, distâncias", "bbl"],
        ["Contador de stroke", "Bomba de lama ou cimentação", "DWord · 4 bytes", "Constante da bomba", "spm · bbl/min · bbl"],
    ], [27, 38, 23, 45, 37]))
    story.append(Spacer(1, 8))
    story.append(P("Ordem recomendada", "h2"))
    story += numbered([
        "Configure a <b>conexão com o CLP</b> pela engrenagem.",
        "Abra <b>Cards da unidade</b>, crie os cards e salve.",
        "Para peso e torque, abra a <b>calibração</b> de cada card e salve.",
        "Confira no <b>dashboard</b> se cada valor reage como esperado.",
    ])
    story.append(figura(figs.fig_barra(), "Figura 1 — Barra superior do Desktop. (1) abre a lista de cards da "
                                           "unidade. (2) abre a engrenagem com a conexão do CLP."))
    story.append(P("As duas janelas pedem login na primeira vez. A sessão fica só na memória: fechar o programa "
                   "exige novo login. Sem rede o login é recusado, porque não existe validação local de senha."))

    story.append(P("Conexão com o CLP", "h2"))
    story.append(P("Fica na engrenagem, no bloco <b>Conexão com o CLP</b>. Ela é guardada na unidade, não no "
                   "computador, e vale para todos os cards."))
    story.append(tabela(["Campo", "O que é", "De onde tirar"], [
        ["IP do PLC", "Endereço de rede do CLP desta unidade", "Etiqueta do painel ou projeto do CLP. Nunca é copiado de outra unidade."],
        ["Rack / Slot", "Posição da CPU no bastidor", "Projeto do LOGO!. Costuma ser rack 0, slot 1. Com conexão por TSAP, valem os TSAPs."],
        ["DB", "Número do bloco de dados lido", "No LOGO! a memória V é lida no DB1."],
        ["Intervalo (ms)", "Tempo entre leituras", "Padrão 1000. O mínimo aceito é 100."],
        ["TSAP local / remoto", "Identificação da conexão Servidor S7 configurada no LOGO!", "LOGO!Soft Comfort. O local do Desktop é o remoto do LOGO!, e vice-versa. Valores entre 0000 e FFFF."],
    ], [30, 55, 85]))
    story.append(Spacer(1, 6))

    # ---------------- 2. tela de cards
    story.append(CondPageBreak(150 * mm))
    story.append(H1("2. A tela Cards da unidade"))
    story.append(P("A lista fica à esquerda e o formulário do card selecionado à direita. Os campos de "
                   "parâmetros mudam conforme o tipo escolhido."))
    story.append(figura(figs.fig_tela_cards(), "Figura 2 — Tela Cards da unidade, com um card de peso selecionado."))
    story.append(tabela(["Nº", "Elemento", "Como usar"], [
        ["1", "Copiar de outra unidade", "Traz os cards de uma unidade igual já configurada. O IP do CLP e a identificação dos cards não são copiados. A unidade de destino não pode ter cards ativos."],
        ["2", "Lista de cards", "Mostra a identificação gerada pelo sistema, o nome, o tipo, o endereço e o estado."],
        ["3", "Adicionar e setas", "Adicionar cria um card novo. As setas mudam a posição dele no dashboard."],
        ["4", "Desativar", "Tira o card da tela e para a publicação. Card <b>não se exclui</b>: o histórico dele continua consultável."],
        ["5", "Nome na tela", "Rótulo livre, por exemplo “Peso da coluna” ou “Temp. óleo hidráulico”. Pode mudar a qualquer momento."],
        ["6", "Tipo e byte inicial", "O tipo define a conversão e o tamanho. O byte inicial é o deslocamento dentro do DB."],
        ["7", "Ativo e Visível", "Ativo liga a leitura. Visível controla o envio ao monitoramento remoto."],
        ["8", "Parâmetros do tipo", "Aqui aparece o range, a escala, as medidas do tanque ou a constante da bomba."],
        ["9", "Calibração", "Só em peso e torque. Mostra os valores atuais e abre o editor de calibração."],
        ["10", "Salvar", "Grava no servidor. Nada vale antes de salvar."],
    ], [9, 38, 123]))
    story.append(P("Campos comuns a todos os tipos", "h2"))
    story += bullets([
        "<b>Dispositivo.</b> É gerado pelo sistema, no formato PESO_01, PRESSAO_02 e assim por diante. "
        "É a chave do histórico e nunca muda. Por isso o nome pode mudar sem quebrar nada.",
        "<b>Byte inicial no DB.</b> Leia no projeto do CLP o endereço da variável. Se ela está em DB1.DBW4, "
        "digite 4. Se o contador está em DB1.DBD0, digite 0. A tela mostra o endereço montado logo abaixo, "
        "por exemplo “DBW4 · 2 bytes (4 a 5)”.",
        "<b>Tamanho.</b> Não se escolhe. Tipos analógicos leem 2 bytes (DBW). O contador de stroke lê 4 bytes (DBD).",
        "<b>Ativo e invisível.</b> O card continua sendo lido e o alarme local funciona, mas ele não chega à "
        "supervisão remota. A tela mostra um aviso quando você faz essa combinação.",
        "<b>Mesmo endereço em dois cards.</b> É permitido. Exemplo: “Bomba de lama” e “ESCP” lendo o mesmo "
        "transmissor. Cada card gera uma série própria no histórico.",
    ])
    story.append(atencao([
        "A tela <b>não</b> lê o CLP enquanto você digita. O CLP também não recusa endereço errado: ele devolve "
        "algum número, e a conversão produz um valor que parece correto. Depois de salvar, confira sempre no "
        "dashboard (capítulo 10)."]))

    # ---------------- 3. sinal 4-20
    story.append(H1("3. Como o sinal analógico chega"))
    story.append(P("Todos os sensores analógicos são 4–20 mA. O bloco Analog Amplifier do CLP converte a "
                   "corrente para um número chamado <b>Ax</b>, numa faixa de −50 a 750. O Desktop transforma o Ax "
                   "em uma fração de 0 a 1. Cada tipo de card aplica a sua escala sobre essa fração."))
    story.append(figura(figs.fig_escala(), "Figura 3 — Relação entre corrente, valor lido no CLP e fração da escala."))
    story += bullets([
        "Ax abaixo de −50 quer dizer corrente abaixo de 4 mA. As causas comuns são laço aberto, sensor sem "
        "alimentação ou canal não ligado.",
        "O valor não é cortado. Uma leitura fora da faixa aparece como veio, e o Ax fica em vermelho no card.",
    ])

    # ---------------- 4. pressao
    story.append(CondPageBreak(65 * mm))
    story.append(H1("4. Card de pressão"))
    story.append(tabela(["Campo", "O que é", "De onde tirar"], [
        ["Range do sensor (bar)", "Pressão que o transmissor indica em 20 mA. Em 4 mA ele indica zero.",
         "Plaqueta ou folha de dados do transmissor. Se estiver em psi, divida por 14,5038. Exemplo: 0–5000 psi vira 344,7 bar."],
    ], [38, 62, 70]))
    story.append(Spacer(1, 6))
    story.append(formula(["pressão (bar) = fração × range", "pressão (psi) = pressão (bar) × 14,5038"]))

    # ---------------- 5. peso
    story.append(CondPageBreak(150 * mm))
    story.append(H1("5. Card de peso da coluna"))
    story.append(P("Este é o card que mais exige cuidado. O sensor <b>não fica no gancho</b>. Ele fica no "
                   "<b>sargento</b>, a âncora da linha morta, e mede a pressão hidráulica que a tração dessa única "
                   "linha produz. Para chegar ao peso da coluna, o Desktop percorre uma cadeia de contas. Cada etapa "
                   "usa uma medida física da sua sonda."))
    story.append(figura(figs.fig_sonda(), "Figura 4 — Onde fica o sensor. A Catarina é sustentada por N linhas. "
                                           "A linha rápida vai ao guincho e a linha morta é presa no sargento."))
    story.append(figura(figs.fig_sargento(), "Figura 5 — Detalhe do sargento. Os números laranja correspondem aos "
                                              "campos da tela de calibração."))
    story.append(P("A conta, passo a passo", "h2"))
    story.append(figura(figs.fig_cadeia(), "Figura 6 — A cadeia de cálculo. Em laranja, o parâmetro usado em cada passo."))
    story.append(formula([
        "pressão corrigida = pressão − pressão zero",
        "força no sensor   = pressão corrigida × área efetiva           (lbf)",
        "torque            = força × braço do sensor                     (lbf·pol)",
        "raio efetivo      = (diâmetro do tambor + diâmetro do cabo) ÷ 2",
        "tração da linha   = torque ÷ raio efetivo × fator K             (lbf)",
        "carga suspensa    = tração × número de linhas                   (lbf)",
        "peso da coluna    = carga suspensa − peso da Catarina           (lbf)",
    ]))

    story.append(CondPageBreak(175 * mm))
    story.append(P("A tela de calibração do peso", "h2"))
    story.append(P("Abra pelo botão <b>Abrir calibração</b> na tela de cards ou pela engrenagem do próprio card no "
                   "dashboard. O card precisa estar salvo antes. Todos os comprimentos são em <b>polegadas</b> e "
                   "todas as forças em <b>lbf</b>."))
    story.append(figura(figs.fig_tela_peso(DIAG), "Figura 7 — Tela de calibração do peso. Os números laranja "
                                                    "correspondem à tabela das próximas páginas."))
    story.append(P("O quadro da direita (11) refaz a conta a cada tecla, usando a leitura atual do CLP. Assim você "
                   "vê em que etapa o número se afasta do esperado."))

    story.append(PageBreak())
    story.append(P("O que é cada campo e de onde tirar", "h2"))
    story.append(tabela(["Nº", "Campo", "O que é", "De onde tirar", "Como preencher e erros comuns"], [
        ["1", "Range do sensor (bar)",
         "Pressão que o transmissor indica em 20 mA.",
         "Plaqueta do transmissor de pressão ligado à mangueira do sargento.",
         "Use o valor máximo da faixa. Se a plaqueta estiver em psi, divida por 14,5038. Este valor vale para o card inteiro."],
        ["2", "Pressão zero (psi)",
         "Desvio do transmissor quando não há tração nenhuma.",
         "Com o circuito do sensor despressurizado, leia a linha “Pressão” no quadro de cálculo.",
         "Quase sempre 0. <b>Nunca</b> use a pressão com a Catarina pendurada. O peso da Catarina tem campo próprio (8)."],
        ["3", "Área efetiva do sensor (pol²)",
         "Área do diafragma ou pistão da célula hidráulica do sargento.",
         "Folha de dados do fabricante do sargento ou da célula. Às vezes vem gravada na própria célula.",
         "Se o catálogo der o diâmetro do pistão, a área é 0,7854 × D². Exemplo: D = 3,57 pol dá 10,0 pol²."],
        ["4", "Braço do sensor (pol)",
         "Distância do eixo do tambor do sargento até a linha onde a célula empurra.",
         "Desenho do sargento no manual. Se não houver, meça com trena.",
         "Meça perpendicular à direção da força, de centro a centro. Não confunda com o raio do tambor."],
        ["5", "Diâmetro do tambor (pol)",
         "Diâmetro do tambor do sargento, onde o cabo enrola.",
         "Manual do sargento ou medição.",
         "Meça no fundo do canal, sem cabo. Dica: meça a circunferência com trena e divida por 3,1416."],
        ["6", "Diâmetro do cabo (pol)",
         "Diâmetro nominal do cabo de perfuração.",
         "Certificado do cabo ou paquímetro.",
         "Valores típicos: 1, 1-1/8 (1,125), 1-1/4 (1,25), 1-3/8 (1,375). Entra no raio, não na área."],
        ["7", "Número de linhas",
         "Quantas linhas sustentam a Catarina.",
         "Conte na sonda as linhas entre o bloco de coroamento e a Catarina.",
         "Não conte a linha rápida nem a linha morta. Valores típicos: 4, 6, 8, 10 ou 12. Confira de novo após trocar o passamento."],
        ["8", "Peso da Catarina (lbf)",
         "Peso de tudo que pende das linhas sem a coluna: catarina, gancho, elevador, links e top drive se ele for suspenso.",
         "Plaquetas e manuais de cada peça. Some todas.",
         "Em kgf, multiplique por 2,2046. Em toneladas, multiplique por 2204,6. Este é o único lugar para descontar a Catarina."],
        ["9", "Sensibilidade do sensor",
         "Correção do transmissor de pressão. Multiplica a pressão lida.",
         "Comparação com um manômetro padrão no mesmo circuito.",
         "Sensibilidade = pressão do manômetro ÷ pressão mostrada. Deixe 1,000 se não houver manômetro. Faixa de 0,5 a 1,5."],
        ["10", "Fator de calibração (K)",
         "Ajuste final contra uma carga conhecida.",
         "Calculado na sonda, pelo procedimento da próxima página.",
         "Ajuste por último. Um K muito longe de 1,0 indica medida física errada, não falta de calibração. Faixa de 0,5 a 1,5."],
    ], [9, 24, 37, 42, 58]))
    story.append(Spacer(1, 6))
    story.append(P("Conversões úteis", "h2"))
    story.append(tabela(["De", "Para", "Multiplique por"], [
        ["mm", "pol", "0,03937 (ou divida por 25,4)"],
        ["kgf", "lbf", "2,2046"],
        ["tf (tonelada-força)", "lbf", "2204,6"],
        ["bar", "psi", "14,5038"],
        ["cm²", "pol²", "0,155"],
    ], [50, 40, 80]))

    story.append(PageBreak())
    story.append(P("Procedimento de calibração na sonda", "h2"))
    story.append(P("Faça com a <b>Catarina parada</b>. Subindo ou descendo, o atrito das polias muda a tração entre "
                   "as linhas, e o modelo do Desktop considera a Catarina em repouso."))
    story += numbered([
        "Salve o card de peso na tela de cards com o range correto.",
        "Abra a calibração. Preencha os campos 2 a 8 com os dados da folha de levantamento. Deixe sensibilidade e fator em 1,000.",
        "Se houver manômetro padrão no circuito, compare a linha “Pressão” do quadro com ele e ajuste a sensibilidade.",
        "Com o gancho vazio, a linha “Peso da coluna” deve ficar perto de zero. Se ficar muito acima ou abaixo, "
        "revise o peso da Catarina e a geometria antes de seguir.",
        "Pendure uma carga conhecida, por exemplo uma seção de coluna de peso conhecido. A referência também pode "
        "ser um indicador de peso aferido.",
        "Calcule o fator: K = carga real total ÷ carga suspensa mostrada com K = 1,000. A carga real total é a carga "
        "conhecida <b>mais</b> o peso da Catarina.",
        "Ajuste o controle deslizante para o K calculado e confira se o peso da coluna bate com a carga conhecida.",
        "Salve.",
    ])
    story.append(formula(["K = carga real total ÷ carga suspensa calculada (com K = 1,000)"]))
    story.append(P("Exemplo completo", "h2"))
    story.append(P(f"Dados: transmissor de 250 bar, Ax lido = 150, pressão zero 0, área 10 pol², braço 12 pol, "
                   f"tambor 30 pol, cabo 1 pol, 8 linhas, Catarina 12.000 lbf, sensibilidade e K = 1,000."))
    story.append(tabela(["Etapa", "Conta", "Resultado"], [
        ["Fração", "(150 + 50) ÷ 800", br(EX["fracao"], 2)],
        ["Pressão", "0,25 × 250 bar × 14,5038", f"{br(EX['psi'], 1)} psi"],
        ["Força no sensor", f"{br(EX['pc'], 1)} × 10", f"{br(EX['forca'])} lbf"],
        ["Torque", f"{br(EX['forca'])} × 12", f"{br(EX['torque'])} lbf·pol"],
        ["Raio efetivo", "(30 + 1) ÷ 2", f"{br(EX['raio'], 1)} pol"],
        ["Tração da linha morta", f"{br(EX['torque'])} ÷ 15,5 × 1,000", f"{br(EX['tracao'])} lbf"],
        ["Carga suspensa", f"{br(EX['tracao'])} × 8", f"{br(EX['carga'])} lbf"],
        ["Peso da coluna", f"{br(EX['carga'])} − 12.000", f"<b>{br(EX['peso'])} lbf</b> ({br(EX['tf'], 2)} tf)"],
    ], [42, 70, 58]))
    k_ex = (40000 + 12000) / EX["carga"]
    story.append(Spacer(1, 6))
    story.append(P(f"Calibrando: a coluna pendurada pesa de fato 40.000 lbf. A carga real total é "
                   f"40.000 + 12.000 = 52.000 lbf. Então K = 52.000 ÷ {br(EX['carga'])} = <b>{br(k_ex, 3)}</b>. "
                   f"Com esse K, o peso da coluna passa a mostrar 40.000 lbf."))
    story.append(atencao([
        "<b>K abaixo de 0,8 ou acima de 1,2</b> quase sempre indica um erro de geometria. Revise primeiro número de "
        "linhas, braço do sensor e área efetiva. Esses três multiplicam o resultado diretamente.",
        "<b>Peso negativo vira zero.</b> Se o card mostra 0 com coluna pendurada, a carga calculada está abaixo do "
        "peso da Catarina. Confira o range e a área.",
        "Campos 3, 4, 5 e 7 em branco ou zero deixam o card <b>sem calibração</b>. Ele lê o CLP mas não publica valor convertido.",
    ], titulo="Sinais de que algo está errado"))

    story.append(PageBreak())
    story.append(P("Folha de levantamento — peso da coluna", "h2"))
    story.append(P("Imprima e preencha na sonda antes de abrir o programa. Anote a fonte de cada valor, para "
                   "que a próxima pessoa possa conferir.", "small"))
    story.append(Spacer(1, 4))
    vazio = "&nbsp;"
    story.append(tabela(["Item", "Valor", "Unidade", "Fonte (plaqueta, manual, medição)"], [
        ["Unidade / sonda", vazio, "", vazio], ["Data e responsável", vazio, "", vazio],
        ["Endereço no CLP (DBW)", vazio, "byte", vazio],
        ["1 · Range do transmissor", vazio, "bar", vazio], ["2 · Pressão zero", vazio, "psi", vazio],
        ["3 · Área efetiva da célula", vazio, "pol²", vazio], ["4 · Braço do sensor", vazio, "pol", vazio],
        ["5 · Diâmetro do tambor", vazio, "pol", vazio], ["6 · Diâmetro do cabo", vazio, "pol", vazio],
        ["7 · Número de linhas", vazio, "linhas", vazio], ["8 · Peso da Catarina (soma)", vazio, "lbf", vazio],
        ["8a · catarina", vazio, "lbf", vazio], ["8b · gancho", vazio, "lbf", vazio],
        ["8c · elevador e links", vazio, "lbf", vazio], ["8d · top drive / swivel", vazio, "lbf", vazio],
        ["9 · Sensibilidade", vazio, "—", vazio], ["Carga conhecida usada", vazio, "lbf", vazio],
        ["Carga suspensa com K = 1", vazio, "lbf", vazio], ["10 · Fator K calculado", vazio, "—", vazio],
    ], [55, 30, 18, 67], zebra=False, altura=24))

    # ---------------- 6. torque
    story.append(PageBreak())
    story.append(H1("6. Card de torque"))
    story.append(P("O torque vem da pressão no cilindro da chave hidráulica. O Desktop multiplica a pressão pela "
                   "área do pistão que está trabalhando e pelo comprimento do braço da chave. A calibração fica "
                   "neste computador, separada por card, e abre pelo mesmo botão <b>Abrir calibração</b>."))
    story.append(figura(figs.fig_chave(), "Figura 8 — Chave hidráulica. A área usada depende do lado do cilindro que faz o aperto."))
    story.append(tabela(["Campo", "O que é", "De onde tirar e como preencher"], [
        ["Limite do sensor (bar)", "Range do transmissor de pressão da chave.", "Plaqueta do transmissor. Igual ao range do card de pressão."],
        ["Sensibilidade", "Correção do transmissor.", "Manômetro padrão ÷ pressão mostrada. Deixe 1,00 sem referência."],
        ["Diâmetro do pistão (in)", "Diâmetro interno do cilindro.", "Manual ou plaqueta do cilindro da chave. Em polegadas."],
        ["Diâmetro da haste (in)", "Diâmetro da haste do cilindro.", "Manual do cilindro. Só entra na conta no recuo, mas precisa ser menor que o pistão."],
        ["Comprimento do braço (ft)", "Distância do centro do tubo até o pino do cilindro.", "Manual da chave. Medido perpendicular ao cilindro. Atenção: em <b>pés</b>. 24 pol = 2 ft."],
        ["Movimento no aperto", "Lado do cilindro que faz força no aperto.", "<b>Avanço</b> quando o cilindro estende para apertar. <b>Recuo</b> quando ele recolhe."],
    ], [38, 52, 80]))
    story.append(Spacer(1, 6))
    story.append(formula(["Avanço: área = 0,7854 × Dp²", "Recuo:  área = 0,7854 × (Dp² − Dh²)",
                          "torque (lbf·ft) = pressão (psi) × área (pol²) × braço (ft)"]))
    story.append(dica(["A tela mostra a área hidráulica calculada logo abaixo do movimento. Confira com o valor "
                       "do catálogo da chave antes de salvar."]))

    # ---------------- 7. temperatura
    story.append(CondPageBreak(110 * mm))
    story.append(H1("7. Card de temperatura"))
    story.append(P("Serve para fluido, como lama e pasta, e para equipamento, como motor, bomba e óleo "
                   "hidráulico. Use o nome do card para deixar claro qual dos dois ele mede, porque o significado "
                   "do alarme muda."))
    story.append(figura(figs.fig_termometro(), "Figura 9 — A escala do transmissor define o que 4 mA e 20 mA significam."))
    story.append(tabela(["Campo", "O que é", "De onde tirar"], [
        ["Mínimo da escala", "Temperatura que o transmissor indica em 4 mA.", "Plaqueta ou configuração do transmissor. Pode ser negativo, por exemplo −20."],
        ["Máximo", "Temperatura que o transmissor indica em 20 mA.", "Mesma fonte. Precisa ser maior que o mínimo."],
        ["Unidade", "°C ou °F.", "A mesma unidade em que a escala do transmissor foi escrita."],
    ], [35, 60, 75]))
    story.append(atencao(["Informe a escala do <b>transmissor</b>, não a faixa de operação esperada. Um transmissor "
                          "de −50 a 200 °C configurado como 0 a 100 °C erra em toda a faixa."]))

    # ---------------- 8b stroke
    story.append(CondPageBreak(95 * mm))
    story.append(H1("8. Card de contador de stroke"))
    story.append(P("Lê o contador cumulativo de golpes da bomba, em 4 bytes (DBD). Um card produz três "
                   "séries: strokes no ciclo, vazão em bbl/min e volume acumulado em bbl. Cada bomba tem o seu card "
                   "e a sua constante."))
    story.append(figura(figs.fig_bomba(), "Figura 11 — Medidas usadas para a constante de uma bomba triplex."))
    story.append(tabela(["Campo", "O que é", "De onde tirar"], [
        ["Constante da bomba (bbl/stroke)", "Volume deslocado por golpe.",
         "Tabela do fabricante para a <b>camisa instalada</b>. Sem tabela, calcule pela fórmula da figura. "
         "Exemplo: camisa 6 pol, curso 12 pol, eficiência 0,95 dá 0,000243 × 36 × 12 × 0,95 = 0,0997 bbl/stroke. "
         "Ao trocar a camisa, atualize a constante."],
    ], [45, 40, 85]))

    # ---------------- 8. tanque
    story.append(PageBreak())
    story.append(H1("9. Card de nível do tanque"))
    story.append(P("O sensor fica <b>sempre no topo</b> do tanque e mede a distância até a superfície do líquido, "
                   "não o nível. O Desktop subtrai essa distância para achar a altura do líquido e calcula o "
                   "volume pela forma do tanque. O valor gravado e alarmado é o <b>volume em bbl</b>."))
    story.append(figura(figs.fig_tanque(), "Figura 10 — Distância mínima com o tanque cheio. Distância máxima do sensor até o fundo."))
    story.append(tabela(["Campo", "O que é", "De onde tirar e como preencher"], [
        ["Forma do tanque", "Cilíndrico vertical, cilíndrico horizontal ou retangular.", "Inspeção do tanque. A tela mostra só as medidas que a forma pede."],
        ["Raio (m)", "Metade do diâmetro interno.", "Desenho do tanque ou trena. Use medida interna."],
        ["Altura (m)", "Altura interna útil.", "Vertical e retangular. No cilindro horizontal a altura é o diâmetro e o campo some."],
        ["Comprimento e largura (m)", "Medidas internas da base.", "Horizontal pede comprimento. Retangular pede comprimento e largura."],
        ["Distância mínima (m)", "Do sensor até o líquido com o tanque cheio.", "Configuração do transmissor em 4 mA ou medição com o tanque no nível máximo."],
        ["Distância máxima (m)", "Do sensor até o fundo, com o tanque vazio.", "Configuração do transmissor em 20 mA ou medição com trena. Precisa ser maior que a mínima."],
    ], [38, 55, 77]))
    story.append(Spacer(1, 6))
    story.append(atencao([
        "Distâncias trocadas fazem o tanque <b>encher quando esvazia</b>. Confira no desenho do card durante uma "
        "transferência: o líquido tem que subir quando o tanque recebe fluido.",
        "Forma e medidas erradas gravam volume errado no histórico por anos, e o número parece plausível. "
        "No cilindro horizontal o volume não é proporcional à altura, então não troque pela forma vertical."]))

    # ---------------- 10. conferencia
    story.append(PageBreak())
    story.append(H1("10. Conferência no dashboard"))
    story.append(P("Depois de salvar, volte ao dashboard e acompanhe cada card. É a única conferência do endereço, "
                   "porque o CLP não avisa quando o endereço está errado."))
    story.append(figura(figs.fig_card_dashboard(br(EX["peso"])), "Figura 12 — Card no dashboard. (1) engrenagem do card. (2) valor bruto lido do CLP."))
    story += bullets([
        "<b>Engrenagem do card (1).</b> Em peso e torque abre direto a calibração. Nos outros tipos abre a tela de cards já no card clicado.",
        "<b>Valor bruto (2).</b> É o Ax lido no endereço. Ele deve mudar quando a grandeza muda. Em vermelho, está fora da faixa −50 a 750.",
    ])
    story.append(P("Problemas comuns", "h2"))
    story.append(tabela(["O que você vê", "Causa provável", "O que fazer"], [
        ["Valor parado e Ax constante", "Byte inicial errado ou canal sem sensor.", "Conferir o endereço no projeto do CLP."],
        ["Ax em vermelho abaixo de −50", "Corrente abaixo de 4 mA.", "Verificar fiação, alimentação do laço e o transmissor."],
        ["Número enorme ou absurdo", "Tipo errado, lendo 2 bytes de um contador ou o contrário.", "Conferir o tipo do card e o tamanho da variável no CLP."],
        ["Peso mostra 0 com coluna", "Carga calculada menor que o peso da Catarina.", "Revisar range, área e número de linhas."],
        ["“Ainda não calibrado”", "Calibração de peso ou torque vazia neste computador.", "Abrir calibração e preencher a geometria."],
        ["Tanque enche quando esvazia", "Distâncias mínima e máxima trocadas.", "Inverter os dois valores."],
        ["Card não aparece no monitoramento remoto", "Card desmarcado em Visível, ou publicação desligada na engrenagem.", "Marcar Visível e conferir os interruptores de MQTT e tempo real."],
        ["Erro ao salvar “configuração desatualizada”", "Outra pessoa salvou a unidade antes.", "Usar Recarregar e refazer a alteração."],
    ], [45, 60, 65]))
    story.append(Spacer(1, 8))
    story.append(atencao([
        "A calibração de peso e torque fica <b>neste computador</b>, separada por card. Ao trocar o computador da "
        "unidade, refaça a calibração ou copie a pasta de configuração do Desktop."], titulo="Importante ao trocar o computador"))
    return story


def main():
    import sys
    doc = Doc(sys.argv[1] if len(sys.argv) > 1 else SAIDA)
    doc.multiBuild(montar())
    print("Gerado:", doc.filename)


if __name__ == "__main__":
    main()
