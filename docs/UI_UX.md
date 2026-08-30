# UI/UX Design & Interaction Specification
## Adaptive Corrective Self-RAG (ACSRAG)

---

## 1. Design Philosophy & Aesthetic Identity
The ACSRAG user interface is built on **Dark-Mode Glassmorphism**, **High-Contrast Data Typography**, and **Subtle Micro-Animations**. The goal is to provide a cockpit-like interface for knowledge discovery where users have immediate visibility into how the AI thinks, retrieves, and self-audits.

---

## 2. Design Tokens & Visual Hierarchy

### 2.1 Color Palette
* **Background Deep Canvas**: `#090D16` (Deep space obsidian)
* **Sidebar Surface**: `#0F172A` (Rich slate with 0.65 opacity backdrop filter)
* **Card & Bubble Surface**: `rgba(30, 41, 59, 0.70)` (Translucent glassmorphic tile)
* **Primary Brand Accent**: `#6366F1` (Electric Indigo) $\to$ `#06B6D4` (Cyber Cyan)
* **Success / Grounded**: `#10B981` (Emerald Green)
* **Warning / Ambiguous**: `#F59E0B` (Amber Orange)
* **Danger / Unsupported**: `#EF4444` (Crimson Red)

### 2.2 Typography Tokens
* **Headings**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif` (Weights: 600, 700)
* **Body Text**: `Inter` (Weight: 400, Line-Height: 1.6)
* **Code & Monospace Tokens**: `JetBrains Mono`, `Fira Code`, `Consolas`, `monospace` (Size: 0.9em)

---

## 3. Core Screens & Component Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR                                 MAIN CHAT VIEW                      │
│ ┌───────────────────────────┐ ┌────────────────────────────────────────────┐ │
│ │ 🔍 ACSRAG Brain          │ │ ☰ Adaptive Corrective Self-RAG  [Clear Chat]│ │
│ ├───────────────────────────┤ ├────────────────────────────────────────────┤ │
│ │ [+ New Chat]              │ │ 📖 Knowledge Base (3 Docs)                 │ │
│ ├───────────────────────────┤ │   [📄 Resume.pdf] [📄 Leave_Policy.pdf]    │ │
│ │ Conversations (4)         │ ├────────────────────────────────────────────┤ │
│ │ • Resume Candidate QA     │ │ 👤 User: What is the sick leave policy?    │ │
│ │ • Architecture Review     │ │                                            │ │
│ │ • Model Comparison        │ │ 🤖 Assistant:                              │ │
│ │                           │ │   Employees are entitled to 12 days...     │ │
│ │                           │ │   ┌──────────────────────────────────────┐ │ │
│ │                           │ │   │ 🧠 Think Mode: Grounded (98.6%)     │ │ │
│ │                           │ │   └──────────────────────────────────────┘ │ │
│ │                           │ ├────────────────────────────────────────────┤ │
│ │                           │ │ [ + ] Type a message or drop PDF...    [➤] │ │
│ └───────────────────────────┘ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Sidebar & Navigation
* **Brand Logo**: Bespoke **Precision Lens + Neural Spark Core** with dynamic hover tilt and cyan glow filter.
* **New Chat CTA**: Prominent button with quick keyboard shortcut binding (`SquarePen` icon).
* **Conversation List**: Per-chat title with inline inline rename (`Pencil`), share (`Share2`), and delete (`Trash2`) dropdown controls.
* **Collapsible / Resizable Drawer**: Drag-to-resize divider on desktop, full overlay on mobile devices.

### 3.2 Main Chat Interface & Knowledge Base Bar
* **Knowledge Base Header**: Displays currently indexed active documents for the active conversation thread with quick remove tags.
* **Message Bubbles**:
  * User bubble: Right-aligned with deep indigo accent.
  * Assistant bubble: Left-aligned glassmorphic card with full markdown rendering (bold, code blocks, bullet lists).
* **Self-RAG Reflection Card (Think Mode)**:
  * Collapsible accordion showing overall confidence score badge ($0.00 - 1.00$).
  * Granular claim-by-claim breakdown with checkmarks (`SUPPORTED`) or alert icons (`UNSUPPORTED`).
* **Input Box & Document Attachment**:
  * Multi-line expanding textarea with auto-focus.
  * Attachment `+` button and drag-and-drop zone for instant PDF uploading.
  * Real-time toggles for **🌐 Web Search** and **🧠 Think Mode**.

---

## 4. Interaction States & Motion Design

| State | Visual Representation | User Feedback |
| :--- | :--- | :--- |
| **Empty State** | 52px Brand Logo + Welcome Message | Subtitle prompting user to ask questions or upload documents. |
| **Loading / Thinking** | Shimmering gradient skeleton + pulsing status badge | Displays live pipeline step (*"🔍 Grading retrieved context..."*, *"⚡ Generating grounded response..."*). |
| **Error State** | Crimson-bordered alert card + Retry button | Friendly error message with troubleshooting tip. |
| **Web Search Suggestion** | Clean actionable `[ 🌐 Enable Web Search & Retry ]` button | Appears when internal documents lack context for an out-of-corpus query. |

---

## 5. Accessibility (A11y) & Responsiveness
* **ARIA Labels**: All interactive buttons (`sidebar-toggle`, `new-chat`, `upload`, `send`) include descriptive `title` and `aria-label` tags.
* **Color Contrast**: All text elements meet **WCAG 2.1 AA** contrast ratios ($\ge 4.5:1$ against dark background).
* **Mobile Viewport**: Fully responsive on screens $<768\text{px}$ with touch-friendly drawer backdrop.
