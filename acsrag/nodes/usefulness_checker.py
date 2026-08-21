"""
Usefulness Checker Node
=======================
Ported from Self-RAG step 6-7.
Judges whether the answer actually addresses the user's question.
If not useful and rewrite budget remains, triggers query rewriting
and re-retrieval.
"""

from typing import Literal

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.config import MAX_REWRITE_TRIES
from acsrag.core.models import IsUSEDecision, RewriteDecision
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm


# ── IsUSE Prompt ─────────────────────────────────────────────────────────────

_ISUSE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are judging USEFULNESS of the ANSWER for the QUESTION.\n\n"
        "Goal:\n"
        "- Decide if the answer actually addresses what the user asked.\n\n"
        "Return JSON with keys: isuse, reason.\n"
        "isuse must be one of: useful, not_useful.\n\n"
        "Rules:\n"
        "- useful: The answer directly answers the question or provides the requested info.\n"
        "- not_useful: The answer is generic, off-topic, or only gives background.\n"
        "- Do NOT use outside knowledge.\n"
        "- Do NOT re-check grounding (IsSUP already did that). "
        "Only check: 'Did we answer the question?'\n"
        "- Keep reason to 1 short line.",
    ),
    (
        "human",
        "Question:\n{question}\n\nAnswer:\n{answer}",
    ),
])


def is_use(state: ACSRAGState) -> dict:
    """Judge whether the answer is useful for the question."""
    llm = get_llm()
    chain = _ISUSE_PROMPT | llm.with_structured_output(IsUSEDecision)

    decision: IsUSEDecision = chain.invoke({
        "question": state["question"],
        "answer": state.get("answer", ""),
    })

    return {"isuse": decision.isuse, "use_reason": decision.reason}


# ── Router ───────────────────────────────────────────────────────────────────

def route_after_isuse(state: ACSRAGState) -> Literal["__end__", "rewrite_question", "no_answer_found"]:
    """
    Route after usefulness check.

    - useful → END
    - not_useful + budget → rewrite_question → re-retrieve
    - not_useful + no budget → no_answer_found
    """
    if state.get("isuse") == "useful":
        return "__end__"

    if state.get("rewrite_tries", 0) >= MAX_REWRITE_TRIES:
        return "no_answer_found"

    return "rewrite_question"


# ── Rewrite Question for Re-Retrieval ────────────────────────────────────────

_REWRITE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "Rewrite the user's QUESTION into a query optimised for vector "
        "retrieval over INTERNAL company PDFs.\n\n"
        "Rules:\n"
        "- Keep it short (6–16 words).\n"
        "- Preserve key entities.\n"
        "- Add 2–5 high-signal keywords that likely appear in policy/pricing docs.\n"
        "- Remove filler words.\n"
        "- Do NOT answer the question.\n"
        "- Output JSON with key: retrieval_query",
    ),
    (
        "human",
        "QUESTION:\n{question}\n\n"
        "Previous retrieval query:\n{retrieval_query}\n\n"
        "Answer (if any):\n{answer}",
    ),
])


def rewrite_question(state: ACSRAGState) -> dict:
    """
    Rewrite the question for a new round of vector retrieval.
    Resets doc-related state for a clean pass.
    """
    llm = get_llm()
    chain = _REWRITE_PROMPT | llm.with_structured_output(RewriteDecision)

    decision: RewriteDecision = chain.invoke({
        "question": state["question"],
        "retrieval_query": state.get("retrieval_query", ""),
        "answer": state.get("answer", ""),
    })

    return {
        "retrieval_query": decision.retrieval_query,
        "rewrite_tries": state.get("rewrite_tries", 0) + 1,
        "iterations": state.get("iterations", 0) + 1,
        # Reset for next retrieval pass
        "docs": [],
        "good_docs": [],
        "relevant_docs": [],
        "context": "",
        "refined_context": "",
    }
