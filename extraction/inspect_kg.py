import pandas as pd
from collections import Counter

df = pd.read_parquet(r'c:\Users\riyan\Downloads\auditing-agent\output\asc606\artifacts\final_relationships.parquet')

def to_list(v):
    if hasattr(v, 'tolist'):
        return v.tolist()
    if isinstance(v, list):
        return v
    return [str(v)]

types = []
for v in df['description']:
    types.extend(to_list(v))

c = Counter(types)
print("Relation type distribution:")
for t, n in c.most_common(20):
    print(f"  {t}: {n}")

print()
assertable = {'recognized_when','deferred_until','prohibits','constrained_by','requires','applies_to'}
sample = df[df['description'].apply(lambda d: bool(set(to_list(d)) & assertable))]
print(f"Assertable rows: {len(sample)}")
print()
print("Sample assertable relationships:")
for _, r in sample.head(8).iterrows():
    rel = to_list(r['description'])
    print(f"  [{', '.join(rel)}] {r['source']} -> {r['target']}")

print()
# Check if there are any recognized_when or deferred_until
for t in ['recognized_when', 'deferred_until', 'prohibits', 'constrained_by']:
    rows = df[df['description'].apply(lambda d: t in to_list(d))]
    print(f"  {t}: {len(rows)} rows")
