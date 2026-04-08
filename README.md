# StatViz — Visual Data Analysis Workbench

A browser-based, AI-assisted data analysis tool. Upload a CSV, explore column distributions, let the AI surface insights, generate statistical hypotheses, and run tests — all on an interactive canvas.

> Capstone Project — Dipan Bag, Spring 2026

---

## Features

- **Drag & drop CSV upload** — parsed entirely in-browser, no data leaves your machine
- **Visual dataset summary** — completeness chart, histograms and box plots for numeric columns, donut charts and frequency tables for categorical ones
- **AI-generated dataset description** — one-line context description, auto-generated and editable, injected into all downstream AI calls
- **AI-driven insights** — 3–5 analytical insights grouped by type: Relationships, Group Differences, Distribution Issues, Outlier Candidates — each colour-coded
- **Hypothesis generation** — click any insight to generate a testable statistical hypothesis with suggested test, directionality, and assumption notes; statement is inline-editable
- **Statistical test runner** — Pearson correlation, Welch's t-test, and chi-square run instantly via jstat; for unsupported tests (ANOVA, Mann-Whitney, etc.) the user is prompted before an AI estimate is used
- **Result nodes** — each test spawns a Result node showing the test statistic, p-value, significance verdict, and a plain-English summary

---

## Tech Stack

| Layer | Library |
|---|---|
| UI framework | React 18 + Vite |
| Canvas | `@xyflow/react` (React Flow) |
| State | Zustand |
| Statistics | jstat |
| AI | OpenAI API (`gpt-4o-mini`) — user-supplied key |
| Styling | Plain CSS (BEM-style, CSS custom properties for theming) |

---

## Running Locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

No `.env` file or API key configuration needed — the app prompts users to enter their own OpenAI API key on first visit to `/statviz`.

---

## Usage

1. Go to `/` for the landing page. Click **Explore StatViz** to open the app.
2. On first visit you'll be prompted to enter your OpenAI API key (stored only in your browser session).
3. Drag and drop a CSV file onto the canvas, or click anywhere to browse.
4. A **Dataset node** appears. The AI generates a one-line description — edit it to improve downstream results.
5. Click **View Summary** to open a Summary node with per-column visualisations.
6. Click **Generate Insights** at the bottom of the Summary node to get AI-generated insights.
7. Click **Generate Hypothesis** on any Insight node to form a testable hypothesis.
8. Click **Run [test name]** on a Hypothesis node to execute the test and spawn a Result node.
9. **Accept** or **Reject** the hypothesis once you've reviewed the result.

---

## Project Structure

```
frontend/src/
├── pages/
│   └── LandingPage.jsx        # Info page at "/"
├── app/
│   └── AppShell.jsx           # Wrapper for /statviz
├── modes/data/
│   ├── DataModeApp.jsx        # Top-level canvas shell
│   ├── components/
│   │   ├── DataCanvas.jsx     # React Flow canvas
│   │   ├── DatasetSidebar.jsx
│   │   ├── UploadPopup.jsx
│   │   └── ApiKeyModal.jsx    # API key entry on first visit
│   ├── nodes/                 # DatasetNode, DatasetSummaryNode, InsightNode,
│   │   └── ...                # HypothesisNode, ResultNode, ColumnNode, ColumnChart
│   ├── api/
│   │   ├── insightService.js
│   │   ├── hypothesisService.js
│   │   ├── descriptionService.js
│   │   └── statisticsService.js
│   ├── store/
│   │   └── useDataModeStore.js
│   └── utils/
│       ├── csvParser.js
│       ├── layoutGraph.js
│       └── insightEngine.js
└── constants/
    ├── api.js                 # OPENAI_API_URL, getApiKey()
    └── models.js              # OPENAI_MODEL
```
