# StatViz — Visual Statistical Analysis Workbench

StatViz is a browser-based, node-driven data analysis workspace for CSV datasets. It helps users move from raw tabular data to insights, hypotheses, statistical tests, and interpretable result nodes on an interactive canvas.

> Capstone Project — Dipan Bag, Spring 2026

---

## What It Does

StatViz is designed around a visible analysis graph:

- `Dataset` node for the uploaded file
- `Dataset Summary` node for completeness, preview charts, and dataset-level details
- `Insight` nodes for AI-suggested analytical directions
- `Hypothesis` nodes for testable claims
- `Result` nodes for statistical outputs and interpretation
- `Next Step` / follow-up nodes for continued analysis

Instead of hiding the workflow behind menus, the app keeps the reasoning trail visible.

---

## Current Features

- **CSV upload in the browser**
  - drag and drop
  - click anywhere on the blank canvas to upload
  - use the built-in sample exercise dataset directly from the empty canvas

- **Dataset description and summary**
  - AI-generated editable dataset description
  - completeness section focused on columns with missing values
  - mixed visual preview cards for numeric and categorical columns
  - `More Details` branch with dataset-health metrics and short AI focus guidance

- **AI-generated insights**
  - relationship insights
  - group-difference insights
  - distribution-shape insights
  - outlier-candidate insights

- **Hypothesis generation**
  - create hypotheses from insight nodes
  - create custom hypotheses manually
  - inline-edit hypothesis statements before testing

- **Statistical testing**
  - in-browser supported tests via `jstat`, including:
    - Pearson correlation
    - Welch’s two-sample t-test
    - chi-square test of independence
    - one-way ANOVA
  - AI-assisted fallback when a test is unsupported or estimated

- **Result workflow**
  - AI-assisted result summaries
  - chart-based result interpretation
  - accept / reject on result nodes
  - re-run test from the result node
  - accepted results can generate a `Next Step` node and a follow-up editable hypothesis
  - rejected results can generate an alternative sibling hypothesis

- **Ask AI**
  - dataset-aware right-sidebar assistant
  - can reason over the current graph, results, and branches
  - supports scoped follow-ups through graph context

- **Quick analysis summary**
  - fixed top-right summary toggle
  - short AI-generated overview of the analysis done so far

---

## Tech Stack

| Layer | Library / Service |
|---|---|
| UI framework | React + Vite |
| Canvas / graph | `@xyflow/react` (React Flow) |
| State management | Zustand |
| Charts | Recharts + custom SVG charts |
| Statistics | `jstat` |
| Layout | `@dagrejs/dagre` |
| AI services | OpenAI Chat Completions API |
| Styling | Plain CSS |

---

## Running Locally

```bash
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

The active app route is:

```text
/statviz
```

Note:
- the app uses a user-provided OpenAI API key
- the key is stored in browser session state for the running session

---

## Sample Dataset

The empty canvas includes a `Use Sample Dataset` option.

The app expects the sample exercise CSV at:

```text
frontend/public/sample/exercise/Exercise.csv
```

This sample is also referenced by the landing page and shared sample-dataset config.

---

## Typical Workflow

1. Open StatViz.
2. Upload a CSV or use the sample dataset.
3. Review the dataset description and summary.
4. Open `More Details` if needed for dataset-health metrics.
5. Generate insight nodes from the summary.
6. Generate or author a hypothesis.
7. Run the suggested test.
8. Review the result node and charts.
9. Accept or reject the result.
10. Continue with a next-step recommendation or an alternative sibling hypothesis.

---

## Project Structure

```text
frontend/src/
├── app/
├── pages/
│   └── LandingPage.jsx
├── sampleDatasets.js
├── constants/
├── modes/data/
│   ├── DataModeApp.jsx
│   ├── DataModeApp.css
│   ├── store/
│   │   ├── useDataModeStore.js
│   │   └── analysisContext.js
│   ├── components/
│   │   ├── DataCanvas.jsx
│   │   ├── UploadPopup.jsx
│   │   ├── ApiKeyModal.jsx
│   │   └── ChatPanel.jsx
│   ├── nodes/
│   │   ├── DatasetNode.jsx
│   │   ├── DatasetSummaryNode.jsx
│   │   ├── DatasetDetailsNode.jsx
│   │   ├── InsightNode.jsx
│   │   ├── HypothesisNode.jsx
│   │   ├── CustomHypothesisNode.jsx
│   │   ├── ResultNode.jsx
│   │   ├── NextStepNode.jsx
│   │   ├── InterpretationNode.jsx
│   │   ├── ColumnChart.jsx
│   │   ├── charts/
│   │   │   ├── InsightChart.jsx
│   │   │   ├── ResultChart.jsx
│   │   │   ├── chartData.js
│   │   │   └── charts.css
│   │   ├── nodes.css
│   │   └── index.js
│   ├── api/
│   │   ├── descriptionService.js
│   │   ├── datasetDetailsService.js
│   │   ├── insightService.js
│   │   ├── hypothesisService.js
│   │   ├── customHypothesisService.js
│   │   ├── followupService.js
│   │   ├── analysisSummaryService.js
│   │   ├── chartTypeService.js
│   │   ├── statisticsService.js
│   │   └── chatTools.js
│   └── utils/
│       ├── csvParser.js
│       ├── layoutGraph.js
│       └── mockGraph.js
└── main.jsx
```

---

## Notes

- The app is browser-first: parsing, charting, graph state, and supported statistics happen client-side.
- AI is used for description, insight generation, hypothesis generation, follow-ups, summaries, and interpretation.
- Some result charts and statistical explanation surfaces are still evolving as the visualization system is refined.

---

## Deployment

The project is set up for static frontend deployment through GitHub Pages.

The hosted route uses:

```text
/mindmapper/statviz
```

SPA routing is supported through the `404.html` redirect pattern used in the frontend `public/` folder.
