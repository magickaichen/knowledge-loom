from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .audit import audit_vault
from .contract import ContractError, load_vault, validate_contract_data
from .initializer import build_contract, initialize_vault
from .registry import ResolutionError, register_vault, resolve_vault


def _print_findings(findings, *, as_json: bool) -> None:
    if as_json:
        print(json.dumps([finding.to_dict() for finding in findings], indent=2))
        return
    if not findings:
        print("PASS no findings")
        return
    for finding in findings:
        location = f" [{finding.path}]" if finding.path else ""
        print(f"{finding.severity.upper():7} {finding.code}{location}: {finding.message}")


def _audit(args: argparse.Namespace) -> int:
    vault = resolve_vault(args.selector, cwd=Path.cwd(), registry_path=args.registry)
    findings = audit_vault(vault)
    _print_findings(findings, as_json=args.json)
    return 1 if any(finding.severity == "error" for finding in findings) else 0


def _resolve(args: argparse.Namespace) -> int:
    vault = resolve_vault(args.selector, cwd=Path.cwd(), registry_path=args.registry)
    print(vault.root)
    return 0


def _register(args: argparse.Namespace) -> int:
    path, rendered = register_vault(
        args.vault_id,
        args.path,
        registry_path=args.registry,
        apply=args.apply,
    )
    if args.apply:
        print(f"registered {args.vault_id} in {path}")
    else:
        print(f"DRY RUN would write {path}\n")
        print(rendered, end="")
    return 0


def _init(args: argparse.Namespace) -> int:
    root = args.path.expanduser()
    contract = build_contract(
        root,
        vault_id=args.vault_id,
        title=args.title,
        subjects=args.subject,
        write_policy=args.write_policy,
        current_state_policy=args.current_state_policy,
        history_type=args.history,
        adopt=args.adopt,
    )
    findings = validate_contract_data(contract)
    if any(item.severity == "error" for item in findings):
        _print_findings(findings, as_json=False)
        return 1
    contract_path, rendered = initialize_vault(root, contract=contract, adopt=args.adopt, apply=args.apply)
    if args.apply:
        print(f"created {contract_path}")
    else:
        print(f"DRY RUN would create {contract_path}\n")
        print(rendered, end="")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="knowledge-loom")
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit = subparsers.add_parser("audit", help="run a read-only vault audit")
    audit.add_argument("selector", nargs="?", help="vault path or registry ID")
    audit.add_argument("--registry", type=Path)
    audit.add_argument("--json", action="store_true")
    audit.set_defaults(handler=_audit)

    resolve = subparsers.add_parser("resolve", help="resolve one vault deterministically")
    resolve.add_argument("selector", nargs="?", help="vault path or registry ID")
    resolve.add_argument("--registry", type=Path)
    resolve.set_defaults(handler=_resolve)

    register = subparsers.add_parser("register", help="preview or register a vault")
    register.add_argument("vault_id")
    register.add_argument("path", type=Path)
    register.add_argument("--registry", type=Path)
    register.add_argument("--apply", action="store_true")
    register.set_defaults(handler=_register)

    init = subparsers.add_parser("init", help="preview or initialize a vault contract")
    init.add_argument("path", type=Path)
    init.add_argument("--vault-id", required=True)
    init.add_argument("--title", required=True)
    init.add_argument("--subject", action="append", required=True)
    init.add_argument(
        "--write-policy",
        choices=["explicit-only", "proactive-durable-capture"],
        default="explicit-only",
    )
    init.add_argument(
        "--current-state-policy",
        choices=["explicit-only", "maintain-after-material-change"],
        default="explicit-only",
    )
    init.add_argument("--history", choices=["git", "none"], default="none")
    init.add_argument("--adopt", action="store_true", help="adopt an existing non-empty vault")
    init.add_argument("--apply", action="store_true")
    init.set_defaults(handler=_init)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except (ContractError, ResolutionError, FileExistsError, ValueError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
