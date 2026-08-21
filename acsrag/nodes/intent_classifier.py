"""
Intent Classifier Node
======================
Classifies the user's query at the very beginning of the pipeline to
adaptively configure the rest of the execution flow.
"""

from langchain_core.prompts import ChatPromptTemplate

from acsrag.core.models import IntentClassification
from acsrag.core.state import ACSRAGState
from acsrag.core.utils import get_llm

_INTENT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert query intent classifier for an advanced RAG system.
Your job is to classify the user's query into the correct intent, and assess its complexity and requirements.

Intents:
- FACTUAL: Simple retrieval of facts or definitions.
- COMPARATIVE: Comparing two or more concepts, products, etc.
- SUMMARIZATION: Asking for a summary of a topic or document.
- ANALYTICAL: Asking 'why' or 'how' things work, requiring deeper reasoning.
- TEMPORAL: Queries sensitive to time (e.g., 'latest news', 'current policies').
- MULTI_HOP: Queries requiring jumping between multiple distinct facts.
- OUT_OF_DOMAIN: General chat or questions clearly outside any internal knowledge base.

You must also decide:
- requires_web: Does this likely need live internet search (e.g., recent news, out-of-domain)?
- requires_multiple_documents: Does this require retrieving from multiple distinct documents?
- complexity: 'low', 'medium', or 'high'.
"""),
    ("human", "{question}")
])

def classify_intent(state: ACSRAGState) -> dict:
    """Classify the user's intent and return updated state."""
    llm = get_llm()
    chain = _INTENT_PROMPT | llm.with_structured_output(IntentClassification)
    out: IntentClassification = chain.invoke({"question": state["question"]})
    
    return {
        "intent": out.intent,
        "requires_web": out.requires_web,
        "complexity": out.complexity
    }
