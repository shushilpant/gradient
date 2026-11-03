# Grounded homework visuals

GRADIENT uses Matplotlib and NumPy to draw figures locally. It does not run Python
written by the model. The model can propose a small declarative request; the
renderer checks it against exact source quotes before drawing anything.

- **Function graphs:** the expression must match the complete right-hand side of
  an explicit `f(t)=...`, `f(x)=...`, `F(s)=...` or `y=...` equation in the cited
  quote. A restricted arithmetic AST supports approved functions such as `exp`,
  `sin`, `cos`, `sqrt`, and the unit step `u`. Arbitrary calls, imports, object
  attributes, indexing, comprehensions and generated code are rejected.
- **Computed operations:** when the source asks for differentiation or an inverse
  Laplace transform, the renderer builds a SymPy expression using that same AST.
  Inverse Laplace plots support proper rational expressions of degree at most
  four and an optional nonnegative exponential delay. Computed expressions are
  evaluated through a restricted symbolic-node walker, without `sympify`,
  `eval`, `exec`, `lambdify`, shell commands or model-generated programs.
- **Data plots:** every plotted coordinate must occur as an explicit `(x,y)` pair
  in the cited quote. The renderer uses scatter points and does not invent a
  regression, interpolation or experiment.
- **Concept diagrams:** each node label must occur in the quote. Every arrow must
  match a source arrow such as `input -> output`, or an exact source phrase such
  as `input causes output`. Merely mentioning two terms does not justify an edge.
  These figures are labeled conceptual rather than independently verified math.

Every PNG includes a title and axis labels where appropriate. Returned metadata
includes its exact source ID/quote, computation caption and verification category.
The graph domain is a display choice and is identified as such; it is not claimed
as source data. Unit-step graphs explicitly use `u(0)=1`. Undefined values and
large asymptotic jumps are masked rather than connected by misleading lines.

At most twelve candidate requests are examined and four distinct figures rendered,
with 100 source points, 1201 function samples, and bounded expressions/ranges.
Repeated source documents and equivalent requests are deduplicated before drawing.
Unsupported or insufficiently grounded visuals
are omitted with a reason. A missing graph is preferable to an invented result.
This validation verifies provenance and computation within the supported grammar;
it does not establish that a model chose the best pedagogical figure or that the
underlying course material is correct.

The renderer uses [Matplotlib's Agg canvas](https://matplotlib.org/stable/api/backend_agg_api.html)
for local PNG output and NumPy's documented
[Heaviside function](https://numpy.org/doc/stable/reference/generated/numpy.heaviside.html)
for step signals. Install the project's Python dependencies before starting the
backend. Run `backend/.venv/bin/python -m pytest backend/test_visual_renderer.py`
from the `gradient` directory to check the renderer without a model or network.
