import { describe, it, expect } from 'vitest';
import {
  generateConceptDiagram,
  validateMermaidCode,
} from '../core/diagramGenerator.js';

describe('Stage 8: Diagram Generator & SVG Renderer', () => {
  it('validates correct Mermaid syntax and catches malformed bracket structures', () => {
    const validCode = 'flowchart TD\n  A["Start"] --> B["End"]';
    const val1 = validateMermaidCode(validCode);
    expect(val1.isValid).toBe(true);
    expect(val1.errors.length).toBe(0);

    const brokenCode = 'flowchart TD\n  A["Start" --> B["End"]';
    const val2 = validateMermaidCode(brokenCode);
    expect(val2.isValid).toBe(false);
    expect(val2.errors.some((e) => e.includes('Mismatched square brackets'))).toBe(true);

    const scriptInjection = 'flowchart TD\n  A["<script>alert(1)</script>"]';
    const val3 = validateMermaidCode(scriptInjection);
    expect(val3.isValid).toBe(false);
    expect(val3.errors.some((e) => e.includes('Illegal script injection'))).toBe(true);
  });

  it('renders clean inline SVG with zero external web images or network dependencies', () => {
    const diagram = generateConceptDiagram('Master Theorem recurrence tree');
    expect(diagram).not.toBeNull();
    expect(diagram!.isValid).toBe(true);
    expect(diagram!.type).toBe('mermaid');

    const svg = diagram!.svg;
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');

    // HARD RULE: No external images from the web
    expect(svg).not.toContain('<img');
    expect(svg).not.toMatch(/src=["']https?:/i);
    expect(svg).not.toMatch(/<image[^>]*href=["']https?:/i);
  });

  it('provides exact raw Mermaid source code for user inspection', () => {
    const diagram = generateConceptDiagram('dynamic programming tabulation state space');
    expect(diagram).not.toBeNull();
    expect(diagram!.code).toContain('flowchart');
    expect(diagram!.code).toContain('State Transition');
  });
});
