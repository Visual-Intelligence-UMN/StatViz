import { useState } from 'react';
import {
    ScatterChart, Scatter,
    BarChart, Bar, ErrorBar, ReferenceLine,
    XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    findCols, getScatterData, getHistogramData,
    getGroupBarData, getOutlierFence, getCorrelationMatrix,
} from './chartData';
import './charts.css';

const TICK  = { fontSize: 9, fill: '#94a3b8' };
const MARGIN = { top: 6, right: 6, bottom: 4, left: -20 };

function fmt(n) {
    if (n == null) return '–';
    if (!Number.isFinite(n)) return String(n);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function scaleX(value, min, max, width) {
    if (max === min) return width / 2;
    return ((value - min) / (max - min)) * width;
}

// ── Scatter ───────────────────────────────────────────────────────────────────

function ScatterViz({ col1, col2, color }) {
    const data = getScatterData(col1, col2);
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={150}>
            <ScatterChart margin={MARGIN}>
                <XAxis dataKey="x" type="number" tick={TICK} tickCount={4} name={col1.name} />
                <YAxis dataKey="y" type="number" tick={TICK} tickCount={4} name={col2.name} />
                <Tooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                    formatter={(v) => v.toFixed(3)} labelFormatter={() => ''}
                    cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={data} fill={color} opacity={0.55} r={2} />
            </ScatterChart>
        </ResponsiveContainer>
    );
}

// ── Grouped bar with error bars ───────────────────────────────────────────────

function GroupedBarViz({ catCol, numCol, color }) {
    const data = getGroupBarData(catCol, numCol);
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data} margin={{ ...MARGIN, bottom: 22 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }}
                    angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={TICK} tickCount={4} />
                <Tooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                    formatter={(v, n) => [
                        typeof v === 'number' ? v.toFixed(2) : v,
                        n === 'mean' ? `Mean ${numCol.name}` : n
                    ]} />
                <Bar dataKey="mean" fill={color} opacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="std" width={4} strokeWidth={1.5} stroke={color} opacity={0.6} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

// ── Histogram ─────────────────────────────────────────────────────────────────

