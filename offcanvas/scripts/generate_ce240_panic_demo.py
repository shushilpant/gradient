"""Rebuild the CE 240 Homework 1 saved Panic demonstration and computed graph."""
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
OUTPUT = ROOT / 'extension' / 'fixtures' / 'ce240_homework1_automation.json'
ASSIGNMENT = 'Homework 1 - Amplitude Spectrum Derivation'
COURSE = 'CE 240 H001'
COEFFICIENTS = 'a_n = V sin(2 n pi t1/T)/(n pi), b_n = V[1 - cos(2 n pi t1/T)]/(n pi), n >= 1.'
PLOT_BASIS = 'Normalized illustration using V = 1 and duty cycle t1/T = 1/4. These plotting values are illustrative, not values specified in the assignment metadata or handwritten derivation.'

MARKDOWN = r'''## 1. Start with the Fourier coefficients

The saved reference follows the coefficients in the local Homework 1 derivation [S2]. Write the real Fourier series as

$$
v(t)=\frac{a_0}{2}+\sum_{n=1}^{\infty}\bigl[a_n\cos(n\omega_0t)+b_n\sin(n\omega_0t)\bigr],\qquad \omega_0=\frac{2\pi}{T}.
$$

For positive harmonic number $n$, the supplied coefficients are

$$
a_n=\frac{V}{n\pi}\sin\left(\frac{2n\pi t_1}{T}\right),\qquad
b_n=\frac{V}{n\pi}\left[1-\cos\left(\frac{2n\pi t_1}{T}\right)\right].
$$

The amplitude of each sinusoidal harmonic is $A_n=\sqrt{a_n^2+b_n^2}$. This is the one-sided real harmonic amplitude. The magnitude of a complex Fourier coefficient is $|c_n|=A_n/2$ for $n\ge1$.

## 2. Derive the amplitude spectrum

Let $\theta_n=2n\pi t_1/T$. Substituting the coefficients gives

$$
\begin{aligned}
A_n
&=\frac{|V|}{n\pi}\sqrt{\sin^2\theta_n+(1-\cos\theta_n)^2}\\
&=\frac{|V|}{n\pi}\sqrt{\sin^2\theta_n+1-2\cos\theta_n+\cos^2\theta_n}\\
&=\frac{|V|}{n\pi}\sqrt{2-2\cos\theta_n}\\
&=\frac{|V|}{n\pi}\sqrt{2\left[1-\cos\left(\frac{2n\pi t_1}{T}\right)\right]}.
\end{aligned}
$$

The third line uses $\sin^2\theta+\cos^2\theta=1$. Apply $1-\cos\theta=2\sin^2(\theta/2)$ to obtain

$$
\boxed{A_n=\frac{2|V|}{n\pi}\left|\sin\left(\frac{n\pi t_1}{T}\right)\right|,\qquad n=1,2,\ldots}
$$

The absolute values keep amplitude nonnegative. For the usual positive pulse height $V$, $|V|=V$. The square-root form matches the endpoint of the local handwritten derivation [S2].

## 3. Read the graph

The plot uses the explicitly labeled illustration $D=t_1/T=1/4$ and $V=1$. These values demonstrate the formula because the available assignment metadata and handwritten notes specify no numerical values [S1] [S2].

The coefficients are consistent with a periodic rectangular pulse of height $V$ on $0\le t<t_1$ in each period. With that pulse interpretation,

$$
\frac{a_0}{2}=VD,\qquad \frac{A_n}{|V|}=\frac{2}{n\pi}|\sin(n\pi D)|.
$$

For $D=1/4$, the DC level is $0.25$, $A_1\approx0.45016$, $A_2=1/\pi\approx0.31831$, $A_3\approx0.15005$, and $A_4=0$. Every fourth harmonic vanishes. The spectrum is discrete at $f_n=n/T$, and its envelope is $2|V|/(n\pi)$ [S3].

## 4. Checks

- At $t_1=0$, every positive-harmonic amplitude is zero.
- At $t_1=T$, the pulse is constant and every positive-harmonic amplitude is zero.
- At $t_1=T/2$, even harmonics vanish and odd harmonics have amplitude $2|V|/(n\pi)$.
- Treat the DC level separately. The formula for $A_n$ is defined for $n\ge1$.

This is a saved demonstration reference. Use the actual assignment PDF for any additional waveform convention, numerical values, or required plot range.
'''


