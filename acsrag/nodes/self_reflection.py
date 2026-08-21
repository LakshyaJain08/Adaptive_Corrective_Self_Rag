"""
Self-Reflection Node
====================
Ported from Self-RAG steps 4-5.
Two sub-components:
  1. ``is_sup`` — Checks if the answer is supported by the context
  2. ``revise_answer`` — Revises the answer to be strictly grounded

Also contains the ``accept_answer`` pass-through node.
"""

from typing import Literal

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.config import MAX_REVISE_RETRIES
from acsrag.core.models import IsSUPDecision
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm


# ── IsSUP Prompt ─────────────────────────────────────────────────────────────

_ISSUP_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are verifying whether the ANSWER is supported by the CONTEXT.\n"
        "Return JSON with keys: issup, evidence.\n"
        "issup must be one of: fully_supported, partially_supported, no_support.\n\n"
        "How to decide issup:\n"
        "- fully_supported:\n"
        "  Every meaningful claim is explicitly supported by CONTEXT, and the ANSWER "
        "does NOT introduce any qualitative/interpretive words not in CONTEXT.\n"
        "- partially_supported:\n"
        "  Core facts supported, BUT the ANSWER includes ANY abstraction or "
        "qualitative phrasing not explicitly stated in CONTEXT.\n"
        "- no_support:\n"
        "  The key claims are not supported by CONTEXT.\n\n"
        "Rules:\n"
        "- Be strict: if you see ANY unsupported qualitative phrasing, choose partially_supported.\n"
        "- Evidence: include up to 3 short direct quotes from CONTEXT.\n"
        "- Do not use outside knowledge.",
    ),
    (
        "human",
        "Question:\n{question}\n\n"
        "Answer:\n{answer}\n\n"
        "Context:\n{context}\n",
    ),
])


def is_sup(state: ACSRAGState) -> dict:
    """Check whether the answer is supported by the context."""
    llm = get_llm()
    chain = _ISSUP_PROMPT | llm.with_structured_output(IsSUPDecision)

    decision: IsSUPDecision = chain.invoke({
        "question": state["question"],
        "answer": state.get("answer", ""),
        "context": state.get("context", ""),
    })

    return {"issup": decision.issup, "evidence": decision.evidence}


# ── Revise Answer ────────────────────────────────────────────────────────────

_REVISE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a STRICT reviser.\n\n"
        "You must output based on the following format:\n\n"
        "FORMAT (quote-only answer):\n"
        "- <direct quote from the CONTEXT>\n"
        "- <direct quote from the CONTEXT>\n\n"
        "Rules:\n"
        "- Use ONLY the CONTEXT.\n"
        "- Do NOT add any new words besides bullet dashes and the quotes themselves.\n"
        "- Do NOT explain anything.\n"
        "- Do NOT say 'context', 'not mentioned', 'does not mention', 'not provided', etc.",
    ),
    (
        "human",
        "Question:\n{question}\n\n"
        "Current Answer:\n{answer}\n\n"
        "CONTEXT:\n{context}",
    ),
])


def revise_answer(state: ACSRAGState) -> dict:
    """Revise the answer to be strictly grounded in context."""
    llm = get_llm()
    out = (_REVISE_PROMPT | llm).invoke({
        "question": state["question"],
        "answer": state.get("answer", ""),
        "context": state.get("context", ""),
    })
    content = out.content
    if isinstance(content, list):
        content = " ".join([b.get("text", "") if isinstance(b, dict) else str(b) for b in content])
    return {
        "answer": content,
        "retries": state.get("retries", 0) + 1,
    }


# ── Accept Answer (pass-through) ────────────────────────────────────────────

def accept_answer(state: ACSRAGState) -> dict:
    """Keep the answer as-is, or revert to the best previous iteration if current is worse."""
    scores = state.get("confidence_scores", {})
    current_confidence = scores.get("overall_confidence", 0.0)
    best_confidence = state.get("best_confidence", 0.0)
    best_answer = state.get("best_answer")

    if best_answer and best_confidence > current_confidence:
        print(f"\n--- Reverting to best iteration (Score {best_confidence} > {current_confidence}) ---")
        final_answer = best_answer
    else:
        final_answer = state.get("answer", "")

    print(f"\n================ FINAL RESULT ================")
    print(f"Question: {state.get('question')}")
    print(f"Answer: {final_answer}")
    print(f"==============================================\n")

    if best_answer and best_confidence > current_confidence:
        return {"answer": best_answer}
        
    return {}


# ── Router ───────────────────────────────────────────────────────────────────

def route_after_issup(state: ACSRAGState) -> Literal["accept_answer", "revise_answer"]:
    """Route based on support verification."""
    if state.get("issup") == "fully_supported":
        return "accept_answer"

    if state.get("retries", 0) >= MAX_REVISE_RETRIES:
        return "accept_answer"  # exhausted retries

    return "revise_answer"
