/**
 * ColumnChart.jsx — Multi-chart column visualizations for DatasetSummaryNode
 *
 * Charts are pure SVG; rendered only when a column row is expanded (lazy).
 *
 * Numeric   → Histogram (with mean/median lines) + Box Plot
 * Categorical/Datetime → Frequency bar chart (bars = true %, unique color per bar)
 */

import { useState } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const VB_W = 260;   // SVG viewBox width for all charts

/** Distinct colors for categorical bars so each category is identifiable */
const CAT_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

// ── Utilities ────────────────────────────────────────────────────────────────

function fmt(n) {
    if (n == null) return '–';
    const abs = Math.abs(n);
    if (abs >= 10000) return (n / 1000).toFixed(0) + 'k';
    if (abs >= 1000)  return (n / 1000).toFixed(1) + 'k';
    if (!Number.isInteger(n)) return String(Number(n.toFixed(2)));
    return String(n);
}

/** Map a data value to an x pixel within [0, width] */
function scaleX(value, min, max, width = VB_W) {
    if (max === min) return width / 2;
    return ((value - min) / (max - min)) * width;
}

// ── Histogram ────────────────────────────────────────────────────────────────
/**
 * Vertical bar histogram with:
 *   - Bars colored by frequency density (dim → full indigo)
 *   - Amber dashed line  = mean
 *   - Teal solid line    = median
 *   - Hover shows exact bucket range + count inline
 */
function Histogram({ histogram, stats }) {
    const [hovered, setHovered] = useState(null);
    if (!histogram?.length || stats?.min == null) return null;

    const BAR_H  = 64;
    const TICK_H = 14;
    const VB_H   = BAR_H + TICK_H;
    const n      = histogram.length;
    const GAP    = 1.5;
    const barW   = (VB_W - GAP * (n - 1)) / n;
    const maxCnt = Math.max(...histogram.map((b) => b.count));

    const meanX = scaleX(stats.mean,   stats.min, stats.max);
    const medX  = scaleX(stats.median, stats.min, stats.max);

    return (
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" className="dm-chart-svg">
            {/* Bars — opacity encodes frequency density */}
            {histogram.map((bin, i) => {
                const barH = Math.max(2, bin.portion * (BAR_H - 4));
                const x    = i * (barW + GAP);
                const y    = BAR_H - barH;
                // dim bins (rare) are 0.18 opacity; peak bin is 0.9
                const op   = 0.18 + 0.72 * (maxCnt > 0 ? bin.count / maxCnt : 0);

                return (
                    <rect
                        key={i}
                        x={x} y={y} width={barW} height={barH}
                        fill="#6366f1"
                        opacity={hovered === i ? 1 : op}
                        rx={2}
                        className="dm-chart-bar-hover"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <title>{`${fmt(bin.x0)} – ${fmt(bin.x1)}\n${bin.count} values`}</title>
                    </rect>
                );
            })}

            {/* Axis baseline */}
            <line x1={0} y1={BAR_H} x2={VB_W} y2={BAR_H}
                stroke="currentColor" strokeWidth={0.75} opacity={0.12} />

            {/* Mean line — amber dashed */}
            <line x1={meanX} y1={3} x2={meanX} y2={BAR_H}
                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,2.5" />

            {/* Median line — teal solid */}
            <line x1={medX} y1={3} x2={medX} y2={BAR_H}
                stroke="#10b981" strokeWidth={2} />

            {/* Min / Max edge labels */}
            <text x={1}       y={VB_H - 2} className="dm-chart-label" textAnchor="start">
                {fmt(stats.min)}
            </text>
            <text x={VB_W - 1} y={VB_H - 2} className="dm-chart-label" textAnchor="end">
                {fmt(stats.max)}
            </text>

            {/* Hovered bucket inline — replaces static label */}
            {hovered != null && histogram[hovered] && (
                <text x={VB_W / 2} y={VB_H - 2} className="dm-chart-label" textAnchor="middle">
                    {fmt(histogram[hovered].x0)}–{fmt(histogram[hovered].x1)}
                    {' '}({histogram[hovered].count})
                </text>
            )}
        </svg>
    );
}

// ── Box Plot ──────────────────────────────────────────────────────────────────
/**
 * Horizontal five-number summary:
 *   whisker──[Q1═══median|═══Q3]──whisker
 *   median = teal line, mean = amber diamond
 *   Labels row: min  Q1  med  Q3  max
 */
