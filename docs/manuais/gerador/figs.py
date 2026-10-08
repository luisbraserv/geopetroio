# -*- coding: utf-8 -*-
"""Ilustracoes vetoriais do guia de configuracao dos cards (reportlab.graphics)."""
import math
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Circle, Polygon, Ellipse, Path
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth

NAVY = colors.HexColor("#1F3A5F")
NAVY2 = colors.HexColor("#2C5282")
ORANGE = colors.HexColor("#E8772E")
GRAY = colors.HexColor("#6B7280")
LIGHT = colors.HexColor("#F3F4F6")
LINE = colors.HexColor("#D1D5DB")
STEEL = colors.HexColor("#9CA3AF")
DARK = colors.HexColor("#111827")
BLUE = colors.HexColor("#3B82F6")
WATER = colors.HexColor("#93C5FD")
RED = colors.HexColor("#DC2626")
GREEN = colors.HexColor("#059669")
WHITE = colors.white

F = "Segoe"
FB = "SegoeB"
FM = "Mono"


def txt(d, x, y, s, size=8, color=DARK, font=F, anchor="start"):
    d.add(String(x, y, s, fontName=font, fontSize=size, fillColor=color, textAnchor=anchor))


def box(d, x, y, w, h, fill=WHITE, stroke=LINE, sw=0.8, r=3):
    d.add(Rect(x, y, w, h, rx=r, ry=r, fillColor=fill, strokeColor=stroke, strokeWidth=sw))


def arrow(d, x1, y1, x2, y2, color=DARK, sw=1, head=5, both=False):
    d.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=sw))
    if head <= 0.5:
        return

    def tip(xa, ya, xb, yb):
        a = math.atan2(yb - ya, xb - xa)
        p1 = (xb - head * math.cos(a - 0.4), yb - head * math.sin(a - 0.4))
        p2 = (xb - head * math.cos(a + 0.4), yb - head * math.sin(a + 0.4))
        d.add(Polygon([xb, yb, p1[0], p1[1], p2[0], p2[1]], fillColor=color, strokeColor=color, strokeWidth=0.5))

    tip(x1, y1, x2, y2)
    if both:
        tip(x2, y2, x1, y1)


def callout(d, x, y, n, r=7):
    d.add(Circle(x, y, r, fillColor=ORANGE, strokeColor=WHITE, strokeWidth=1))
    txt(d, x, y - 3, str(n), size=8, color=WHITE, font=FB, anchor="middle")


def field(d, x, y, w, label, value, lw=0, h=13):
    txt(d, x, y + 3.5, label, size=7)
    box(d, x + lw, y, w - lw, h, fill=WHITE, stroke=STEEL, sw=0.6, r=2)
    txt(d, x + lw + 4, y + 3.5, value, size=7, font=FM, color=DARK)


def slider(d, x, y, w, label, val, frac):
    txt(d, x, y + 10, label + " " + val, size=7)
    d.add(Line(x, y + 3, x + w, y + 3, strokeColor=STEEL, strokeWidth=2))
    d.add(Line(x, y + 3, x + w * frac, y + 3, strokeColor=NAVY2, strokeWidth=2))
    d.add(Circle(x + w * frac, y + 3, 4, fillColor=WHITE, strokeColor=NAVY2, strokeWidth=1))
    for i, t in enumerate(["0.5", "0.75", "1.0", "1.25", "1.5"]):
        txt(d, x + w * i / 4, y - 6, t, size=5.5, color=GRAY, anchor="middle")


def gear(d, cx, cy, r, color, hole=NAVY):
    pts = []
    for i in range(16):
        a = i * math.pi / 8
        rr = r if i % 2 == 0 else r * 0.72
        pts += [cx + rr * math.cos(a), cy + rr * math.sin(a)]
    d.add(Polygon(pts, fillColor=color, strokeColor=color))
    d.add(Circle(cx, cy, r * 0.32, fillColor=hole, strokeColor=hole))


# ------------------------------------------------------------------ Barra superior
def fig_barra():
    W, H = 480, 92
    d = Drawing(W, H)
    box(d, 0, 42, W, 40, fill=NAVY, stroke=NAVY, r=4)
    txt(d, 12, 57, "GeopetroIO", size=11, color=WHITE, font=FB)
    x = 100
    for t in ["Monitoramento", "Graficos", "Carta Operacao"]:
        txt(d, x, 58, t, size=8, color=colors.HexColor("#CBD5E1"))
        x += stringWidth(t, F, 8) + 18
    cx = 330
    for dx, dy in [(0, 0), (8, 0), (0, 8), (8, 8)]:
        d.add(Rect(cx + dx, 54 + dy, 6.5, 6.5, fillColor=WHITE, strokeColor=None))
    gear(d, 366, 62, 8, WHITE)
    d.add(Circle(398, 62, 5, fillColor=RED, strokeColor=None))
    txt(d, 408, 59, "PLC", size=8, color=WHITE)
    callout(d, 338, 33, 1)
    callout(d, 366, 33, 2)
    d.add(Line(338, 26, 338, 16, strokeColor=ORANGE))
    d.add(Line(366, 26, 366, 6, strokeColor=ORANGE))
    txt(d, 332, 10, "Cards da unidade", size=8, color=ORANGE, font=FB, anchor="end")
    txt(d, 372, 0, "Engrenagem", size=8, color=ORANGE, font=FB)
    return d


