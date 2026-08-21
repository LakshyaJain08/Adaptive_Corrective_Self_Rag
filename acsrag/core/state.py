"""
ACSRAG State
============
Unified TypedDict that carries data through every node in the LangGraph.
Fields are added progressively across phases; earlier phases simply
ignore fields they don't use.
"""

from typing import List, Literal, Optional, TypedDict
from langchain_core.documents import Document


class ACSRAGState(TypedDict, total=False):
    """
    Unified state for the Adaptive Corrective Self-RAG pipeline.

    ``total=False`` means every key is optional – nodes only write what they
    need, and LangGraph merges updates into the running state dict.
    """

    # ── User input ───────────────────────────────────────────────────────────
    question: str

    # ── Intent classification (Phase 5+) ─────────────────────────────────────
    intent: str
    requires_web: bool
    complexity: str
    metadata_filter: dict

    # ── Retrieval decision (Self-RAG) ────────────────────────────────────────
    need_retrieval: bool

    # ── Query rewriting ──────────────────────────────────────────────────────
    retrieval_query: str          # rewritten query for vector/BM25 retrieval
    web_query: str                # rewritten query for web search
    multi_queries: List[str]      # multiple diverse sub-queries (Phase 2+)
    rewrite_tries: int            # how many rewrite cycles so far

    # ── Retrieved documents ──────────────────────────────────────────────────
    docs: List[Document]          # raw retrieved docs (vector)
    bm25_docs: List[Document]     # BM25 results            (Phase 2+)
    web_docs: List[Document]      # web search results
    fused_docs: List[Document]    # after RRF fusion         (Phase 2+)
    reranked_docs: List[Document] # after reranking           (Phase 3+)

    # ── CRAG document evaluation ─────────────────────────────────────────────
    good_docs: List[Document]     # docs above lower threshold
    relevant_docs: List[Document] # topic-relevant docs (Self-RAG filter)
    verdict: str                  # CORRECT / INCORRECT / AMBIGUOUS
    eval_reason: str              # human-readable evaluation reason

    # ── Context refinement ───────────────────────────────────────────────────
    strips: List[str]             # all sentence strips
    kept_strips: List[str]        # kept after filtering
    refined_context: str          # joined kept strips
    compressed_context: str       # after dynamic compression  (Phase 4+)
    compression_ratio: float      # compression metric          (Phase 4+)

    # ── Generation ───────────────────────────────────────────────────────────
    context: str                  # final context fed to LLM
    answer: str                   # generated answer

    # ── Confidence Scoring (Phase 6+) ────────────────────────────────────────
    confidence_scores: dict
    best_confidence: float

    # ── Claim Verification (Phase 7+) ────────────────────────────────────────
    claims: List[str]
    claim_verdicts: List[dict]

    # ── Iterative Retrieval (Phase 8+) ───────────────────────────────────────
    iterations: int

    # ── Self-RAG verification ────────────────────────────────────────────────
    issup: Literal["fully_supported", "partially_supported", "no_support"]
    evidence: List[str]           # supporting evidence snippets
    retries: int                  # is_sup → revise loop counter

    # ── Usefulness check ─────────────────────────────────────────────────────
    isuse: Literal["useful", "not_useful"]
    use_reason: str

    # ── Intent classification (Phase 5+) ─────────────────────────────────────
    intent: Optional[str]
    requires_web: Optional[bool]
    requires_multiple_documents: Optional[bool]
    complexity: Optional[str]

    # ── Confidence scoring (Phase 6+) ────────────────────────────────────────
    retrieval_score: Optional[float]
    context_relevance: Optional[float]
    answer_faithfulness: Optional[float]
    citation_coverage: Optional[float]
    overall_confidence: Optional[float]

    # ── Claim verification (Phase 7+) ────────────────────────────────────────
    claims: Optional[List[str]]
    claim_verdicts: Optional[List[dict]]

    # ── Iterative retrieval (Phase 8+) ───────────────────────────────────────
    iteration_count: Optional[int]
    max_iterations: Optional[int]
    best_answer: Optional[str]
    best_confidence: Optional[float]