function BoxPlot({ stats }) {
    if (stats?.min == null || stats?.q1 == null) return null;

    const PAD   = 18;
    const W     = VB_W - PAD * 2;
    const CY    = 15;
    const BOX_H = 14;
    const WH_H  = 8;
    const VB_H  = 42;

    const sx = (v) => PAD + scaleX(v, stats.min, stats.max, W);

    const q1x   = sx(stats.q1);
    const q3x   = sx(stats.q3);
    const medx  = sx(stats.median);
    const meanx = sx(stats.mean);
    const minx  = PAD;
    const maxx  = PAD + W;

    return (
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" className="dm-chart-svg">
            {/* Whisker full-range line */}
            <line x1={minx} y1={CY} x2={maxx} y2={CY}
                stroke="#94a3b8" strokeWidth={1.5} />

            {/* Min tick */}
            <line x1={minx} y1={CY - WH_H / 2} x2={minx} y2={CY + WH_H / 2}
                stroke="#94a3b8" strokeWidth={1.5} />

            {/* Max tick */}
            <line x1={maxx} y1={CY - WH_H / 2} x2={maxx} y2={CY + WH_H / 2}
                stroke="#94a3b8" strokeWidth={1.5} />

            {/* IQR box (Q1 → Q3) */}
            <rect
                x={q1x} y={CY - BOX_H / 2}
                width={Math.max(4, q3x - q1x)} height={BOX_H}
                fill="rgba(99,102,241,0.15)"
                stroke="#6366f1" strokeWidth={1.5}
                rx={3}
            >
                <title>{`IQR: ${fmt(stats.q1)} – ${fmt(stats.q3)}`}</title>
            </rect>

            {/* Median line inside box */}
            <line
                x1={medx} y1={CY - BOX_H / 2}
                x2={medx} y2={CY + BOX_H / 2}
                stroke="#10b981" strokeWidth={2.5}
            >
                <title>{`Median: ${fmt(stats.median)}`}</title>
            </line>

            {/* Mean diamond */}
            <polygon
                points={`${meanx},${CY - 5} ${meanx + 4},${CY} ${meanx},${CY + 5} ${meanx - 4},${CY}`}
                fill="#f59e0b"
                opacity={0.9}
            >
                <title>{`Mean: ${fmt(stats.mean)}`}</title>
            </polygon>

            {/* Five-number labels */}
            {[
                [minx,  stats.min,    'start'],
                [q1x,   stats.q1,     'middle'],
                [medx,  stats.median, 'middle'],
                [q3x,   stats.q3,     'middle'],
                [maxx,  stats.max,    'end'],
            ].map(([x, val, anchor], i) => (
                <text key={i} x={x} y={VB_H - 2}
                    className="dm-chart-label"
                    textAnchor={anchor}
                >
                    {fmt(val)}
                </text>
            ))}
        </svg>
    );
}

// ── Donut Chart helpers ───────────────────────────────────────────────────────

