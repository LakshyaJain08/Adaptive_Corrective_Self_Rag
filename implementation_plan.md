# Adaptive Corrective Self-RAG (ACSRAG) — Implementation Plan

## Goal

Combine the existing **Corrective RAG** (CRAG) and **Self-RAG** implementations into a unified, progressively enhanced architecture called **Adaptive Corrective Self-RAG (ACSRAG)**. The build will be done in **9 phases**, each implemented as a standalone notebook that builds upon the previous one — mirroring the pedagogical, step-by-step style already used in both the `corrective rag/` and `self rag/` folders.

---

## Existing Assets Summary

### Corrective RAG (`corrective rag/`)

| Notebook | Key Capability |
|---|---|
| [1_basic_rag.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/corrective%20rag/1_basic_rag.ipynb) | Basic `retrieve → generate` LangGraph pipeline using FAISS + OpenAI |
| [2_retrieval_refinement.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/corrective%20rag/2_retrieval_refinement.ipynb) | Sentence-level decomposition + LLM relevance filter |
| [3_retrieval_evaluator.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/corrective%20rag/3_retrieval_evaluator.ipynb) | Score-based doc evaluation (CORRECT/INCORRECT threshold routing) |
| [4_web_search_refinement.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/corrective%20rag/4_web_search_refinement.ipynb) | Web search fallback via Tavily when retrieval is poor |
| [5_query_rewrite.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/corrective%20rag/5_query_rewrite.ipynb) | LLM-based query rewriting for web search |
| [6_ambiguous.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/corrective%20rag/6_ambiguous.ipynb) | Three-way verdict (CORRECT / INCORRECT / AMBIGUOUS) with blended internal+web context |

**Tech Stack:** LangChain, LangGraph (`StateGraph`), FAISS, OpenAI (`gpt-4o-mini`, `text-embedding-3-large`), Tavily, PyPDFLoader, Pydantic structured output.

**Data:** 3 deep learning textbooks (`book1.pdf`, `book2.pdf`, `book3.pdf`).

---

### Self-RAG (`self rag/`)

