import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const features = [
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
        ),
        title: 'Visual Data Exploration',
        description: 'Drop any CSV and instantly see histograms, box plots, donut charts, and completeness rates across all columns — numeric, categorical, and datetime.',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
        ),
        title: 'AI-Powered Insights',
        description: 'The AI analyses your column schema and surfaces relationships, group differences, outlier candidates, and distribution anomalies worth investigating.',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
        ),
        title: 'Hypothesis Testing',
        description: 'Generate and edit statistical hypotheses, then run real tests — Pearson, t-test, chi-square — powered by jstat. AI fallback available for unsupported tests.',
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
        ),
        title: 'Interactive Canvas',
        description: 'Every node — dataset, insight, hypothesis, result — lives on a zoomable canvas. Drag, rearrange, and build your analysis graph visually.',
    },
];

const steps = [
    {
        n: '01',
        title: 'Upload your dataset',
        body: 'Drag and drop a CSV file anywhere onto the canvas, or click to browse. StatViz parses your file in the browser — no data leaves your machine during this step. A root Dataset node appears on the canvas.',
    },
    {
        n: '02',
        title: 'Review the AI summary',
        body: 'As soon as the dataset node is created, an AI-generated one-line description of your dataset appears below the filename. Read it, keep it, or edit it freely. This summary is injected into every subsequent AI call as context, so a precise description leads to sharper insights.',
    },
    {
        n: '03',
        title: 'Explore the visual summary',
        body: 'Click "View Summary" on the Dataset node. A Summary node opens showing: a data completeness chart for every column, and per-column visualisations — histograms + box plots for numeric columns, donut charts + frequency tables for categorical ones. For datasets with fewer than 10 columns, all charts are shown side-by-side in a dashboard layout.',
    },
    {
        n: '04',
        title: 'Generate AI insights',
        body: 'Click "Generate Insights" at the bottom of the Summary node. StatViz sends your column schema and AI summary to GPT, which returns 3–5 focused analytical insights grouped by type: Relationships, Group Differences, Distribution Issues, and Outlier Candidates. Each becomes a colour-coded Insight node on the canvas, sorted so same-type insights appear adjacent.',
    },
    {
        n: '05',
        title: 'Generate & edit hypotheses',
        body: 'Click "Generate Hypothesis" on any Insight node. The AI produces a precisely phrased, testable statistical hypothesis including the hypothesis statement, suggested statistical test, directionality, assumption notes, and a visualisation suggestion. Click the italic statement text on any Hypothesis node to edit it directly.',
    },
    {
        n: '06',
        title: 'Run the test & interpret',
        body: 'Click "Run [test name]" on a Hypothesis node. If the test is supported by the built-in stats library (jstat), it runs immediately on your raw data and spawns a Result node showing the test statistic, p-value, and a plain-English verdict. If the test isn\'t in the library (e.g. Shapiro-Wilk, Mann-Whitney), StatViz explains this and asks your permission before using AI to estimate the result — the Result node is then marked "AI-assisted". Accept or Reject the hypothesis once you\'ve reviewed the result.',
    },
];

const datasets = [
    {
        name: 'Exercise.csv',
        desc: '90 rows · 6 columns — exercise type, diet, pulse rate, and duration. Great for group difference and correlation tests.',
        url: 'https://drive.google.com/file/d/1fWepSyHsCabHABAt-SnGM-wJjQl9fEZH/view?usp=sharing',
    },
    {
        name: 'Tips.csv',
        desc: '244 rows · 7 columns — restaurant tip amounts, bill size, day, time, and party size. Good for categorical relationships and regression hypotheses.',
        url: 'https://drive.google.com/file/d/1L62GGkGioftbCsYj3xBM_ktffIVI1szU/view?usp=sharing',
    },
];

function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="lp">
            <nav className="lp__nav">
                <span className="lp__logo">StatViz</span>
                <button className="lp__nav-cta" onClick={() => navigate('/statviz')}>
                    Open App
                </button>
            </nav>

            {/* ── Hero ── */}
            <main className="lp__main">
                <div className="lp__hero">
                    <div className="lp__eyebrow">Project StatViz</div>
                    <h1 className="lp__headline">
                        From raw data to<br />statistical insight
                    </h1>
                    <p className="lp__tagline">
                        A visual, AI-assisted data analysis workbench. Upload a CSV, explore column
                        distributions, let the AI surface insights, form and test statistical
                        hypotheses — all on an interactive canvas.
                    </p>
                    <button className="lp__cta" onClick={() => navigate('/statviz')}>
                        Explore StatViz
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                        </svg>
                    </button>
                </div>

                {/* ── Feature cards ── */}
                <section className="lp__features">
                    {features.map((f) => (
                        <div key={f.title} className="lp__feature-card">
                            <div className="lp__feature-icon">{f.icon}</div>
                            <h3 className="lp__feature-title">{f.title}</h3>
                            <p className="lp__feature-desc">{f.description}</p>
                        </div>
                    ))}
                </section>

                {/* ── Tutorial ── */}
                <section className="lp__section">
                    <h2 className="lp__section-title">How it works</h2>
                    <ol className="lp__steps">
                        {steps.map((s) => (
                            <li key={s.n} className="lp__step">
                                <div className="lp__step-num">{s.n}</div>
                                <div className="lp__step-content">
                                    <h4 className="lp__step-title">{s.title}</h4>
                                    <p className="lp__step-body">{s.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* ── Trial datasets ── */}
                <section className="lp__section">
                    <h2 className="lp__section-title">Try with a sample dataset</h2>
                    <p className="lp__section-sub">
                        Download one of these datasets to get started immediately. Both are clean, small, and well-suited for exploring StatViz's full feature set.
                    </p>
                    <div className="lp__note">
                        These are small, clean toy datasets intended for testing and demonstration purposes only.
                    </div>
                    <div className="lp__datasets">
                        {datasets.map((d) => (
                            <a key={d.name} className="lp__dataset-card" href={d.url} target="_blank" rel="noopener noreferrer">
                                <div className="lp__dataset-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                </div>
                                <div>
                                    <div className="lp__dataset-name">{d.name}</div>
                                    <div className="lp__dataset-desc">{d.desc}</div>
                                </div>
                                <svg className="lp__dataset-dl" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                            </a>
                        ))}
                    </div>
                </section>
            </main>

            <footer className="lp__footer">
                <span>Project StatViz — Capstone 2026</span>
            </footer>
        </div>
    );
}

export default LandingPage;
