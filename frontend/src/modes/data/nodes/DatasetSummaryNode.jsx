import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import { fetchInsights } from '../api/insightService';
import { fetchDatasetFocusLines } from '../api/datasetDetailsService';
import { NumericCharts, CategoricalChart, CompletenessChart } from './ColumnChart';
import { isIdentifierLikeColumn, isVisualizableSummaryColumn } from './charts/chartData';
import './nodes.css';

const EDGE_INSIGHT = {
    stroke:          '#6366f1',
    strokeWidth:     1.5,
    strokeDasharray: '5,3',
};

const EDGE_DETAILS = {
    stroke: '#64748b',
    strokeWidth: 1.5,
    strokeDasharray: '4,3',
};

function selectMixedPreviewColumns(numericCols, categoricalCols, limit = 8) {
    const picked = [];
    const maxNumeric = Math.ceil(limit / 2);
    const maxCategorical = Math.floor(limit / 2);

    const numericSlice = numericCols.slice(0, maxNumeric);
    const categoricalSlice = categoricalCols.slice(0, maxCategorical);
    const rounds = Math.max(numericSlice.length, categoricalSlice.length);

    for (let i = 0; i < rounds; i += 1) {
        if (numericSlice[i]) picked.push(numericSlice[i]);
        if (categoricalSlice[i]) picked.push(categoricalSlice[i]);
    }

    if (picked.length < limit) {
        const overflow = [
            ...numericCols.slice(maxNumeric),
            ...categoricalCols.slice(maxCategorical),
        ];
        overflow.forEach((col) => {
            if (picked.length < limit) picked.push(col);
        });
    }

    return picked.slice(0, limit);
}

function summarizeDatasetDetails(spec) {
    const rowCount = spec.rowCount ?? 0;
    const columns = spec.columns ?? [];
    const missingCells = columns.reduce((sum, col) => sum + (col.missing_count ?? 0), 0);
    const columnsWithMissing = columns.filter((col) => (col.missing_count ?? 0) > 0).length;
    const completeColumns = columns.filter((col) => (col.missing_count ?? 0) === 0).length;
    const identifierLikeColumns = columns.filter((col) => isIdentifierLikeColumn(col)).length;
    const constantColumns = columns.filter((col) => {
        if (col.unique_count == null) return false;
        return col.unique_count <= 1;
    }).length;
    const datetimeCount = columns.filter((col) => col.type === 'datetime').length;

    let rowsWithMissing = 0;
    let duplicateRows = 0;
    if (rowCount > 0 && columns.length > 0) {
        const seenRows = new Set();
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
            const rowValues = columns.map((col) => String(col.raw_values?.[rowIndex] ?? ''));
            if (rowValues.some((value) => value === '')) rowsWithMissing += 1;
            const rowKey = rowValues.join('\u241F');
            if (seenRows.has(rowKey)) duplicateRows += 1;
            else seenRows.add(rowKey);
        }
    }

    return {
        rowCount,
        columnCount: spec.columnCount ?? columns.length,
        numericCount: spec.numericCount ?? columns.filter((col) => col.type === 'numeric').length,
        categoricalCount: spec.categoricalCount ?? columns.filter((col) => col.type === 'categorical').length,
        datetimeCount,
        missingCells,
        columnsWithMissing,
        completeColumns,
        rowsWithMissing,
        duplicateRows,
        constantColumns,
        identifierLikeColumns,
    };
}

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

function NumericCard({ col, chartsWide = false, compact = false }) {
    return (
        <div className={`dsn__db-card ${compact ? 'dsn__db-card--compact' : ''}`}>
            <div className="dsn__db-card-name">{col.name}</div>
            <div className="dsn__col-detail">
                <span title="missing">{col.missing_count} missing</span>
                <span title="unique">{col.unique_count} unique</span>
                {col.stats?.mean != null && <span title="mean">mean {col.stats.mean}</span>}
                {col.stats?.min  != null && <span title="range">{col.stats.min}–{col.stats.max}</span>}
                {col.stats?.std  != null && <span title="std">sd {col.stats.std}</span>}
            </div>
            <NumericCharts col={col} wide={chartsWide} compact={compact} />
        </div>
    );
}