# ------------------------------------------------------------------ Tela de cards
def fig_tela_cards():
    W, H = 500, 330
    d = Drawing(W, H)
    box(d, 0, 0, W, H, fill=WHITE, stroke=STEEL, sw=1, r=4)
    box(d, 0, H - 38, W, 38, fill=LIGHT, stroke=LIGHT, r=4)
    txt(d, 12, H - 18, "Cards da unidade SONDA-07", size=11, font=FB, color=NAVY)
    txt(d, 12, H - 31, "O que esta unidade lê no CLP, com que conversão e com que nome na tela.", size=7, color=GRAY)
    lx, lw = 10, 238
    txt(d, lx, H - 56, "Cards", size=9, font=FB)
    box(d, lx + 130, H - 62, 108, 15, fill=WHITE, stroke=LINE)
    txt(d, lx + 184, H - 57.5, "Copiar de outra unidade", size=6.5, color=NAVY2, anchor="middle")
    ty = H - 82
    cols = [("Dispositivo", 0), ("Nome na tela", 70), ("Tipo", 136), ("Endereço", 174), ("Estado", 208)]
    box(d, lx, ty, lw, 14, fill=LIGHT, stroke=LINE, r=0)
    for c, off in cols:
        txt(d, lx + 3 + off, ty + 4, c, size=6.3, font=FB, color=GRAY)
    rows = [("PESO_01", "Peso da coluna", "Peso", "DBW4", "Ativo"),
            ("PRESSAO_01", "Bomba de lama", "Pressão", "DBW6", "Ativo"),
            ("TORQUE_01", "Chave de tubos", "Torque", "DBW8", "Ativo"),
            ("TEMPERATURA_01", "Temp. motor", "Temp.", "DBW10", "Ativo"),
            ("CONTADOR_ST…", "Bomba 1", "Stroke", "DBD0", "Ativo"),
            ("NIVEL_TANQ…", "Tanque lama", "Nível", "DBW12", "Inativo")]
    for i, r in enumerate(rows):
        y = ty - 14 * (i + 1)
        box(d, lx, y, lw, 14, fill=colors.HexColor("#DBEAFE") if i == 0 else WHITE, stroke=LINE, r=0)
        for (c, off), v in zip(cols, r):
            txt(d, lx + 3 + off, y + 4, v, size=6.2,
                color=GRAY if r[4] == "Inativo" else DARK, font=FM if off in (0, 174) else F)
    by = 70
    for t, x, w in [("Adicionar", lx, 50), ("↑", lx + 56, 18), ("↓", lx + 78, 18)]:
        box(d, x, by, w, 16, fill=WHITE, stroke=STEEL)
        txt(d, x + w / 2, by + 5, t, size=7, anchor="middle")
    box(d, lx + 180, by, 52, 16, fill=colors.HexColor("#FEE2E2"), stroke=RED)
    txt(d, lx + 206, by + 5, "Desativar", size=7, color=RED, anchor="middle")
    txt(d, lx, by - 13, "Card não se exclui — apenas se desativa.", size=6.5, color=GRAY)
    d.add(Line(258, 36, 258, H - 40, strokeColor=LINE))
    fx, fw = 268, 222
    y = H - 64
    txt(d, fx, y + 8, "Nome na tela", size=7, font=FB)
    box(d, fx, y - 8, fw, 14, stroke=STEEL, r=2)
    txt(d, fx + 4, y - 4, "Peso da coluna", size=7)
    y -= 34
    txt(d, fx, y + 8, "Tipo", size=7, font=FB)
    txt(d, fx + 116, y + 8, "Byte inicial no DB", size=7, font=FB)
    box(d, fx, y - 8, 106, 14, stroke=STEEL, r=2)
    txt(d, fx + 4, y - 4, "Peso", size=7)
    d.add(Polygon([fx + 95, y - 1, fx + 101, y - 1, fx + 98, y - 5], fillColor=GRAY, strokeColor=GRAY))
    box(d, fx + 116, y - 8, 106, 14, stroke=STEEL, r=2)
    txt(d, fx + 120, y - 4, "4", size=7, font=FM)
    y -= 22
    txt(d, fx, y, "DBW4 · 2 bytes (4 a 5)", size=7.5, font=FM, color=NAVY2)
    y -= 20
    for t, x in [("Ativo", fx), ("Visível no dashboard", fx + 50)]:
        box(d, x, y - 1, 9, 9, fill=NAVY2, stroke=NAVY2, r=1)
        txt(d, x + 4.5, y + 0.5, "x", size=7, color=WHITE, font=FB, anchor="middle")
        txt(d, x + 13, y, t, size=7)
    y -= 14
    d.add(Line(fx, y, fx + fw, y, strokeColor=LINE))
    y -= 16
    txt(d, fx, y, "Range do sensor (bar)", size=7, font=FB)
    box(d, fx, y - 18, fw, 14, stroke=STEEL, r=2)
    txt(d, fx + 4, y - 14, "250", size=7, font=FM)
    y -= 34
    box(d, fx, y - 54, fw, 60, fill=LIGHT, stroke=LINE)
    txt(d, fx + 6, y - 4, "Calibração — Peso da coluna", size=7, font=FB)
    txt(d, fx + 6, y - 15, "área efetiva 10.000 pol² · braço 12.000 pol", size=6.2, font=FM)
    txt(d, fx + 6, y - 24, "tambor 30.00 pol · cabo 1.000 pol · 8 linhas", size=6.2, font=FM)
    txt(d, fx + 6, y - 33, "catarina 12000 lbf · fator 1.0000", size=6.2, font=FM)
    box(d, fx + 6, y - 50, 70, 13, fill=WHITE, stroke=STEEL)
    txt(d, fx + 41, y - 46, "Abrir calibração", size=6.5, anchor="middle")
    box(d, 0, 0, W, 34, fill=LIGHT, stroke=LIGHT, r=4)
    for t, x, w, fill, c in [("Recarregar", 290, 56, WHITE, DARK), ("Fechar", 352, 56, WHITE, DARK),
                             ("Salvar", 414, 70, NAVY2, WHITE)]:
        box(d, x, 9, w, 16, fill=fill, stroke=NAVY2 if fill == NAVY2 else STEEL)
        txt(d, x + w / 2, 14, t, size=7.5, color=c, font=FB if fill == NAVY2 else F, anchor="middle")
    callout(d, 132, H - 54, 1)
    callout(d, lx + 120, ty - 14 * 6 - 12, 2)
    callout(d, 70, by + 22, 3)
    callout(d, lx + 240, by + 8, 4)
    callout(d, fx + fw - 8, H - 54, 5)
    callout(d, fx + 40, H - 90, 6)
    callout(d, fx + 180, H - 144, 7)
    callout(d, fx + fw - 10, H - 192, 8)
    callout(d, fx + 86, y - 44, 9)
    callout(d, 449, 34, 10)
    return d


