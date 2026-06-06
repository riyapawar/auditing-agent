"""
stage6_rule_classifier.py

Stage 6 of the audit pipeline: takes the final_entities and final_relationships
parquet files from GraphRAG (stages 1-5) and runs a second LLM pass to classify
which relationships encode testable assertions, producing an executable rule
in the Rule DSL format consumed by the TypeScript execution engine.

This is the key differentiator: descriptive KG edges become executable audit rules
with conditions, assertions, and field mappings — validated by a human auditor
before they run against real transaction data.

Usage (standalone):
    python stage6_rule_classifier.py \\
        --entities ./output/asc606/artifacts/final_entities.parquet \\
        --relationships ./output/asc606/artifacts/final_relationships.parquet \\
        --standard "ASC 606" \\
        --output ./output/asc606/extracted_rules.json \\
        --model_path /path/to/model

Or call classify_rules() directly from run_audit_pipeline.py.
"""

import json
import hashlib
import argparse
import logging
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Relation types that can encode testable assertions
ASSERTABLE_RELATIONS = {
    "recognized_when",
    "deferred_until",
    "prohibits",
    "constrained_by",
    "requires",
    "applies_to",
}

# Template for the rule DSL — mirrors engine/src/types.ts AuditRule
RULE_TEMPLATE = {
    "id": "",
    "standard": "",
    "section": "",
    "version": "latest",
    "description": "",
    "source_text": "",
    "applies_to": [],
    "depends_on": [],
    "condition": {},
    "assertion": {},
    "status": "pending_review",
    "approved_by": None,
    "approved_at": None,
    "content_hash": "",
}

CLASSIFICATION_PROMPT = """You are an expert in US GAAP and financial statement auditing.
You will be given a relationship extracted from an accounting regulation knowledge graph
and the source text it came from.

Your task: determine whether this relationship encodes a TESTABLE ASSERTION — a rule
that can be evaluated against a financial transaction to find violations.

A testable assertion has:
1. A CONDITION: when does this rule apply? (transaction type, field values, etc.)
2. AN ASSERTION: what must be true when the condition is met?
3. FIELD MAPPING: which specific fields on a transaction record does it check?

Common field names in financial transaction records:
- transaction_type (e.g. "subscription_revenue", "milestone_payment", "license")
- revenue_recognized (decimal amount)
- performance_obligation_satisfied (boolean)
- delivery_status ("pending", "partial", "complete")
- variable_consideration_included (decimal amount)
- probable_significant_reversal (boolean)
- contract_modification (boolean)
- standalone_selling_price (decimal)
- transaction_price (decimal)
- allocated_amount (decimal)

Respond ONLY with a JSON object in this exact schema:
{
  "is_testable": true/false,
  "confidence": 0.0-1.0,
  "description": "one sentence describing the rule in plain English",
  "applies_to": ["transaction_type1", "transaction_type2"],
  "condition": {
    "type": "field" | "and" | "or" | "not",
    "field": "field_name",          // for type="field"
    "operator": "eq|neq|gt|gte|lt|lte|in|not_in|exists|not_exists",
    "value": <value>,               // for type="field"
    "conditions": [...]             // for type="and" or "or"
    "condition": {...}              // for type="not"
  },
  "assertion": {
    "type": "equals" | "range" | "exists" | "not_exists" | "in",
    "field": "field_name",
    "value": <value>,               // for type="equals"
    "min": <number>,                // for type="range"
    "max": <number>,                // for type="range"
    "values": [...],                // for type="in"
    "message": "human-readable violation description"
  },
  "reasoning": "brief explanation of why this is or isn't testable"
}

If is_testable is false, still fill in the other fields as best you can but set confidence low.

Relationship to classify:
  Source: {source}
  Relation: {relation}
  Target: {target}
  Description: {description}

Source text (the regulatory paragraph this came from):
{source_text}
"""


def _load_source_text(chunk_id: str, chunks_dir: Optional[str] = None) -> str:
    """Attempt to load the original regulatory text for a text_unit_id."""
    if not chunks_dir:
        return ""
    chunk_file = Path(chunks_dir) / f"{chunk_id}.txt"
    if chunk_file.exists():
        return chunk_file.read_text(encoding="utf-8")[:1500]
    return ""


