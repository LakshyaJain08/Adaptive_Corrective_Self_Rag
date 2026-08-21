"""
ACSRAG Utilities
================
Shared helper functions: document loading, text cleaning, sentence
decomposition, and other reusable operations.
"""

import re
from pathlib import Path
from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from acsrag.core.config import CHUNK_SIZE, CHUNK_OVERLAP, LLM_PROVIDER, LLM_MODEL, LLM_TEMPERATURE

# ── LLM Factory ──────────────────────────────────────────────────────────────

def get_llm():
    """
    Return a configured LLM instance based on the active provider.
    Defaults to Gemini (gemini-1.5-flash) for free-tier cost optimization.
    """
    if LLM_PROVIDER.lower() == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        import time
        
        # Patch the class method directly so it survives .with_structured_output() copies
        if not hasattr(ChatGoogleGenerativeAI, "_rate_limit_patched"):
            original_generate = ChatGoogleGenerativeAI._generate
            
            def throttled_generate(self, *args, **kwargs):
                time.sleep(3.5) # Pace to ~17 requests per minute
                try:
                    return original_generate(self, *args, **kwargs)
                except Exception as e:
                    if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                        print("\n[Rate Limit] Hit Gemini Free Tier limit (20 RPM). Sleeping 35s to recover...")
                        time.sleep(35)
                        return original_generate(self, *args, **kwargs)
                    raise e
                    
            ChatGoogleGenerativeAI._generate = throttled_generate
            ChatGoogleGenerativeAI._rate_limit_patched = True
            
        return ChatGoogleGenerativeAI(model=LLM_MODEL, temperature=LLM_TEMPERATURE)
    else:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=LLM_MODEL, temperature=LLM_TEMPERATURE)


# ── Document Loading ─────────────────────────────────────────────────────────

def load_and_chunk_pdfs(
    pdf_paths: List[str | Path],
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
    cache_suffix: str = "",
) -> List[Document]:
    """
    Load PDFs, clean surrogate characters, and split into chunks.

    Parameters
    ----------
    pdf_paths : list of paths to PDF files
    chunk_size : target chunk size in characters
    chunk_overlap : overlap between chunks
    cache_suffix : optional suffix to append to the cache file name

    Returns
    -------
    List[Document] — chunked documents ready for indexing
    """
    import pickle
    import os
    
    suffix = f"_{cache_suffix}" if cache_suffix else ""
    cache_path = f"chunks_cache{suffix}.pkl"
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return pickle.load(f)

    all_docs: List[Document] = []
    for p in pdf_paths:
        all_docs.extend(PyPDFLoader(str(p)).load())

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    chunks = splitter.split_documents(all_docs)

    # Clean surrogate characters that sometimes leak from PDF extraction
    for d in chunks:
        d.page_content = (
            d.page_content
            .encode("utf-8", "ignore")
            .decode("utf-8", "ignore")
        )
        # Attach mock metadata for Staged Hybrid Filtering
        d.metadata["department"] = "HR"
        d.metadata["year"] = 2024
        d.metadata["doc_type"] = "policy"

    with open(cache_path, "wb") as f:
        pickle.dump(chunks, f)

    return chunks


# ── Text Processing ──────────────────────────────────────────────────────────

def decompose_to_sentences(text: str, min_len: int = 20) -> List[str]:
    """
    Split a block of text into sentence-level strips.

    - Collapses whitespace
    - Splits on sentence-ending punctuation
    - Drops strips shorter than *min_len* characters

    Parameters
    ----------
    text : raw text block
    min_len : minimum character length to keep a sentence

    Returns
    -------
    List[str]
    """
    text = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sentences if len(s.strip()) > min_len]


def clean_text(text: str) -> str:
    """Remove surrogate characters and collapse whitespace."""
    text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    return re.sub(r"\s+", " ", text).strip()


def format_docs_as_context(docs: List[Document], separator: str = "\n\n---\n\n") -> str:
    """Join document page_content with a separator."""
    return separator.join(d.page_content for d in docs).strip()
