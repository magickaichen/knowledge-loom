from __future__ import annotations

from pathlib import Path, PurePosixPath, PureWindowsPath


def is_vault_relative_path(value: str) -> bool:
    """Return whether a portable contract path stays lexically inside a vault."""
    if not value or "\x00" in value or "\\" in value:
        return False

    posix = PurePosixPath(value)
    windows = PureWindowsPath(value)
    return not posix.is_absolute() and not windows.is_absolute() and not windows.drive and ".." not in posix.parts


def resolve_vault_path(root: Path, value: str) -> Path | None:
    """Resolve a validated contract path and reject symlink escapes."""
    if not is_vault_relative_path(value):
        return None

    try:
        resolved_root = root.resolve()
        resolved_path = (resolved_root / value).resolve()
    except (OSError, RuntimeError):
        return None
    try:
        resolved_path.relative_to(resolved_root)
    except ValueError:
        return None
    return resolved_path


def is_within_vault(root: Path, path: Path) -> bool:
    try:
        resolved_root = root.resolve()
        path.resolve().relative_to(resolved_root)
    except (OSError, RuntimeError, ValueError):
        return False
    return True
