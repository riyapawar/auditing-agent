# Auditing Agent

**Turning a written accounting standard into executable, reviewable audit rules — with a provenance chain from the source paragraph to the pass/fail verdict.**

An auditor testing transactions against ASC 606 works from prose. The standard
says what must be true; turning that into something you can run over a ledger is
manual, slow, and — critically — hard to defend six months later when a reviewer
asks *why* a transaction was flagged.

This pipeline extracts candidate rules from the regulation, holds them in a queue
where a human approves or rejects each one, executes the approved set over
transactions, and writes an append-only log of every evaluation.

**Read the honest scorecard before the architecture:** the plumbing works and the
extraction quality does not yet. 426 chunks of ASC 606 produced 656 candidate
rules, of which **exactly one asserts something substantive**. See
[What is actually wrong with it](#what-is-actually-wrong-with-it).

---

## The pipeline

```
ASC 606 text
    │  chunk_regulation.py            426 chunks
    ▼
GraphRAG extraction                   stages 1-5 → 1,696 entities, 2,493 relations
    │
    ▼
stage6_rule_classifier.py             656 candidate rules
    │  each carries kg_source / kg_relation / kg_target + confidence
    ▼
backfill_provenance.py                source_text, section, quality grade
    │
    ▼
human review queue                    pending_review → approved | rejected
    │  logic_hash pins what the reviewer approved
    ▼
AuditExecutor                         topological order over depends_on
    │
    ├─► append-only audit log (NDJSON)
    └─► React Flow trace per transaction
```

## What a rule is

Rules are data, not code, so they are reviewable by someone who does not read
TypeScript:

```jsonc
{
  "id": "ASC606-R-0011",
  "standard": "ASC 606",
  "section": "10.11.30",
  "section_title": "Application of royalty exception",
  "source_text": "10.11.30 Application of royalty exception  Excerpt from ASC 606-10 …",
  "text_unit_ids": ["ASC606-10_11_30-2"],
  "condition":  { "type": "field", "field": "transaction_type", "operator": "eq",
                  "value": "license_functional_ip" },
  "assertion":  { "type": "exists", "field": "revenue_recognized",
                  "message": "…shown to the reviewer on violation…" },
  "quality": "presence_only",
  "depends_on": ["ASC606-R-0004"],
  "logic_hash": "…", "content_hash": "…",
  "kg_source": "…", "kg_relation": "…", "kg_target": "…",
  "classifier_confidence": 0.82
}
```

The condition DSL supports `and` / `or` / `not` nesting over field predicates
(`eq`, `gt`, `in`, `matches`, `exists`, …), so a rule expresses *when it applies*
separately from *what must hold*. A rule that does not apply to a transaction is
recorded as not-applicable rather than as a pass — different facts, and
conflating them is how an audit overstates its own coverage.

## What is actually wrong with it

Running `backfill_provenance.py` grades every rule by what it can test:

| grade | meaning | count |
| :-- | :-- | --: |
| `testable` | compares against a value, range, or set | **1** |
| `presence_only` | checks a field exists, with no value | 606 |
| `tautological` | asserts existence of the same field its condition requires — **cannot fail** | 49 |

One rule out of 656 tests anything substantive. 49 are logically incapable of
failing, and one of those is among the nine currently approved.

So the interesting number here is not "9 approved" but "1 testable". The
knowledge graph is fine — 1,696 entities and 2,493 relations extracted cleanly,
and every rule traces to a real paragraph. The failure is at stage 6: the
classifier is asked to turn a KG edge like `INTERMEDIARY --applies_to-->
PRINCIPAL VERSUS AGENT GUIDANCE` into a testable assertion, and a topical
relation between two concepts frequently does not contain one. Rather than say
so, the model emits a well-formed rule whose assertion is `exists(some_field)`.

The acceptance gate lets those through:

```python
if confidence < min_confidence and not (has_condition and has_assertion):
    continue     # skips only if BOTH low-confidence AND structurally empty
```

A low-confidence rule with a structurally present but vacuous assertion passes.
That is the leak, and it is why the queue has 647 pending items that a reviewer
cannot triage by eye.

### Two bugs found and fixed along the way

**`source_text` was empty on all 656 rules.** The classifier loads the
regulatory paragraph, substitutes it into its prompt, and then wrote
`"source_text": ""` into the rule — the text was fetched and discarded. A rule
that cannot be traced to a paragraph is precisely the artifact this project
exists to not produce. `backfill_provenance.py` restores it for 655/656 from the
GraphRAG artifacts already on disk, and `stage6_rule_classifier.py` now keeps it.

**`section` was empty on 80%.** It was guessed from whether a KG entity name
happened to contain a digit. Every one of the 426 text units begins with its own
section number, so it is now read off the document — a citation rather than an
inference.

## Design decisions worth defending

**The audit log is append-only.** Entries are never modified or deleted, keyed by
`(runId, txId, ruleId)`. Re-running writes a new entry rather than overwriting,
so the log answers "what did we conclude, and when" rather than only "what do we
currently think".

**Two hashes, not one.** `content_hash` covers everything, for tamper detection.
`logic_hash` covers only what a reviewer signs off on — description, applies_to,
depends_on, condition, assertion. Adding a citation is new evidence *about* a
rule, not a change to what it asserts. Hashing them together meant backfilling
provenance invalidated all nine approvals at once, which pushes reviewers toward
bulk re-approval — the opposite of the point.

**Dependencies form a DAG, executed in topological order** (Kahn's algorithm,
explicit cycle detection). A rule whose dependency was violated is recorded as
*skipped with a reason*, not run against a transaction that already failed a
precondition.

**Rules are versioned against the standard.** ASC 606 has amendments; a rule
records the version it came from so a 2016 transaction is not tested against a
2020 amendment.

**Extraction confidence is surfaced, not thresholded away.** The classifier's
confidence rides into the review queue so a human sets the cut.

## Fixing the extraction — the actual roadmap

In rough order of expected value:

1. **Filter on relation semantics, not just relation type.** `applies_to` is in
   `ASSERTABLE_RELATIONS`, but "X applies to Y" is topical scope, not an
   assertion. Restricting to `recognized_when`, `deferred_until`, `prohibits`,
   and `constrained_by` should cut the candidate set by most of its volume and
   raise the hit rate.
2. **Reject vacuous assertions at extraction time.** The grading logic in
   `backfill_provenance.py:grade()` runs post-hoc; it belongs in the acceptance
   gate, so tautological rules are never written.
3. **Give the classifier the paragraph, not the edge.** It currently sees a
   triple plus source text and must reverse-engineer an assertion. Prompting it
   directly from the paragraph, using the KG only to locate candidate
   paragraphs, is the more natural shape.
4. **Build a labelled transaction set.** 7 sample transactions with no
   known-violating ground truth means the engine's precision and recall against
   real audit findings is unmeasured. Everything above is currently judged by
   reading rules, not by measuring outcomes.

## Layout

```
extraction/
  chunk_regulation.py        ASC 606 → 426 chunks
  run_audit_pipeline.py      wraps GraphRAG stages 1-5
  stage6_rule_classifier.py  KG edges → executable rules
  backfill_provenance.py     restores source_text/section, grades rule quality
  inspect_kg.py, show_best_rules.py, approve_rules.py
engine/     TypeScript. Rule DSL, evaluator, DAG executor, append-only log
app/        Next.js. Review queue, run history, React Flow trace viewer
chunks/asc606/   426 chunks of the regulation
data/       rules.json, sample transactions, run logs (NDJSON)
```

## Running it

```bash
# 1. extract (needs the graphmert repo on PYTHONPATH and OPENAI_API_KEY)
cd extraction && pip install -r requirements.txt
python run_audit_pipeline.py \
  --input_dir ../chunks/asc606 --output_dir ../output/asc606 \
  --standard "ASC 606" --pipeline all

# 2. restore provenance and grade rule quality
python backfill_provenance.py --rules ../data/rules.json \
  --artifacts ../output/asc606/artifacts \
  --export-redacted ../data/rules.public.json   # --dry-run to preview

# 3. build the engine, then run the rules over the sample transactions
cd ../engine && npm install && npm run build
cd .. && node validate.mjs

# 4. review queue and trace viewer
cd app && npm install && npm run dev
```

Nothing in `engine/` or `app/` calls a model. Once rules exist, evaluation is
deterministic — which is the property that makes a run reproducible and a
verdict defensible.

## On the regulation text

`chunks/` is FASB ASC 606 and KPMG handbook material — copyrighted, so it is not
redistributed here, and `data/rules.json` is excluded for the same reason: since
provenance was restored, each rule carries up to 2,000 characters of that text in
`source_text`.

`data/rules.public.json` **is** committed. It is the same 656 rules with
`source_text` replaced by a `source_citation` (`ASC 606 §10.11.30 Application of
royalty exception`) — enough to locate the paragraph in your own copy of the
standard, not enough to reproduce it. That keeps the rule set, the quality
grades, and the KG provenance inspectable without republishing the source.

## Limits

- One standard (ASC 606). Nothing is hard-coded to it; nothing else has been
  tried.
- 7 sample transactions, illustrative rather than a test corpus. There is no
  labelled set of known-violating transactions, so precision and recall against
  real audit findings are unmeasured. The current evidence is only that the
  engine executes what it was told to, traceably.
- `classifier_confidence` is uncalibrated. Treat it as an ordering, not a
  probability.
- 1 rule of 656 is substantively testable. The architecture is ahead of the
  extraction, and the roadmap above is the honest gap.