# ------------------------------------------------------------------ Escala 4-20 mA
def fig_escala():
    W, H = 480, 120
    d = Drawing(W, H)
    x0, x1, y = 130, 450, 62
    steps = 40
    for i in range(steps):
        c = colors.linearlyInterpolatedColor(colors.HexColor("#DBEAFE"), NAVY2, 0, steps, i)
        d.add(Rect(x0 + (x1 - x0) * i / steps, y, (x1 - x0) / steps + 0.3, 14, fillColor=c, strokeColor=None))
    d.add(Rect(x0, y, x1 - x0, 14, fillColor=None, strokeColor=NAVY, strokeWidth=1))
    rows = [("Corrente no laço", ["4 mA", "12 mA", "20 mA"], 98),
            ("Valor no CLP (Ax)", ["−50", "350", "750"], 84),
            ("Fração da escala", ["0,0", "0,5", "1,0"], 46),
            ("Ex.: sensor de 250 bar", ["0 bar", "125 bar", "250 bar"], 34),
            ("Ex.: temperatura −20 a 150 °C", ["−20 °C", "65 °C", "150 °C"], 22)]
    for label, vals, yy in rows:
        txt(d, x0 - 14, yy, label, size=7, color=GRAY, anchor="end")
        for k, v in enumerate(vals):
            xx = x0 + (x1 - x0) * k / 2
            big = yy > 80
            txt(d, xx, yy, v, size=8 if big else 7.5, font=FB if big else F,
                color=NAVY if big else DARK, anchor="middle")
    for k in range(3):
        xx = x0 + (x1 - x0) * k / 2
        d.add(Line(xx, y - 4, xx, y + 18, strokeColor=DARK, strokeWidth=0.8))
    txt(d, 0, 4, "fração = (Ax + 50) ÷ 800", size=8.5, font=FM, color=NAVY2)
    return d


