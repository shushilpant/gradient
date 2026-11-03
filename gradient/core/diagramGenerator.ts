import { type ConceptRelationshipDiagram } from './retrievalSchema.js';

interface DiagramTemplate {
  keywords: string[];
  title: string;
  description: string;
  mermaidCode: string;
}

const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    keywords: ['asymptotic', 'big-o', 'theta', 'omega', 'complexity', 'limit'],
    title: 'Asymptotic Complexity Hierarchy & Tight Bounds',
    description: 'Structural ordering of computational complexity classes and sandwiching bounds',
    mermaidCode: `flowchart LR
    O1["O(1) Constant"] --> OlogN["O(log N) Logarithmic"]
    OlogN --> ON["O(N) Linear"]
    ON --> ONlogN["O(N log N) Linearithmic"]
    ONlogN --> ON2["O(N²) Quadratic"]
    ON2 --> O2N["O(2ᴺ) Exponential"]
    
    subgraph Bounds ["Formal Bounds"]
      Omega["Ω(g(n)) Lower Bound"] --> Theta["Θ(g(n)) Tight Bound"]
      Theta --> BigO["O(g(n)) Upper Bound"]
    end`,
  },
  {
    keywords: ['master theorem', 'recurrence', 'recursion tree', 'divide and conquer'],
    title: 'Master Theorem Decision Tree: T(n) = aT(n/b) + f(n)',
    description: 'Branching decisions based on critical exponent c_crit = log_b(a)',
    mermaidCode: `flowchart TD
    Start["Compare f(n) to n^(log_b a)"] --> Case1{"f(n) = O(n^(c_crit - ε))"}
    Start --> Case2{"f(n) = Θ(n^(c_crit) · logᵏ n)"}
    Start --> Case3{"f(n) = Ω(n^(c_crit + ε))"}

    Case1 -->|"Leaves Dominate"| Sol1["T(n) = Θ(n^(log_b a))"]
    Case2 -->|"All Levels Equal"| Sol2["T(n) = Θ(n^(log_b a) · logᵏ⁺¹ n)"]
    Case3 -->|"Check Regularity"| Reg{"a·f(n/b) ≤ c·f(n)"}
    Reg -->|"Root Dominates"| Sol3["T(n) = Θ(f(n))"]`,
  },
  {
    keywords: ['dynamic programming', 'memoization', 'tabulation', 'subproblem', 'knapsack', 'lcs'],
    title: 'Dynamic Programming: Optimal Substructure & Tabulation DAG',
    description: 'Evaluation flow from base cases through topological state space to optimal answer',
    mermaidCode: `flowchart TD
    Base["1. Explicit Base Cases: DP[0] = 0"] --> Trans["2. State Transition Function"]
    Trans --> Recur["Overlapping Subproblems Identified"]
    Recur --> Choice{"Optimization Strategy"}
    Choice -->|"Top-Down"| Memo["Memoization Cache (Hash / Array)"]
    Choice -->|"Bottom-Up"| Tab["Iterative Tabulation Table"]
    Memo --> Recon["3. Solution Reconstruction via Parent Pointers"]
    Tab --> Recon
    Recon --> OptVal["Global Optimal Solution Achieved"]`,
  },
  {
    keywords: ['greedy', 'exchange argument', 'interval scheduling', 'greedy choice'],
    title: 'Greedy Algorithm Validation Framework',
    description: 'Proving global optimality via greedy-choice property and exchange arguments',
    mermaidCode: `flowchart LR
    Prob["Optimization Problem"] --> GChoice["1. Greedy Choice Property"]
    Prob --> OptSub["2. Optimal Substructure"]
    GChoice --> Local["Make Locally Optimal Move"]
    Local --> Subprob["Reduce to Remaining Subproblem"]
    Subprob --> OptSub
    OptSub --> ExArg["Exchange Argument Proof: Transform Any Opt to Greedy"]
    ExArg --> GlobalOpt["Verified Globally Optimal"]`,
  },
  {
    keywords: ['empirical', 'benchmark', 'wall-clock', 'profiling', 'scaling', 'project', 'system', 'implementation'],
    title: 'Empirical Scaling & Variance Control Pipeline',
    description: 'Protocol for reproducible wall-clock performance measurements',
    mermaidCode: `flowchart TD
    Warmup["1. Warm Up CPU & JIT Caches"] --> Trials["2. Execute ≥ 10 Independent Trials per Input N"]
    Trials --> Monotonic["3. Monotonic High-Res Timers (perf_counter)"]
    Monotonic --> Filter["4. Compute Median & IQR / Error Bars"]
    Filter --> LogLog["5. Plot Scaling on Log-Log Coordinates"]
    LogLog --> Validate["6. Slope k Matches Theoretical Asymptote O(Nᵏ)"]`,
  },
  {
    keywords: ['induction', 'base case', 'inductive hypothesis', 'strong induction', 'well-ordering'],
    title: 'Principle of Mathematical Induction Architecture',
    description: 'Deductive chain establishing universal propositions over discrete integers',
    mermaidCode: `flowchart TD
    P["Proposition P(n) for all n ≥ n₀"] --> Base["Step 1: Base Case — Prove P(n₀) Directly"]
    Base --> Hyp["Step 2: Inductive Hypothesis — Assume P(k) Holds for k ≥ n₀"]
    Hyp --> Step["Step 3: Inductive Step — Deduce P(k+1) from P(k)"]
    Step --> Concl["Step 4: Conclude P(n) Holds ∀ n ≥ n₀ by PMI"]`,
  },
  {
    keywords: ['enzyme', 'kinetics', 'michaelis-menten', 'km', 'vmax', 'inhibition'],
    title: 'Enzyme Kinetics & Catalytic Pathway',
    description: 'Michaelis-Menten catalytic mechanism and inhibitor kinetics',
    mermaidCode: `flowchart LR
    E["Enzyme (E)"] + S["Substrate (S)"] -->|"k₁"| ES["Enzyme-Substrate Complex (ES)"]
    ES -->|"k₋₁"| E
    ES -->|"k_cat"| E2["Enzyme (E)"] + P["Product (P)"]
    
    subgraph Modulation ["Kinetic Modifiers"]
      Comp["Competitive: Increases Km (Same Vmax)"]
      NonComp["Non-Competitive: Decreases Vmax (Same Km)"]
    end`,
  },
];

