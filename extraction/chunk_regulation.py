"""
chunk_regulation.py

Section-aware chunker for regulatory documents (PDF or plain text).
Produces chunks keyed by section number so text_unit_ids in the KG
map back to specific paragraphs of the regulation, not arbitrary windows.

Usage:
    python chunk_regulation.py --input asc606.pdf --output ./chunks/asc606 --format json
    python chunk_regulation.py --input asc606.txt --output ./chunks/asc606 --format jsonl
"""

import re
import json
import argparse
from pathlib import Path
from dataclasses import dataclass, asdict


@dataclass
class RegulationChunk:
    id: str           # e.g. "ASC606-606-10-25-1"
    section: str      # e.g. "606-10-25-1"
    standard: str     # e.g. "ASC 606"
    title: str        # section heading if present, else empty
    text: str         # full text of the section
    parent: str       # parent section, e.g. "606-10-25"
    depth: int        # nesting depth: 0=topic, 1=subtopic, 2=section, 3=paragraph


# Matches ASC-style section numbers: 606-10-25-1, 840-20, 230-10-45-28A, etc.
ASC_SECTION_RE = re.compile(
    r'^(\d{3}-\d{2}(?:-\d{2,3}[A-Z]?(?:-\d{1,3}[A-Z]?)?)?)(?:\s+(.+))?$',
    re.MULTILINE
)

# Matches IFRS-style: "IFRS 15.31", "IAS 17.20", "IFRS 15.B34"
IFRS_SECTION_RE = re.compile(
    r'^((?:IFRS|IAS)\s+\d+\.(?:[A-Z]?\d+[A-Z]?))(?:\s+(.+))?$',
    re.MULTILINE
)

# 2 CFR Part 200 style: "§ 200.405", "200.405(a)"
CFR_SECTION_RE = re.compile(
    r'^(§?\s*\d+\.\d+(?:\([a-z]\))*)(?:\s+(.+))?$',
    re.MULTILINE
)

# Big 4 guide style: "3.1 Overview", "3.2.10 How to assess collectibility"
# Requires a decimal (so bare numbers like "1" or "606" don't match)
BIG4_SECTION_RE = re.compile(
    r'^(\d{1,2}\.\d{1,3}(?:\.\d{1,3})?)\.?\s{1,4}([A-Z][^\n]{2,80})$',
    re.MULTILINE
)


def _detect_standard(text: str) -> str:
    if re.search(r'\b606-10\b', text):
        return "ASC 606"
    if re.search(r'\b842-\d{2}\b', text):
        return "ASC 842"
    if re.search(r'\bIFRS\s+15\b', text, re.IGNORECASE):
        return "IFRS 15"
    if re.search(r'\b200\.\d{3}\b', text):
        return "2 CFR Part 200"
    return "Unknown"


def _section_depth(section_id: str) -> int:
    """Infer nesting depth from number of '-' separated parts."""
    parts = section_id.replace('§', '').strip().split('-')
    return min(len(parts) - 1, 3)


def _parent_section(section_id: str) -> str:
    parts = section_id.split('-')
    return '-'.join(parts[:-1]) if len(parts) > 1 else ''


def _detect_pattern(raw_text: str, standard: str):
    """Pick and validate the best regex pattern for this document."""
    candidates = {
        "asc": ASC_SECTION_RE,
        "big4": BIG4_SECTION_RE,
        "ifrs": IFRS_SECTION_RE,
        "cfr": CFR_SECTION_RE,
    }
    if standard in ("IFRS 15", "IFRS 17"):
        return IFRS_SECTION_RE
    if standard == "2 CFR Part 200":
        return CFR_SECTION_RE

    # Count matches for ASC vs Big 4 style and use whichever finds more
    asc_hits = len(ASC_SECTION_RE.findall(raw_text[:50000]))
    big4_hits = len(BIG4_SECTION_RE.findall(raw_text[:50000]))

    if big4_hits > asc_hits * 2:
        return BIG4_SECTION_RE
    return ASC_SECTION_RE


def chunk_text(raw_text: str, standard: str = None) -> list[RegulationChunk]:
    """
    Split regulatory text into section-level chunks.
    Detects section numbers and uses them as chunk boundaries.
    Falls back to page-window chunking when too few sections are found.
    """
    if standard is None:
        standard = _detect_standard(raw_text)

    pattern = _detect_pattern(raw_text, standard)

    lines = raw_text.splitlines()
    chunks = []
    current_section = None
    current_title = ""
    current_lines = []

    def flush(section, title, lines, standard):
        if not section or not lines:
            return None
        text = '\n'.join(lines).strip()
        if len(text) < 20:  # skip trivially short chunks
            return None
        return RegulationChunk(
            id=f"{standard.replace(' ', '')}-{section}",
            section=section,
            standard=standard,
            title=title,
            text=text,
            parent=_parent_section(section),
            depth=_section_depth(section),
        )

    for line in lines:
        match = pattern.match(line.strip())
        if match:
            # Save previous chunk
            if current_section:
                chunk = flush(current_section, current_title, current_lines, standard)
                if chunk:
                    chunks.append(chunk)
            current_section = match.group(1).strip()
            current_title = (match.group(2) or '').strip()
            current_lines = []
        else:
            current_lines.append(line)

    # Flush final chunk
    if current_section:
        chunk = flush(current_section, current_title, current_lines, standard)
        if chunk:
            chunks.append(chunk)

    return chunks