# ------------------------------------------------------------------ Sonda (visao geral)
def fig_sonda():
    W, H = 480, 300
    d = Drawing(W, H)
    cx = 230
    for x in (cx - 80, cx + 80):
        d.add(Line(x, 40, cx + (x - cx) * 0.4, 268, strokeColor=LINE, strokeWidth=2))
    box(d, cx - 50, 268, 100, 20, fill=STEEL, stroke=DARK, r=2)
    txt(d, cx + 58, 274, "Bloco de coroamento", size=8, font=FB)
    for i in range(5):
        d.add(Circle(cx - 36 + i * 18, 278, 7, fillColor=LIGHT, strokeColor=DARK, strokeWidth=0.6))
    by = 150
    for i in range(8):
        d.add(Line(cx - 35 + i * 10, 268, cx - 30 + i * 8.6, by + 24, strokeColor=NAVY2, strokeWidth=1.1))
    box(d, cx - 38, by, 76, 24, fill=ORANGE, stroke=DARK, r=3)
    for i in range(4):
        d.add(Circle(cx - 27 + i * 18, by + 12, 6.5, fillColor=colors.HexColor("#FCD9BD"), strokeColor=DARK, strokeWidth=0.6))
    d.add(Line(cx, by, cx, by - 20, strokeColor=DARK, strokeWidth=2))
    p = Path(strokeColor=DARK, strokeWidth=2, fillColor=None)
    p.moveTo(cx, by - 20)
    p.curveTo(cx - 12, by - 22, cx - 12, by - 36, cx, by - 36)
    p.curveTo(cx + 8, by - 36, cx + 10, by - 28, cx + 8, by - 26)
    d.add(p)
    d.add(Rect(cx - 4, 40, 8, by - 80, fillColor=colors.HexColor("#4B5563"), strokeColor=None))
    txt(d, cx + 10, 70, "Coluna", size=8, color=GRAY)
    txt(d, cx - 18, 138, "Catarina", size=8, font=FB, anchor="end")
    txt(d, cx - 18, 128, "(conjunto móvel)", size=7, color=GRAY, anchor="end")
    d.add(Line(cx - 45, 278, 66, 78, strokeColor=RED, strokeWidth=1.6))
    d.add(Circle(60, 62, 18, fillColor=STEEL, strokeColor=DARK))
    d.add(Circle(60, 62, 5, fillColor=DARK, strokeColor=DARK))
    txt(d, 60, 32, "Guincho", size=8, font=FB, anchor="middle")
    txt(d, 118, 160, "Linha rápida", size=8, color=RED, font=FB, anchor="end")
    d.add(Line(cx + 45, 278, 378, 82, strokeColor=GREEN, strokeWidth=1.6))
    txt(d, 322, 222, "Linha morta", size=8, color=GREEN, font=FB)
    d.add(Circle(385, 66, 16, fillColor=STEEL, strokeColor=DARK))
    box(d, 402, 42, 22, 16, fill=ORANGE, stroke=DARK, r=2)
    txt(d, 395, 30, "Sargento + sensor", size=8, font=FB, anchor="middle")
    txt(d, 395, 20, "(é aqui que se mede)", size=7, color=GRAY, anchor="middle")
    txt(d, 20, 236, "Conte estas linhas", size=8, font=FB, color=NAVY2)
    txt(d, 20, 226, "(entre o coroamento e a Catarina):", size=7.5, color=NAVY2)
    txt(d, 20, 214, "N = 8 neste desenho", size=8, font=FB, color=NAVY2)
    arrow(d, 150, 228, cx - 36, 228, color=NAVY2)
    d.add(Line(30, 40, 450, 40, strokeColor=DARK, strokeWidth=1.2))
    txt(d, 98, 44, "Piso da sonda", size=7, color=GRAY)
    return d


