"""
Document Grader Node (CRAG)
===========================
Ported from CRAG notebook 6 (ambiguous variant).
Evaluates each retrieved document with a score in [0, 1] and produces
a three-way verdict: CORRECT / INCORRECT / AMBIGUOUS.
"""

from typing import List

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.config import UPPER_TH, LOWER_TH
from acsrag.core.models import DocEvalScore
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm


# ── Prompt ───────────────────────────────────────────────────────────────────

_EVAL_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a strict retrieval evaluator for RAG.\n"
        "You will be given ONE retrieved chunk and a question. ASSUME ALL CHUNKS ARE INTERNAL DOCUMENTS FROM NEXAAI SOLUTIONS. Do not penalize chunks for failing to explicitly mention the company name.\n"
        "Return a relevance score in [0.0, 1.0].\n"
        "- 1.0: chunk alone is sufficient to answer fully/mostly\n"
        "- 0.0: chunk is irrelevant\n"
        "Be conservative with high scores.\n"
        "CRITICAL RULE: If the user asks about a specific EXTERNAL brand, product, or entity (e.g. Starlink, Microsoft) and the chunk only talks about general categories (e.g. internet, generic policies), you MUST score it below 0.2.\n"
        "If the question asks for a comparison between our internal policies (NexaAI) and an external entity (e.g. Microsoft), internal policies are partially relevant and you MUST score them exactly 0.8 to trigger hybrid web blending.\n"
        "Also return a short reason.\n"
        "Output JSON only.",
    ),
    ("human", "Question: {question}\n\nChunk:\n{chunk}"),
])


# ── Node function ────────────────────────────────────────────────────────────

def eval_each_doc(state: ACSRAGState) -> dict:
    """
    Score each doc and classify retrieval quality.

    Returns
    -------
    dict with ``good_docs``, ``verdict``, ``eval_reason``
    """
    llm = get_llm()
    chain = _EVAL_PROMPT | llm.with_structured_output(DocEvalScore)

    q = state["question"]
    scores: List[float] = []
    good: List[Document] = []

    # Latency Fix: We only evaluate the top 2 ranked documents instead of all of them.
    # The pre-filter and CrossEncoder make the top 2 extremely high-signal, so we don't need
    # to spam the LLM 5 times. This saves ~10s of sequential latency!
    top_docs = state.get("docs", [])[:2]
    for d in top_docs:
        out: DocEvalScore = chain.invoke({"question": q, "chunk": d.page_content})
        scores.append(out.score)
        if out.score > LOWER_TH:
            good.append(d)
            
    # Preserve any un-evaluated docs as fallback context if needed, but only mark graded ones as 'good_docs'

    # Three-way verdict
    if any(s > UPPER_TH for s in scores):
        return {
            "good_docs": good,
            "verdict": "CORRECT",
            "eval_reason": f"At least one chunk scored > {UPPER_TH}.",
        }

    if scores and all(s < LOWER_TH for s in scores):
        return {
            "good_docs": [],
            "verdict": "INCORRECT",
            "eval_reason": f"All chunks scored < {LOWER_TH}.",
        }

    return {
        "good_docs": good,
        "verdict": "AMBIGUOUS",
        "eval_reason": f"No chunk scored > {UPPER_TH}, but not all < {LOWER_TH}.",
    }


# ── Router ───────────────────────────────────────────────────────────────────

def route_after_eval(state: ACSRAGState) -> str:
    """
    Route based on CRAG verdict.

    CORRECT   → refine  (use internal docs only)
    INCORRECT → rewrite_query (web search path)
    AMBIGUOUS → rewrite_query (web search + blend)
    """
    if state.get("verdict") == "CORRECT":
        return "refine"
    return "rewrite_query"