/**
 * Validates Mermaid flowchart code syntax.
 */
export function validateMermaidCode(code: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = code.trim();

  if (!trimmed.startsWith('flowchart') && !trimmed.startsWith('graph')) {
    errors.push('Diagram must start with a valid Mermaid flowchart or graph declaration.');
  }

  // Check balanced brackets
  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`Mismatched square brackets: ${openBrackets} open vs ${closeBrackets} close.`);
  }

  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`Mismatched parentheses: ${openParens} open vs ${closeParens} close.`);
  }

  // Prohibit raw HTML script injection
  if (/<script|javascript:|onload=/i.test(trimmed)) {
    errors.push('Illegal script injection detected in diagram syntax.');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Converts a Mermaid flowchart definition into clean, standalone inline SVG.
 * Guaranteed zero external network dependencies, web fonts, or remote images.
 */
export function renderMermaidToSvg(code: string, title: string): string {
  // Parse lines to construct clean vector nodes & connectors
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('flowchart') && !l.startsWith('graph') && !l.startsWith('subgraph') && l !== 'end');

  interface NodeItem {
    id: string;
    label: string;
  }

  interface EdgeItem {
    from: string;
    to: string;
    label?: string;
  }

  const nodeMap = new Map<string, NodeItem>();
  const edges: EdgeItem[] = [];

  for (const line of lines) {
    // Match edge: Node1["Label1"] -->|"EdgeLabel"| Node2["Label2"] or Node1 --> Node2
    const edgeParts = line.split(/-->|---|==>/);
    if (edgeParts.length >= 2) {
      for (let i = 0; i < edgeParts.length - 1; i++) {
        const leftPart = edgeParts[i]!.trim();
        const rightPart = edgeParts[i + 1]!.trim();

        const parseNode = (s: string): { id: string; label: string } => {
          const match = s.match(/^([A-Za-z0-9_]+)(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\)|\{"([^"]+)"\}|\{([^}]+)\})?/);
          if (match) {
            const id = match[1]!;
            const label = match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || id;
            return { id, label };
          }
          return { id: s, label: s };
        };

        const fromNode = parseNode(leftPart);
        // Extract optional edge label |"..."|
        let edgeLabel: string | undefined = undefined;
        let cleanRight = rightPart;
        const edgeLabelMatch = rightPart.match(/^\|"([^"]+)"\|\s*(.*)$|^\|([^|]+)\|\s*(.*)$/);
        if (edgeLabelMatch) {
          edgeLabel = edgeLabelMatch[1] || edgeLabelMatch[3];
          cleanRight = (edgeLabelMatch[2] || edgeLabelMatch[4] || '').trim();
        }

        const toNode = parseNode(cleanRight);

        if (!nodeMap.has(fromNode.id)) nodeMap.set(fromNode.id, fromNode);
        if (!nodeMap.has(toNode.id)) nodeMap.set(toNode.id, toNode);

        edges.push({ from: fromNode.id, to: toNode.id, label: edgeLabel });
      }
    } else {
      // Standalone node
      const match = line.match(/^([A-Za-z0-9_]+)(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\)|\{"([^"]+)"\}|\{([^}]+)\})/);
      if (match) {
        const id = match[1]!;
        const label = match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || id;
        if (!nodeMap.has(id)) nodeMap.set(id, { id, label });
      }
    }
  }

  const nodes = Array.from(nodeMap.values());
  const nodeCount = Math.max(nodes.length, 1);

  // Layout parameters for responsive vector visualization
  const nodeWidth = 140;
  const nodeHeight = 36;
  const colGap = 30;
  const rowGap = 24;

  const cols = Math.min(Math.max(nodeCount, 2), 3);
  const rows = Math.ceil(nodeCount / cols);

  const svgWidth = cols * nodeWidth + (cols + 1) * colGap;
  const svgHeight = rows * (nodeHeight + rowGap) + 40;

  const nodePositions = new Map<string, { x: number; y: number }>();

  nodes.forEach((node, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = colGap + c * (nodeWidth + colGap);
    const y = 30 + r * (nodeHeight + rowGap);
    nodePositions.set(node.id, { x, y });
  });

  // Render SVG paths for edges
  const edgeSvgElements: string[] = [];
  for (const edge of edges) {
    const fromPos = nodePositions.get(edge.from);
    const toPos = nodePositions.get(edge.to);
    if (!fromPos || !toPos) continue;

    const startX = fromPos.x + nodeWidth / 2;
    const startY = fromPos.y + nodeHeight;
    const endX = toPos.x + nodeWidth / 2;
    const endY = toPos.y;

    if (fromPos.y === toPos.y) {
      // Horizontal connector
      const hStartX = fromPos.x + nodeWidth;
      const hStartY = fromPos.y + nodeHeight / 2;
      const hEndX = toPos.x;
      const hEndY = toPos.y + nodeHeight / 2;
      edgeSvgElements.push(
        `<line x1="${hStartX}" y1="${hStartY}" x2="${hEndX}" y2="${hEndY}" stroke="#64748b" stroke-width="1.5" marker-end="url(#arrow)" />`
      );
      if (edge.label) {
        const midX = (hStartX + hEndX) / 2;
        const midY = (hStartY + hEndY) / 2 - 4;
        edgeSvgElements.push(
          `<text x="${midX}" y="${midY}" font-size="9" fill="#0f172a" font-weight="600" text-anchor="middle" background="#ffffff">${escapeXml(edge.label)}</text>`
        );
      }
    } else {
      // Vertical / diagonal connector
      edgeSvgElements.push(
        `<path d="M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}" stroke="#64748b" stroke-width="1.5" fill="none" marker-end="url(#arrow)" />`
      );
      if (edge.label) {
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - 2;
        edgeSvgElements.push(
          `<text x="${midX}" y="${midY}" font-size="9" fill="#0f172a" font-weight="600" text-anchor="middle">${escapeXml(edge.label)}</text>`
        );
      }
    }
  }

  // Render SVG node rectangles and labels
  const nodeSvgElements: string[] = [];
  nodes.forEach((node, idx) => {
    const pos = nodePositions.get(node.id);
    if (!pos) return;

    const isHighlight = idx === 0 || idx === nodes.length - 1;
    const rectFill = isHighlight ? '#eff6ff' : '#f8fafc';
    const rectStroke = isHighlight ? '#2563eb' : '#cbd5e1';
    const textColor = isHighlight ? '#1e3a8a' : '#1e293b';

    nodeSvgElements.push(`
      <g class="diagram-node" transform="translate(${pos.x}, ${pos.y})">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="5" fill="${rectFill}" stroke="${rectStroke}" stroke-width="${isHighlight ? '2' : '1.5'}" />
        <text x="${nodeWidth / 2}" y="${nodeHeight / 2 + 4}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" fill="${textColor}" text-anchor="middle">
          ${escapeXml(truncateText(node.label, 22))}
        </text>
      </g>
    `);
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="auto" style="max-height: 260px; font-family: system-ui, -apple-system, sans-serif;">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748b" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="#ffffff" rx="6" />
      <text x="14" y="18" font-size="11" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
      <g class="diagram-edges">${edgeSvgElements.join('\n')}</g>
      <g class="diagram-nodes">${nodeSvgElements.join('\n')}</g>
    </svg>
  `.trim();
}

/**
 * Generates a concept relationship diagram for a query or concept set.
 */
export function generateConceptDiagram(
  queryOrConcepts: string | string[]
): ConceptRelationshipDiagram | null {
  const queryStr = Array.isArray(queryOrConcepts)
    ? queryOrConcepts.join(' ').toLowerCase()
    : queryOrConcepts.toLowerCase();

  // Find best matching template
  let bestTemplate: DiagramTemplate | null = null;
  let maxMatches = 0;

  for (const template of DIAGRAM_TEMPLATES) {
    let matches = 0;
    for (const kw of template.keywords) {
      if (queryStr.includes(kw.toLowerCase())) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestTemplate = template;
    }
  }

  // Fallback to Asymptotic Hierarchy if related to algorithms or coursework
  if (!bestTemplate || maxMatches === 0) {
    if (
      queryStr.includes('algorithm') ||
      queryStr.includes('sort') ||
      queryStr.includes('code') ||
      queryStr.includes('runtime') ||
      queryStr.includes('project') ||
      queryStr.includes('system') ||
      queryStr.includes('report')
    ) {
      bestTemplate = DIAGRAM_TEMPLATES[0]!;
    } else {
      return null;
    }
  }

  const validation = validateMermaidCode(bestTemplate.mermaidCode);
  if (!validation.isValid) {
    return null;
  }

  const svg = renderMermaidToSvg(bestTemplate.mermaidCode, bestTemplate.title);

  return {
    type: 'mermaid',
    title: bestTemplate.title,
    description: bestTemplate.description,
    code: bestTemplate.mermaidCode,
    svg,
    isValid: true,
  };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}
