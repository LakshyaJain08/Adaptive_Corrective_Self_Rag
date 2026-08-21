"""
Generator Node
===============
Provides two generation modes:
  1. ``generate_from_context`` — RAG-style answer grounded in retrieved context
  2. ``generate_direct`` — Answer using LLM general knowledge (no retrieval)

Ported from both CRAG (generate) and Self-RAG (generate_from_context / generate_direct).
"""

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm


# ── RAG Generation ───────────────────────────────────────────────────────────

_RAG_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a helpful assistant. Answer ONLY using the provided context.\n"
        "If the context is empty or insufficient, say: 'I don't know.'\n"
        "Do not mention that you are getting a context in your answer.",
    ),
    ("human", "Question: {question}\n\nContext:\n{context}"),
])


def generate_from_context(state: ACSRAGState) -> dict:
    """Generate an answer grounded in the refined context."""
    llm = get_llm()

    context = (
        state.get("refined_context")
        or state.get("context")
        or ""
    )

    if not context.strip():
        return {"answer": "No answer found.", "context": ""}

    out = (_RAG_PROMPT | llm).invoke({
        "question": state["question"],
        "context": context,
    })

    content = out.content
    if isinstance(content, list):
        content = " ".join([b.get("text", "") if isinstance(b, dict) else str(b) for b in content])

    return {"answer": content, "context": context}


# ── Direct Generation (no retrieval) ─────────────────────────────────────────

_DIRECT_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "Answer using only your general knowledge.\n"
        "If it requires specific document info, say:\n"
        "'I don't know based on my general knowledge.'",
    ),
    ("human", "{question}"),
])


def generate_direct(state: ACSRAGState) -> dict:
    """Generate an answer without retrieval, using LLM general knowledge."""
    llm = get_llm()
    out = (_DIRECT_PROMPT | llm).invoke({"question": state["question"]})
    content = out.content
    if isinstance(content, list):
        content = " ".join([b.get("text", "") if isinstance(b, dict) else str(b) for b in content])
    return {"answer": content}


# ── No Answer Found ──────────────────────────────────────────────────────────

def no_answer_found(state: ACSRAGState) -> dict:
    """Terminal node when the system cannot produce a reliable answer."""
    return {"answer": "No answer found.", "context": ""}
