#!/usr/bin/env python3
"""Build a deterministic Claude Desktop custom-skill ZIP."""

from __future__ import annotations

import argparse
import stat
import zipfile
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = PACKAGE_ROOT / "adapters" / "claude-desktop" / "knowledge-loom"
REFERENCE_FILES = (
    PACKAGE_ROOT / "references" / "protocol.md",
    PACKAGE_ROOT / "references" / "contract-schema.md",
)
ARCHIVE_ROOT = "knowledge-loom"


def _write_file(archive: zipfile.ZipFile, source: Path, destination: str) -> None:
    info = zipfile.ZipInfo(destination, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    archive.writestr(info, source.read_bytes())


def build_archive(output: Path) -> Path:
    skill_file = SKILL_ROOT / "SKILL.md"
    required = (skill_file, *REFERENCE_FILES)
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"missing Desktop skill source: {', '.join(missing)}")

    output = output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w") as archive:
        _write_file(archive, skill_file, f"{ARCHIVE_ROOT}/SKILL.md")
        for reference in REFERENCE_FILES:
            _write_file(
                archive,
                reference,
                f"{ARCHIVE_ROOT}/references/{reference.name}",
            )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=PACKAGE_ROOT / "dist" / "knowledge-loom-claude-desktop.zip",
    )
    args = parser.parse_args()
    output = build_archive(args.output)
    print(f"BUILT   {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