function HistogramViz({ col, color, markOutliers = false }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const data  = getHistogramData(col);
    const fence = markOutliers ? getOutlierFence(col) : null;
    if (!data.length) return null;

    const VB_W = 260;
    const PAD_L = 20;
    const PAD_R = 6;
    const PAD_T = 8;
    const BAR_H = 92;
    const AXIS_H = 18;
    const VB_H = PAD_T + BAR_H + AXIS_H;
    const plotW = VB_W - PAD_L - PAD_R;
    const min = data[0].x0;
    const max = data[data.length - 1].x1;
    const maxCount = Math.max(...data.map((bin) => bin.count), 1);
    const meanX = PAD_L + scaleX(col.stats?.mean ?? min, min, max, plotW);
    const medianX = PAD_L + scaleX(col.stats?.median ?? min, min, max, plotW);
    const countTicks = [0, Math.round(maxCount / 2), maxCount].filter(
        (value, index, arr) => arr.indexOf(value) === index
    );
    const points = data.map((bin) => {
        const x0 = PAD_L + scaleX(bin.x0, min, max, plotW);
        const x1 = PAD_L + scaleX(bin.x1, min, max, plotW);
        const height = Math.max(3, (bin.count / maxCount) * (BAR_H - 4));
        const y = PAD_T + BAR_H - height;
        return {
            x0,
            x1,
            cx: x0 + Math.max(1, x1 - x0 - 1.5) / 2,
            y,
            height,
        };
    });
    const densityPath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.cx.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');

    const boundaries = [data[0].x0, ...data.map((bin) => bin.x1)];

    return (
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" className="dm-chart-svg">
            <line x1={PAD_L} y1={PAD_T + BAR_H} x2={VB_W - PAD_R} y2={PAD_T + BAR_H} stroke="#475569" strokeWidth="1" opacity="0.3" />

            {countTicks.map((count) => {
                const y = PAD_T + BAR_H - ((count / maxCount) * (BAR_H - 4));
                return (
                    <g key={`count-${count}`}>
                        <line x1={PAD_L - 4} y1={y} x2={PAD_L} y2={y} stroke="#64748b" strokeWidth="1" />
                        <text x={PAD_L - 6} y={y + 3} textAnchor="end" className="dm-chart-label">
                            {count}
                        </text>
                    </g>
                );
            })}

            {data.map((bin, index) => {
                const { x0, x1, y, height } = points[index];
                const width = Math.max(1, x1 - x0 - 1.5);
                const isOutlier = fence != null && bin.x1 > fence;
                return (
                    <g key={`${bin.x0}-${bin.x1}`}>
                        <rect
                            x={x0}
                            y={y}
                            width={width}
                            height={height}
                            rx={2}
                            fill={isOutlier ? '#ef4444' : color}
                            opacity={hoveredIndex === index ? 1 : isOutlier ? 0.92 : 0.78}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            <title>{`${fmt(bin.x0)}–${fmt(bin.x1)}: ${bin.count} values`}</title>
                        </rect>
                    </g>
                );
            })}

            <path
                d={densityPath}
                fill="none"
                stroke={markOutliers ? '#ea580c' : '#475569'}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.8"
                pointerEvents="none"
            />

            <line
                x1={meanX}
                y1={PAD_T}
                x2={meanX}
                y2={PAD_T + BAR_H}
                stroke="#111827"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                pointerEvents="none"
            />
            <line
                x1={medianX}
                y1={PAD_T}
                x2={medianX}
                y2={PAD_T + BAR_H}
                stroke="#10b981"
                strokeWidth="2"
                pointerEvents="none"
            />

            {hoveredIndex != null && data[hoveredIndex] && (
                <text
                    x={points[hoveredIndex].cx}
                    y={Math.max(10, points[hoveredIndex].y - 6)}
                    textAnchor="middle"
                    className="dm-chart-label"
                    pointerEvents="none"
                >
                    {data[hoveredIndex].count}
                </text>
            )}

            {boundaries.map((boundary, index) => {
                const x = PAD_L + scaleX(boundary, min, max, plotW);
                const anchor = index === 0 ? 'start' : index === boundaries.length - 1 ? 'end' : 'middle';
                return (
                    <g key={`tick-${boundary}-${index}`}>
                        <line x1={x} y1={PAD_T + BAR_H} x2={x} y2={PAD_T + BAR_H + 5} stroke="#64748b" strokeWidth="1" />
                        <text x={x} y={VB_H - 2} textAnchor={anchor} className="dm-chart-label">
                            {fmt(boundary)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── Outlier box + strip plot ────────────────────────────────────────────────

function OutlierBoxStripViz({ col }) {
    const values = (col.raw_values ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    if (!values.length) return null;

    const summary = col.stats ?? {};
    const upperFence = getOutlierFence(col);
    const lowerFence = Number.isFinite(summary.q1) && Number.isFinite(summary.q3)
        ? summary.q1 - 1.5 * (summary.q3 - summary.q1)
        : null;
    const domainMin = Math.min(...values, Number.isFinite(lowerFence) ? lowerFence : Infinity);
    const domainMax = Math.max(...values, Number.isFinite(upperFence) ? upperFence : -Infinity);
    const nonOutliers = values.filter((value) => (
        (lowerFence == null || value >= lowerFence) &&
        (upperFence == null || value <= upperFence)
    ));
    const whiskerLow = nonOutliers.length ? Math.min(...nonOutliers) : Math.min(...values);
    const whiskerHigh = nonOutliers.length ? Math.max(...nonOutliers) : Math.max(...values);

    const sampleStep = Math.max(1, Math.floor(values.length / 42));
    const sampled = values.filter((_, index) => index % sampleStep === 0);

    const width = 320;
    const height = 118;
    const leftPad = 28;
    const rightPad = 28;
    const topPad = 18;
    const axisY = 80;
    const plotWidth = width - leftPad - rightPad;
    const denom = Math.max(domainMax - domainMin, 1);
    const xFor = (value) => leftPad + ((value - domainMin) / denom) * plotWidth;

    const q1 = Number.isFinite(summary.q1) ? summary.q1 : whiskerLow;
    const q3 = Number.isFinite(summary.q3) ? summary.q3 : whiskerHigh;
    const median = Number.isFinite(summary.median) ? summary.median : (q1 + q3) / 2;
    const clamp = (value, minValue, maxValue) => Math.min(Math.max(value, minValue), maxValue);
    const lowerFenceX = lowerFence != null ? xFor(lowerFence) : null;
    const upperFenceX = upperFence != null ? xFor(upperFence) : null;
    const lowerLabelX = lowerFenceX != null ? clamp(lowerFenceX, leftPad + 22, width - rightPad - 22) : null;
    const upperLabelX = upperFenceX != null ? clamp(upperFenceX, leftPad + 22, width - rightPad - 22) : null;

    return (
        <div className="ichart__svg-wrap">
            <svg viewBox={`0 0 ${width} ${height}`} className="ichart__svg">
                <line x1={leftPad} y1={axisY} x2={width - rightPad} y2={axisY} stroke="#cbd5e1" strokeWidth="1.5" />

                {Number.isFinite(lowerFence) && (
                    <>
                        <line
                            x1={lowerFenceX}
                            y1={topPad}
                            x2={lowerFenceX}
                            y2={axisY + 12}
                            stroke="#fca5a5"
                            strokeDasharray="4 3"
                            strokeWidth="1.5"
                        />
                        <text x={lowerLabelX} y={10} textAnchor="middle" className="ichart__svg-label ichart__svg-label--note">
                            lower cutoff
                        </text>
                    </>
                )}

                {Number.isFinite(upperFence) && (
                    <>
                        <line
                            x1={upperFenceX}
                            y1={topPad}
                            x2={upperFenceX}
                            y2={axisY + 12}
                            stroke="#ef4444"
                            strokeDasharray="4 3"
                            strokeWidth="1.5"
                        />
                        <text x={upperLabelX} y={10} textAnchor="middle" className="ichart__svg-label ichart__svg-label--note">
                            upper cutoff
                        </text>
                    </>
                )}

                <line x1={xFor(whiskerLow)} y1={axisY} x2={xFor(q1)} y2={axisY} stroke="#94a3b8" strokeWidth="1.5" />
                <line x1={xFor(q3)} y1={axisY} x2={xFor(whiskerHigh)} y2={axisY} stroke="#94a3b8" strokeWidth="1.5" />
                <line x1={xFor(whiskerLow)} y1={axisY - 10} x2={xFor(whiskerLow)} y2={axisY + 10} stroke="#94a3b8" strokeWidth="1.5" />
                <line x1={xFor(whiskerHigh)} y1={axisY - 10} x2={xFor(whiskerHigh)} y2={axisY + 10} stroke="#94a3b8" strokeWidth="1.5" />

                <rect
                    x={xFor(q1)}
                    y={axisY - 14}
                    width={Math.max(xFor(q3) - xFor(q1), 10)}
                    height={28}
                    rx={8}
                    fill="rgba(99, 102, 241, 0.12)"
                    stroke="#818cf8"
                    strokeWidth="1.5"
                />
                <line x1={xFor(median)} y1={axisY - 14} x2={xFor(median)} y2={axisY + 14} stroke="#6366f1" strokeWidth="2" />

                {sampled.map((value, index) => {
                    const flagged = (lowerFence != null && value < lowerFence) || (upperFence != null && value > upperFence);
                    const row = index % 3;
                    const y = axisY - 28 - row * 8;
                    return (
                        <circle
                            key={`${value}-${index}`}
                            cx={xFor(value)}
                            cy={y}
                            r={flagged ? 2.8 : 2.4}
                            fill={flagged ? '#ef4444' : '#94a3b8'}
                            opacity={flagged ? 0.95 : 0.75}
                        />
                    );
                })}

                <text x={leftPad} y={height - 8} textAnchor="start" className="ichart__svg-label">{domainMin.toFixed(1)}</text>
                <text x={xFor(median)} y={height - 8} textAnchor="middle" className="ichart__svg-label">median {median.toFixed(1)}</text>
                <text x={width - rightPad} y={height - 8} textAnchor="end" className="ichart__svg-label">{domainMax.toFixed(1)}</text>
            </svg>
        </div>
    );
}

// ── Category frequency bar ────────────────────────────────────────────────────

function CategoryFrequencyViz({ col, color }) {
    const groups = {};
    for (const v of (col.raw_values ?? [])) {
        if (v == null || v === '') continue;
        groups[v] = (groups[v] ?? 0) + 1;
    }
    const data = Object.entries(groups)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    if (!data.length) return null;
    return (
        <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data} margin={{ ...MARGIN, bottom: 22 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }}
                    angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={TICK} tickCount={4} />
                <Tooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                    formatter={(v) => [v, 'Count']} />
                <Bar dataKey="count" fill={color} opacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// ── Correlation heatmap (pure SVG) ────────────────────────────────────────────

function CorrelationHeatmap({ spec }) {
    const result = getCorrelationMatrix(spec);
    if (!result) return null;
    const { cols, matrix } = result;
    const maxCols = 6;
    const names   = cols.slice(0, maxCols);
    const mat     = matrix.slice(0, maxCols).map((row) => row.slice(0, maxCols));

    const CELL = 34;
    const PAD  = 56; // left/top label padding
    const W    = PAD + names.length * CELL;
    const H    = PAD + names.length * CELL;

    const cellColor = (r) => {
        // indigo for positive, rose for negative, white near zero
        if (r > 0) return `rgba(99,102,241,${(r * 0.85).toFixed(2)})`;
        if (r < 0) return `rgba(244,63,94,${(Math.abs(r) * 0.85).toFixed(2)})`;
        return 'rgba(148,163,184,0.12)';
    };

    return (
        <div className="ichart__heatmap-wrap">
            <svg width={W} height={H} style={{ overflow: 'visible' }}>
                {/* Column labels */}
                {names.map((name, i) => (
                    <text
                        key={`cl-${i}`}
                        x={PAD + i * CELL + CELL / 2}
                        y={PAD - 4}
                        textAnchor="end"
                        fontSize={8}
                        fill="#94a3b8"
                        transform={`rotate(-35, ${PAD + i * CELL + CELL / 2}, ${PAD - 4})`}
                    >
                        {name.length > 8 ? name.slice(0, 7) + '…' : name}
                    </text>
                ))}
                {/* Row labels */}
                {names.map((name, i) => (
                    <text
                        key={`rl-${i}`}
                        x={PAD - 4}
                        y={PAD + i * CELL + CELL / 2 + 3}
                        textAnchor="end"
                        fontSize={8}
                        fill="#94a3b8"
                    >
                        {name.length > 8 ? name.slice(0, 7) + '…' : name}
                    </text>
                ))}
                {/* Cells */}
                {mat.map((row, ri) =>
                    row.map((r, ci) => (
                        <g key={`${ri}-${ci}`}>
                            <rect
                                x={PAD + ci * CELL}
                                y={PAD + ri * CELL}
                                width={CELL - 1}
                                height={CELL - 1}
                                fill={cellColor(r)}
                                rx={3}
                            />
                            <text
                                x={PAD + ci * CELL + CELL / 2}
                                y={PAD + ri * CELL + CELL / 2 + 3}
                                textAnchor="middle"
                                fontSize={7.5}
                                fill={Math.abs(r) > 0.4 ? '#fff' : '#64748b'}
                                fontWeight={ri === ci ? '700' : '400'}
                            >
                                {r.toFixed(2)}
                            </text>
                        </g>
                    ))
                )}
            </svg>
        </div>
    );
}

// ── Accent colours per insight type ──────────────────────────────────────────

const ACCENT = {
    relationship:       '#14b8a6',
    group_difference:   '#f59e0b',
    distribution_issue: '#f43f5e',
    outlier_candidate:  '#f97316',
};

// ── Main export ───────────────────────────────────────────────────────────────

function InsightChart({ type, chart_type, columns, spec }) {
    if (!spec || !columns?.length || !chart_type) return null;

    const { cols, numeric, categorical } = findCols(spec, columns);
    const color = ACCENT[type] ?? '#6366f1';

    switch (chart_type) {

        case 'scatter':
            if (numeric.length < 2) return null;
            return (
                <div className="ichart nodrag">
                    <ScatterViz col1={numeric[0]} col2={numeric[1]} color={color} />
                    <div className="ichart__axis-labels">
                        <span>{numeric[0].name}</span>
                        <span className="ichart__vs">vs</span>
                        <span>{numeric[1].name}</span>
                    </div>
                </div>
            );

        case 'grouped_bar': {
            const catCol = categorical[0];
            const numCol = numeric[0];
            if (!catCol || !numCol) return null;
            return (
                <div className="ichart nodrag">
                    <GroupedBarViz catCol={catCol} numCol={numCol} color={color} />
                    <div className="ichart__axis-labels">
                        <span>{catCol.name}</span>
                        <span className="ichart__vs">→</span>
                        <span>mean {numCol.name} ± std</span>
                    </div>
                </div>
            );
        }

        case 'histogram': {
            const col = numeric[0];
            if (!col) return null;
            return (
                <div className="ichart nodrag">
                    <HistogramViz col={col} color={color} />
                    <div className="ichart__axis-labels"><span>{col.name}</span></div>
                </div>
            );
        }

        case 'histogram_outlier': {
            const col = numeric[0];
            if (!col) return null;
            return (
                <div className="ichart nodrag">
                    <div className="ichart__stack">
                        <div className="ichart__mini-title">Histogram</div>
                        <HistogramViz col={col} color={color} markOutliers />
                        <div className="ichart__axis-labels">
                            <span>{col.name} bins</span>
                            <span className="ichart__vs">→</span>
                            <span>count in each score range</span>
                        </div>
                    </div>
                    <div className="ichart__stack">
                        <div className="ichart__mini-title">Box-and-strip plot (individual scores)</div>
                        <OutlierBoxStripViz col={col} />
                        <div className="ichart__axis-labels">
                            <span>{col.name}</span>
                            <span className="ichart__outlier-note">purple box = middle 50% of scores</span>
                            <span className="ichart__outlier-note">red points = beyond the outlier cutoff</span>
                        </div>
                    </div>
                </div>
            );
        }

        case 'category_frequency': {
            const col = categorical[0] ?? cols[0];
            if (!col) return null;
            return (
                <div className="ichart nodrag">
                    <CategoryFrequencyViz col={col} color={color} />
                    <div className="ichart__axis-labels"><span>{col.name} — frequency</span></div>
                </div>
            );
        }

        case 'correlation_heatmap':
            return (
                <div className="ichart nodrag">
                    <CorrelationHeatmap spec={spec} />
                    <div className="ichart__axis-labels">
                        <span>pairwise Pearson r</span>
                    </div>
                </div>
            );

        default:
            return null;
    }
}

export default InsightChart;
