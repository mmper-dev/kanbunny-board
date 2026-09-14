"""Checks this service against ../openapi.yaml.

openapi.yaml is the contract shared with the frontend, and FastAPI generates its own schema from
the code. Nothing keeps those two in step on its own — this does. A route added here without a
corresponding entry there, or a path renamed on one side only, fails here rather than at runtime in
the browser.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from app.main import create_app

CONTRACT = Path(__file__).resolve().parents[2] / "openapi.yaml"
METHODS = {"get", "post", "patch", "put", "delete"}


@pytest.fixture(scope="module")
def contract() -> dict:
    assert CONTRACT.exists(), f"openapi.yaml not found at {CONTRACT}"
    return yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def generated() -> dict:
    return create_app().openapi()


def _normalise(path: str) -> str:
    """Placeholder names are local labels — `{taskId}` and `{task_id}` address the same URL — so
    they are levelled before comparing. A renamed *segment* still shows up as a difference."""
    return re.sub(r"\{[^}]+\}", "{}", path)


def _operations(spec: dict) -> dict[tuple[str, str], dict]:
    return {
        (method.upper(), _normalise(path)): operation
        for path, item in spec["paths"].items()
        for method, operation in item.items()
        if method in METHODS
    }


def test_implements_every_documented_operation(contract, generated):
    documented = set(_operations(contract))
    implemented = set(_operations(generated))
    missing = sorted(documented - implemented)
    assert not missing, f"Documented in openapi.yaml but not implemented: {missing}"


def test_documents_every_implemented_operation(contract, generated):
    documented = set(_operations(contract))
    implemented = set(_operations(generated))
    undocumented = sorted(implemented - documented)
    assert not undocumented, f"Implemented but missing from openapi.yaml: {undocumented}"


def test_operation_ids_match(contract, generated):
    documented = {k: v.get("operationId") for k, v in _operations(contract).items()}
    implemented = {k: v.get("operationId") for k, v in _operations(generated).items()}
    mismatched = {
        key: (documented[key], implemented[key])
        for key in documented.keys() & implemented.keys()
        if documented[key] != implemented[key]
    }
    assert not mismatched, f"operationId differs (contract, code): {mismatched}"


def test_success_status_codes_match(contract, generated):
    documented = _operations(contract)
    implemented = _operations(generated)
    problems = []
    for key in documented.keys() & implemented.keys():
        want = {c for c in documented[key]["responses"] if str(c).startswith("2")}
        got = {c for c in implemented[key]["responses"] if str(c).startswith("2")}
        if want != got:
            problems.append((key, sorted(want), sorted(got)))
    assert not problems, f"Success status mismatch (contract, code): {problems}"


def test_documented_error_codes_are_implemented(contract, generated):
    """The frontend branches on these, so a documented 409 that the code never declares is a lie."""
    documented = _operations(contract)
    implemented = _operations(generated)
    problems = []
    for key in documented.keys() & implemented.keys():
        want = {str(c) for c in documented[key]["responses"] if str(c).startswith(("4", "5"))}
        got = {str(c) for c in implemented[key]["responses"] if str(c).startswith(("4", "5"))}
        if missing := want - got:
            problems.append((key, sorted(missing)))
    assert not problems, f"Documented error responses not declared in code: {problems}"


def test_public_endpoints_agree(contract, generated):
    """An endpoint the contract calls public must not require a token, and vice versa."""
    documented = _operations(contract)
    implemented = _operations(generated)
    problems = []
    for key in documented.keys() & implemented.keys():
        doc_public = documented[key].get("security") == []
        code_public = "security" not in implemented[key] or implemented[key]["security"] == []
        if doc_public != code_public:
            problems.append((key, "public" if doc_public else "protected"))
    assert not problems, f"Auth requirement disagrees with openapi.yaml: {problems}"


def test_wire_models_are_camel_case(generated):
    schemas = generated["components"]["schemas"]
    offenders = [
        f"{name}.{field}"
        for name, schema in schemas.items()
        for field in schema.get("properties", {})
        if "_" in field
    ]
    assert not offenders, f"snake_case leaked onto the wire: {offenders}"
