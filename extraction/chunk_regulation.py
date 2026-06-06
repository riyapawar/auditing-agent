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


def chunk_text(raw_text: str, standard: str = None) -> list[RegulationChunk]:
    """
    Split regulatory text into section-level chunks.
    Detects section numbers and uses them as chunk boundaries.
    """
    if standard is None:
        standard = _detect_standard(raw_text)

    # Choose the right pattern
    if standard in ("ASC 606", "ASC 842"):
        pattern = ASC_SECTION_RE
    elif standard in ("IFRS 15", "IFRS 17"):
        pattern = IFRS_SECTION_RE
    elif standard == "2 CFR Part 200":
        pattern = CFR_SECTION_RE
    else:
        pattern = ASC_SECTION_RE  # default fallback

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


def chunk_pdf(pdf_path: str, standard: str = None) -> list[RegulationChunk]:
    try:
        import pdfplumber
    except ImportError:
        raise ImportError("Install pdfplumber: pip install pdfplumber")

    with pdfplumber.open(pdf_path) as pdf:
        pages = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    full_text = '\n'.join(pages)
    return chunk_text(full_text, standard)


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
