"""
run_audit_pipeline.py

Wrapper that runs the GraphMERT/GraphRAG extraction pipeline (stages 1-5)
on regulatory documents, then calls stage6_rule_classifier.py to produce
executable rules.

Prerequisites:
    - graphmert repo cloned alongside this project (or on PYTHONPATH)
    - extraction_config_audit.yaml in the same directory as this script
    - Regulatory documents chunked into a GraphRAG input directory
      (use chunk_regulation.py to produce this)

Usage:
    python run_audit_pipeline.py \\
        --input_dir ./chunks/asc606 \\
        --output_dir ./output/asc606 \\
        --standard "ASC 606" \\
        --pipeline all

    # Run only specific stages:
    python run_audit_pipeline.py --input_dir ./chunks/asc606 --output_dir ./output/asc606 --pipeline 3,4,5

    # After KG extraction, produce executable rules:
    python run_audit_pipeline.py --input_dir ./chunks/asc606 --output_dir ./output/asc606 --pipeline 6
"""

import os
import sys
import json
import asyncio
import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).parent
GRAPHMERT_DIR = Path(
    os.environ.get("GRAPHMERT_DIR", str(SCRIPT_DIR.parent.parent / "graphmert" / "graphrag"))
)


def _require_graphmert():
    if not GRAPHMERT_DIR.exists():
        logger.error(
            f"GraphMERT not found at {GRAPHMERT_DIR}. "
            "Clone https://github.com/jha-lab/graphmert (pubmed branch) alongside this project."
        )
        sys.exit(1)
    if str(GRAPHMERT_DIR) not in sys.path:
        sys.path.insert(0, str(GRAPHMERT_DIR))


def _build_graphrag_settings(input_dir: str, output_dir: str) -> Path:
    """Write a minimal settings.yaml for GraphRAG pointing at our input/output dirs."""
    # Use absolute paths with forward slashes — backslashes in YAML double-quoted
    # strings are escape sequences, so C:\Users breaks YAML parsing on Windows
    abs_input = str(Path(input_dir).resolve()).replace("\\", "/")
    abs_output = str(Path(output_dir).resolve()).replace("\\", "/")
    abs_artifacts = str((Path(output_dir).resolve() / "artifacts")).replace("\\", "/")
    abs_cache = str((Path(output_dir).resolve() / "cache")).replace("\\", "/")

    settings_path = Path(output_dir) / "settings.yaml"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(f"""
models:
  default_chat_model:
    type: openai_chat
    api_key: ${{OPENAI_API_KEY}}
    model: gpt-4o-mini
    api_base: https://api.openai.com/v1
  default_embedding_model:
    type: openai_embedding
    api_key: ${{OPENAI_API_KEY}}
    model: text-embedding-3-small
    api_base: https://api.openai.com/v1

input:
  type: file
  file_type: text
  base_dir: "{abs_input}"
  file_pattern: '.*\\.txt'

output:
  type: file
  base_dir: "{abs_artifacts}"

cache:
  type: file
  base_dir: "{abs_cache}"

root_dir: "{abs_output}"
""")
    return settings_path


async def _pipeline_1_simple(context, input_dir: str):
    """
    Lightweight replacement for pipeline_1.
    Reads chunk .txt files directly — no spacy, no torch, no NLP stack.
    Produces the same 'text_units' table that pipelines 3/4/5 consume.
    """
    import pandas as pd
    from graphrag.utils.storage import write_table_to_storage

    txt_files = sorted(Path(input_dir).glob("*.txt"))
    if not txt_files:
        logger.error(f"No .txt files found in {input_dir}. Run chunk_regulation.py first.")
        sys.exit(1)

    rows = []
    for txt_file in txt_files:
        text = txt_file.read_text(encoding="utf-8", errors="replace")
        rows.append({"id": txt_file.stem, "text": text, "document_ids": [txt_file.stem]})

    df = pd.DataFrame(rows).reset_index(drop=True)
    await write_table_to_storage(df, "text_units", context.storage)
    logger.info(f"Stage 1: wrote {len(df)} text units")


async def _pipeline_2_stub(context):
    """Minimal stub for pipeline_2 — creates an empty final_documents table."""
    import pandas as pd
    from graphrag.utils.storage import write_table_to_storage

    df = pd.DataFrame(columns=["id", "title", "text", "text_unit_ids"])
    await write_table_to_storage(df, "final_documents", context.storage)
    logger.info("Stage 2: wrote stub final_documents")


