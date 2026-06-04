#!/usr/bin/env python3
"""Extract CSS tokens from companion UI mockups under design/."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEARCH_DIRS = [
    ROOT / "design" / "iOS UI",
    ROOT / "design",
]


def find_html_files() -> list[Path]:
    found: list[Path] = []
    for base in SEARCH_DIRS:
        if not base.is_dir():
            continue
        for ext in ("*.html", "*.htm", "*.css"):
            found.extend(base.rglob(ext))
    # de-dupe
    seen = set()
    out = []
    for p in sorted(found):
        if p.name.startswith("."):
            continue
        key = str(p.resolve())
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def extract_css_vars(text: str) -> dict[str, str]:
    vars_found: dict[str, str] = {}
    for m in re.finditer(r"--([a-z0-9-]+)\s*:\s*([^;}\n]+)", text, re.I):
        vars_found[m.group(1)] = m.group(2).strip()
    return vars_found


def main() -> int:
    files = find_html_files()
    ios_ui = ROOT / "design" / "iOS UI"
    if ios_ui.is_dir():
        print(f"iOS UI folder: {ios_ui}")
        for child in sorted(ios_ui.iterdir()):
            print(f"  {child.name}{'/' if child.is_dir() else ''}")
    else:
        print(f"Missing: {ios_ui}")

    if not files:
        print("\nNo HTML/CSS under design/iOS UI yet. Push your mockup files.", file=sys.stderr)
        return 1

    all_vars: dict[str, str] = {}
    for path in files:
        if "iOS UI" not in str(path) and path.name not in ("Khayt Companion.html",):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        vars_found = extract_css_vars(text)
        if vars_found:
            print(f"\n{path.relative_to(ROOT)} — {len(vars_found)} variables")
            all_vars.update(vars_found)

    if not all_vars:
        print("\nNo --css-variables found. Share index.html or main .css from design/iOS UI")
        return 1

    print("\nKey tokens:")
    for key in sorted(all_vars.keys()):
        if key in ("bg", "bg-2", "surface", "surface-2", "accent", "text", "text-dim",
                   "text-muted", "ok", "warn", "danger", "info", "violet", "brand"):
            print(f"  --{key}: {all_vars[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
