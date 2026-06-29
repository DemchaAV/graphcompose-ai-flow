#!/usr/bin/env python3
"""
Generate a COMPLETE public-API surface index for the GraphCompose authoring
surface, straight from source, so an agent has an allow-list of real methods
and never invents one.

Output: .llm-wiki/00-api-surface.md  (grouped by type, greppable).

Run from repo root:  python .llm-wiki/tools/api-index/api-index.py
No build required — it parses src/main/java directly, so it always reflects the
current working tree.
"""
import argparse
import os
import re

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

# The authoring surface an agent calls when composing a document. Engine /
# layout / internal packages are deliberately excluded — they are not what a
# "compose this" task should reach for.
PACKAGES = [
    "com/demcha/compose/GraphCompose.java",
    "com/demcha/compose/document/api",
    "com/demcha/compose/document/dsl",
    "com/demcha/compose/document/theme",
    "com/demcha/compose/document/style",
    "com/demcha/compose/document/table",
    "com/demcha/compose/document/chart",
    "com/demcha/compose/document/node",
    "com/demcha/compose/document/image",
    "com/demcha/compose/document/svg",
    "com/demcha/compose/document/output",
    "com/demcha/compose/document/templates/builtins",
    "com/demcha/compose/document/templates/data",
    "com/demcha/compose/document/templates/api",
    "com/demcha/compose/document/templates/theme",
    "com/demcha/compose/font",
]

MODIFIERS = {"static", "final", "abstract", "default", "synchronized", "native", "strictfp"}
METHOD_RE = re.compile(r"\bpublic\b(?!\s+(?:class|interface|record|enum|@))([^;{=()]*?)\(([^{;]*?)\)", re.S)
TYPE_RE_T = "public\\s+(?:final\\s+|sealed\\s+|abstract\\s+|non-sealed\\s+)*(class|interface|record|enum)\\s+{name}\\b"
CONST_RE = re.compile(r"\bpublic\s+static\s+final\s+[\w.<>\[\]]+\s+(\w+)\s*[=;]")


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    return src


def collect_files(src_java):
    files = []
    for entry in PACKAGES:
        path = os.path.join(src_java, entry)
        if entry.endswith(".java"):
            if os.path.isfile(path):
                files.append(path)
        elif os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for n in sorted(names):
                    if n.endswith(".java") and n != "package-info.java":
                        files.append(os.path.join(root, n))
    return files


def parse(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    src = strip_comments(raw)
    pkg_m = re.search(r"package\s+([\w.]+)\s*;", src)
    pkg = pkg_m.group(1) if pkg_m else "?"
    tname = os.path.basename(path)[:-5]

    km = re.search(TYPE_RE_T.format(name=re.escape(tname)), src)
    if not km:
        return None  # not a public top-level type
    kind = km.group(1)

    methods = []
    seen = set()
    for m in METHOD_RE.finditer(src):
        head = " ".join(m.group(1).split())
        params = " ".join(m.group(2).split())
        toks = head.split()
        while toks and toks[0] in MODIFIERS:
            toks.pop(0)
        if not toks:
            continue
        name = toks[-1]
        ret = " ".join(toks[:-1])
        if not re.fullmatch(r"[A-Za-z_]\w*", name):
            continue
        sig = f"{ret + ' ' if ret else ''}{name}({params})"
        if sig not in seen:
            seen.add(sig)
            methods.append((name == tname, sig))  # ctor flag

    consts = []
    if kind == "enum":
        body = src[km.end():]
        head = re.split(r";", body, maxsplit=1)[0]
        head = head[head.find("{") + 1:] if "{" in head else head
        for c in re.findall(r"([A-Z][A-Z0-9_]+)\s*(?:\([^)]*\)|,|;|\})", head):
            if c not in consts:
                consts.append(c)
    for c in CONST_RE.findall(src):
        if c not in consts:
            consts.append(c)

    return pkg, tname, kind, methods, consts


def read_version(src_root):
    pom = os.path.join(src_root, "pom.xml")
    try:
        text = open(pom, encoding="utf-8", errors="replace").read()
        m = re.search(r"<version>([^<]+)</version>", text)
        return m.group(1) if m else "unknown"
    except OSError:
        return "unknown"


def main():
    ap = argparse.ArgumentParser(description="Generate the GraphCompose authoring API allow-list.")
    ap.add_argument("--src", default=REPO, help="GraphCompose repo root to parse (default: this repo)")
    ap.add_argument("--out", default=os.path.join(REPO, ".llm-wiki", "00-api-surface.md"),
                    help="output markdown path")
    args = ap.parse_args()
    src_root = os.path.abspath(args.src)
    src_java = os.path.join(src_root, "src", "main", "java")
    version = read_version(src_root)

    files = collect_files(src_java)
    types = []
    for f in files:
        parsed = parse(f)
        if parsed:
            types.append(parsed)
    types.sort(key=lambda t: (t[0], t[1]))

    out = [
        "# GraphCompose — Public API Surface (authoring)",
        "",
        "> **Generated from source by `tools/api-index/api-index.py` — do not hand-edit.**",
        "> This is the COMPLETE list of public methods/constants on the authoring surface.",
        "> **If a method is not listed here, it does not exist — do not invent one.**",
        "> Engine / layout / internal packages are excluded on purpose.",
        "> Regenerate after API changes: `python .llm-wiki/tools/api-index/api-index.py`",
        "",
        f"**GraphCompose version:** {version}",
        "",
        f"Types: {len(types)} · "
        f"methods: {sum(len(t[3]) for t in types)} · "
        f"constants: {sum(len(t[4]) for t in types)}",
        "",
    ]
    current_pkg = None
    for pkg, tname, kind, methods, consts in types:
        if pkg != current_pkg:
            out.append(f"\n## {pkg}\n")
            current_pkg = pkg
        out.append(f"### {tname} ({kind})")
        ctors = [s for c, s in methods if c]
        meths = [s for c, s in methods if not c]
        if ctors:
            for s in ctors:
                out.append(f"- `new {s}`")
        for s in meths:
            out.append(f"- `{s}`")
        if consts:
            out.append(f"- constants: {', '.join('`' + c + '`' for c in consts)}")
        out.append("")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    open(args.out, "w", encoding="utf-8").write("\n".join(out))
    print(f"wrote {args.out}  (GraphCompose {version})")
    print(f"types={len(types)} methods={sum(len(t[3]) for t in types)} constants={sum(len(t[4]) for t in types)}")


if __name__ == "__main__":
    main()
