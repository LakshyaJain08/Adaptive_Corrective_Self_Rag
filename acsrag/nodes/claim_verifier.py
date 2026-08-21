"""
Claim & Evidence Verifier Node
==============================
Extracts distinct factual claims from the generated answer and verifies 
each one against the refined context. This structured evidence is then 
passed to the Confidence Scorer to quantitatively penalize hallucinations.
"""

from langchain_core.prompts import ChatPromptTemplate
import json

from acsrag.core.models import ClaimExtraction, ClaimVerification
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm

_EXTRACT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert claim extractor.
Extract a list of distinct, factual claims made in the provided answer.
If the answer is simply conversational or states an inability to answer (e.g., 'I don't know'), return an empty list."""),
    ("human", "Answer:\n{answer}")
])

_VERIFY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a strict fact-checker. 
Given a context and a claim, verify if the claim is supported by the context.
Return SUPPORTED, UNSUPPORTED, or PARTIALLY_SUPPORTED.
Also provide the exact snippet or a brief reason as supporting_evidence."""),
    ("human", "Context:\n{context}\n\nClaim: {claim}")
])

def extract_and_verify_claims(state: ACSRAGState) -> dict:
    """Extract claims from the answer and verify them against context."""
    llm = get_llm()
    
    # 1. Extract claims
    extract_chain = _EXTRACT_PROMPT | llm.with_structured_output(ClaimExtraction)
    answer = state.get("answer", "")
    
    if not answer.strip():
         return {"claims": [], "claim_verdicts": []}
         
    extracted: ClaimExtraction = extract_chain.invoke({"answer": answer})
    claims = extracted.claims
    
    if not claims:
        return {"claims": [], "claim_verdicts": []}
        
    # 2. Verify each claim
    verify_chain = _VERIFY_PROMPT | llm.with_structured_output(ClaimVerification)
    
    context = state.get("refined_context", "")
    verdicts = []
    
    for claim in claims:
        res: ClaimVerification = verify_chain.invoke({"context": context, "claim": claim})
        verdicts.append(res.model_dump())
        
    return {
        "claims": claims,
        "claim_verdicts": verdicts
    }
