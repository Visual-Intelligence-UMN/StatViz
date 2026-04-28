import { jStat } from 'jstat';
import {
    ScatterChart, Scatter,
    BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine,
} from 'recharts';
import {
    findCols,
    getScatterData,
    getHistogramData,
    getOutlierFence,
    getRegressionLine,
    getGroupPointData,
    getGroupDistributionSummary,
    getIqrOverlapSummary,
    getContingencyEvidence,
} from './chartData';
import { buildFallbackResultEvidence, buildResultExplanation, buildResultInterpretation, classifyEffectStrength, EVIDENCE_KINDS } from '../../utils/evidenceModel';
import './charts.css';

const TICK = { fontSize: 9, fill: '#94a3b8' };
const MARGIN = { top: 6, right: 6, bottom: 4, left: -20 };
const SIG_COLOR = '#10b981';
const NOT_COLOR = '#f43f5e';
const ALPHA = 0.05;

function formatNumber(value, digits = 3) {
    if (value == null || Number.isNaN(Number(value))) return '–';
    return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

function formatPValueLabel(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'p unavailable';
    if (numeric <= 0) return 'p < 0.0001';
    if (numeric < 0.0001) return 'p < 0.0001';
    return `p = ${formatNumber(numeric, 4)}`;
}

function getNumericShapeSummary(col) {
    const values = (col?.raw_values ?? [])
        .map((value) => parseFloat(value))
        .filter((value) => !Number.isNaN(value))
        .sort((a, b) => a - b);
    if (!values.length) return null;

    const quantile = (q) => {
        if (values.length === 1) return values[0];
        const pos = (values.length - 1) * q;
        const lower = Math.floor(pos);
        const upper = Math.ceil(pos);
        if (lower === upper) return values[lower];
        const weight = pos - lower;
        return values[lower] * (1 - weight) + values[upper] * weight;
    };

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    const q1 = quantile(0.25);
    const median = quantile(0.5);
    const q3 = quantile(0.75);
    const leftTail = median - min;
    const rightTail = max - median;
    const leftHalf = median - q1;
    const rightHalf = q3 - median;
    const skewBalance = rightTail - leftTail;
    return {
        min, q1, median, q3, max, mean,
        leftTail, rightTail, leftHalf, rightHalf,
        skewBalance,
    };
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function LayerBlock({ label, title, caption, children }) {
    return (
        <div className="rchart__layer">
            <div className="rchart__layer-head">
                <span className="rchart__layer-label">{label}</span>
                <span className="rchart__layer-title">{title}</span>
            </div>
            {caption && <div className="rchart__layer-caption">{caption}</div>}
            <div className="rchart__layer-body">{children}</div>
        </div>
    );
}

function VerdictSummary({ interpretation, significant, aiAssisted }) {
    if (!interpretation) return null;
    return (
        <div className="rchart__verdict">
            <div className="rchart__verdict-head">
                <span className="rchart__verdict-title">{interpretation.headline}</span>
                <span className={`rchart__verdict-chip ${significant ? 'rchart__verdict-chip--sig' : 'rchart__verdict-chip--ns'}`}>
                    {significant ? 'statistically significant' : 'not statistically significant'}
                </span>
                {aiAssisted && <span className="rchart__verdict-chip rchart__verdict-chip--ai">AI estimate</span>}
            </div>
            <div className="rchart__verdict-copy">{interpretation.takeaway}</div>
        </div>
    );
}

function inferSignalScore(evidence) {
    const strength = classifyEffectStrength(evidence);
    const levelMap = {
        unknown: 0.15,
        very_small: 0.18,
        small: 0.35,
        moderate: 0.62,
        large: 0.88,
    };
    return {
        score: levelMap[strength.level] ?? 0.2,
        label: strength.label,
    };
}

function inferDetectionScore({ pValue, sampleSize, significant }) {
    const p = Number(pValue);
    const n = Number(sampleSize);
    if (!Number.isFinite(p)) {
        return {
            score: significant ? 0.7 : 0.3,
            label: significant ? 'reliably detected' : 'uncertain detection',
        };
    }
    const pStrength = clamp01(Math.max(0, -Math.log10(Math.max(p, 1e-9))) / 6);
    const nStrength = Number.isFinite(n) ? clamp01(Math.log10(Math.max(2, n)) / 3) : 0.5;
    const score = clamp01(0.7 * pStrength + 0.3 * nStrength);
    return {
        score,
        label: score >= 0.75 ? 'high detection' : score >= 0.45 ? 'moderate detection' : 'low detection',
    };
}

function HonestyStrip({ evidence, pValue, significant, sampleSize }) {
    const signal = inferSignalScore(evidence);
    const detection = inferDetectionScore({ pValue, sampleSize, significant });
    const mismatch = detection.score - signal.score;
    let mismatchCopy = 'signal strength and detection line up closely.';
    if (mismatch >= 0.28) mismatchCopy = 'the effect looks small, but the data distinguishes it reliably from noise.';
    else if (mismatch <= -0.2) mismatchCopy = 'the signal may be suggestive, but the data is not strong enough to separate it from noise yet.';

    return (
        <div className="rchart__honesty">
            <div className="rchart__honesty-title">Honesty Strip</div>
            <div className="rchart__honesty-row">
                <span className="rchart__honesty-label">Signal</span>
                <div className="rchart__honesty-track">
                    <span className="rchart__honesty-fill rchart__honesty-fill--signal" style={{ width: `${signal.score * 100}%` }} />
                </div>
                <span className="rchart__honesty-value">{signal.label}</span>
            </div>
            <div className="rchart__honesty-row">
                <span className="rchart__honesty-label">Detection</span>
                <div className="rchart__honesty-track">
                    <span className="rchart__honesty-fill rchart__honesty-fill--detection" style={{ width: `${detection.score * 100}%` }} />
                </div>
                <span className="rchart__honesty-value">{detection.label}</span>
            </div>
            <div className="rchart__honesty-copy">{mismatchCopy}</div>
        </div>
    );
}

function ResultEvidenceHeader({ evidence }) {
    if (!evidence) return null;
    const detail = evidence.effectLabel && evidence.effectValue != null
        ? `${evidence.effectLabel} = ${formatNumber(evidence.effectValue, 3)}`
        : null;
    const note = evidence.notes?.[0] ?? null;

    if (!detail && !note) return null;

    return (
        <div className="rchart__evidence-copy">
            {detail && <span className="rchart__evidence-detail">{detail}</span>}
            {note && <span className="rchart__evidence-note">{note}</span>}
        </div>
    );
}

function ResultExplanationCard({ explanation }) {
    if (!explanation) return null;

    return (
        <div className="rchart__explain">
            <div className="rchart__explain-title">{explanation.title}</div>
            <div className="rchart__explain-row">
                <span className="rchart__explain-label">What the test checks</span>
                <span className="rchart__explain-copy">{explanation.whatTestChecks}</span>
            </div>
            <div className="rchart__explain-row">
                <span className="rchart__explain-label">What to look for</span>
                <span className="rchart__explain-copy">{explanation.whatToLookFor}</span>
            </div>
            <div className="rchart__explain-row">
                <span className="rchart__explain-label">Why this can still happen</span>
                <span className="rchart__explain-copy">{explanation.whyItCanStillMakeSense}</span>
            </div>
            {explanation.caution && (
                <div className="rchart__explain-row rchart__explain-row--caution">
                    <span className="rchart__explain-label">Caution</span>
                    <span className="rchart__explain-copy">{explanation.caution}</span>
                </div>
            )}
        </div>
    );
}

function EvidenceSummaryCard({ title, subtitle, children }) {
    if (!children) return null;
    return (
        <div className="rchart__summary">
            <div className="rchart__summary-copy">
                <span className="rchart__summary-title">{title}</span>
                {subtitle && <span className="rchart__summary-subtitle">{subtitle}</span>}
            </div>
            <div className="rchart__summary-body">{children}</div>
        </div>
    );
}

function InferenceCard({ title = 'What this means', children }) {
    if (!children) return null;
    return (
        <div className="rchart__inference">
            <div className="rchart__inference-title">{title}</div>
            <div className="rchart__inference-copy">{children}</div>
        </div>
    );
}

function formatOneInN(pValue) {
    const p = Number(pValue);
    if (!Number.isFinite(p) || p <= 0) return 'fewer than 1 in 10,000';
    if (p >= 1) return 'about 1 in 1';
    const n = Math.max(1, Math.round(1 / p));
    if (n > 10000) return 'fewer than 1 in 10,000';
    return `about 1 in ${n}`;
}

function GroupMeansViz({ summary, significant }) {
    if (!summary?.length) return null;
    const width = Math.max(260, 78 + summary.length * 70);
    const height = 110;
    const leftPad = 26;
    const rightPad = 12;
    const topPad = 10;
    const bottomPad = 26;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;
    const yMax = Math.max(...summary.map((group) => group.ciHigh ?? group.max ?? group.mean));
    const yMin = Math.min(...summary.map((group) => group.ciLow ?? group.min ?? group.mean));
    const color = significant ? SIG_COLOR : NOT_COLOR;
    const xForGroup = (index) => leftPad + plotWidth * (summary.length === 1 ? 0.5 : index / (summary.length - 1));
    const yForValue = (value) => {
        const span = Math.max(1, yMax - yMin);
        return topPad + plotHeight - ((value - yMin) / span) * plotHeight;
    };

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            {summary.map((group, index) => {
                const x = xForGroup(index);
                const meanY = yForValue(group.mean);
                const lowY = yForValue(group.ciLow ?? group.mean);
                const highY = yForValue(group.ciHigh ?? group.mean);
                return (
                    <g key={group.name}>
                        <line x1={x} x2={x} y1={lowY} y2={highY} className="rchart__ci-line" />
                        <line x1={x - 6} x2={x + 6} y1={lowY} y2={lowY} className="rchart__ci-line" />
                        <line x1={x - 6} x2={x + 6} y1={highY} y2={highY} className="rchart__ci-line" />
                        <circle cx={x} cy={meanY} r="4.5" fill={color} />
                        <text x={x} y={height - 9} textAnchor="middle" className="rchart__axis-text">
                            {group.name}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

function PairwiseDifferenceViz({ evidence, significant }) {
    const ci = evidence?.details?.meanDifferenceCi;
    const effect = evidence?.details?.meanDifference;
    if (!Array.isArray(ci) || ci.length !== 2 || effect == null) return null;

    const low = Number(ci[0]);
    const high = Number(ci[1]);
    const diff = Number(effect);
    const values = [low, high, diff, 0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.25, (max - min) * 0.15 || 1);
    const domainMin = min - pad;
    const domainMax = max + pad;
    const width = 300;
    const height = 72;
    const leftPad = 20;
    const rightPad = 20;
    const axisY = 42;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - domainMin) / Math.max(0.0001, domainMax - domainMin)) * plotWidth;
    const color = significant ? SIG_COLOR : NOT_COLOR;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
            <line x1={xFor(0)} x2={xFor(0)} y1={16} y2={58} className="rchart__zero-line" />
            <line x1={xFor(low)} x2={xFor(high)} y1={axisY} y2={axisY} className="rchart__delta-line" />
            <line x1={xFor(low)} x2={xFor(low)} y1={axisY - 8} y2={axisY + 8} className="rchart__delta-cap" />
            <line x1={xFor(high)} x2={xFor(high)} y1={axisY - 8} y2={axisY + 8} className="rchart__delta-cap" />
            <circle cx={xFor(diff)} cy={axisY} r="5" fill={color} />
            <text x={xFor(0)} y={12} textAnchor="middle" className="rchart__axis-text">0 = no difference</text>
            <text x={xFor(diff)} y={axisY - 14} textAnchor="middle" className="rchart__annotation-text">
                estimated difference
            </text>
            <text x={(xFor(low) + xFor(high)) / 2} y={axisY + 18} textAnchor="middle" className="rchart__axis-text">
                95% interval for the difference
            </text>
            <text x={xFor(domainMin)} y={66} textAnchor="start" className="rchart__axis-text">{formatNumber(domainMin, 1)}</text>
            <text x={xFor(0)} y={66} textAnchor="middle" className="rchart__axis-text">0</text>
            <text x={xFor(domainMax)} y={66} textAnchor="end" className="rchart__axis-text">{formatNumber(domainMax, 1)}</text>
        </svg>
    );
}

function PairwiseOverlapViz({ points, summary, significant }) {
    if (!points?.length || !summary?.length || summary.length !== 2) return null;
    const [groupA, groupB] = summary;
    const valuesByGroup = summary.map((group) => ({
        name: group.name,
        values: points
            .filter((point) => point.group === group.name)
            .map((point) => point.value)
            .sort((a, b) => a - b),
    }));
    const allValues = valuesByGroup.flatMap((group) => group.values);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const binCount = 18;
    const span = Math.max(1e-6, max - min);
    const step = span / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
        x0: min + index * step,
        x1: min + (index + 1) * step,
    }));

    const densities = valuesByGroup.map((group) => {
        const counts = bins.map((bin) => group.values.filter((value) => (
            value >= bin.x0 && (value < bin.x1 || bin === bins[bins.length - 1])
        )).length);
        const maxCount = Math.max(...counts, 1);
        return {
            name: group.name,
            counts,
            maxCount,
            mean: summary.find((entry) => entry.name === group.name)?.mean,
        };
    });

    const width = 300;
    const height = 156;
    const leftPad = 18;
    const rightPad = 18;
    const topPad = 18;
    const bottomPad = 26;
    const midY = 76;
    const halfHeight = 42;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - min) / Math.max(1e-6, max - min)) * plotWidth;
    const colorA = 'rgba(99, 102, 241, 0.48)';
    const colorB = 'rgba(16, 185, 129, 0.42)';
    const strokeA = 'rgba(99, 102, 241, 0.9)';
    const strokeB = significant ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.92)';
    const buildPath = (counts, direction) => {
        const pts = counts.map((count, index) => {
            const center = bins[index].x0 + (bins[index].x1 - bins[index].x0) / 2;
            const offset = (count / Math.max(...counts, 1)) * halfHeight;
            return {
                x: xFor(center),
                y: midY + direction * offset,
            };
        });
        const firstX = xFor(bins[0].x0);
        const lastX = xFor(bins[bins.length - 1].x1);
        const path = [`M ${firstX} ${midY}`];
        pts.forEach((pt) => path.push(`L ${pt.x} ${pt.y}`));
        path.push(`L ${lastX} ${midY}`);
        return path.join(' ');
    };

    return (
        <div className="rchart__overlapviz">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                <line x1={leftPad} x2={width - rightPad} y1={midY} y2={midY} className="rchart__gridline" />
                <path d={buildPath(densities[0].counts, -1)} fill={colorA} stroke={strokeA} strokeWidth="1.5" />
                <path d={buildPath(densities[1].counts, 1)} fill={colorB} stroke={strokeB} strokeWidth="1.5" />
                {[groupA, groupB].map((group, index) => {
                    const meanX = xFor(group.mean);
                    return (
                        <g key={group.name}>
                            <line x1={meanX} x2={meanX} y1={midY - (index === 0 ? halfHeight : 0)} y2={midY + (index === 1 ? halfHeight : 0)} className="rchart__mean-marker" />
                            <text x={meanX} y={index === 0 ? 16 : 148} textAnchor="middle" className="rchart__annotation-text">
                                {group.name} mean {formatNumber(group.mean, 2)}
                            </text>
                        </g>
                    );
                })}
                <text x={leftPad} y={midY - halfHeight - 4} textAnchor="start" className="rchart__axis-text">
                    {groupA.name} density
                </text>
                <text x={leftPad} y={midY + halfHeight + 12} textAnchor="start" className="rchart__axis-text">
                    {groupB.name} density
                </text>
                <text x={leftPad} y={height - 6} textAnchor="start" className="rchart__axis-text">{formatNumber(min, 0)}</text>
                <text x={width - rightPad} y={height - 6} textAnchor="end" className="rchart__axis-text">{formatNumber(max, 0)}</text>
            </svg>
            <div className="rchart__overlapviz-legend">
                <span><span className="rchart__swatch rchart__swatch--a" />{groupA.name}</span>
                <span><span className="rchart__swatch rchart__swatch--b" />{groupB.name}</span>
                <span className="rchart__overlapviz-copy">the filled shapes share one value axis, so the overlapping area shows where both groups concentrate.</span>
            </div>
        </div>
    );
}

