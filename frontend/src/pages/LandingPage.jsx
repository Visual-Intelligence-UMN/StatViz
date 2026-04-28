import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import threeNodes from '../assets/backgrounds/threenodes-Photoroom.png';
import './LandingPage.css';

const steps = [
    {
        n: '01',
        title: 'Upload your dataset',
        body: 'Drag and drop a single CSV file onto the canvas, or click to browse. StatViz parses it in the browser and creates a root Dataset node that anchors the rest of the workflow.',
    },
    {
        n: '02',
        title: 'Review the AI summary',
        body: 'An AI-generated dataset description appears right under the filename. Refine it if needed — that description becomes shared context for later AI assistance, so better framing leads to better analysis.',
    },
    {
        n: '03',
        title: 'Explore the visual summary',
        body: 'Open the Dataset Summary node to inspect completeness, per-column visuals, and structural cues about the data before asking for any insights. Numeric and categorical columns get different visual treatments automatically.',
    },
    {
        n: '04',
        title: 'Generate AI insights',
        body: 'Click "Generate Insights" from the summary to create colour-coded insight nodes such as Relationships, Group Differences, Distribution Issues, and Outlier Candidates. These become the branching analysis paths on the canvas.',
    },
    {
        n: '05',
        title: 'Ask AI about the graph',
        body: 'Use the Ask AI panel to interrogate the dataset or any branch of the analysis. Tag specific nodes with @mentions to scope the question to that node and its connected lineage instead of the entire graph.',
    },
    {
        n: '06',
        title: 'Generate and test hypotheses',
        body: 'Create hypotheses from insights, adjust the statements if needed, and run the suggested statistical tests. Supported tests run in-browser; unsupported ones can fall back to AI-assisted estimation with explicit consent.',
    },
    {
        n: '07',
        title: 'Interpret the result nodes',
        body: 'Each Result node combines a plain-language verdict, raw evidence, effect view, and chance/null view so you can judge not just whether something is significant, but whether it is meaningful and understandable.',
    },
];

const datasets = [
    {
        name: 'Exercise.csv',
        desc: '90 rows · 6 columns — exercise type, diet, pulse rate, duration.',
        url: 'https://drive.google.com/file/d/1fWepSyHsCabHABAt-SnGM-wJjQl9fEZH/view?usp=sharing',
    },
    {
        name: 'Tips.csv',
        desc: '244 rows · 7 columns — restaurant tips, bill size, day, time, party size.',
        url: 'https://drive.google.com/file/d/1L62GGkGioftbCsYj3xBM_ktffIVI1szU/view?usp=sharing',
    },
];

function LandingPage() {
    const navigate = useNavigate();
    const [showTutorial, setShowTutorial] = useState(false);

    return (
        <div className="lp">
            {/* ── Nav ── */}
            <nav className="lp__nav">
                <span className="lp__logo">StatViz</span>
                <button className="lp__nav-cta" onClick={() => navigate('/statviz')}>
                    Open App
                </button>
            </nav>

            {/* ── Hero row ── */}
            <main className="lp__hero">
                {/* Left */}
                <div className="lp__hero-left">
                    <div className="lp__eyebrow">Project StatViz</div>
                    <h1 className="lp__headline">
                        From raw data to<br />
                        <span className="lp__headline-accent">explainable statistical insight</span>
                    </h1>
                    <p className="lp__tagline">
                        A node-based, AI-assisted analysis workbench. Upload one CSV,
                        build insight branches on a visual canvas, ask questions directly
                        against tagged nodes, and move from raw distributions to interpretable
                        statistical results without losing the thread of the analysis.
                    </p>
                    <div className="lp__hero-pills">
                        <span className="lp__hero-pill">Single CSV workflow</span>
                        <span className="lp__hero-pill">Ask AI</span>
                        <span className="lp__hero-pill">Insights → Hypotheses → Results</span>
                    </div>
                    <div className="lp__hero-actions">
                        <button className="lp__cta" onClick={() => navigate('/statviz')}>
                            Explore StatViz
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"/>
                                <polyline points="12 5 19 12 12 19"/>
                            </svg>
                        </button>
                        <button className="lp__secondary" onClick={() => setShowTutorial((v) => !v)}>
                            {showTutorial ? 'Hide tutorial' : 'How it works'}
                        </button>
                    </div>
                </div>

                {/* Middle — features */}
                <div className="lp__hero-mid">
                    <div className="lp__feature">
                        <div className="lp__feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div>
                            <div className="lp__feature-title">Upload &amp; Explore</div>
                            <div className="lp__feature-body">Drop a single CSV onto the canvas. StatViz parses it in-browser and immediately surfaces structural summaries, completeness cues, and column-level visuals.</div>
                        </div>
                    </div>
                    <div className="lp__feature">
                        <div className="lp__feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </div>
                        <div>
                            <div className="lp__feature-title">AI-Driven Insights</div>
                            <div className="lp__feature-body">Generate focused insight nodes for relationships, group differences, distribution issues, and outlier candidates — each placed directly onto the analysis graph.</div>
                        </div>
                    </div>
                    <div className="lp__feature">
                        <div className="lp__feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div>
                            <div className="lp__feature-title">Ask AI, In Context</div>
                            <div className="lp__feature-body">Ask questions in natural language and let the assistant answer with awareness of the current analysis context, whether that means the full dataset or a focused branch of the graph.</div>
                        </div>
                    </div>
                    <div className="lp__feature">
                        <div className="lp__feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        </div>
                        <div>
                            <div className="lp__feature-title">Hypotheses &amp; Results</div>
                            <div className="lp__feature-body">Turn insights into testable hypotheses, run supported statistics in-browser, and review result nodes that aim to explain the evidence instead of only reporting a p-value.</div>
                        </div>
                    </div>
                </div>

                {/* Right — image or tutorial */}
                <div className="lp__hero-right">
                    {!showTutorial ? (
                        <img
                            className="lp__preview-img"
                            src={threeNodes}
                            alt="StatViz canvas preview"
                        />
                    ) : (
                        <div className="lp__tutorial">
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
                        </div>
                    )}
                </div>
            </main>

            {/* ── Sample datasets ── */}
            <section className="lp__datasets-section">
                <div className="lp__datasets-inner">
                    <span className="lp__datasets-label">Try with a sample dataset</span>
                    <div className="lp__datasets">
                        {datasets.map((d) => (
                            <a key={d.name} className="lp__dataset-card" href={d.url} target="_blank" rel="noopener noreferrer">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <div>
                                    <div className="lp__dataset-name">{d.name}</div>
                                    <div className="lp__dataset-desc">{d.desc}</div>
                                </div>
                                <svg className="lp__dataset-dl" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                            </a>
                        ))}
                    </div>
                    <span className="lp__datasets-note">Small, clean toy datasets for testing and demonstration purposes.</span>
                </div>
            </section>

            <footer className="lp__footer">
                <span>Project StatViz — Dipan Bag's Capstone Project - Spring 2026</span>
            </footer>
        </div>
    );
}

export default LandingPage;
