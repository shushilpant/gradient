import base64
import io

import numpy as np
import pytest

from visual_renderer import FunctionSpec, computed_function, evaluate_expression, extract_function_specs, render_visuals


def function(expression="t*exp(-t)", **changes):
    return {"kind": "function", "title": "Decay", "sourceId": "S1", "quote": f"Plot f(t) = {expression}", "expression": expression, "variable": "t", "xMin": 0, "xMax": 8, **changes}


def render(spec):
    return render_visuals([spec], [{"id": "S1", "text": spec["quote"]}])


def test_computes_actual_function_values_and_renders_standalone_png():
    y = evaluate_expression("t*exp(-t)", "t", np.array([0., 1., 2.]))
    np.testing.assert_allclose(y, [0, 1 / np.e, 2 / np.e**2])
    images, warnings = render(function())
    assert not warnings and len(images) == 1
    image = images[0]
    assert image["verification"] == "computed"
    assert image["provenance"] == {"sourceId": "S1", "quote": "Plot f(t) = t*exp(-t)"}
    raw = base64.b64decode(image["data"])
    assert raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) > 5000
    from PIL import Image
    assert Image.open(io.BytesIO(raw)).size == (1110, 660)


def test_heaviside_shift_has_actual_zero_before_onset():
    values = evaluate_expression("(t-2)*exp(-(t-2))*u(t-2)", "t", np.array([0., 1., 2., 3.]))
    np.testing.assert_allclose(values, [0, 0, 0, 1 / np.e])
    images, warnings = render(function("(t-2)*exp(-(t-2))*u(t-2)"))
    assert images and not warnings


@pytest.mark.parametrize("expression", ["__import__('os').system('touch /tmp/should-not-exist')", "t.__class__", "exp(t, 2)", "t[0]", "[t for t in x]", "10**100000", "t**t", "open('/tmp/file')"])
def test_no_generated_python_or_unbounded_expression_runs(expression):
    with pytest.raises((ValueError, SyntaxError)):
        evaluate_expression(expression, "t", np.array([0., 1.]))


def test_fabricated_formula_and_quote_are_not_graphed():
    spec = function("sin(t)")
    images, warnings = render_visuals([spec], [{"id": "S1", "text": "Plot f(t) = t*exp(-t)"}])
    assert not images and "quote" in warnings[0]
    spec = function("t", quote="Plot f(t) = t*exp(-t)")
    images, warnings = render(spec)
    assert not images and "expression" in warnings[0]


def test_no_fabricated_numeric_pairs_or_invented_trend_line():
    spec = {"kind": "data", "title": "Measurements", "sourceId": "S1", "quote": "Observations: (1, 2), (2, 4), (3, 6)", "points": [{"x": 1, "y": 2}, {"x": 2, "y": 4}]}
    images, warnings = render(spec)
    assert images[0]["verification"] == "source-data" and not warnings
    spec["points"][1]["y"] = 50
    images, warnings = render(spec)
    assert not images and "Every plotted data pair" in warnings[0]


def test_nonfinite_domain_and_reversed_range_are_rejected():
    assert not render(function("sqrt(-t)", xMin=1, xMax=5))[0]
    assert not render(function(xMin=5, xMax=1))[0]
    assert not render(function(xMin=float("nan")))[0]


def test_concept_map_is_explicitly_not_verified_mathematics():
    spec = {"kind": "diagram", "title": "Signal terms", "sourceId": "S1", "quote": "The task states input -> output.", "nodes": [{"id": "a", "label": "input"}, {"id": "b", "label": "output"}], "edges": [{"from": "a", "to": "b", "label": "related terms"}]}
    images, warnings = render(spec)
    assert not warnings and images[0]["verification"] == "conceptual"
    assert "not independently verified" in images[0]["caption"]
    spec["nodes"][1]["label"] = "made-up transform"
    assert not render(spec)[0]


