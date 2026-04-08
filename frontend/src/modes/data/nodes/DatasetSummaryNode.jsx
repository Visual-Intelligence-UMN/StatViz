import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import { fetchInsights } from '../api/insightService';
import { NumericCharts, CategoricalChart, CompletenessChart } from './ColumnChart';
import './nodes.css';

const EDGE_INSIGHT = {
    stroke:          '#6366f1',
    strokeWidth:     1.5,
    strokeDasharray: '5,3',
};

// ── Collapsed view ──────────────────────────────────────────────────────────

function CollapsedSummary({ spec, selected }) {
    return (
        <div className={`dm-node dm-node--summary ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">Dataset Summary</div>
            <div className="dm-node__body">
                <div className="dm-node__meta">
                    {spec.rowCount.toLocaleString()} rows · {spec.columnCount} columns
                </div>
                <div className="dm-node__meta">
                    {spec.numericCount} numeric · {spec.categoricalCount} categorical
                </div>
            </div>
            <Handle type="target" position={Position.Top}    />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

// ── Dashboard column card (one per data column, charts always visible) ──────

function NumericCard({ col }) {
    return (
        <div className="dsn__db-card">
            <div className="dsn__db-card-name">{col.name}</div>
            <div className="dsn__col-detail">
                <span title="missing">{col.missing_count} missing</span>
                <span title="unique">{col.unique_count} unique</span>
                {col.stats?.mean != null && <span title="mean">mean {col.stats.mean}</span>}
                {col.stats?.min  != null && <span title="range">{col.stats.min}–{col.stats.max}</span>}
                {col.stats?.std  != null && <span title="std">sd {col.stats.std}</span>}
            </div>
            <NumericCharts col={col} />
        </div>
    );
}

function CategoricalCard({ col }) {
    return (
        <div className="dsn__db-card">
            <div className="dsn__db-card-name">
                {col.name}
                <span className="dsn__col-type">{col.type}</span>
            </div>
            <div className="dsn__col-detail">
                <span title="missing">{col.missing_count} missing</span>
                <span title="unique">{col.unique_count} unique</span>
            </div>
            <CategoricalChart col={col} />
        </div>
    );
}

// ── Expanded view ───────────────────────────────────────────────────────────

function ExpandedSummary({ id, spec, selected }) {
    const [insightStatus, setInsightStatus] = useState('idle');
    const [expandedCols, setExpandedCols]   = useState(new Set());

    const isDashboard = spec.columnCount < 10;

    const numericCols  = spec.columns.filter((c) => c.type === 'numeric');
    const catCols      = spec.columns.filter((c) => c.type === 'categorical');
    const datetimeCols = spec.columns.filter((c) => c.type === 'datetime');

    const toggleCol = (name) =>
        setExpandedCols((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });

    const handleGenerateInsights = async () => {
        if (insightStatus === 'loading') return;

        const { datasetMetadata, datasetSpec, nodes, edges, addNode, addEdge, removeNode } =
            useDataModeStore.getState();

        if (!datasetMetadata || !datasetSpec) return;
        setInsightStatus('loading');

        try {
            const staleIds = edges
                .filter((e) => e.source === id)
                .map((e) => e.target)
                .filter((tid) => nodes.find((n) => n.id === tid)?.type === 'insight');
            staleIds.forEach((tid) => removeNode(tid));

            const { datasetDescription } = useDataModeStore.getState();
            const rawInsights = await fetchInsights(datasetMetadata, datasetSpec, datasetDescription);
            // Group same types together so they appear adjacent on the canvas
            const insights = [...rawInsights].sort((a, b) =>
                (a.type ?? '').localeCompare(b.type ?? '')
            );
            const thisNode = nodes.find((n) => n.id === id);
            const pos      = thisNode?.position ?? { x: 780, y: 200 };
            const spacing  = 320;
            const startX   = pos.x - ((insights.length - 1) * spacing) / 2;

            insights.forEach((insight, i) => {
                addNode({
                    id:       insight.id,
                    type:     'insight',
                    position: { x: startX + i * spacing, y: pos.y + 300 },
                    data:     insight,
                });
                addEdge({
                    id:     `e-${id}-${insight.id}`,
                    source: id,
                    target: insight.id,
                    style:  EDGE_INSIGHT,
                });
            });

            setInsightStatus('idle');
        } catch (err) {
            console.error('[DataMode] fetchInsights failed:', err);
            setInsightStatus('error');
        }
    };

    const nodeClass = [
        'dm-node dm-node--summary',
        isDashboard ? 'dm-node--summary-dashboard' : 'dm-node--summary-expanded',
        selected ? 'dm-node--selected' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={nodeClass}>
            <div className="dm-node__header">Dataset Summary</div>

            {/* Completeness chart + summary stats side by side */}
            <div className="dsn__top-row">
                <div className="dsn__completeness-wrap">
                    <div className="dsn__group-label">Data completeness</div>
                    <CompletenessChart columns={spec.columns} rowCount={spec.rowCount} />
                </div>
                <div className="dsn__summary-stats">
                    <div className="dm-node__meta">
                        {spec.rowCount.toLocaleString()} rows · {spec.columnCount} columns
                    </div>
                    <div className="dm-node__meta">
                        {spec.numericCount} numeric · {spec.categoricalCount} categorical
                    </div>
                </div>
            </div>

            <div className="dsn__divider" />

            {/* ── Dashboard layout (< 10 columns) ─────────────────────────── */}
            {isDashboard ? (
                <div className="dsn__dashboard">

                    {numericCols.length > 0 && (
                        <div className="dsn__db-col">
                            <div className="dsn__group-label">
                                Numeric ({numericCols.length})
                            </div>
                            {numericCols.map((col) => (
                                <NumericCard key={col.name} col={col} />
                            ))}
                        </div>
                    )}

                    {catCols.length > 0 && (
                        <div className="dsn__db-col">
                            <div className="dsn__group-label">
                                Categorical ({catCols.length})
                            </div>
                            {catCols.map((col) => (
                                <CategoricalCard key={col.name} col={col} />
                            ))}
                        </div>
                    )}

                    {datetimeCols.length > 0 && (
                        <div className="dsn__db-col">
                            <div className="dsn__group-label">
                                Datetime ({datetimeCols.length})
                            </div>
                            {datetimeCols.map((col) => (
                                <CategoricalCard key={col.name} col={col} />
                            ))}
                        </div>
                    )}

                </div>

            ) : (
                /* ── Scrollable list (≥ 10 columns) ──────────────────────── */
                <div className="dsn__scroll">

                    {numericCols.length > 0 && (
                        <section>
                            <div className="dsn__group-label">Numeric ({numericCols.length})</div>
                            {numericCols.map((col) => {
                                const open = expandedCols.has(col.name);
                                return (
                                    <div key={col.name} className="dsn__col-row">
                                        <div className="dsn__col-toggle" onClick={() => toggleCol(col.name)}>
                                            <div className="dsn__col-name">{col.name}</div>
                                            <span className={`dsn__col-chevron ${open ? 'dsn__col-chevron--open' : ''}`}>▶</span>
                                        </div>
                                        <div className="dsn__col-detail">
                                            <span>{col.missing_count} missing</span>
                                            <span>{col.unique_count} unique</span>
                                            {col.stats?.mean != null && <span>mean {col.stats.mean}</span>}
                                            {col.stats?.min  != null && <span>{col.stats.min}–{col.stats.max}</span>}
                                            {col.stats?.std  != null && <span>sd {col.stats.std}</span>}
                                        </div>
                                        {open && <div className="dsn__chart"><NumericCharts col={col} /></div>}
                                    </div>
                                );
                            })}
                        </section>
                    )}

                    {[...catCols, ...datetimeCols].length > 0 && (
                        <section>
                            <div className="dsn__group-label">
                                Categorical ({catCols.length + datetimeCols.length})
                            </div>
                            {[...catCols, ...datetimeCols].map((col) => {
                                const open = expandedCols.has(col.name);
                                return (
                                    <div key={col.name} className="dsn__col-row">
                                        <div className="dsn__col-toggle" onClick={() => toggleCol(col.name)}>
                                            <div className="dsn__col-name">
                                                {col.name}
                                                <span className="dsn__col-type">{col.type}</span>
                                            </div>
                                            <span className={`dsn__col-chevron ${open ? 'dsn__col-chevron--open' : ''}`}>▶</span>
                                        </div>
                                        <div className="dsn__col-detail">
                                            <span>{col.missing_count} missing</span>
                                            <span>{col.unique_count} unique</span>
                                        </div>
                                        {open && <div className="dsn__chart"><CategoricalChart col={col} /></div>}
                                    </div>
                                );
                            })}
                        </section>
                    )}

                </div>
            )}

            {/* Generate Insights */}
            <div className="dsn__divider" />
            <div className="dm-node__actions">
                <button
                    className="dm-node__action-btn dm-node__action-btn--primary"
                    onClick={handleGenerateInsights}
                    disabled={insightStatus === 'loading'}
                >
                    {insightStatus === 'loading' ? 'Thinking...'    :
                     insightStatus === 'error'   ? 'Retry Insights' :
                                                   'Generate Insights'}
                </button>
            </div>

            <Handle type="target" position={Position.Top}    />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

// ── Main export ─────────────────────────────────────────────────────────────

function DatasetSummaryNode({ id, data, selected }) {
    const { spec, collapsed } = data;
    if (!spec) return null;
    return collapsed
        ? <CollapsedSummary spec={spec} selected={selected} />
        : <ExpandedSummary  id={id} spec={spec} selected={selected} />;
}

export default DatasetSummaryNode;
