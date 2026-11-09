"""Grounded, declarative homework figures. Never executes generated Python code.

The model may select a figure and cite evidence. Python validates that evidence,
evaluates a small arithmetic AST, and draws the figure with Matplotlib. A visual
is omitted if its numbers/formula cannot be found in the supplied reference text.
"""
from __future__ import annotations

import ast
import base64
import io
import json
import math
import os
import re
import tempfile
import threading
from typing import Annotated, Literal, Union

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=180)
    sourceId: str = Field(min_length=1, max_length=80)
    quote: str = Field(min_length=3, max_length=4000)


class FunctionSpec(Evidence):
    kind: Literal["function"]
    expression: str = Field(min_length=1, max_length=300)
    variable: Literal["x", "t", "s"] = "x"
    operation: Literal["identity", "derivative", "inverse_laplace"] = "identity"
    xMin: float = Field(default=-5, ge=-10000, le=10000, allow_inf_nan=False)
    xMax: float = Field(default=5, ge=-10000, le=10000, allow_inf_nan=False)
    xLabel: str = Field(default="", max_length=80)
    yLabel: str = Field(default="", max_length=80)


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=-1e12, le=1e12, allow_inf_nan=False)
    y: float = Field(ge=-1e12, le=1e12, allow_inf_nan=False)


class DataSpec(Evidence):
    kind: Literal["data"]
    points: list[Point] = Field(min_length=2, max_length=100)
    xLabel: str = Field(default="x", max_length=80)
    yLabel: str = Field(default="y", max_length=80)


class DiagramNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=100)


