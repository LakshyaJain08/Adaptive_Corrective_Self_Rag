"""
ACSRAG Configuration
====================
Centralised environment loading, model names, and tuneable thresholds
used across every phase of the Adaptive Corrective Self-RAG pipeline.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── LLM ──────────────────────────────────────────────────────────────────────
LLM_PROVIDER = os.getenv("ACSRAG_LLM_PROVIDER", "gemini") # "gemini" or "openai"
LLM_MODEL = os.getenv("ACSRAG_LLM_MODEL", "gemini-3.1-flash-lite")
LLM_TEMPERATURE = float(os.getenv("ACSRAG_LLM_TEMPERATURE", "0"))

# ── Embeddings ───────────────────────────────────────────────────────────────
EMBEDDING_MODEL = os.getenv("ACSRAG_EMBEDDING_MODEL", "text-embedding-3-large")

# ── Retrieval ────────────────────────────────────────────────────────────────
VECTOR_TOP_K = int(os.getenv("ACSRAG_VECTOR_TOP_K", "6"))
BM25_TOP_K = int(os.getenv("ACSRAG_BM25_TOP_K", "6"))
WEB_MAX_RESULTS = int(os.getenv("ACSRAG_WEB_MAX_RESULTS", "5"))

# ── Chunking ─────────────────────────────────────────────────────────────────
CHUNK_SIZE = int(os.getenv("ACSRAG_CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.getenv("ACSRAG_CHUNK_OVERLAP", "150"))

# ── Node Settings ────────────────────────────────────────────────────────────
UPPER_TH = float(os.getenv("ACSRAG_UPPER_TH", "0.95"))
LOWER_TH = float(os.getenv("ACSRAG_LOWER_TH", "0.2"))

# Self-RAG loop
MAX_REVISE_RETRIES = int(os.getenv("ACSRAG_MAX_REVISE_RETRIES", "2"))
MAX_REWRITE_TRIES = int(os.getenv("ACSRAG_MAX_REWRITE_TRIES", "2"))

# Phase 6 Confidence Threshold
CONFIDENCE_THRESHOLD = float(os.getenv("ACSRAG_CONFIDENCE_THRESHOLD", "0.85"))

# ── Phase 8 Iterative ───────────────────────────────────────────────────────
MAX_ITERATIONS = int(os.getenv("ACSRAG_MAX_ITERATIONS", "2"))

# ── Document Paths ───────────────────────────────────────────────────────────
# Relative to the acsrag/ folder – callers resolve via pathlib
DOCUMENTS_DIR = os.getenv("ACSRAG_DOCUMENTS_DIR", "documents")