def _hash_rule(rule: dict) -> str:
    content = json.dumps({
        k: v for k, v in rule.items()
        if k not in ("id", "content_hash", "status", "approved_by", "approved_at")
    }, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def _call_llm_batch(prompts: list[str], model_path: str) -> list[str]:
    """Run batch LLM inference via vLLM (same pattern as GraphMERT extract_kg.py)."""
    try:
        from vllm import LLM, SamplingParams
    except ImportError:
        raise ImportError("vLLM not installed. Run: pip install vllm")

    llm = LLM(model=model_path, trust_remote_code=True, max_model_len=8192)
    sampling_params = SamplingParams(temperature=0.1, top_p=0.9, max_tokens=1024)

    conversations = [[{"role": "user", "content": p}] for p in prompts]
    outputs = llm.chat(conversations, sampling_params)
    return [o.outputs[0].text for o in outputs]


def _call_openai_batch(prompts: list[str]) -> list[str]:
    """Fallback: use OpenAI API if vLLM not available."""
    from openai import OpenAI
    client = OpenAI()
    results = []
    for prompt in prompts:
        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        results.append(response.choices[0].message.content or "")
    return results


def _parse_llm_json(response: str) -> Optional[dict]:
    """Extract JSON from LLM response, handling markdown code blocks."""
    response = response.strip()
    if response.startswith("```"):
        lines = response.split("\n")
        response = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        # Try to find JSON object in the response
        import re
        match = re.search(r'\{.*\}', response, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return None


def classify_rules(
    entities_path: str,
    relationships_path: str,
    standard: str,
    output_path: str,
    model_path: Optional[str] = None,
    chunks_dir: Optional[str] = None,
    min_confidence: float = 0.6,
) -> list[dict]:
    """
    Main entry point. Reads the KG parquet files, classifies relationships
    into executable rules, and writes the rule DSL JSON.
    """
    entities_df = pd.read_parquet(entities_path) if Path(entities_path).exists() else pd.DataFrame()
    relationships_df = pd.read_parquet(relationships_path)

    # Build entity lookup for source text retrieval
    entity_text_units = {}
    if not entities_df.empty and "title" in entities_df.columns:
        for _, row in entities_df.iterrows():
            if "text_unit_ids" in row and row["text_unit_ids"] is not None:
                ids = row["text_unit_ids"] if isinstance(row["text_unit_ids"], list) else [row["text_unit_ids"]]
                entity_text_units[str(row["title"]).upper()] = ids

    # Filter to relationships worth classifying
    assertable_rels = relationships_df[
        relationships_df["description"].apply(
            lambda d: bool(set(d if isinstance(d, list) else [d]) & ASSERTABLE_RELATIONS)
        )
    ].copy()

    logger.info(f"Found {len(assertable_rels)} assertable relationships out of {len(relationships_df)} total")

    if assertable_rels.empty:
        logger.warning("No assertable relationships found. KG may need re-extraction.")
        return []

    # Build prompts
    prompts = []
    for _, row in assertable_rels.iterrows():
        desc = row["description"]
        if isinstance(desc, list):
            desc = ", ".join(desc)
        source_text = _load_source_text(
            entity_text_units.get(str(row["source"]).upper(), [""])[0],
            chunks_dir
        )
        prompt = CLASSIFICATION_PROMPT.format(
            source=row["source"],
            relation=desc,
            target=row["target"],
            description=desc,
            source_text=source_text or "(source text not available)",
        )
        prompts.append(prompt)

    # Run LLM
    logger.info(f"Classifying {len(prompts)} relationships...")
    if model_path:
        responses = _call_llm_batch(prompts, model_path)
    else:
        logger.info("No model_path provided — using OpenAI API fallback")
        responses = _call_openai_batch(prompts)

    # Parse and build rules
    rules = []
    rule_counter = 0
    for (_, row), response in zip(assertable_rels.iterrows(), responses):
        parsed = _parse_llm_json(response)
        if not parsed:
            logger.warning(f"Failed to parse LLM response for {row['source']} -> {row['target']}")
            continue

        if not parsed.get("is_testable") or parsed.get("confidence", 0) < min_confidence:
            logger.debug(f"Skipping non-testable: {row['source']} -> {row['target']}")
            continue

        # Extract section from source entity if it looks like a section ID
        section = ""
        source_upper = str(row["source"]).upper()
        if any(c.isdigit() for c in source_upper):
            section = str(row["source"])
        elif any(c.isdigit() for c in str(row["target"]).upper()):
            section = str(row["target"])

        rule_counter += 1
        rule = {
            **RULE_TEMPLATE,
            "id": f"{standard.replace(' ', '').upper()}-R-{rule_counter:04d}",
            "standard": standard,
            "section": section,
            "description": parsed.get("description", f"{row['source']} {row['description']} {row['target']}"),
            "source_text": "",
            "applies_to": parsed.get("applies_to", []),
            "depends_on": [],
            "condition": parsed.get("condition", {}),
            "assertion": parsed.get("assertion", {}),
            "status": "pending_review",
            "kg_source": str(row["source"]),
            "kg_relation": str(row["description"]),
            "kg_target": str(row["target"]),
            "classifier_confidence": parsed.get("confidence", 0),
            "classifier_reasoning": parsed.get("reasoning", ""),
        }
        rule["content_hash"] = _hash_rule(rule)
        rules.append(rule)

    logger.info(f"Produced {len(rules)} executable rules (pending human review)")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(rules, indent=2), encoding="utf-8")
    return rules


def main():
    parser = argparse.ArgumentParser(description="Stage 6: KG relationships → executable audit rules")
    parser.add_argument("--entities", required=True)
    parser.add_argument("--relationships", required=True)
    parser.add_argument("--standard", required=True, help="e.g. 'ASC 606'")
    parser.add_argument("--output", required=True, help="Path to write extracted_rules.json")
    parser.add_argument("--model_path", default=None, help="Path to local vLLM model; uses Anthropic API if omitted")
    parser.add_argument("--chunks_dir", default=None, help="Directory of chunked .txt files for source text lookup")
    parser.add_argument("--min_confidence", type=float, default=0.6)
    args = parser.parse_args()

    rules = classify_rules(
        entities_path=args.entities,
        relationships_path=args.relationships,
        standard=args.standard,
        output_path=args.output,
        model_path=args.model_path,
        chunks_dir=args.chunks_dir,
        min_confidence=args.min_confidence,
    )
    print(f"\nDone. {len(rules)} rules written to {args.output}")
    print("Next: load these into the rule review UI to approve before running against ledger data.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