# ------------------------------------------------------------------ Sargento (detalhe)
def fig_sargento():
    W, H = 480, 260
    d = Drawing(W, H)
    cx, cy, R = 150, 140, 52
    rc = 7
    d.add(Circle(cx, cy, R + rc, fillColor=None, strokeColor=GREEN, strokeWidth=2 * rc * 0.9, strokeOpacity=0.35))
    d.add(Circle(cx, cy, R, fillColor=LIGHT, strokeColor=DARK, strokeWidth=1.2))
    d.add(Circle(cx, cy, R + rc, fillColor=None, strokeColor=GREEN, strokeWidth=0.8, strokeDashArray=[3, 2]))
    d.add(Line(cx - R - rc, cy, cx - R - rc, 250, strokeColor=GREEN, strokeWidth=2 * rc * 0.9, strokeOpacity=0.5))
    txt(d, cx - R - rc - 12, 236, "Linha morta", size=8, font=FB, color=GREEN, anchor="end")
    txt(d, cx - R - rc - 12, 225, "(tração T)", size=8, color=GREEN, anchor="end")
    arrow(d, cx - R - rc + 14, 210, cx - R - rc + 14, 246, color=GREEN, sw=1.2)
    # diametro do tambor
    yd = cy - R - 24
    arrow(d, cx - R, yd, cx + R, yd, color=NAVY2, both=True, head=4)
    d.add(Line(cx - R, yd - 4, cx - R, cy, strokeColor=NAVY2, strokeWidth=0.4, strokeDashArray=[2, 2]))
    d.add(Line(cx + R, yd - 4, cx + R, cy, strokeColor=NAVY2, strokeWidth=0.4, strokeDashArray=[2, 2]))
    txt(d, cx, yd - 13, "Diâmetro do tambor", size=8, font=FB, color=NAVY2, anchor="middle")
    callout(d, cx - 52, yd - 10, 5)
    # raio efetivo
    arrow(d, cx, cy, cx - R - rc, cy, color=ORANGE, sw=1.2, head=4)
    txt(d, cx - 28, cy + 5, "R efetivo", size=7.5, font=FB, color=ORANGE, anchor="middle")
    d.add(Circle(cx, cy, 5, fillColor=DARK, strokeColor=DARK))
    # diametro do cabo
    txt(d, cx - R - rc - 14, cy - 10, "Diâmetro", size=7.5, font=FB, color=GREEN, anchor="end")
    txt(d, cx - R - rc - 14, cy - 20, "do cabo", size=7.5, font=FB, color=GREEN, anchor="end")
    callout(d, cx - R - rc - 30, cy - 36, 6)
    # braço
    lx = cx + 170
    d.add(Line(cx, cy, lx, cy, strokeColor=DARK, strokeWidth=4))
    d.add(Circle(lx, cy, 4, fillColor=WHITE, strokeColor=DARK))
    arrow(d, cx, cy + 34, lx, cy + 34, color=NAVY2, both=True, head=4)
    d.add(Line(lx, cy + 4, lx, cy + 40, strokeColor=NAVY2, strokeWidth=0.4, strokeDashArray=[2, 2]))
    d.add(Line(cx, cy + 6, cx, cy + 40, strokeColor=NAVY2, strokeWidth=0.4, strokeDashArray=[2, 2]))
    txt(d, (cx + lx) / 2 + 20, cy + 40, "Braço do sensor (L)", size=8, font=FB, color=NAVY2, anchor="middle")
    callout(d, (cx + lx) / 2 + 82, cy + 43, 4)
    txt(d, (cx + lx) / 2 + 20, cy + 52, "do eixo do tambor até a linha da força", size=6.8, color=GRAY, anchor="middle")
    # celula
    box(d, lx - 22, cy - 60, 44, 40, fill=ORANGE, stroke=DARK, r=3)
    d.add(Rect(lx - 4, cy - 20, 8, 16, fillColor=STEEL, strokeColor=DARK))
    txt(d, lx, cy - 37, "Célula", size=7.5, font=FB, color=WHITE, anchor="middle")
    txt(d, lx, cy - 47, "hidráulica", size=7.5, font=FB, color=WHITE, anchor="middle")
    arrow(d, lx + 32, cy - 2, lx + 32, cy - 26, color=RED, sw=1.4)
    txt(d, lx + 38, cy - 18, "Força F", size=8, font=FB, color=RED)
    txt(d, lx + 38, cy - 54, "Área efetiva (A)", size=8, font=FB)
    callout(d, lx + 30, cy - 51, 3)
    p = Path(strokeColor=DARK, strokeWidth=1.5, fillColor=None)
    p.moveTo(lx, cy - 60)
    p.curveTo(lx, cy - 90, lx + 50, cy - 80, lx + 50, cy - 100)
    d.add(p)
    box(d, lx + 35, cy - 120, 30, 20, fill=NAVY2, stroke=DARK, r=2)
    txt(d, lx + 50, cy - 114, "4–20", size=7, color=WHITE, font=FB, anchor="middle")
    txt(d, lx + 74, cy - 106, "Transmissor de pressão", size=7.5, font=FB)
    txt(d, lx + 74, cy - 116, "(range em bar)", size=7.5, color=GRAY)
    callout(d, lx + 27, cy - 110, 1)
    txt(d, 0, 4, "R efetivo = (diâmetro do tambor + diâmetro do cabo) ÷ 2. A tração age no centro do cabo.",
        size=7.5, color=GRAY)
    return d


# ------------------------------------------------------------------ Cadeia de calculo
def fig_cadeia():
    W, H = 500, 150
    d = Drawing(W, H)
    etapas = [("Pressão", "psi"), ("Força no sensor", "lbf"), ("Torque no sargento", "lbf·pol"),
              ("Tração da linha morta", "lbf"), ("Carga suspensa", "lbf"), ("Peso da coluna", "lbf · kgf · tf")]
    ops = ["− pressão zero\n× área efetiva", "× braço", "÷ raio efetivo\n× fator K", "× nº de linhas", "− peso da\nCatarina"]
    bw, bh = 120, 34
    pos = [(10, 100), (190, 100), (370, 100), (370, 20), (190, 20), (10, 20)]
    for i, ((t, u), (x, y)) in enumerate(zip(etapas, pos)):
        dark = i in (0, 5)
        box(d, x, y, bw, bh, fill=NAVY if dark else WHITE, stroke=NAVY, sw=1.2, r=5)
        txt(d, x + bw / 2, y + 19, t, size=8.5, font=FB, color=WHITE if dark else NAVY, anchor="middle")
        txt(d, x + bw / 2, y + 7, u, size=7, color=WHITE if dark else GRAY, anchor="middle")
    links = [((130, 117), (190, 117)), ((310, 117), (370, 117)), ((430, 100), (430, 54)),
             ((370, 37), (310, 37)), ((190, 37), (130, 37))]
    for (a, b), op in zip(links, ops):
        arrow(d, a[0], a[1], b[0], b[1], color=ORANGE, sw=1.4)
        lines = op.split("\n")
        if a[0] == b[0]:
            for k, l in enumerate(lines):
                txt(d, a[0] + 6, (a[1] + b[1]) / 2 + 4 - 9 * k, l, size=7, font=FB, color=ORANGE)
        else:
            mx = (a[0] + b[0]) / 2
            for k, l in enumerate(lines):
                txt(d, mx, a[1] + 6 + 9 * (len(lines) - 1 - k), l, size=7, font=FB, color=ORANGE, anchor="middle")
    return d


