"""
Phase 8 — Bounded Iterative Retrieval Graph
===========================================
Adds an iteration counter to prevent infinite retrieval loops.

Graph Flow
----------
::
    ... (Phase 5 upstream) ...
       │
       ▼
    generate_from_context 
       │
       ▼
     is_sup (Self-RAG check)
       ├── revise_answer → is_sup (Rapid internal loop)
       └── extract_and_verify_claims
             │
             ▼
         score_confidence
             │
             ▼
         route_after_confidence
             ├── OVER_THRESHOLD or MAX_ITERATIONS → accept_answer → END
             └── UNDER_THRESHOLD → rewrite_question (increments iterations) → generate_multi_queries (Iterative Retrieval loop)
"""

from typing import List
from pathlib import Path

from langgraph.graph import StateGraph, START, END

from acsrag.core.state import ACSRAGState
from acsrag.core.utils import load_and_chunk_pdfs

# Node imports
from acsrag.nodes.intent_classifier import classify_intent
from acsrag.nodes.decide_retrieval import decide_retrieval, route_after_decide
from acsrag.nodes.query_rewriter import generate_multi_queries, rewrite_query
from acsrag.nodes.retrieval_router import route_retrieval
from acsrag.nodes.vector_retriever import build_vector_store, build_vector_retriever, make_retrieve_node
from acsrag.nodes.bm25_retriever import build_bm25_retriever, make_bm25_retrieve_node
from acsrag.nodes.web_retriever import web_search
from acsrag.nodes.result_fusion import rrf_fusion
from acsrag.nodes.document_reranker import build_cross_encoder, make_rerank_node
from acsrag.nodes.context_compressor import make_compressor_node
from acsrag.nodes.document_grader import eval_each_doc, route_after_eval
from acsrag.nodes.generator import generate_from_context, generate_direct, no_answer_found
from acsrag.nodes.self_reflection import is_sup, revise_answer, accept_answer
from acsrag.nodes.usefulness_checker import rewrite_question
from acsrag.nodes.claim_verifier import extract_and_verify_claims
from acsrag.nodes.confidence_scorer import score_confidence, route_after_confidence

def route_after_issup_phase8(state: ACSRAGState) -> str:
    """Route to claim verification instead of directly to confidence scorer."""
    sup = state.get("issup", "no_support")
    retries = state.get("retries", 0)
    from acsrag.core.config import MAX_REVISE_RETRIES
    if sup == "fully_supported" or retries >= MAX_REVISE_RETRIES:
        return "extract_and_verify_claims"
    return "revise_answer"

def build_phase8_graph(pdf_paths: List[str | Path], cache_suffix: str = ""):
    """Build the Phase 8 Bounded Iterative Retrieval graph."""
    
    # ── Build stores & models ────────────────────────────────────────────
    chunks = load_and_chunk_pdfs(pdf_paths, cache_suffix=cache_suffix)
    
    vector_store = build_vector_store(chunks, cache_suffix=cache_suffix)
    vector_retriever = build_vector_retriever(vector_store)
    vector_search_node = make_retrieve_node(vector_retriever)
    
    bm25_retriever = build_bm25_retriever(chunks)
    bm25_search_node = make_bm25_retrieve_node(bm25_retriever)
    
    encoder = build_cross_encoder()
    rerank_node = make_rerank_node(encoder, top_k=5)
    compress_node = make_compressor_node(encoder, max_tokens=1500)

    # ── Build graph ──────────────────────────────────────────────────────
    g = StateGraph(ACSRAGState)

    g.add_node("classify_intent", classify_intent)
    g.add_node("decide_retrieval", decide_retrieval)
    g.add_node("generate_multi_queries", generate_multi_queries)
    
    g.add_node("vector_search", vector_search_node)
    g.add_node("bm25_search", bm25_search_node)
    g.add_node("web_search_parallel", web_search)
    
    g.add_node("rrf_fusion", rrf_fusion)
    g.add_node("rerank_docs", rerank_node)
    g.add_node("eval_each_doc", eval_each_doc)
    g.add_node("rewrite_query", rewrite_query)
    g.add_node("web_search_fallback", web_search)
    g.add_node("compress_context", compress_node)
    
    g.add_node("generate_from_context", generate_from_context)
    g.add_node("generate_direct", generate_direct)
    g.add_node("is_sup", is_sup)
    g.add_node("revise_answer", revise_answer)
    g.add_node("accept_answer", accept_answer)
    g.add_node("rewrite_question", rewrite_question)
    
    g.add_node("extract_and_verify_claims", extract_and_verify_claims)
    g.add_node("score_confidence", score_confidence)

    # ── Edges ────────────────────────────────────────────────────────────

    g.add_edge(START, "classify_intent")
    g.add_edge("classify_intent", "decide_retrieval")

    g.add_conditional_edges(
        "decide_retrieval",
        route_after_decide,
        {
            "retrieve": "generate_multi_queries",
            "generate_direct": "generate_direct",
        },
    )
    g.add_edge("generate_direct", END)

    g.add_conditional_edges(
        "generate_multi_queries",
        route_retrieval,
        ["vector_search", "bm25_search", "web_search_parallel"]
    )
    
    g.add_edge("vector_search", "rrf_fusion")
    g.add_edge("bm25_search", "rrf_fusion")
    g.add_edge("web_search_parallel", "rrf_fusion")
    
    g.add_edge("rrf_fusion", "rerank_docs")
    g.add_edge("rerank_docs", "eval_each_doc")

    g.add_conditional_edges(
        "eval_each_doc",
        route_after_eval,
        {
            "refine": "compress_context",
            "rewrite_query": "rewrite_query",
        },
    )
    
    g.add_edge("rewrite_query", "web_search_fallback")
    g.add_edge("web_search_fallback", "compress_context")

    g.add_edge("compress_context", "generate_from_context")
    g.add_edge("generate_from_context", "is_sup")
    
    g.add_conditional_edges(
        "is_sup",
        route_after_issup_phase8,
        {"extract_and_verify_claims": "extract_and_verify_claims", "revise_answer": "revise_answer"},
    )
    g.add_edge("revise_answer", "is_sup")
    
    g.add_edge("extract_and_verify_claims", "score_confidence")
    
    g.add_conditional_edges(
        "score_confidence",
        route_after_confidence,
        {
            "accept_answer": "accept_answer",
            "rewrite_question": "rewrite_question"
        }
    )
    g.add_edge("accept_answer", END)
    g.add_edge("rewrite_question", "generate_multi_queries")

    return g.compile()
