"""
Context Refiner Node
====================
Ported from CRAG notebook 6.
Decomposes context into sentence-level strips and uses an LLM judge
to keep only sentences that directly help answer the question.
"""

from typing import List

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.models import KeepOrDrop
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import decompose_to_sentences, get_llm


# ── Prompt ───────────────────────────────────────────────────────────────────

_FILTER_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a strict relevance filter.\n"
        "Return keep=true only if the sentence directly helps answer the question.\n"
        "Use ONLY the sentence. Output JSON only.",
    ),
    ("human", "Question: {question}\n\nSentence:\n{sentence}"),
])


# ── Node function ────────────────────────────────────────────────────────────

def refine(state: ACSRAGState) -> dict:
    """
    Decompose documents into sentences, filter by relevance, and produce
    a refined context string.

    Source selection logic (from CRAG):
    - CORRECT   → use good_docs only
    - INCORRECT → use web_docs only
    - AMBIGUOUS → blend good_docs + web_docs
    """
    llm = get_llm()
    chain = _FILTER_PROMPT | llm.with_structured_output(KeepOrDrop)

    verdict = state.get("verdict", "CORRECT")
    q = state["question"]

    if verdict == "CORRECT":
        docs_to_use = state.get("good_docs", [])
    elif verdict == "INCORRECT":
        docs_to_use = state.get("web_docs", [])
    else:  # AMBIGUOUS
        docs_to_use = (state.get("good_docs", []) or []) + (state.get("web_docs", []) or [])

    context = "\n\n".join(d.page_content for d in docs_to_use).strip()
    strips = decompose_to_sentences(context)

    kept: List[str] = []
    for s in strips:
        result: KeepOrDrop = chain.invoke({"question": q, "sentence": s})
        if result.keep:
            kept.append(s)

    refined_context = "\n".join(kept).strip()

    return {
        "strips": strips,
        "kept_strips": kept,
        "refined_context": refined_context,
        "context": refined_context,  # also set the generic context field
    }
