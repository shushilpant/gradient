"""
OffCanvas Stage 8: Course-Grounded Retrieval & Diagram Service

- Ephemeral in-memory index over student course materials & allowlisted open sources (never persisted)
- Citation mapping ("Week X, slide Y" or "Week X, page Y" with Canvas LMS URL)
- Allowlisted open educational resources (MIT OCW, OpenStax, LibreTexts, Wikipedia) with license & attribution
- Mermaid diagram generation with inline vector SVG rendering
- Fallback notice when no course material matches (no hallucinated padding)
"""

import os
import json
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "..", "sandbox", "fixtures", "course_materials.json")

# In-memory ephemeral corpus (RAM only, reset on process restart)
_EPHEMERAL_CORPUS: List[Dict[str, Any]] = []


def load_corpus() -> List[Dict[str, Any]]:
    global _EPHEMERAL_CORPUS
    if not _EPHEMERAL_CORPUS and os.path.exists(FIXTURES_PATH):
        with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
            _EPHEMERAL_CORPUS = json.load(f)
    return _EPHEMERAL_CORPUS


class RetrievalQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    course_id: Optional[str] = None
    assignment_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)
    min_relevance_score: float = Field(default=0.15, ge=0.0, le=1.0)


STOP_WORDS = {
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'what', 'which', 'who', 'how', 'why', 'when', 'where',
    'can', 'could', 'should', 'would', 'do', 'does', 'did', 'this', 'these'
}

CONCEPT_VOCABULARY = {
    'asymptotic notation': ['asymptotic', 'big-o', 'big o', 'upper bound', 'omega', 'theta', 'tight bound'],
    'Master Theorem': ['master theorem', 'divide and conquer recurrence', 'critical exponent'],
    'recurrence relation': ['recurrence', 'recursive call', 'recursion tree', 't(n)'],
    'loop invariants': ['loop invariant', 'induction on loop', 'maintenance condition'],
    'MergeSort': ['mergesort', 'merge sort', 'linear merge', 'inversion count'],
    'dynamic programming': ['dynamic programming', 'dp', 'tabulation', 'memoization', 'overlapping subproblems'],
    'optimal substructure': ['optimal substructure', 'subproblem optimality', 'greedy choice'],
    'knapsack problem': ['knapsack', '0/1 knapsack', 'pseudo-polynomial'],
    'graph traversals': ['bfs', 'dfs', 'breadth-first', 'depth-first', 'traversal'],
    'Dijkstra algorithm': ['dijkstra', 'shortest path', 'min-heap priority'],
    'greedy algorithms': ['greedy', 'exchange argument', 'interval scheduling'],
    'empirical benchmarking': ['empirical', 'benchmark', 'wall-clock', 'perf_counter', 'timing trial', 'variance'],
    'software engineering': ['edge case', 'unit test', 'modularity', 'pure function'],
    'mathematical induction': ['induction', 'inductive step', 'base case', 'strong induction'],
    'characteristic equation': ['characteristic equation', 'linear recurrence', 'roots'],
    'microscopy': ['microscope', 'microscopy', 'numerical aperture', 'magnification'],
    'enzyme kinetics': ['enzyme', 'michaelis-menten', 'km', 'vmax', 'competitive inhibition', 'lineweaver-burk'],
    'sorting lower bound': ['comparison sort', 'decision tree', 'stirling approximation', 'omega(n log n)'],
}


def tokenize(text: str) -> List[str]:
    cleaned = re.sub(r'[^a-zA-Z0-9_\-\s]', ' ', text.lower())
    return [t for t in cleaned.split() if len(t) > 1 and t not in STOP_WORDS]


def extract_concepts(query: str) -> List[str]:
    lowered = query.lower()
    concepts = []
    for canonical, variants in CONCEPT_VOCABULARY.items():
        for v in variants:
            if v in lowered:
                if canonical not in concepts:
                    concepts.append(canonical)
                break
    if not concepts:
        tokens = tokenize(query)
        concepts = list(dict.fromkeys(tokens))[:4]
    return concepts


def score_chunk(query_tokens: List[str], extracted_concepts: List[str], chunk: Dict[str, Any], target_course_id: Optional[str]) -> Dict[str, Any]:
    chunk_tokens = set(tokenize(chunk.get("content", "") + " " + chunk.get("title", "")))
    term_matches = sum(1.0 if qt in chunk_tokens else (0.5 if any(ct.startswith(qt) or qt.startswith(ct) for ct in chunk_tokens) else 0.0) for qt in query_tokens)
    tf_score = (term_matches / len(query_tokens)) if query_tokens else 0.0

    chunk_concepts = [c.lower() for c in chunk.get("keyConcepts", [])]
    matched = []
    for ec in extracted_concepts:
        ec_low = ec.lower()
        if any(cc in ec_low or ec_low in cc for cc in chunk_concepts):
            matched.append(ec)

    concept_score = (len(matched) / len(extracted_concepts)) if extracted_concepts else 0.0

    course_boost = 1.25 if (target_course_id and chunk.get("courseId") == target_course_id) else 1.0
    origin_boost = 1.2 if chunk.get("sourceOrigin") == "course_material" else 0.85

    score = (tf_score * 0.45 + concept_score * 0.55) * course_boost * origin_boost
    return {
        "score": round(min(score, 1.0), 2),
        "matchedConcepts": matched,
    }


