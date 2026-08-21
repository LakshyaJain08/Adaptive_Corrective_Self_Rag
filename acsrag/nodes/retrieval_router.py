"""
Retrieval Router Node
=====================
Decides which retrieval strategies to activate based on query characteristics.
In Phase 2, this is a simple heuristic (activates all three). In Phase 5,
it becomes adaptive based on intent classification.
"""

from typing import List

from acsrag.core.state import ACSRAGState


# ── Node function ────────────────────────────────────────────────────────────

def route_retrieval(state: ACSRAGState) -> List[str]:
    """
    Adaptive retrieval router.
    Uses Phase 5 intent classification to selectively activate retrieval strategies.
    Returns a list of node names to execute in parallel.
    """
    intent = state.get("intent", "FACTUAL")
    requires_web = state.get("requires_web", False)
    
    routes = ["vector_search"] # Always use vector search as baseline
    
    # BM25 is excellent for exact keywords, multi-hop, and comparative
    if intent in ["FACTUAL", "COMPARATIVE", "MULTI_HOP", "ANALYTICAL"]:
        routes.append("bm25_search")
        
    # Web search for temporal, out-of-domain, or explicit flag
    if requires_web or intent in ["TEMPORAL", "OUT_OF_DOMAIN"]:
        routes.append("web_search_parallel")
        
    return routes
