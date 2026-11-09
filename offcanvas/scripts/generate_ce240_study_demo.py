"""Regenerate the illustrated CE 240 Homework 2 presentation packet."""
from __future__ import annotations

import argparse
import base64
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile

os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'offcanvas-matplotlib'))

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'extension' / 'fixtures' / 'ce240_homework2_study.json'
ASSIGNMENT = 'Homework 2 - Trapezoidal Piecewise-Linear Waveforms'
PROVENANCE = ('Illustrative demo waveform with vertices (0, 0), (1, 2), (3, 2), '
              'and (4, 0), and zero amplitude outside 0 <= t <= 4.')
CAPTION = ('Illustrative trapezoidal waveform: rises from (0, 0) to (1, 2), '
           'stays at 2 through t = 3, and falls to (4, 0).')

MARKDOWN = r'''## A method you can reuse

This study packet explains **trapezoidal piecewise-linear waveforms** using an illustrative example. Its breakpoints are demo values; use the values and units in your actual Homework 2 instructions when applying the method [S1].

By the end, you should be able to read a waveform's breakpoints, derive each straight-line segment, express the result with shifted ramps, and check continuity and area.

## 1. Read the diagram

The illustrative waveform is zero outside $0\le t\le4$. Its four vertices are $(0,0)$, $(1,2)$, $(3,2)$ and $(4,0)$ [S1]. The graph therefore has three active intervals:

- **Rise:** from $t=0$ to $t=1$, amplitude increases from $0$ to $2$.
- **Plateau:** from $t=1$ to $t=3$, amplitude stays at $2$.
- **Fall:** from $t=3$ to $t=4$, amplitude decreases from $2$ to $0$.

The horizontal axis is the independent variable $t$ and the vertical axis is amplitude $x(t)$. The example uses arbitrary units.

## 2. Find the slopes and segment equations

For a segment through $(t_1,x_1)$ and $(t_2,x_2)$, use

$$
m=\frac{x_2-x_1}{t_2-t_1},\qquad x(t)=x_1+m(t-t_1).
$$

| Interval | Slope calculation | Segment equation |
| --- | --- | --- |
| $t<0$ | $0$ | $x(t)=0$ |
| $0\le t<1$ | $(2-0)/(1-0)=2$ | $x(t)=2t$ |
| $1\le t<3$ | $(2-2)/(3-1)=0$ | $x(t)=2$ |
| $3\le t<4$ | $(0-2)/(4-3)=-2$ | $x(t)=2-2(t-3)=8-2t$ |
| $t\ge4$ | $0$ | $x(t)=0$ |

The falling segment must pass through $(3,2)$: its slope is $-2$, but the correct line is $8-2t$, not $-2t$ [S2].

## 3. Write the piecewise waveform

$$
x(t)=\begin{cases}
0, & t<0,\\
2t, & 0\le t<1,\\
2, & 1\le t<3,\\
8-2t, & 3\le t<4,\\
0, & t\ge4.
\end{cases}
$$

Every boundary belongs to exactly one interval in this definition. Because the neighboring formulas agree at each breakpoint, choosing the other adjacent interval at an endpoint gives the same amplitude.

## 4. Build the ramp representation

Define the unit ramp $r(t)=\max(t,0)=t\,u(t)$, where $u(t)$ is the unit step [S2]. A term $c\,r(t-a)$ changes the waveform's slope by $c$ beginning at $t=a$.

Read the changes in slope, rather than adding the slopes themselves:

| Breakpoint | Slope before | Slope after | Change to add |
| --- | --- | --- | --- |
| $t=0$ | $0$ | $2$ | $+2r(t)$ |
| $t=1$ | $2$ | $0$ | $-2r(t-1)$ |
| $t=3$ | $0$ | $-2$ | $-2r(t-3)$ |
| $t=4$ | $-2$ | $0$ | $+2r(t-4)$ |

Thus the entire waveform is

$$
x(t)=2r(t)-2r(t-1)-2r(t-3)+2r(t-4).
$$

For example, at $t=2$ only the first two ramps are active, giving $2(2)-2(1)=2$. At $t=5$, all four ramps are active and give $10-8-4+2=0$. These checks confirm both the plateau and the return to zero [S2].

## 5. Check continuity, height and area

- At $t=0$, the rising segment gives $2(0)=0$.
- At $t=1$, the rise reaches $2(1)=2$, matching the plateau.
- At $t=3$, the falling segment gives $8-2(3)=2$, matching the plateau.
- At $t=4$, the falling segment gives $8-2(4)=0$, matching the final zero segment.

The maximum amplitude is $2$ over the whole plateau $1\le t\le3$. It is not a single isolated peak.

Split the area into a left triangle, a rectangle and a right triangle:

$$
\int_{-\infty}^{\infty}x(t)\,dt
=\frac12(1)(2)+(2)(2)+\frac12(1)(2)=1+4+1=6.
$$

This agrees with the trapezoid formula: $(\text{bottom width}+\text{top width})\times\text{height}/2=(4+2)\times2/2=6$ [S2].

## 6. Practice shifting and scaling

1. Evaluate $x(0.5)$, $x(2)$ and $x(3.5)$.
2. For $y(t)=x(t-2)$, where are the four breakpoints? What happens to the height and area?
3. For $z(t)=\tfrac12x(t)$, what are the plateau height, rising slope, falling slope and total area?
4. Why is the final $+2r(t-4)$ term necessary in the ramp representation?

## Practice answers

1. $x(0.5)=1$, $x(2)=2$ and $x(3.5)=1$.
2. The graph shifts right by $2$, so the breakpoints become $2,3,5,6$. The height remains $2$ and the area remains $6$.
3. Multiplying amplitude by $\tfrac12$ gives height $1$, rising slope $+1$, falling slope $-1$ and area $3$.
4. At $t=4$ the slope must change from $-2$ back to $0$. The last ramp supplies that $+2$ change; omitting it would make the graph continue downward instead of staying at zero [S2].

## Before you finish

- Copy the actual assignment's breakpoint times, amplitudes and units accurately.
- Use one linear equation for each interval and include the zero intervals.
- Check both neighboring formulas at every breakpoint.
- In a ramp sum, use **changes in slope** as coefficients.
- Confirm the final segment returns to the intended baseline.
'''


