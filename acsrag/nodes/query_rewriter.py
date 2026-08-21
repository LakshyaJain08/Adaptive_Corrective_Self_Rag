"""
Query Rewriter Node
===================
Ported from CRAG notebook 5/6.
Rewrites the user question into a web-search-optimised query.
"""

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.models import WebQuery, MultiQuery, MetadataFilter
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm


# ── Prompt ───────────────────────────────────────────────────────────────────

_REWRITE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "Rewrite the user question into a web search query composed of keywords.\n"
        "Rules:\n"
        "- Keep it short (6–14 words).\n"
        "- If the question implies recency (e.g., recent/latest/last week), "
        "add a constraint like (last 30 days).\n"
        "- Do NOT answer the question.\n"
        "- Return JSON with a single key: query",
    ),
    ("human", "Question: {question}"),
])


# ── Node function ────────────────────────────────────────────────────────────

def rewrite_query(state: ACSRAGState) -> dict:
    """Rewrite the question into a web-search query."""
    llm = get_llm()
    chain = _REWRITE_PROMPT | llm.with_structured_output(WebQuery)
    out: WebQuery = chain.invoke({"question": state["question"]})
    return {"web_query": out.query}


# ── Multi-Query Rewrite ──────────────────────────────────────────────────────

_MULTI_QUERY_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an AI language model assistant. Your task is to generate 3 "
        "different versions of the given user question to retrieve relevant documents from a vector database. "
        "By generating multiple perspectives on the user question, your goal is to help the user overcome some of the "
        "limitations of distance-based similarity search. Provide these alternative questions separated by newlines. "
        "Return JSON with key: queries",
    ),
    ("human", "Question: {question}"),
])


_METADATA_FILTER_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "Extract any mentioned departments (HR, IT, Finance) or years from the user query to use as a metadata filter.\n"
        "If none are mentioned, return null for those fields.\n"
        "Return JSON only."
    ),
    ("human", "Question: {question}"),
])

def generate_multi_queries(state: ACSRAGState) -> dict:
    """Generate multiple sub-queries for hybrid retrieval and extract metadata filters."""
    llm = get_llm()
    chain = _MULTI_QUERY_PROMPT | llm.with_structured_output(MultiQuery)
    # Use retrieval_query if it exists (from rewrite_question), else question
    query_to_rewrite = state.get("retrieval_query") or state["question"]
    out: MultiQuery = chain.invoke({"question": query_to_rewrite})
    
    # Extract metadata filters
    filter_chain = _METADATA_FILTER_PROMPT | llm.with_structured_output(MetadataFilter)
    filter_out: MetadataFilter = filter_chain.invoke({"question": query_to_rewrite})
    filter_dict = {k: v for k, v in filter_out.model_dump().items() if v is not None}
    
    return {
        "multi_queries": out.queries,
        "metadata_filter": filter_dict
    }