# ------------------------------------------------------------------ Tela de calibracao do peso
def fig_tela_peso(diag):
    W, H = 480, 410
    d = Drawing(W, H)
    box(d, 0, 0, W, H, fill=WHITE, stroke=STEEL, sw=1, r=4)
    box(d, 0, H - 38, W, 38, fill=LIGHT, stroke=LIGHT, r=4)
    txt(d, 12, H - 18, "Peso da coluna — Peso da coluna (PESO_01)", size=10, font=FB, color=NAVY)
    txt(d, 12, H - 31, "O sensor mede a pressão no sargento, não o peso no gancho.", size=7, color=GRAY)
    x, lw, w = 16, 140, 240
    y = H - 60
    txt(d, x, y, "Sensor hidráulico", size=8.5, font=FB, color=NAVY)
    campos = [("Range do sensor (bar)", "250", 1), ("Pressão zero (psi)", "0", 2),
              ("Área efetiva do sensor (pol²)", "10", 3), ("Braço do sensor (pol)", "12", 4)]
    for i, (l, v, n) in enumerate(campos):
        yy = y - 20 - i * 18
        field(d, x, yy, w, l, v, lw=lw)
        callout(d, x + w + 14, yy + 6.5, n)
    y = y - 20 - 4 * 18 - 4
    slider(d, x, y - 8, w, "Sensibilidade do sensor:", "1.000", 0.5)
    callout(d, x + w + 14, y, 9)
    y -= 34
    d.add(Line(x, y, 280, y, strokeColor=LINE))
    y -= 14
    txt(d, x, y, "Tambor e cabo", size=8.5, font=FB, color=NAVY)
    campos = [("Diâmetro do tambor (pol)", "30", 5), ("Diâmetro do cabo (pol)", "1", 6), ("Número de linhas", "8", 7)]
    for i, (l, v, n) in enumerate(campos):
        yy = y - 20 - i * 18
        field(d, x, yy, w, l, v, lw=lw)
        callout(d, x + w + 14, yy + 6.5, n)
    y = y - 20 - 3 * 18 - 4
    d.add(Line(x, y + 6, 280, y + 6, strokeColor=LINE))
    y -= 8
    txt(d, x, y, "Conjunto móvel e calibração", size=8.5, font=FB, color=NAVY)
    yy = y - 20
    field(d, x, yy, w, "Peso da Catarina (lbf)", "12000", lw=lw)
    callout(d, x + w + 14, yy + 6.5, 8)
    y = yy - 16
    slider(d, x, y - 8, w, "Fator de calibração:", "1.000", 0.5)
    callout(d, x + w + 14, y, 10)
    dx, dw = 296, 172
    box(d, dx, 46, dw, H - 110, fill=LIGHT, stroke=LINE)
    txt(d, dx + 8, H - 80, "Cálculo com a leitura atual", size=7.5, font=FB, color=NAVY)
    callout(d, dx + dw - 10, H - 77, 11)
    yy = H - 98
    for a, b in diag[:-1]:
        txt(d, dx + 8, yy, a, size=6.6, color=GRAY)
        txt(d, dx + dw - 8, yy, b, size=6.6, font=FM, anchor="end")
        yy -= 15
    d.add(Line(dx + 8, yy + 7, dx + dw - 8, yy + 7, strokeColor=LINE))
    a, b = diag[-1]
    txt(d, dx + 8, yy - 6, a, size=7.5, font=FB, color=NAVY)
    l1, l2 = b
    txt(d, dx + dw - 8, yy - 20, l1, size=8.5, font=FM, color=NAVY, anchor="end")
    txt(d, dx + dw - 8, yy - 32, l2, size=6.6, font=FM, color=NAVY, anchor="end")
    box(d, 0, 0, W, 34, fill=LIGHT, stroke=LIGHT, r=4)
    for t, xx, ww, fill, c in [("Cancelar", 310, 70, WHITE, DARK), ("Salvar", 390, 76, NAVY2, WHITE)]:
        box(d, xx, 9, ww, 16, fill=fill, stroke=NAVY2 if fill == NAVY2 else STEEL)
        txt(d, xx + ww / 2, 14, t, size=7.5, color=c, font=FB if fill == NAVY2 else F, anchor="middle")
    return d