function polarToCartesian(cx, cy, r, deg) {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(cx, cy, outerR, innerR, startDeg, endDeg, gap = 2.5) {
    const s = startDeg + gap / 2;
    const e = endDeg   - gap / 2;
    if (e - s < 0.5) return null;
    const os = polarToCartesian(cx, cy, outerR, s);
    const oe = polarToCartesian(cx, cy, outerR, e);
    const is = polarToCartesian(cx, cy, innerR, s);
    const ie = polarToCartesian(cx, cy, innerR, e);
    const large = e - s > 180 ? 1 : 0;
    return [
        `M ${os.x.toFixed(2)} ${os.y.toFixed(2)}`,
        `A ${outerR} ${outerR} 0 ${large} 1 ${oe.x.toFixed(2)} ${oe.y.toFixed(2)}`,
        `L ${ie.x.toFixed(2)} ${ie.y.toFixed(2)}`,
        `A ${innerR} ${innerR} 0 ${large} 0 ${is.x.toFixed(2)} ${is.y.toFixed(2)}`,
        'Z',
    ].join(' ');
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
/**
 * Proportion wheel for categorical columns.
 * Each slice = one category, sized by its share of non-missing rows.
 * Center shows total count at rest; hovered slice shows name + %.
 * An "Other" slice is added when top_values doesn't cover all rows.
 */
function DonutChart({ topValues, totalNonMissing }) {
    const [hovered, setHovered] = useState(null);
    if (!topValues?.length) return null;

    const total = totalNonMissing || topValues.reduce((s, v) => s + v.count, 0);

    // Build segments — add "Other" slice if top_values doesn't cover everything
    const shownTotal = topValues.reduce((s, v) => s + v.count, 0);
    const otherCount = total - shownTotal;
    const entries    = otherCount > 0
        ? [...topValues, { value: 'Other', count: otherCount }]
        : topValues;

    let cumDeg = 0;
    const segments = entries.map((tv, i) => {
        const pct  = total > 0 ? tv.count / total : 0;
        const span = pct * 360;
        const seg  = { ...tv, pct, startDeg: cumDeg, endDeg: cumDeg + span,
                        color: i < topValues.length ? CAT_COLORS[i % CAT_COLORS.length] : '#94a3b8' };
        cumDeg += span;
        return seg;
    });

    const CX = VB_W / 2;
    const CY = 68;
    const OR = 56;
    const IR = 33;
    const VB_H = CY + OR + 6;

    const hSeg = hovered != null ? segments[hovered] : null;

    return (
        <div className="dsn__donut-wrap">
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" className="dm-chart-svg">
                {segments.map((seg, i) => {
                    const d = donutPath(CX, CY, OR, IR, seg.startDeg, seg.endDeg);
                    if (!d) return null;
                    return (
                        <path
                            key={seg.value}
                            d={d}
                            fill={seg.color}
                            opacity={hovered === null ? 0.82 : hovered === i ? 1 : 0.28}
                            style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <title>{`${seg.value}: ${seg.count} of ${total} (${Math.round(seg.pct * 100)}%)`}</title>
                        </path>
                    );
                })}

                {/* Center: total at rest, hovered category name + % on hover */}
                {hSeg == null ? (
                    <>
                        <text x={CX} y={CY - 7} textAnchor="middle" className="dm-chart-center-num">
                            {total}
                        </text>
                        <text x={CX} y={CY + 8} textAnchor="middle" className="dm-chart-center-sub">
                            rows
                        </text>
                    </>
                ) : (
                    <>
                        <text x={CX} y={CY - 7} textAnchor="middle" className="dm-chart-center-num"
                            style={{ fill: hSeg.color }}>
                            {Math.round(hSeg.pct * 100)}%
                        </text>
                        <text x={CX} y={CY + 8} textAnchor="middle" className="dm-chart-center-sub">
                            {String(hSeg.value).slice(0, 12)}
                        </text>
                    </>
                )}
            </svg>

            {/* Color legend below the donut */}
            <div className="dsn__donut-legend">
                {segments.map((seg, i) => (
                    <div
                        key={seg.value}
                        className={`dsn__donut-legend-item ${hovered === i ? 'dsn__donut-legend-item--active' : ''}`}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <span className="dsn__donut-dot" style={{ background: seg.color }} />
                        <span className="dsn__donut-cat">
                            {String(seg.value).length > 11 ? `${String(seg.value).slice(0, 10)}…` : seg.value}
                        </span>
                        <span className="dsn__donut-count">{seg.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Frequency Table ───────────────────────────────────────────────────────────
/**
 * Exact counts table — complements the donut with precise numbers.
 *
 * The donut gives visual proportion (intuitive at a glance).
 * This table gives exact count + share per category (precise, scannable).
 * Color dots match the donut so both charts cross-reference.
 */
function FrequencyTable({ topValues, totalNonMissing, uniqueCount }) {
    const [hovered, setHovered] = useState(null);
    if (!topValues?.length) return null;

    const total   = totalNonMissing || topValues.reduce((s, v) => s + v.count, 0);
    const hasMore = uniqueCount > topValues.length;

    return (
        <div className="dsn__freq-table">
            <div className="dsn__freq-header">
                <span className="dsn__freq-col--value">Category</span>
                <span className="dsn__freq-col--count">Count</span>
                <span className="dsn__freq-col--share">Share</span>
            </div>
            {topValues.map((tv, i) => {
                const share = total > 0 ? (tv.count / total * 100).toFixed(1) : '0';
                return (
                    <div
                        key={tv.value}
                        className={`dsn__freq-row ${hovered === i ? 'dsn__freq-row--hover' : ''}`}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <span
                            className="dsn__freq-dot"
                            style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                        />
                        <span className="dsn__freq-col--value dsn__freq-value" title={String(tv.value)}>
                            {String(tv.value).length > 14
                                ? `${String(tv.value).slice(0, 13)}…`
                                : tv.value}
                        </span>
                        <span className="dsn__freq-col--count dsn__freq-num">{tv.count}</span>
                        <span className="dsn__freq-col--share dsn__freq-num dsn__freq-share">
                            {share}%
                        </span>
                    </div>
                );
            })}
            {hasMore && (
                <div className="dsn__freq-more">
                    + {uniqueCount - topValues.length} more categories
                </div>
            )}
        </div>
    );
}

// ── Completeness Chart ────────────────────────────────────────────────────────
/**
 * Dataset-level data quality view — shown once above all column sections.
 *
 * One bar per column, width = fill rate (non-missing / total).
 * Color encodes quality: green (100%) → amber (partial) → red (sparse).
 * Above the bars: a single sentence summarising overall completeness.
 *
 * This answers "which columns have gaps?" at a glance before the user
 * drills into any individual column.
 */
export function CompletenessChart({ columns, rowCount }) {
    if (!columns?.length) return null;

    const totalCells   = columns.reduce((s, c) => s + (c.total_count ?? rowCount), 0);
    const missingCells = columns.reduce((s, c) => s + c.missing_count, 0);
    const colsWithGaps = columns.filter((c) => c.missing_count > 0).length;
    const allComplete  = missingCells === 0;

    const fillColor = (rate) => {
        if (rate === 1)    return '#10b981';   // perfect — green
        if (rate >= 0.9)   return '#34d399';   // good    — light green
        if (rate >= 0.7)   return '#f59e0b';   // warning — amber
        return '#ef4444';                       // sparse  — red
    };

    const LABEL_W = 62;
    const PCT_W   = 30;
    const BAR_W   = VB_W - LABEL_W - PCT_W - 8;
    const BAR_H   = 10;
    const GAP     = 5;
    const VB_H    = columns.length * (BAR_H + GAP) - GAP;

    return (
        <div className="dsn__completeness">
            {/* One-line overall summary */}
            <div className="dsn__completeness-summary">
                {allComplete
                    ? `All ${columns.length} columns are fully complete`
                    : `${missingCells.toLocaleString()} missing cells across ${colsWithGaps} column${colsWithGaps > 1 ? 's' : ''}`
                }
            </div>

            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" className="dm-chart-svg">
                {columns.map((col, i) => {
                    const total    = col.total_count ?? rowCount;
                    const filled   = total - col.missing_count;
                    const rate     = total > 0 ? filled / total : 1;
                    const pct      = Math.round(rate * 100);
                    const barFill  = Math.max(2, rate * BAR_W);
                    const color    = fillColor(rate);
                    const y        = i * (BAR_H + GAP);
                    const label    = col.name.length > 8
                        ? `${col.name.slice(0, 7)}…`
                        : col.name;

                    return (
                        <g key={col.name}>
                            <title>{`${col.name}: ${filled} of ${total} values present (${pct}% complete)`}</title>

                            {/* Column name */}
                            <text x={0} y={y + BAR_H - 1}
                                className="dm-chart-label dm-chart-label--bar"
                                textAnchor="start">
                                {label}
                            </text>

                            {/* Background track */}
                            <rect x={LABEL_W} y={y}
                                width={BAR_W} height={BAR_H}
                                className="dm-chart-track" rx={2} />

                            {/* Fill — width encodes completeness */}
                            <rect x={LABEL_W} y={y}
                                width={barFill} height={BAR_H}
                                fill={color} opacity={0.78} rx={2} />

                            {/* % label — colored to match bar */}
                            <text x={LABEL_W + BAR_W + 4} y={y + BAR_H - 1}
                                className="dm-chart-label"
                                textAnchor="start"
                                fill={color}>
                                {pct}%
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * NumericCharts — rendered when a numeric column row is expanded.
 * Shows: Distribution histogram + Five-number summary box plot
 */
export function NumericCharts({ col }) {
    return (
        <div className="dsn__charts dsn__charts--numeric">

            <div className="dsn__chart-section">
                <div className="dsn__chart-title">Distribution</div>
                <Histogram histogram={col.histogram} stats={col.stats} />
                <div className="dsn__chart-legend">
                    <span className="dsn__legend-item dsn__legend-item--median">
                        median {fmt(col.stats?.median)}
                    </span>
                    <span className="dsn__legend-item dsn__legend-item--mean">
                        mean {fmt(col.stats?.mean)}
                    </span>
                    <span className="dsn__legend-item dsn__legend-item--sd">
                        sd {fmt(col.stats?.std)}
                    </span>
                </div>
            </div>

            {col.stats?.q1 != null && (
                <div className="dsn__chart-section">
                    <div className="dsn__chart-title">
                        Spread — box = middle 50% · | median · ◆ mean
                    </div>
                    <BoxPlot stats={col.stats} />
                </div>
            )}

        </div>
    );
}

/**
 * CategoricalChart — rendered when a categorical/datetime column row is expanded.
 *
 * Chart 1 — Proportion wheel (donut)
 *   Shows what share of the data each category takes up.
 *   Hover a slice to see name + exact %. Center shows total row count.
 *
 * Chart 2 — Count bars
 *   Compares raw counts between categories (top category = full bar).
 *   Labels show count and % together so nothing is ambiguous.
 */
export function CategoricalChart({ col }) {
    const total = col.total_non_missing ?? col.top_values?.reduce((s, v) => s + v.count, 0) ?? 0;

    return (
        <div className="dsn__charts">

            {/* Donut — visual proportion at a glance, hover for details */}
            <div className="dsn__chart-section">
                <div className="dsn__chart-title">Distribution</div>
                <DonutChart topValues={col.top_values} totalNonMissing={total} />
            </div>

            {/* Frequency table — exact counts and shares, color-matched to donut */}
            <div className="dsn__chart-section">
                <div className="dsn__chart-title">Exact counts</div>
                <FrequencyTable
                    topValues={col.top_values}
                    totalNonMissing={total}
                    uniqueCount={col.unique_count}
                />
            </div>

        </div>
    );
}
