"""
pipeline3_openai.py

Drop-in replacement for pipeline 3 of extract_kg.py when vLLM is unavailable
(e.g. on Windows). Uses the OpenAI API for batch LLM inference instead.

Features:
- Concurrent processing (configurable parallelism, default 5)
- Per-chunk file cache so interrupted runs can resume
- Automatic retry via openai client's built-in backoff

Requires: pip install openai
Set OPENAI_API_KEY in your environment (or .env file) before running.
"""

import os
import json
import logging
import asyncio
import hashlib
from pathlib import Path

import pandas as pd
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_cache_dir: Path | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        # Try loading .env if not already set
        if not os.environ.get("OPENAI_API_KEY"):
            _try_load_dotenv()
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY not set. Add it to your .env file."
            )
        _client = AsyncOpenAI(api_key=api_key, max_retries=6, timeout=60.0)
    return _client


def _try_load_dotenv():
    """Load .env from project root if python-dotenv is available."""
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
    except ImportError:
        pass


def _chunk_cache_path(chunk_id: str) -> Path | None:
    if _cache_dir is None:
        return None
    safe = re.sub(r'[^\w\-]', '_', chunk_id) if chunk_id else None
    return _cache_dir / f"{safe}.json" if safe else None


def _init_cache(output_dir: str | None):
    global _cache_dir
    if output_dir:
        _cache_dir = Path(output_dir) / ".p3_cache"
        _cache_dir.mkdir(parents=True, exist_ok=True)


def _load_cached(chunk_id: str) -> str | None:
    p = _chunk_cache_path(chunk_id)
    if p and p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))["response"]
        except Exception:
            return None
    return None


def _save_cached(chunk_id: str, response: str):
    p = _chunk_cache_path(chunk_id)
    if p:
        p.write_text(json.dumps({"id": chunk_id, "response": response}), encoding="utf-8")


import re


async def _extract_one(
    client: AsyncOpenAI,
    semaphore: asyncio.Semaphore,
    row: dict,
    system_content: str,
    few_shot: list[dict],
    user_template: str,
    model: str,
    max_tokens: int,
    temperature: float,
    index: int,
    total: int,
) -> str:
    chunk_id = str(row.get("id", index))

    cached = _load_cached(chunk_id)
    if cached is not None:
        logger.info(f"  [cache] chunk {index+1}/{total}: {chunk_id}")
        return cached

    messages = (
        [{"role": "system", "content": system_content}]
        + few_shot
        + [{"role": "user", "content": user_template.format(input_text=row["text"])}]
    )

    async with semaphore:
        logger.info(f"  Extracting chunk {index+1}/{total}: {chunk_id}")
        try:
            response = await client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=messages,
                temperature=temperature,
            )
            text = response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"  API error on chunk {index} ({chunk_id}): {e}")
            text = ""

    _save_cached(chunk_id, text)
    return text


async def extract_graph_openai(
    text_units: pd.DataFrame,
    extraction_config: dict,
    model: str = "gpt-4o-mini",
    concurrency: int = 5,
) -> list[str]:
    """
    Async extraction. Processes `concurrency` chunks in parallel.
    Caches each chunk response so interrupted runs resume automatically.
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
    max_tokens = extraction_config.get("llm_config", {}).get("max_tokens", 2048)
    temperature = extraction_config.get("llm_config", {}).get("temperature", 0.2)

    client = _get_client()
    semaphore = asyncio.Semaphore(concurrency)
    rows = [row for _, row in text_units.iterrows()]

    tasks = [
        _extract_one(
            client, semaphore, row, system_content, few_shot,
            user_template, model, max_tokens, temperature, i, len(rows)
        )
        for i, row in enumerate(rows)
    ]

    return await asyncio.gather(*tasks)


async def pipeline_3_openai(context, extraction_config: dict, output_dir: str = None):
    """
    Async wrapper matching the signature of pipeline_3 in extract_kg.py.
    """
    from graphrag.utils.storage import load_table_from_storage, write_table_to_storage

    _init_cache(output_dir)

    text_units = await load_table_from_storage("text_units", context.storage)
    logger.info(f"Running OpenAI extraction on {len(text_units)} text units...")

    all_responses = await extract_graph_openai(text_units, extraction_config)
    df = pd.DataFrame(all_responses, columns=["response"])
    await write_table_to_storage(df, "extracted_graph_responses", context.storage)
    logger.info(f"Stage 3: Extraction complete. {len(all_responses)} chunks processed.")
