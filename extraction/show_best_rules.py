import json
from collections import Counter

rules = json.load(open(r'c:\Users\riyan\Downloads\auditing-agent\output\asc606\extracted_rules.json'))

# Confidence distribution
confs = [round(r.get('classifier_confidence', 0), 1) for r in rules]
print("Confidence distribution:", Counter(confs))
print()

# Rules with actual field-level assertions and known relation types
target_rels = ['recognized_when', 'prohibits', 'constrained_by', 'deferred_until', 'requires']
usable = []
for r in rules:
    kg_rel = r.get('kg_relation', '')
    if not isinstance(kg_rel, str):
        kg_rel = str(kg_rel)
    cond = r.get('condition', {})
    assr = r.get('assertion', {})
    # Need a real field in the assertion
    if assr.get('field') and any(t in kg_rel for t in target_rels):
        usable.append(r)

usable.sort(key=lambda r: r.get('classifier_confidence', 0), reverse=True)
print(f"Usable rules from target relation types: {len(usable)}")
print()
for r in usable[:10]:
    rid = r['id']
    kg_rel = r.get('kg_relation', '')
    kg_src = r.get('kg_source', '')
    kg_tgt = r.get('kg_target', '')
    conf = r.get('classifier_confidence', 0)
    applies = r['applies_to']
    assr_field = r['assertion'].get('field')
    assr_type = r['assertion'].get('type')
    cond_field = r['condition'].get('field', '?')
    cond_op = r['condition'].get('operator', '?')
    cond_val = r['condition'].get('value', '?')
    print(f"[{conf:.1f}] {rid} | {kg_src} --{kg_rel}--> {kg_tgt}")
    print(f"  Applies: {applies}")
    print(f"  IF {cond_field} {cond_op} {cond_val} THEN {assr_type}({assr_field})")
    print()