function GrandMeanOffsetViz({ summary, evidence, significant }) {
    const grandMean = Number(evidence?.details?.grandMean);
    if (!summary?.length || !Number.isFinite(grandMean)) return null;
    const width = Math.max(280, 78 + summary.length * 72);
    const height = 112;
    const leftPad = 28;
    const rightPad = 14;
    const topPad = 14;
    const bottomPad = 26;
    const offsets = summary.flatMap((group) => [group.ciLow - grandMean, group.ciHigh - grandMean, group.mean - grandMean, 0]);
    const min = Math.min(...offsets);
    const max = Math.max(...offsets);
    const pad = Math.max(0.25, (max - min) * 0.18 || 1);
    const domainMin = min - pad;
    const domainMax = max + pad;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;
    const color = significant ? SIG_COLOR : NOT_COLOR;
    const xForGroup = (index) => leftPad + plotWidth * (summary.length === 1 ? 0.5 : index / (summary.length - 1));
    const yFor = (value) => topPad + plotHeight - ((value - domainMin) / Math.max(0.0001, domainMax - domainMin)) * plotHeight;
    const zeroY = yFor(0);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={zeroY} y2={zeroY} className="rchart__zero-line" />
            {summary.map((group, index) => {
                const x = xForGroup(index);
                const meanOffset = group.mean - grandMean;
                const meanY = yFor(meanOffset);
                const lowY = yFor(group.ciLow - grandMean);
                const highY = yFor(group.ciHigh - grandMean);
                return (
                    <g key={group.name}>
                        <line x1={x} x2={x} y1={lowY} y2={highY} className="rchart__delta-line" />
                        <line x1={x - 6} x2={x + 6} y1={lowY} y2={lowY} className="rchart__delta-cap" />
                        <line x1={x - 6} x2={x + 6} y1={highY} y2={highY} className="rchart__delta-cap" />
                        <circle cx={x} cy={meanY} r="4.5" fill={color} />
                        <text x={x} y={Math.max(12, meanY - 8)} textAnchor="middle" className="rchart__annotation-text">
                            {meanOffset >= 0 ? '+' : ''}{formatNumber(meanOffset, 2)}
                        </text>
                        <text x={x} y={height - 9} textAnchor="middle" className="rchart__axis-text">{group.name}</text>
                    </g>
                );
            })}
            <text x={leftPad} y={12} textAnchor="start" className="rchart__axis-text">dashed line = grand mean ({formatNumber(grandMean, 2)})</text>
            <text x={leftPad} y={height - 32} textAnchor="start" className="rchart__axis-text">labels show each group's mean offset from that grand mean</text>
        </svg>
    );
}

