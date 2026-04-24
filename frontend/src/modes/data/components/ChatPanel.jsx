import { useState, useRef, useEffect, useCallback, Component } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    BarChart, Bar, ScatterChart, Scatter,
    XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import useDataModeStore from '../store/useDataModeStore';
import { streamChat } from '../api/chatTools';
import { getScatterData, getGroupBarData } from '../nodes/charts/chartData';
import './ChatPanel.css';

const TICK  = { fontSize: 8, fill: '#94a3b8' };
const MARGIN = { top: 4, right: 4, bottom: 2, left: -20 };

// ── Error boundary (prevents tool card crashes from killing the page) ─────────

class CardErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(e) { return { error: e }; }
    render() {
        if (this.state.error) return (
            <div className="cpc__card">
                <div className="cpc__card-label">Render error</div>
                <div className="cpc__error-inline">{this.state.error.message}</div>
            </div>
        );
        return this.props.children;
    }
}

// ── Mini chart primitives ──────────────────────────────────────────────────────

function MiniHistogram({ col }) {
    const data = (col.histogram ?? []).map((b) => ({ name: b.x0.toFixed(1), count: b.count }));
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={90}>
            <BarChart data={data} margin={MARGIN} barCategoryGap="2%">
                <XAxis dataKey="name" tick={TICK} tickCount={4} />
                <YAxis tick={TICK} tickCount={3} />
                <Tooltip contentStyle={{ fontSize: 9, padding: '2px 6px' }}
                    formatter={(v) => [v, 'Count']} labelFormatter={(l) => `≥ ${l}`} />
                <Bar dataKey="count" fill="#6366f1" opacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function MiniFrequencyBar({ col }) {
    const data = (col.top_values ?? []).slice(0, 7).map((tv) => ({ name: tv.value, count: tv.count }));
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={90}>
            <BarChart data={data} margin={{ ...MARGIN, bottom: 24 }}>
                <XAxis dataKey="name" tick={{ fontSize: 7, fill: '#94a3b8' }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={TICK} tickCount={3} />
                <Tooltip contentStyle={{ fontSize: 9, padding: '2px 6px' }} formatter={(v) => [v, 'Count']} />
                <Bar dataKey="count" fill="#10b981" opacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function MiniGroupBar({ catCol, numCol }) {
    const data = getGroupBarData(catCol, numCol);
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={90}>
            <BarChart data={data} margin={{ ...MARGIN, bottom: 24 }}>
                <XAxis dataKey="name" tick={{ fontSize: 7, fill: '#94a3b8' }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={TICK} tickCount={3} />
                <Tooltip contentStyle={{ fontSize: 9, padding: '2px 6px' }}
                    formatter={(v) => [typeof v === 'number' ? v.toFixed(2) : v, `Mean ${numCol.name}`]} />
                <Bar dataKey="mean" fill="#f59e0b" opacity={0.8} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function MiniScatter({ col1, col2 }) {
    const data = getScatterData(col1, col2, 200);
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={90}>
            <ScatterChart margin={MARGIN}>
                <XAxis dataKey="x" type="number" tick={TICK} tickCount={4} name={col1.name} />
                <YAxis dataKey="y" type="number" tick={TICK} tickCount={4} name={col2.name} />
                <Tooltip contentStyle={{ fontSize: 9, padding: '2px 6px' }}
                    formatter={(v) => v.toFixed(2)} labelFormatter={() => ''} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={data} fill="#6366f1" opacity={0.5} r={2} />
            </ScatterChart>
        </ResponsiveContainer>
    );
}

function MiniComparisonBar({ subset, full, label }) {
    if (!subset || !full) return null;
    const data = [
        { name: label, mean: subset.mean },
        { name: 'All rows', mean: full.mean },
    ];
    return (
        <ResponsiveContainer width="100%" height={80}>
            <BarChart data={data} margin={{ ...MARGIN, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tick={TICK} tickCount={3} />
                <Tooltip contentStyle={{ fontSize: 9, padding: '2px 6px' }}
                    formatter={(v) => [v.toFixed(2), 'Mean']} />
                <Bar dataKey="mean" fill="#a855f7" opacity={0.8} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// ── Tool result cards ──────────────────────────────────────────────────────────

function StatsCard({ columns, spec }) {
    const singleSpecCol = columns.length === 1 && spec
        ? spec.columns.find((c) => c.name === columns[0]?.name)
        : null;

    return (
        <div className="cpc__card cpc__card--stats">
            <div className="cpc__card-label">Column Stats</div>
            <table className="cpc__table">
                <thead>
                    <tr><th>Column</th><th>Type</th><th>Missing</th><th>Details</th></tr>
                </thead>
                <tbody>
                    {columns.map((col) => (
                        <tr key={col.name}>
                            <td>{col.name}</td>
                            <td>{col.error ? '—' : col.type}</td>
                            <td>{col.error ? '—' : col.missing}</td>
                            <td className="cpc__td--detail">
                                {col.error
                                    ? <span className="cpc__error-inline">{col.error}</span>
                                    : col.stats
                                        ? `μ=${col.stats.mean}  σ=${col.stats.std}  [${col.stats.min}, ${col.stats.max}]`
                                        : col.topValues?.map((tv) => tv.value).slice(0, 4).join(', ')
                                }
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {singleSpecCol?.type === 'numeric' && singleSpecCol.histogram?.length > 0 && (
                <div className="cpc__chart-wrap">
                    <MiniHistogram col={singleSpecCol} />
                </div>
            )}
            {singleSpecCol && singleSpecCol.type !== 'numeric' && singleSpecCol.top_values?.length > 0 && (
                <div className="cpc__chart-wrap">
                    <MiniFrequencyBar col={singleSpecCol} />
                </div>
            )}
        </div>
    );
}

function ValuesCard({ column, values, total, error }) {
    if (error) return (
        <div className="cpc__card cpc__card--values">
            <div className="cpc__card-label">{column}</div>
            <div className="cpc__error-inline">{error}</div>
        </div>
    );
    const shown = values.slice(0, 30);
    return (
        <div className="cpc__card cpc__card--values">
            <div className="cpc__card-label">{column} — sample ({values.length} of {total})</div>
            <div className="cpc__values-list">
                {shown.map((v, i) => <span key={i} className="cpc__value-chip">{v}</span>)}
                {values.length > 30 && <span className="cpc__value-more">+{values.length - 30} more</span>}
            </div>
        </div>
    );
}

function TestCard({ method, stat, pValue, significant, summary, supported, testName, variables, testKind, spec }) {
    if (supported === false) return (
        <div className="cpc__card cpc__card--test">
            <div className="cpc__card-label">Test Result</div>
            <div className="cpc__error-inline">"{testName}" is not in the stats library.</div>
        </div>
    );

    // Resolve spec columns for chart
    let chart = null;
    if (spec && variables?.length >= 2) {
        const cols = variables.map((n) => spec.columns.find((c) => c.name === n)).filter(Boolean);
        const numeric = cols.filter((c) => c.type === 'numeric');
        const categorical = cols.filter((c) => c.type !== 'numeric');
        if (testKind === 'association' && numeric.length >= 2) {
            chart = <MiniScatter col1={numeric[0]} col2={numeric[1]} />;
        } else if (testKind === 'group_difference' && categorical.length >= 1 && numeric.length >= 1) {
            chart = <MiniGroupBar catCol={categorical[0]} numCol={numeric[0]} />;
        }
    }

    return (
        <div className="cpc__card cpc__card--test">
            <div className="cpc__card-label">{method}</div>
            <div className="cpc__test-row">
                {stat  != null && <span className="cpc__test-stat">stat = {Number(stat).toFixed(4)}</span>}
                {pValue != null && <span className="cpc__test-stat">p = {Number(pValue).toFixed(4)}</span>}
                <span className={`cpc__test-badge ${significant ? 'cpc__test-badge--sig' : 'cpc__test-badge--ns'}`}>
                    {significant ? 'Significant' : 'Not significant'}
                </span>
            </div>
            {summary && <div className="cpc__test-summary">{summary}</div>}
            {chart && <div className="cpc__chart-wrap">{chart}</div>}
        </div>
    );
}

function FilterCard({ filterColumn, filterValue, targetColumn, subset, full, error }) {
    if (error) return (
        <div className="cpc__card cpc__card--filter">
            <div className="cpc__card-label">Filter</div>
            <div className="cpc__error-inline">{error}</div>
        </div>
    );
    return (
        <div className="cpc__card cpc__card--filter">
            <div className="cpc__card-label">{targetColumn} — {filterColumn} = "{filterValue}"</div>
            <table className="cpc__table">
                <thead><tr><th></th><th>n</th><th>mean</th><th>median</th><th>std</th></tr></thead>
                <tbody>
                    {subset && <tr><td>Filtered</td><td>{subset.count}</td><td>{subset.mean}</td><td>{subset.median}</td><td>{subset.std}</td></tr>}
                    {full   && <tr className="cpc__tr--muted"><td>All rows</td><td>{full.count}</td><td>{full.mean}</td><td>{full.median}</td><td>{full.std}</td></tr>}
                </tbody>
            </table>
            {subset && full && (
                <div className="cpc__chart-wrap">
                    <MiniComparisonBar subset={subset} full={full} label={`${filterColumn}="${filterValue}"`} />
                </div>
            )}
        </div>
    );
}

function CorrelationCard({ cols, matrix, error }) {
    if (error || !cols || !matrix) return (
        <div className="cpc__card cpc__card--correlation">
            <div className="cpc__card-label">Correlation Matrix</div>
            <div className="cpc__error-inline">{error ?? 'No data'}</div>
        </div>
    );
    const maxCols = 7;
    const names   = cols.slice(0, maxCols);
    const mat     = matrix.slice(0, maxCols).map((row) => row.slice(0, maxCols));
    const CELL = 34, PAD = 58;
    const W = PAD + names.length * CELL;
    const H = PAD + names.length * CELL;
    const cellColor = (r) => {
        if (r > 0) return `rgba(99,102,241,${(r * 0.85).toFixed(2)})`;
        if (r < 0) return `rgba(244,63,94,${(Math.abs(r) * 0.85).toFixed(2)})`;
        return 'rgba(148,163,184,0.12)';
    };
    return (
        <div className="cpc__card cpc__card--correlation">
            <div className="cpc__card-label">Correlation Matrix (Pearson r)</div>
            <div className="cpc__heatmap-wrap">
                <svg width={W} height={H} style={{ overflow: 'visible' }}>
                    {names.map((name, i) => (
                        <text key={`cl-${i}`}
                            x={PAD + i * CELL + CELL / 2} y={PAD - 4}
                            textAnchor="end" fontSize={8} fill="#94a3b8"
                            transform={`rotate(-35,${PAD + i * CELL + CELL / 2},${PAD - 4})`}>
                            {name.length > 9 ? name.slice(0, 8) + '…' : name}
                        </text>
                    ))}
                    {names.map((name, i) => (
                        <text key={`rl-${i}`}
                            x={PAD - 4} y={PAD + i * CELL + CELL / 2 + 3}
                            textAnchor="end" fontSize={8} fill="#94a3b8">
                            {name.length > 9 ? name.slice(0, 8) + '…' : name}
                        </text>
                    ))}
                    {mat.map((row, ri) => row.map((r, ci) => (
                        <g key={`${ri}-${ci}`}>
                            <rect x={PAD + ci * CELL} y={PAD + ri * CELL}
                                width={CELL - 1} height={CELL - 1}
                                fill={cellColor(r)} rx={3} />
                            <text x={PAD + ci * CELL + CELL / 2} y={PAD + ri * CELL + CELL / 2 + 3}
                                textAnchor="middle" fontSize={7.5}
                                fill={Math.abs(r) > 0.4 ? '#fff' : '#64748b'}
                                fontWeight={ri === ci ? '700' : '400'}>
                                {r.toFixed(2)}
                            </text>
                        </g>
                    )))}
                </svg>
            </div>
        </div>
    );
}

function SummaryCard({ stats }) {
    if (!stats) return null;
    const items = [
        { label: 'Insights',    value: stats.totalInsights },
        { label: 'Hypotheses',  value: stats.totalHypotheses },
        { label: 'Accepted',    value: stats.acceptedHypotheses },
        { label: 'Rejected',    value: stats.rejectedHypotheses },
        { label: 'Tests run',   value: stats.totalResults },
        { label: 'Significant', value: stats.significantResults },
    ];
    return (
        <div className="cpc__card cpc__card--summary">
            <div className="cpc__card-label">Analysis Summary</div>
            <div className="cpc__summary-grid">
                {items.map(({ label, value }) => (
                    <div key={label} className="cpc__summary-item">
                        <span>{value}</span>
                        <label>{label}</label>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ToolResultCard({ toolName, result }) {
    switch (result.type) {
        case 'stats':       return <StatsCard {...result} />;
        case 'values':      return <ValuesCard {...result} />;
        case 'test':        return <TestCard {...result} />;
        case 'filter':      return <FilterCard {...result} />;
        case 'correlation': return <CorrelationCard {...result} />;
        case 'summary':     return <SummaryCard {...result} />;
        default:            return (
            <div className="cpc__card">
                <div className="cpc__card-label">{toolName}</div>
                <pre className="cpc__raw">{JSON.stringify(result, null, 2)}</pre>
            </div>
        );
    }
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
    if (msg.role === 'tool_result') {
        return (
            <CardErrorBoundary>
                <ToolResultCard toolName={msg.toolName} result={msg.result} />
            </CardErrorBoundary>
        );
    }
    return (
        <div className={`cpc__msg cpc__msg--${msg.role}${msg.streaming ? ' cpc__msg--streaming' : ''}`}>
            {msg.role === 'assistant'
                ? (
                    <div className="cpc__md">
                        <ReactMarkdown>{msg.content ?? ''}</ReactMarkdown>
                    </div>
                )
                : <span className="cpc__msg-text">{msg.content}</span>
            }
            {msg.streaming && <span className="cpc__cursor" />}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

function ChatPanel() {
    const [messages, setMessages] = useState([]);
    const [input, setInput]       = useState('');
    const [loading, setLoading]   = useState(false);

    const bottomRef  = useRef(null);
    const historyRef = useRef([]); // OpenAI-format conversation history (no system msg)

    const datasetSpec = useDataModeStore((s) => s.datasetSpec);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const appendToken = useCallback((token) => {
        setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.streaming) {
                return [...prev.slice(0, -1), { ...last, content: last.content + token }];
            }
            return [...prev, { id: `${Date.now()}-${Math.random()}`, role: 'assistant', content: token, streaming: true }];
        });
    }, []);

    const finalizeStream = useCallback(() => {
        setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }];
            return prev;
        });
    }, []);

    const addToolResult = useCallback((toolName, result) => {
        setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-tool-${Math.random()}`, role: 'tool_result', toolName, result },
        ]);
    }, []);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || loading || !datasetSpec) return;

        setInput('');
        setLoading(true);

        const userMsg = { role: 'user', content: text };
        setMessages((prev) => [...prev, { ...userMsg, id: `${Date.now()}-user` }]);
        historyRef.current = [...historyRef.current, userMsg];

        const finalMessages = await streamChat(historyRef.current, datasetSpec, {
            onToken:      appendToken,
            onToolResult: ({ toolName, result }) => addToolResult(toolName, result),
            onDone:       () => { finalizeStream(); setLoading(false); },
            onError:      (err) => {
                finalizeStream();
                setMessages((prev) => [...prev, {
                    id: `${Date.now()}-err`, role: 'assistant',
                    content: `Error: ${err.message}`, streaming: false,
                }]);
                setLoading(false);
            },
        });

        historyRef.current = finalMessages;
    };

    return (
        <>
            <div className="dm-chat__messages">
                {messages.length === 0 && (
                    <div className="dm-chat__empty">
                        {datasetSpec
                            ? 'Ask anything about your dataset, insights, or results.'
                            : 'Upload a dataset to start asking questions.'}
                    </div>
                )}
                {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                <div ref={bottomRef} />
            </div>

            <div className="dm-chat__input-row">
                <textarea
                    className="dm-chat__input nodrag"
                    rows={2}
                    placeholder={datasetSpec ? 'Ask a question… (Enter to send)' : 'Upload a dataset first'}
                    value={input}
                    disabled={loading || !datasetSpec}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                />
                <button
                    className="dm-chat__send"
                    aria-label="Send"
                    onClick={handleSend}
                    disabled={loading || !input.trim() || !datasetSpec}
                >
                    {loading
                        ? <span className="dm-chat__spinner" />
                        : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        )
                    }
                </button>
            </div>
        </>
    );
}

export default ChatPanel;
