"""Restore the provenance chain on already-extracted rules, and grade them.

Two things were wrong with `data/rules.json`, and both undercut the point of the
project rather than being cosmetic.

**1. Every rule had an empty `source_text`.**  All 656 of them. The classifier
in `stage6_rule_classifier.py` loads the regulatory paragraph, substitutes it
into the LLM prompt, and then writes `"source_text": ""` into the rule it
builds -- the text is fetched and discarded. A rule you cannot trace back to a
paragraph is exactly the thing this system exists to not produce. `section` was
empty on 80% for a related reason: it was guessed from whether the KG entity
name happened to contain a digit, rather than read off the source document.

**2. Most rules assert nothing.**  58% carry a bare `exists` assertion with no
value, and a large share of those assert existence of the *same field their
condition already tests* -- a rule that cannot fail. Those inflate apparent
coverage of the standard while testing nothing, which is worse than having no
rule, because a reviewer scrolling 647 pending items cannot tell them apart
from real ones.

This script fixes both from data already on disk, so the expensive LLM
extraction does not have to be re-run:

    python extraction/backfill_provenance.py \
        --rules data/rules.json \
        --artifacts output/asc606/artifacts

On approvals: adding a citation is new *evidence about* a rule, not a change to
what the rule asserts. Destroying nine human approvals over that would be wrong,
so this introduces `logic_hash` -- a digest over only the fields a reviewer
actually signs off on (condition, assertion, applies_to, depends_on,
description). It is stable under provenance backfill. `content_hash` still
covers everything for tamper detection, and the pre-backfill value is retained
in `content_hash_before_backfill` so the change itself stays auditable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
from collections import Counter
from pathlib import Path

import pandas as pd

log = logging.getLogger("backfill")

SECTION_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\s+([^\n]{0,80})")

# Fields a human reviewer is actually approving when they approve a rule.
LOGIC_FIELDS = ("description", "applies_to", "depends_on", "condition", "assertion")


def logic_hash(rule: dict) -> str:
    payload = json.dumps({k: rule.get(k) for k in LOGIC_FIELDS}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def content_hash(rule: dict) -> str:
    payload = json.dumps(
        {
            k: v
            for k, v in rule.items()
            if k
            not in (
                "id",
                "content_hash",
                "content_hash_before_backfill",
                "logic_hash",
                "status",
                "approved_by",
                "approved_at",
            )
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


# --------------------------------------------------------------------------
# rule quality
# --------------------------------------------------------------------------

def _field_of(node: dict | None) -> str | None:
    if not isinstance(node, dict):
        return None
    return node.get("field")


def grade(rule: dict) -> str:
    """Classify what a rule is actually capable of testing.

    tautological  -- asserts existence of the very field its condition requires
                     to exist, so it passes whenever it applies and fails never.
    presence_only -- tests that a field is present or absent, with no value,
                     threshold or set membership. Sometimes legitimate ("a
                     contract must identify a performance obligation") but not
                     a substantive test of the standard.
    testable      -- compares against a value, range, or set.
    """
    a = rule.get("assertion") or {}
    c = rule.get("condition") or {}
    a_type, a_field = a.get("type"), _field_of(a)

    if a_type in ("exists", "not_exists"):
        if (
            c.get("type") == "field"
            and c.get("operator") in ("exists", "not_exists")
            and _field_of(c)
            and _field_of(c) == a_field
        ):
            return "tautological"
        return "presence_only"

    if a_type == "equals" and a.get("value") is None:
        return "presence_only"
    if a_type == "in" and not a.get("values"):
        return "presence_only"
    if a_type == "range" and a.get("min") is None and a.get("max") is None:
        return "presence_only"
    return "testable"


# --------------------------------------------------------------------------
# provenance
# --------------------------------------------------------------------------

def build_lookups(artifacts: Path):
    """Map KG relationships to the text units they were extracted from.

    `relationships.parquet` is used rather than `final_relationships.parquet`:
    the latter has nulls in `text_unit_ids`, the former does not.
    """
    rel = pd.read_parquet(artifacts / "relationships.parquet")
    tu = pd.read_parquet(artifacts / "text_units.parquet")

    text_by_id = dict(zip(tu["id"].astype(str), tu["text"].astype(str)))

    three, two = {}, {}
    for _, r in rel.iterrows():
        ids = list(r["text_unit_ids"]) if r["text_unit_ids"] is not None else []
        ids = [str(i) for i in ids]
        if not ids:
            continue
        three.setdefault((str(r["source"]), str(r["description"]), str(r["target"])), ids)
        two.setdefault((str(r["source"]), str(r["target"])), ids)
    return text_by_id, three, two


def section_of(text: str) -> tuple[str, str]:
    """Read the section number and heading off the front of a text unit.

    Every one of the 426 text units begins with its section number, so this is
    read from the document rather than inferred -- which is the difference
    between a citation and a guess.
    """
    m = SECTION_RE.match(text or "")
    if not m:
        return "", ""
    return m.group(1), m.group(2).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules", default="data/rules.json")
    ap.add_argument("--artifacts", default="output/asc606/artifacts")
    ap.add_argument("--max-source-chars", type=int, default=2000)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    rules_path = Path(args.rules)
    rules = json.loads(rules_path.read_text(encoding="utf-8"))
    text_by_id, three, two = build_lookups(Path(args.artifacts))

    stats = Counter()
    for rule in rules:
        key3 = (rule.get("kg_source"), rule.get("kg_relation"), rule.get("kg_target"))
        key2 = (rule.get("kg_source"), rule.get("kg_target"))
        ids = three.get(key3) or two.get(key2) or []
        stats["matched_exact" if key3 in three else ("matched_pair" if key2 in two else "unmatched")] += 1

        if ids:
            texts = [text_by_id.get(i, "") for i in ids if i in text_by_id]
            joined = "\n\n---\n\n".join(t for t in texts if t)
            rule["text_unit_ids"] = ids
            rule["source_text"] = joined[: args.max_source_chars]
            sec, title = section_of(texts[0] if texts else "")
            if sec:
                rule["section"] = sec
                rule["section_title"] = title
                stats["section_filled"] += 1
            if joined:
                stats["source_text_filled"] += 1

        g = grade(rule)
        rule["quality"] = g
        stats[f"quality_{g}"] += 1

        before = rule.get("content_hash", "")
        rule["logic_hash"] = logic_hash(rule)
        new = content_hash(rule)
        if new != before:
            rule["content_hash_before_backfill"] = before
            rule["content_hash"] = new
            stats["hash_changed"] += 1

    total = len(rules)
    log.info("rules: %d", total)
    for k in (
        "matched_exact", "matched_pair", "unmatched",
        "source_text_filled", "section_filled", "hash_changed",
        "quality_testable", "quality_presence_only", "quality_tautological",
    ):
        log.info("  %-22s %4d  (%.1f%%)", k, stats[k], 100 * stats[k] / total)

    approved_taut = sum(
        1 for r in rules if r.get("status") == "approved" and r["quality"] == "tautological"
    )
    if approved_taut:
        log.warning(
            "%d APPROVED rules are tautological -- they can never fail and should "
            "be revisited", approved_taut,
        )

    if args.dry_run:
        log.info("dry run: nothing written")
        return

    rules_path.write_text(json.dumps(rules, indent=2), encoding="utf-8")
    log.info("wrote %s", rules_path)


if __name__ == "__main__":
    main()
