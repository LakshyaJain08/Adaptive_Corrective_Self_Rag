"""
Vector Retriever Node
=====================
Performs similarity search against a FAISS vector store.
The retriever instance is built externally and injected via
``build_vector_retriever()``.
"""

from typing import List

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document

from acsrag.core.config import EMBEDDING_MODEL, VECTOR_TOP_K
from acsrag.core.state import ACSRAGState


# ── Factory ──────────────────────────────────────────────────────────────────

def build_vector_store(docs: List[Document], cache_suffix: str = "") -> FAISS:
    """Build a FAISS vector store using local HuggingFace embeddings or load from disk."""
    import os
    suffix = f"_{cache_suffix}" if cache_suffix else ""
    index_dir = f"faiss_index_cache{suffix}"
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    if os.path.exists(index_dir):
        return FAISS.load_local(index_dir, embeddings, allow_dangerous_deserialization=True)
        
    if not docs:
        docs = [Document(page_content="EMPTY_CORPUS_PLACEHOLDER", metadata={"source": "empty"})]
    store = FAISS.from_documents(docs, embeddings)
    store.save_local(index_dir)
    return store


def build_vector_retriever(vector_store: FAISS, k: int = VECTOR_TOP_K):
    """Return a LangChain retriever from the vector store."""
    return vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )


# ── Node function ────────────────────────────────────────────────────────────

def make_retrieve_node(retriever):
    """
    Create a ``retrieve`` node function that closes over the given retriever.

    Usage::

        retriever = build_vector_retriever(store)
        retrieve_node = make_retrieve_node(retriever)
        graph.add_node("retrieve", retrieve_node)
    """
    def retrieve(state: ACSRAGState) -> dict:
        queries = state.get("multi_queries", [state.get("retrieval_query") or state["question"]])
        metadata_filter = state.get("metadata_filter", {})
        
        all_docs = []
        for q in queries:
            # Use the underlying vectorstore directly to pass dynamic filters safely
            search_kwargs = {"k": retriever.search_kwargs.get("k", 5)}
            if metadata_filter:
                search_kwargs["filter"] = metadata_filter
                
            docs = retriever.vectorstore.similarity_search(q, **search_kwargs)
            all_docs.extend(docs)
            
        # Deduplicate exactly (since RRF will handle semantic deduplication/ranking)
        seen_contents = set()
        unique_docs = []
        for d in all_docs:
            if d.page_content not in seen_contents:
                seen_contents.add(d.page_content)
                unique_docs.append(d)
                
        return {"docs": unique_docs}

    return retrieve
