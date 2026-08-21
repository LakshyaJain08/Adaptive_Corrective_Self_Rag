"""
Confidence Scorer Node
======================
Replaces the binary usefulness checker (is_use) with a quantitative 
scoring system. Calculates sub-scores for context relevance, answer 
faithfulness, and completeness.
"""

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.config import CONFIDENCE_THRESHOLD
from acsrag.core.models import ConfidenceScore
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm

_CONFIDENCE_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert evaluator for an advanced RAG system.
Evaluate the generated answer against the refined context and the original question.
You are also provided with a strict claim verification report. Use this report heavily to determine answer_faithfulness (penalize if claims are UNSUPPORTED).
Provide scores between 0.0 and 1.0 for:
1. retrieval_score: How relevant are the retrieved documents to the query?
2. context_relevance: Does the assembled context actually contain the information needed to answer the question?
3. answer_faithfulness: Is the answer strictly derived from the context (no hallucinations)?
4. citation_coverage: What fraction of the answer's claims are supported by evidence?
5. overall_confidence: A weighted overall confidence score. CRITICAL RULE: If the answer states that it cannot answer the question, or if context_relevance is low, overall_confidence MUST be below 0.5.
"""),
    ("human", "Question: {question}\n\nContext:\n{context}\n\nAnswer:\n{answer}\n\nClaim Verification Report:\n{claim_report}")
])

def score_confidence(state: ACSRAGState) -> dict:
    """Evaluate the generated answer and produce quantitative confidence scores."""
    llm = get_llm()
    chain = _CONFIDENCE_PROMPT | llm.with_structured_output(ConfidenceScore)
    
    # Format claim verdicts if available
    claim_verdicts = state.get("claim_verdicts", [])
    if claim_verdicts:
        import json
        claim_report = json.dumps(claim_verdicts, indent=2)
    else:
        claim_report = "No factual claims extracted."
    
    out: ConfidenceScore = chain.invoke({
        "question": state["question"],
        "context": state.get("refined_context", ""),
        "answer": state.get("answer", ""),
        "claim_report": claim_report
    })
    
    current_best = state.get("best_confidence", 0.0)
    current_best_answer = state.get("best_answer", "")
    
    if out.overall_confidence > current_best:
        best_confidence = out.overall_confidence
        best_answer = state.get("answer", "")
    else:
        best_confidence = current_best
        best_answer = current_best_answer
    
    return {
        "confidence_scores": out.model_dump(),
        "best_confidence": best_confidence,
        "best_answer": best_answer
    }

def route_after_confidence(state: ACSRAGState) -> str:
    """Route based on the overall confidence score."""
    from acsrag.core.config import CONFIDENCE_THRESHOLD, MAX_ITERATIONS
    scores = state.get("confidence_scores", {})
    overall = scores.get("overall_confidence", 0.0)
    iterations = state.get("iterations", 0)
    
    if overall >= CONFIDENCE_THRESHOLD or iterations >= MAX_ITERATIONS - 1:
        return "accept_answer" # Which effectively ends the graph in this phase
    else:
        return "rewrite_question" # Trigger iterative retrieval
