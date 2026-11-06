"""Selfnode logo, redrawn from the source PNG (docs/brand/selfnode-logo-source.png).
Every edge is a least-squares fit of the source's pixels (see fit.json): same
angles, band thicknesses, gaps and clipped chevron corners. Only the wobble is
gone: each edge is the straight line fitted through the source's (slightly
wobbly) edge. Coordinates are in the source's 1254 px grid.

Measured by classifying the source's pixels (teal / ink / background) and
fitting y = a + b*|x - centre| to each edge over hundreds of columns, averaging
left and right. A pixel diff of the 1254 px render against the source differs
only inside the ~2 px anti-aliased fringe along the edges.

usage: python3 redraw.py <out-dir>   (writes selfnode-logo.svg, icon.svg, favicon.svg, mark.svg)"""
import sys
TEAL, INK, BG = "#0b5f5a", "#22262d", "#f6f5f1"
C, W = 626.5, 356.0                       # centre line and half-width (sides at 270.5 / 982.5)
S_OT, S_OB, S_HT, S_HB = 0.577, 0.555, 0.573, 0.564   # diamond outer top/bottom, hole top/bottom
S_CU, S_CL, S_CH = 0.555, 0.563, 0.489                # chevron upper, lower, corner chamfer
OT, HT, HB, OB = 235.63, 334.94, 607.73, 710.61       # centre-line y of the diamond's edges
C1U, C1L, STEP = 776.04, 877.64, 160.3                # chevron 1 upper/lower at the centre; chevron 2 offset
CH_REL = 442.68 - C1U                                  # chamfer line intercept relative to the chevron's upper edge
# Chevron 2 as fitted (it's ~2 px thicker and a touch flatter than chevron 1 in the source).
C2 = dict(u=935.21, l=1039.16, su=0.547, sl=0.559, ch=608.61, sch=0.477)
f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
def P(pts): return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"

def shapes(heavy=1.0):
    """heavy > 1 thickens every band (same angles, corners and outer size) for tiny favicons."""
    tb, bb = (HT - OT) * heavy, (OB - HB) * heavy                 # diamond band thicknesses
    ht, hb = OT + tb, OB - bb
    t = (C1L - C1U) * heavy                                        # chevron thickness
    gap1 = C1U - OB                                                # diamond → chevron gap
    gap2 = STEP - (C1L - C1U)                                      # chevron → chevron gap
    # Keep the overall height: what the bands gain, the gaps give up.
    total_gap = gap1 + gap2 - (t - (C1L - C1U)) * 2  # the diamond thickens inward, so only chevrons cost gap
    g1, g2 = total_gap * gap1 / (gap1 + gap2), total_gap * gap2 / (gap1 + gap2)
    ob = OB  # the outer outline never changes
    outer = [(C, OT), (C + W, OT + S_OT * W), (C + W, ob - S_OB * W), (C, ob), (C - W, ob - S_OB * W), (C - W, OT + S_OT * W)]
    d = (hb - ht) / (S_HT + S_HB)
    hole = [(C, ht), (C + d, ht + S_HT * d), (C, hb), (C - d, ht + S_HT * d)]
    def chevron(u, l, su, sl, ch, sch):
        dc = (u - ch) / (su + sch)                                 # where the upper edge meets the chamfer
        pts_r = [(C + dc, u - su * dc), (C + W, ch + sch * W), (C + W, l - sl * W)]
        pts_l = [(2 * C - x, y) for x, y in pts_r]
        return [(C, u)] + pts_r + [(C, l)] + list(reversed(pts_l))
    u1 = ob + g1
    first = chevron(u1, u1 + t, S_CU, S_CL, u1 + CH_REL, S_CH)
    if heavy == 1.0:
        second = chevron(**C2)                                     # exact: the source's own lines
    else:
        u2 = u1 + t + g2                                           # heavy favicon: two identical chevrons
        second = chevron(u2, u2 + t, S_CU, S_CL, u2 + CH_REL, S_CH)
    chevrons = [first, second]
    return outer, hole, chevrons

def body(heavy=1.0, teal=TEAL, ink=INK):
    outer, hole, chevrons = shapes(heavy)
    return (f'<path d="{P(outer)} {P(hole)}" fill="{teal}" fill-rule="evenodd"/>'
            + "".join(f'<path d="{P(c)}" fill="{ink}"/>' for c in chevrons))

def svg(inner, view="0 0 1254 1254", bg=None, rx=0, title="Selfnode"):
    x, y, w, h = (float(v) for v in view.split())
    r = f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(rx)}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}"><title>{title}</title>{r}{inner}</svg>\n'

out = sys.argv[1]
# Exact redraw, full-bleed square like the source.
open(f"{out}/selfnode-logo.svg", "w").write(svg(body(), bg=BG))
# App icon: same drawing on a rounded tile (macOS-style corner radius).
open(f"{out}/icon.svg", "w").write(svg(body(), bg=BG, rx=276))
# Favicon: thicker bands, same shapes, cropped tighter so it fills a 16 px tab icon.
open(f"{out}/favicon.svg", "w").write(svg(body(heavy=1.15), view="155.5 165.8 942 942", bg=BG, rx=150))
# Header mark: transparent, chevrons follow the text colour, diamond the Private teal token.
open(f"{out}/mark.svg", "w").write(svg(body(teal="var(--private, #0b5f5a)", ink="currentColor"), view="262 228 729 820"))
print(shapes()[2][0])