function CategoricalCard({ col, compact = false }) {
    return (
        <div className={`dsn__db-card ${compact ? 'dsn__db-card--compact' : ''}`}>
            <div className="dsn__db-card-name">
                {col.name}
                <span className="dsn__col-type">{col.type}</span>
            </div>
            <div className="dsn__col-detail">
                <span title="missing">{col.missing_count} missing</span>
                <span title="unique">{col.unique_count} unique</span>
            </div>
            <CategoricalChart col={col} compact={compact} />
        </div>
    );
}

// ── Expanded view ───────────────────────────────────────────────────────────

function ExpandedSummary({ id, spec, selected }) {
    const numericCols  = spec.columns.filter((c) => c.type === 'numeric');
    const visualNumericCols = numericCols.filter(isVisualizableSummaryColumn);
    const catCols      = spec.columns.filter((c) => c.type === 'categorical');
    const datetimeCols = spec.columns.filter((c) => c.type === 'datetime');
    const colsWithMissing = spec.columns.filter((c) => (c.missing_count ?? 0) > 0);
    const totalMissingCells = spec.columns.reduce((sum, col) => sum + (col.missing_count ?? 0), 0);
    const isDashboard = spec.columnCount < 10;
    const previewCategoricalCols = [...catCols, ...datetimeCols];
    const visiblePreviewCols = !isDashboard
        ? selectMixedPreviewColumns(visualNumericCols, previewCategoricalCols, 8)
        : [];
    const previewColNames = new Set(visiblePreviewCols.map((col) => col.name));
    const remainingNumericCols = visualNumericCols.filter((col) => !previewColNames.has(col.name));
    const remainingCategoricalCols = [...catCols, ...datetimeCols].filter(
        (col) => !previewColNames.has(col.name)
    );
    const defaultExpandedCols = new Set();

    const [insightStatus, setInsightStatus] = useState('idle');
    const [expandedCols, setExpandedCols]   = useState(defaultExpandedCols);
    const [detailsStatus, setDetailsStatus] = useState('idle');

    const getDashboardSectionProps = (count) => ({
        className: 'dsn__db-col',
        style: {
            '--dsn-dashboard-cols': Math.max(1, count),
        },
    });

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
            const { addInsightRecord, allocateInsightIdentifier } = useDataModeStore.getState();
            insights.forEach((insight, i) => {
                const identifier = allocateInsightIdentifier(insight.type ?? '');
                addNode({
                    id:       insight.id,
                    type:     'insight',
                    position: { x: startX + i * spacing, y: pos.y + 300 },
                    data:     { ...insight, identifier },
                });
                addEdge({
                    id:           `e-${id}-${insight.id}`,
                    source:       id,
                    sourceHandle: 'insights-out',
                    target:       insight.id,
                    style:        EDGE_INSIGHT,
                });
                addInsightRecord({
                    nodeId:          insight.id,
                    insightId:       insight.id,
                    title:           insight.title ?? '',
                    type:            insight.type ?? '',
                    description:     insight.description ?? '',
                    columnsInvolved: insight.columns_involved ?? [],
                    reason:          insight.reason ?? '',
                    resolvedChartType: null,
                    resolvedColumns:   [],
                });
            });

            setInsightStatus('idle');
        } catch (err) {
            console.error('[DataMode] fetchInsights failed:', err);
            setInsightStatus('error');
        }
    };

    const handleCustomHypothesis = () => {
        const { nodes, addNode, addEdge, allocateHypothesisIdentifier } = useDataModeStore.getState();
        const thisNode = nodes.find((n) => n.id === id);
        const pos      = thisNode?.position ?? { x: 400, y: 400 };
        const siblings = useDataModeStore.getState().edges
            .filter((e) => e.source === id)
            .map((e) => e.target)
            .filter((tid) => nodes.find((n) => n.id === tid)?.type === 'customhypothesis')
            .length;

        const nodeId = `custom-hyp-${Date.now()}`;
        const identifier = allocateHypothesisIdentifier();
        addNode({
            id:   nodeId,
            type: 'customhypothesis',
            position: { x: pos.x + 420 + siblings * 320, y: pos.y + 300 },
            data: { identifier, initialLabel: identifier },
        });
        addEdge({
            id:           `e-${id}-${nodeId}`,
            source:       id,
            sourceHandle: 'custom-hyp-out',
            target:       nodeId,
            style:        { stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '5,3' },
        });
    };

    const handleMoreDetails = async () => {
        if (detailsStatus === 'loading') return;

        const {
            nodes,
            edges,
            addNode,
            addEdge,
            datasetMetadata,
            datasetDescription,
            allocateDetailsIdentifier,
        } = useDataModeStore.getState();
        const existing = edges
            .filter((edge) => edge.source === id)
            .map((edge) => edge.target)
            .find((targetId) => nodes.find((node) => node.id === targetId)?.type === 'datasetdetails');
        if (existing) return;

        setDetailsStatus('loading');
        try {
            const thisNode = nodes.find((node) => node.id === id);
            const pos = thisNode?.position ?? { x: 400, y: 240 };
            const stats = summarizeDatasetDetails(spec);
            let focusLines = [];
            try {
                focusLines = await fetchDatasetFocusLines(datasetMetadata, spec, stats, datasetDescription);
            } catch (err) {
                console.error('[DataMode] fetchDatasetFocusLines failed:', err);
                focusLines = [
                    `Start with columns that combine low missingness with strong measurement value, especially numeric outcomes.`,
                    `Use the columns with the widest useful variation first and treat likely ID columns as labels, not analysis targets.`,
                ];
            }

            const nodeId = `dataset-details-${Date.now()}`;
            const identifier = allocateDetailsIdentifier();
            addNode({
                id: nodeId,
                type: 'datasetdetails',
                position: {
                    x: pos.x + (thisNode?.measured?.width ?? thisNode?.width ?? 960) + 120,
                    y: pos.y + 34,
                },
                data: {
                    identifier,
                    stats,
                    focusLines,
                    columnNames: spec.columns.map((col) => col.name),
                },
            });
            addEdge({
                id: `e-${id}-${nodeId}`,
                source: id,
                sourceHandle: 'details-out',
                target: nodeId,
                type: 'straight',
                style: EDGE_DETAILS,
            });
            setDetailsStatus('idle');
        } catch (err) {
            console.error('[DataMode] failed to open dataset details:', err);
            setDetailsStatus('error');
        }
    };

    const nodeClass = [
        'dm-node dm-node--summary',
        isDashboard ? 'dm-node--summary-dashboard' : 'dm-node--summary-expanded',
        !isDashboard && visiblePreviewCols.length > 0 ? 'dm-node--summary-expanded-preview' : '',
        selected ? 'dm-node--selected' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={nodeClass}>
            <div className="dm-node__header">Dataset Summary</div>

            {/* Completeness chart + summary stats side by side */}
            <div className="dsn__top-row">
                <div className="dsn__completeness-wrap">
                    <div className="dsn__group-label">Data completeness</div>
                    {colsWithMissing.length > 0 ? (
                        <CompletenessChart columns={colsWithMissing} rowCount={spec.rowCount} />
                    ) : (
                        <div className="dsn__completeness dsn__completeness--empty">
                            <div className="dsn__completeness-summary">
                                No missing values across all {spec.columnCount} columns
                            </div>
                        </div>
                    )}
                </div>
                <div className="dsn__summary-stats-wrap">
                    <div className="dsn__summary-stats">
                        <div className="dsn__summary-stat-line">
                            {spec.rowCount.toLocaleString()} rows · {spec.columnCount} columns
                        </div>
                        <div className="dsn__summary-stat-line">
                            {spec.numericCount} numeric · {spec.categoricalCount} categorical
                        </div>
                        {totalMissingCells > 0 && (
                            <div className="dsn__summary-stat-subline">
                                {totalMissingCells.toLocaleString()} missing values in {colsWithMissing.length} column{colsWithMissing.length > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                    <div className="dsn__more-details-wrap">
                        <button
                            className="dm-node__action-btn dm-node__action-btn--ghost dsn__more-details-btn"
                            onClick={handleMoreDetails}
                            disabled={detailsStatus === 'loading'}
                        >
                            {detailsStatus === 'loading' ? 'Opening details…' : 'More Details'}
                        </button>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="details-out"
                            className="dsn__details-handle"
                            style={{ right: -7, top: '50%', transform: 'translateY(-50%)' }}
                        />
                    </div>
                </div>
            </div>

            <div className="dsn__divider" />

            {/* ── Dashboard layout (< 10 columns) ─────────────────────────── */}
            {isDashboard ? (
                <div className="dsn__dashboard">

                    {visualNumericCols.length > 0 && (
                        <div {...getDashboardSectionProps(visualNumericCols.length)}>
                            <div className="dsn__group-label">
                                Numeric ({visualNumericCols.length})
                            </div>
                            {visualNumericCols.map((col) => (
                                <NumericCard
                                    key={col.name}
                                    col={col}
                                    chartsWide={visualNumericCols.length === 1}
                                />
                            ))}
                        </div>
                    )}

                    {catCols.length > 0 && (
                        <div {...getDashboardSectionProps(catCols.length)}>
                            <div className="dsn__group-label">
                                Categorical ({catCols.length})
                            </div>
                            {catCols.map((col) => (
                                <CategoricalCard key={col.name} col={col} />
                            ))}
                        </div>
                    )}

                    {datetimeCols.length > 0 && (
                        <div {...getDashboardSectionProps(datetimeCols.length)}>
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
                <>
                    {visiblePreviewCols.length > 0 && (
                        <div className="dsn__dashboard dsn__dashboard--preview">
                            <div {...getDashboardSectionProps(Math.min(2, visiblePreviewCols.length))}>
                                <div className="dsn__group-label">
                                    Visual Preview ({visiblePreviewCols.length})
                                </div>
                                {visiblePreviewCols.map((col) => (
                                    col.type === 'numeric'
                                        ? <NumericCard key={col.name} col={col} chartsWide={false} compact />
                                        : <CategoricalCard key={col.name} col={col} compact />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="dsn__divider" />

                    <div className="dsn__scroll">

                    {remainingNumericCols.length > 0 && (
                        <section>
                            <div className="dsn__group-label">More Numeric ({remainingNumericCols.length})</div>
                            {remainingNumericCols.map((col) => {
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

                    {remainingCategoricalCols.length > 0 && (
                        <section>
                            <div className="dsn__group-label">
                                More Categorical ({remainingCategoricalCols.length})
                            </div>
                            {remainingCategoricalCols.map((col) => {
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
                </>
            )}

            {/* Actions */}
            <div className="dsn__divider" />
            <div className="dsn__actions-panel">
                <div className="dsn__actions-label">Analysis Actions</div>
                <div className="dm-node__actions dsn__actions-row">
                    <div style={{ position: 'relative', flex: 1 }}>
                        <button
                            className="dm-node__action-btn dm-node__action-btn--primary"
                            style={{ width: '100%' }}
                            onClick={handleGenerateInsights}
                            disabled={insightStatus === 'loading'}
                        >
                            {insightStatus === 'loading' ? 'Thinking...'    :
                             insightStatus === 'error'   ? 'Retry Insights' :
                                                           'Generate Insights'}
                        </button>
                        <Handle type="source" position={Position.Bottom} id="insights-out"
                            style={{ bottom: -4, left: '50%', transform: 'translateX(-50%)' }} />
                    </div>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <button
                            className="dm-node__action-btn dm-node__action-btn--ghost"
                            style={{ width: '100%' }}
                            onClick={handleCustomHypothesis}
                        >
                            Custom Hypothesis
                        </button>
                        <Handle type="source" position={Position.Bottom} id="custom-hyp-out"
                            style={{ bottom: -4, left: '50%', transform: 'translateX(-50%)' }} />
                    </div>
                </div>
            </div>

            <Handle type="target" position={Position.Top} />
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
