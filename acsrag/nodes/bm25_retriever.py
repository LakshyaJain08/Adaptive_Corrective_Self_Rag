"""
BM25 Retriever Node
===================
Performs lexical (keyword) search against the document corpus using BM25.
"""

from typing import List

from langchain_core.documents import Document
from langchain_community.retrievers import BM25Retriever

from acsrag.core.config import BM25_TOP_K
from acsrag.core.state import ACSRAGState


# ── Factory ──────────────────────────────────────────────────────────────────

def build_bm25_retriever(docs: List[Document]) -> BM25Retriever:
    """Build a BM25 retriever from chunked documents."""
    if not docs:
        docs = [Document(page_content="EMPTY_CORPUS_PLACEHOLDER", metadata={"source": "empty"})]
    retriever = BM25Retriever.from_documents(docs)
    retriever.k = BM25_TOP_K
    return retriever


# ── Node function ────────────────────────────────────────────────────────────

def make_bm25_retrieve_node(retriever: BM25Retriever):
    """
    Create a ``bm25_search`` node function that closes over the given retriever.
    Supports multi-query retrieval by running BM25 for each sub-query.
    """
    def bm25_search(state: ACSRAGState) -> dict:
        queries = state.get("multi_queries", [state["question"]])
        all_docs = []
        for q in queries:
            all_docs.extend(retriever.invoke(q))
        
        # Deduplicate exactly (since RRF will handle semantic deduplication/ranking)
        seen_contents = set()
        unique_docs = []
        for d in all_docs:
            if d.page_content not in seen_contents:
                seen_contents.add(d.page_content)
                unique_docs.append(d)
                
        return {"bm25_docs": unique_docs}

    return bm25_search
