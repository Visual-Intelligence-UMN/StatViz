# StatViz — Current System Structure & Details

> **Last Updated:** May 4, 2026
> **Author:** Dipan Bag (bag00003@umn.edu)
> **Project:** UMN Capstone Project, Spring 2026
> **Hosted At:** GitHub Pages via `actions/deploy-pages`, route `/mindmapper/statviz`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [File & Directory Structure](#3-file--directory-structure)
4. [Tech Stack & Dependencies](#4-tech-stack--dependencies)
5. [Routing & Entry Points](#5-routing--entry-points)
6. [Zustand Store](#6-zustand-store)
7. [Component Architecture](#7-component-architecture)
8. [Node Types Reference](#8-node-types-reference)
9. [Charts System](#9-charts-system)
10. [API Services Layer](#10-api-services-layer)
11. [Statistics Engine](#11-statistics-engine)
12. [CSV Parser](#12-csv-parser)
13. [Layout Engine](#13-layout-engine)
14. [Right Sidebar: Theme + Ask AI](#14-right-sidebar-theme--ask-ai)
15. [Theming System](#15-theming-system)
16. [Key Workflows](#16-key-workflows)
17. [Edge & Handle Conventions](#17-edge--handle-conventions)
18. [API Key Handling](#18-api-key-handling)
19. [Deployment](#19-deployment)

---

## 1. Project Overview

StatViz is a browser-only, node-based exploratory data analysis workspace designed to help users move from raw tabular data to interpretable statistical conclusions. Users upload a single CSV dataset, inspect its structure, generate AI-assisted insights, turn those insights into hypotheses, run statistical tests in-browser when possible, and inspect results as connected nodes on a React Flow canvas.

The current system is centered around a **visual analysis pipeline**:

1. Upload dataset
2. Parse schema and compute column statistics
3. Auto-generate a dataset description
4. Expand into a dataset summary node
5. Generate AI insights
6. Generate or author hypotheses
7. Run statistical tests or AI-assisted fallback estimates
8. Query the full evolving analysis from the right-side "Ask AI" chat

There is no backend. CSV parsing, statistics, graph state, charts, and OpenAI requests all happen client-side in the browser.

**Current headline capabilities:**
- CSV upload by drag-and-drop or click-to-upload popup
- Dataset description generation from schema
- Summary node with completeness chart, mixed visual preview cards, and a right-side dataset-details expansion
- AI-generated insight nodes
- AI-generated hypothesis nodes
- Custom free-text hypothesis workflow
- In-browser statistical testing using `jstat`, including Pearson, Welch's t-test, chi-square, and one-way ANOVA
- AI fallback for unsupported tests
- Result nodes with AI-assisted interpretation, accept/reject branching, and re-run support
- AI-generated next-step recommendations after accepted results
- AI-generated sibling hypotheses after rejected results
- Fixed top-right quick analysis summary overlay powered by the full graph context
- Right sidebar with dark mode toggle and dataset-aware AI chat
- Client-side tool calling over the live dataset and analysis context
- Scoped Ask AI follow-ups that can target the full dataset or a specific analysis branch

---

## 2. High-Level Architecture

```text
Browser
│
├── React Router
│   ├── /          → LandingPage
│   └── /statviz   → AppShell → modes/data/DataModeApp
│
├── DataModeApp
│   ├── Handles theme state
│   ├── Handles CSV drag/drop and upload popup
│   ├── Hosts fixed top-right quick summary toggle / panel
│   ├── Mounts right sidebar (dark mode + Ask AI)
│   ├── Mounts DataCanvas
│   └── Gates usage through ApiKeyModal
│
├── Zustand Store (useDataModeStore)
│   ├── Graph state: nodes, edges, selection
│   ├── Dataset state: metadata, spec, description
│   └── Analysis registry: dataset, insights, hypotheses, results
│
├── DataCanvas (React Flow)
│   ├── Renders custom nodes
│   ├── Syncs graph updates with Zustand
│   └── Runs Dagre auto-layout on structural changes
│
├── Data Nodes
│   ├── Dataset → Summary
│   ├── Summary → Insights / More Details
│   ├── Insight → Hypothesis
│   ├── Hypothesis → Result
│   ├── Summary → Custom Hypothesis → Result
│   └── Result → Next Step / Sibling Hypothesis
│
└── AI / Stats Layer
    ├── descriptionService
    ├── datasetDetailsService
    ├── insightService
    ├── hypothesisService
    ├── customHypothesisService
    ├── followupService
    ├── analysisSummaryService
    ├── chartTypeService
    ├── statisticsService
    └── chatTools + ChatPanel
```

---

## 3. File & Directory Structure

```text
mindmapper/
├── Current_System_Structure_And_Details.md   ← THIS FILE
├── README.md
├── docs/
├── .github/workflows/deploy.yml
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── public/
    │   └── 404.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── constants/
        │   ├── api.js
        │   └── models.js
        ├── app/
        │   ├── AppShell.jsx/.css
        │   └── DataModeApp.jsx/.css          ← legacy scaffold, not the active route entry
        ├── pages/
        │   └── LandingPage.jsx/.css
        ├── modes/
        │   ├── qa/
        │   │   └── QAModeApp.jsx             ← legacy / separate mode work
        │   └── data/
        │       ├── DataModeApp.jsx/.css      ← active Data Mode root
        │       ├── store/
        │       │   ├── useDataModeStore.js
        │       │   └── analysisContext.js
        │       ├── components/
        │       │   ├── DataCanvas.jsx
        │       │   ├── UploadPopup.jsx/.css
        │       │   ├── ApiKeyModal.jsx/.css
        │       │   ├── ChatPanel.jsx/.css
        │       │   └── DatasetSidebar.jsx/.css   ← present but not currently mounted
        │       ├── nodes/
        │       │   ├── DatasetNode.jsx
        │       │   ├── DatasetSummaryNode.jsx
        │       │   ├── DatasetDetailsNode.jsx
        │       │   ├── InsightNode.jsx
        │       │   ├── HypothesisNode.jsx
        │       │   ├── CustomHypothesisNode.jsx
        │       │   ├── ResultNode.jsx
        │       │   ├── ColumnNode.jsx
        │       │   ├── TestNode.jsx
        │       │   ├── InterpretationNode.jsx
        │       │   ├── NextStepNode.jsx
        │       │   ├── ColumnChart.jsx
        │       │   ├── charts/
        │       │   │   ├── InsightChart.jsx
        │       │   │   ├── ResultChart.jsx
        │       │   │   ├── chartData.js
        │       │   │   └── charts.css
        │       │   ├── nodes.css
        │       │   └── index.js
        │       ├── api/
        │       │   ├── descriptionService.js
        │       │   ├── datasetDetailsService.js
        │       │   ├── insightService.js
        │       │   ├── hypothesisService.js
        │       │   ├── customHypothesisService.js
        │       │   ├── followupService.js
        │       │   ├── analysisSummaryService.js
        │       │   ├── chartTypeService.js
        │       │   ├── statisticsService.js
        │       │   └── chatTools.js
        │       └── utils/
        │           ├── csvParser.js
        │           ├── layoutGraph.js
        │           ├── insightEngine.js       ← older helper / not central to current flow
        │           └── mockGraph.js
        ├── components/                        ← older Q&A/canvas components
        └── services/                          ← older OpenAI / Perplexity service layer
```

---

## 4. Tech Stack & Dependencies

| Package | Role |
|---------|------|
| React 19 | UI framework |
| React Router DOM 7 | Client-side routing |
| `@xyflow/react` | Infinite canvas, nodes, edges, handles |
| Zustand | Central app state |
| Recharts | Node charts and mini charts |
| `jstat` | In-browser statistical tests |
| `@dagrejs/dagre` | Auto-layout engine |
| `react-markdown` | Markdown rendering in chat assistant responses |
| Vite | Build and dev tooling |

**External API endpoint used by the current Data Mode flow:**

| Service | Endpoint | Purpose |
|---------|----------|---------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | Dataset description, insights, hypotheses, chart resolution, custom hypothesis help, AI fallback tests, Ask AI chat |

**Model currently configured:** `gpt-4o-mini`

Note: `package.json` still includes the `openai` npm package, but the active data-mode services use raw `fetch`, not the SDK.

---

## 5. Routing & Entry Points

Routing is defined in `frontend/src/main.jsx` using `BrowserRouter` with `basename={import.meta.env.BASE_URL}`.

**Routes:**
- `/` → `LandingPage`
- `/statviz` → `AppShell` → `modes/data/DataModeApp`
- `*` → redirect to `/`

**Important current detail:**
- The active Data Mode implementation is `frontend/src/modes/data/DataModeApp.jsx`
- `frontend/src/app/DataModeApp.jsx` is an older scaffold and is not what the `/statviz` route mounts today

**GitHub Pages SPA routing:**
- `frontend/public/404.html` rewrites deep links into a `?p=` query parameter
- `frontend/index.html` decodes that query before React mounts
- This allows direct navigation to `/mindmapper/statviz`

---

## 6. Zustand Store

**File:** `frontend/src/modes/data/store/useDataModeStore.js`

The store is the source of truth for both the visual graph and the logical analysis record.

### Core state

| Key | Type | Description |
|-----|------|-------------|
| `nodes` | `Node[]` | React Flow nodes |
| `edges` | `Edge[]` | React Flow edges |
| `selectedNode` | `Node \| null` | Current selection |
| `datasetMetadata` | `object \| null` | File-level metadata |
| `datasetSpec` | `object \| null` | Parsed schema and raw values |
| `insightSuggestions` | `object[]` | Latest AI insight payload |
| `datasetDescription` | `string` | AI-generated or user-edited description |
| `workflowStep` | `string` | Current stage such as `idle`, `dataset`, `insight` |
| `apiKey` | `string` | Session key from `sessionStorage` |

### Analysis registry

The app no longer relies only on `node.data` when preparing AI context. It also keeps a normalized analysis registry:

| Key | Type | Purpose |
|-----|------|---------|
| `dataset` | object \| null | Clean dataset summary for prompts |
| `insights` | `Map<nodeId, InsightRecord>` | Insight records independent of UI rendering |
| `hypotheses` | `Map<nodeId, HypothesisRecord>` | Hypothesis status and metadata |
| `results` | `Map<nodeId, ResultRecord>` | Test outcomes and AI-assist flags |

This registry is assembled into a clean prompt object by `analysisContext.js`.

### Important actions

| Action | Description |
|--------|-------------|
| `setNodes`, `setEdges` | Replace arrays or use updater functions |
| `addNode`, `addEdge` | Append graph items |
| `removeNode` | Remove node and all connected edges |
| `updateNodeData` | Patch one node's `data` |
| `setDataset` | Save parsed metadata/spec and build dataset record |
| `setDatasetDescription` | Update free-text description and mirror into dataset record |
| `setInsights` | Store raw insight suggestions and move workflow step forward |
| `setApiKey` | Persist key to `sessionStorage` and state |
| `resetGraph` | Clear graph and analysis registry for a new upload |
| `addInsightRecord` | Register insight in normalized analysis map |
| `resolveInsightChart` | Save resolved chart type/columns and patch node data |
| `addHypothesisRecord` | Register generated or custom hypothesis |
| `updateHypothesisStatement` | Keep inline edits in sync between node and registry |
| `updateHypothesisStatus` | Persist accepted/rejected/pending status |
| `addResultRecord` | Register test result in analysis map |
| `allocateNextStepIdentifier` | Issue `NS1`, `NS2`, … identifiers |
| `allocateInterpretationIdentifier` | Issue `INT1`, `INT2`, … identifiers |
| `allocateDetailsIdentifier` | Issue `DD1`, `DD2`, … identifiers |

---

## 7. Component Architecture

### DataModeApp

**File:** `frontend/src/modes/data/DataModeApp.jsx`

This is the real Data Mode root.

It is responsible for:
- theme state (`light` / `dark`)
- whole-shell drag-and-drop CSV upload
- click-to-upload popup positioning
- right sidebar open/close and resize behavior
- fixed top-right quick analysis summary toggle and overlay
- mounting `ChatPanel`
- mounting `DataCanvas`
- gating the app with `ApiKeyModal`

The right sidebar lives directly inside this component and currently contains:
- a dark mode toggle
- an "Ask AI" section with `ChatPanel`

The shell also now includes a fixed quick-summary icon in the top-right corner. It opens a compact AI-generated analysis summary panel that uses the full normalized graph context and can be toggled open/closed without changing the graph.

### DataCanvas

**File:** `frontend/src/modes/data/components/DataCanvas.jsx`

Wraps `ReactFlow` and synchronizes all node/edge changes with Zustand.

It includes:
- `Background`
- `Controls`
- `MiniMap`
- a local `LayoutEngine` helper component

### UploadPopup

**File:** `frontend/src/modes/data/components/UploadPopup.jsx`

Appears when the user clicks the empty canvas before uploading a dataset. It supports both clicking a file input and dropping a CSV onto the popup itself. On success it:

1. parses the CSV
2. resets prior graph state
3. stores dataset metadata/spec
4. spawns the initial dataset node

### ApiKeyModal

**File:** `frontend/src/modes/data/components/ApiKeyModal.jsx`

Blocking modal shown when `apiKey` is empty. The copy explicitly tells the user the key is stored only for the browser session and sent directly to OpenAI.

### ChatPanel

**File:** `frontend/src/modes/data/components/ChatPanel.jsx`

This is the mounted "Ask AI" experience in the right sidebar. It:
- streams assistant responses token-by-token
- supports OpenAI tool calling
- renders tool outputs as cards, tables, and small charts
- uses `datasetSpec` plus `buildAnalysisContext()` for dataset-aware conversations

Tool result cards currently include:
- column stats
- sample values
- statistical test outputs
- filtered descriptive comparisons
- correlation matrix heatmap
- analysis summary metrics

The chat experience now also supports:
- scoped follow-ups tied to tagged nodes / their connected analysis lineage
- intent-aware routing between dataset analysis, analysis follow-ups, app-help, harmless social messages, and genuine out-of-scope requests
- client-side tool execution over both the dataset spec and the normalized analysis registry

The same normalized analysis context is also reused by:
- the dataset-details AI focus summary
- accept/reject follow-up generation
- the fixed quick analysis summary overlay

---

## 8. Node Types Reference

The active node registry in `frontend/src/modes/data/nodes/index.js` contains 11 node types:

| Type key | Component | Current usage |
|----------|-----------|---------------|
| `dataset` | `DatasetNode` | Active |
| `datasetsummary` | `DatasetSummaryNode` | Active |
| `datasetdetails` | `DatasetDetailsNode` | Active |
| `insight` | `InsightNode` | Active |
| `hypothesis` | `HypothesisNode` | Active |
| `customhypothesis` | `CustomHypothesisNode` | Active |
| `result` | `ResultNode` | Active |
| `column` | `ColumnNode` | Present, lightly used |
| `test` | `TestNode` | Present, lightly used |
| `interpretation` | `InterpretationNode` | Present, lightly used |
| `nextstep` | `NextStepNode` | Present, lightly used |

### DatasetNode

Created immediately after upload. Shows filename, row count, column count, source, and an editable AI-generated dataset description textarea.

Its main action is `View Summary` / `Expand Summary` / `Collapse Summary`, which creates or toggles the paired `DatasetSummaryNode`.

### DatasetSummaryNode

Acts as the main orchestration node for exploration.

Current behaviors:
- collapsed view: compact row/column counts only
- expanded view: completeness chart plus per-column details
- completeness area shows only columns with at least one missing value
- right-hand summary block includes the `More Details` action
- dashboard mode when `columnCount < 10`
- mixed visual preview cards when dataset is wider
- scrollable expandable column list for the remaining columns
- `More Details` opens a separate node to the right of the summary node

Main actions:
- `Generate Insights`
- `Custom Hypothesis`
- `More Details`

Important current behavior:
- identifier-like numeric columns are filtered out of summary visuals
- narrow datasets render as a visual dashboard
- wide datasets show a mixed compact visual preview first and collapse the remaining columns below
- the footer action area is visually separated as an `Analysis Actions` panel

### DatasetDetailsNode

This node is opened from the dataset summary’s `More Details` button and is treated as a right-side branch rather than a normal downward child.

It currently shows:
- selected dataset-level health stats such as missing cells, rows with missing values, duplicate rows, constant columns, likely ID columns, and complete columns
- a short 2–3 line AI-generated focus note that points the user toward the most useful columns to analyze next

### InsightNode

Represents one AI-generated analytical insight. It shows:
- title
- description
- rationale
- involved column tags
- an inline `InsightChart`

On first mount it calls `resolveChartType()` so the chart uses exact dataset column names, then stores the resolved chart metadata in both local state and the analysis registry.

Action:
- `Generate Hypothesis`

### HypothesisNode

Represents a generated statistical hypothesis. It supports:
- inline statement editing
- running a statistical test
- AI fallback consent when the test is unsupported

Important current behavior:
- once a result exists for a hypothesis, `Run test` is disabled / grayed out on the hypothesis node
- accept/reject decisions now happen at the result stage instead of the hypothesis node
- edits still sync back into the normalized analysis map

### CustomHypothesisNode

Implements a three-stage custom workflow:

1. free-text user hypothesis
2. AI-refined hypothesis statement
3. AI-suggested candidate tests

From there the user selects a test and runs it through the same stats/fallback system used by normal hypotheses.

### ResultNode

Displays:
- method name
- top summary / interpretation block
- inline `ResultChart`
- `AI-assisted` badge when applicable
- `Accept`, `Reject`, and `Re-run test` controls

Important current behavior:
- accepting a result marks the parent hypothesis accepted and can spawn:
  - a `Next Step` recommendation node
  - a prefilled editable follow-up `Custom Hypothesis` node
- rejecting a result marks the parent hypothesis rejected and enables creation of an alternative sibling hypothesis rooted in the same ancestor insight
- `Re-run test` creates a fresh result node for the same hypothesis path

An expandable details section contains lower-level test details and supporting labels.

### NextStepNode

Spawned from accepted results. Shows a concise AI-generated recommended next analytical move and uses the standard header identifier badge (`NS1`, `NS2`, …).

---

## 9. Charts System

Charts are split between reusable chart-data helpers and React renderers.

### Main files

| File | Purpose |
|------|---------|
| `nodes/ColumnChart.jsx` | Summary-node completeness, histogram, box, and categorical charts |
| `nodes/charts/InsightChart.jsx` | Charts inside insight nodes |
| `nodes/charts/ResultChart.jsx` | Charts inside result nodes |
| `nodes/charts/chartData.js` | Pure data transforms used by charts and chat tools |

### Supported chart types in the active AI flows

| `chart_type` | Typical use |
|--------------|-------------|
| `scatter` | numeric vs numeric relationships |
| `grouped_bar` | categorical vs numeric group differences |
| `histogram` | univariate numeric distribution |
| `histogram_outlier` | numeric distribution with outlier emphasis |
| `correlation_heatmap` | 3+ numeric variable correlation overview |
| `category_frequency` | single categorical column frequency chart |

### Notable chart-data helpers

`chartData.js` currently provides helper functions such as:
- `getScatterData`
- `getGroupBarData`
- `getCorrelationMatrix`

The correlation matrix helper excludes obvious identifier-like numeric columns using name and uniqueness heuristics so ID columns do not dominate the heatmap.

### Result-chart visual structure

`ResultChart.jsx` now branches on an evidence model rather than only on chart type strings. The active result families are:
- group comparison
- trend / association
- contingency deviation
- distribution shape
- outlier signal

Each family renders into the same high-level result-card shell, but the result visual system is no longer the earlier strict three-layer null-overlay design. The current direction is:
1. top summary / interpretation block
2. primary chart(s) for the result family
3. compact p-value / chance explanation near the chart when applicable
4. expandable details

The active system has been moving away from large standalone null-distribution panels and toward simpler effect / uncertainty visuals plus short interpretation text.

### ChatPanel chart reuse

The sidebar chat also reuses chart-data helpers to render:
- small scatter plots
- small grouped bar charts
- mini histograms
- categorical frequency bars

### Current dataset-summary preview behavior

The summary preview is intentionally mixed:
- not only numeric columns
- includes categorical and datetime columns when available
- uses compact cards so more preview charts fit on the same row
- preview cards are normalized to the same width and height for cleaner scanning

---

## 10. API Services Layer

All active services use raw `fetch` against the OpenAI Chat Completions endpoint. The key is read at call time via `getApiKey()`, not captured once at module import.

### `descriptionService.js`

`fetchDatasetDescription(metadata, spec)` returns a short one-sentence dataset description used in `DatasetNode`.

### `insightService.js`

`fetchInsights(metadata, spec, description)` returns 3-5 structured insights. The prompt filters obvious ID-like columns before sending schema details to OpenAI.

Each insight includes:
- `title`
- `type`
- `description`
- `columns_involved`
- `reason`
- `chart_type`

### `hypothesisService.js`

`fetchHypothesis(insight, metadata, spec, label, description)` converts one insight into a formal testable hypothesis.

The prompt only includes schema rows for columns involved in that insight to keep prompt size focused.

### `customHypothesisService.js`

Exports:
- `refineHypothesis(text, metadata, spec, description)`
- `fetchTestSuggestions(statement, variables, metadata, spec, description)`

This powers the free-text custom hypothesis workflow.

### `datasetDetailsService.js`

`fetchDatasetFocusLines(metadata, spec, summaryStats, description)` returns a short 2–3 line AI focus note for the dataset-details node. It uses dataset-level health statistics plus the schema summary to suggest which columns are most worth analyzing next.

### `followupService.js`

Exports:
- `fetchAcceptedNextStepRecommendation(...)`
- `fetchRejectedAlternativeHypothesis(...)`

This service uses the full normalized analysis context to:
- suggest a logical next analytical move after an accepted result
- generate a sibling-worthy alternative hypothesis after a rejected result

### `analysisSummaryService.js`

`fetchAnalysisQuickSummary(analysisContext)` powers the fixed top-right quick-summary overlay. It returns:
- `headline`
- `overview`
- `bullets`

The intent is to give a short AI-generated snapshot of the analysis graph so far without opening the right sidebar chat.

### `chartTypeService.js`

`resolveChartType(insight, spec)` asks OpenAI to select:
- the best chart type
- the exact column names from the actual spec

This is an important repair layer because AI-generated insights may use slightly mismatched column names unless normalized.

### `statisticsService.js`

Contains both:
- browser-side statistical test execution
- AI fallback result estimation

### `chatTools.js`

This file powers the right-sidebar Ask AI assistant.

It exports:
- `TOOL_DEFINITIONS`
- `streamChat(userMessages, spec, callbacks)`
- `executeTool(name, args, spec)`

Current client-side tools are:

| Tool name | Purpose |
|-----------|---------|
| `get_column_stats` | Column type/stats/top values |
| `get_column_values` | Raw value sample from one column |
| `run_statistical_test` | Run supported in-browser tests directly from chat |
| `filter_and_describe` | Compare filtered subset stats vs full dataset |
| `get_correlation_matrix` | Pairwise Pearson correlation matrix |
| `get_analysis_summary` | Current dataset/insight/hypothesis/result summary |

**Important implementation detail:** tool execution is entirely client-side against `datasetSpec` and the Zustand analysis registry. No extra OpenAI request is needed just to execute a tool.

`chatTools.js` also builds a live system prompt containing:
- current dataset summary
- current insights
- current hypotheses and statuses
- current results
- aggregate analysis stats

That context comes from `buildAnalysisContext()` in `analysisContext.js`.

The Ask AI flow now also includes an **intent-classification step** before normal streaming. The classifier distinguishes:
- `dataset_analysis`
- `analysis_followup`
- `social`
- `app_help`
- `out_of_scope`
- `prompt_injection`

Only truly out-of-scope or adversarial requests are refused. Harmless social/opening messages and app-help questions are still answered, but the assistant remains grounded in the dataset-analysis experience.

---

## 11. Statistics Engine

**File:** `frontend/src/modes/data/api/statisticsService.js`

### Native browser-side tests

The app currently computes these directly in-browser with `jstat`:

| Test | Trigger |
|------|---------|
| Pearson correlation | `association` hypotheses or test names matching Pearson |
| Welch's two-sample t-test | `group_difference` / `distribution_difference` flows with 1 categorical + 1 numeric variable |
| One-way ANOVA | test names matching ANOVA with 1 categorical + 1 numeric variable |
| Chi-square test of independence | `categorical_relationship` flows with 2 categorical variables |

### Unsupported-test handling

Tests matching patterns such as:
- Spearman
- Mann-Whitney
- Wilcoxon
- Kruskal
- Friedman

return `{ supported: false }` and trigger a user-facing consent step in the node UI before calling OpenAI for an estimated result.

### AI fallback

`fetchTestResult(hypothesis, metadata, spec, description)` asks OpenAI to estimate:
- method
- test statistic
- p-value
- significance
- one-sentence explanation

AI-estimated results are flagged with `aiAssisted: true`.

### Evidence model

Native and AI-assisted test results are normalized into a shared evidence contract. That contract carries:
- evidence family / kind
- effect label and value
- variables involved
- structured details such as group means, effect sizes, Cramer's V, or η²

This evidence model is what allows `ResultChart.jsx` to render different result families inside one consistent UI shell.

### Result shape

Native and AI-assisted outputs are normalized to the same structure:

```json
{
  "supported": true,
  "method": "Pearson correlation",
  "stat": 0.42,
  "pValue": 0.013,
  "significant": true,
  "summary": "Plain-English interpretation",
  "aiAssisted": false
}
```

---

## 12. CSV Parser

**File:** `frontend/src/modes/data/utils/csvParser.js`

`parseCSV(file)` returns:

```json
{
  "metadata": { "name": "...", "rows": 0, "columns": 0, "source": "Local upload" },
  "spec": { "rowCount": 0, "columnCount": 0, "numericCount": 0, "categoricalCount": 0, "columns": [] }
}
```

### What it currently does

- reads the CSV in-browser with `FileReader`
- parses quoted CSV rows
- uses the header row for column names
- treats common null-like strings as missing values
- infers each column as `numeric`, `categorical`, or `datetime`
- stores raw values for downstream statistics and chat tools

### Numeric column outputs

For numeric columns it computes:
- mean
- median
- min
- max
- q1
- q3
- std
- 10-bin histogram

### Non-numeric outputs

For categorical and datetime columns it computes:
- top values
- unique count
- missing count

### Important current note

`categoricalCount` is effectively "non-numeric count" in the current implementation, so datetime columns are included in that count.

---

## 13. Layout Engine

**Files:**
- `frontend/src/modes/data/components/DataCanvas.jsx`
- `frontend/src/modes/data/utils/layoutGraph.js`

The app uses Dagre to keep the analysis graph readable as nodes are added.

The layout reruns when:
- node count changes
- edge count changes
- the summary node toggles between collapsed and expanded

It intentionally does **not** rerun during ordinary manual dragging.

This matters because the summary node can change height substantially between collapsed and expanded states.

---

## 14. Right Sidebar: Theme + Ask AI

The right sidebar is now a first-class part of the Data Mode shell.

### Current behavior

- closed by default
- opens from a right-edge tab
- resizable by dragging
- width constrained between 160 px and 520 px

### Sections

**Display**
- dark mode toggle implemented as a switch-like control

**Ask AI**
- `ChatPanel`
- disabled until a dataset is uploaded
- tool-enabled assistant over both the dataset and the current analysis graph

### Ask AI interaction model

The assistant is meant to help in two complementary ways:
- answer questions about the full uploaded dataset
- answer follow-up questions about a specific analysis branch

Branch-scoped conversations work through node-tagging metadata and scoped analysis context, not by copying static text out of the node cards.

The assistant can currently:
- summarize the dataset
- describe columns and generate visuals
- generate new insights
- run supported tests from chat
- summarize the current analysis graph
- interpret scoped nodes / branches using the live normalized analysis context

### Why this matters architecturally

The analysis is no longer only node-driven. Users can now inspect and continue the same analysis in a conversational way without leaving the canvas or rebuilding context manually.

---

## 15. Theming System

Theme state currently lives locally in `modes/data/DataModeApp.jsx`, not in Zustand.

The component writes `data-theme="light"` or `data-theme="dark"` onto `document.documentElement`, and CSS variables in the Data Mode styles respond to that attribute.

Current user-facing theme control:
- dark mode toggle in the right sidebar

The theme is not yet persisted across sessions.

---

## 16. Key Workflows

### Workflow A: Upload → Description → Summary

1. User drops a CSV on the shell or clicks the empty canvas
2. `parseCSV()` returns `metadata` and `spec`
3. `resetGraph()` clears prior analysis
4. `setDataset()` stores metadata/spec and creates a clean dataset record
5. A `DatasetNode` is spawned
6. `DatasetNode` auto-calls `fetchDatasetDescription()`
7. User clicks `View Summary`
8. A `DatasetSummaryNode` is created or toggled

### Workflow B: Summary → Insights → Hypothesis → Result

1. User clicks `Generate Insights`
2. `fetchInsights()` returns 3-5 insight objects
3. Insight nodes are spawned and connected from `insights-out`
4. Each `InsightNode` calls `resolveChartType()` on mount
5. User clicks `Generate Hypothesis`
6. `fetchHypothesis()` returns a structured hypothesis
7. Hypothesis node is created and registered
8. User accepts/rejects or edits the statement if desired
9. User runs the suggested test
10. Result is computed in-browser or estimated through AI fallback
11. A `ResultNode` is spawned and registered
12. The result card renders the layered explanation view (Evidence / Effect / Evidence vs Chance)

### Workflow C: Custom Hypothesis

1. User clicks `Custom Hypothesis`
2. A `CustomHypothesisNode` is spawned from `custom-hyp-out`
3. User writes a plain-language question
4. `refineHypothesis()` turns it into a formal statement
5. `fetchTestSuggestions()` proposes 2-3 tests
6. User selects a test and runs it
7. Native test or AI fallback produces a `ResultNode`

### Workflow D: Ask AI Sidebar

1. User uploads a dataset
2. User opens the right sidebar
3. User asks a dataset or analysis question
4. `streamChat()` first classifies the latest intent
5. If the request is allowed, it sends the conversation plus tool definitions and scoped analysis metadata
6. OpenAI may call client-side tools
7. Tool results render as cards inline in the chat
8. Assistant continues with an interpreted answer using both tool output and the live analysis context

### Workflow E: Scoped Ask AI follow-up

1. User references a node or analysis branch in the chat
2. Scope metadata is resolved from the current graph
3. `chatTools.js` builds a scoped analysis context through `buildAnalysisContext(...)`
4. The assistant answers using that scoped branch instead of treating the request as a whole-dataset question

---

## 17. Edge & Handle Conventions

Named source handles on `DatasetSummaryNode`:
- `insights-out`
- `custom-hyp-out`

Current visual edge styles:

| Connection | Style |
|------------|-------|
| Dataset → Summary | gray dashed |
| Summary → Insight | indigo dashed |
| Summary → Custom Hypothesis | violet dashed |
| Insight → Hypothesis | purple dashed |
| Hypothesis → Result | green dashed |
| Custom Hypothesis → Result | green dashed |

Most edges are created explicitly by the node components when new downstream nodes are spawned.

---

## 18. API Key Handling

The OpenAI API key is entered through `ApiKeyModal` and stored in `sessionStorage` under `sv_openai_key`.

Important current properties:
- not bundled into the frontend build
- intended to persist only for the current browser session via `sessionStorage`
- read at request time by `getApiKey()`

The modal copy explicitly states that the key is sent directly to OpenAI and not elsewhere.

---

## 19. Deployment

The project deploys to GitHub Pages via `.github/workflows/deploy.yml`.

### CI/CD flow

1. checkout
2. setup Node 20
3. `npm ci` in `frontend/`
4. `npm run build` in `frontend/`
5. upload `frontend/dist`
6. deploy with `actions/deploy-pages@v4`

### Hosting details

- Vite base path: `/mindmapper/`
- app route: `/mindmapper/statviz`
- SPA deep-link support handled by `404.html` + `index.html` path restoration

---

## Summary Snapshot

As of May 1, 2026, the live StatViz system is best understood as a **client-side visual analysis canvas plus a synchronized analysis registry plus a right-sidebar AI copilot**.

The most important current architectural updates relative to older descriptions are:
- the active Data Mode root is under `modes/data/`
- the right sidebar now includes dark mode and Ask AI
- `chatTools.js` adds client-side tool calling over dataset and analysis state
- Ask AI now includes intent-aware routing and scoped branch follow-ups
- the store tracks normalized dataset/insight/hypothesis/result records in parallel with React Flow nodes
- result nodes now use a layered explanation format rather than a single verdict + chart
- one-way ANOVA is now supported natively in the browser-side statistics layer
- the upload → summary → insights → hypotheses → results pipeline is fully wired end to end
