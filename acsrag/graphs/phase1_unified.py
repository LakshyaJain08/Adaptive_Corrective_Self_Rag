"""
Phase 1 — Unified CRAG + Self-RAG Graph
========================================
Merges the full Corrective RAG pipeline (3-way verdict, web search fallback,
sentence-level refinement) with the full Self-RAG post-generation loop
(support verification, revision, usefulness check, query rewriting).

Graph Flow
----------
::

    START → decide_retrieval
      ├── NO  → generate_direct → END
      └── YES → retrieve → eval_each_doc (CRAG 3-way)
                  ├── CORRECT   → refine → generate → is_sup
                  ├── AMBIGUOUS → rewrite_query → web_search → refine → generate → is_sup
                  └── INCORRECT → rewrite_query → web_search → refine → generate → is_sup
                                                                          │
                                                          ┌───────────────┤
                                                     fully_supported   partial/no
                                                          │                │
                                                      accept_answer   revise_answer
                                                          │                │
                                                       is_use          → is_sup (loop)
                                                      ┌───┴───┐
                                                  useful   not_useful
                                                    │          │
                                                   END    rewrite_question → retrieve (loop)
"""

from typing import List
from pathlib import Path

from langchain_core.documents import Document
from langgraph.graph import StateGraph, START, END

from acsrag.core.state import ACSRAGState
from acsrag.core.utils import load_and_chunk_pdfs

# Node imports
from acsrag.nodes.decide_retrieval import decide_retrieval, route_after_decide
from acsrag.nodes.vector_retriever import build_vector_store, build_vector_retriever, make_retrieve_node
from acsrag.nodes.document_grader import eval_each_doc, route_after_eval
from acsrag.nodes.query_rewriter import rewrite_query
from acsrag.nodes.web_retriever import web_search
from acsrag.nodes.context_refiner import refine
from acsrag.nodes.generator import generate_from_context, generate_direct, no_answer_found
from acsrag.nodes.self_reflection import is_sup, revise_answer, accept_answer, route_after_issup
from acsrag.nodes.usefulness_checker import is_use, route_after_isuse, rewrite_question


def build_phase1_graph(pdf_paths: List[str | Path]):
    """
    Build the Phase 1 unified CRAG + Self-RAG graph.

    Parameters
    ----------
    pdf_paths : list of paths to PDF files for the knowledge base

    Returns
    -------
    Compiled LangGraph application
    """
    # ── Build vector store & retriever ───────────────────────────────────
    chunks = load_and_chunk_pdfs(pdf_paths)
    vector_store = build_vector_store(chunks)
    retriever = build_vector_retriever(vector_store)
    retrieve_node = make_retrieve_node(retriever)

    # ── Build graph ──────────────────────────────────────────────────────
    g = StateGraph(ACSRAGState)

    # Add all nodes
    g.add_node("decide_retrieval", decide_retrieval)
    g.add_node("retrieve", retrieve_node)
    g.add_node("eval_each_doc", eval_each_doc)
    g.add_node("rewrite_query", rewrite_query)
    g.add_node("web_search", web_search)
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

    # Entry: decide whether to retrieve
    g.add_edge(START, "decide_retrieval")

    # Retrieval decision routing
    g.add_conditional_edges(
        "decide_retrieval",
        route_after_decide,
        {
            "retrieve": "retrieve",
            "generate_direct": "generate_direct",
        },
    )

    # Direct generation → END
    g.add_edge("generate_direct", END)

    # Retrieval → CRAG evaluation
    g.add_edge("retrieve", "eval_each_doc")

    # CRAG 3-way routing
    g.add_conditional_edges(
        "eval_each_doc",
        route_after_eval,
        {
            "refine": "refine",           # CORRECT path
            "rewrite_query": "rewrite_query",  # INCORRECT / AMBIGUOUS path
        },
    )

    # Web search path
    g.add_edge("rewrite_query", "web_search")
    g.add_edge("web_search", "refine")

    # Refine → Generate → Self-Reflection
    g.add_edge("refine", "generate_from_context")
    g.add_edge("generate_from_context", "is_sup")

    # Self-RAG IsSUP routing
    g.add_conditional_edges(
        "is_sup",
        route_after_issup,
        {
            "accept_answer": "accept_answer",
            "revise_answer": "revise_answer",
        },
    )

    # Revision loop back to is_sup
    g.add_edge("revise_answer", "is_sup")

    # Accepted answer → usefulness check
    g.add_edge("accept_answer", "is_use")

    # Usefulness routing
    g.add_conditional_edges(
        "is_use",
        route_after_isuse,
        {
            "__end__": END,
            "rewrite_question": "rewrite_question",
            "no_answer_found": "no_answer_found",
        },
    )

    # Rewrite question → re-retrieve (Self-RAG loop)
    g.add_edge("rewrite_question", "retrieve")

    # No answer found → END
    g.add_edge("no_answer_found", END)

    return g.compile()


def run_phase1(app, question: str) -> dict:
    """
    Convenience function to invoke the Phase 1 graph with a question.

    Returns the full final state dict.
    """
    initial_state: ACSRAGState = {
        "question": question,
    }
    return app.invoke(initial_state)
