"""
Dynamic Context Compression Node
================================
Enhances the basic CRAG refinement by scoring decomposed passages (using a cross-encoder),
deduplicating them, and selecting the top passages up to a strict token budget.
This dramatically reduces LLM cost and noise during generation.
"""

from typing import List
import logging

from acsrag.core.state import ACSRAGState
from acsrag.core.utils import decompose_to_sentences

def num_tokens_from_string(string: str) -> int:
    """Estimate the number of tokens in a string."""
    try:
        import tiktoken
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(string))
    except Exception:
        # Fallback approximation: 1 word ≈ 1.3 tokens
        return int(len(string.split()) * 1.3)

def make_compressor_node(encoder, max_tokens: int = 1500):
    """
    Returns a node that compresses context using the given cross-encoder.
    """
    def compress_context(state: ACSRAGState) -> dict:
        # 1. Select documents based on CRAG verdict
        verdict = state.get("verdict", "CORRECT")
        if verdict == "CORRECT":
            docs = state.get("good_docs", [])
        elif verdict == "INCORRECT":
            docs = state.get("web_docs", [])
        else: # AMBIGUOUS
            docs = state.get("good_docs", []) + state.get("web_docs", [])
            
        if not docs:
            return {"refined_context": ""}
            
        query = state.get("retrieval_query") or state["question"]
        
        # 2. Decompose into chunked passages
        # Group every 3 sentences into a passage to maintain context boundary
        all_passages = []
        for doc in docs:
            sentences = decompose_to_sentences(doc.page_content)
            for i in range(0, len(sentences), 3):
                passage = " ".join(sentences[i:i+3]).strip()
                if len(passage) > 10:
                    all_passages.append(passage)
                    
        # 3. Deduplicate
        unique_passages = list(set(all_passages))
        if not unique_passages:
             return {"refined_context": ""}
             
        # 4. Score passages
        pairs = [[query, passage] for passage in unique_passages]
        scores = encoder.predict(pairs)
        
        # Sort by score descending
        passage_score_pairs = sorted(zip(unique_passages, scores), key=lambda x: x[1], reverse=True)
        
        # 5. Pack into token budget
        selected_passages = []
        current_tokens = 0
        
        for passage, score in passage_score_pairs:
            # We can skip very poorly ranked passages if needed
            tokens = num_tokens_from_string(passage)
            if current_tokens + tokens > max_tokens and len(selected_passages) > 0:
                break
            selected_passages.append(passage)
            current_tokens += tokens
            
        refined_context = "\n\n".join(selected_passages)
        return {"refined_context": refined_context, "context": refined_context}
        
    return compress_context
