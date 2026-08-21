"""
Web Retriever Node
==================
Ported from CRAG notebook 4/5/6.
Uses Tavily search to fetch web results when internal retrieval is poor.
"""

from typing import List

from langchain_core.documents import Document

from acsrag.core.config import WEB_MAX_RESULTS
from acsrag.core.state import ACSRAGState


# ── Node function ────────────────────────────────────────────────────────────

def web_search(state: ACSRAGState) -> dict:
    """
    Search the web using Tavily.

    Uses ``multi_queries`` if available, otherwise ``web_query``, otherwise ``question``.
    """
    from langchain_tavily import TavilySearch

    tavily = TavilySearch(max_results=WEB_MAX_RESULTS)
    
    # In Phase 2+ we might have multi_queries. If not, fallback to web_query or question.
    queries = state.get("multi_queries")
    if not queries:
        queries = [state.get("web_query") or state["question"]]

    web_docs: List[Document] = []
    seen_urls = set()
    
    for q in queries:
        # Prevent searching the web for local document references
        q_lower = q.lower()
        if any(k in q_lower for k in ["this document", "the document", "this pdf", "the pdf", "my resume", "this text", "the file"]):
            continue

        response = tavily.invoke({"query": q})
        for r in response.get("results", []) if isinstance(response, dict) else (response or []):
            url = r.get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            
            title = r.get("title", "")
            content = r.get("content", "") or r.get("snippet", "")
            text = f"TITLE: {title}\nURL: {url}\nCONTENT:\n{content}"
            web_docs.append(
                Document(page_content=text, metadata={"url": url, "title": title})
            )

    return {"web_docs": web_docs}