def chunk_pdf(pdf_path: str, standard: str = None, page_window: int = 3) -> list[RegulationChunk]:
    try:
        import pdfplumber
    except ImportError:
        raise ImportError("Install pdfplumber: pip install pdfplumber")

    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [p.extract_text() or "" for p in pdf.pages]
        total_pages = len(page_texts)

    full_text = '\n'.join(page_texts)
    chunks = chunk_text(full_text, standard)

    # If section detection found fewer than 1 chunk per 10 pages, fall back to
    # sliding page windows so no content is lost
    if len(chunks) < total_pages / 10:
        print(f"Warning: only {len(chunks)} sections detected in {total_pages} pages. "
              f"Falling back to {page_window}-page window chunking.")
        chunks = _chunk_by_page_window(page_texts, standard or _detect_standard(full_text), page_window)

    return chunks


def _chunk_by_page_window(page_texts: list[str], standard: str, window: int = 3) -> list[RegulationChunk]:
    """Fallback: group pages into fixed windows when section detection fails."""
    chunks = []
    for i in range(0, len(page_texts), window):
        group = page_texts[i:i + window]
        text = '\n'.join(group).strip()
        if len(text) < 50:
            continue
        section_id = f"p{i+1}-{min(i+window, len(page_texts))}"
        chunks.append(RegulationChunk(
            id=f"{standard.replace(' ', '')}-{section_id}",
            section=section_id,
            standard=standard,
            title=f"Pages {i+1}–{min(i+window, len(page_texts))}",
            text=text,
            parent="",
            depth=1,
        ))
    return chunks


def write_graphrag_input(chunks: list[RegulationChunk], output_dir: str):
    """
    Write chunks in the format GraphRAG expects:
    a directory of .txt files, one per chunk, named by section ID.
    The GraphRAG pipeline reads from this directory.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    for chunk in chunks:
        filename = re.sub(r'[^\w\-]', '_', chunk.id) + '.txt'
        content = f"{chunk.section}"
        if chunk.title:
            content += f" {chunk.title}"
        content += f"\n\n{chunk.text}"
        (out / filename).write_text(content, encoding='utf-8')

    print(f"Wrote {len(chunks)} chunks to {output_dir}/")


def write_json(chunks: list[RegulationChunk], output_path: str):
    data = [asdict(c) for c in chunks]
    Path(output_path).write_text(json.dumps(data, indent=2), encoding='utf-8')
    print(f"Wrote {len(chunks)} chunks to {output_path}")


def write_jsonl(chunks: list[RegulationChunk], output_path: str):
    lines = [json.dumps(asdict(c)) for c in chunks]
    Path(output_path).write_text('\n'.join(lines), encoding='utf-8')
    print(f"Wrote {len(chunks)} chunks to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Section-aware regulatory document chunker")
    parser.add_argument("--input", required=True, help="Path to PDF or .txt regulatory document")
    parser.add_argument("--output", required=True, help="Output path (file for json/jsonl, dir for graphrag)")
    parser.add_argument("--format", choices=["json", "jsonl", "graphrag"], default="graphrag",
                        help="Output format. 'graphrag' writes one .txt per section for GraphRAG input.")
    parser.add_argument("--standard", default=None,
                        help="Override standard detection (e.g. 'ASC 606', 'IFRS 15', '2 CFR Part 200')")
    args = parser.parse_args()

    input_path = args.input
    if input_path.endswith('.pdf'):
        chunks = chunk_pdf(input_path, args.standard)
    else:
        raw = Path(input_path).read_text(encoding='utf-8')
        chunks = chunk_text(raw, args.standard)

    if not chunks:
        print("Warning: no sections detected. Check that the document uses standard section numbering.")
        return

    print(f"Detected standard: {chunks[0].standard}")
    print(f"Found {len(chunks)} sections (depth distribution: "
          + str({d: sum(1 for c in chunks if c.depth == d) for d in range(4)}) + ")")

    if args.format == "graphrag":
        write_graphrag_input(chunks, args.output)
    elif args.format == "json":
        write_json(chunks, args.output)
    elif args.format == "jsonl":
        write_jsonl(chunks, args.output)


if __name__ == "__main__":
    main()