class DiagramEdge(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    from_: str = Field(alias="from", max_length=40)
    to: str = Field(max_length=40)
    label: str = Field(default="", max_length=100)


class DiagramSpec(Evidence):
    kind: Literal["diagram"]
    nodes: list[DiagramNode] = Field(min_length=2, max_length=8)
    edges: list[DiagramEdge] = Field(min_length=1, max_length=12)


VisualSpec = Annotated[Union[FunctionSpec, DataSpec, DiagramSpec], Field(discriminator="kind")]
_SPEC = TypeAdapter(VisualSpec)


class Provenance(BaseModel):
    sourceId: str
    quote: str


class RenderedVisual(BaseModel):
    id: str
    title: str
    kind: Literal["function", "data", "diagram"]
    mimeType: Literal["image/png"] = "image/png"
    data: str
    caption: str
    provenance: Provenance
    verification: Literal["computed", "source-data", "conceptual"]


_LOCK = threading.Lock()
_FUNCTIONS = {"sin": np.sin, "cos": np.cos, "tan": np.tan, "exp": np.exp,
              "log": np.log, "ln": np.log, "sqrt": np.sqrt, "abs": np.abs,
              "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
              "step": lambda value: np.heaviside(value, 1),
              "u": lambda value: np.heaviside(value, 1)}


def _normal_expression(value: str) -> str:
    value = value.replace("−", "-").replace("×", "*").replace("·", "*")
    value = value.replace("\\cdot", "*").replace("\\times", "*")
    value = value.replace("\\left", "").replace("\\right", "")
    value = re.sub(r"\\(?:sin|cos|tan|exp|log|ln|sqrt|sinh|cosh|tanh)\b", lambda m: m[0][1:], value)
    return value.replace("^", "**").replace("{", "(").replace("}", ")")


def _compact(value: str) -> str:
    return re.sub(r"\s+", "", _normal_expression(value)).strip(".$")


def _equation_rhs(value: str) -> str:
    """Separate a formula from trailing instructions, without rewriting the math."""
    depth = 0
    for index, char in enumerate(value):
        if char in "({[":
            depth += 1
        elif char in ")}]":
            depth = max(0, depth - 1)
        if depth:
            continue
        if char == "." and (index + 1 == len(value) or value[index + 1].isspace()):
            return value[:index].strip()
        if char == ",":
            return value[:index].strip()
        if char.isspace() and re.match(r"\s+(?:for|where|on|with|and|then|explain|identify|from)\b", value[index:], re.I):
            return value[:index].strip()
    return value.strip().rstrip(".")


def _source_domain(text: str, variable: str) -> tuple[float, float] | None:
    numeric = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
    match = re.search(r"(" + numeric + r")\s*(?:<=|≤|<)\s*" + variable + r"\s*(?:<=|≤|<)\s*(" + numeric + r")", text)
    if not match:
        match = re.search(r"(?:\b" + variable + r"\s+(?:ranges?\s+)?from|\b(?:plot|graph|sketch)\b[^\n]{0,300}?\bfrom)\s*(" + numeric + r")\s+(?:to|through)\s+(" + numeric + r")", text, re.I)
        if not match:
            return None
    lower, upper = float(match[1]), float(match[2])
    return (lower, upper) if math.isfinite(lower) and math.isfinite(upper) and -10000 <= lower < upper <= 10000 and upper - lower <= 10000 else None


def evaluate_expression(expression: str, variable: str, values: np.ndarray) -> np.ndarray:
    """Interpret arithmetic only; no eval, sympify, attributes, imports or indexing."""
    expression = _normal_expression(expression)
    tree = ast.parse(expression, mode="eval")
    if len(list(ast.walk(tree))) > 100:
        raise ValueError("Expression is too complex for a bounded plot.")

    def visit(node):
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if not math.isfinite(node.value) or abs(node.value) > 1e9:
                raise ValueError("Expression constant is outside the supported range.")
            return node.value
        if isinstance(node, ast.Name):
            if node.id == variable:
                return values
            if node.id in ("pi", "e"):
                return math.pi if node.id == "pi" else math.e
            raise ValueError("Expression contains an unsupported variable.")
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = visit(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add): return left + right
            if isinstance(node.op, ast.Sub): return left - right
            if isinstance(node.op, ast.Mult): return left * right
            if isinstance(node.op, ast.Div): return left / right
            if isinstance(node.op, ast.Pow):
                if not np.isscalar(right) or not math.isfinite(float(right)) or abs(right) > 12:
                    raise ValueError("Powers must use a constant exponent between -12 and 12.")
                return np.power(left, right)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCTIONS and len(node.args) == 1 and not node.keywords:
            return _FUNCTIONS[node.func.id](visit(node.args[0]))
        raise ValueError("Only arithmetic and approved mathematical functions may be plotted.")

    with np.errstate(all="ignore"):
        result = np.asarray(visit(tree), dtype=float)
    if result.ndim == 0:
        result = np.full_like(values, result.item(), dtype=float)
    if result.shape != values.shape:
        raise ValueError("Expression returned an unsupported shape.")
    return result


def _symbolic_expression(expression: str, variable: str):
    """Build a SymPy expression from the same small AST, never parse Python text."""
    import sympy as sp
    symbol = sp.Symbol(variable, real=True)
    tree = ast.parse(_normal_expression(expression), mode="eval")
    if len(list(ast.walk(tree))) > 80:
        raise ValueError("Transform input is too complex.")

    def visit(node):
        if isinstance(node, ast.Expression): return visit(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if not math.isfinite(node.value) or abs(node.value) > 10000:
                raise ValueError("Transform constants must be finite and bounded.")
            return sp.Rational(str(node.value))
        if isinstance(node, ast.Name):
            if node.id == variable: return symbol
            if node.id == "pi": return sp.pi
            if node.id == "e": return sp.E
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            operand = visit(node.operand)
            return operand if isinstance(node.op, ast.UAdd) else -operand
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add): return left + right
            if isinstance(node.op, ast.Sub): return left - right
            if isinstance(node.op, ast.Mult): return left * right
            if isinstance(node.op, ast.Div): return left / right
            if isinstance(node.op, ast.Pow) and right.is_number and abs(float(right)) <= 6:
                return left ** right
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and len(node.args) == 1 and not node.keywords:
            functions = {"exp": sp.exp, "sin": sp.sin, "cos": sp.cos, "sqrt": sp.sqrt,
                         "log": sp.log, "ln": sp.log, "sinh": sp.sinh, "cosh": sp.cosh}
            if node.func.id in functions:
                return functions[node.func.id](visit(node.args[0]))
        raise ValueError("The symbolic operation contains unsupported syntax.")
    return visit(tree), symbol


def _evaluate_symbolic(expression, variable, values):
    """Evaluate only known symbolic math nodes; lambdify/code generation is unused."""
    import sympy as sp
    def visit(node):
        if node == variable: return values
        if node.is_number: return float(node)
        if node.func == sp.Add:
            return sum(visit(arg) for arg in node.args)
        if node.func == sp.Mul:
            result = 1
            for arg in node.args: result = result * visit(arg)
            return result
        if node.func == sp.Pow:
            exponent = visit(node.args[1])
            if not np.isscalar(exponent) or abs(exponent) > 12:
                raise ValueError("The computed expression contains an unsupported power.")
            return np.power(visit(node.args[0]), exponent)
        functions = {sp.exp: np.exp, sp.sin: np.sin, sp.cos: np.cos, sp.sinh: np.sinh, sp.cosh: np.cosh, sp.log: np.log, sp.Heaviside: lambda value: np.heaviside(value, 1)}
        if node.func in functions:
            return functions[node.func](visit(node.args[0]))
        raise ValueError("The computed transform is not a supported ordinary real function.")
    with np.errstate(all="ignore"):
        result = np.asarray(visit(expression), dtype=float)
    return np.full_like(values, result.item()) if result.ndim == 0 else result


def computed_function(spec: FunctionSpec, values: np.ndarray) -> tuple[np.ndarray, str, str]:
    if spec.operation == "identity":
        return evaluate_expression(spec.expression, spec.variable, values), spec.expression, spec.variable
    import sympy as sp
    expression, symbol = _symbolic_expression(spec.expression, spec.variable)
    if spec.operation == "derivative":
        computed = sp.diff(expression, symbol)
        return _evaluate_symbolic(computed, symbol, values), str(computed), spec.variable
    if spec.variable != "s":
        raise ValueError("An inverse Laplace transform requires source variable s.")
    # Limit computation to rational transforms of degree <=4 and at most one
    # explicit nonnegative time delay. Complex/unbounded symbolic tasks are skipped.
    exponentials = list(expression.atoms(sp.exp))
    if len(exponentials) > 1:
        raise ValueError("Only a single time-shift factor is supported.")
    for factor in exponentials:
        exponent = factor.args[0]
        if not exponent.is_polynomial(symbol) or sp.degree(exponent, symbol) != 1:
            raise ValueError("Time-shift factors must have the form exp(-a*s).")
        delay = -exponent.coeff(symbol)
        if not delay.is_number or not 0 <= float(delay) <= 100 or exponent.subs(symbol, 0) != 0:
            raise ValueError("Time shifts must use a nonnegative bounded delay.")
    rational = expression.xreplace({factor: sp.Integer(1) for factor in exponentials})
    if not rational.is_rational_function(symbol):
        raise ValueError("Only bounded rational inverse Laplace transforms are supported.")
    numerator, denominator = sp.fraction(sp.cancel(rational))
    if max(sp.degree(numerator, symbol), sp.degree(denominator, symbol)) > 4 or sp.degree(numerator, symbol) >= sp.degree(denominator, symbol):
        raise ValueError("Inverse Laplace plots require a proper rational transform of degree at most four.")
    time = sp.Symbol("t", real=True)
    computed = sp.inverse_laplace_transform(expression, symbol, time)
    return _evaluate_symbolic(computed, time, values), str(computed), "t"


def _check_evidence(spec: VisualSpec, documents: dict[str, str]) -> None:
    source = documents.get(spec.sourceId, "")
    if spec.quote not in source:
        raise ValueError("The cited quote does not occur in the source material.")
    if isinstance(spec, FunctionSpec):
        equations = re.findall(r"(?:[fF]\s*\(\s*" + spec.variable + r"\s*\)|y)\s*=\s*([^\n;]+)", spec.quote)
        if not any(_compact(spec.expression) == _compact(_equation_rhs(equation)) for equation in equations):
            raise ValueError("The plotted expression is not present in the cited quote.")
        output_variable = "t" if spec.operation == "inverse_laplace" else spec.variable
        # Explicit assignment bounds take precedence over a model's display range.
        # Prefer the exact formula quote, then its original source instructions.
        domain = _source_domain(spec.quote, output_variable) or _source_domain(source, output_variable)
        if domain:
            spec.xMin, spec.xMax = domain
        if not spec.xMin < spec.xMax or spec.xMax - spec.xMin > 10000:
            raise ValueError("The plotting range must be increasing and no wider than 10000.")
        if spec.operation == "inverse_laplace" and not re.search(r"inverse\s+Laplace|invert\s+(?:the\s+)?Laplace|Laplace\s+inverse", source, re.I):
            raise ValueError("The source instructions do not request an inverse Laplace transform.")
        if spec.operation == "derivative" and not re.search(r"derivative|differentiat", source, re.I):
            raise ValueError("The source instructions do not request differentiation.")
    elif isinstance(spec, DataSpec):
        numeric = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
        pairs = {(float(a), float(b)) for a, b in re.findall(r"[\[(]\s*(" + numeric + r")\s*,\s*(" + numeric + r")\s*[\])]", spec.quote)}
        if any((point.x, point.y) not in pairs for point in spec.points):
            raise ValueError("Every plotted data pair must appear explicitly in the cited quote.")
        if len({(point.x, point.y) for point in spec.points}) < 2:
            raise ValueError("The source must contain at least two different data pairs.")
    else:
        ids = [node.id for node in spec.nodes]
        if len(set(ids)) != len(ids) or any(edge.from_ not in ids or edge.to not in ids for edge in spec.edges):
            raise ValueError("Diagram edges must reference unique existing nodes.")
        if any(node.label not in spec.quote for node in spec.nodes):
            raise ValueError("Every diagram label must occur in its cited source quote.")
        labels = {node.id: node.label for node in spec.nodes}
        for edge in spec.edges:
            start, end = re.escape(labels[edge.from_]), re.escape(labels[edge.to])
            arrow = start + r"\s*(?:->|→|=>|⇒)\s*" + end
            relation = start + r"\s+" + re.escape(edge.label) + r"\s+" + end if edge.label else None
            if not re.search(arrow, spec.quote) and not (relation and re.search(relation, spec.quote)):
                raise ValueError("A diagram relationship is not stated explicitly in the cited quote.")


def _draw(spec: VisualSpec) -> tuple[str, str, str]:
    # Figure/Agg are used directly: no GUI, subprocesses, generated code or pyplot global state.
    os.environ.setdefault("MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "offcanvas-matplotlib"))
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib import rc_context
    with _LOCK, rc_context({"text.usetex": False, "font.family": "DejaVu Sans", "font.size": 10}):
        fig = Figure(figsize=(7.4, 4.4), dpi=150, facecolor="#fbfcfa")
        FigureCanvasAgg(fig)
        ax = fig.add_subplot(111)
        ax.set_facecolor("#fbfcfa")
        ax.set_title(spec.title, loc="left", fontsize=13, weight="bold", pad=16, color="#183831")
        if isinstance(spec, FunctionSpec):
            x = np.linspace(spec.xMin, spec.xMax, 1201)
            y, computed_expression, output_variable = computed_function(spec, x)
            finite = np.isfinite(y) & (np.abs(y) <= 1e12)
            if finite.sum() < 5:
                raise ValueError("Expression is undefined across the selected domain.")
            y[~finite] = np.nan
            # Break asymptotic jumps, rather than draw misleading vertical lines.
            scale = max(1e-12, float(np.nanpercentile(np.abs(y), 90)))
            y[np.r_[False, np.abs(np.diff(y)) > scale * 8]] = np.nan
            ax.plot(x, y, color="#196a56", linewidth=2)
            ax.set_xlabel(spec.xLabel or output_variable)
            ax.set_ylabel(spec.yLabel or "f(" + output_variable + ")")
            ax.grid(alpha=.2)
            ax.axhline(0, color="#8da59c", linewidth=.7)
            operation = "direct evaluation" if spec.operation == "identity" else spec.operation.replace("_", " ")
            caption = f"Python {operation} from {spec.expression}; plotted result: {computed_expression}. Domain {spec.xMin:g} to {spec.xMax:g}; 1201 samples. Domain is a display choice, not measured data."
            if "Heaviside" in computed_expression or re.search(r"\b(?:u|step)\(", spec.expression):
                caption += " Unit-step convention: u(0) = 1."
            verification = "computed"
        elif isinstance(spec, DataSpec):
            ax.scatter([point.x for point in spec.points], [point.y for point in spec.points], color="#196a56", s=35)
            ax.set_xlabel(spec.xLabel)
            ax.set_ylabel(spec.yLabel)
            ax.grid(alpha=.2)
            caption = "Source data only. Every point is an explicit coordinate pair in the cited material; no interpolated measurements or trend were invented."
            verification = "source-data"
        else:
            ax.set_axis_off()
            positions = {node.id: (index % 2 * .60 + .2, .82 - index // 2 * .22) for index, node in enumerate(spec.nodes)}
            for node in spec.nodes:
                x, y = positions[node.id]
                # dollar escaping keeps labels literal; model text never becomes TeX commands.
                ax.text(x, y, node.label.replace("$", r"\$"), ha="center", va="center", wrap=True, fontsize=9, bbox={"boxstyle": "round,pad=.65", "facecolor": "#e6f1eb", "edgecolor": "#5f8c79"}, transform=ax.transAxes)
            for edge in spec.edges:
                start, end = positions[edge.from_], positions[edge.to]
                ax.annotate("", xy=end, xytext=start, xycoords="axes fraction", textcoords="axes fraction", arrowprops={"arrowstyle": "->", "color": "#376b57", "shrinkA": 35, "shrinkB": 35, "connectionstyle": "arc3,rad=.08"})
                if edge.label:
                    ax.text((start[0] + end[0]) / 2, (start[1] + end[1]) / 2 + .035, edge.label.replace("$", r"\$"), fontsize=8, ha="center", transform=ax.transAxes, bbox={"facecolor": "#fbfcfa", "edgecolor": "none"})
            caption = "Concept map of terms quoted in the source. Arrow relationships are explanatory suggestions, not independently verified mathematical transformations."
            verification = "conceptual"
        for spine in ax.spines.values():
            spine.set_color("#c3d4c9")
        fig.tight_layout(pad=2)
        buffer = io.BytesIO()
        fig.savefig(buffer, format="png", dpi=150, metadata={"Software": "OffCanvas / Matplotlib"})
        return base64.b64encode(buffer.getvalue()).decode("ascii"), caption, verification


def render_visuals(specs: list, source_documents: list[dict]) -> tuple[list[dict], list[str]]:
    documents = {str(document.get("id", "")): str(document.get("text", "")) for document in source_documents}
    rendered, warnings, seen = [], [], set()
    for index, candidate in enumerate(specs[:12]):
        title = candidate.get("title", "Visual") if isinstance(candidate, dict) else getattr(candidate, "title", "Visual")
        try:
            spec = _SPEC.validate_python(candidate)
            _check_evidence(spec, documents)
            if isinstance(spec, FunctionSpec):
                semantic = (spec.kind, spec.sourceId, _compact(spec.expression), spec.variable, spec.operation, spec.xMin, spec.xMax)
            elif isinstance(spec, DataSpec):
                semantic = (spec.kind, spec.sourceId, tuple(sorted((point.x, point.y) for point in spec.points)))
            else:
                semantic = (spec.kind, spec.sourceId, tuple(sorted((node.id, node.label) for node in spec.nodes)), tuple(sorted((edge.from_, edge.to, edge.label) for edge in spec.edges)))
            key = json.dumps(semantic, ensure_ascii=False)
            if key in seen:
                continue
            seen.add(key)
            if len(rendered) == 4:
                warnings.append("Only the first four distinct valid visuals were rendered.")
                break
            data, caption, verification = _draw(spec)
            if isinstance(spec, FunctionSpec):
                output_variable = "t" if spec.operation == "inverse_laplace" else spec.variable
                domain = _source_domain(documents.get(spec.sourceId, ""), output_variable)
                if domain and domain == (spec.xMin, spec.xMax):
                    caption = caption.replace("Domain is a display choice, not measured data.", "Domain matches the cited assignment instructions.")
            rendered.append(RenderedVisual(id=f"visual-{index + 1}", title=spec.title, kind=spec.kind, data=data, caption=caption, provenance=Provenance(sourceId=spec.sourceId, quote=spec.quote), verification=verification).model_dump())
        except Exception as exc:
            # The packet remains useful even if a requested figure is invalid.
            warnings.append(f"{str(title)[:180]} was not rendered: {str(exc)[:250]}")
    if len(specs) > 12:
        warnings.append("Only the first twelve visual requests were considered, with at most four distinct figures rendered.")
    return rendered, warnings


def extract_function_specs(source_documents: list[dict]) -> list[dict]:
    """Find explicit single-line functions only when the instructions request a plot."""
    specs, seen_documents, seen_specs = [], set(), set()
    for document in source_documents:
        text = str(document.get("text", ""))
        document_key = (str(document.get("id", "")), text)
        if document_key in seen_documents:
            continue
        seen_documents.add(document_key)
        if not re.search(r"\b(?:plot|graph|sketch|draw)\b", text, re.I):
            continue
        for match in re.finditer(r"\b[fF]\s*\(\s*([xts])\s*\)\s*=\s*([^\n;]{1,300})", text):
            expression = _equation_rhs(match[2])
            # Prose, implicit multiplication and ambiguous LaTeX remain unrendered.
            try:
                evaluate_expression(expression, match[1], np.array([0., 1., 2.]))
            except Exception:
                continue
            inverse = match[1] == "s" and re.search(r"inverse\s+Laplace|invert\s+(?:the\s+)?Laplace|Laplace\s+inverse", text, re.I)
            derivative = not inverse and re.search(r"derivative|differentiat", text, re.I)
            # Frequency-domain expressions are not silently plotted as time functions.
            if match[1] == "s" and not inverse:
                continue
            domain = _source_domain(text, "t" if inverse else match[1])
            spec = {"kind": "function", "title": "Computed inverse Laplace response" if inverse else "Computed derivative" if derivative else "Function from the assignment", "sourceId": str(document.get("id", "")), "quote": match[0], "expression": expression, "variable": match[1], "operation": "inverse_laplace" if inverse else "derivative" if derivative else "identity", "xMin": domain[0] if domain else 0 if inverse else -5, "xMax": domain[1] if domain else 10 if inverse else 5}
            spec_key = (spec["sourceId"], _compact(expression), spec["variable"], spec["operation"], spec["xMin"], spec["xMax"])
            if spec_key in seen_specs:
                continue
            seen_specs.add(spec_key)
            specs.append(spec)
            if len(specs) == 4:
                return specs
    return specs
