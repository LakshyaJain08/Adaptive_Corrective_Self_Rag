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
  Plus,
  Edit2,
  Check,
  X,
  BookOpen,
  Paperclip,
  PanelLeft,
  PanelLeftClose,
  SquarePen,
  Globe,
  Brain,
  Zap,
  MoreHorizontal,
  Pencil,
  Share2,
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
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [thinkModeEnabled, setThinkModeEnabled] = useState(true);
  const [openMenuChatId, setOpenMenuChatId] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  // Auto-close sidebar when clicking anywhere outside the sidebar
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!isSidebarOpen) return;

      const isInsideSidebar = e.target.closest('.sidebar');
      const isToggleButton = e.target.closest('.sidebar-toggle-btn');
      const isResizer = e.target.closest('.resizer');

      if (!isInsideSidebar && !isToggleButton && !isResizer) {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isSidebarOpen]);

  // Close 3-dots dropdown menu when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.chat-menu-container')) {
        setOpenMenuChatId(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Active chat & its messages
  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0] || null;
  const messages = activeChat?.messages || [];

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Restore chats from localStorage on mount
  useEffect(() => {
    try {
      const savedChats = localStorage.getItem('acsrag_chats');
      const savedActiveId = localStorage.getItem('acsrag_active_chat_id');
      if (savedChats) {
        const parsed = JSON.parse(savedChats);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure every chat has a documents array
          const sanitized = parsed.map((c) => ({
            ...c,
            documents: Array.isArray(c.documents) ? c.documents : [],
          }));
          setChats(sanitized);
          if (savedActiveId && sanitized.some((c) => c.id === savedActiveId)) {
            setActiveChatId(savedActiveId);
          } else {
            setActiveChatId(sanitized[0].id);
          }
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load chats from localStorage:', e);
    }

    // Default initial chat
    const initialId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat_${Date.now()}`;
    const initialChat = {
      id: initialId,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      documents: [],
    };
    setChats([initialChat]);
    setActiveChatId(initialId);
  }, []);

  // Save chats to localStorage on change
  useEffect(() => {
    if (chats.length > 0) {
      try {
        localStorage.setItem('acsrag_chats', JSON.stringify(chats));
        if (activeChatId) {
          localStorage.setItem('acsrag_active_chat_id', activeChatId);
        }
      } catch (e) {
        console.error('Failed to save chats to localStorage:', e);
      }
    }
  }, [chats, activeChatId]);

  const handleCreateChat = () => {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat_${Date.now()}`;
    const newChat = {
      id: newId,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      documents: [],
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newId);
    setEditingChatId(null);
    setInput('');
  };

  const handleSelectChat = (id) => {
    setActiveChatId(id);
    setEditingChatId(null);
  };

  const handleStartRename = (chat, e) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = (id, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const clean = editTitle.trim();
    if (clean) {
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: clean, updatedAt: Date.now() } : c))
      );
    }
    setEditingChatId(null);
  };

  const handleCancelRename = (e) => {
    if (e) e.stopPropagation();
    setEditingChatId(null);
  };

  const handleDeleteChat = (id, e) => {
    e.stopPropagation();
    setChats((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const freshId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat_${Date.now()}`;
        const freshChat = {
          id: freshId,
          title: 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          documents: [],
        };
        setActiveChatId(freshId);
        return [freshChat];
      }
      if (activeChatId === id) {
        setActiveChatId(filtered[0].id);
      }
      return filtered;
    });
    if (editingChatId === id) {
      setEditingChatId(null);
    }
  };

  const handleClearChat = () => {
    if (!activeChatId) return;
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId ? { ...chat, messages: [], updatedAt: Date.now() } : chat
      )
    );
  };

  const handleRemoveDocFromChat = (docName) => {
    if (!activeChatId) return;
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id === activeChatId) {
          const currentDocs = chat.documents || [];
          const filtered = currentDocs.filter((d) => d !== docName);
          return { ...chat, documents: filtered, updatedAt: Date.now() };
        }
        return chat;
      })
    );
  };

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

  const uploadFiles = async (fileList) => {
    if (!fileList || !fileList.length || !activeChatId) return;

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].name.toLowerCase().endsWith('.pdf')) {
        formData.append('files', fileList[i]);
      }
    }

    setIsUploading(true);
    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedNames = res.data.files || [];

      // Link newly uploaded files specifically to the active chat
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id === activeChatId) {
            const currentDocs = chat.documents || [];
            const merged = Array.from(new Set([...currentDocs, ...uploadedNames]));
            return { ...chat, documents: merged, updatedAt: Date.now() };
          }
          return chat;
        })
      );
      await fetchDocuments();
    } catch (error) {
      console.error('Upload failed:', error);
      const detail = error.response?.data?.error || 'Failed to upload PDF.';
      alert(detail);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e) => {
    uploadFiles(e.target.files);
    // Reset file input value so selecting the same file again triggers change event
    if (e.target) e.target.value = '';
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

  const handleSendMessage = async (e, customQuery = null, webSearchOverride = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const queryText = (customQuery !== null ? customQuery : input).trim();
    if (!queryText || isLoading) return;

    const currentId = activeChatId;
    const userMessage = { role: 'user', content: queryText };
    const currentChat = chats.find((c) => c.id === currentId);
    const chatDocs = currentChat?.documents || [];
    const history = (currentChat?.messages || []).slice(-4).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const useWebSearch = webSearchOverride !== null ? webSearchOverride : webSearchEnabled;

    if (customQuery === null) {
      setInput('');
    }
    setIsLoading(true);

    // Append user message & auto-update title from "New Chat" to query preview
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id === currentId) {
          const autoTitle =
            chat.title === 'New Chat' || chat.title === 'Untitled'
              ? queryText.length > 28
                ? queryText.slice(0, 28) + '...'
                : queryText
              : chat.title;
          return {
            ...chat,
            title: autoTitle,
            updatedAt: Date.now(),
            messages: [...chat.messages, userMessage],
          };
        }
        return chat;
      })
    );

    try {
      const response = await axios.post('/api/chat', {
        question: queryText,
        documents: chatDocs,
        webSearch: useWebSearch,
        thinkMode: thinkModeEnabled,
        history,
      });

      const aiMessage = {
        role: 'ai',
        content: response.data.answer,
        userQuestion: queryText,
        metadata: {
          confidence: response.data.confidence_scores?.overall_confidence || 0,
          intent: response.data.intent,
          verdict: response.data.verdict,
          iterations: response.data.iterations || 0,
          claims: response.data.claims || [],
          claimVerdicts: response.data.claim_verdicts || [],
          retrievalQuery: response.data.retrieval_query,
          effectiveQuery: response.data.effective_query,
          vectorResults: response.data.vector_results,
          bm25Results: response.data.bm25_results,
          rrfResults: response.data.rrf_results,
          relevantDocs: response.data.relevant_docs,
          compressedPassages: response.data.compressed_passages,
          webResults: response.data.web_results || 0,
          webQuery: response.data.web_query || '',
          webSources: response.data.web_sources || [],
          webSearchEnabled: response.data.web_search_enabled !== false,
          thinkModeEnabled: response.data.think_mode_enabled !== false,
          webSearchRequired: response.data.web_search_required || false,
          userQuestion: queryText,
          supportedClaims: response.data.supported_claims,
          unsupportedClaims: response.data.unsupported_claims,
          needRetrieval: response.data.need_retrieval,
          finalVerification: response.data.final_verification,
        },
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentId
            ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, aiMessage] }
            : chat
        )
      );
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        'Sorry, I encountered an error while processing your request.';

      const errorAiMessage = {
        role: 'ai',
        content: errorMsg,
        isError: true,
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentId
            ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, errorAiMessage] }
            : chat
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableWebAndRetry = (query) => {
    setWebSearchEnabled(true);
    if (query) {
      handleSendMessage(null, query, true);
    }
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
              color: metadata.verdict?.includes('INCORRECT') || metadata.verdict?.includes('REQUIRED')
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

        {metadata.verdict === 'WEB_SEARCH_REQUIRED (OFF)' && (
          <>
            <div
              className="trace-step"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderLeft: '3px solid #ef4444',
                padding: '0.4rem 0.6rem',
                borderRadius: '4px',
              }}
            >
              <span className="trace-label" style={{ color: '#ef4444' }}>
                ⚠️ Web Search Required:
              </span>{' '}
              <span className="trace-value" style={{ color: '#fca5a5' }}>
                Web Search is toggled OFF (External lookup blocked)
              </span>
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

        {metadata.verdict === 'AMBIGUOUS (Web Search Disabled)' && (
          <>
            <div
              className="trace-step"
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                borderLeft: '3px solid #f59e0b',
                padding: '0.4rem 0.6rem',
                borderRadius: '4px',
              }}
            >
              <span className="trace-label" style={{ color: '#f59e0b' }}>
                ⚠️ Web Search is OFF:
              </span>{' '}
              <span className="trace-value" style={{ color: '#fde68a' }}>
                External comparison omitted (Document only)
              </span>
            </div>
            <div className="trace-arrow">↓</div>
          </>
        )}

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
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${isSidebarOpen ? '' : 'closed'}`}
        style={{ width: isSidebarOpen ? sidebarWidth : 0, flexShrink: 0 }}
      >
        <div className="sidebar-header">
          <h2>
            <Sparkles size={20} color="#6366F1" /> ACSRAG Brain
          </h2>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            title="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* New Chat Button */}
        <button
          type="button"
          className="new-chat-btn"
          onClick={handleCreateChat}
          title="New chat"
        >
          <SquarePen size={18} />
          <span>New chat</span>
        </button>

        {/* Chat Conversations Section */}
        <div className="sidebar-section" style={{ flexGrow: 1, minHeight: 0 }}>
          <div className="sidebar-section-header">
            <span>Conversations ({chats.length})</span>
          </div>

          <div className="chat-list" style={{ flexGrow: 1, maxHeight: 'none' }}>
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId;
              const isEditing = chat.id === editingChatId;
              const docCount = chat.documents?.length || 0;

              return (
                <div
                  key={chat.id}
                  className={`chat-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  <div className="chat-item-main">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => handleSaveRename(chat.id, e)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          width: '100%',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          className="chat-rename-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') handleCancelRename(e);
                          }}
                        />
                        <button
                          type="submit"
                          className="chat-action-btn"
                          style={{ color: 'var(--success)' }}
                          title="Save title"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          className="chat-action-btn"
                          onClick={handleCancelRename}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <div className="chat-item-content">
                        <span className="chat-item-title" title={chat.title}>
                          {chat.title}
                        </span>
                        {docCount > 0 && (
                          <span className="chat-doc-badge">
                            <Paperclip size={10} /> {docCount} doc{docCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div
                      className="chat-menu-container"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`chat-menu-trigger-btn ${openMenuChatId === chat.id ? 'open' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuChatId((prev) => (prev === chat.id ? null : chat.id));
                        }}
                        title="Chat options"
                      >
                        <MoreHorizontal size={15} />
                      </button>

                      {openMenuChatId === chat.id && (
                        <div
                          className="chat-dropdown-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="chat-dropdown-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuChatId(null);
                              handleStartRename(chat, e);
                            }}
                          >
                            <Pencil size={14} />
                            <span>Rename</span>
                          </button>

                          <button
                            type="button"
                            className="chat-dropdown-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuChatId(null);
                              if (typeof window !== 'undefined') {
                                navigator.clipboard?.writeText(window.location.href);
                              }
                            }}
                          >
                            <Share2 size={14} />
                            <span>Share</span>
                          </button>

                          <button
                            type="button"
                            className="chat-dropdown-item delete-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuChatId(null);
                              handleDeleteChat(chat.id, e);
                            }}
                          >
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Resizer */}
      <div
        className={`resizer ${isSidebarOpen ? '' : 'hidden'}`}
        onMouseDown={startResizing}
      />

      {/* Main Chat Area */}
      <main className="chat-container">
        <header className="chat-header">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              overflow: 'hidden',
              maxWidth: '75%',
            }}
          >
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={toggleSidebar}
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
            <h1
              style={{
                fontSize: '1.15rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activeChat?.title || 'Adaptive Corrective Self-RAG'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '16px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s ease',
                }}
                title="Clear current conversation"
              >
                <Trash2 size={13} />
                Clear Chat
              </button>
            )}
          </div>
        </header>

        {/* Per-Chat Knowledge Base Bar */}
        <div className="chat-kb-bar">
          <div className="chat-kb-title">
            <BookOpen size={14} color="#818cf8" />
            <span>Knowledge Base ({(activeChat?.documents || []).length})</span>
          </div>

          <div className="chat-kb-doc-tags">
            {(activeChat?.documents || []).map((doc, dIdx) => (
              <div key={dIdx} className="chat-kb-tag" title={doc}>
                <FileText size={12} color="#818cf8" style={{ flexShrink: 0 }} />
                <span className="chat-kb-tag-name">{doc}</span>
                <button
                  type="button"
                  className="chat-kb-tag-remove"
                  onClick={() => handleRemoveDocFromChat(doc)}
                  title={`Remove ${doc} from this chat`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {(!activeChat?.documents || activeChat.documents.length === 0) && (
              <span className="chat-kb-empty">
                No documents attached to this chat. Click <strong style={{ color: '#818cf8' }}>+</strong> below to attach PDF knowledge.
              </span>
            )}
          </div>
        </div>

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
                Welcome to ACSRAG!
              </p>
              <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                Click the <strong style={{ color: '#818cf8' }}>+</strong> button below or drag & drop a PDF into the prompt to add knowledge.
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
                  {(msg.metadata?.webSearchRequired ||
                    msg.metadata?.verdict?.includes('OFF') ||
                    msg.metadata?.verdict?.includes('Disabled')) && (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <button
                        type="button"
                        className="web-search-retry-btn"
                        onClick={() =>
                          handleEnableWebAndRetry(
                            msg.metadata?.userQuestion || msg.userQuestion
                          )
                        }
                      >
                        <Globe size={14} />
                        <span>Enable 🌐 Web Search & Retry</span>
                      </button>
                    </div>
                  )}
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

        {/* Prompt Input Area with unified Pill Container */}
        <div
          className={`input-area-wrapper ${isDragOver ? 'drag-active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isDragOver && (
            <div className="input-drag-overlay">
              <UploadCloud size={22} />
              <span>Drop PDF here to upload knowledge</span>
            </div>
          )}

          {isUploading && (
            <div className="input-uploading-pill">
              <UploadCloud size={14} />
              <span>Uploading and indexing PDF knowledge...</span>
            </div>
          )}

          <form className="unified-prompt-bar" onSubmit={handleSendMessage}>
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Attach PDF document"
            >
              <Plus size={20} />
            </button>

            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              disabled={isUploading}
            />

            <input
              type="text"
              className="prompt-input-field"
              placeholder={
                (activeChat?.documents?.length || 0) === 0
                  ? 'Ask anything or attach a PDF...'
                  : 'Ask anything about your documents...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />

            {/* In-prompt Controls: Web Search, Deep Think & Send */}
            <div className="prompt-inner-controls">
              <button
                type="button"
                className={`mode-toggle-pill-inside ${webSearchEnabled ? 'web-active' : ''}`}
                onClick={() => setWebSearchEnabled((prev) => !prev)}
                title={
                  webSearchEnabled
                    ? '🌐 Web Search is ON — Live Tavily search fallback for external knowledge'
                    : '🌐 Web Search is OFF — Restricted to attached documents only'
                }
              >
                <Globe size={14} />
                <span>Search</span>
              </button>

              <button
                type="button"
                className={`mode-toggle-pill-inside ${thinkModeEnabled ? 'think-active' : ''}`}
                onClick={() => setThinkModeEnabled((prev) => !prev)}
                title={
                  thinkModeEnabled
                    ? '🧠 Deep Think is ON — Full Adaptive Self-RAG verification'
                    : '⚡ Deep Think is OFF — Fast single-pass response'
                }
              >
                <Brain size={14} />
                <span>Think</span>
              </button>

              <button
                type="submit"
                className="send-btn"
                disabled={isLoading || !input.trim()}
                title="Send question"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