| Notebook | Key Capability |
|---|---|
| [self_rag_step1.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step1.ipynb) | `decide_retrieval` gate (should we retrieve at all?) |
| [self_rag_step2.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step2.ipynb) | `is_relevant` topic-level doc filter |
| [self_rag_step3.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step3.ipynb) | `generate_from_context` vs `generate_direct` branching |
| [self_rag_step4.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step4.ipynb) | `is_sup` (support verification: fully/partially/no support) |
| [self_rag_step5.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step5.ipynb) | `revise_answer` loop with retry count |
| [self_rag_step6.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step6.ipynb) | `is_use` (usefulness check) + `no_answer_found` fallback |
| [self_rag_step7.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_step7.ipynb) | `rewrite_question` for retrieval re-try (full Self-RAG loop) |
| [self_rag_web.ipynb](file:///c:/Users/laksh/Desktop/Advance%20Corrective%20self%20rag/self%20rag/self_rag_web.ipynb) | Self-RAG variant with web search integration |

**Tech Stack:** Same as CRAG (LangChain, LangGraph, FAISS, OpenAI, Pydantic).

**Data:** 3 small company PDFs (`Company_Policies.pdf`, `Company_Profile.pdf`, `Product_and_Pricing.pdf`).

---

## Architecture Overview

The final ACSRAG architecture:

```
                         USER QUERY
                              │
                              ▼
                    ┌──────────────────┐
                    │ Intent Classifier│  ← Phase 5
                    └────────┬─────────┘
                             │
                             ▼
                    Adaptive Query       ← Phase 2
                       Rewriter
                             │
                             ▼
                 ┌─────────────────────┐
                 │  Retrieval Router   │  ← Phase 2 / Phase 5
                 └──────────┬──────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Vector Search     BM25         Web Search   ← Phase 2
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                    Result Fusion        ← Phase 2
                            │
                            ▼
                   Document Grader       ← Phase 1
                       (CRAG)
                            │
                    ┌───────┴───────┐
                    │               │
                 Good            Poor
                    │               │
                    │          Query Refinement
                    │               │
                    │          Re-retrieval
                    │               │
                    └───────┬───────┘
                            ▼
                      Document           ← Phase 3
                      Reranker
                            │
                            ▼
                  Dynamic Context        ← Phase 4
                     Compression
                            │
                            ▼
                    Context Assembly
                            │
                            ▼
                         LLM
                            │
                            ▼
                  Self-Reflection        ← Phase 1
                      (Self-RAG)
                            │
                            ▼
                  Claim / Evidence       ← Phase 7
                    Verification
                            │
                            ▼
                  Confidence Scoring     ← Phase 6
                            │
                    ┌───────┴────────┐
                    │                │
              Confidence ≥ τ    Confidence < τ
                    │                │
                    ▼                ▼
              Final Answer      Iterative         ← Phase 8
                                Retrieval
                                      │
                                      ▼
                                  Regenerate
                                      │
                                      ▼
                              Evidence Verification
                                      │
                                      ▼
                                 Final Answer
```

---

## Phased Implementation Plan

> [!IMPORTANT]
> Each phase produces a **single `.py` module** and a corresponding **notebook** that demonstrates and tests the phase. All phases live in a new top-level folder `acsrag/` within the workspace. Each phase is **incremental**: Phase N imports and extends Phase N-1.

### Folder Structure

```
Advance Corrective self rag/
├── corrective rag/          # ← existing (untouched)
├── self rag/                # ← existing (untouched)
└── acsrag/                  # ← NEW
    ├── documents/           # Unified document corpus (symlink/copy both sets)
    ├── core/                # Shared utilities
    │   ├── __init__.py
    │   ├── config.py        # API keys, model names, thresholds
    │   ├── state.py         # Unified ACSRAG State TypedDict
    │   ├── models.py        # All Pydantic schemas (IntentClassification, DocEvalScore, etc.)
    │   └── utils.py         # Common helpers (text cleaning, sentence decomposition, etc.)
    ├── nodes/               # One file per LangGraph node
    │   ├── __init__.py
    │   ├── intent_classifier.py
    │   ├── query_rewriter.py
    │   ├── retrieval_router.py
    │   ├── vector_retriever.py
    │   ├── bm25_retriever.py
    │   ├── web_retriever.py
    │   ├── result_fusion.py
    │   ├── document_grader.py
    │   ├── document_reranker.py
    │   ├── context_compressor.py
    │   ├── generator.py
    │   ├── self_reflection.py
    │   ├── claim_verifier.py
    │   ├── confidence_scorer.py
    │   └── iterative_controller.py
    ├── graphs/              # LangGraph definitions for each phase
    │   ├── __init__.py
    │   ├── phase1_unified.py
    │   ├── phase2_hybrid_retrieval.py
    │   ├── phase3_reranking.py
    │   ├── phase4_compression.py
    │   ├── phase5_intent_routing.py
    │   ├── phase6_confidence.py
    │   ├── phase7_verification.py
    │   ├── phase8_iterative.py
    │   └── phase9_benchmark.py
    ├── notebooks/           # Demonstration notebooks
    │   ├── phase1_unified_crag_srag.ipynb
    │   ├── phase2_hybrid_retrieval.ipynb
    │   ├── phase3_reranking.ipynb
    │   ├── phase4_context_compression.ipynb
    │   ├── phase5_intent_and_routing.ipynb
    │   ├── phase6_confidence_scoring.ipynb
    │   ├── phase7_claim_verification.ipynb
    │   ├── phase8_iterative_retrieval.ipynb
    │   └── phase9_benchmark.ipynb
    └── requirements.txt
```

---

### Phase 1 — Unify CRAG + Self-RAG (Baseline)

**Goal:** Merge the CRAG pipeline (retrieve → evaluate → [rewrite → web search] → refine → generate) with the Self-RAG post-generation loop (is_sup → revise → is_use → rewrite_question → re-retrieve) into a single LangGraph.

**What we reuse:**

| From CRAG `6_ambiguous.ipynb` | From Self-RAG `self_rag_step7.ipynb` |
|---|---|
| `retrieve_node` | `decide_retrieval` + `route_after_decide` |
| `eval_each_doc_node` (score-based, 3-way verdict) | `is_relevant` (topic-level filter) |
| `rewrite_query_node` + `web_search_node` | `generate_from_context` / `generate_direct` |
| `refine` (sentence decomposition + keep/drop) | `is_sup` + `revise_answer` loop |
| `generate` | `is_use` + `rewrite_question` loop |
| — | `no_answer_found` fallback |

**Unified State (superset):**

```python
class ACSRAGState(TypedDict):
    question: str
    retrieval_query: str         # from Self-RAG

    # Retrieval
    docs: List[Document]
    good_docs: List[Document]    # from CRAG
    relevant_docs: List[Document]  # from Self-RAG

    # CRAG evaluation
    verdict: str                 # CORRECT / INCORRECT / AMBIGUOUS
    reason: str

    # Refinement
    strips: List[str]
    kept_strips: List[str]
    refined_context: str

    # Web search
    web_query: str
    web_docs: List[Document]

    # Generation
    context: str
    answer: str

    # Self-RAG verification
    need_retrieval: bool
    issup: Literal["fully_supported", "partially_supported", "no_support"]
    evidence: List[str]
    retries: int
    isuse: Literal["useful", "not_useful"]
    use_reason: str
    rewrite_tries: int
```

**Graph flow:**

```
START → decide_retrieval
  ├── NO  → generate_direct → END
  └── YES → retrieve → eval_each_doc (CRAG 3-way)
              ├── CORRECT  → refine → generate → is_sup
              ├── AMBIGUOUS → rewrite_query → web_search → refine → generate → is_sup
              └── INCORRECT → rewrite_query → web_search → refine → generate → is_sup
                                                                        │
                                                        ┌───────────────┤
                                                   fully_supported   partial/no_support
                                                        │                    │
                                                    is_use              revise_answer → is_sup (loop)
                                                   ┌────┴────┐
                                                useful    not_useful
                                                  │           │
                                                 END    rewrite_question → retrieve (loop)
```

**Key files to create:**
- [NEW] `acsrag/core/config.py` — env loading, model names, thresholds
- [NEW] `acsrag/core/state.py` — `ACSRAGState` TypedDict
- [NEW] `acsrag/core/models.py` — All Pydantic models
- [NEW] `acsrag/core/utils.py` — Sentence decomposition, text cleaning
- [NEW] `acsrag/nodes/` — All node functions ported from existing notebooks
- [NEW] `acsrag/graphs/phase1_unified.py` — Combined graph
- [NEW] `acsrag/notebooks/phase1_unified_crag_srag.ipynb` — Demo

---

### Phase 2 — Hybrid Retrieval + Adaptive Query Rewriting

**Goal:** Replace the current "vector-first, web-if-poor" model with **parallel hybrid retrieval** (Vector + BM25 + Web) and **multi-query rewriting**.

**New components:**

#### `query_rewriter.py`
- Takes original query + intent (once available in Phase 5)
- Generates **3 diverse sub-queries** (multi-query retrieval)
- Uses LLM structured output: `class MultiQuery(BaseModel): queries: List[str]`

#### `bm25_retriever.py`
- Uses `rank_bm25` library over the same chunked documents
- Returns top-k docs per sub-query

#### `retrieval_router.py`
- Decides which retrieval strategies to activate based on query characteristics
- Initially simple heuristic (always all three); becomes adaptive in Phase 5

#### `result_fusion.py`
- Implements **Reciprocal Rank Fusion (RRF)** to merge results from Vector, BM25, and Web
- Deduplicates by content hash
- Returns unified ranked list

**Graph change:**
```
retrieve → [vector_search, bm25_search, web_search (conditional)] → result_fusion → eval_each_doc → ...
```

**Key files:**
- [NEW] `acsrag/nodes/query_rewriter.py`
- [NEW] `acsrag/nodes/bm25_retriever.py`
- [NEW] `acsrag/nodes/retrieval_router.py`
- [NEW] `acsrag/nodes/result_fusion.py`
- [NEW] `acsrag/graphs/phase2_hybrid_retrieval.py`
- [NEW] `acsrag/notebooks/phase2_hybrid_retrieval.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add fields for multi-query, BM25 docs, fusion scores
- [MODIFY] `acsrag/core/models.py` — Add `MultiQuery` schema

**Dependencies:** `rank-bm25`

---

### Phase 3 — Document Reranking

**Goal:** After retrieval fusion, rerank the top-N documents using a **cross-encoder** to get truly relevant top-k.

**New component:**

#### `document_reranker.py`
- Takes fused results (top 20) + query
- Uses a cross-encoder model (e.g. `cross-encoder/ms-marco-MiniLM-L-6-v2` via `sentence-transformers`) or an LLM-based reranker
- Returns top 5 with reranking scores

**Graph change:**
```
result_fusion → document_reranker → eval_each_doc → ...
```

**Key files:**
- [NEW] `acsrag/nodes/document_reranker.py`
- [NEW] `acsrag/graphs/phase3_reranking.py`
- [NEW] `acsrag/notebooks/phase3_reranking.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add `reranked_docs`, `rerank_scores`

**Dependencies:** `sentence-transformers` (or LLM-based alternative)

---

### Phase 4 — Dynamic Context Compression

**Goal:** Before feeding context to the LLM, compress it by extracting only the most relevant passages, reducing noise and token usage.

**New component:**

#### `context_compressor.py`
- Builds on the existing CRAG `refine` node (sentence decomposition + keep/drop)
- Enhanced with:
  - Passage-level extraction (not just sentence-level)
  - Relevance scoring per passage relative to the query
  - Token budget awareness (configurable max tokens for context)
  - Deduplication of semantically similar passages

**Graph change:**
```
document_reranker → context_compressor → generate → ...
```

**Key files:**
- [NEW] `acsrag/nodes/context_compressor.py`
- [NEW] `acsrag/graphs/phase4_compression.py`
- [NEW] `acsrag/notebooks/phase4_context_compression.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add `compressed_context`, `compression_ratio`
- [MODIFY] `acsrag/core/models.py` — Add `PassageRelevance` schema

---

### Phase 5 — Intent Classification + Adaptive Routing

**Goal:** Add an intent classifier at the top of the pipeline to categorize queries and route them to appropriate retrieval strategies.

**New components:**

#### `intent_classifier.py`
- LLM-based classifier that outputs structured JSON:
```python
class IntentClassification(BaseModel):
    intent: Literal["FACTUAL", "COMPARATIVE", "SUMMARIZATION",
                     "ANALYTICAL", "TEMPORAL", "OUT_OF_DOMAIN", "MULTI_HOP"]
    requires_web: bool
    requires_multiple_documents: bool
    complexity: Literal["low", "medium", "high"]
```
- Feeds into `retrieval_router.py` to make routing truly adaptive

#### Updated `retrieval_router.py`
- Uses intent to decide:
  - FACTUAL → Vector + BM25
  - TEMPORAL → Vector + Web
  - COMPARATIVE → Vector + BM25 (multiple docs)
  - OUT_OF_DOMAIN → Web only
  - etc.

**Graph change:**
```
START → intent_classifier → query_rewriter → retrieval_router → [vector, bm25, web] → ...
```

**Key files:**
- [NEW] `acsrag/nodes/intent_classifier.py`
- [MODIFY] `acsrag/nodes/retrieval_router.py` — Make intent-aware
- [MODIFY] `acsrag/nodes/query_rewriter.py` — Make intent-aware
- [NEW] `acsrag/graphs/phase5_intent_routing.py`
- [NEW] `acsrag/notebooks/phase5_intent_and_routing.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add `intent`, `requires_web`, `complexity`
- [MODIFY] `acsrag/core/models.py` — Add `IntentClassification`

---

### Phase 6 — Explicit Confidence Scoring

**Goal:** Replace the binary "confidence / faithfulness" check with a **quantitative confidence score** that drives decision-making.

**New component:**

#### `confidence_scorer.py`
- Computes multiple sub-scores:
```python
class ConfidenceScore(BaseModel):
    retrieval_score: float       # avg relevance of retrieved docs
    context_relevance: float     # how well context matches query
    answer_faithfulness: float   # grounding in context
    citation_coverage: float     # fraction of claims backed by evidence
    overall_confidence: float    # weighted combination
```
- Configurable threshold `τ` (default 0.85)
- `confidence ≥ τ` → Final Answer
- `confidence < τ` → Iterative Retrieval

**Graph change:**
```
is_sup → confidence_scorer
  ├── confidence ≥ τ → Final Answer
  └── confidence < τ → iterative retrieval
```

**Key files:**
- [NEW] `acsrag/nodes/confidence_scorer.py`
- [NEW] `acsrag/graphs/phase6_confidence.py`
- [NEW] `acsrag/notebooks/phase6_confidence_scoring.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add confidence sub-scores and overall
- [MODIFY] `acsrag/core/models.py` — Add `ConfidenceScore`

---

### Phase 7 — Claim / Evidence Verification

**Goal:** After generation, explicitly extract claims from the answer and verify each claim against retrieved evidence.

**New component:**

#### `claim_verifier.py`
- **Step 1:** Extract claims from the generated answer
```python
class ClaimExtraction(BaseModel):
    claims: List[str]
```
- **Step 2:** For each claim, check if it is supported by evidence
```python
class ClaimVerification(BaseModel):
    claim: str
    status: Literal["SUPPORTED", "UNSUPPORTED", "PARTIALLY_SUPPORTED"]
    supporting_evidence: Optional[str]
```
- Feeds into confidence scoring (unsupported claims reduce `citation_coverage`)

**Graph change:**
```
generate → self_reflection → claim_verifier → confidence_scorer → ...
```

**Key files:**
- [NEW] `acsrag/nodes/claim_verifier.py`
- [NEW] `acsrag/graphs/phase7_verification.py`
- [NEW] `acsrag/notebooks/phase7_claim_verification.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add `claims`, `claim_verdicts`
- [MODIFY] `acsrag/core/models.py` — Add `ClaimExtraction`, `ClaimVerification`

---

### Phase 8 — Bounded Iterative Retrieval

**Goal:** When confidence is below threshold, re-retrieve and regenerate with a hard iteration limit.

**New component:**

#### `iterative_controller.py`
- Manages the retrieval-generation-evaluation loop
- Tracks `iteration_count` vs `MAX_ITERATIONS` (default 3)
- On each iteration:
  1. Rewrites query based on what's missing (using claim verification feedback)
  2. Re-retrieves
  3. Regenerates
  4. Re-evaluates confidence
- If `MAX_ITERATIONS` reached and still below threshold → return best answer so far with confidence metadata

**Graph change (the iterative loop):**
```
confidence < τ → iterative_controller → query_rewrite → retrieval → rerank → compress → generate → verify → confidence_score
                        ↑                                                                                          │
                        └────────────────────── iteration < MAX ────────────────────────────────────────────────────┘
```

**Key files:**
- [NEW] `acsrag/nodes/iterative_controller.py`
- [NEW] `acsrag/graphs/phase8_iterative.py`
- [NEW] `acsrag/notebooks/phase8_iterative_retrieval.ipynb`
- [MODIFY] `acsrag/core/state.py` — Add `iteration_count`, `max_iterations`, `best_answer`, `best_confidence`

---

### Phase 9 — Benchmark: Naive RAG vs CRAG vs Self-RAG vs ACSRAG

**Goal:** Quantitative comparison of all four systems on the same query set.

**Benchmark design:**

| System | Description |
|---|---|
| Naive RAG | `retrieve → generate` (Phase 1 baseline from `1_basic_rag.ipynb`) |
| CRAG | Full CRAG pipeline from `6_ambiguous.ipynb` |
| Self-RAG | Full Self-RAG from `self_rag_step7.ipynb` |
| ACSRAG | Full Phase 8 pipeline |

**Metrics to measure:**
- **Answer Quality**: LLM-as-judge scoring (relevance, completeness, accuracy)
- **Faithfulness**: Claim support rate (from claim verification)
- **Retrieval Precision**: Fraction of retrieved docs deemed relevant
- **Latency**: End-to-end time per query
- **Token Efficiency**: Total tokens consumed per query
- **Iteration Count**: Average iterations before convergence (ACSRAG only)

**Test queries:** A curated set of 15-20 queries spanning:
- Factual (in-corpus)
- Factual (out-of-corpus, requires web)
- Comparative
- Ambiguous
- Multi-hop
- Temporal

**Key files:**
- [NEW] `acsrag/graphs/phase9_benchmark.py` — Runner that executes all 4 systems
- [NEW] `acsrag/notebooks/phase9_benchmark.ipynb` — Results visualization
- [NEW] `acsrag/core/benchmark.py` — Evaluation metrics and scoring utilities

---

## Dependencies

```
# requirements.txt
langchain>=0.3.0
langchain-community>=0.3.0
langchain-openai>=0.3.0
langgraph>=0.3.0
langchain-text-splitters>=0.3.0
faiss-cpu>=1.7.0
python-dotenv>=1.0.0
pydantic>=2.0
rank-bm25>=0.2.2
sentence-transformers>=2.2.0
tavily-python>=0.3.0
tiktoken>=0.5.0
matplotlib>=3.7.0
pandas>=2.0.0
```

---

## Verification Plan

### Automated Tests
Each phase notebook will include:
1. **Smoke test** — Run 2-3 queries and assert non-empty answers
2. **Regression test** — Ensure previous phase queries still work
3. **Component test** — Verify each new node in isolation (e.g. intent classifier returns valid enum, reranker reduces doc count)

### Manual Verification
- **Phase 1**: Verify the unified graph handles all 3 CRAG verdicts AND the Self-RAG revision loop
- **Phase 2**: Verify BM25 results differ from vector results; verify fusion merges correctly
- **Phase 3**: Verify reranking reorders documents (similarity rank ≠ rerank)
- **Phase 4**: Verify context size reduces measurably after compression
- **Phase 5**: Verify different intents route to different retrieval strategies
- **Phase 6**: Verify confidence scores are in `[0, 1]` and threshold routing works
- **Phase 7**: Verify claims are extracted and matched against evidence
- **Phase 8**: Verify iteration loop terminates at `MAX_ITERATIONS`
- **Phase 9**: Compare metrics across all 4 systems; generate visualization

---

## Open Questions

> [!IMPORTANT]
> **Document corpus**: Should the ACSRAG system use both document sets (deep learning books + company PDFs), or should we pick one for consistency? Using both would demonstrate versatility but adds complexity to the demo queries.

> [!IMPORTANT]
> **Reranker choice**: Should we use a local cross-encoder model (`sentence-transformers`) for reranking, or an LLM-based reranker (using `gpt-4o-mini` with structured output)? The cross-encoder is faster/cheaper but requires an additional dependency; the LLM approach is more consistent with the rest of the architecture.

> [!IMPORTANT]
> **Notebook vs Python modules**: The current projects are notebook-only. The plan proposes `.py` modules in `acsrag/` with thin demo notebooks. This makes the code testable and importable. Is this structure acceptable, or do you prefer everything in notebooks?

> [!WARNING]
> **API costs**: The full ACSRAG pipeline with iterative retrieval can make many LLM calls per query (intent classification, multi-query rewrite, document grading, reranking, generation, reflection, claim verification, confidence scoring — potentially repeated 3x). Consider using `gpt-4o-mini` throughout to manage costs. The benchmark phase will be especially expensive.
