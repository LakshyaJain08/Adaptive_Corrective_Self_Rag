import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, FileText, Send, Sparkles, AlertCircle, Trash2 } from 'lucide-react';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
axios.defaults.withCredentials = true;

function App() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const startResizing = React.useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback((e) => {
    if (isResizing) {
      // The app-container has 1rem (16px) padding
      const newWidth = e.clientX - 16;
      if (newWidth > 200 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE}/documents`);
      setDocuments(res.data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleDeleteDocument = async (filename) => {
    try {
      await axios.delete(`${API_BASE}/documents/${filename}`);
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete file.');
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    setIsUploading(true);
    try {
      await axios.post(`${API_BASE}/upload`, formData);
      fetchDocuments();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file.');
    }
    setIsUploading(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (documents.length === 0) {
      alert("Please upload at least one PDF document first.");
      return;
    }

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/chat`, { question: userMessage.content });
      
      const aiMessage = {
        role: 'ai',
        content: response.data.answer,
        metadata: {
          confidence: response.data.confidence_scores?.overall_confidence || 0,
          intent: response.data.intent,
          verdict: response.data.verdict,
          iterations: response.data.iterations,
          claims: response.data.claims || [],
          retrievalQuery: response.data.retrieval_query,
          vectorResults: response.data.vector_results,
          bm25Results: response.data.bm25_results,
          rrfResults: response.data.rrf_results,
          relevantDocs: response.data.relevant_docs,
          compressedPassages: response.data.compressed_passages,
          supportedClaims: response.data.supported_claims,
          unsupportedClaims: response.data.unsupported_claims,
          needRetrieval: response.data.need_retrieval,
          finalVerification: response.data.final_verification
        }
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = error.response?.data?.detail || 'Sorry, I encountered an error while processing your request.';
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: errorMsg,
        isError: true
      }]);
    }
    
    setIsLoading(false);
  };

  const renderConfidence = (score) => {
    let className = 'score ';
    if (score > 0.8) className += 'high';
    else if (score > 0.5) className += 'medium';
    else className += 'low';
    
    return <span className={className}>{(score * 100).toFixed(1)}%</span>;
  };

  const renderProcessTrace = (metadata) => {
    if (!metadata) return null;
    
    return (
      <div className="process-trace">
        <h4>Process Trace</h4>
        <div className="trace-step">
          <span className="trace-label">USER QUERY</span>
        </div>
        <div className="trace-arrow">↓</div>
        
        {metadata.intent && (
          <>
            <div className="trace-step">
              <span className="trace-label">Intent:</span> <span className="trace-value">{metadata.intent}</span>
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

        {metadata.retrievalQuery && (
          <>
            <div className="trace-step">
              <span className="trace-label">Query rewritten:</span> <span className="trace-value">YES</span>
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

        <div className="trace-step">
          <span className="trace-label">Vector results:</span> <span className="trace-value">{metadata.vectorResults || 0}</span><br />
          <span className="trace-label">BM25 results:</span> <span className="trace-value">{metadata.bm25Results || 0}</span><br />
          <span className="trace-label">RRF results:</span> <span className="trace-value">{metadata.rrfResults || 0}</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Relevant documents:</span> <span className="trace-value">{metadata.relevantDocs || 0}/{metadata.rrfResults || 0}</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Context compression:</span> <span className="trace-value">{metadata.compressedPassages || 0} passages</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Generation complete</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Claims extracted:</span> <span className="trace-value">{metadata.claims?.length || 0}</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Supported claims:</span> <span className="trace-value">{metadata.supportedClaims || 0}</span><br />
          <span className="trace-label">Unsupported claims:</span> <span className="trace-value">{metadata.unsupportedClaims || 0}</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">RETRIEVAL REQUIRED:</span> <span className="trace-value">{metadata.needRetrieval ? 'YES' : 'NO'}</span>
        </div>
        <div className="trace-arrow">↓</div>

        {metadata.iterations > 0 && (
          <>
            <div className="trace-step">
              <span className="trace-label">Second retrieval</span>
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

        <div className="trace-step">
          <span className="trace-label">Final verification:</span> <span className="trace-value">{metadata.finalVerification === 'USEFUL' ? 'PASS' : metadata.finalVerification || 'N/A'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container" style={{ cursor: isResizing ? 'col-resize' : 'default' }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
        <h2><Sparkles size={24} color="#4F46E5" /> ACSRAG Brain</h2>
        
        <div className="upload-zone" onClick={() => document.getElementById('file-upload').click()}>
          <UploadCloud className="upload-icon" size={36} />
          <p className="upload-text">
            {isUploading ? 'Uploading...' : 'Click or drag PDF files to upload context'}
          </p>
          <input 
            type="file" 
            id="file-upload" 
            multiple 
            accept=".pdf" 
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </div>

        <div className="doc-list">
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            KNOWLEDGE BASE ({documents.length})
          </h3>
          {documents.map((doc, idx) => (
            <div key={idx} className="doc-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <FileText size={16} color="#71717A" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                title="Delete document"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {documents.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No documents uploaded yet.
            </p>
          )}
        </div>
      </aside>

      {/* Resizer */}
      <div 
        className="resizer" 
        onMouseDown={startResizing}
      />

      {/* Main Chat Area */}
      <main className="chat-container">
        <header className="chat-header">
          <h1>Adaptive Corrective Self-RAG</h1>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              <Sparkles size={48} opacity={0.2} style={{ marginBottom: '1rem' }} />
              <p>Hello! Upload some documents and ask a question.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-wrapper message-${msg.role}`}>
                <div className="message-bubble" style={{ border: msg.isError ? '1px solid var(--danger)' : '' }}>
                  {msg.content}
                </div>
                
                {msg.metadata && (
                  <div className="metadata-panel">
                    <div className="metadata-item">
                      <span>Confidence</span>
                      {renderConfidence(msg.metadata.confidence)}
                    </div>
                    {msg.metadata.iterations > 0 && (
                      <div className="metadata-item">
                        <span>Iterations</span>
                        <span>{msg.metadata.iterations}</span>
                      </div>
                    )}
                    {msg.metadata.claims && msg.metadata.claims.length > 0 && (
                      <div className="metadata-item" style={{ flexDirection: 'column', marginTop: '0.5rem' }}>
                        <span style={{ marginBottom: '0.25rem', color: '#fff' }}>Extracted Claims:</span>
                        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {msg.metadata.claims.map((claim, cIdx) => (
                            <li key={cIdx}>{claim}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {renderProcessTrace(msg.metadata)}
                  </div>
                )}
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="message-wrapper message-ai">
              <div className="message-bubble typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
        </div>

        <form className="input-area" onSubmit={handleSendMessage}>
          <input 
            type="text" 
            className="input-field" 
            placeholder={documents.length === 0 ? "Upload documents to start chatting..." : "Ask a question..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || documents.length === 0}
          />
          <button type="submit" className="send-btn" disabled={isLoading || documents.length === 0 || !input.trim()}>
            <Send size={20} />
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