# ------------------------------------------------------------------ Chave hidraulica
def fig_chave():
    W, H = 480, 210
    d = Drawing(W, H)
    pcx, pcy = 70, 120
    d.add(Circle(pcx, pcy, 22, fillColor=colors.HexColor("#4B5563"), strokeColor=DARK))
    d.add(Circle(pcx, pcy, 12, fillColor=WHITE, strokeColor=DARK))
    txt(d, pcx, pcy - 34, "Tubo (centro de giro)", size=7.5, font=FB, anchor="middle")
    ax2 = pcx + 160
    d.add(Line(pcx, pcy, ax2, pcy, strokeColor=STEEL, strokeWidth=7))
    d.add(Circle(ax2, pcy, 5, fillColor=WHITE, strokeColor=DARK))
    arrow(d, pcx, pcy + 30, ax2, pcy + 30, color=NAVY2, both=True, head=4)
    txt(d, (pcx + ax2) / 2, pcy + 36, "Comprimento do braço (ft)", size=8, font=FB, color=NAVY2, anchor="middle")
    box(d, ax2 - 14, pcy - 90, 28, 60, fill=LIGHT, stroke=DARK, r=2)
    d.add(Rect(ax2 - 3, pcy - 30, 6, 26, fillColor=STEEL, strokeColor=DARK))
    txt(d, ax2 + 20, pcy - 60, "Cilindro", size=7.5, font=FB)
    txt(d, ax2 + 20, pcy - 22, "Haste", size=7.5, font=FB)

    def cil(x0, y0, titulo, avanco):
        box(d, x0, y0, 120, 34, fill=LIGHT, stroke=DARK, r=2)
        px = x0 + 50
        oil = colors.HexColor("#FDBA74")
        if avanco:
            d.add(Rect(x0 + 1, y0 + 1, px - x0 - 1, 32, fillColor=oil, strokeColor=None))
        else:
            d.add(Rect(px + 6, y0 + 1, 120 - (px - x0) - 7, 12, fillColor=oil, strokeColor=None))
            d.add(Rect(px + 6, y0 + 21, 120 - (px - x0) - 7, 12, fillColor=oil, strokeColor=None))
        d.add(Rect(px, y0 + 1, 6, 32, fillColor=DARK, strokeColor=DARK))
        d.add(Rect(px + 6, y0 + 13, 90, 8, fillColor=STEEL, strokeColor=DARK))
        if avanco:
            for k in range(3):
                arrow(d, x0 + 10, y0 + 8 + k * 9, px - 2, y0 + 8 + k * 9, color=RED, head=3, sw=0.8)
        else:
            arrow(d, x0 + 114, y0 + 7, px + 8, y0 + 7, color=RED, head=3, sw=0.8)
            arrow(d, x0 + 114, y0 + 27, px + 8, y0 + 27, color=RED, head=3, sw=0.8)
        txt(d, x0, y0 + 42, titulo, size=8, font=FB, color=NAVY)

    cil(320, 140, "Avanço: área cheia do pistão", True)
    cil(320, 64, "Recuo: área anular", False)
    txt(d, 320, 50, "(pistão menos haste)", size=7.5, color=GRAY)
    txt(d, 320, 34, "Óleo sob pressão em laranja.", size=7, color=GRAY)
    txt(d, 0, 4, "Torque (lbf·ft) = pressão (psi) × área hidráulica (pol²) × braço (ft)", size=8, font=FM, color=NAVY2)
    return d


# ------------------------------------------------------------------ Termometro
def fig_termometro():
    W, H = 320, 170
    d = Drawing(W, H)
    x = 60
    box(d, x - 7, 40, 14, 115, fill=WHITE, stroke=DARK, r=7)
    d.add(Rect(x - 4, 36, 8, 70, fillColor=RED, strokeColor=None))
    d.add(Circle(x, 36, 13, fillColor=RED, strokeColor=DARK))
    for v, frac in [("150 °C  = 20 mA (máximo da escala)", 1), ("65 °C   = 12 mA", 0.5), ("−20 °C  = 4 mA (mínimo da escala)", 0)]:
        yy = 50 + frac * 95
        d.add(Line(x + 8, yy, x + 18, yy, strokeColor=DARK))
        txt(d, x + 24, yy - 3, v, size=8, font=F if frac == 0.5 else FB)
    txt(d, 0, 4, "valor = mínimo + fração × (máximo − mínimo)", size=8, font=FM, color=NAVY2)
    return d


