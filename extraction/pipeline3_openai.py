"""
pipeline3_openai.py

Drop-in replacement for pipeline 3 of extract_kg.py when vLLM is unavailable
(e.g. on Windows). Uses the OpenAI API for batch LLM inference instead.

Requires: pip install openai
Set OPENAI_API_KEY in your environment before running.
"""

import os
import logging
import pandas as pd
from openai import OpenAI

logger = logging.getLogger(__name__)

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY not set. Run: $env:OPENAI_API_KEY='sk-...'"
            )
        _client = OpenAI(api_key=api_key)
    return _client


def extract_graph_openai(
    text_units: pd.DataFrame,
    extraction_config: dict,
    model: str = "gpt-4o",
) -> list[str]:
    """
    Replacement for extract_graph() in extract_kg.py.
    Takes the same inputs, returns the same list[str] of raw LLM responses.
    """
    system_content = extraction_config["prompt_template"].format(
        completion_delimiter=extraction_config["completion_delimiter"],
        tuple_delimiter=extraction_config["tuple_delimiter"],
        record_delimiter=extraction_config["record_delimiter"],
        entity_types=", ".join(extraction_config["entity_types"]),
        entity_types_examples=extraction_config["entity_types_examples"],
        relation_types=", ".join(extraction_config["relation_types"]),
        relation_types_examples=extraction_config["relation_types_examples"],
    )

    # Build few-shot message turns
    few_shot: list[dict] = []
    for ex in extraction_config.get("examples", []):
        few_shot.append({"role": "user", "content": ex["user"]})
        few_shot.append({
            "role": "assistant",
            "content": ex["assistant"].format(
                completion_delimiter=extraction_config["completion_delimiter"],
                tuple_delimiter=extraction_config["tuple_delimiter"],
                record_delimiter=extraction_config["record_delimiter"],
            ),
        })

    user_template = extraction_config["user_prompt"]
    client = _get_client()
    responses = []

    for i, (_, row) in enumerate(text_units.iterrows()):
        logger.info(f"  Extracting graph from chunk {i+1}/{len(text_units)}: {row.get('id', '')}")
        messages = (
            [{"role": "system", "content": system_content}]
            + few_shot
            + [{"role": "user", "content": user_template.format(input_text=row["text"])}]
        )
        try:
            response = client.chat.completions.create(
                model=model,
                max_tokens=extraction_config.get("llm_config", {}).get("max_tokens", 2048),
                messages=messages,
                temperature=extraction_config.get("llm_config", {}).get("temperature", 0.2),
            )
            responses.append(response.choices[0].message.content or "")
        except Exception as e:
            logger.error(f"  API error on chunk {i}: {e}")
            responses.append("")

    return responses


async def pipeline_3_openai(context, extraction_config: dict):
    """
    Async wrapper matching the signature of pipeline_3 in extract_kg.py.
    """
    from graphrag.utils.storage import load_table_from_storage, write_table_to_storage

    text_units = await load_table_from_storage("text_units", context.storage)
    logger.info(f"Running OpenAI extraction on {len(text_units)} text units...")

    all_responses = extract_graph_openai(text_units, extraction_config)
    df = pd.DataFrame(all_responses, columns=["response"])
    await write_table_to_storage(df, "extracted_graph_responses", context.storage)
    logger.info("Extraction complete.")
