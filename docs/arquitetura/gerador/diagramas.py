# -*- coding: utf-8 -*-
"""Diagramas do documento de decisoes de arquitetura. Rotulos vem do idioma escolhido."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "manuais", "gerador"))

from reportlab.graphics.shapes import Drawing, Rect, Line, Ellipse, Polygon  # noqa: E402
from reportlab.lib import colors  # noqa: E402

from figs import (txt, box, arrow, callout, NAVY, NAVY2, ORANGE, GRAY, LIGHT, STEEL, DARK,  # noqa: E402
                  GREEN, WHITE, F, FB, FM)

BLUE_L = colors.HexColor("#EFF6FF")
GREEN_L = colors.HexColor("#ECFDF5")
ORANGE_L = colors.HexColor("#FFF7ED")
PURPLE = colors.HexColor("#7C3AED")


def regiao(d, x, y, w, h, titulo, cor, fundo, direita=False):
    d.add(Rect(x, y, w, h, rx=6, ry=6, fillColor=fundo, strokeColor=cor, strokeWidth=1,
               strokeDashArray=[4, 3]))
    if direita:
        txt(d, x + w - 7, y + h - 12, titulo, size=7.5, font=FB, color=cor, anchor="end")
    else:
        txt(d, x + 7, y + h - 12, titulo, size=7.5, font=FB, color=cor)


def servico(d, x, y, w, h, titulo, linhas=(), fill=WHITE, stroke=NAVY, tc=NAVY):
    box(d, x, y, w, h, fill=fill, stroke=stroke, sw=1.1, r=4)
    n = len(linhas)
    topo = y + h / 2 + (n * 9) / 2 + 1
    txt(d, x + w / 2, topo - 2, titulo, size=8, font=FB, color=tc, anchor="middle")
    for i, l in enumerate(linhas):
        txt(d, x + w / 2, topo - 12 - i * 9, l, size=6.6, color=GRAY if tc == NAVY else tc, anchor="middle")


def banco(d, cx, y, w, h, titulo, sub=""):
    rx, ry = w / 2, 5
    d.add(Rect(cx - rx, y, w, h, fillColor=LIGHT, strokeColor=None))
    d.add(Ellipse(cx, y, rx, ry, fillColor=LIGHT, strokeColor=DARK, strokeWidth=0.8))
    d.add(Rect(cx - rx + 0.4, y, w - 0.8, h, fillColor=LIGHT, strokeColor=None))
    d.add(Line(cx - rx, y, cx - rx, y + h, strokeColor=DARK, strokeWidth=0.8))
    d.add(Line(cx + rx, y, cx + rx, y + h, strokeColor=DARK, strokeWidth=0.8))
    d.add(Ellipse(cx, y + h, rx, ry, fillColor=colors.HexColor("#E5E7EB"), strokeColor=DARK, strokeWidth=0.8))
    txt(d, cx, y + h / 2 - 1, titulo, size=7.2, font=FB, color=DARK, anchor="middle")
    if sub:
        txt(d, cx, y + h / 2 - 10, sub, size=6.3, color=GRAY, anchor="middle")


def fig_arquitetura(L):
    W, H = 482, 560
    d = Drawing(W, H)
    regiao(d, 0, 200, 152, 345, L["campo"], ORANGE, ORANGE_L)
    regiao(d, 0, 18, 152, 172, L["autonomo"], STEEL, colors.HexColor("#F9FAFB"))
    regiao(d, 164, 236, 318, 262, L["vm1"], NAVY2, BLUE_L)
    regiao(d, 164, 18, 318, 206, L["vm2"], GREEN, GREEN_L, direita=True)

    servico(d, 300, 512, 175, 38, L["navegador"], ["Geopetro-Front · Angular"], fill=NAVY, stroke=NAVY, tc=WHITE)
    servico(d, 240, 438, 236, 32, "nginx", [L["origem_unica"]])
    servico(d, 176, 326, 134, 72, "Geopetro-Backend", L["backend_l"])
    servico(d, 345, 326, 131, 72, "Braserv-Core", L["core_l"])
    banco(d, 243, 258, 100, 34, "MySQL", "geopetro_io")
    banco(d, 410, 258, 100, 34, "MySQL", "braserv_core")
    servico(d, 176, 140, 114, 46, "Mosquitto", [L["broker"]])
    servico(d, 345, 140, 131, 46, "Geopetro-Telemetria", [L["tel_l"]])
    banco(d, 410, 42, 110, 36, "InfluxDB", L["influx_l"])

    servico(d, 12, 470, 96, 32, L["clp_s7"], [], fill=DARK, stroke=DARK, tc=WHITE)
    # PC da unidade: o Desktop roda nele e e a unica saida do CLP para a rede
    d.add(Rect(6, 222, 140, 218, rx=5, ry=5, fillColor=WHITE, strokeColor=ORANGE, strokeWidth=0.9,
               strokeDashArray=[2, 2]))
    txt(d, 13, 228, L["pc"], size=7, font=FB, color=ORANGE)
    servico(d, 12, 260, 96, 150, "Geopetro-Desktop", L["desk_l"], fill=WHITE, stroke=ORANGE)
    for y, rotulo, cor in [(396, L["saida_ws"], NAVY2), (280, L["saida_mqtt"], GREEN)]:
        d.add(Line(108, y, 146, y, strokeColor=cor, strokeWidth=1.4))
        txt(d, 127, y + 3, rotulo, size=6, font=FB, color=cor, anchor="middle")
    servico(d, 12, 140, 126, 28, L["clp_logo"], [], fill=DARK, stroke=DARK, tc=WHITE)
    servico(d, 6, 36, 140, 72, "Braserv-Horus", L["horus_l"], fill=WHITE, stroke=STEEL)

    arrow(d, 60, 470, 60, 412, color=DARK, sw=1.2); callout(d, 74, 452, 1)
    arrow(d, 146, 280, 200, 188, color=GREEN, sw=1.4); callout(d, 166, 246, 2)
    arrow(d, 290, 163, 343, 163, color=GREEN, sw=1.4)
    arrow(d, 410, 140, 410, 82, color=GREEN, sw=1.4); callout(d, 424, 111, 3)
    arrow(d, 146, 396, 238, 452, color=NAVY2, sw=1.4); callout(d, 190, 437, 4)
    arrow(d, 388, 512, 388, 472, color=NAVY2, sw=1.4); callout(d, 402, 492, 5)
    arrow(d, 420, 438, 420, 400, color=NAVY2, sw=1.4); callout(d, 434, 419, 6)
    arrow(d, 262, 438, 262, 400, color=NAVY2, sw=1.4); callout(d, 276, 419, 7)
    arrow(d, 311, 362, 343, 362, color=PURPLE, sw=1.4, both=True, head=4); callout(d, 327, 378, 8)
    arrow(d, 300, 326, 362, 188, color=PURPLE, sw=1.4); callout(d, 342, 240, 9)
    arrow(d, 243, 326, 243, 296, color=DARK, sw=1); callout(d, 257, 311, 10)
    arrow(d, 410, 326, 410, 296, color=DARK, sw=1); callout(d, 424, 311, 10)
    arrow(d, 75, 140, 75, 112, color=DARK, sw=1.2); callout(d, 89, 126, 11)

    # legenda de cores
    ly = 4
    for cor, t, x in [(GREEN, L["leg_hist"], 0), (NAVY2, L["leg_pub"], 120), (PURPLE, L["leg_int"], 260)]:
        d.add(Line(x, ly + 3, x + 18, ly + 3, strokeColor=cor, strokeWidth=2))
        txt(d, x + 22, ly, t, size=7, color=DARK)
    return d


def fig_borda(L):
    W, H = 482, 210
    d = Drawing(W, H)
    servico(d, 0, 92, 62, 30, L["clp"], [], fill=DARK, stroke=DARK, tc=WHITE)
    arrow(d, 62, 107, 86, 107, color=DARK, sw=1.2)
    servico(d, 86, 84, 104, 46, L["leitor"], [L["leitor_sub"]], fill=ORANGE_L, stroke=ORANGE)
    linhas = L["borda_linhas"]
    ys = [168, 118, 68, 18]
    cores = [GREEN, NAVY2, STEEL, ORANGE]
    for (estr, dest, nota), y, cor in zip(linhas, ys, cores):
        d.add(Line(190, 107, 214, 107, strokeColor=DARK, strokeWidth=1))
        d.add(Line(214, 107, 214, y + 15, strokeColor=DARK, strokeWidth=1))
        arrow(d, 214, y + 15, 236, y + 15, color=DARK, sw=1)
        servico(d, 236, y, 112, 30, estr, [], fill=WHITE, stroke=cor, tc=DARK)
        arrow(d, 348, y + 15, 366, y + 15, color=cor, sw=1.2)
        servico(d, 366, y, 116, 30, dest, [nota], fill=WHITE, stroke=cor, tc=DARK)
    return d