def run_pipeline_stages(input_dir: str, output_dir: str, stages: list[str], standard: str):
    _require_graphmert()

    from graphrag.config.load_config import load_config
    from graphrag.storage.factory import StorageFactory
    from graphrag.cache.factory import CacheFactory
    from graphrag.index.run.utils import create_run_context
    from graphrag.callbacks.workflow_callbacks_manager import WorkflowCallbacksManager

    extraction_config_path = SCRIPT_DIR / "extraction_config_audit.yaml"
    if not extraction_config_path.exists():
        logger.error(f"extraction_config_audit.yaml not found at {extraction_config_path}")
        sys.exit(1)

    settings_path = _build_graphrag_settings(input_dir, output_dir)
    config = load_config(Path(output_dir), settings_path, {})

    storage_config = config.output.model_dump()
    storage = StorageFactory().create_storage(
        storage_type=storage_config["type"], kwargs=storage_config
    )
    cache_config = config.cache.model_dump()
    cache = CacheFactory().create_cache(
        cache_type=cache_config["type"], root_dir=config.root_dir, kwargs=cache_config
    )
    context = create_run_context(storage=storage, cache=cache, stats=None)
    callback_chain = WorkflowCallbacksManager()

    # extract_kg.py imports vLLM at module level — mock it before importing
    # so the module loads cleanly on Windows where vLLM isn't available
    try:
        import vllm  # noqa: F401
    except ImportError:
        from unittest.mock import MagicMock
        sys.modules["vllm"] = MagicMock()

    sys.path.insert(0, str(GRAPHMERT_DIR))
    from extract_kg import (
        pipeline_4, pipeline_5,
        load_extraction_config,
    )

    # Always use our OpenAI adapter for pipeline 3 on Windows
    from pipeline3_openai import pipeline_3_openai as pipeline_3  # type: ignore
    logger.info("Using OpenAI API for pipeline 3")

    extraction_config = load_extraction_config(str(extraction_config_path))

    if "1" in stages or "all" in stages:
        logger.info("Stage 1: Creating base text units (lightweight, no spacy/torch)...")
        asyncio.run(_pipeline_1_simple(context, config.input.base_dir))

    if "2" in stages or "all" in stages:
        logger.info("Stage 2: Creating final documents (stub)...")
        asyncio.run(_pipeline_2_stub(context))

    if "3" in stages or "all" in stages:
        logger.info("Stage 3: Extracting graph with LLM...")
        asyncio.run(pipeline_3(context, extraction_config))

    if "4" in stages or "all" in stages:
        logger.info("Stage 4: Parsing entities and relationships...")
        asyncio.run(pipeline_4(context, extraction_config))

    if "5" in stages or "all" in stages:
        logger.info("Stage 5: Cleaning and finalizing KG...")
        asyncio.run(pipeline_5(config, context, extraction_config))

    if "6" in stages or "all" in stages:
        logger.info("Stage 6: Classifying relationships into executable rules...")
        _run_stage6(output_dir, standard)


def _run_stage6(output_dir: str, standard: str):
    from stage6_rule_classifier import classify_rules

    artifacts_dir = Path(output_dir) / "artifacts"
    entities_path = artifacts_dir / "final_entities.parquet"
    relationships_path = artifacts_dir / "final_relationships.parquet"

    if not relationships_path.exists():
        logger.error(f"final_relationships.parquet not found at {relationships_path}. Run stages 1-5 first.")
        sys.exit(1)

    rules_output_path = Path(output_dir) / "extracted_rules.json"
    classify_rules(
        entities_path=str(entities_path),
        relationships_path=str(relationships_path),
        standard=standard,
        output_path=str(rules_output_path),
    )
    logger.info(f"Executable rules written to {rules_output_path}")


def main():
    parser = argparse.ArgumentParser(description="Run audit KG extraction pipeline")
    parser.add_argument("--input_dir", required=True,
                        help="Directory of chunked regulatory .txt files (from chunk_regulation.py)")
    parser.add_argument("--output_dir", required=True,
                        help="Directory where GraphRAG artifacts and rules will be written")
    parser.add_argument("--standard", default=None,
                        help="Accounting standard name, e.g. 'ASC 606'. Auto-detected if omitted.")
    parser.add_argument("--pipeline", default="all",
                        help="Comma-separated stages to run: 1,2,3,4,5,6 or 'all'")
    args = parser.parse_args()

    stages = [s.strip() for s in args.pipeline.split(",")] if args.pipeline != "all" else ["all"]

    if args.standard is None:
        # Try to infer from input directory name
        dirname = Path(args.input_dir).name.lower()
        if "606" in dirname:
            args.standard = "ASC 606"
        elif "842" in dirname:
            args.standard = "ASC 842"
        elif "ifrs15" in dirname or "ifrs_15" in dirname:
            args.standard = "IFRS 15"
        elif "200" in dirname:
            args.standard = "2 CFR Part 200"
        else:
            args.standard = "Unknown"
        logger.info(f"Auto-detected standard: {args.standard}")

    run_pipeline_stages(args.input_dir, args.output_dir, stages, args.standard)
    logger.info("Pipeline complete.")


if __name__ == "__main__":
    main()
