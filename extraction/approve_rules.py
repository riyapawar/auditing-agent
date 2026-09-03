"""
Approves a curated set of rules in data/rules.json for validation.
Picks rules with clear field checks across different transaction types.
"""
import json
from pathlib import Path
from datetime import datetime

RULES_PATH = Path(r'c:\Users\riyan\Downloads\auditing-agent\data\rules.json')

# IDs to approve — highest confidence + good coverage of transaction types
APPROVE_IDS = {
    "ASC606-R-0601",  # standalone_selling_price exists — subscription/milestone/license
    "ASC606-R-0004",  # performance_obligation_satisfied exists — license
    "ASC606-R-0011",  # revenue_recognized exists — license
    "ASC606-R-0022",  # variable_consideration_included exists — license
    "ASC606-R-0023",  # revenue_recognized exists — sales_based_royalty
    "ASC606-R-0024",  # revenue_recognized exists — usage_based_royalty
    "ASC606-R-0048",  # revenue_recognized exists — license (functional IP)
    "ASC606-R-0052",  # performance_obligation_satisfied exists — license (symbolic IP)
}

rules = json.loads(RULES_PATH.read_text()) if RULES_PATH.exists() else []
now = datetime.utcnow().isoformat() + "Z"
approved, skipped = 0, 0
for r in rules:
    if r['id'] in APPROVE_IDS:
        r['status'] = 'approved'
        r['approved_by'] = 'demo-validator'
        r['approved_at'] = now
        approved += 1
    else:
        skipped += 1

RULES_PATH.write_text(json.dumps(rules, indent=2))
print(f"Approved {approved} rules, {skipped} remain pending.")
print()
for r in rules:
    if r['status'] == 'approved':
        cond = r['condition']
        assr = r['assertion']
        print(f"  {r['id']}: IF {cond.get('field')} {cond.get('operator')} {cond.get('value')} THEN {assr.get('type')}({assr.get('field')})")
