"""
Phase 2 — Hybrid Retrieval Graph
================================
Introduces multi-query rewriting, parallel retrieval (Vector, BM25, Web),
and RRF fusion.

Graph Flow
----------
::

    START → decide_retrieval
      ├── NO  → generate_direct → END
      └── YES → generate_multi_queries
                  │
                  ▼
                route_retrieval (Parallel)
                  ├── vector_search
                  ├── bm25_search
                  └── web_search
                          │
                          ▼
                    rrf_fusion
                          │
                          ▼
                    eval_each_doc (CRAG)
                      ├── CORRECT   → refine → generate_from_context → is_sup
                      ├── AMBIGUOUS → rewrite_query → web_search (fallback) → refine ...
                      └── INCORRECT → rewrite_query → web_search (fallback) → refine ...
"""

from typing import List
from pathlib import Path

from langgraph.graph import StateGraph, START, END

from acsrag.core.state import ACSRAGState
from acsrag.core.utils import load_and_chunk_pdfs

# Node imports
from acsrag.nodes.decide_retrieval import decide_retrieval, route_after_decide
from acsrag.nodes.query_rewriter import generate_multi_queries, rewrite_query
from acsrag.nodes.retrieval_router import route_retrieval
from acsrag.nodes.vector_retriever import build_vector_store, build_vector_retriever, make_retrieve_node
from acsrag.nodes.bm25_retriever import build_bm25_retriever, make_bm25_retrieve_node
from acsrag.nodes.web_retriever import web_search
from acsrag.nodes.result_fusion import rrf_fusion
from acsrag.nodes.document_grader import eval_each_doc, route_after_eval
from acsrag.nodes.context_refiner import refine
from acsrag.nodes.generator import generate_from_context, generate_direct, no_answer_found
from acsrag.nodes.self_reflection import is_sup, revise_answer, accept_answer, route_after_issup
from acsrag.nodes.usefulness_checker import is_use, route_after_isuse, rewrite_question


def build_phase2_graph(pdf_paths: List[str | Path]):
    """Build the Phase 2 Hybrid Retrieval graph."""
    
    # ── Build stores & retrievers ────────────────────────────────────────
    chunks = load_and_chunk_pdfs(pdf_paths)
    
    vector_store = build_vector_store(chunks)
    vector_retriever = build_vector_retriever(vector_store)
    vector_search_node = make_retrieve_node(vector_retriever)
    
    bm25_retriever = build_bm25_retriever(chunks)
    bm25_search_node = make_bm25_retrieve_node(bm25_retriever)

    # ── Build graph ──────────────────────────────────────────────────────
    g = StateGraph(ACSRAGState)

    g.add_node("decide_retrieval", decide_retrieval)
    g.add_node("generate_multi_queries", generate_multi_queries)
    
    # Parallel retrieval nodes
    g.add_node("vector_search", vector_search_node)
    g.add_node("bm25_search", bm25_search_node)
    g.add_node("web_search_parallel", web_search)
    
    g.add_node("rrf_fusion", rrf_fusion)
    g.add_node("eval_each_doc", eval_each_doc)
    g.add_node("rewrite_query", rewrite_query)
    g.add_node("web_search_fallback", web_search) # Reusing web_search for fallback
    g.add_node("refine", refine)
    g.add_node("generate_from_context", generate_from_context)
    g.add_node("generate_direct", generate_direct)
    g.add_node("is_sup", is_sup)
    g.add_node("revise_answer", revise_answer)
    g.add_node("accept_answer", accept_answer)
    g.add_node("is_use", is_use)
    g.add_node("rewrite_question", rewrite_question)
    g.add_node("no_answer_found", no_answer_found)

    # ── Edges ────────────────────────────────────────────────────────────

    g.add_edge(START, "decide_retrieval")

    g.add_conditional_edges(
        "decide_retrieval",
        route_after_decide,
        {
            "retrieve": "generate_multi_queries",
            "generate_direct": "generate_direct",
        },
    )
    g.add_edge("generate_direct", END)

    # Parallel routing
    g.add_conditional_edges("generate_multi_queries", route_retrieval)
    
    # Join parallel nodes into fusion
    g.add_edge("vector_search", "rrf_fusion")
    g.add_edge("bm25_search", "rrf_fusion")
    g.add_edge("web_search_parallel", "rrf_fusion")
    
    # Fusion to Eval
    g.add_edge("rrf_fusion", "eval_each_doc")

    # CRAG fallback
    g.add_conditional_edges(
        "eval_each_doc",
        route_after_eval,
        {
            "refine": "refine",
            "rewrite_query": "rewrite_query",
        },
    )
    
    g.add_edge("rewrite_query", "web_search_fallback")
    g.add_edge("web_search_fallback", "refine")

    # Rest of the pipeline (Self-RAG)
    g.add_edge("refine", "generate_from_context")
    g.add_edge("generate_from_context", "is_sup")
    
    g.add_conditional_edges(
        "is_sup",
        route_after_issup,
        {"accept_answer": "accept_answer", "revise_answer": "revise_answer"},
    )
    g.add_edge("revise_answer", "is_sup")
    
    g.add_edge("accept_answer", "is_use")
    g.add_conditional_edges(
        "is_use",
        route_after_isuse,
        {"__end__": END, "rewrite_question": "rewrite_question", "no_answer_found": "no_answer_found"},
    )
    
    # Loop back to retrieval
    g.add_edge("rewrite_question", "generate_multi_queries")
    g.add_edge("no_answer_found", END)

    return g.compile()


def run_phase2(app, question: str) -> dict:
    """Invoke the Phase 2 graph."""
    initial_state: ACSRAGState = {"question": question}
    return app.invoke(initial_state)