function EffectSizeMeter({ label, value, kind = 'generic' }) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const magnitude = Math.abs(numeric);
    let thresholds = [0.1, 0.3, 0.5];
    let cap = 1;
    if (kind === 'eta') {
        thresholds = [0.01, 0.06, 0.14];
        cap = 0.3;
    } else if (kind === 'cramersV') {
        thresholds = [0.1, 0.3, 0.5];
        cap = 1;
    }
    const widthPct = `${Math.min(1, magnitude / cap) * 100}%`;
    let strength = 'small';
    if (magnitude >= thresholds[2]) strength = 'large';
    else if (magnitude >= thresholds[1]) strength = 'medium';
    return (
        <div className="rchart__effect-meter">
            <div className="rchart__effect-meter-copy">
                <span className="rchart__effect-meter-label">{label}</span>
                <span className="rchart__effect-meter-value">{formatNumber(numeric, 3)} · {strength} effect</span>
            </div>
            <div className="rchart__effect-meter-track">
                <span className="rchart__effect-meter-fill" style={{ width: widthPct }} />
            </div>
        </div>
    );
}

function PairwiseForestViz({ summary }) {
    if (!summary?.length || summary.length < 3) return null;
    const pairs = [];
    for (let i = 0; i < summary.length; i += 1) {
        for (let j = i + 1; j < summary.length; j += 1) {
            const a = summary[i];
            const b = summary[j];
            const diff = b.mean - a.mean;
            const se = Math.sqrt((a.std ** 2) / Math.max(1, a.count) + (b.std ** 2) / Math.max(1, b.count));
            pairs.push({
                label: `${b.name} - ${a.name}`,
                diff,
                low: diff - 1.96 * se,
                high: diff + 1.96 * se,
            });
        }
    }
    const width = 340;
    const height = 40 + pairs.length * 24;
    const leftPad = 88;
    const rightPad = 70;
    const axisTop = 18;
    const axisBottom = height - 16;
    const values = pairs.flatMap((pair) => [pair.low, pair.high, pair.diff, 0]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.25, (max - min) * 0.15 || 1);
    const domainMin = min - pad;
    const domainMax = max + pad;
    const xFor = (value) => leftPad + ((value - domainMin) / Math.max(0.0001, domainMax - domainMin)) * (width - leftPad - rightPad);
    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={xFor(0)} x2={xFor(0)} y1={axisTop - 4} y2={axisBottom} className="rchart__zero-line" />
            {pairs.map((pair, index) => {
                const y = axisTop + index * 24 + 10;
                return (
                    <g key={pair.label}>
                        <text x={leftPad - 6} y={y + 3} textAnchor="end" className="rchart__axis-text">{pair.label}</text>
                        <line x1={xFor(pair.low)} x2={xFor(pair.high)} y1={y} y2={y} className="rchart__delta-line" />
                        <line x1={xFor(pair.low)} x2={xFor(pair.low)} y1={y - 5} y2={y + 5} className="rchart__delta-cap" />
                        <line x1={xFor(pair.high)} x2={xFor(pair.high)} y1={y - 5} y2={y + 5} className="rchart__delta-cap" />
                        <circle cx={xFor(pair.diff)} cy={y} r="3.8" fill={SIG_COLOR} />
                        <text x={width - 4} y={y + 3} textAnchor="end" className="rchart__axis-text">
                            {formatNumber(pair.diff, 2)} [{formatNumber(pair.low, 2)}, {formatNumber(pair.high, 2)}]
                        </text>
                    </g>
                );
            })}
            <text x={xFor(domainMin)} y={height - 2} textAnchor="start" className="rchart__axis-text">{formatNumber(domainMin, 1)}</text>
            <text x={xFor(0)} y={height - 2} textAnchor="middle" className="rchart__axis-text">0</text>
            <text x={xFor(domainMax)} y={height - 2} textAnchor="end" className="rchart__axis-text">{formatNumber(domainMax, 1)}</text>
        </svg>
    );
}

function getPairwiseComparisons(summary) {
    const pairs = [];
    for (let i = 0; i < summary.length; i += 1) {
        for (let j = i + 1; j < summary.length; j += 1) {
            const a = summary[i];
            const b = summary[j];
            const diff = b.mean - a.mean;
            const se = Math.sqrt((a.std ** 2) / Math.max(1, a.count) + (b.std ** 2) / Math.max(1, b.count));
            pairs.push({
                lower: a.name,
                higher: b.name,
                diff,
                low: diff - 1.96 * se,
                high: diff + 1.96 * se,
            });
        }
    }
    return pairs;
}

function OverlapRidgelineViz({ points, summary, significant }) {
    if (!points?.length || !summary?.length) return null;
    const valuesByGroup = summary.map((group) => ({
        name: group.name,
        values: points
            .filter((point) => point.group === group.name)
            .map((point) => point.value)
            .sort((a, b) => a - b),
        mean: group.mean,
    }));
    const allValues = valuesByGroup.flatMap((group) => group.values);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const binCount = 22;
    const span = Math.max(1e-6, max - min);
    const step = span / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
        x0: min + index * step,
        x1: min + (index + 1) * step,
    }));
    const width = 320;
    const rowHeight = 34;
    const height = 30 + valuesByGroup.length * rowHeight + 16;
    const leftPad = 62;
    const rightPad = 16;
    const topPad = 18;
    const axisWidth = width - leftPad - rightPad;
    const maxDensity = Math.max(
        ...valuesByGroup.map((group) => Math.max(
            ...bins.map((bin) => group.values.filter((value) => (
                value >= bin.x0 && (value < bin.x1 || bin === bins[bins.length - 1])
            )).length),
            1
        )),
        1
    );
    const xFor = (value) => leftPad + ((value - min) / Math.max(1e-6, max - min)) * axisWidth;
    const baseColors = [
        'rgba(99, 102, 241, 0.36)',
        'rgba(56, 189, 248, 0.32)',
        significant ? 'rgba(16, 185, 129, 0.32)' : 'rgba(244, 63, 94, 0.28)',
        'rgba(168, 85, 247, 0.28)',
    ];
    const strokeColors = [
        'rgba(99, 102, 241, 0.92)',
        'rgba(56, 189, 248, 0.9)',
        significant ? 'rgba(16, 185, 129, 0.92)' : 'rgba(244, 63, 94, 0.9)',
        'rgba(168, 85, 247, 0.88)',
    ];

    const buildDensityPath = (counts, centerY) => {
        const pts = counts.map((count, index) => {
            const center = bins[index].x0 + (bins[index].x1 - bins[index].x0) / 2;
            const heightOffset = (count / maxDensity) * 11;
            return { x: xFor(center), y: centerY - heightOffset };
        });
        const firstX = xFor(bins[0].x0);
        const lastX = xFor(bins[bins.length - 1].x1);
        return [
            `M ${firstX} ${centerY}`,
            ...pts.map((pt) => `L ${pt.x} ${pt.y}`),
            `L ${lastX} ${centerY}`,
        ].join(' ');
    };

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            {valuesByGroup.map((group, index) => {
                const counts = bins.map((bin) => group.values.filter((value) => (
                    value >= bin.x0 && (value < bin.x1 || bin === bins[bins.length - 1])
                )).length);
                const y = topPad + index * rowHeight + 12;
                const fill = baseColors[index % baseColors.length];
                const stroke = strokeColors[index % strokeColors.length];
                const meanX = xFor(group.mean);
                return (
                    <g key={group.name}>
                        <text x={leftPad - 8} y={y + 4} textAnchor="end" className="rchart__axis-text">{group.name}</text>
                        <line x1={leftPad} x2={width - rightPad} y1={y} y2={y} className="rchart__gridline" />
                        <path d={buildDensityPath(counts, y)} fill={fill} stroke={stroke} strokeWidth="1.5" />
                        <line x1={meanX} x2={meanX} y1={y - 13} y2={y + 2} className="rchart__mean-marker" />
                        <text x={meanX} y={y - 15} textAnchor="middle" className="rchart__annotation-text">
                            {formatNumber(group.mean, 1)}
                        </text>
                    </g>
                );
            })}
            <text x={leftPad} y={height - 2} textAnchor="start" className="rchart__axis-text">{formatNumber(min, 0)}</text>
            <text x={width - rightPad} y={height - 2} textAnchor="end" className="rchart__axis-text">{formatNumber(max, 0)}</text>
        </svg>
    );
}

