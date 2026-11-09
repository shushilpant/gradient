import pytest
from fastapi.testclient import TestClient

from app import app
from safe_math import parse_expression

client = TestClient(app)


def test_algebra_keeps_polynomial_and_function_equivalence():
    for expression, expected in [
        ("(x + 1)^2", "x*x + 2*x + 1"),
        ("sin(x)^2 + cos(x)^2", "1"),
        ("sqrt(4) + log(E)", "3"),
    ]:
        response = client.post("/api/v1/verify-algebra", json={"expression": expression, "expected_equivalent": expected})
        assert response.status_code == 200
        assert response.json()["is_equivalent"] is True


@pytest.mark.parametrize("expression", [
    "__import__('os').getcwd()", "Symbol('x')", "x.__class__",
    "[x for x in range(10)]", "(lambda: 1)()", "open('/tmp/file')",
    "2**(2**32)", "1/0", "1e100", "True", "x[0]", "sqrt(x, evaluate=False)",
])
def test_algebra_rejects_python_and_unbounded_expressions(expression):
    response = client.post("/api/v1/verify-algebra", json={"expression": expression})
    assert response.status_code == 400


def test_target_expression_is_checked_too():
    response = client.post("/api/v1/verify-algebra", json={"expression": "x", "expected_equivalent": "__import__('os').getcwd()"})
    assert response.status_code == 400


def test_long_expressions_are_rejected_before_parsing():
    assert client.post("/api/v1/verify-algebra", json={"expression": "x" * 1001}).status_code == 422


def test_expression_parser_never_calls_python_import(monkeypatch):
    # An attribute or function name must be rejected before it can be evaluated.
    with pytest.raises(ValueError):
        parse_expression("__import__('os')")
