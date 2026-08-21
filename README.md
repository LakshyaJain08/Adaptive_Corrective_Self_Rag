# ACSRAG (Adaptive Corrective Self-RAG) 🚀

ACSRAG is a full-stack, AI-powered document intelligence platform that allows users to upload PDF documents and interrogate them using advanced Retrieval-Augmented Generation (RAG) techniques.

Unlike traditional RAG pipelines, ACSRAG employs an **Adaptive Corrective Self-RAG** architecture. It evaluates retrieval confidence, explicitly extracts claims, flags unsupported claims, and performs iterative retrieval passes to ensure the highest possible factual accuracy. 

---

## 🌟 Key Features

* **Advanced RAG Pipeline**: Intelligent claim extraction and verification.
* **Iterative Retrieval**: If the model determines that the retrieved context is insufficient to confidently answer the query, it automatically re-queries the vector database.
* **Process Trace UI**: A sleek, dynamic React frontend that provides a real-time trace of the AI's "thought process" (Intent detection, Vector/BM25 scores, Context compression, and Final verification).
* **PDF Knowledge Base**: Upload multiple PDFs to build a dynamic context window.
* **Resizing Workspace**: A drag-to-resize sidebar allows you to customize your workspace layout dynamically.
* **Persistent Sessions**: Chat limits and sessions are securely managed via HTTP-only cookies and local JSON persistence, surviving server restarts.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, Vite, Lucide-React, Axios, Vanilla CSS (Glassmorphism design).
* **Backend**: FastAPI, Uvicorn, Python.
* **AI & Embeddings**: LangChain, Google GenAI, FAISS (Vector Store), HuggingFace Embeddings.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
* **Node.js** (v18+)
* **Python** (3.10+)

### 1. Clone & Setup Backend
Navigate to the root directory and set up your Python virtual environment.

```bash
# Activate your virtual environment (Windows)
.\venv\Scripts\activate

# Install the Python dependencies
pip install -r requirements.txt
```

Start the FastAPI backend:
```bash
# Ensure PYTHONPATH is set so the `acsrag` module resolves correctly
$env:PYTHONPATH = "."
$env:PYTHONUNBUFFERED="1"

# Run the backend server
python backend/app.py
```
*The API will be available at `http://localhost:8000`.*

### 2. Setup Frontend
Open a new terminal window and navigate to the frontend directory.

```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
*The frontend will be available at `http://localhost:3000` (or `5173`).*

---

## 🌍 Deployment

ACSRAG is configured to be easily deployed on platforms like **Render**.

### Backend (Web Service)
* **Build Command**: `pip install -r requirements.txt`
* **Start Command**: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`

### Frontend (Static Site)
* **Build Command**: `npm install && npm run build`
* **Publish Directory**: `dist`
* **Environment Variables**: Set `VITE_API_URL` to your deployed backend's URL (e.g., `https://your-backend.onrender.com/api`).

---

## 📂 Project Structure

```text
ACSRAG/
├── acsrag/                 # Core AI architecture & LangGraph logic
│   ├── core/               # State models, LLM wrappers, utils
│   ├── graphs/             # RAG graph orchestration (iterative phases)
│   └── nodes/              # Granular operations (retrieval, grading, rewriting)
├── backend/                # FastAPI backend serving the AI and endpoints
│   ├── app.py              # Main API entrypoint
│   └── documents/          # Uploaded PDF storage
├── frontend/               # Vite + React frontend
│   ├── src/
│   │   ├── App.jsx         # Main UI layout and logic
│   │   └── index.css       # Glassmorphism styling & animations
├── usage_counts.json       # Cookie-based session tracking for rate limits
└── requirements.txt        # Full Python dependency manifest
```

---

## 📝 License
This project is for demonstration and educational purposes. Feel free to use and modify it as you see fit!