def test_mere_cooccurrence_does_not_verify_diagram_edges():
    spec = {"kind": "diagram", "title": "False property", "sourceId": "S1", "quote": "The assignment mentions f(t), F(s), and e^(-as)F(s).", "nodes": [{"id": "a", "label": "f(t)"}, {"id": "b", "label": "F(s)"}], "edges": [{"from": "a", "to": "b", "label": "causes"}]}
    images, warnings = render(spec)
    assert not images and "relationship" in warnings[0]


def test_inverse_laplace_is_computed_from_source_not_generated_numeric_samples():
    spec = {"kind": "function", "title": "Computed delayed response", "sourceId": "S1", "quote": "F(s) = exp(-2*s)/(s+1)**2", "expression": "exp(-2*s)/(s+1)**2", "variable": "s", "operation": "inverse_laplace", "xMin": 0, "xMax": 8}
    source = "Find the inverse Laplace transform and graph the result.\n" + spec["quote"]
    images, warnings = render_visuals([spec], [{"id": "S1", "text": source}])
    assert not warnings and images[0]["verification"] == "computed"
    values, expression, variable = computed_function(FunctionSpec.model_validate(spec), np.array([0., 1., 2., 3., 4.]))
    np.testing.assert_allclose(values, [0, 0, 0, 1 / np.e, 2 / np.e**2])
    assert variable == "t" and "Heaviside" in expression
    # The same model-proposed transformation is rejected when the task doesn't ask it.
    images, warnings = render_visuals([spec], [{"id": "S1", "text": spec["quote"]}])
    assert not images and "instructions" in warnings[0]


def test_symbolic_operations_reject_distributions_and_expensive_inputs():
    for expression in ["s", "1/(s+1)**5", "exp(s)/(s+1)", "exp(-s*s)/(s+1)"]:
        with pytest.raises(ValueError):
            computed_function(FunctionSpec.model_validate(function(expression, variable="s", operation="inverse_laplace")), np.array([0., 1., 2.]))


def test_derivative_computed_with_symbolic_arithmetic_only():
    spec = function("t**3", operation="derivative")
    images, _ = render_visuals([spec], [{"id": "S1", "text": "Differentiate the following. " + spec["quote"]}])
    assert images
    values, _, _ = computed_function(FunctionSpec.model_validate(spec), np.array([0., 1., 2.]))
    np.testing.assert_allclose(values, [0, 3, 12])


def test_explicit_function_extraction_requires_plot_request_and_no_prose_guessing():
    documents = [{"id": "S1", "text": "Sketch the graph below.\nf(t) = t*exp(-t)\nExplain the peak."}]
    assert extract_function_specs(documents)[0]["expression"] == "t*exp(-t)"
    assert not extract_function_specs([{"id": "S1", "text": "Explain f(t) = t*exp(-t)"}])
    assert not extract_function_specs([{"id": "S1", "text": "Plot f(t) = t plus some numbers"}])
    inverse = extract_function_specs([{"id": "S1", "text": "Find the inverse Laplace transform and sketch it.\nF(s) = 1/(s+1)**2"}])
    assert inverse[0]["operation"] == "inverse_laplace"
    assert not extract_function_specs([{"id": "S1", "text": "Plot F(s) = 1/(s+1)**2"}])


def test_unknown_fields_and_more_than_four_requests_are_bounded():
    spec = function()
    assert not render({**spec, "code": "os.system('anything')"})[0]
    specs = [function(f"t+{index}") for index in range(5)]
    images, warnings = render_visuals(specs, [{"id": "S1", "text": "\n".join(item["quote"] for item in specs)}])
    assert len(images) == 4 and "first four" in warnings[-1]


def test_duplicate_assignment_documents_and_equivalent_specs_render_once():
    text = "Plot f(t) = (t-2)*exp(-(t-2))*u(t-2) for 0<=t<=8. Explain the result."
    documents = [{"id": "S1", "text": text}, {"id": "S1", "text": text}]
    specs = extract_function_specs(documents)
    assert len(specs) == 1
    model_spec = {**specs[0], "title": "A different title for the same function", "quote": text, "xMin": -5, "xMax": 5}
    images, warnings = render_visuals([specs[0], model_spec, specs[0]], documents)
    assert len(images) == 1 and not warnings


