# -*- coding: utf-8 -*-
"""Gera os PDFs de decisoes de arquitetura em pt-BR e es-CO.

Uso:  python gerar_decisoes.py [pasta_de_saida]
Requer reportlab e as fontes Segoe UI e Consolas do Windows.
"""
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, NextPageTemplate, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents

import diagramas
from figs import NAVY, NAVY2, ORANGE, GRAY, LIGHT, LINE
from conteudo import PT, ES

FONTS = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("Segoe", FONTS + "segoeui.ttf"))
pdfmetrics.registerFont(TTFont("SegoeB", FONTS + "segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("SegoeI", FONTS + "segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("SegoeBI", FONTS + "segoeuiz.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONTS + "consola.ttf"))
pdfmetrics.registerFontFamily("Segoe", normal="Segoe", bold="SegoeB", italic="SegoeI", boldItalic="SegoeBI")

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA_PADRAO = os.path.dirname(AQUI)

BASE = dict(fontName="Segoe", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1F2937"))
S = {
    "body": ParagraphStyle("body", spaceAfter=6, **BASE),
    "cell": ParagraphStyle("cell", **{**BASE, "fontSize": 8.4, "leading": 11}),
    "cellb": ParagraphStyle("cellb", **{**BASE, "fontName": "SegoeB", "fontSize": 8.4, "leading": 11}),
    "rot": ParagraphStyle("rot", **{**BASE, "fontName": "SegoeB", "fontSize": 8.4, "leading": 11, "textColor": NAVY2}),
    "mono": ParagraphStyle("mono", **{**BASE, "fontName": "Mono", "fontSize": 7.6, "leading": 10.5, "textColor": GRAY}),
    "th": ParagraphStyle("th", **{**BASE, "fontName": "SegoeB", "fontSize": 8.4, "leading": 11, "textColor": colors.white}),
    "h1": ParagraphStyle("h1", fontName="SegoeB", fontSize=19, leading=23, textColor=NAVY, spaceBefore=4, spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="SegoeB", fontSize=12.5, leading=16, textColor=NAVY2, spaceBefore=10, spaceAfter=5),
    "hd": ParagraphStyle("hd", fontName="SegoeB", fontSize=11.5, leading=15, textColor=NAVY, spaceBefore=12, spaceAfter=5),
    "cap": ParagraphStyle("cap", **{**BASE, "fontName": "SegoeI", "fontSize": 8, "leading": 10, "textColor": GRAY,
                                    "alignment": TA_CENTER}),
    "toc": ParagraphStyle("toc", fontName="Segoe", fontSize=10.5, leading=17, textColor=NAVY),
    "toc2": ParagraphStyle("toc2", fontName="Segoe", fontSize=9.2, leading=14, leftIndent=14, textColor=GRAY),
    "bul": ParagraphStyle("bul", leftIndent=10, bulletIndent=0, **{**BASE, "fontSize": 8.4, "leading": 11}),
}


def P(t, s="body"):
    return Paragraph(t, S[s])


def titulo(t, nivel, estilo):
    p = Paragraph(t, S[estilo])
    p._toc = (nivel, t)
    return p


def tabela(cab, linhas, larguras, negrito_primeira=True):
    dados = [[P(c, "th") for c in cab]]
    for ln in linhas:
        dados.append([P(c, "cellb" if (i == 0 and negrito_primeira) else "cell") for i, c in enumerate(ln)])
    t = Table(dados, colWidths=[w * mm for w in larguras], repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("GRID", (0, 0), (-1, -1), 0.4, LINE),
          ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    for r in range(2, len(dados), 2):
        st.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F9FAFB")))
    t.setStyle(TableStyle(st))
    return t


def figura(d, legenda):
    return KeepTogether([Spacer(1, 4), d, Spacer(1, 4), P(legenda, "cap"), Spacer(1, 8)])


def bloco_decisao(n, dec, rot):
    consequencias = [Paragraph(q, S["bul"], bulletText="•") for q in dec["q"]]
    linhas = [
        [P(rot[0], "rot"), P(dec["c"], "cell")],
        [P(rot[1], "rot"), P(dec["d"], "cell")],
        [P(rot[2], "rot"), consequencias],
        [P(rot[3], "rot"), P(dec["r"], "mono")],
    ]
    t = Table(linhas, colWidths=[28 * mm, 142 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ORANGE),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    cab = titulo(f"D{n:02d} · {dec['t']}", 1, "hd")
    return [CondPageBreak(55 * mm), KeepTogether([cab, t]), Spacer(1, 4)]


class Doc(BaseDocTemplate):
    def __init__(self, fn, T):
        self.T = T
        super().__init__(fn, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm,
                         bottomMargin=18 * mm, title=f"{T['titulo_doc']} — GeopetroIO", author=T["equipe"],
                         subject="GeopetroIO")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f")
        self.addPageTemplates([PageTemplate(id="capa", frames=[frame], onPage=self.capa),
                               PageTemplate(id="normal", frames=[frame], onPage=self.rodape)])

    def afterFlowable(self, f):
        if hasattr(f, "_toc"):
            nivel, t = f._toc
            self.notify("TOCEntry", (nivel, t, self.page))

    def rodape(self, c, doc):
        c.saveState()
        c.setStrokeColor(LINE)
        c.line(20 * mm, 12 * mm, A4[0] - 20 * mm, 12 * mm)
        c.setFont("Segoe", 7.5)
        c.setFillColor(GRAY)
        c.drawString(20 * mm, 8 * mm, self.T["rodape"])
        c.drawRightString(A4[0] - 20 * mm, 8 * mm, f"{self.T['pagina']} {doc.page}")
        c.restoreState()

    def capa(self, c, doc):
        T = self.T
        w, h = A4
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(0, h - 120 * mm, w, 120 * mm, fill=1, stroke=0)
        c.setFillColor(ORANGE)
        c.rect(0, h - 123 * mm, w, 3 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Segoe", 11)
        c.drawString(20 * mm, h - 40 * mm, T["sobretitulo"])
        c.setFont("SegoeB", 30)
        c.drawString(20 * mm, h - 66 * mm, T["titulo_doc"])
        c.setFont("Segoe", 12)
        c.drawString(20 * mm, h - 82 * mm, T["subtitulo"])
        c.setFillColor(GRAY)
        c.setFont("Segoe", 9)
        c.drawString(20 * mm, 30 * mm, T["equipe"])
        c.drawString(20 * mm, 25 * mm, T["versao"])
        c.restoreState()


def montar(T):
    s = [NextPageTemplate("normal"), Spacer(1, 128 * mm)]
    s += [P(t) for t in T["apresentacao"]]
    s.append(PageBreak())
    toc = TableOfContents()
    toc.levelStyles = [S["toc"], S["toc2"]]
    s += [P(T["sumario"], "h1"), toc, PageBreak()]

    s.append(titulo(T["h_visao"], 0, "h1"))
    s.append(P(T["visao_intro"]))
    s.append(tabela(T["cab_apps"], T["apps"], [36, 38, 96]))
    s.append(PageBreak())
    s.append(titulo(T["h_fluxo"], 1, "h2"))
    s.append(P(T["fluxo_intro"]))
    s.append(figura(diagramas.fig_arquitetura(T["diag_arq"]), T["cap_arq"]))
    s.append(CondPageBreak(110 * mm))
    s.append(tabela(T["cab_fluxo"], T["fluxo"], [9, 40, 27, 94]))
    s.append(CondPageBreak(95 * mm))
    s.append(titulo(T["h_borda"], 1, "h2"))
    s.append(P(T["borda_intro"]))
    s.append(figura(diagramas.fig_borda(T["diag_borda"]), T["cap_borda"]))

    s.append(PageBreak())
    s.append(titulo(T["h_decisoes"], 0, "h1"))
    s.append(P(T["decisoes_intro"]))
    for i, dec in enumerate(T["decisoes"], 1):
        s += bloco_decisao(i, dec, T["rot"])

    s.append(PageBreak())
    s.append(titulo(T["h_riscos"], 0, "h1"))
    s.append(P(T["riscos_intro"]))
    s.append(tabela(T["cab_riscos"], T["riscos"], [45, 70, 55]))
    s.append(Spacer(1, 10))
    s.append(titulo(T["h_onde"], 1, "h2"))
    s.append(tabela(T["cab_onde"], T["onde"], [45, 125]))
    return s


def main():
    pasta = sys.argv[1] if len(sys.argv) > 1 else SAIDA_PADRAO
    for T in (PT, ES):
        caminho = os.path.join(pasta, T["arquivo"])
        Doc(caminho, T).multiBuild(montar(T))
        print("Gerado:", caminho)


if __name__ == "__main__":
    main()