function VariancePartitionViz({ stat }) {
    const r = Number(stat);
    if (!Number.isFinite(r)) return null;
    const explained = clamp01(r * r);
    const unexplained = 1 - explained;
    return (
        <div className="rchart__variance">
            <div className="rchart__variance-bar">
                <span className="rchart__variance-fill rchart__variance-fill--explained" style={{ width: `${explained * 100}%` }} />
                <span className="rchart__variance-fill rchart__variance-fill--unexplained" style={{ width: `${unexplained * 100}%` }} />
            </div>
            <div className="rchart__variance-copy">
                <span>explained variance {formatNumber(explained, 3)}</span>
                <span>unexplained {formatNumber(unexplained, 3)}</span>
            </div>
        </div>
    );
}

function seededNormalSeries(length, seed = 1) {
    let state = seed;
    const nextRand = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
    const vals = [];
    while (vals.length < length) {
        const u1 = Math.max(1e-8, nextRand());
        const u2 = nextRand();
        const mag = Math.sqrt(-2 * Math.log(u1));
        vals.push(mag * Math.cos(2 * Math.PI * u2));
        if (vals.length < length) vals.push(mag * Math.sin(2 * Math.PI * u2));
    }
    return vals;
}

function QQPlotViz({ col, seed = null, compact = false }) {
    const raw = seed == null
        ? (col?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value))
        : seededNormalSeries((col?.raw_values ?? []).length || 20, seed);
    if (raw.length < 5) return null;
    const values = [...raw].sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const sd = Math.sqrt(Math.max(variance, 1e-8));
    const qqPoints = values.map((value, index) => {
        const p = (index + 0.5) / values.length;
        const theoretical = jStat.normal.inv(p, mean, sd);
        return { x: theoretical, y: value };
    });
    const mins = qqPoints.flatMap((point) => [point.x, point.y]);
    const min = Math.min(...mins);
    const max = Math.max(...mins);
    const width = compact ? 84 : 300;
    const height = compact ? 84 : 130;
    const pad = compact ? 10 : 20;
    const xFor = (value) => pad + ((value - min) / Math.max(0.0001, max - min)) * (width - pad * 2);
    const yFor = (value) => height - pad - ((value - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={xFor(min)} x2={xFor(max)} y1={yFor(min)} y2={yFor(max)} className="rchart__zero-line" />
            {qqPoints.map((point, index) => (
                <circle key={index} cx={xFor(point.x)} cy={yFor(point.y)} r={compact ? 1.7 : 2.2} className="rchart__point" />
            ))}
        </svg>
    );
}

