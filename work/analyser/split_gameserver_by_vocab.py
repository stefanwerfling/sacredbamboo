#!/usr/bin/env python3
"""Split an IDA-decompiled C file into semantic buckets + analysis index.

Usage:
    split_c_by_vocab.py [path/to/file.c]

Defaults to ../GameServer.c if no argument is given. Output goes to
`<input>_split/` next to the input file.

Output layout:
    00_declarations.c       forward-declaration block
    00_data.c               global data block
    <bucket>/<addr>_<name>.c per-function files, grouped by primary bucket
    index.json              machine-readable metadata for every function
    SUMMARY.md              bucket counts + layout notes

Classification uses string literals + Win32/CRT/WinSock vocabulary. Each
function is tagged with ALL matching buckets; primary bucket is chosen by
priority order below. `index.json` holds forward and reverse call graph so
later analysis can follow edges without re-parsing.

Safe to re-run; overwrites the output directory.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parent

MARKER_RE = re.compile(r"^//----- \(([0-9A-Fa-f]+)\) -+\s*$")
STRING_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')
SUBCALL_RE = re.compile(r"\b(sub_[0-9A-Fa-f]+)\s*\(")
FUNCNAME_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_:]*)\s*\(")

# Buckets in priority order for primary classification. The FIRST bucket whose
# regex matches the function body becomes its primary bucket. All matches end
# up in `tags`, so cross-cutting buckets (memory, debug) are still queryable.
BUCKETS: list[tuple[str, re.Pattern]] = [
    # Runtime/STL — strip out first so it doesn't pollute domain buckets.
    ("crt_stl", re.compile(
        r"\bstd::|"
        r"\b(basic_string|codecvt|locale|facet|xlocale|Iostream_init)\b|"
        r"\b_CxxThrowException\b|__CxxFrameHandler|_purecall|"
        r"\bConcurrency::|"
        r"\b(mbtowc|wctomb|wcsrtombs|mbsrtowcs|_mbsnbcpy|_wcsnicmp)\b|"
        r"\b__scrt_|__report_"
    )),
    ("database", re.compile(
        r"\bmysql_[a-z_]+\b|"
        r"\b(SELECT |INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE)",
        re.IGNORECASE,
    )),
    ("network", re.compile(
        r"\b("
        r"WSAStartup|WSACleanup|WSAGetLastError|WSAAsyncSelect|"
        r"socket|bind|listen|accept|connect|closesocket|shutdown|"
        r"send|recv|sendto|recvfrom|select|"
        r"htons|htonl|ntohs|ntohl|"
        r"inet_addr|inet_ntoa|gethostbyname|gethostbyaddr|gethostname|"
        r"getsockopt|setsockopt|ioctlsocket"
        r")\b"
    )),
    ("registry", re.compile(r"\bReg(Open|Create|Close|Query|Set|Delete|Enum)[A-Za-z]*\b")),
    ("filesystem", re.compile(
        r"\b("
        r"CreateFile[AW]?|ReadFile|WriteFile|CloseHandle|"
        r"FindFirstFile[AW]?|FindNextFile[AW]?|FindClose|"
        r"GetFileSize|SetFilePointer|DeleteFile[AW]?|CopyFile[AW]?|MoveFile[AW]?|"
        r"GetCurrentDirectory[AW]?|SetCurrentDirectory[AW]?|"
        r"CreateDirectory[AW]?|RemoveDirectory[AW]?|GetFileAttributes[AW]?"
        r")\b|"
        r'"[^"]*\\\\[^"]*\.(bin|tga|dat|sav|cfg|ini|txt|lst|pak)"'
    )),
    ("items_weapons", re.compile(
        r'"(EWT_|EWC_|cWeapon|cItem|cArmor|Weapon3D|ItemType)'
    )),
    ("game_world", re.compile(
        r'"(Campaign|Difficulty|Bronze|Silver|Gold|Platinum|Niob|'
        r'World|Banner|Multiplayer|Player|Hero|Skill|Quest|Spell|Magic|Monster|NPC)'
    )),
    ("ui_win32", re.compile(
        r"\b("
        r"MessageBox[AW]?|CreateWindow[Ex]*[AW]?|DestroyWindow|ShowWindow|UpdateWindow|"
        r"SendMessage[AW]?|PostMessage[AW]?|DispatchMessage[AW]?|GetMessage[AW]?|PeekMessage[AW]?|"
        r"EnableWindow|SetWindowText[AW]?|GetWindowText[AW]?|SetWindowLong[AW]?|GetWindowLong[AW]?|"
        r"DialogBox[A-Za-z]*[AW]?|EndDialog|GetDlgItem|SetDlgItemText[AW]?|"
        r"LoadIcon[AW]?|LoadCursor[AW]?|LoadBitmap[AW]?|RegisterClass[Ex]*[AW]?"
        r")\b"
    )),
    ("threading", re.compile(
        r"\b("
        r"CreateThread|ExitThread|WaitForSingleObject|WaitForMultipleObjects|"
        r"CreateMutex[AW]?|ReleaseMutex|CreateEvent[AW]?|SetEvent|ResetEvent|"
        r"EnterCriticalSection|LeaveCriticalSection|InitializeCriticalSection|DeleteCriticalSection|"
        r"InterlockedIncrement|InterlockedDecrement|InterlockedExchange|InterlockedCompareExchange|"
        r"Sleep|GetCurrentThreadId|TlsAlloc|TlsGetValue|TlsSetValue"
        r")\b"
    )),
    ("memory", re.compile(
        r"\b("
        r"HeapAlloc|HeapFree|HeapCreate|HeapDestroy|HeapReAlloc|"
        r"VirtualAlloc|VirtualFree|VirtualProtect|"
        r"GlobalAlloc|GlobalFree|GlobalLock|GlobalUnlock|LocalAlloc|LocalFree|"
        r"malloc|calloc|realloc|free"
        r")\b"
    )),
    ("debug_log", re.compile(
        r"\b(OutputDebugString[AW]?|DbgPrint|_RPT[FN]?|_CrtDbg[A-Za-z]*)\b|"
        r'"[^"]*(\\n|error|failed|detected|warning|assert)[^"]*"',
        re.IGNORECASE,
    )),
    ("crypto_hash", re.compile(
        r"\b(Crypt[A-Za-z]+|MD5|SHA1|SHA256|AES|DES|RC4|BCryptGenRandom)\b"
    )),
    ("time", re.compile(
        r"\b("
        r"GetLocalTime|GetSystemTime|SystemTimeToFileTime|GetTickCount|"
        r"QueryPerformanceCounter|QueryPerformanceFrequency|"
        r"timeGetTime|GetTimeZoneInformation"
        r")\b"
    )),
]

SIG_KEYWORDS_STRIP = {
    "__stdcall", "__cdecl", "__thiscall", "__fastcall",
    "__userpurge", "__usercall", "__noreturn", "__hidden",
    "static", "inline", "virtual", "const", "volatile",
    "signed", "unsigned", "struct", "class", "enum",
    "void", "int", "char", "short", "long", "float", "double",
    "bool", "BOOL", "DWORD", "WORD", "BYTE", "HRESULT", "HANDLE",
    "HWND", "UINT", "LPVOID", "LPCSTR", "LPSTR",
    "_DWORD", "_WORD", "_BYTE", "_QWORD", "_UNKNOWN",
}
CONTROL_KEYWORDS = {"if", "for", "while", "switch", "return", "sizeof", "do"}


def find_sections(lines: list[str]) -> tuple[tuple[int, int], tuple[int, int], int]:
    """Return ((decl_start, decl_end), (data_start, data_end), functions_start).

    All indices are 0-based. Ranges are half-open [start, end).
    """
    decl_header = None
    data_header = None
    for i, line in enumerate(lines):
        s = line.strip()
        if s == "// Function declarations" and decl_header is None:
            decl_header = i - 1
        elif s == "// Data declarations" and data_header is None:
            data_header = i - 1
        if data_header is not None:
            break

    if decl_header is None or data_header is None:
        raise SystemExit("Could not locate 'Function declarations' / 'Data declarations' headers")

    fn_start = None
    for i in range(data_header, len(lines)):
        if MARKER_RE.match(lines[i]):
            fn_start = i
            break
    if fn_start is None:
        raise SystemExit("Could not locate first function marker")

    return (decl_header, data_header), (data_header, fn_start), fn_start


def parse_functions(lines: list[str], fn_start: int) -> list[dict]:
    markers: list[tuple[int, str]] = []
    for i in range(fn_start, len(lines)):
        m = MARKER_RE.match(lines[i])
        if m:
            markers.append((i, m.group(1)))

    functions: list[dict] = []
    for idx, (start, addr) in enumerate(markers):
        end = markers[idx + 1][0] if idx + 1 < len(markers) else len(lines)
        signature = ""
        for j in range(start + 1, min(start + 8, end)):
            t = lines[j].strip()
            if t and not t.startswith("//"):
                signature = t
                break
        functions.append({
            "addr": addr,
            "start": start,
            "end": end,
            "signature": signature,
        })
    return functions


def extract_name(signature: str, addr: str) -> tuple[str, str]:
    """Return (display_name, filesystem_safe_name)."""
    cleaned = signature
    for kw in SIG_KEYWORDS_STRIP:
        cleaned = re.sub(rf"\b{re.escape(kw)}\b", " ", cleaned)
    # Pointer/star noise: turn `*name(` into `name(`.
    cleaned = re.sub(r"[*&]+", " ", cleaned)

    chosen = None
    for m in FUNCNAME_RE.finditer(cleaned):
        ident = m.group(1)
        if ident in CONTROL_KEYWORDS:
            continue
        chosen = ident  # keep last — the token immediately before `(` is the function name
    if not chosen:
        chosen = f"sub_{addr}"
    safe = re.sub(r"[^A-Za-z0-9_]", "_", chosen).strip("_") or f"sub_{addr}"
    return chosen, safe[:80]


def classify(body: str) -> tuple[str, list[str], dict[str, int]]:
    tags: list[str] = []
    hits: dict[str, int] = {}
    for name, pat in BUCKETS:
        found = pat.findall(body)
        if found:
            tags.append(name)
            hits[name] = len(found)
    primary = tags[0] if tags else "unclassified"
    return primary, tags, hits


def main() -> int:
    input_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else WORK / "GameServer.c"
    out_dir = input_path.parent / f"{input_path.name}_split"

    if not input_path.exists():
        print(f"input not found: {input_path}", file=sys.stderr)
        return 1

    raw = input_path.read_text(encoding="latin-1", errors="replace")
    lines = raw.splitlines(keepends=True)

    decl_range, data_range, fn_start = find_sections(lines)
    functions = parse_functions(lines, fn_start)
    print(f"parsed {len(functions)} functions from {input_path.name}", file=sys.stderr)

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir()

    (out_dir / "00_declarations.c").write_text(
        "".join(lines[decl_range[0]:decl_range[1]]), encoding="latin-1"
    )
    (out_dir / "00_data.c").write_text(
        "".join(lines[data_range[0]:data_range[1]]), encoding="latin-1"
    )

    index: list[dict] = []
    bucket_counts: Counter = Counter()
    tag_counts: Counter = Counter()

    for fn in functions:
        body = "".join(lines[fn["start"]:fn["end"]])
        display_name, safe_name = extract_name(fn["signature"], fn["addr"])
        primary, tags, hits = classify(body)

        strings = []
        for m in STRING_RE.finditer(body):
            s = m.group(1)
            if 0 < len(s) <= 120:
                strings.append(s)
        # Dedupe preserving order, cap to 40.
        seen: set[str] = set()
        uniq_strings: list[str] = []
        for s in strings:
            if s not in seen:
                seen.add(s)
                uniq_strings.append(s)
            if len(uniq_strings) >= 40:
                break

        # Skip the marker + signature lines so a function's own name in its
        # declaration isn't counted as a self-call. `body_lines[0]` is the
        # marker, the signature is within the first few lines — safest to
        # drop everything up to and including the line that contains `{`.
        body_lines = lines[fn["start"]:fn["end"]]
        scan_start = 1
        for k, bl in enumerate(body_lines[1:6], start=1):
            if "{" in bl:
                scan_start = k + 1
                break
        scan_body = "".join(body_lines[scan_start:])
        calls = sorted({m.group(1) for m in SUBCALL_RE.finditer(scan_body)})

        bucket_dir = out_dir / primary
        bucket_dir.mkdir(exist_ok=True)
        file_name = f"{fn['addr']}_{safe_name}.c"
        (bucket_dir / file_name).write_text(body, encoding="latin-1")

        bucket_counts[primary] += 1
        for t in tags:
            tag_counts[t] += 1

        index.append({
            "addr": fn["addr"],
            "name": display_name,
            "bucket": primary,
            "tags": tags,
            "hits": hits,
            "path": f"{primary}/{file_name}",
            "start_line": fn["start"] + 1,
            "end_line": fn["end"],
            "line_count": fn["end"] - fn["start"],
            "signature": fn["signature"],
            "strings": uniq_strings,
            "calls": calls,
            "called_by": [],
        })

    # Reverse call graph. Call sites reference functions by their display
    # name (e.g. `sub_401000`), which matches `entry["name"]` — NOT the
    # zero-padded `entry["addr"]`.
    by_name: dict[str, dict] = {entry["name"]: entry for entry in index}
    for entry in index:
        for callee in entry["calls"]:
            target = by_name.get(callee)
            if target is not None and target is not entry:
                target["called_by"].append(entry["name"])
    for entry in index:
        entry["called_by"] = sorted(set(entry["called_by"]))

    (out_dir / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")

    summary = [
        f"# {input_path.name} split summary",
        "",
        f"Source: `{input_path.name}`  ({len(lines)} lines, {len(functions)} functions)",
        f"Declarations: lines {decl_range[0] + 1}–{decl_range[1]}  (`00_declarations.c`)",
        f"Data:         lines {data_range[0] + 1}–{data_range[1]}  (`00_data.c`)",
        f"Functions:    lines {fn_start + 1}–{len(lines)}",
        "",
        "## Primary bucket counts",
        "",
        "| bucket | functions |",
        "|--------|-----------|",
    ]
    for bucket, count in bucket_counts.most_common():
        summary.append(f"| `{bucket}` | {count} |")
    summary += [
        "",
        "## Tag frequency (a function can carry multiple tags)",
        "",
        "| tag | functions |",
        "|-----|-----------|",
    ]
    for tag, count in tag_counts.most_common():
        summary.append(f"| `{tag}` | {count} |")
    summary += [
        "",
        "## index.json schema",
        "",
        "Each entry:",
        "```json",
        "{",
        '  "addr": "00401000",',
        '  "name": "sub_401000",',
        '  "bucket": "network",',
        '  "tags": ["network", "memory"],',
        '  "hits": {"network": 3, "memory": 1},',
        '  "path": "network/00401000_sub_401000.c",',
        '  "start_line": 11904, "end_line": 11927, "line_count": 23,',
        '  "signature": "int __stdcall sub_401000(...)",',
        '  "strings": ["..."],',
        '  "calls": ["sub_402050", "sub_404470"],',
        '  "called_by": ["sub_4100AA"]',
        "}",
        "```",
        "",
        "## Querying tips",
        "",
        "- Find all network entry points: `jq '.[] | select(.bucket==\"network\") | .name' index.json`",
        "- Find functions that call a given sub: grep `called_by` in `index.json`.",
        "- Seed renames from `strings`: any function whose strings point at a class name (e.g. `cWeapon3D::foo`) is a rename candidate.",
    ]
    (out_dir / "SUMMARY.md").write_text("\n".join(summary) + "\n", encoding="utf-8")

    print(f"wrote split to {out_dir}")
    for bucket, count in bucket_counts.most_common():
        print(f"  {bucket:20s} {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())