def render_svg_diagram(title: str, mermaid_code: str) -> str:
    """Generates pure inline vector SVG from Mermaid code. No external web requests or remote images."""
    lines = [l.strip() for l in mermaid_code.split("\n") if l.strip() and not l.strip().startswith(("flowchart", "graph", "subgraph", "end"))]
    nodes = []
    node_set = set()
    for l in lines:
        match = re.findall(r'([A-Za-z0-9_]+)(?:\["([^"]+)"\]|\[([^\]]+)\])', l)
        for nid, l1, l2 in match:
            lbl = l1 or l2 or nid
            if nid not in node_set:
                node_set.add(nid)
                nodes.append((nid, lbl))

    cols = min(max(len(nodes), 2), 3)
    rows = max(1, (len(nodes) + cols - 1) // cols)
    w = cols * 140 + (cols + 1) * 30
    h = rows * 60 + 50

    svg_nodes = []
    for idx, (nid, lbl) in enumerate(nodes):
        r = idx // cols
        c = idx % cols
        x = 30 + c * 170
        y = 35 + r * 60
        highlight = (idx == 0 or idx == len(nodes) - 1)
        bg = "#eff6ff" if highlight else "#f8fafc"
        stroke = "#2563eb" if highlight else "#cbd5e1"
        color = "#1e3a8a" if highlight else "#1e293b"
        safe_lbl = lbl[:24].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        svg_nodes.append(
            f'<g transform="translate({x},{y})">'
            f'<rect width="140" height="36" rx="5" fill="{bg}" stroke="{stroke}" stroke-width="1.5"/>'
            f'<text x="70" y="22" font-size="10" font-weight="600" fill="{color}" text-anchor="middle">{safe_lbl}</text>'
            f'</g>'
        )

    safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="100%" height="auto" style="max-height:260px;">'
        f'<rect width="100%" height="100%" fill="#ffffff" rx="6"/>'
        f'<text x="14" y="20" font-size="11" font-weight="700" fill="#0f172a">{safe_title}</text>'
        f'{"".join(svg_nodes)}'
        f'</svg>'
    )


def query_course_materials(req: RetrievalQueryRequest) -> Dict[str, Any]:
    corpus = load_corpus()
    query_tokens = tokenize(req.query)
    concepts = extract_concepts(req.query)

    if not query_tokens and not concepts:
        return {
            "query": req.query,
            "hasRelevantContent": False,
            "extractedConcepts": [],
            "courseMaterialChunks": [],
            "supplementaryChunks": [],
            "allRankedChunks": [],
            "drawnFrom": {"courseMaterials": [], "openSources": []},
            "fallbackMessage": "No search terms provided.",
        }

    scored = []
    for c in corpus:
        if req.course_id and c.get("courseId") not in ("open", req.course_id):
            continue
        res = score_chunk(query_tokens, concepts, c, req.course_id)
        if res["score"] >= req.min_relevance_score:
            scored.append({
                "chunk": c,
                "score": res["score"],
                "matchedConcepts": res["matchedConcepts"],
            })

    # Sort: course material first (by score), then open source (by score)
    scored.sort(key=lambda x: (1 if x["chunk"].get("sourceOrigin") == "course_material" else 0, x["score"]), reverse=True)

    ranked = []
    for idx, item in enumerate(scored[:req.top_k]):
        ranked.append({
            "chunk": item["chunk"],
            "score": item["score"],
            "matchedConcepts": item["matchedConcepts"],
            "rank": idx + 1,
        })

    course_chunks = [c for c in ranked if c["chunk"].get("sourceOrigin") == "course_material"]
    open_chunks = [c for c in ranked if c["chunk"].get("sourceOrigin") == "open_source"]

    has_content = len(ranked) > 0

    drawn_course = list(dict.fromkeys(
        f"{c['chunk']['courseName']}: {c['chunk']['citation']} ({c['chunk']['title']})"
        for c in course_chunks
    ))

    drawn_open = list(dict.fromkeys(
        f"{c['chunk']['courseName']} [{c['chunk'].get('license', 'Open Source')}]"
        for c in open_chunks
    ))

    diagram = None
    if has_content and any(kw in req.query.lower() for kw in ['asymptotic', 'master theorem', 'dynamic programming', 'induction', 'kinetics', 'benchmark']):
        m_code = "flowchart LR\n  A[Subproblem] --> B[Optimal Solution]"
        d_title = "Conceptual Model"
        if 'master theorem' in req.query.lower():
            m_code = "flowchart TD\n  Start[Compare f(n) to n^c] --> Case1[Leaves Dominate] --> Sol1[T(n) = Theta(n^c)]"
            d_title = "Master Theorem Recurrence Tree"
        elif 'dynamic programming' in req.query.lower() or 'tabulation' in req.query.lower():
            m_code = "flowchart TD\n  Base[Base Cases] --> Trans[State Transition] --> Tab[Tabulation Table] --> Opt[Optimal]"
            d_title = "Dynamic Programming Tabulation DAG"
        elif 'induction' in req.query.lower():
            m_code = "flowchart TD\n  Base[Base Case P(n0)] --> Hyp[Hypothesis P(k)] --> Step[Inductive Step P(k+1)]"
            d_title = "Mathematical Induction Proof Chain"
        else:
            m_code = "flowchart LR\n  O1[O(1)] --> ON[O(N)] --> ONlogN[O(N log N)] --> ON2[O(N²)]"
            d_title = "Asymptotic Complexity Hierarchy"

        diagram = {
            "type": "mermaid",
            "title": d_title,
            "description": "Visual diagram of key concept relationships",
            "code": m_code,
            "svg": render_svg_diagram(d_title, m_code),
            "isValid": True,
        }

    return {
        "query": req.query,
        "hasRelevantContent": has_content,
        "extractedConcepts": concepts,
        "courseMaterialChunks": course_chunks,
        "supplementaryChunks": open_chunks,
        "allRankedChunks": ranked,
        "drawnFrom": {
            "courseMaterials": drawn_course,
            "openSources": drawn_open,
        },
        "diagram": diagram,
        "fallbackMessage": None if has_content else f"No relevant course materials found for '{req.query}'.",
    }

