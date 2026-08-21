"""
Decide Retrieval Node
=====================
Ported from Self-RAG step 1.
Determines whether the question requires document retrieval
or can be answered directly from the LLM's general knowledge.
"""

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.models import RetrieveDecision
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm


# ── Prompt ───────────────────────────────────────────────────────────────────

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You decide whether retrieval is needed.\n"
        "Return JSON with key: should_retrieve (boolean).\n\n"
        "Guidelines:\n"
        "- should_retrieve=True if answering requires specific facts from documents.\n"
        "- should_retrieve=False for general explanations/definitions.\n"
        "- If unsure, choose True."
    ),
    ("human", "Question: {question}"),
])


# ── Node function ────────────────────────────────────────────────────────────

def decide_retrieval(state: ACSRAGState) -> dict:
    """Decide whether we need to retrieve documents."""
    llm = get_llm()
    chain = _PROMPT | llm.with_structured_output(RetrieveDecision)
    decision: RetrieveDecision = chain.invoke({"question": state["question"]})
    return {"need_retrieval": decision.should_retrieve}


# ── Router ───────────────────────────────────────────────────────────────────

def route_after_decide(state: ACSRAGState) -> str:
    """Route to 'retrieve' or 'generate_direct' based on retrieval decision."""
    return "retrieve" if state.get("need_retrieval", True) else "generate_direct"
