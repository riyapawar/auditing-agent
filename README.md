# Auditing Agent

**Turning a written accounting standard into executable, reviewable audit rules — with a provenance chain from the source paragraph to the pass/fail verdict.**

An auditor testing transactions against ASC 606 works from prose. The standard
says what must be true; turning that into something you can run over a ledger is
manual, slow, and — critically — hard to defend six months later when a reviewer
asks *why* a transaction was flagged.

This pipeline extracts candidate rules from the regulation text, holds them in a
queue where a human approves or rejects each one, executes the approved set over
transactions, and writes an append-only log of every evaluation. Each rule keeps
a pointer back to the paragraph and the knowledge-graph edge it came from.

**Current state:** 426 chunks of ASC 606 processed into **656 candidate rules**,
9 approved, 647 awaiting review. That ratio is the point, not a shortcoming —
see [Why almost nothing is approved](#why-almost-nothing-is-approved).

---

## The pipeline

```
ASC 606 text
    │  chunk_regulation.py            426 chunks
    ▼
GraphMERT / GraphRAG extraction       stages 1-5
    │  entities and relations → knowledge graph
    ▼
stage6_rule_classifier.py             656 candidate rules
    │  each carries kg_source / kg_relation / kg_target + confidence
    ▼
human review queue                    pending_review → approved | rejected
    │  content_hash (SHA-256) pins the reviewed content
    ▼
AuditExecutor                         topological order over depends_on
    │
    ├─► append-only audit log (NDJSON)
    └─► React Flow trace per transaction
```

## What each rule is

Rules are data, not code, which is what makes them reviewable by someone who
does not read TypeScript:

```jsonc
{
  "id": "ASC606-R-0001",
  "standard": "ASC 606",
  "section": "606-10-25-1",
  "source_text": "…the original regulatory paragraph…",
  "condition": { "type": "field", "field": "transaction_type", "operator": "exists" },
  "assertion": { "type": "exists", "field": "performance_obligation",
                 "message": "…shown to the reviewer on violation…" },
  "depends_on": ["ASC606-R-0004"],
  "content_hash": "…SHA-256…",
  "kg_source": "…", "kg_relation": "…", "kg_target": "…",
  "classifier_confidence": 0.82
}
```

The condition DSL supports `and` / `or` / `not` nesting over field predicates
(`eq`, `gt`, `in`, `matches`, `exists`, …), so a rule expresses *when it
applies* separately from *what must hold*. A rule that does not apply to a
transaction is recorded as not-applicable rather than as a pass — those are
different facts, and conflating them is how an audit ends up overstating its
own coverage.

## Design decisions worth defending

**The audit log is append-only.** Entries are never modified or deleted, and
each is keyed by `(runId, txId, ruleId)`. Re-running a rule writes a new entry
rather than overwriting the old one, so the log answers "what did we conclude,
and when" rather than just "what do we currently think".

**Rules carry a content hash.** A reviewer approves a specific rule body. If the
extraction is re-run and the text shifts, the SHA-256 changes and the approval
no longer covers it. Without this, a re-extraction could silently promote
unreviewed content into an approved rule set.

**Dependencies form a DAG, executed in topological order** (Kahn's algorithm,
with explicit cycle detection). When a rule's dependency is violated, the
dependent rule is recorded as *skipped with a reason* rather than run against a
transaction that already failed a precondition.

**Rules are versioned against the standard.** ASC 606 has amendments, so a rule
records the version it was derived from and transactions are matched
temporally — a 2016 transaction should not be tested against a 2020 amendment.

**Extraction confidence is surfaced, not thresholded away.** The classifier's
confidence rides along with each rule into the review queue, so a human decides
where the cut is instead of a hard-coded number deciding silently.

## Why almost nothing is approved

9 of 656. Read that as the system working rather than failing.

The extractor is deliberately permissive: recall matters more than precision
when a human is the filter, because a rule that was never proposed cannot be
reviewed, while a bad proposal costs one click. Many candidates are also
genuinely not testable — a paragraph defining a term produces a well-formed rule
object whose assertion asserts nothing useful, and the honest disposition is
reject.

Any version of this that auto-approved 656 rules and reported full ASC 606
coverage would be worse, and would look better.

## Layout

```
extraction/     Python. Chunking, GraphRAG stages 1-5, rule classifier (stage 6)
engine/         TypeScript. Rule DSL, evaluator, DAG executor, append-only log
app/            Next.js. Review queue, run history, React Flow trace viewer
chunks/asc606/  426 chunks of the regulation
data/           rules.json, sample transactions, run logs (NDJSON)
```

## Running it

```bash
# 1. extract rules from the regulation (needs the graphmert repo on PYTHONPATH)
cd extraction
pip install -r requirements.txt
python run_audit_pipeline.py \
  --input_dir ../chunks/asc606 --output_dir ../output/asc606 \
  --standard "ASC 606" --pipeline all

# 2. build the engine
cd ../engine && npm install && npm run build

# 3. review queue and trace viewer
cd ../app && npm install && npm run dev
```

Set `OPENAI_API_KEY` for the extraction stages; see `.env.example`. Nothing in
`engine/` or `app/` calls a model — once rules exist, evaluation is
deterministic, which is the property that makes a run reproducible.

## Limits

- Rules are extracted from one standard (ASC 606). Nothing is hard-coded to it,
  but nothing else has been tried either.
- The 7 sample transactions are illustrative, not a test corpus. There is no
  labelled set of known-violating transactions, so the engine's precision and
  recall against real audit findings is unmeasured — the current evidence is
  that it executes what it was told to, traceably.
- The classifier's confidence is not calibrated; treat it as an ordering, not a
  probability.
