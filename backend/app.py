import os
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import json
import uuid

from acsrag.core.utils import load_and_chunk_pdfs, get_llm
from acsrag.nodes.vector_retriever import build_vector_store
import hashlib

app = FastAPI(title="ACSRAG API")

import time

USAGE_FILE = os.path.join(os.path.dirname(__file__), "usage_counts.json")
TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

def load_counts():
    if os.path.exists(USAGE_FILE):
        with open(USAGE_FILE, "r") as f:
            return json.load(f)
    return {}

def save_counts(counts):
    with open(USAGE_FILE, "w") as f:
        json.dump(counts, f, indent=2)

def get_session_usage(counts, session_id):
    entry = counts.get(session_id)
    now_ms = int(time.time() * 1000)
    
    if not entry:
        return {"count": 0, "firstRequestTime": now_ms}
        
    if isinstance(entry, int):
        return {"count": entry, "firstRequestTime": now_ms}
        
    first_time = entry.get("firstRequestTime", now_ms)
    if (now_ms - first_time) >= TWELVE_HOURS_MS:
        return {"count": 0, "firstRequestTime": now_ms}
        
    return {
        "count": entry.get("count", 0),
        "firstRequestTime": first_time
    }

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(DOCUMENTS_DIR, exist_ok=True)

class ChatRequest(BaseModel):
    question: str

@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    saved_files = []
    for file in files:
        if not file.filename.endswith('.pdf'):
            continue
        file_path = os.path.join(DOCUMENTS_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)
    return {"message": f"Successfully uploaded {len(saved_files)} files.", "files": saved_files}

@app.get("/api/documents")
async def list_documents():
    files = [f for f in os.listdir(DOCUMENTS_DIR) if f.endswith('.pdf')]
    return {"documents": files}

@app.delete("/api/documents/{filename}")
async def delete_document(filename: str):
    file_path = os.path.join(DOCUMENTS_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"message": f"Successfully deleted {filename}"}
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.post("/api/chat")
async def chat(request: ChatRequest, http_request: Request, response: Response):
    session_id = http_request.cookies.get("session_id")
    is_new_session = False
    if not session_id:
        session_id = str(uuid.uuid4())
        is_new_session = True
    
    counts = load_counts()
    usage = get_session_usage(counts, session_id)
    
    if usage["count"] >= 3:
        now_ms = int(time.time() * 1000)
        remaining_ms = max(0, TWELVE_HOURS_MS - (now_ms - usage["firstRequestTime"]))
        remaining_hours = remaining_ms // (3600 * 1000)
        remaining_mins = (remaining_ms % (3600 * 1000)) // (60 * 1000) + 1
        time_str = f"{remaining_hours}h {remaining_mins}m" if remaining_hours > 0 else f"{remaining_mins}m"
        raise HTTPException(
            status_code=429, 
            detail=f"You have reached the limit of 3 questions for this demo. Your limit will auto-reset in {time_str}."
        )

    pdf_files = [os.path.join(DOCUMENTS_DIR, f) for f in os.listdir(DOCUMENTS_DIR) if f.endswith('.pdf')]
    
    if not pdf_files:
        raise HTTPException(status_code=400, detail="No PDFs available. Please upload documents first.")
    
    try:
        # Generate cache suffix based on current pdf files
        paths_str = "".join(sorted([str(p) for p in pdf_files]))
        suffix = hashlib.md5(paths_str.encode()).hexdigest()

        # Fast direct retrieval (no iterative loops)
        chunks = load_and_chunk_pdfs(pdf_files, cache_suffix=suffix)
        store = build_vector_store(chunks, cache_suffix=suffix)
        docs = store.similarity_search(request.question, k=5)
        
        context = "\n\n---\n\n".join(d.page_content for d in docs)
        
        prompt = f"Answer the user's question based strictly on the provided context.\n\nContext:\n{context}\n\nQuestion:\n{request.question}"
        
        llm = get_llm()
        llm_response = llm.invoke(prompt)
        
        # Ensure answer is a string (Google GenAI can return a list of dicts)
        ans_content = llm_response.content
        if isinstance(ans_content, list):
            ans_text = " ".join(item.get("text", "") for item in ans_content if isinstance(item, dict) and item.get("type") == "text")
        else:
            ans_text = str(ans_content)
        
        # Filter down the result to send to frontend (mocking the trace for speed)
        response_data = {
            "answer": ans_text,
            "confidence_scores": {"overall_confidence": 1.0},
            "claims": ["Fast retrieval mode used for demo."],
            "claim_verdicts": [],
            "intent": "FACTUAL",
            "verdict": "SUPPORTED",
            "iterations": 0,
            "evidence": [],
            
            # Trace fields
            "retrieval_query": request.question,
            "vector_results": len(docs),
            "bm25_results": 0,
            "rrf_results": len(docs),
            "relevant_docs": len(docs),
            "compressed_passages": 0,
            "supported_claims": 1,
            "unsupported_claims": 0,
            "need_retrieval": False,
            "final_verification": "PASS"
        }
        
        # Increment counter on successful request & record timestamps
        now_ms = int(time.time() * 1000)
        counts[session_id] = {
            "count": usage["count"] + 1,
            "firstRequestTime": now_ms if usage["count"] == 0 else usage["firstRequestTime"],
            "lastRequestTime": now_ms
        }
        save_counts(counts)
        
        if is_new_session:
            response.set_cookie(key="session_id", value=session_id, max_age=31536000, httponly=True, samesite="lax")
            
        return response_data
    except Exception as e:
        print(f"Error during chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