def figure_png() -> bytes:
    duty = 0.25
    n = np.arange(1, 21)
    theta = 2 * np.pi * n * duty
    a = np.sin(theta) / (n * np.pi)
    b = (1 - np.cos(theta)) / (n * np.pi)
    amplitude = 2 * np.abs(np.sin(np.pi * n * duty)) / (n * np.pi)
    assert np.allclose(amplitude, np.hypot(a, b))
    assert np.allclose(amplitude[3::4], 0)
    assert np.isclose(amplitude[1], 1 / np.pi)

    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11})
    fig, axes = plt.subplots(2, 1, figsize=(10.4, 7.8), gridspec_kw={'height_ratios': [1, 1.6]})
    fig.set_facecolor('#ffffff')
    color = '#a64b2a'
    t = np.linspace(-0.25, 2.05, 1800)
    signal = ((t % 1) < duty).astype(float)
    axes[0].step(t, signal, where='post', color=color, linewidth=2)
    axes[0].set(xlim=(-0.2, 2), ylim=(-0.12, 1.3), xlabel=r'Normalized time $t/T$', ylabel=r'$v(t)/V$', title='Rectangular pulse illustration · duty cycle D = 1/4')
    axes[0].annotate(r'$t_1/T=1/4$', xy=(0.25, 0.5), xytext=(0.42, 0.85), arrowprops={'arrowstyle': '->', 'color': '#6b6058'})
    markers, stems, baseline = axes[1].stem(n, amplitude, basefmt=' ')
    plt.setp(markers, color=color, markersize=5)
    plt.setp(stems, color=color, linewidth=1.8)
    axes[1].scatter([0], [duty], color='#6b6058', s=34, label='DC level VD / |V| = 0.25')
    smooth = np.linspace(1, 20, 400)
    axes[1].plot(smooth, 2 / (np.pi * smooth), '--', color='#a89b91', label=r'Envelope $2/(n\pi)$')
    axes[1].set(xlim=(-0.6, 20.6), ylim=(-0.02, 0.70), xlabel=r'Harmonic number $n$ · frequency $f_n=n/T$', ylabel=r'Amplitude $A_n/|V|$', title='One-sided real harmonic amplitude spectrum')
    axes[1].set_xticks(np.arange(0, 21, 2))
    axes[1].annotate('Nulls at n = 4, 8, 12, …', xy=(4, 0), xytext=(6, 0.29), arrowprops={'arrowstyle': '->', 'color': '#6b6058'})
    axes[1].legend(frameon=False, fontsize=10, loc='upper right')
    for ax in axes:
        ax.grid(axis='y', alpha=0.18)
        ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout(pad=2.0)
    buffer = BytesIO()
    fig.savefig(buffer, format='png', dpi=155, facecolor='white')
    plt.close(fig)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args()
    image = figure_png()
    packet = {
        'title': f'CE 240 · {ASSIGNMENT}',
        'summary': 'Derive the harmonic amplitude from the Fourier coefficients and inspect a normalized pulse spectrum.',
        'markdown': 'Saved reference for CE 240 Homework 1. Assignment identity comes from Canvas metadata [S1], and the symbolic coefficients come from the local Homework 1 notes [S2].',
        'sampleMarkdown': MARKDOWN,
        'sources': [
            {'id': 'S1', 'title': ASSIGNMENT, 'kind': 'canvas', 'url': '/courses/2/assignments/2',
             'excerpt': 'Canvas assignment metadata identifies Homework 1 - Amplitude Spectrum Derivation and links CE240_Homework_1_Fall_2026.pdf. The linked PDF content was not captured in the local snapshot.'},
            {'id': 'S2', 'title': 'Local Homework 1 amplitude-spectrum derivation', 'url': '',
             'excerpt': 'Transcribed from page 2 of the local ce240/homeworks/hw01.pdf handwritten derivation. ' + COEFFICIENTS + ' The final handwritten expression is V/(n pi) sqrt(2[1-cos(2 n pi t1/T)]) for positive V.'},
            {'id': 'S3', 'title': 'Computed normalized pulse illustration', 'url': '', 'excerpt': PLOT_BASIS},
        ],
        'diagrams': [], 'graphs': [], 'images': [],
        'warnings': ['Plots use an illustrative duty cycle of 1/4. Check the assignment PDF for its values and plotting requirements.'],
        'model': 'Saved demo', 'level': 'all_in', 'autopilot': True,
        'brief': {
            'summary': 'Derive the harmonic amplitude spectrum from the Fourier coefficients recorded in the local Homework 1 notes.',
            'requirements': [{'id': 'amplitude', 'text': 'Derive the amplitude spectrum', 'evidence': 'Homework 1 - Amplitude Spectrum Derivation'}],
            'missingInformation': ['The original linked assignment PDF was not captured in the snapshot.', 'Numerical V, T and t1 values and the required plot range are not supplied in the available notes.'],
        },
        'renderedVisuals': [{'id': 'ce240-hw1-amplitude-spectrum', 'title': 'Pulse waveform and amplitude spectrum',
            'kind': 'function', 'mimeType': 'image/png', 'data': base64.b64encode(image).decode('ascii'),
            'caption': 'Normalized pulse waveform and one-sided amplitude spectrum for D = 1/4. Every fourth harmonic is zero. The gray point shows the separate DC level.',
            'provenance': {'sourceId': 'S3', 'quote': PLOT_BASIS}, 'verification': 'computed'}],
    }
    demo = {'courseCode': COURSE, 'courseCodeAliases': ['CE 240 H001 Linear Sig Anal', 'CE 240', 'CE240'], 'assignmentName': ASSIGNMENT,
        'navigation': [
            {'path': '', 'label': 'Opening {courseCode}', 'reason': 'Opened CE 240 in the local Canvas replica.'},
            {'path': '/assignments', 'label': 'Opening Assignments', 'reason': 'Opened the CE 240 assignment list.'},
            {'path': '/assignments/{assignmentId}', 'label': 'Opening {assignmentName}', 'reason': 'Opened Homework 1 - Amplitude Spectrum Derivation.'},
        ], 'packet': packet}
    OUTPUT.write_text(json.dumps(demo, ensure_ascii=False, indent=2) + '\n')
    if args.preview:
        args.preview.write_bytes(image)
    print(f'Wrote {OUTPUT} ({len(image):,} PNG bytes).')


if __name__ == '__main__':
    main()