function NullDistributionViz({ kind = 'symmetric', observed = 0, pValue, sampleSize, title, observedLabel = 'your result', nullSubject = 'the groups were really the same' }) {
    const width = 300;
    const height = 90;
    const leftPad = 18;
    const rightPad = 18;
    const topPad = 12;
    const axisY = 64;
    const plotWidth = width - leftPad - rightPad;
    const points = Array.from({ length: 60 }, (_, i) => {
        const t = i / 59;
        let x;
        let y;
        if (kind === 'positive') {
            x = t * 4;
            y = Math.pow(x + 0.2, 2) * Math.exp(-1.5 * x);
        } else {
            x = -3 + t * 6;
            y = Math.exp(-(x ** 2) / 2);
        }
        return { x, y };
    });
    const maxX = Math.max(...points.map((p) => p.x));
    const minX = Math.min(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));
    const xFor = (value) => leftPad + ((value - minX) / Math.max(0.0001, maxX - minX)) * plotWidth;
    const yFor = (value) => axisY - (value / Math.max(0.0001, maxY)) * 42;
    const obs = Number(observed);
    const normalizedObserved = Number.isFinite(obs)
        ? kind === 'positive'
            ? clamp01(obs / Math.max(1, obs + 2)) * 4
            : Math.max(-3, Math.min(3, obs))
        : 0;
    const threshold = kind === 'positive'
        ? Math.max(minX, Math.min(maxX, normalizedObserved))
        : Math.min(maxX, Math.abs(normalizedObserved));
    const rightTailPoints = points.filter((point) => (
        kind === 'positive'
            ? point.x >= threshold
            : point.x >= threshold
    ));
    const rightTailPath = rightTailPoints.length
        ? [
            `M ${xFor(rightTailPoints[0].x)} ${axisY}`,
            ...rightTailPoints.map((point) => `L ${xFor(point.x)} ${yFor(point.y)}`),
            `L ${xFor(rightTailPoints[rightTailPoints.length - 1].x)} ${axisY}`,
        ].join(' ')
        : null;
    const leftTailPoints = kind === 'symmetric'
        ? points.filter((point) => point.x <= -threshold)
        : [];
    const leftTailPath = leftTailPoints.length
        ? [
            `M ${xFor(leftTailPoints[0].x)} ${axisY}`,
            ...leftTailPoints.map((point) => `L ${xFor(point.x)} ${yFor(point.y)}`),
            `L ${xFor(leftTailPoints[leftTailPoints.length - 1].x)} ${axisY}`,
        ].join(' ')
        : null;
    const tailLabelX = kind === 'positive'
        ? xFor(Math.max(minX, threshold + (maxX - minX) * 0.06))
        : xFor(Math.min(maxX, threshold + (maxX - minX) * 0.08));
    const tailLabelY = 34;
    return (
        <div className="rchart__null">
            {title && <div className="rchart__null-title">{title}</div>}
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                {leftTailPath && <path d={leftTailPath} className="rchart__null-tail" />}
                {rightTailPath && <path d={rightTailPath} className="rchart__null-tail" />}
                <path
                    d={points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.x)} ${yFor(point.y)}`).join(' ')}
                    fill="none"
                    stroke="rgba(99,102,241,0.75)"
                    strokeWidth="2"
                />
                <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
                <line x1={xFor(normalizedObserved)} x2={xFor(normalizedObserved)} y1={18} y2={axisY} className="rchart__delta-line" />
                <text x={xFor(normalizedObserved)} y={14} textAnchor="middle" className="rchart__annotation-text">
                    {observedLabel}
                </text>
                <text x={tailLabelX} y={tailLabelY} textAnchor="start" className="rchart__annotation-text">
                    shaded tail = {formatPValueLabel(pValue)}
                </text>
                <text x={leftPad} y={height - 4} textAnchor="start" className="rchart__axis-text">common under noise only</text>
                <text x={width - rightPad} y={height - 4} textAnchor="end" className="rchart__axis-text">rare under noise only</text>
            </svg>
            <div className="rchart__null-copy">
                If {nullSubject}, most results would land under the wide middle of the curve. The shaded tail shows results as extreme as yours. {formatPValueLabel(pValue)} means only that small a share of same-under-null results would reach the shaded area.
            </div>
        </div>
    );
}

function buildGroupLayer2Inference(summary, evidence) {
    const isOverallScope = evidence?.details?.scope === 'overall_multi_group' || summary.length > 2;
    if (isOverallScope) {
        const comparisons = getPairwiseComparisons(summary).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        const strongest = comparisons[0];
        const allAwayFromZero = comparisons.every((pair) => pair.low > 0 || pair.high < 0);
        const ordered = [...summary].sort((a, b) => a.mean - b.mean).map((group) => group.name).join(' < ');
        return `The clearest gap is ${strongest.higher} minus ${strongest.lower} = ${formatNumber(strongest.diff, 2)} points on average. ${allAwayFromZero ? `All three pairwise ranges stay away from 0, so the averages are ordered ${ordered}.` : 'Some pairwise ranges still touch 0, so not every group gap is equally certain.'}`;
    }

    const diff = Number(evidence?.details?.meanDifference);
    const ci = evidence?.details?.meanDifferenceCi ?? [];
    const [a, b] = summary;
    if (!Number.isFinite(diff) || ci.length !== 2) return null;
    const higherGroup = diff >= 0 ? a.name : b.name;
    const lowerGroup = diff >= 0 ? b.name : a.name;
    return `${higherGroup} is higher than ${lowerGroup} by about ${formatNumber(Math.abs(diff), 2)} points on average. The likely range for that gap is ${formatNumber(Math.abs(ci[0]), 2)} to ${formatNumber(Math.abs(ci[1]), 2)} points ${diff >= 0 ? 'higher' : 'lower'} than ${lowerGroup}.`;
}

function buildGroupLayer3Inference({ evidence, stat, pValue }) {
    const isOverallScope = evidence?.details?.scope === 'overall_multi_group' || (evidence?.details?.groupCount ?? 0) > 2;
    if (isOverallScope) {
        return `If the group averages were really the same, you would almost always get an F much closer to the middle of the curve. Your F = ${formatNumber(stat, 2)} lands in the far-right tail, which would happen ${formatOneInN(pValue)} random tries.`;
    }
    const diff = Number(evidence?.details?.meanDifference);
    return `If the two group averages were really the same, you would usually get a difference much closer to 0. Your observed gap of ${formatNumber(diff, 2)} lands in the shaded tail, which would happen ${formatOneInN(pValue)} random tries.`;
}

function DistributionShapeViz({ col, markOutliers = false }) {
    const summary = getNumericShapeSummary(col);
    if (!summary) return null;
    const fence = markOutliers ? getOutlierFence(col) : null;
    const width = 300;
    const height = 92;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 42;
    const xFor = (value) => leftPad + ((value - summary.min) / Math.max(0.0001, summary.max - summary.min || 1)) * (width - leftPad - rightPad);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
            <line x1={xFor(summary.min)} x2={xFor(summary.max)} y1={axisY} y2={axisY} className="rchart__whisker" />
            <rect
                x={xFor(summary.q1)}
                y={axisY - 12}
                width={Math.max(10, xFor(summary.q3) - xFor(summary.q1))}
                height={24}
                rx={8}
                className="rchart__iqr-box"
            />
            <line x1={xFor(summary.median)} x2={xFor(summary.median)} y1={axisY - 12} y2={axisY + 12} className="rchart__median-line" />
            <circle cx={xFor(summary.mean)} cy={axisY} r="4.5" fill={SIG_COLOR} />
            {markOutliers && Number.isFinite(fence) && (
                <>
                    <line x1={xFor(Math.min(fence, summary.max))} x2={xFor(Math.min(fence, summary.max))} y1={12} y2={70} className="rchart__zero-line" />
                    <text x={xFor(Math.min(fence, summary.max))} y={10} textAnchor="middle" className="rchart__axis-text">
                        fence {formatNumber(fence, 2)}
                    </text>
                </>
            )}
            <text x={xFor(summary.min)} y={74} textAnchor="start" className="rchart__axis-text">{formatNumber(summary.min, 1)}</text>
            <text x={xFor(summary.q1)} y={74} textAnchor="middle" className="rchart__axis-text">Q1 {formatNumber(summary.q1, 1)}</text>
            <text x={xFor(summary.median)} y={86} textAnchor="middle" className="rchart__axis-text">median {formatNumber(summary.median, 1)}</text>
            <text x={xFor(summary.q3)} y={74} textAnchor="middle" className="rchart__axis-text">Q3 {formatNumber(summary.q3, 1)}</text>
            <text x={xFor(summary.max)} y={74} textAnchor="end" className="rchart__axis-text">{formatNumber(summary.max, 1)}</text>
        </svg>
    );
}

function TailBalanceViz({ col }) {
    const summary = getNumericShapeSummary(col);
    if (!summary) return null;
    const maxTail = Math.max(summary.leftTail, summary.rightTail, summary.leftHalf, summary.rightHalf, 0.0001);
    const leftTailPct = `${(summary.leftTail / maxTail) * 100}%`;
    const rightTailPct = `${(summary.rightTail / maxTail) * 100}%`;
    const leftHalfPct = `${(summary.leftHalf / maxTail) * 100}%`;
    const rightHalfPct = `${(summary.rightHalf / maxTail) * 100}%`;

    return (
        <div className="rchart__tail-balance">
            <div className="rchart__tail-row">
                <span className="rchart__tail-label">left tail</span>
                <div className="rchart__tail-track"><span className="rchart__tail-fill" style={{ width: leftTailPct }} /></div>
                <span className="rchart__tail-value">{formatNumber(summary.leftTail, 2)}</span>
            </div>
            <div className="rchart__tail-row">
                <span className="rchart__tail-label">right tail</span>
                <div className="rchart__tail-track"><span className="rchart__tail-fill" style={{ width: rightTailPct }} /></div>
                <span className="rchart__tail-value">{formatNumber(summary.rightTail, 2)}</span>
            </div>
            <div className="rchart__tail-row">
                <span className="rchart__tail-label">left center</span>
                <div className="rchart__tail-track"><span className="rchart__tail-fill rchart__tail-fill--soft" style={{ width: leftHalfPct }} /></div>
                <span className="rchart__tail-value">{formatNumber(summary.leftHalf, 2)}</span>
            </div>
            <div className="rchart__tail-row">
                <span className="rchart__tail-label">right center</span>
                <div className="rchart__tail-track"><span className="rchart__tail-fill rchart__tail-fill--soft" style={{ width: rightHalfPct }} /></div>
                <span className="rchart__tail-value">{formatNumber(summary.rightHalf, 2)}</span>
            </div>
        </div>
    );
}

function ResidualRanking({ col1, col2, significant }) {
    const evidence = getContingencyEvidence(col1, col2);
    if (!evidence?.cells?.length) return null;

    const ranked = [...evidence.cells]
        .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
        .slice(0, 4);
    const maxResidual = Math.max(...ranked.map((cell) => Math.abs(cell.residual)), 0.01);

    return (
        <div className="rchart__residual-list">
            {ranked.map((cell) => {
                const width = `${(Math.abs(cell.residual) / maxResidual) * 100}%`;
                return (
                    <div key={`${cell.row}-${cell.col}`} className="rchart__residual-item">
                        <div className="rchart__residual-label">{cell.row} x {cell.col}</div>
                        <div className="rchart__residual-bar">
                            <span
                                className={`rchart__residual-fill ${cell.residual >= 0 ? 'rchart__residual-fill--pos' : 'rchart__residual-fill--neg'}`}
                                style={{ width }}
                            />
                        </div>
                        <div className="rchart__residual-value">
                            {cell.observed} vs {formatNumber(cell.expected, 1)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function TrendSummary({ stat, significant }) {
    const numericStat = Number(stat);
    if (!Number.isFinite(numericStat)) return null;
    const magnitude = Math.min(1, Math.abs(numericStat));
    const direction = numericStat >= 0 ? 'positive' : 'negative';
    return (
        <div className="rchart__trend-summary">
            <div className="rchart__trend-track">
                <span
                    className={`rchart__trend-fill ${significant ? 'rchart__trend-fill--sig' : 'rchart__trend-fill--ns'}`}
                    style={{ width: `${magnitude * 100}%` }}
                />
            </div>
            <div className="rchart__trend-copy">
                <span>{direction} trend</span>
                <span>strength {formatNumber(Math.abs(numericStat), 3)}</span>
            </div>
        </div>
    );
}

function ScatterResultViz({ col1, col2, significant, stat, mode = 'raw' }) {
    const scatterData = getScatterData(col1, col2);
    const linePoints = mode === 'statistical' ? getRegressionLine(scatterData) : null;
    const lineColor = significant ? SIG_COLOR : NOT_COLOR;
    if (!scatterData.length) return null;

    return (
        <div className="rchart__panel">
            <div className="rchart__panel-copy">
                <span className="rchart__panel-title">{mode === 'statistical' ? 'Statistical Evidence' : 'Raw Data View'}</span>
                <span className="rchart__panel-subtitle">
                    {mode === 'statistical'
                        ? 'The fitted line and its consistency explain what the test is reacting to.'
                        : 'This view shows the raw point cloud only, so you can judge the relationship without the test overlay.'}
                </span>
            </div>
            {mode === 'statistical' && (
                <EvidenceSummaryCard
                    title="Explained Variance"
                    subtitle="This shows how much of the variation in the outcome is accounted for by the relationship rather than left unexplained."
                >
                    <VariancePartitionViz stat={stat} />
                </EvidenceSummaryCard>
            )}
            <ResponsiveContainer width="100%" height={156}>
                <ScatterChart margin={MARGIN}>
                    <XAxis dataKey="x" type="number" tick={TICK} tickCount={4} name={col1.name} />
                    <YAxis dataKey="y" type="number" tick={TICK} tickCount={4} name={col2.name} />
                    <Tooltip
                        contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                        formatter={(v) => formatNumber(v, 3)}
                        labelFormatter={() => ''}
                        cursor={{ strokeDasharray: '3 3' }}
                    />
                    <Scatter data={scatterData} fill="#94a3b8" opacity={mode === 'statistical' ? 0.28 : 0.45} r={2.2} />
                    {linePoints && (
                        <Scatter
                            data={linePoints}
                            fill="none"
                            line={{ stroke: lineColor, strokeWidth: 2.2 }}
                            shape={() => null}
                            isAnimationActive={false}
                        />
                    )}
                </ScatterChart>
            </ResponsiveContainer>
            <div className="rchart__chart-note">
                <span>{col1.name}</span>
                <span className="ichart__vs">vs</span>
                <span>{col2.name}</span>
                {mode === 'statistical' && (
                    <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                        r = {formatNumber(stat, 3)}
                    </span>
                )}
            </div>
        </div>
    );
}

function GroupDifferenceViz({ catCol, numCol, significant, pValue, evidence, mode = 'raw' }) {
    const points = getGroupPointData(catCol, numCol);
    const summary = getGroupDistributionSummary(catCol, numCol);
    if (!points.length || summary.length < 2) return null;

    const isOverallScope = evidence?.details?.scope === 'overall_multi_group' || summary.length > 2;
    const color = significant ? SIG_COLOR : NOT_COLOR;
    const yMax = Math.max(...points.map((p) => p.value), ...summary.map((s) => s.max));
    const yMin = Math.min(...points.map((p) => p.value), ...summary.map((s) => s.min));
    const meanDiff = summary.length >= 2 ? summary[0].mean - summary[1].mean : null;
    const overlap = summary.length === 2 ? getIqrOverlapSummary(summary) : null;
    const width = Math.max(280, 72 + summary.length * 70);
    const height = 196;
    const leftPad = 30;
    const rightPad = 14;
    const topPad = 18;
    const bottomPad = 30;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;
    const bandWidth = 40;
    const capWidth = 10;
    const xForGroup = (index) => leftPad + plotWidth * (summary.length === 1 ? 0.5 : index / (summary.length - 1));
    const yForValue = (value) => {
        const span = Math.max(1, yMax - yMin);
        return topPad + plotHeight - ((value - yMin) / span) * plotHeight;
    };
    const ticks = Array.from({ length: 4 }, (_, i) => {
        const value = yMin + ((yMax - yMin) * i) / 3;
        return { value, y: yForValue(value) };
    });

    if (mode === 'statistical') {
        const isPairwise = !isOverallScope && summary.length === 2;
        return (
            <div className="rchart__panel">
                <div className="rchart__panel-copy">
                    <span className="rchart__panel-title">Statistical Evidence</span>
                    <span className="rchart__panel-subtitle">
                        {isOverallScope
                            ? 'Each row compares two group averages directly. The dot is the estimated gap; the line shows the likely range for that gap.'
                            : 'The dot is the estimated difference between the two group means. The line shows the likely range for that difference.'}
                    </span>
                </div>
                <EvidenceSummaryCard
                    title={isOverallScope ? 'Average Score Gaps Between Groups' : 'Difference Between Group Means'}
                    subtitle={isOverallScope
                        ? 'Each row is one average-score gap. For example, "High - Low = 1.73" means the High group scores 1.73 points higher on average than the Low group.'
                        : 'The green dot is the estimated difference. The green line is the 95% interval for that difference. The dashed zero line means “no difference.”'}
                >
                    {isOverallScope
                        ? <PairwiseForestViz summary={summary} />
                        : <PairwiseDifferenceViz evidence={evidence} significant={significant} />}
                </EvidenceSummaryCard>
                <InferenceCard>
                    {buildGroupLayer2Inference(summary, evidence)}
                </InferenceCard>
                <div className="rchart__stat-grid">
                    {summary.map((group) => (
                        <div key={group.name} className="rchart__stat-card">
                            <span className="rchart__stat-card-label">{group.name}</span>
                            <span className="rchart__stat-card-value">mean {formatNumber(group.mean, 2)}</span>
                            <span className="rchart__stat-card-copy">
                                95% interval {formatNumber(group.ciLow, 2)} to {formatNumber(group.ciHigh, 2)}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="rchart__chart-note">
                    {isOverallScope ? (
                        <>
                            <span>{summary.length} groups compared</span>
                            <span className="rchart__overlap-note">overall comparison</span>
                            <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                                {evidence?.details?.effectSizeLabel ?? 'effect'} = {formatNumber(evidence?.details?.effectSizeValue, 3)}
                            </span>
                        </>
                    ) : (
                        <>
                            <span>{summary[0].name}</span>
                            <span className="ichart__vs">vs</span>
                            <span>{summary[1].name}</span>
                            <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                                mean diff = {formatNumber(meanDiff, 2)}
                            </span>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="rchart__panel">
            <div className="rchart__panel-copy">
                <span className="rchart__panel-title">Raw Data View</span>
                <span className="rchart__panel-subtitle">
                    {isOverallScope
                        ? 'Each group is drawn on the same horizontal score axis below. When the colored shapes sit over the same scores, those groups overlap in their raw values.'
                        : 'Both groups are drawn on the same value axis. Where the two filled shapes sit on top of each other, the groups overlap in their raw scores.'}
                </span>
            </div>
            {isOverallScope ? (
                <>
                    <EvidenceSummaryCard
                        title="Shared Score Overlap"
                        subtitle="Each row uses the same score axis. The filled shape shows where most scores cluster, and the number above it marks that group's average score."
                    >
                        <OverlapRidgelineViz points={points} summary={summary} significant={significant} />
                    </EvidenceSummaryCard>
                </>
            ) : (
                <PairwiseOverlapViz points={points} summary={summary} significant={significant} />
            )}
            <div className="rchart__chart-note">
                {isOverallScope ? (
                    <>
                        <span>{summary.length} groups compared</span>
                        <span className="rchart__overlap-note">overall comparison</span>
                        <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                            {significant ? 'group averages are not all the same' : 'group averages may still be effectively the same'}
                        </span>
                    </>
                ) : (
                    <>
                        <span>{summary[0].name}</span>
                        <span className="ichart__vs">vs</span>
                        <span>{summary[1].name}</span>
                        {overlap && <span className="rchart__overlap-note">{overlap.label}</span>}
                        <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                            mean diff = {formatNumber(meanDiff, 2)}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

function HistogramResultViz({ col, significant, markOutliers = false, mode = 'raw' }) {
    const data = getHistogramData(col);
    const fence = markOutliers ? getOutlierFence(col) : null;
    const color = significant ? SIG_COLOR : NOT_COLOR;
    if (!data.length) return null;

    if (mode === 'statistical') {
        return (
            <div className="rchart__panel">
                <div className="rchart__panel-copy">
                    <span className="rchart__panel-title">Statistical Evidence</span>
                    <span className="rchart__panel-subtitle">
                        {markOutliers
                            ? 'This view shows the quartiles and the outlier fence used to decide whether tail values are unusually far from the center.'
                            : 'This view shows the center, quartiles, and tail balance that a distribution-style test is sensitive to.'}
                    </span>
                </div>
                <EvidenceSummaryCard
                    title={markOutliers ? 'Quartiles And Outlier Fence' : 'Center And Tail Balance'}
                    subtitle={markOutliers
                        ? 'Only outlier-focused results use the fence; it marks the cutoff beyond which values are flagged as unusually high.'
                        : 'A distribution result is driven by how symmetric the center is and whether one tail stretches farther than the other.'}
                >
                    <DistributionShapeViz col={col} markOutliers={markOutliers} />
                </EvidenceSummaryCard>
                <TailBalanceViz col={col} />
                <div className="rchart__chart-note">
                    <span>{col.name}</span>
                    <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                        {markOutliers ? 'fence-based outlier check' : 'shape-based distribution check'}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="rchart__panel">
            <div className="rchart__panel-copy">
                <span className="rchart__panel-title">Raw Data View</span>
                <span className="rchart__panel-subtitle">
                    {markOutliers
                        ? 'This histogram shows the raw distribution, with unusually high bins highlighted only when the result is explicitly outlier-focused.'
                        : 'This histogram shows the raw distribution only, so you can see where values cluster before switching to the statistical shape view.'}
                </span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
                <BarChart data={data} margin={MARGIN} barCategoryGap="2%">
                    <XAxis dataKey="name" tick={TICK} tickCount={5} />
                    <YAxis tick={TICK} tickCount={4} />
                    <Tooltip
                        contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                        formatter={(v) => [v, 'Count']}
                        labelFormatter={(l) => `≥ ${l}`}
                    />
                    <Bar
                        dataKey="count"
                        isAnimationActive={false}
                        radius={[2, 2, 0, 0]}
                        shape={(props) => {
                            const { x, y, width, height, index } = props;
                            const isOutlier = fence != null && data[index]?.x0 >= fence;
                            return (
                                <rect
                                    x={x}
                                    y={y}
                                    width={width}
                                    height={height}
                                    fill={isOutlier ? '#ef4444' : color}
                                    opacity={isOutlier ? 0.9 : 0.78}
                                    rx={2}
                                />
                            );
                        }}
                    />
                </BarChart>
            </ResponsiveContainer>
            <div className="rchart__chart-note">
                <span>{col.name}</span>
                {markOutliers && <span className="ichart__outlier-note">red = beyond Q3+1.5×IQR</span>}
            </div>
        </div>
    );
}

function ChiSquareEvidenceViz({ col1, col2, significant, mode = 'raw', resultEvidence }) {
    const contingency = getContingencyEvidence(col1, col2);
    if (!contingency) return null;

    const { rows, cols, cells } = contingency;
    const CELL = 36;
    const PAD_LEFT = 64;
    const PAD_TOP = 30;
    const width = PAD_LEFT + cols.length * CELL;
    const height = PAD_TOP + rows.length * CELL + 8;
    const maxResidual = Math.max(...cells.map((cell) => Math.abs(cell.residual)), 0.01);
    const scale = (value) => Math.min(0.92, Math.abs(value) / maxResidual);

    const cellColor = (residual) => (
        residual >= 0
            ? `rgba(16,185,129,${scale(residual).toFixed(2)})`
            : `rgba(244,63,94,${scale(residual).toFixed(2)})`
    );
    const rawMax = Math.max(...cells.map((cell) => cell.observed), 1);

    return (
        <div className="rchart__panel">
            <div className="rchart__panel-copy">
                <span className="rchart__panel-title">{mode === 'statistical' ? 'Statistical Evidence' : 'Raw Data View'}</span>
                <span className="rchart__panel-subtitle">
                    {mode === 'statistical'
                        ? 'The test reacts to cells that differ most from expectation, not just to the biggest raw counts.'
                        : 'This view shows the observed counts only, so you can see the raw category mix before looking at deviations from expectation.'}
                </span>
            </div>
            {mode === 'statistical' && (
                <EvidenceSummaryCard
                    title="Strongest Deviations"
                    subtitle="These category pairs contribute most to the test result."
                >
                    <ResidualRanking col1={col1} col2={col2} significant={significant} />
                </EvidenceSummaryCard>
            )}
            {mode === 'statistical' && (
                <EffectSizeMeter
                    label={resultEvidence?.details?.effectSizeLabel ?? "Cramer's V"}
                    value={resultEvidence?.details?.effectSizeValue}
                    kind="cramersV"
                />
            )}
            <div className="rchart__heatmap-wrap">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="rchart__heatmap-svg"
                >
                    {cols.map((name, index) => (
                        <text
                            key={`col-${name}`}
                            x={PAD_LEFT + index * CELL + CELL / 2}
                            y={PAD_TOP - 8}
                            textAnchor="middle"
                            fontSize={8}
                            fill="#94a3b8"
                        >
                            {name.length > 8 ? `${name.slice(0, 7)}…` : name}
                        </text>
                    ))}
                    {rows.map((name, index) => (
                        <text
                            key={`row-${name}`}
                            x={PAD_LEFT - 6}
                            y={PAD_TOP + index * CELL + CELL / 2 + 3}
                            textAnchor="end"
                            fontSize={8}
                            fill="#94a3b8"
                        >
                            {name.length > 11 ? `${name.slice(0, 10)}…` : name}
                        </text>
                    ))}
                    {cells.map((cell) => {
                        const x = PAD_LEFT + cols.indexOf(cell.col) * CELL;
                        const y = PAD_TOP + rows.indexOf(cell.row) * CELL;
                        return (
                            <g key={`${cell.row}-${cell.col}`}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={CELL - 2}
                                    height={CELL - 2}
                                    rx={4}
                                    fill={mode === 'statistical'
                                        ? cellColor(cell.residual)
                                        : `rgba(99,102,241,${Math.max(0.12, cell.observed / rawMax).toFixed(2)})`}
                                    stroke={mode === 'statistical' ? (significant ? SIG_COLOR : NOT_COLOR) : 'rgba(99,102,241,0.18)'}
                                    strokeOpacity={mode === 'statistical' ? 0.12 : 1}
                                />
                                <text
                                    x={x + CELL / 2 - 1}
                                    y={y + CELL / 2 - 2}
                                    textAnchor="middle"
                                    fontSize={8}
                                    fontWeight="700"
                                    fill={mode === 'statistical'
                                        ? (Math.abs(cell.residual) > maxResidual * 0.45 ? '#fff' : '#334155')
                                        : (cell.observed / rawMax > 0.55 ? '#fff' : '#334155')}
                                >
                                    {cell.observed}
                                </text>
                                <text
                                    x={x + CELL / 2 - 1}
                                    y={y + CELL / 2 + 9}
                                    textAnchor="middle"
                                    fontSize={6.5}
                                    fill={mode === 'statistical'
                                        ? (Math.abs(cell.residual) > maxResidual * 0.45 ? 'rgba(255,255,255,0.85)' : '#64748b')
                                        : (cell.observed / rawMax > 0.55 ? 'rgba(255,255,255,0.9)' : '#64748b')}
                                >
                                    {mode === 'statistical' ? `exp ${formatNumber(cell.expected, 1)}` : 'obs'}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className="rchart__chart-note">
                <span>{col1.name}</span>
                <span className="ichart__vs">×</span>
                <span>{col2.name}</span>
                {mode === 'statistical' && (
                    <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                        larger residuals = stronger evidence
                    </span>
                )}
            </div>
        </div>
    );
}

function resolveSampleSize(evidence, numeric, categorical) {
    if (Number.isFinite(Number(evidence?.details?.sampleSize))) return Number(evidence.details.sampleSize);
    if (Array.isArray(evidence?.details?.groups)) {
        return evidence.details.groups.reduce((sum, group) => sum + (Number(group.count) || 0), 0);
    }
    const first = numeric[0] ?? categorical[0];
    return first?.raw_values?.length ?? 0;
}

function ResultChart({
    chart_type = '',
    columns = [],
    spec,
    significant,
    aiAssisted,
    pValue,
    stat,
    method = '',
    testType = '',
    evidence = null,
}) {
    if (!spec || !columns.length) return null;

    const { numeric, categorical } = findCols(spec, columns);
    const resolvedEvidence = evidence ?? buildFallbackResultEvidence({
        hypothesisType: testType,
        chartType: chart_type,
        variables: columns,
        stat,
        pValue,
        significant,
        method,
    });
    const explanation = buildResultExplanation({
        evidence: resolvedEvidence,
        method,
        significant,
        aiAssisted,
    });
    const interpretation = buildResultInterpretation({
        evidence: resolvedEvidence,
        method,
        significant,
        aiAssisted,
    });
    const sampleSize = resolveSampleSize(resolvedEvidence, numeric, categorical);
    const sigBadge = significant
        ? <span className="ichart__sig-badge ichart__sig-badge--yes">significant</span>
        : <span className="ichart__sig-badge ichart__sig-badge--no">not significant</span>;
    const aiBadge = aiAssisted
        ? <span className="ichart__sig-badge ichart__sig-badge--ai">AI estimate</span>
        : null;

    let layer1 = null;
    let layer2 = null;
    let layer3 = null;
    let label = null;

    if (resolvedEvidence.kind === EVIDENCE_KINDS.TREND && numeric.length >= 2) {
        layer1 = (
            <LayerBlock
                label="Layer 1"
                title="Evidence"
                caption="What to look at: whether the point cloud leans in one direction before thinking about significance."
            >
                <ScatterResultViz col1={numeric[0]} col2={numeric[1]} significant={significant} stat={stat} mode="raw" />
            </LayerBlock>
        );
        layer2 = (
            <LayerBlock
                label="Layer 2"
                title="Effect"
                caption="What we measured, and how sure: explained variance and the fitted relationship, shown in data units rather than a standalone badge."
            >
                <ScatterResultViz col1={numeric[0]} col2={numeric[1]} significant={significant} stat={stat} mode="statistical" />
            </LayerBlock>
        );
        layer3 = (
            <LayerBlock
                label="Layer 3"
                title="Evidence vs Chance"
                caption="Where this falls if there were no real relationship: values deeper in the null tail are harder to explain by chance alone."
            >
                <NullDistributionViz kind="symmetric" observed={stat} pValue={pValue} sampleSize={sampleSize} title="Null reference for correlation" />
            </LayerBlock>
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{numeric[0].name}</span>
                <span className="ichart__vs">vs</span>
                <span>{numeric[1].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    } else if (resolvedEvidence.kind === EVIDENCE_KINDS.GROUP_COMPARISON && categorical[0] && numeric[0]) {
        const isOverallScope = resolvedEvidence?.details?.scope === 'overall_multi_group' || (resolvedEvidence?.details?.groupCount ?? 0) > 2;
        layer1 = (
            <LayerBlock
                label="Layer 1"
                title="Evidence"
                caption={isOverallScope
                    ? 'What to look at: whether the group score ranges sit on top of one another on the same score axis, which is what overlap actually means here.'
                    : 'What to look at: whether the two groups occupy the same score range on the same axis.'}
            >
                <GroupDifferenceViz catCol={categorical[0]} numCol={numeric[0]} significant={significant} pValue={pValue} evidence={resolvedEvidence} mode="raw" />
            </LayerBlock>
        );
        layer2 = (
            <LayerBlock
                label="Layer 2"
                title="Effect"
                caption={isOverallScope
                    ? 'What we measured, and how sure: each row is a gap in average score between two groups. Positive numbers mean the first named group scores higher on average.'
                    : 'What we measured, and how sure: the dot is the average score gap and the line shows the likely range for that gap.'}
            >
                <GroupDifferenceViz catCol={categorical[0]} numCol={numeric[0]} significant={significant} pValue={pValue} evidence={resolvedEvidence} mode="statistical" />
            </LayerBlock>
        );
        layer3 = (
            <LayerBlock
                label="Layer 3"
                title="Evidence vs Chance"
                caption={isOverallScope
                    ? 'Where your ANOVA number falls if all group averages were really the same and any gaps were just random noise.'
                    : 'Where your observed group gap falls if the true difference between the two groups were really zero.'}
            >
                <NullDistributionViz
                    kind={isOverallScope ? 'positive' : 'symmetric'}
                    observed={isOverallScope ? stat : resolvedEvidence?.details?.meanDifference}
                    pValue={pValue}
                    sampleSize={sampleSize}
                    title={isOverallScope ? 'What F values look like when all group averages are really the same' : 'What mean differences look like when the two group averages are really the same'}
                    observedLabel={isOverallScope
                        ? `your F = ${formatNumber(stat, 2)}`
                        : `your difference = ${formatNumber(resolvedEvidence?.details?.meanDifference, 2)}`}
                    nullSubject={isOverallScope
                        ? 'the group averages were really the same'
                        : 'the two group averages were really the same'}
                />
                <InferenceCard title="What this means">
                    {buildGroupLayer3Inference({ evidence: resolvedEvidence, stat, pValue })}
                </InferenceCard>
            </LayerBlock>
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{categorical[0].name}</span>
                <span className="ichart__vs">→</span>
                <span>{numeric[0].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    } else if (resolvedEvidence.kind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION && categorical.length >= 2) {
        layer1 = (
            <LayerBlock
                label="Layer 1"
                title="Evidence"
                caption="What to look at: the raw category pattern before comparing it with an independence baseline."
            >
                <ChiSquareEvidenceViz col1={categorical[0]} col2={categorical[1]} significant={significant} mode="raw" resultEvidence={resolvedEvidence} />
            </LayerBlock>
        );
        layer2 = (
            <LayerBlock
                label="Layer 2"
                title="Effect"
                caption="What we measured, and how sure: which cells deviate from independence and how large that association is overall."
            >
                <ChiSquareEvidenceViz col1={categorical[0]} col2={categorical[1]} significant={significant} mode="statistical" resultEvidence={resolvedEvidence} />
            </LayerBlock>
        );
        layer3 = (
            <LayerBlock
                label="Layer 3"
                title="Evidence vs Chance"
                caption="Where the observed χ² value falls if the variables were actually independent."
            >
                <NullDistributionViz kind="positive" observed={stat} pValue={pValue} sampleSize={sampleSize} title="Null reference for χ²" />
            </LayerBlock>
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{categorical[0].name}</span>
                <span className="ichart__vs">×</span>
                <span>{categorical[1].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    } else if (resolvedEvidence.kind === EVIDENCE_KINDS.DISTRIBUTION_SHAPE && numeric[0]) {
        layer1 = (
            <LayerBlock
                label="Layer 1"
                title="Evidence"
                caption="What to look at: the raw distribution shape and where values cluster."
            >
                <HistogramResultViz col={numeric[0]} significant={significant} mode="raw" />
            </LayerBlock>
        );
        layer2 = (
            <LayerBlock
                label="Layer 2"
                title="Effect"
                caption="What we measured, and how sure: how the sample quantiles line up with an ideal reference shape."
            >
                <div className="rchart__panel">
                    <EvidenceSummaryCard
                        title="Q-Q Comparison"
                        subtitle="If points hug the reference diagonal, the observed distribution is close to the expected shape. Systematic bends indicate where the shape differs."
                    >
                        <QQPlotViz col={numeric[0]} />
                    </EvidenceSummaryCard>
                </div>
            </LayerBlock>
        );
        layer3 = (
            <LayerBlock
                label="Layer 3"
                title="Evidence vs Chance"
                caption="Where this falls if the data really followed the reference shape: compare the actual Q-Q pattern to same-size null samples."
            >
                <div className="rchart__qq-calibration">
                    <QQPlotViz col={numeric[0]} seed={11} compact />
                    <QQPlotViz col={numeric[0]} seed={29} compact />
                    <QQPlotViz col={numeric[0]} seed={47} compact />
                </div>
            </LayerBlock>
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{numeric[0].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    } else if (resolvedEvidence.kind === EVIDENCE_KINDS.OUTLIER_SIGNAL && numeric[0]) {
        layer1 = (
            <LayerBlock
                label="Layer 1"
                title="Evidence"
                caption="What to look at: the raw distribution together with the values beyond the outlier fence."
            >
                <HistogramResultViz col={numeric[0]} significant={significant} markOutliers mode="raw" />
            </LayerBlock>
        );
        layer2 = (
            <LayerBlock
                label="Layer 2"
                title="Effect"
                caption="What we measured, and how sure: how far the extreme values extend beyond the IQR-based fence."
            >
                <HistogramResultViz col={numeric[0]} significant={significant} markOutliers mode="statistical" />
            </LayerBlock>
        );
        layer3 = (
            <LayerBlock
                label="Layer 3"
                title="Evidence vs Chance"
                caption="Where this falls if those extremes were only ordinary variation rather than genuine outliers."
            >
                <NullDistributionViz kind="positive" observed={stat} pValue={pValue} sampleSize={sampleSize} title="Null reference for the outlier check" />
            </LayerBlock>
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{numeric[0].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    }

    if (!layer1 || !layer2 || !layer3) return null;

    return (
        <div className="ichart ichart--result nodrag">
            <VerdictSummary interpretation={interpretation} significant={significant} aiAssisted={aiAssisted} />
            {layer1}
            {layer2}
            {layer3}
            <details className="rchart__details">
                <summary>Test details</summary>
                <div className="rchart__details-body">
                    <ResultEvidenceHeader evidence={resolvedEvidence} />
                    <ResultExplanationCard explanation={explanation} />
                    <div className="ichart__axis-labels">
                        {label?.props?.children}
                    </div>
                </div>
            </details>
        </div>
    );
}

export default ResultChart;
