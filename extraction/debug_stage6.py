"""Quick diagnostic: test one recognized_when relationship."""
import os, sys, json
sys.path.insert(0, '.')

from dotenv import load_dotenv
load_dotenv(r'c:\Users\riyan\Downloads\auditing-agent\.env')

import pandas as pd
import numpy as np
from openai import OpenAI
from stage6_rule_classifier import CLASSIFICATION_PROMPT, _to_list, ASSERTABLE_RELATIONS

client = OpenAI()
df = pd.read_parquet(r'c:\Users\riyan\Downloads\auditing-agent\output\asc606\artifacts\final_relationships.parquet')

# Find recognized_when samples
def has_type(d, t):
    return t in _to_list(d)

sample = df[df['description'].apply(lambda d: has_type(d, 'recognized_when'))].head(3)
print(f"Testing {len(sample)} recognized_when relationships\n")

for _, row in sample.iterrows():
    desc = ", ".join(_to_list(row['description']))
    prompt = (
        CLASSIFICATION_PROMPT
        .replace("{source}", str(row['source']))
        .replace("{relation}", desc)
        .replace("{target}", str(row['target']))
        .replace("{description}", desc)
        .replace("{source_text}", "(source text not available)")
    )

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )
    text = resp.choices[0].message.content or ""

    print(f"Relationship: {row['source']} --{desc}--> {row['target']}")
    print(f"LLM response:")
    print(text[:800])
    print("---")