# ------------------------------------------------------------------ Tanque
def fig_tanque():
    W, H = 480, 240
    d = Drawing(W, H)
    tx, ty, tw, th = 30, 40, 150, 150
    d.add(Rect(tx, ty, tw, th, fillColor=WHITE, strokeColor=DARK, strokeWidth=1.4))
    lvl = 90
    d.add(Rect(tx + 1, ty + 1, tw - 2, lvl, fillColor=WATER, strokeColor=None))
    d.add(Line(tx, ty + lvl, tx + tw, ty + lvl, strokeColor=BLUE, strokeWidth=1))
    sx = tx + tw / 2
    box(d, sx - 12, ty + th, 24, 14, fill=NAVY2, stroke=DARK, r=2)
    txt(d, sx, ty + th + 20, "Sensor (sempre no topo)", size=7.5, font=FB, anchor="middle")
    full = ty + th - 22
    d.add(Line(tx, full, tx + tw, full, strokeColor=GREEN, strokeWidth=0.8, strokeDashArray=[4, 2]))
    txt(d, tx + tw + 4, full - 3, "nível com o tanque cheio", size=7, color=GREEN)
    arrow(d, sx - 34, ty + th, sx - 34, full, color=GREEN, both=True, head=3)
    txt(d, sx - 38, full + 6, "dist. mínima", size=7, font=FB, color=GREEN, anchor="end")
    arrow(d, sx + 34, ty + th, sx + 34, ty, color=ORANGE, both=True, head=4)
    txt(d, tx + tw + 4, ty + 60, "dist. máxima", size=7, font=FB, color=ORANGE)
    txt(d, tx + tw + 4, ty + 51, "(tanque vazio:", size=7, color=ORANGE)
    txt(d, tx + tw + 4, ty + 42, "do sensor ao fundo)", size=7, color=ORANGE)
    arrow(d, sx, ty + th, sx, ty + lvl, color=DARK, both=True, head=3)
    txt(d, sx + 4, ty + lvl + 22, "distância lida", size=7, color=DARK)
    arrow(d, tx + 14, ty, tx + 14, ty + lvl, color=BLUE, both=True, head=3)
    txt(d, tx + 18, ty + 30, "altura do líquido", size=7, font=FB, color=BLUE)
    fx = 310
    txt(d, fx, 215, "Formas aceitas e medidas pedidas", size=8.5, font=FB, color=NAVY)
    d.add(Ellipse(fx + 20, 190, 16, 5, fillColor=LIGHT, strokeColor=DARK))
    d.add(Line(fx + 4, 190, fx + 4, 152, strokeColor=DARK))
    d.add(Line(fx + 36, 190, fx + 36, 152, strokeColor=DARK))
    d.add(Ellipse(fx + 20, 152, 16, 5, fillColor=LIGHT, strokeColor=DARK))
    txt(d, fx + 50, 176, "Cilíndrico vertical", size=7.5, font=FB)
    txt(d, fx + 50, 166, "raio + altura", size=7.5, color=GRAY)
    d.add(Ellipse(fx + 8, 116, 6, 16, fillColor=LIGHT, strokeColor=DARK))
    d.add(Line(fx + 8, 132, fx + 40, 132, strokeColor=DARK))
    d.add(Line(fx + 8, 100, fx + 40, 100, strokeColor=DARK))
    d.add(Ellipse(fx + 40, 116, 6, 16, fillColor=LIGHT, strokeColor=DARK))
    txt(d, fx + 50, 120, "Cilíndrico horizontal", size=7.5, font=FB)
    txt(d, fx + 50, 110, "raio + comprimento", size=7.5, color=GRAY)
    d.add(Rect(fx + 4, 52, 32, 26, fillColor=LIGHT, strokeColor=DARK))
    d.add(Polygon([fx + 4, 78, fx + 12, 84, fx + 44, 84, fx + 36, 78], fillColor=WHITE, strokeColor=DARK))
    d.add(Polygon([fx + 36, 78, fx + 44, 84, fx + 44, 58, fx + 36, 52], fillColor=STEEL, strokeColor=DARK))
    txt(d, fx + 50, 68, "Retangular / cubo", size=7.5, font=FB)
    txt(d, fx + 50, 58, "comprimento + largura + altura", size=7.5, color=GRAY)
    txt(d, fx, 28, "Medidas internas, em metros.", size=7.5, color=GRAY)
    txt(d, 0, 4, "altura do líquido = distância máxima − distância lida", size=8, font=FM, color=NAVY2)
    return d


# ------------------------------------------------------------------ Bomba triplex
def fig_bomba():
    W, H = 440, 120
    d = Drawing(W, H)
    for i in range(3):
        y = 24 + i * 30
        box(d, 40, y, 120, 22, fill=LIGHT, stroke=DARK, r=2)
        d.add(Rect(60 + i * 12, y + 1, 10, 20, fillColor=DARK, strokeColor=None))
        d.add(Rect(70 + i * 12, y + 8, 110 - i * 12, 6, fillColor=STEEL, strokeColor=DARK))
    arrow(d, 30, 24, 30, 46, color=NAVY2, both=True, head=3)
    txt(d, 26, 32, "D", size=8, font=FB, color=NAVY2, anchor="end")
    arrow(d, 60, 14, 160, 14, color=ORANGE, both=True, head=3)
    txt(d, 110, 2, "curso (L)", size=7.5, font=FB, color=ORANGE, anchor="middle")
    txt(d, 210, 92, "Bomba triplex: 3 pistões", size=8.5, font=FB, color=NAVY)
    txt(d, 210, 77, "D = diâmetro interno da camisa (pol)", size=7.5)
    txt(d, 210, 65, "L = curso do pistão (pol)", size=7.5)
    txt(d, 210, 45, "bbl/stroke = 0,000243 × D² × L × eficiência", size=8, font=FM, color=NAVY2)
    return d


# ------------------------------------------------------------------ Card no dashboard
def fig_card_dashboard(valor="44.144"):
    W, H = 230, 120
    d = Drawing(W, H)
    box(d, 10, 10, 190, 100, fill=WHITE, stroke=LINE, sw=1, r=6)
    d.add(Rect(10, 104, 190, 6, fillColor=NAVY2, strokeColor=None))
    txt(d, 22, 88, "Peso da coluna", size=9, font=FB, color=NAVY)
    gear(d, 186, 91, 6, GRAY, hole=WHITE)
    txt(d, 22, 48, valor, size=22, font=FB, color=DARK)
    txt(d, 108, 48, "lbf", size=10, color=GRAY)
    txt(d, 190, 18, "Ax 150", size=7, font=FM, color=GRAY, anchor="end")
    callout(d, 214, 92, 1)
    callout(d, 214, 22, 2)
    return d
