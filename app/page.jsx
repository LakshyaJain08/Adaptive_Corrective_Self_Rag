'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  UploadCloud,
  FileText,
  Send,
  Sparkles,
  AlertCircle,
  Trash2,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react';

function renderInline(text) {
  if (!text || typeof text !== 'string') return text;

  // Match: `code`, **bold**, __bold__, *italic*, _italic_
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          style={{
            background: 'rgba(99, 102, 241, 0.18)',
            color: '#c7d2fe',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            fontSize: '0.9em',
            fontFamily: 'monospace',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={i} style={{ fontWeight: 700, color: '#ffffff' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={i} style={{ fontStyle: 'italic', color: '#e0e7ff' }}>
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}

function renderFormattedText(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  const elements = [];
  let currentList = null;
  let inCodeBlock = false;
  let codeBlockContent = [];

  const flushList = () => {
    if (currentList) {
      elements.push(
        <ul
          key={`list-${elements.length}`}
          style={{
            paddingLeft: '1.35rem',
            margin: '0.35rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
          }}
        >
          {currentList.map((item, lIdx) => (
            <li key={lIdx} style={{ lineHeight: 1.55 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      currentList = null;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushList();
        elements.push(
          <pre
            key={`code-${index}`}
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              padding: '0.8rem 1rem',
              overflowX: 'auto',
              fontSize: '0.85rem',
              margin: '0.5rem 0',
              fontFamily: 'monospace',
            }}
          >
            <code>{codeBlockContent.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        flushList();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h3-${index}`} style={{ margin: '0.6rem 0 0.3rem', fontSize: '1rem', fontWeight: 600, color: '#e0e7ff' }}>
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h2-${index}`} style={{ margin: '0.8rem 0 0.4rem', fontSize: '1.1rem', fontWeight: 700, color: '#e0e7ff' }}>
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h1-${index}`} style={{ margin: '1rem 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (!currentList) currentList = [];
      currentList.push(bulletMatch[1]);
      return;
    }

    const numMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numMatch) {
      if (!currentList) currentList = [];
      currentList.push(numMatch[1]);
      return;
    }

    flushList();

    if (trimmed === '') {
      elements.push(<div key={`blank-${index}`} style={{ height: '0.4rem' }} />);
    } else {
      elements.push(
        <p key={`p-${index}`} style={{ margin: '0.2rem 0', lineHeight: 1.6 }}>
          {renderInline(line)}
        </p>
      );
    }
  });

  flushList();
  return elements;
}

export default function Home() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e) => {
      if (isResizing) {
        const newWidth = e.clientX - 16;
        if (newWidth > 220 && newWidth < 800) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

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
      const res = await axios.get('/api/documents');
      setDocuments(res.data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleDeleteDocument = async (filename) => {
    try {
      await axios.delete(`/api/documents/${encodeURIComponent(filename)}`);
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete file.');
    }
  };

  const uploadFiles = async (fileList) => {
    if (!fileList || !fileList.length) return;

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].name.toLowerCase().endsWith('.pdf')) {
        formData.append('files', fileList[i]);
      }
    }

    setIsUploading(true);
    try {
      await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchDocuments();
    } catch (error) {
      console.error('Upload failed:', error);
      const detail = error.response?.data?.error || 'Failed to upload PDF.';
      alert(detail);
    }
    setIsUploading(false);
  };

  const handleFileUpload = (e) => {
    uploadFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (documents.length === 0) {
      alert('Please upload at least one PDF document first.');
      return;
    }

    const userMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/chat', { question: userMessage.content });

      const aiMessage = {
        role: 'ai',
        content: response.data.answer,
        metadata: {
          confidence: response.data.confidence_scores?.overall_confidence || 0,
          intent: response.data.intent,
          verdict: response.data.verdict,
          iterations: response.data.iterations || 0,
          claims: response.data.claims || [],
          claimVerdicts: response.data.claim_verdicts || [],
          retrievalQuery: response.data.retrieval_query,
          vectorResults: response.data.vector_results,
          bm25Results: response.data.bm25_results,
          rrfResults: response.data.rrf_results,
          relevantDocs: response.data.relevant_docs,
          compressedPassages: response.data.compressed_passages,
          webResults: response.data.web_results || 0,
          webQuery: response.data.web_query || '',
          webSources: response.data.web_sources || [],
          supportedClaims: response.data.supported_claims,
          unsupportedClaims: response.data.unsupported_claims,
          needRetrieval: response.data.need_retrieval,
          finalVerification: response.data.final_verification,
        },
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        'Sorry, I encountered an error while processing your request.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: errorMsg,
          isError: true,
        },
      ]);
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
          <span className="trace-label">USER QUERY:</span>{' '}
          <span className="trace-value">{metadata.retrievalQuery || 'Direct'}</span>
        </div>
        <div className="trace-arrow">↓</div>

        {metadata.intent && (
          <>
            <div className="trace-step">
              <span className="trace-label">Intent:</span>{' '}
              <span className="trace-value">{metadata.intent}</span>
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

        <div className="trace-step">
          <span className="trace-label">Vector matches:</span>{' '}
          <span className="trace-value">{metadata.vectorResults || 0}</span>
          <br />
          <span className="trace-label">BM25 matches:</span>{' '}
          <span className="trace-value">{metadata.bm25Results || 0}</span>
          <br />
          <span className="trace-label">RRF fused:</span>{' '}
          <span className="trace-value">{metadata.rrfResults || 0}</span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">CRAG Evaluation:</span>{' '}
          <span
            className="trace-value"
            style={{
              color: metadata.verdict?.includes('INCORRECT')
                ? 'var(--warning)'
                : metadata.verdict?.includes('AMBIGUOUS')
                ? '#38bdf8'
                : 'var(--success)',
            }}
          >
            {metadata.verdict || 'CORRECT'}
          </span>
        </div>
        <div className="trace-arrow">↓</div>

        {metadata.webResults > 0 && (
          <>
            <div
              className="trace-step"
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                borderLeft: '3px solid #38bdf8',
                padding: '0.4rem 0.6rem',
                borderRadius: '4px',
              }}
            >
              <span className="trace-label" style={{ color: '#38bdf8' }}>
                🌐 Tavily Web Search:
              </span>{' '}
              <span className="trace-value">{metadata.webResults} live sources</span>
              {metadata.webQuery && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Query: <em>"{metadata.webQuery}"</em>
                </div>
              )}
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

        <div className="trace-step">
          <span className="trace-label">Context Passages:</span>{' '}
          <span className="trace-value">
            {metadata.relevantDocs || 0} document{metadata.webResults > 0 ? ` + ${metadata.webResults} web` : ''}
          </span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Supported Claims:</span>{' '}
          <span className="trace-value" style={{ color: 'var(--success)' }}>
            {metadata.supportedClaims || 0}
          </span>{' '}
          / <span className="trace-label">Unsupported:</span>{' '}
          <span
            className="trace-value"
            style={{
              color: metadata.unsupportedClaims > 0 ? 'var(--danger)' : 'var(--success)',
            }}
          >
            {metadata.unsupportedClaims || 0}
          </span>
        </div>
        <div className="trace-arrow">↓</div>

        <div className="trace-step">
          <span className="trace-label">Self-RAG Verification:</span>{' '}
          <span
            className="trace-value"
            style={{ color: metadata.finalVerification === 'PASS' ? 'var(--success)' : '#a5b4fc' }}
          >
            {metadata.finalVerification || 'PASS'}
          </span>
        </div>

        {metadata.webSources?.length > 0 && (
          <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>
              Web Sources:
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
              {metadata.webSources.map((src, sIdx) => (
                <a
                  key={sIdx}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.72rem',
                    color: '#93c5fd',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔗 {src.title || src.url}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="app-container"
      style={{ cursor: isResizing ? 'col-resize' : 'default' }}
    >
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
        <h2>
          <Sparkles size={22} color="#6366F1" /> ACSRAG Brain
        </h2>

        <div
          className={`upload-zone ${isDragOver ? 'drag-active' : ''}`}
          onClick={() => document.getElementById('file-upload').click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <UploadCloud className="upload-icon" size={34} />
          <p className="upload-text">
            {isUploading
              ? 'Uploading and indexing...'
              : 'Click or drag PDF files to upload knowledge'}
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
          <h3
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.4rem',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}
          >
            KNOWLEDGE BASE ({documents.length})
          </h3>
          {documents.map((doc, idx) => (
            <div
              key={idx}
              className="doc-item"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  overflow: 'hidden',
                }}
              >
                <FileText size={16} color="#818CF8" style={{ flexShrink: 0 }} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteDocument(doc);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.25rem',
                  opacity: 0.8,
                  transition: 'opacity 0.2s',
                }}
                title="Delete document"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {documents.length === 0 && (
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                padding: '0.5rem 0',
              }}
            >
              No documents uploaded yet.
            </p>
          )}
        </div>
      </aside>

      {/* Resizer */}
      <div className="resizer" onMouseDown={startResizing} />

      {/* Main Chat Area */}
      <main className="chat-container">
        <header className="chat-header">
          <h1>Adaptive Corrective Self-RAG</h1>
          <div className="chat-badge">Unified Next.js App</div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-secondary)',
                gap: '0.75rem',
              }}
            >
              <Sparkles size={48} opacity={0.25} color="#6366f1" />
              <p style={{ fontSize: '1.05rem', fontWeight: 500 }}>
                Welcome to ACSRAG Fullstack!
              </p>
              <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                Upload PDF documents on the left and ask questions to begin.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-wrapper message-${msg.role}`}>
                <div
                  className="message-bubble"
                  style={{
                    border: msg.isError ? '1px solid var(--danger)' : undefined,
                    background: msg.isError ? 'rgba(239, 68, 68, 0.1)' : undefined,
                  }}
                >
                  {renderFormattedText(msg.content)}
                </div>

                {msg.metadata && (
                  <div className="metadata-panel">
                    <div className="metadata-item">
                      <span>Overall Confidence</span>
                      {renderConfidence(msg.metadata.confidence)}
                    </div>
                    {msg.metadata.intent && (
                      <div className="metadata-item">
                        <span>Intent Mode</span>
                        <span style={{ color: '#a5b4fc', fontWeight: 600 }}>
                          {msg.metadata.intent}
                        </span>
                      </div>
                    )}
                    {msg.metadata.claims && msg.metadata.claims.length > 0 && (
                      <div
                        className="metadata-item"
                        style={{ flexDirection: 'column', marginTop: '0.5rem' }}
                      >
                        <span
                          style={{
                            marginBottom: '0.35rem',
                            color: '#fff',
                            fontWeight: 500,
                          }}
                        >
                          Extracted Claims:
                        </span>
                        <ul
                          style={{
                            paddingLeft: '1.25rem',
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                          }}
                        >
                          {msg.metadata.claims.map((claim, cIdx) => (
                            <li key={cIdx}>{renderInline(claim)}</li>
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
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} style={{ height: '1px', visibility: 'hidden' }} />
        </div>

        <form className="input-area" onSubmit={handleSendMessage}>
          <input
            type="text"
            className="input-field"
            placeholder={
              documents.length === 0
                ? 'Upload a PDF document to start chatting...'
                : 'Ask a question about your documents...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || documents.length === 0}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={isLoading || documents.length === 0 || !input.trim()}
            title="Send question"
          >
            <Send size={18} />
          </button>
        </form>
      </main>
    </div>
  );
}