def figure_png() -> bytes:
    """Draw the exact waveform and verify the alternative ramp expression."""
    t = np.linspace(-0.5, 4.5, 1001)
    x = np.select([t < 0, t < 1, t < 3, t < 4], [0, 2*t, 2, 8-2*t], default=0)
    ramp = lambda value: np.maximum(value, 0)
    ramps = 2*ramp(t) - 2*ramp(t-1) - 2*ramp(t-3) + 2*ramp(t-4)
    assert np.allclose(x, ramps)
    assert np.trapezoid([0, 2, 2, 0], [0, 1, 3, 4]) == 6

    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 14})
    fig, ax = plt.subplots(figsize=(7.2, 4.3), dpi=180)
    fig.patch.set_facecolor('#fffdfa')
    ax.set_facecolor('#fffdfa')
    ink, accent, muted = '#2a211c', '#ad4929', '#756b63'
    ax.fill_between(t, 0, x, color=accent, alpha=.10)
    ax.axhline(0, color='#b2a79e', linewidth=1, zorder=1)
    ax.vlines([1, 3], 0, 2, color='#c8b9ae', linestyles='dashed', linewidth=1)
    ax.plot(t, x, color=accent, linewidth=3, solid_capstyle='round', zorder=3)
    ax.scatter([0, 1, 3, 4], [0, 2, 2, 0], s=36, color=accent, zorder=4)
    for point, label, offset, align in [
        ((0, 0), '(0, 0)', (-8, -27), 'right'),
        ((1, 2), '(1, 2)', (-5, 12), 'right'),
        ((3, 2), '(3, 2)', (5, 12), 'left'),
        ((4, 0), '(4, 0)', (8, -27), 'left'),
    ]:
        ax.annotate(label, point, textcoords='offset points', xytext=offset,
                    ha=align, color=ink, fontsize=13)
    ax.text(.28, 1.57, 'Rise\nslope +2', color=accent, ha='right', va='center', fontsize=14)
    ax.text(2, 1.2, 'Plateau\nheight 2\nslope 0', color=ink, ha='center', va='center', fontsize=14)
    ax.text(3.72, 1.57, 'Fall\nslope −2', color=accent, ha='left', va='center', fontsize=14)
    ax.set(xlim=(-.65, 4.65), ylim=(-.5, 2.7), xticks=[0, 1, 2, 3, 4], yticks=[0, 1, 2])
    ax.set_xlabel('t  (arbitrary units)', color=ink, labelpad=10)
    ax.set_ylabel('Amplitude x(t)', color=ink, labelpad=10)
    ax.set_title('Illustrative trapezoidal waveform', loc='left', color=ink, fontsize=16, pad=16)
    ax.tick_params(colors=muted, labelsize=12, length=0, pad=6)
    for side in ('top', 'right', 'bottom', 'left'):
        ax.spines[side].set_visible(False)
    fig.subplots_adjust(left=.13, right=.97, bottom=.20, top=.84)
    output = BytesIO()
    fig.savefig(output, format='png', dpi=180, facecolor=fig.get_facecolor())
    plt.close(fig)
    return output.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', type=Path, help='Also save the waveform PNG for visual inspection.')
    arguments = parser.parse_args()
    image = figure_png()
    packet = {
        'title': f'CE 240 · {ASSIGNMENT} study packet',
        'summary': 'A complete study packet on trapezoidal piecewise-linear waveforms: a labeled diagram, segment equations, shifted ramps, continuity and area checks, and practice questions.',
        'markdown': MARKDOWN,
        'sampleMarkdown': '',
        'sources': [
            {'id': 'S1', 'title': f'CE 240 · {ASSIGNMENT}', 'url': '',
             'excerpt': 'Illustrative presentation reference. ' + PROVENANCE},
            {'id': 'S2', 'title': 'Trapezoidal waveform study notes', 'url': '',
             'excerpt': 'Illustrative demo study notes: each segment uses slope = change in amplitude / change in t. The unit ramp is r(t) = max(t, 0). The waveform has slope changes +2, -2, -2, +2 at t = 0, 1, 3, 4; its two triangles and central rectangle have total area 6.'},
        ],
        'diagrams': [], 'graphs': [], 'images': [], 'warnings': [],
        'autopilot': False,
        'renderedVisuals': [{
            'id': 'trapezoidal-waveform', 'title': 'Trapezoidal piecewise-linear waveform',
            'kind': 'function', 'mimeType': 'image/png', 'data': base64.b64encode(image).decode('ascii'),
            'caption': CAPTION, 'provenance': {'sourceId': 'S1', 'quote': PROVENANCE},
            'verification': 'computed',
        }],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + '\n')
    if arguments.preview:
        arguments.preview.write_bytes(image)
    print(f'Wrote {OUTPUT} ({len(image):,} PNG bytes).')


if __name__ == '__main__':
    main()