def test_scatter_data_reordered_points_do_not_duplicate_the_figure():
    spec = {"kind": "data", "title": "Measurements", "sourceId": "S1", "quote": "(1,2), (2,4), (3,6)", "points": [{"x": 1, "y": 2}, {"x": 2, "y": 4}]}
    duplicate = {**spec, "title": "Same points", "points": list(reversed(spec["points"]))}
    images, warnings = render_visuals([spec, duplicate], [{"id": "S1", "text": spec["quote"]}])
    assert len(images) == 1 and not warnings


def test_inline_homework_formula_and_domain_are_extracted_without_instruction_prose():
    text = "Plot f(t) = (t-2)*exp(-(t-2))*u(t-2) for 0<=t<=8. Explain why signal is zero before t=2 and identify peak."
    sources = [{"id": "S1", "text": text}]
    specs = extract_function_specs(sources)
    assert len(specs) == 1
    assert specs[0]["expression"] == "(t-2)*exp(-(t-2))*u(t-2)"
    assert (specs[0]["xMin"], specs[0]["xMax"]) == (0, 8)
    assert specs[0]["quote"] in text
    images, warnings = render_visuals(specs, sources)
    assert images and not warnings
    assert "Domain matches the cited assignment instructions" in images[0]["caption"]
    # Model specs quoting the full inline instruction validate against the same RHS.
    specs[0]["quote"] = text
    assert render_visuals(specs, sources)[0]


@pytest.mark.parametrize("suffix", [" for 0 <= x <= 3", " where x is time", " on the specified range", " with axes labeled", ". Explain the result."])
def test_formula_boundaries_preserve_decimal_numbers(suffix):
    sources = [{"id": "S1", "text": "Graph f(x) = 0.5*x**2" + suffix}]
    specs = extract_function_specs(sources)
    assert specs[0]["expression"] == "0.5*x**2"
    assert render_visuals(specs, sources)[0]


def test_automatic_derivative_request_plots_derivative_not_original_function():
    sources = [{"id": "S1", "text": "Differentiate and plot f(t) = t**3 for -2 <= t <= 2."}]
    specs = extract_function_specs(sources)
    assert specs[0]["operation"] == "derivative"
    assert (specs[0]["xMin"], specs[0]["xMax"]) == (-2, 2)
    assert "derivative" in render_visuals(specs, sources)[0][0]["caption"]


def test_source_domain_overrides_incorrect_model_display_range():
    spec = function(xMin=-5, xMax=5)
    sources = [{"id": "S1", "text": spec["quote"] + " for 0 ≤ t ≤ 8. Explain the result."}]
    images, warnings = render_visuals([spec], sources)
    assert not warnings and images
    assert "Domain 0 to 8;" in images[0]["caption"]
    assert "Domain matches the cited assignment instructions" in images[0]["caption"]
    assert "display choice" not in images[0]["caption"]


def test_model_range_cannot_override_source_domain_for_computed_time_response():
    spec = {"kind": "function", "title": "Inverse response", "sourceId": "S1", "quote": "F(s) = 1/(s+1)**2", "expression": "1/(s+1)**2", "variable": "s", "operation": "inverse_laplace", "xMin": -5, "xMax": 5}
    sources = [{"id": "S1", "text": "Compute the inverse Laplace transform. " + spec["quote"] + "\nPlot for 0<=t<=8."}]
    images, warnings = render_visuals([spec], sources)
    assert not warnings and "Domain 0 to 8;" in images[0]["caption"]


def test_source_domain_written_from_to_is_respected():
    sources = [{"id": "S1", "text": "Plot f(t) = 0.5*t**2 from 0 to 8."}]
    specs = extract_function_specs(sources)
    assert (specs[0]["xMin"], specs[0]["xMax"]) == (0, 8)
    assert "Domain 0 to 8;" in render_visuals(specs, sources)[0][0]["caption"]
