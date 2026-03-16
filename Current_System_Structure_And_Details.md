# MindMapper — Current System Structure & Details

> **Last Updated:** March 2026  
> **Author:** Dipan Bag (bag00003@umn.edu)  
> **Project:** UMN Capstone Project, Spring 2026  
> **Purpose:** Complete onboarding reference for new developers — covers every file, module, data flow, and design decision currently in the codebase.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [File & Directory Structure](#3-file--directory-structure)
4. [Tech Stack & Dependencies](#4-tech-stack--dependencies)
5. [Entry Points & Bootstrap Flow](#5-entry-points--bootstrap-flow)
6. [Component Architecture](#6-component-architecture)
   - [MindMapCanvas.jsx](#mindmapcanvasjsx--the-orchestrator)
   - [QueryNode.jsx](#querynodejsx--user-query-card)
   - [AnswerNode.jsx](#answernodejsx--ai-response-card)
   - [SourcesNode.jsx](#sourcesnodejsx--web-citations-card)
7. [State Management](#7-state-management)
8. [Services Layer](#8-services-layer)
   - [perplexity.js (Primary/Active)](#perplexityjs--primary-active-ai-service)
   - [openai.js (Secondary/Unused)](#openaijs--secondary-unused-ai-service)
9. [Constants & Configuration](#9-constants--configuration)
10. [Data Flow Diagrams](#10-data-flow-diagrams)
    - [New Query Flow](#a-new-query-flow)
    - [Bullet Expand Flow](#b-bullet-expand-flow)
    - [Sources Lookup Flow](#c-sources-lookup-flow)
    - [Custom Query Flow](#d-custom-query-flow)
11. [Node Graph Model (Edges & Handles)](#11-node-graph-model-edges--handles)
12. [Styling System](#12-styling-system)
13. [Environment Variables & API Keys](#13-environment-variables--api-keys)
14. [Inter-Module Communication Pattern](#14-inter-module-communication-pattern)
15. [Known Architecture Gaps & Planned Work](#15-known-architecture-gaps--planned-work)

---

## 1. Project Overview

**MindMapper** is a canvas-based, node-driven interface for exploring ideas with AI. The user can:
- Place **Query nodes** (questions/prompts) anywhere on an infinite 2D canvas
- Automatically receive **Answer nodes** (AI-generated bullet-point responses) connected by edges
- Interactively expand any bullet point into a deeper **Answer node**, fetch web **Sources nodes**, or ask **Custom follow-up queries**
- The resulting graph grows organically, preserving the relational structure of the exploration session

The current implementation is a **fully client-side React SPA** — there is no backend running yet. All AI calls originate directly from the browser using the Perplexity Sonar API (and an unused OpenAI module).

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                     │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              React Application (Vite SPA)         │   │
│  │                                                  │   │
│  │  ┌──────────┐   renders   ┌──────────────────┐   │   │
│  │  │  App.jsx │────────────▶│ MindMapCanvas.jsx│   │   │
│  │  └──────────┘             │ (ReactFlow host) │   │   │
│  │                           └────────┬─────────┘   │   │
│  │                    ┌───────────────┼──────────┐  │   │
│  │               renders         renders    renders │   │
│  │                    ▼               ▼          ▼  │   │
│  │            ┌───────────┐  ┌────────────┐  ┌─────────────┐│
│  │            │ QueryNode │  │ AnswerNode │  │ SourcesNode ││
│  │            └───────────┘  └────────────┘  └─────────────┘│
│  │                                                  │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │              Services Layer              │   │   │
│  │  │   perplexity.js (active)                 │   │   │
│  │  │   openai.js     (inactive/legacy)        │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────────┐       ┌─────────────────────┐
│  Perplexity API   │       │  microlink.io API   │
│  (sonar model)    │       │  (OG image fetch)   │
│  api.perplexity.ai│       │  api.microlink.io   │
└───────────────────┘       └─────────────────────┘
```

> **No backend exists today.** The README mentions a planned FastAPI/PostgreSQL/FAISS backend, but none has been scaffolded yet.

---

## 3. File & Directory Structure

```
mindmapper/                             ← repo root
├── README.md                           ← Project overview & setup guide
├── Current_System_Structure_And_Details.md  ← THIS FILE
├── docs/                               ← Excluded from this doc (PDFs, proposals)
│   └── Proposal_V1.pdf
└── frontend/                           ← Entire application lives here
    ├── index.html                      ← HTML shell; mounts React at #root
    ├── package.json                    ← Dependencies & npm scripts
    ├── package-lock.json               ← Lock file
    ├── vite.config.js                  ← Vite build config (React plugin only)
    ├── eslint.config.js                ← ESLint flat config (react-hooks, react-refresh)
    ├── .env                            ← API keys (gitignored in prod, present in dev)
    ├── public/
    │   └── vite.svg                    ← Favicon
    └── src/
        ├── main.jsx                    ← React entry point; mounts <App/> into #root
        ├── App.jsx                     ← Root component; renders <MindMapCanvas/>
        ├── index.css                   ← Global CSS reset & base typography
        ├── App.css                     ← Minimal app-level styles
        ├── assets/                     ← Static assets (empty currently)
        ├── styles/                     ← Empty; reserved for future global styles
        ├── constants/
        │   └── api.js                  ← API base URLs & key references
        ├── services/
        │   ├── perplexity.js           ← PRIMARY: all AI + sources calls
        │   └── openai.js               ← INACTIVE: OpenAI SDK wrapper (unused)
        └── components/
            ├── index.js                ← Barrel export for all components
            ├── MindMapCanvas.jsx       ← MAIN CANVAS; all state & node logic lives here
            ├── MindMapCanvas.css       ← Panel, button, and ReactFlow override styles
            ├── QueryNode.jsx           ← Green query/prompt node
            ├── QueryNode.css           ← Green color scheme styles
            ├── AnswerNode.jsx          ← Blue AI response node (bullet-point list)
            ├── AnswerNode.css          ← Blue color scheme + hover action menu styles
            ├── SourcesNode.jsx         ← Orange sources/citations node
            └── SourcesNode.css         ← Orange color scheme + card grid styles
```

---

## 4. Tech Stack & Dependencies

### Production Dependencies

| Package | Version | Role |
|---------|---------|------|
| `react` | ^19.2.0 | UI framework |
| `react-dom` | ^19.2.0 | DOM renderer |
| `@xyflow/react` | ^12.9.3 | Infinite canvas, node graph, edge routing |
| `openai` | ^6.16.0 | OpenAI JS SDK (imported but not actively used) |

### Dev Dependencies

| Package | Version | Role |
|---------|---------|------|
| `vite` | ^7.2.4 | Build tool & dev server |
| `@vitejs/plugin-react` | ^5.1.1 | JSX transform & HMR for React |
| `eslint` | ^9.39.1 | Linting |
| `eslint-plugin-react-hooks` | ^7.0.1 | Hooks lint rules |
| `eslint-plugin-react-refresh` | ^0.4.24 | Vite HMR lint rules |
| `@types/react`, `@types/react-dom` | ^19 | TypeScript type hints (used by IDEs) |
| `globals` | ^16.5.0 | ESLint browser/node globals |

### External APIs (No SDK, Raw Fetch)

| Service | Endpoint | Used For |
|---------|----------|----------|
| Perplexity Sonar | `https://api.perplexity.ai/chat/completions` | AI text responses & sources |
| microlink.io | `https://api.microlink.io/` | Open Graph image thumbnails for sources |

### npm Scripts

```bash
npm run dev      # Start Vite dev server at http://localhost:5173
npm run build    # Production bundle → dist/
npm run preview  # Serve production build locally
npm run lint     # ESLint check
```

---

## 5. Entry Points & Bootstrap Flow

```
index.html
  └── <script type="module" src="/src/main.jsx">
        └── createRoot(document.getElementById('root')).render(
              <StrictMode>
                <App />
              </StrictMode>
            )
              └── App.jsx → renders <MindMapCanvas />
                    └── MindMapCanvas.jsx → ReactFlow canvas with:
                          - initialNodes (demo Climate Change Q&A)
                          - initialEdges
                          - Custom nodeTypes registry
                          - All handler callbacks
```

**Key detail:** `index.html` has `<title>frontend</title>` — this is the default Vite placeholder and should be updated to "MindMapper".

---

## 6. Component Architecture

### `MindMapCanvas.jsx` — The Orchestrator

**Location:** `frontend/src/components/MindMapCanvas.jsx`  
**Size:** 626 lines  
**Purpose:** Central hub. Owns ALL application state and ALL business logic. Renders the ReactFlow canvas and passes callbacks down into node data props.

#### State Variables

| State | Type | Initial Value | Purpose |
|-------|------|---------------|---------|
| `nodes` | `Node[]` | `initialNodes` (2 demo nodes) | ReactFlow node list |
| `edges` | `Edge[]` | `initialEdges` (1 demo edge) | ReactFlow edge list |
| `showQueryInput` | `boolean` | `false` | Controls top-left query input accordion |
| `newQueryText` | `string` | `''` | Controlled input for new query textarea |
| `nodeIdCounter` | `number` | `2` | Monotonically incrementing ID generator |
| `customQueryInput` | `object` | `{ show: false, nodeId: null, bulletText: '', bulletIndex: null }` | Controls custom query modal panel |
| `customQueryText` | `string` | `''` | Controlled input for custom query textarea |

#### Registered Custom Node Types

```js
const nodeTypes = {
  query: QueryNode,
  answer: AnswerNode,
  sources: SourcesNode,
};
```

ReactFlow uses this map to render the correct component given a node's `type` field.

#### Handler Functions (Callbacks passed to nodes via `data`)

| Function | Signature | Triggered By | What It Does |
|----------|-----------|--------------|--------------|
| `onConnect` | `(params)` | User drags edge | Adds edge via ReactFlow `addEdge` |
| `getNextId` | `(prefix) → string` | All create operations | Returns `"{prefix}-{counter}"`, increments counter |
| `handleExpand` | `(nodeId, bulletIndex, bulletText)` | AnswerNode "Expand" button | Creates loading AnswerNode → calls `expandBullet()` → updates node |
| `handleSources` | `(nodeId, bulletIndex, bulletText)` | AnswerNode "Sources" button | Creates loading SourcesNode → calls `getBulletSources()` → updates node |
| `handleCustomQuery` | `(nodeId, bulletIndex, bulletText)` | AnswerNode "Custom" button | Opens custom query modal with bullet context |
| `submitCustomQuery` | `()` | Custom modal "Submit" button | Creates QueryNode + loading AnswerNode → calls `getAIResponse()` with context |
| `simulateAnswer` | `(queryId, queryText)` | `addQueryNode` | Creates loading AnswerNode → calls `getAIResponse()` → updates node |
| `addQueryNode` | `()` | "Add Query" button | Creates root QueryNode at random position → triggers `simulateAnswer` |

#### Node Positioning Logic

New nodes are positioned **relative to their parent node**:
- **Expand / Sources:** `x = parent.x + 450`, `y = parent.y + (bulletIndex * 40)`
- **Custom Query node:** Same as above
- **Custom Answer node:** `x = parent.x + 900`, `y = parent.y + (bulletIndex * 40)`
- **Simulate Answer (root):** `x = query.x - 20`, `y = query.y + 150`
- **New root Query:** `x = random(100..500)`, `y = random(50..250)`

#### `nodesWithHandlers` Pattern

Because `initialNodes` don't have handler callbacks in their `data` (they're defined statically), `MindMapCanvas` applies a `.map()` pass over all nodes before passing them to ReactFlow:

```js
const nodesWithHandlers = nodes.map((node) => {
  if (node.type === 'answer') {
    return { ...node, data: { ...node.data, onExpand, onSources, onCustomQuery } };
  }
  return node;
});
```

This ensures even the initial demo `AnswerNode` gets live callbacks.

#### UI Panels (ReactFlow `<Panel>` overlays)

| Position | Content |
|----------|---------|
| `top-left` | App title ("MindMapper"), subtitle, "+ New Query" button / query textarea |
| `top-right` | Color legend (Query=green, Answer=blue, Sources=orange) |
| `top-center` | Custom query modal (shown only when `customQueryInput.show === true`) |
| `bottom-right` | ReactFlow `<Controls>` (zoom, fit view) |
| `bottom-left` | ReactFlow `<MiniMap>` (overview thumbnail) |

---

### `QueryNode.jsx` — User Query Card

**Location:** `frontend/src/components/QueryNode.jsx`  
**Size:** 37 lines  
**Color:** 🟢 Green (`#4caf50`)  
**Purpose:** Displays the user's question/prompt text. Stateless — renders `data.label`.

#### ReactFlow Handles

| Handle | Type | Position | ID |
|--------|------|----------|----|
| Target (input) | `target` | Top | (default) |
| Source (output) | `source` | Bottom | (default) |

#### Props Received via `data`

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | The question text to display |

---

### `AnswerNode.jsx` — AI Response Card

**Location:** `frontend/src/components/AnswerNode.jsx`  
**Size:** 121 lines  
**Color:** 🔵 Blue (`#2196f3`)  
**Purpose:** Renders an LLM response as a list of interactive bullet points. Most complex node.

#### Local State

| State | Purpose |
|-------|---------|
| `hoveredBullet` | Index of the currently hovered bullet (null if none). Controls action menu visibility and handle opacity. |

#### Bullet Parsing

Bullets are normalized from `data.bullets` (array) OR `data.label` (newline-delimited string):
```js
const bullets = Array.isArray(data.bullets)
  ? data.bullets
  : (data.label || '').split('\n').filter(line => line.trim());
```

#### Per-Bullet Interactive Options (hover menu)

When a bullet is hovered, three action buttons appear with a fade-in animation:

| Button | Icon | Calls |
|--------|------|-------|
| Expand | `↳ Expand` | `data.onExpand(id, bulletIndex, bulletText)` |
| Sources | `🔍 Sources` | `data.onSources(id, bulletIndex, bulletText)` |
| Custom | `✏️ Custom` | `data.onCustomQuery(id, bulletIndex, bulletText)` |

#### ReactFlow Handles

| Handle | Type | Position | ID | Notes |
|--------|------|----------|----|-------|
| Per-bullet source | `source` | Right | `bullet-{index}` | One per bullet; opacity 0 unless bullet is hovered |
| Target (input) | `target` | Top | (default) | Receives edges from QueryNodes |
| Source (output) | `source` | Bottom | (default) | For free-hand manual edge connections |

#### Props Received via `data`

| Prop | Type | Description |
|------|------|-------------|
| `bullets` | `string[]` | Array of bullet point strings |
| `label` | `string` | Fallback if bullets is not an array |
| `onExpand` | `function` | Injected by MindMapCanvas |
| `onSources` | `function` | Injected by MindMapCanvas |
| `onCustomQuery` | `function` | Injected by MindMapCanvas |

---

### `SourcesNode.jsx` — Web Citations Card

**Location:** `frontend/src/components/SourcesNode.jsx`  
**Size:** 106 lines  
**Color:** 🟠 Orange (`#ff9800`)  
**Purpose:** Displays a list of clickable source articles returned by Perplexity, with lazy-loaded Open Graph thumbnail images.

#### Local State

| State | Purpose |
|-------|---------|
| `sources` | Array of `{ title, url, image }` objects. Initially populated from `data.sources` prop; images loaded lazily. |

#### Image Loading (`useEffect`)

When `data.sources` changes:
1. Sources are immediately displayed (with `image: null` placeholders, showing 📄 emoji)
2. `Promise.all(data.sources.map(fetchArticleImage))` kicks off in the background
3. On completion, `setSources(sourcesWithImages)` triggers a re-render to show thumbnails

`fetchArticleImage` is imported from `perplexity.js` and hits the `microlink.io` API.

#### Rendering

Each source renders as a clickable `<a>` tag (opens in new tab) with:
- A thumbnail image (80×60px) or fallback 📄 emoji
- Article title (truncated at 80 chars with `...`)
- Domain name extracted via `new URL(source.url).hostname`

#### ReactFlow Handles

| Handle | Type | Position | Notes |
|--------|------|----------|-------|
| Target (input) | `target` | Top | Receives edge from AnswerNode bullets |

SourcesNode has no output handle — it is a **terminal node** in the graph.

#### Props Received via `data`

| Prop | Type | Description |
|------|------|-------------|
| `sources` | `Array<{title, url, image}>` | Source objects from Perplexity |
| `label` | `string` | Placeholder text during loading |

---

## 7. State Management

There is **no global state library** (no Redux, Zustand, Context API). All state is managed via `useState` + `useCallback` hooks in `MindMapCanvas.jsx`, which acts as the single source of truth.

Callbacks are passed down through the ReactFlow `data` prop object on each node:

```
MindMapCanvas (state owner)
  │
  ├── nodes: Node[]  ─────────────────────────────────────────┐
  │     node.data = {                                          │
  │       bullets: string[],    // content                     │
  │       onExpand: fn,         // ← callback reference       │
  │       onSources: fn,        // ← callback reference       │◄─ injected via nodesWithHandlers
  │       onCustomQuery: fn,    // ← callback reference       │
  │     }                                                      │
  └── edges: Edge[]                                            │
                                                               │
  AnswerNode receives node.data and calls data.onExpand(...)──┘
```

**Important:** Callbacks are re-created when their dependencies change (due to `useCallback`). Because `handleExpand` depends on `getNextId`, `setNodes`, and `setEdges`, any re-render that changes these (which is every render that updates node counter) causes all callbacks to be re-created. This is functional but not fully optimized.

---

## 8. Services Layer

### `perplexity.js` — Primary (Active) AI Service

**Location:** `frontend/src/services/perplexity.js`  
**Size:** 233 lines  
**Base URL:** `https://api.perplexity.ai/chat/completions`  
**Model:** `sonar`  
**Auth:** Bearer token from `VITE_PERPLEXITY_API_KEY`

#### Exported Functions

---

**`getAIResponse(query, context = []) → Promise<string[]>`**

Called by: `MindMapCanvas.simulateAnswer`, `MindMapCanvas.submitCustomQuery`

Flow:
1. Builds system prompt telling Sonar to respond as 5–6 bullet points
2. Combines optional `context` array + user `query` into `messages`
3. POSTs to Perplexity API
4. Parses response: splits on newlines, strips bullet markers (`-`, `•`, `*`), numbered prefixes, `**bold**` markdown, and citation markers (`[1]`, `[1,2]`)
5. Returns up to 6 clean strings

Error handling: returns single-element array with human-readable error string (401 → invalid key, 429 → rate limit, else generic).

---

**`expandBullet(bulletText, originalQuery) → Promise<string[]>`**

Called by: `MindMapCanvas.handleExpand`

Constructs a query: `"Based on this context: '...', please elaborate on this point: '...'."` then delegates to `getAIResponse`.

---

**`fetchArticleImage(url) → Promise<string | null>`**

Called by: `SourcesNode` (internal useEffect)

Hits `https://api.microlink.io/?url={encoded}&screenshot=false&video=false`, extracts `data.data.image.url` from Open Graph metadata. Returns `null` on any failure.

---

**`getBulletSources(bulletText) → Promise<Array<{title, url, image}>>`**

Called by: `MindMapCanvas.handleSources`

Flow:
1. POSTs query to Perplexity API with `return_citations: true`
2. Extracts `data.citations` (array of URLs from Perplexity)
3. Extracts content lines to use as titles (parallel to citation URLs)
4. Maps each citation URL to `{ title, url, image: null }` (up to 5 sources)
5. If title can't be extracted from content, falls back to URL path parsing
6. Returns fallback Google search link if citations array is empty

---

### `openai.js` — Secondary (Unused) AI Service

**Location:** `frontend/src/services/openai.js`  
**Size:** 92 lines  
**Status:** ⚠️ **Currently not imported or called anywhere in the running app.** The `MindMapCanvas` imports from `perplexity.js` exclusively.

Uses the official `openai` npm package:
```js
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});
```

Exports the same function signatures as `perplexity.js`:
- `getAIResponse(query, context)` — uses `gpt-3.5-turbo`, `max_tokens: 500`
- `expandBullet(bulletText, originalQuery)`
- `getBulletSources(bulletText)` — asks GPT for source descriptions (no actual URL citations)

The `dangerouslyAllowBrowser: true` flag is needed because the OpenAI SDK normally blocks browser usage (API key exposure risk).

---

## 9. Constants & Configuration

**Location:** `frontend/src/constants/api.js`

```js
export const PERPLEXITY_API_KEY = import.meta.env.VITE_PERPLEXITY_API_KEY;
export const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
```

`OPENAI_API_URL` and `OPENAI_API_KEY` are exported but the `openai.js` service uses the SDK (not this URL directly). These may be intended for a future raw-fetch implementation.

**Vite Config** (`vite.config.js`):
```js
export default defineConfig({ plugins: [react()] });
```
Minimal — no proxy, no path aliases, no custom port.

**ESLint Config** (`eslint.config.js`): Flat config using `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`. Standard React project linting.

---

## 10. Data Flow Diagrams

### A. New Query Flow

```
User clicks "+ New Query"
  → showQueryInput = true (textarea appears)
  → User types question, presses Enter or "Add Query"
  → addQueryNode()
      → getNextId('query') → queryId
      → Creates QueryNode at random(x,y), pushes to nodes[]
      → simulateAnswer(queryId, queryText)
          → getNextId('answer') → answerId
          → Creates AnswerNode{bullets:['Loading...']} at (queryX-20, queryY+150)
          → Creates edge: queryId → answerId (blue, #2196f3)
          → await getAIResponse(queryText)  [perplexity.js]
              → POST https://api.perplexity.ai/chat/completions
              → Returns string[]
          → Updates AnswerNode with real bullets + callbacks
```

### B. Bullet Expand Flow

```
User hovers AnswerNode bullet → actions menu appears
  → Clicks "↳ Expand"
  → AnswerNode calls data.onExpand(nodeId, bulletIndex, bulletText)
  → MindMapCanvas.handleExpand(nodeId, bulletIndex, bulletText)
      → getNextId('answer') → expandedAnswerId
      → Creates AnswerNode{bullets:['Expanding...']} at (parentX+450, parentY + bulletIndex*40)
      → Creates edge: nodeId [sourceHandle: bullet-{bulletIndex}] → expandedAnswerId (purple, #9c27b0)
      → await expandBullet(bulletText, '')  [perplexity.js]
          → Constructs elaboration prompt
          → POST https://api.perplexity.ai/chat/completions
          → Returns string[]
      → Updates expandedAnswerNode with real bullets + callbacks
```

### C. Sources Lookup Flow

```
User hovers AnswerNode bullet → actions menu appears
  → Clicks "🔍 Sources"
  → AnswerNode calls data.onSources(nodeId, bulletIndex, bulletText)
  → MindMapCanvas.handleSources(nodeId, bulletIndex, bulletText)
      → getNextId('sources') → sourcesId
      → Creates SourcesNode{sources:[]} at (parentX+450, parentY + bulletIndex*40)
      → Creates edge: nodeId [sourceHandle: bullet-{bulletIndex}] → sourcesId (orange, #ff9800)
      → await getBulletSources(bulletText)  [perplexity.js]
          → POST with return_citations:true
          → Extracts citation URLs + content lines for titles
          → Returns [{title, url, image:null}, ...]
      → Updates SourcesNode.data.sources = [{...}]
      → SourcesNode.useEffect fires → fetchArticleImage() per source (microlink.io)
      → Sources re-render with thumbnail images
```

### D. Custom Query Flow

```
User hovers AnswerNode bullet → actions menu appears
  → Clicks "✏️ Custom"
  → AnswerNode calls data.onCustomQuery(nodeId, bulletIndex, bulletText)
  → MindMapCanvas sets customQueryInput = { show:true, nodeId, bulletText, bulletIndex }
  → Custom query Panel appears at top-center
  → User types custom question, presses Enter or "Submit Query"
  → submitCustomQuery()
      → getNextId('query') → queryId
      → getNextId('answer') → answerId
      → Creates QueryNode{label: customText} at (parentX+450, parentY + bulletIndex*40)
      → Creates AnswerNode{bullets:['Loading...']} at (parentX+900, parentY + bulletIndex*40)
      → Creates edge: nodeId [bullet-{bulletIndex}] → queryId (orange)
      → Creates edge: queryId → answerId (blue)
      → Closes modal
      → contextQuery = `Context: "${bulletText}". Question: ${customQueryText}`
      → await getAIResponse(contextQuery)  [perplexity.js]
      → Updates answerId node with real bullets + callbacks
```

---

## 11. Node Graph Model (Edges & Handles)

### Edge Color Coding

| Color | Hex | Meaning |
|-------|-----|---------|
| Blue | `#2196f3` | Query → Answer (main response) |
| Purple | `#9c27b0` | Answer bullet → Expanded Answer |
| Orange | `#ff9800` | Answer bullet → Sources OR Answer bullet → Custom Query |

### Default Edge Style

```js
const defaultEdgeOptions = {
  style: { strokeWidth: 2 },
  type: 'smoothstep',
};
```

All edges are `smoothstep` type (rounded corners). Stroke width is 2px across the board.

### Handle Architecture per Node Type

```
QueryNode:
  ┌───────────────┐
  │  ↓ (target)   │  ← receives edges from parent Answer bullets (custom queries)
  │   QUERY NODE  │
  │  ↓ (source)   │  → connects to Answer nodes
  └───────────────┘

AnswerNode:
  ┌────────────────────────────────┐
  │  ↓ (target, top)              │  ← receives edges from Query nodes
  │   • bullet 0  ● ──────────── │→  source handle: bullet-0 (right side, per bullet)
  │   • bullet 1  ● ──────────── │→  source handle: bullet-1
  │   • bullet 2  ● ──────────── │→  source handle: bullet-2
  │  ↓ (source, bottom)           │  → free-form source handle
  └────────────────────────────────┘

SourcesNode:
  ┌───────────────┐
  │  ↓ (target)   │  ← receives edges from Answer bullet handles
  │  SOURCES NODE │
  │  (no source)  │  ← terminal node, no outputs
  └───────────────┘
```

---

## 12. Styling System

All styles are **vanilla CSS** with `.css` files co-located with their component. No CSS Modules, no preprocessors, no Tailwind.

### Color Palette

| Token (by concept) | Value | Usage |
|---|---|---|
| Query green | `#4caf50` | QueryNode border, header, handle |
| Query green dark | `#43a047`, `#388e3c` | Hover states |
| Answer blue | `#2196f3` | AnswerNode border, header, handle, bullet marker |
| Answer blue dark | `#1565c0` | Bullet text color |
| Sources orange | `#ff9800` | SourcesNode border, header, handle |
| Sources orange dark | `#e65100`, `#f57c00` | Title text, domain text |
| Expand action | `#4caf50` bg, `#2e7d32` text | Expand button |
| Sources action | `#ff9800` bg, `#e65100` text | Sources button |
| Custom action | `#9c27b0` bg, `#7b1fa2` text | Custom query button |
| Canvas BG | `linear-gradient(135deg, #f8fafc, #e2e8f0)` | Full viewport background |
| Panel BG | `white` | All overlay panels |
| SlateGray | `#64748b`, `#94a3b8` | Secondary text, subtitles |

### Global Styles (`index.css`)

- Font: `'Inter', system-ui, -apple-system, sans-serif`
- Base colors: text `#1e293b`, bg `#f8fafc`
- `box-sizing: border-box` on all elements
- `#root` fills 100% viewport width and height

### Node Sizing

| Node | min-width | max-width |
|------|-----------|-----------|
| QueryNode | 200px | 300px |
| AnswerNode | 280px | 380px |
| SourcesNode | 350px | 500px |

### Animation

- Bullet action menu: CSS `@keyframes fadeIn` (opacity 0→1, translateY -4px→0, 0.15s)
- Node hover: `box-shadow` transitions (0.2s ease)
- Bullet handle: `opacity` transition (0.2s ease)
- Button hover: `translateY(-1px)` / `translateY(-2px)` lifts

---

## 13. Environment Variables & API Keys

**File:** `frontend/.env`

```
VITE_OPENAI_API_KEY=sk-proj-...
VITE_PERPLEXITY_API_KEY=pplx-...
```

> ⚠️ **Security Note:** `.env` is committed to the repo and contains live API keys. This is a known risk and acceptable for a local Capstone demo, but keys should be rotated and `.env` added to `.gitignore` before any public deployment. The `openai.js` file explicitly acknowledges this with the `dangerouslyAllowBrowser: true` flag.

Vite exposes env variables prefixed with `VITE_` to the browser bundle via `import.meta.env`.

---

## 14. Inter-Module Communication Pattern

The communication architecture is a **top-down callback injection pattern**:

```
MindMapCanvas (parent, state owner)
│
│  Injects callbacks into node data:
│  node.data = { onExpand, onSources, onCustomQuery }
│
├──▶ AnswerNode (child, event emitter)
│     Calls data.onExpand(nodeId, bulletIndex, bulletText)
│     Calls data.onSources(nodeId, bulletIndex, bulletText)
│     Calls data.onCustomQuery(nodeId, bulletIndex, bulletText)
│
│  MindMapCanvas handles the event, calls service:
│
├──▶ perplexity.js (service, API client)
│     getAIResponse()     → POST Perplexity API
│     expandBullet()      → POST Perplexity API
│     getBulletSources()  → POST Perplexity API (with citations)
│     fetchArticleImage() → GET microlink.io
│
└──▶ SourcesNode (child, self-manages image loading)
      Imports fetchArticleImage directly from perplexity.js
      Uses useEffect to lazy-load images after data.sources prop changes
```

**Key design choices:**
- `QueryNode` and `SourcesNode` are nearly stateless; `AnswerNode` has minimal local hover state
- All node creation, edge creation, and API orchestration lives in `MindMapCanvas`
- `SourcesNode` is the only component that directly imports a service — it manages its own image-loading side effect because image loading is purely display-level

---

## 15. Known Architecture Gaps & Planned Work

### Currently Missing (not yet built)

| Gap | Details |
|-----|---------|
| **No Backend** | All API calls go directly from browser. Keys are exposed in client bundle. |
| **No Persistence** | The canvas resets on page refresh. No localStorage, no DB. |
| **No Context Tracking** | Bullet expansion passes `''` as `originalQuery` — branch context is not tracked. |
| **`openai.js` dead code** | Module exists and is fully functional but nothing imports it. |
| **No RAG / Embeddings** | No FAISS or Sentence Transformers implemented yet. |
| **nodeIdCounter closure bug** | `getNextId` uses `useCallback` with `nodeIdCounter` dependency, causing staleness in rapid sequential calls. |
| **No error boundary** | If a node render crashes, the whole canvas crashes. |
| **`index.html` title** | Still says "frontend" (Vite default) — should say "MindMapper". |

### Planned Features (from README / Proposal)
- FastAPI backend to proxy all LLM calls (removes key exposure)
- PostgreSQL for session persistence
- FAISS vector store for branch-local RAG context
- Running per-branch summaries
- Collaborative multi-user editing
- Session save/load

---

*This document was generated by code review of the full source tree (excluding `docs/`) as of March 2026. Update it whenever major structural changes are made.*
