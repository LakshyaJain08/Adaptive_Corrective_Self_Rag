"""
Document Reranker Node
======================
Uses a cross-encoder model to re-score and re-rank the retrieved/fused documents
against the query to get a highly accurate top-k selection.
"""

from typing import List

from langchain_core.documents import Document
from acsrag.core.state import ACSRAGState


# ── Factory ──────────────────────────────────────────────────────────────────

def build_cross_encoder(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    """
    Build and return a sentence-transformers CrossEncoder.
    Note: Requires sentence-transformers and PyTorch.
    """
    try:
        from sentence_transformers import CrossEncoder
        return CrossEncoder(model_name)
    except ImportError:
        import logging
        logging.warning("sentence-transformers not installed. Returning a dummy encoder.")
        
        class DummyEncoder:
            def predict(self, pairs):
                return [1.0] * len(pairs)
                
        return DummyEncoder()


# ── Node function ────────────────────────────────────────────────────────────

def make_rerank_node(encoder, top_k: int = 5):
    """
    Create a node that closes over the cross-encoder to rerank documents.
    """
    def rerank_docs(state: ACSRAGState) -> dict:
        docs = state.get("fused_docs") or state.get("docs", [])
        if not docs:
            return {}
            
        query = state.get("retrieval_query") or state["question"]
        
        # Prepare pairs for cross-encoder: (query, document_text)
        pairs = [[query, doc.page_content] for doc in docs]
        
        # Predict similarity scores
        scores = encoder.predict(pairs)
        
        # Sort documents by score descending
        doc_score_pairs = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
        
        # Keep top K
        reranked_docs = [doc for doc, score in doc_score_pairs[:top_k]]
        
        return {
            "reranked_docs": reranked_docs,
            "docs": reranked_docs  # Override docs for downstream nodes (e.g. eval_each_doc)
        }

    return rerank_docs
