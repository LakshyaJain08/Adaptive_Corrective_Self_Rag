"""
Result Fusion Node
==================
Implements Reciprocal Rank Fusion (RRF) to merge results from Vector, BM25,
and Web search into a single ranked list.
"""

from typing import List, Dict

from langchain_core.documents import Document

from acsrag.core.state import ACSRAGState


# ── Node function ────────────────────────────────────────────────────────────

def rrf_fusion(state: ACSRAGState) -> dict:
    """
    Merge vector, bm25, and web docs using Reciprocal Rank Fusion (RRF).
    """
    vector_docs = state.get("docs", [])
    bm25_docs = state.get("bm25_docs", [])
    web_docs = state.get("web_docs", [])
    
    # RRF constant
    K = 60
    
    doc_scores: Dict[str, float] = {}
    doc_map: Dict[str, Document] = {}
    
    def add_to_rrf(docs: List[Document], weight: float = 1.0):
        for rank, doc in enumerate(docs):
            # Use content as unique identifier to deduplicate
            # For web docs, add URL to content to distinguish if needed, but page_content works
            doc_hash = hash(doc.page_content)
            
            if doc_hash not in doc_scores:
                doc_scores[doc_hash] = 0.0
                doc_map[doc_hash] = doc
                
            doc_scores[doc_hash] += weight * (1.0 / (rank + 1 + K))

    # Add each list of docs to RRF
    # We can slightly weight them differently if desired, but 1.0 is standard
    add_to_rrf(vector_docs, weight=1.0)
    add_to_rrf(bm25_docs, weight=1.0)
    add_to_rrf(web_docs, weight=0.8) # Slightly lower weight for web docs by default
    
    # Sort by RRF score descending
    sorted_doc_hashes = sorted(doc_scores.keys(), key=lambda h: doc_scores[h], reverse=True)
    fused_docs = [doc_map[h] for h in sorted_doc_hashes]
    
    # Take top 10 after fusion to avoid passing too much context to next steps
    fused_docs = fused_docs[:10]
    
    # In Phase 2, the fused_docs act as the "docs" for the next step (eval_each_doc)
    # We store it in fused_docs and also override docs so eval_each_doc works without modification
    return {
        "fused_docs": fused_docs,
        "docs": fused_docs # Overwrite docs with the fused result
    }
