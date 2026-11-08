"""Parse a small mathematical language without evaluating Python source."""

import ast
import math

import sympy as sp


def parse_expression(value: str) -> sp.Expr:
    if not value.strip() or len(value) > 1000:
        raise ValueError("Use a mathematical expression of at most 1,000 characters.")
    tree = ast.parse(value.replace("^", "**"), mode="eval")
    if len(list(ast.walk(tree))) > 160:
        raise ValueError("The expression is too complex.")
    functions = {
        "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
        "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
        "exp": sp.exp, "log": sp.log, "ln": sp.log,
        "sqrt": sp.sqrt, "abs": sp.Abs, "Abs": sp.Abs,
    }

    def visit(node):
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if not math.isfinite(node.value) or abs(node.value) > 1e12:
                raise ValueError("Use finite constants no larger than one trillion.")
            return sp.Rational(str(node.value))
        if isinstance(node, ast.Name) and node.id.isalpha() and len(node.id) <= 32:
            return {"pi": sp.pi, "E": sp.E, "e": sp.E}.get(node.id, sp.Symbol(node.id))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            operand = visit(node.operand)
            return operand if isinstance(node.op, ast.UAdd) else -operand
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.Pow):
                if not right.is_number or not right.is_real or abs(float(right)) > 32:
                    raise ValueError("Powers must use numeric exponents between -32 and 32.")
                return left ** right
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and node.func.id in functions and len(node.args) == 1 and not node.keywords):
            return functions[node.func.id](visit(node.args[0]))
        raise ValueError("Use numbers, variables, arithmetic and standard single-argument math functions.")

    expression = visit(tree)
    if expression.has(sp.zoo, sp.oo, -sp.oo, sp.nan):
        raise ValueError("The expression is undefined or infinite.")
    return expression
