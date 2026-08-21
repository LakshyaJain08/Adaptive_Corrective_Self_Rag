"""
ACSRAG Pydantic Models
======================
Structured-output schemas used by LLM calls throughout the pipeline.
Organised by the phase that introduces them; earlier phases never
import later-phase models.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1 — Unified CRAG + Self-RAG
# ═══════════════════════════════════════════════════════════════════════════════

# -- Retrieval decision (Self-RAG) -------------------------------------------
class RetrieveDecision(BaseModel):
    """Output for the decide_retrieval node."""
    should_retrieve: bool = Field(description="True if retrieval is needed, False if we can answer directly.")


class IntentClassification(BaseModel):
    """Classification of the user's query intent."""
    intent: Literal[
        "FACTUAL", "COMPARATIVE", "SUMMARIZATION", 
        "ANALYTICAL", "TEMPORAL", "OUT_OF_DOMAIN", "MULTI_HOP"
    ] = Field(description="The primary intent of the query.")
    requires_web: bool = Field(description="True if the query likely requires live or out-of-domain web information.")
    requires_multiple_documents: bool = Field(description="True if answering requires synthesizing information from multiple distinct documents.")
    complexity: Literal["low", "medium", "high"] = Field(description="The complexity of the reasoning required.")


# ── Phase 6: Confidence Scoring ──────────────────────────────────────────────
class ConfidenceScore(BaseModel):
    """Explicit confidence scoring for the generated answer."""
    context_relevance: float = Field(description="Score 0.0 to 1.0: How well the refined context matches the query.", ge=0.0, le=1.0)
    answer_faithfulness: float = Field(description="Score 0.0 to 1.0: How well the answer is grounded in the provided context (no hallucination).", ge=0.0, le=1.0)
    answer_completeness: float = Field(description="Score 0.0 to 1.0: How fully the answer addresses the user's query.", ge=0.0, le=1.0)
    overall_confidence: float = Field(description="Weighted overall confidence score 0.0 to 1.0.", ge=0.0, le=1.0)


# ── Phase 7: Claim Verification ──────────────────────────────────────────────
class ClaimExtraction(BaseModel):
    """List of factual claims extracted from the answer."""
    claims: List[str] = Field(description="List of distinct, verifiable claims made in the answer.")

class ClaimVerification(BaseModel):
    """Verification of a single claim against the context."""
    claim: str = Field(description="The claim being verified.")
    status: Literal["SUPPORTED", "UNSUPPORTED", "PARTIALLY_SUPPORTED"] = Field(description="Whether the claim is supported by the context.")
    supporting_evidence: str = Field(description="A direct quote or paraphrase from the context supporting the claim, or explanation if unsupported.")


# ── CRAG Models ──────────────────────────────────────────────────────────────ocument evaluation -------------------------------------------------
class DocEvalScore(BaseModel):
    """Relevance score for a single retrieved chunk."""
    score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Relevance in [0.0, 1.0]. 1.0 = chunk alone answers the question.",
    )
    reason: str = Field(
        ...,
        description="Short justification for the score.",
    )


# -- Sentence-level keep/drop filter ------------------------------------------
class KeepOrDrop(BaseModel):
    """Whether a sentence should be kept for answer generation."""
    keep: bool


# -- Web query rewrite --------------------------------------------------------
class WebQuery(BaseModel):
    """Rewritten web-search query."""
    query: str


# -- Self-RAG relevance -------------------------------------------------------
class RelevanceDecision(BaseModel):
    """Topic-level relevance of a document to the question."""
    is_relevant: bool = Field(
        ...,
        description="True ONLY if the document discusses the same topic area.",
    )


# -- Self-RAG support verification --------------------------------------------
class IsSUPDecision(BaseModel):
    """Whether the generated answer is supported by the retrieved context."""
    issup: Literal["fully_supported", "partially_supported", "no_support"]
    evidence: List[str] = Field(
        default_factory=list,
        description="Up to 3 short direct quotes from context.",
    )


# -- Self-RAG usefulness check ------------------------------------------------
class IsUSEDecision(BaseModel):
    """Whether the answer is useful for the question asked."""
    isuse: Literal["useful", "not_useful"]
    reason: str = Field(
        ...,
        description="Short reason in 1 line.",
    )


# -- Self-RAG query rewrite for re-retrieval ----------------------------------
class RewriteDecision(BaseModel):
    """Rewritten retrieval query optimised for vector search."""
    retrieval_query: str = Field(
        ...,
        description="Query optimised for vector retrieval over internal PDFs.",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Hybrid Retrieval + Adaptive Query Rewriting
# ═══════════════════════════════════════════════════════════════════════════════

class MultiQuery(BaseModel):
    """Multiple diverse sub-queries for multi-query retrieval."""
    queries: List[str] = Field(
        ...,
        description="3 diverse sub-queries for the original question.",
        min_length=1,
        max_length=5,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 4 — Dynamic Context Compression
# ═══════════════════════════════════════════════════════════════════════════════

class PassageRelevance(BaseModel):
    """Relevance assessment for a passage relative to the query."""
    is_relevant: bool
    relevance_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="How relevant this passage is to answering the query.",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 5 — Intent Classification + Adaptive Routing
# ═══════════════════════════════════════════════════════════════════════════════

class MetadataFilter(BaseModel):
    """Extracted metadata filters for vector search."""
    department: Optional[str] = Field(None, description="The department mentioned in the query (e.g., HR, IT, Finance).")
    year: Optional[int] = Field(None, description="The specific year mentioned in the query.")

class IntentClassification(BaseModel):
    """Structured classification of user query intent."""
    intent: Literal[
        "FACTUAL", "COMPARATIVE", "SUMMARIZATION",
        "ANALYTICAL", "TEMPORAL", "OUT_OF_DOMAIN", "MULTI_HOP",
    ]
    requires_web: bool = Field(
        ...,
        description="Whether answering likely requires web search.",
    )
    requires_multiple_documents: bool = Field(
        ...,
        description="Whether answering requires synthesising multiple documents.",
    )
    complexity: Literal["low", "medium", "high"]


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6 — Confidence Scoring
# ═══════════════════════════════════════════════════════════════════════════════

class ConfidenceScore(BaseModel):
    """Multi-dimensional confidence assessment of the generated answer."""
    retrieval_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Average relevance of retrieved documents.",
    )
    context_relevance: float = Field(
        ..., ge=0.0, le=1.0,
        description="How well the assembled context matches the query.",
    )
    answer_faithfulness: float = Field(
        ..., ge=0.0, le=1.0,
        description="How well the answer is grounded in the context.",
    )
    citation_coverage: float = Field(
        ..., ge=0.0, le=1.0,
        description="Fraction of answer claims supported by evidence.",
    )
    overall_confidence: float = Field(
        ..., ge=0.0, le=1.0,
        description="Weighted combination of all sub-scores.",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 7 — Claim / Evidence Verification
# ═══════════════════════════════════════════════════════════════════════════════

class ClaimExtraction(BaseModel):
    """Claims extracted from a generated answer."""
    claims: List[str] = Field(
        ...,
        description="Atomic factual claims in the answer.",
    )


class ClaimVerification(BaseModel):
    """Verification result for a single claim."""
    claim: str
    status: Literal["SUPPORTED", "UNSUPPORTED", "PARTIALLY_SUPPORTED"]
    supporting_evidence: Optional[str] = Field(
        None,
        description="A short quote from context that supports this claim, if any.",
    )
