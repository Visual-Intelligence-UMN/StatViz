import { jStat } from 'jstat';
import {
    ScatterChart, Scatter,
    BarChart, Bar, ErrorBar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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
import { buildFallbackResultEvidence, buildResultInterpretation, classifyEffectStrength, EVIDENCE_KINDS } from '../../utils/evidenceModel';
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
    if (numeric < 0.001) return 'p < 0.001';
    if (numeric < 0.01) return 'p < 0.01';
    if (numeric < 0.05) return 'p < 0.05';
    if (numeric < 0.1) return 'p < 0.10';
    return 'p ≥ 0.10';
}

function formatPValueTranslation(value, nullSubject = 'random reorderings') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'the result is hard to distinguish from chance';
    const percent = clamp01(1 - numeric) * 100;
    if (numeric < 0.001) return `more extreme than 99.9% of ${nullSubject}`;
    if (numeric < 0.01) return `more extreme than ${formatNumber(percent, 1)}% of ${nullSubject}`;
    if (numeric < 0.05) return `more extreme than ${formatNumber(percent, 0)}% of ${nullSubject}`;
    if (numeric < 0.1) return `more extreme than ${formatNumber(percent, 0)}% of ${nullSubject}, but still close to chance`;
    return `well within the range of ${nullSubject}`;
}

function shouldRenderInlinePValue({ pValue, aiAssisted = false }) {
    return Number.isFinite(Number(pValue)) && !aiAssisted;
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
                <span className="rchart__layer-title">{title}</span>
            </div>
            {caption && <div className="rchart__layer-caption">{caption}</div>}
            <div className="rchart__layer-body">{children}</div>
        </div>
    );
}

function MainChartBlock({ title = '', caption = '', chanceCopy = '', children }) {
    return (
        <div className="rchart__main-block">
            {title ? (
                <div className="rchart__layer-head">
                    <span className="rchart__layer-title">{title}</span>
                </div>
            ) : null}
            {caption ? <div className="rchart__layer-caption">{caption}</div> : null}
            <div className="rchart__main-chart">{children}</div>
            {chanceCopy ? (
                <div className="rchart__chance-strip">
                    <span className="rchart__chance-title">Chance read</span>
                    <span className="rchart__chance-copy">{chanceCopy}</span>
                </div>
            ) : null}
        </div>
    );
}

function buildVisualInterpretationOverride({ interpretation, evidence, numeric = [], aiAssisted = false }) {
    if (!interpretation) return interpretation;
    if (evidence?.kind === EVIDENCE_KINDS.OUTLIER_SIGNAL && aiAssisted && numeric[0]) {
        const fence = getOutlierFence(numeric[0]);
        const values = (numeric[0]?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value));
        const flaggedCount = Number.isFinite(fence) ? values.filter((value) => value > fence).length : 0;
        if (flaggedCount === 0) {
            return {
                ...interpretation,
                headline: 'No clear outlier signal in the sample',
                takeaway: 'The AI-assisted result suggested an outlier pattern, but the current sample does not show values crossing the outlier fence. Treat this as a weak prompt to investigate further, not as confirmed evidence.',
            };
        }
    }
    return interpretation;
}

function VerdictSummary({ interpretation, significant, aiAssisted, narrativeLines = [] }) {
    if (!interpretation && !narrativeLines.length) return null;
    return (
        <div className="rchart__verdict">
            <div className="rchart__verdict-head">
                <span className="rchart__verdict-title">{interpretation?.headline ?? 'Result Summary'}</span>
                {aiAssisted && <span className="rchart__verdict-chip rchart__verdict-chip--ai">AI estimate</span>}
            </div>
            {interpretation?.takeaway ? <div className="rchart__verdict-copy">{interpretation.takeaway}</div> : null}
            {narrativeLines.length ? (
                <div className="rchart__verdict-explain">
                    <div className="rchart__verdict-explain-title">Analysis</div>
                    <ResultGrammar lines={narrativeLines} />
                </div>
            ) : null}
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

function SummaryChartFrame({ overlay = null, chartLabel = '', children }) {
    return (
        <div className="rchart__summary-frame">
            {(chartLabel || overlay) ? (
                <div className="rchart__summary-top">
                    {chartLabel ? <span className="rchart__chart-kind">{chartLabel}</span> : <span />}
                    {overlay ? <div className="rchart__summary-overlay">{overlay}</div> : null}
                </div>
            ) : null}
            {children}
        </div>
    );
}

function ChartStatCallout({ title, value, tone = 'neutral', subtitle = '' }) {
    return (
        <div className={`rchart__chart-callout rchart__chart-callout--${tone}`}>
            <span className="rchart__chart-callout-title">{title}</span>
            <span className="rchart__chart-callout-value">{value}</span>
            {subtitle ? <span className="rchart__chart-callout-subtitle">{subtitle}</span> : null}
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

function ResultGrammar({ lines = [] }) {
    const cleanLines = lines.filter(Boolean);
    if (!cleanLines.length) return null;
    return (
        <div className="rchart__grammar">
            {cleanLines.map((line, index) => (
                <div key={index} className="rchart__grammar-line">
                    <span className="rchart__grammar-index">{index + 1}.</span>
                    <span className="rchart__grammar-copy">{line}</span>
                </div>
            ))}
        </div>
    );
}

function resolveNarrativeLines(narrative, fallbackLines = []) {
    const aiLines = Array.isArray(narrative?.lines) ? narrative.lines.filter(Boolean) : [];
    return aiLines.length ? aiLines : fallbackLines.filter(Boolean);
}

function getInsightTypeFromEvidenceKind(kind) {
    switch (kind) {
        case EVIDENCE_KINDS.TREND:
            return 'relationship';
        case EVIDENCE_KINDS.GROUP_COMPARISON:
            return 'group_difference';
        case EVIDENCE_KINDS.DISTRIBUTION_SHAPE:
            return 'distribution_issue';
        case EVIDENCE_KINDS.OUTLIER_SIGNAL:
            return 'outlier_candidate';
        default:
            return 'relationship';
    }
}

function buildChanceCopy({ pValue, aiAssisted, evidenceKind }) {
    if (aiAssisted || !Number.isFinite(Number(pValue))) {
        return 'AI-assisted result: no computed p-value is available for this chart.';
    }

    if (evidenceKind === EVIDENCE_KINDS.TREND) {
        return `${formatPValueLabel(pValue)} — a relationship this strong would be rare if the two variables were unrelated.`;
    }
    if (evidenceKind === EVIDENCE_KINDS.GROUP_COMPARISON) {
        return `${formatPValueLabel(pValue)} — a group gap this large would be rare if the group averages were really the same.`;
    }
    if (evidenceKind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION) {
        return `${formatPValueLabel(pValue)} — a category mismatch this large would be rare if the two variables were unrelated.`;
    }
    if (evidenceKind === EVIDENCE_KINDS.DISTRIBUTION_SHAPE) {
        return `${formatPValueLabel(pValue)} — a shape difference this large would be rare if the distribution matched the reference shape.`;
    }
    return `${formatPValueLabel(pValue)} — this pattern would be rare under a simple chance-only explanation.`;
}

function formatChanceSentence({ pValue, template, aiAssisted = false }) {
    if (aiAssisted || !Number.isFinite(Number(pValue))) {
        return 'This result is AI-assisted, so there is no computed p-value to show here.';
    }
    return `${formatPValueLabel(pValue)} — ${template}`;
}

function buildTrendGrammar({ col1, col2, pValue, aiAssisted = false, scatterData = [] }) {
    const metrics = getLinearFitMetrics(scatterData);
    if (!metrics) return [];
    const direction = metrics.slope >= 0 ? 'higher' : 'lower';
    const slope = Math.abs(metrics.slope);
    const low = Math.min(Math.abs(metrics.ciLow), Math.abs(metrics.ciHigh));
    const high = Math.max(Math.abs(metrics.ciLow), Math.abs(metrics.ciHigh));
    return [
        `Each additional ${col1.name} unit is associated with about ${formatNumber(slope, 2)} ${col2.name} points ${direction}.`,
        `The likely range is ${formatNumber(low, 2)} to ${formatNumber(high, 2)} ${col2.name} points ${direction} per ${col1.name} unit.`,
        formatChanceSentence({
            pValue,
            aiAssisted,
            template: `a relationship this strong would be rare if ${col1.name} and ${col2.name} were unrelated.`,
        }),
    ];
}

function buildPairwiseGrammar({ summary, evidence, pValue, aiAssisted = false }) {
    if (!summary?.length || summary.length !== 2) return [];
    const diff = Number(evidence?.details?.meanDifference);
    const ci = evidence?.details?.meanDifferenceCi ?? [];
    if (!Number.isFinite(diff) || ci.length !== 2) return [];
    const first = summary[0];
    const second = summary[1];
    const higher = diff >= 0 ? first.name : second.name;
    const lower = diff >= 0 ? second.name : first.name;
    const low = Math.min(Math.abs(ci[0]), Math.abs(ci[1]));
    const high = Math.max(Math.abs(ci[0]), Math.abs(ci[1]));
    return [
        `${higher} scores about ${formatNumber(Math.abs(diff), 2)} points higher than ${lower}.`,
        `The likely gap is ${formatNumber(low, 2)} to ${formatNumber(high, 2)} points.`,
        formatChanceSentence({
            pValue,
            aiAssisted,
            template: `a gap this large would be rare if ${higher} and ${lower} really had the same average score.`,
        }),
    ];
}

function buildOverallGroupGrammar({ summary, evidence, pValue, aiAssisted = false }) {
    const comparisons = (evidence?.details?.pairwiseComparisons?.length
        ? evidence.details.pairwiseComparisons.map((pair) => ({
            lower: pair.groupA,
            higher: pair.groupB,
            diff: Number(pair.meanDifference),
            low: Number(pair.ciLow),
            high: Number(pair.ciHigh),
        }))
        : getPairwiseComparisons(summary)
    ).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const strongest = comparisons[0];
    if (!strongest) return [];
    const low = Math.min(Math.abs(strongest.low), Math.abs(strongest.high));
    const high = Math.max(Math.abs(strongest.low), Math.abs(strongest.high));
    const effectLabel = evidence?.details?.effectSizeLabel ?? 'effect size';
    const effectValue = evidence?.details?.effectSizeValue;
    return [
        `The clearest gap is ${strongest.higher} versus ${strongest.lower}: about ${formatNumber(Math.abs(strongest.diff), 2)} points.`,
        Number.isFinite(Number(effectValue))
            ? `${effectLabel} is ${formatNumber(effectValue, 3)}, and the strongest pair likely differs by ${formatNumber(low, 2)} to ${formatNumber(high, 2)} points.`
            : `The strongest pair likely differs by ${formatNumber(low, 2)} to ${formatNumber(high, 2)} points.`,
        formatChanceSentence({
            pValue,
            aiAssisted,
            template: 'differences across groups this large would be rare if the group averages were really similar.',
        }),
    ];
}

function buildChiSquareGrammar({ contingency, resultEvidence, pValue, aiAssisted = false }) {
    if (!contingency?.cells?.length) return [];
    const strongest = [...contingency.cells].sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))[0];
    const effectValue = resultEvidence?.details?.effectSizeValue;
    const effectLabel = resultEvidence?.details?.effectSizeLabel ?? "Cramer's V";
    return [
        `${strongest.row} × ${strongest.col} differs most from expectation: observed ${formatNumber(strongest.observed, 0)} versus expected ${formatNumber(strongest.expected, 1)}.`,
        Number.isFinite(Number(effectValue))
            ? `${effectLabel} is ${formatNumber(effectValue, 3)}, which summarizes the overall association size.`
            : 'The darker cells are the ones that depart most from the expected table pattern.',
        formatChanceSentence({
            pValue,
            aiAssisted,
            template: 'a mismatch this large would be unlikely if the two categorical variables were unrelated.',
        }),
    ];
}

function buildDistributionGrammar({ col, pValue, aiAssisted = false }) {
    const summary = getNumericShapeSummary(col);
    if (!summary) return [];
    const skew = summary.rightTail - summary.leftTail;
    const shapeLine = Math.abs(skew) < 0.5
        ? 'The middle of the distribution is fairly balanced around the median.'
        : skew > 0
            ? 'The right tail stretches farther than the left, so the distribution leans right.'
            : 'The left tail stretches farther than the right, so the distribution leans left.';
    return [
        shapeLine,
        `The middle 50% of values runs from ${formatNumber(summary.q1, 2)} to ${formatNumber(summary.q3, 2)} around a median of ${formatNumber(summary.median, 2)}.`,
        formatChanceSentence({
            pValue,
            aiAssisted,
            template: 'a shape difference this large would be rare if the values followed the expected reference shape.',
        }),
    ];
}

function buildOutlierSummary({ col, aiAssisted = false }) {
    const values = (col?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value));
    const fence = getOutlierFence(col);
    if (!values.length || !Number.isFinite(fence)) return [];
    const flagged = values.filter((value) => value > fence);
    if (!flagged.length) {
        return [
            `No values exceed the outlier fence of ${formatNumber(fence, 2)} in this sample.`,
            aiAssisted
                ? 'This result is AI-assisted, so treat it as a prompt to inspect the data rather than a computed outlier verdict.'
                : 'The plot shows the middle 50% and the fence, but no points cross that cutoff.',
        ];
    }
    return [
        `${flagged.length} value${flagged.length === 1 ? '' : 's'} exceed${flagged.length === 1 ? 's' : ''} the outlier fence of ${formatNumber(fence, 2)}.`,
        `The most extreme value is ${formatNumber(Math.max(...flagged), 2)}, which is ${formatNumber(Math.max(...flagged) - fence, 2)} units beyond the fence.`,
    ];
}

function formatOneInN(pValue) {
    const p = Number(pValue);
    if (!Number.isFinite(p) || p <= 0) return 'fewer than 1 in 10,000';
    if (p >= 1) return 'about 1 in 1';
    const n = Math.max(1, Math.round(1 / p));
    if (n > 10000) return 'fewer than 1 in 10,000';
    return `about 1 in ${n}`;
}

function getLinearFitMetrics(scatterData) {
    if (!Array.isArray(scatterData) || scatterData.length < 3) return null;
    const n = scatterData.length;
    const meanX = scatterData.reduce((sum, point) => sum + point.x, 0) / n;
    const meanY = scatterData.reduce((sum, point) => sum + point.y, 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    scatterData.forEach((point) => {
        const dx = point.x - meanX;
        const dy = point.y - meanY;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
    });
    if (sxx <= 0) return null;
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    const r = sxy / Math.sqrt(Math.max(1e-8, sxx * syy));
    const sse = scatterData.reduce((sum, point) => {
        const fitted = intercept + slope * point.x;
        return sum + (point.y - fitted) ** 2;
    }, 0);
    const df = n - 2;
    if (df <= 0) return null;
    const seSlope = Math.sqrt((sse / df) / sxx);
    const tCrit = jStat.studentt.inv(1 - ALPHA / 2, df);
    return {
        slope,
        intercept,
        r,
        ciLow: slope - tCrit * seSlope,
        ciHigh: slope + tCrit * seSlope,
    };
}

function seededShuffle(values, seed = 1) {
    const arr = [...values];
    let state = seed;
    const nextRand = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(nextRand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function seededSampleWithReplacement(values, count, seed = 1) {
    let state = seed;
    const nextRand = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
    return Array.from({ length: count }, () => values[Math.floor(nextRand() * values.length)]);
}

function buildNullFanLines(scatterData, count = 24) {
    if (!Array.isArray(scatterData) || scatterData.length < 4) return [];
    const xs = scatterData.map((point) => point.x);
    const ys = scatterData.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return Array.from({ length: count }, (_, idx) => {
        const permutedX = seededShuffle(xs, idx + 1);
        const metrics = getLinearFitMetrics(permutedX.map((x, i) => ({ x, y: ys[i] })));
        if (!metrics) return null;
        return [
            { x: minX, y: metrics.intercept + metrics.slope * minX },
            { x: maxX, y: metrics.intercept + metrics.slope * maxX },
        ];
    }).filter(Boolean);
}

function buildObservedBand(scatterData) {
    const metrics = getLinearFitMetrics(scatterData);
    if (!metrics) return null;
    const xs = scatterData.map((point) => point.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return {
        center: [
            { x: minX, y: metrics.intercept + metrics.slope * minX },
            { x: maxX, y: metrics.intercept + metrics.slope * maxX },
        ],
        low: [
            { x: minX, y: metrics.intercept + metrics.ciLow * minX },
            { x: maxX, y: metrics.intercept + metrics.ciLow * maxX },
        ],
        high: [
            { x: minX, y: metrics.intercept + metrics.ciHigh * minX },
            { x: maxX, y: metrics.intercept + metrics.ciHigh * maxX },
        ],
    };
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
    const effect = Number(evidence?.details?.meanDifference);
    if (!Array.isArray(ci) || ci.length !== 2 || !Number.isFinite(effect)) return null;

    const low = Number(ci[0]);
    const high = Number(ci[1]);
    const values = [low, high, effect, 0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.2, (max - min) * 0.2 || 1);
    const domainMin = min - pad;
    const domainMax = max + pad;
    const width = 320;
    const height = 92;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 48;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - domainMin) / Math.max(0.0001, domainMax - domainMin)) * plotWidth;

    return (
        <SummaryChartFrame chartLabel="Confidence interval plot">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
                <line x1={xFor(0)} x2={xFor(0)} y1={14} y2={axisY + 16} className="rchart__zero-line" />
                <line x1={xFor(low)} x2={xFor(high)} y1={axisY} y2={axisY} className="rchart__delta-line" />
                <line x1={xFor(low)} x2={xFor(low)} y1={axisY - 8} y2={axisY + 8} className="rchart__delta-cap" />
                <line x1={xFor(high)} x2={xFor(high)} y1={axisY - 8} y2={axisY + 8} className="rchart__delta-cap" />
                <circle cx={xFor(effect)} cy={axisY} r="4.5" fill={significant ? SIG_COLOR : NOT_COLOR} />
                <text x={xFor(effect)} y={16} textAnchor="middle" className="rchart__annotation-text">
                    observed gap {formatNumber(effect, 2)}
                </text>
                <text x={xFor(0)} y={height - 8} textAnchor="middle" className="rchart__axis-text">0 = no gap</text>
                <text x={xFor(low)} y={height - 8} textAnchor="middle" className="rchart__axis-text">{formatNumber(low, 2)}</text>
                <text x={xFor(high)} y={height - 8} textAnchor="middle" className="rchart__axis-text">{formatNumber(high, 2)}</text>
            </svg>
        </SummaryChartFrame>
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
    const height = 132;
    const leftPad = 18;
    const rightPad = 18;
    const topPad = 12;
    const bottomPad = 26;
    const midY = 78;
    const halfHeight = 26;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - min) / Math.max(1e-6, max - min)) * plotWidth;
    const colorA = 'rgba(99, 102, 241, 0.28)';
    const colorB = 'rgba(16, 185, 129, 0.24)';
    const strokeA = 'rgba(99, 102, 241, 0.9)';
    const strokeB = significant ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.92)';
    const buildPath = (counts) => {
        const pts = counts.map((count, index) => {
            const center = bins[index].x0 + (bins[index].x1 - bins[index].x0) / 2;
            const offset = (count / Math.max(...counts, 1)) * halfHeight;
            return {
                x: xFor(center),
                y: midY - offset,
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
                <path d={buildPath(densities[0].counts)} fill={colorA} stroke={strokeA} strokeWidth="1.5" />
                <path d={buildPath(densities[1].counts)} fill={colorB} stroke={strokeB} strokeWidth="1.5" />
                {[groupA, groupB].map((group, index) => {
                    const meanX = xFor(group.mean);
                    return (
                        <g key={group.name}>
                            <line x1={meanX} x2={meanX} y1={midY - halfHeight - 6} y2={midY + 4} className="rchart__mean-marker" />
                        </g>
                    );
                })}
                <text x={leftPad} y={height - 6} textAnchor="start" className="rchart__axis-text">{formatNumber(min, 0)}</text>
                <text x={width / 2} y={height - 6} textAnchor="middle" className="rchart__axis-text">shared score axis</text>
                <text x={width - rightPad} y={height - 6} textAnchor="end" className="rchart__axis-text">{formatNumber(max, 0)}</text>
            </svg>
            <div className="rchart__overlapviz-legend">
                <span><span className="rchart__swatch rchart__swatch--a" />{groupA.name} mean {formatNumber(groupA.mean, 2)}</span>
                <span><span className="rchart__swatch rchart__swatch--b" />{groupB.name} mean {formatNumber(groupB.mean, 2)}</span>
                <span className="rchart__overlapviz-copy">where the colors sit on top of each other, the two groups occupy the same score range.</span>
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

function PairwiseForestViz({ pairwiseComparisons = [], numColName = 'value' }) {
    if (!pairwiseComparisons?.length) return null;
    const pairs = pairwiseComparisons.map((pair) => ({
        label: `${pair.groupB} - ${pair.groupA}`,
        diff: Number(pair.meanDifference),
        low: Number(pair.ciLow),
        high: Number(pair.ciHigh),
        pValueBin: pair.pValueBin ?? formatPValueLabel(pair.adjustedPValue),
        significant: !!pair.significant,
    }));
    const width = 300;
    const height = 34 + pairs.length * 22;
    const leftPad = 78;
    const rightPad = 56;
    const axisTop = 16;
    const axisBottom = height - 20;
    const values = pairs.flatMap((pair) => [pair.low, pair.high, pair.diff, 0]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.25, (max - min) * 0.15 || 1);
    const domainMin = min - pad;
    const domainMax = max + pad;
    const xFor = (value) => leftPad + ((value - domainMin) / Math.max(0.0001, domainMax - domainMin)) * (width - leftPad - rightPad);
    return (
        <SummaryChartFrame chartLabel="Pairwise CI plot">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                <line x1={xFor(0)} x2={xFor(0)} y1={axisTop - 4} y2={axisBottom} className="rchart__zero-line" />
                {pairs.map((pair, index) => {
                    const y = axisTop + index * 24 + 10;
                    return (
                        <g key={pair.label}>
                            <text x={leftPad - 6} y={y + 3} textAnchor="end" className="rchart__axis-text">
                                {pair.label.length > 16 ? `${pair.label.slice(0, 15)}…` : pair.label}
                            </text>
                            <line x1={xFor(pair.low)} x2={xFor(pair.high)} y1={y} y2={y} className="rchart__delta-line" opacity={pair.significant ? 1 : 0.7} />
                            <line x1={xFor(pair.low)} x2={xFor(pair.low)} y1={y - 5} y2={y + 5} className="rchart__delta-cap" />
                            <line x1={xFor(pair.high)} x2={xFor(pair.high)} y1={y - 5} y2={y + 5} className="rchart__delta-cap" />
                            <circle cx={xFor(pair.diff)} cy={y} r="3.8" fill={pair.significant ? SIG_COLOR : NOT_COLOR} />
                            <text x={width - 4} y={y + 3} textAnchor="end" className="rchart__axis-text">
                                {pair.pValueBin}
                            </text>
                        </g>
                    );
                })}
                <text x={xFor(domainMin)} y={height - 8} textAnchor="start" className="rchart__axis-text">{formatNumber(domainMin, 1)}</text>
                <text x={xFor(0)} y={height - 8} textAnchor="middle" className="rchart__axis-text">0</text>
                <text x={xFor(domainMax)} y={height - 8} textAnchor="end" className="rchart__axis-text">{formatNumber(domainMax, 1)}</text>
                <text x={width / 2} y={height - 1} textAnchor="middle" className="rchart__axis-text">
                    difference in {numColName}
                </text>
            </svg>
        </SummaryChartFrame>
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

function SlopeReferenceViz({ scatterData, pValue, significant }) {
    const metrics = getLinearFitMetrics(scatterData);
    if (!metrics) return null;
    const { slope, ciLow, ciHigh } = metrics;
    const values = [ciLow, ciHigh, slope, 0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.02, (max - min) * 0.18 || 0.1);
    const domainMin = min - pad;
    const domainMax = max + pad;
    const width = 300;
    const height = 78;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 42;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - domainMin) / Math.max(0.0001, domainMax - domainMin)) * plotWidth;
    const color = significant ? SIG_COLOR : NOT_COLOR;
    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
            <line x1={xFor(0)} x2={xFor(0)} y1={14} y2={60} className="rchart__zero-line" />
            <line x1={xFor(ciLow)} x2={xFor(ciHigh)} y1={axisY} y2={axisY} className="rchart__delta-line" />
            <line x1={xFor(ciLow)} x2={xFor(ciLow)} y1={axisY - 7} y2={axisY + 7} className="rchart__delta-cap" />
            <line x1={xFor(ciHigh)} x2={xFor(ciHigh)} y1={axisY - 7} y2={axisY + 7} className="rchart__delta-cap" />
            <circle cx={xFor(slope)} cy={axisY} r="4.5" fill={color} />
            <text x={xFor(0)} y={11} textAnchor="middle" className="rchart__axis-text">0 = completely flat line</text>
            <text x={xFor(slope)} y={axisY - 13} textAnchor="middle" className="rchart__annotation-text">
                slope = {formatNumber(slope, 3)}
            </text>
            <text x={(xFor(ciLow) + xFor(ciHigh)) / 2} y={axisY + 17} textAnchor="middle" className="rchart__axis-text">
                likely slope range: {formatNumber(ciLow, 3)} to {formatNumber(ciHigh, 3)}
            </text>
        </svg>
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

function OutlierStripViz({ col }) {
    const values = (col?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value)).sort((a, b) => a - b);
    if (values.length < 5) return null;
    const summary = getNumericShapeSummary(col);
    const fence = getOutlierFence(col);
    if (!summary || !Number.isFinite(fence)) return null;
    const min = summary.min;
    const max = summary.max;
    const width = 320;
    const height = 118;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 78;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - min) / Math.max(0.0001, max - min || 1)) * plotWidth;
    const flaggedCount = values.filter((value) => value > fence).length;

    return (
        <SummaryChartFrame>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
                <rect
                    x={xFor(summary.q1)}
                    y={axisY - 12}
                    width={Math.max(8, xFor(summary.q3) - xFor(summary.q1))}
                    height={24}
                    rx={8}
                    className="rchart__iqr-box"
                />
                <line x1={xFor(summary.median)} x2={xFor(summary.median)} y1={axisY - 12} y2={axisY + 12} className="rchart__median-line" />
                <line x1={xFor(fence)} x2={xFor(fence)} y1={18} y2={axisY + 10} className="rchart__zero-line" />
                {values.map((value, index) => {
                    const flagged = value > fence;
                    const x = xFor(value);
                    if (flagged) {
                        const y = axisY - 20 - (index % 3) * 8;
                        return <circle key={`${value}-${index}`} cx={x} cy={y} r="3.2" fill="rgba(239,68,68,0.82)" />;
                    }
                    return <line key={`${value}-${index}`} x1={x} x2={x} y1={axisY - 5} y2={axisY + 5} stroke="rgba(148,163,184,0.42)" strokeWidth="1.1" />;
                })}
                <text x={leftPad} y={height - 4} textAnchor="start" className="rchart__axis-text">{formatNumber(min, 0)}</text>
                <text x={xFor(fence)} y={height - 4} textAnchor="middle" className="rchart__axis-text">fence {formatNumber(fence, 1)}</text>
                <text x={width - rightPad} y={height - 4} textAnchor="end" className="rchart__axis-text">{formatNumber(max, 0)}</text>
            </svg>
            <div className="rchart__mini-legend">
                <span><span className="rchart__swatch rchart__swatch--flagged" />{flaggedCount > 0 ? 'red points = beyond the outlier fence' : 'no points cross the outlier fence in this sample'}</span>
                <span>purple box = middle 50% of values</span>
            </div>
        </SummaryChartFrame>
    );
}

function QQReferenceViz({ col, pValue, significant, aiAssisted = false }) {
    const raw = (col?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value));
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
    const width = 300;
    const height = 144;
    const padLeft = 34;
    const padRight = 18;
    const padTop = 16;
    const padBottom = 28;
    const xFor = (value) => padLeft + ((value - min) / Math.max(0.0001, max - min)) * (width - padLeft - padRight);
    const yFor = (value) => height - padBottom - ((value - min) / Math.max(0.0001, max - min)) * (height - padTop - padBottom);
    const hasPValue = Number.isFinite(Number(pValue)) && !aiAssisted;
    return (
        <SummaryChartFrame
            chartLabel="Q-Q plot"
            overlay={(
                <div className="rchart__chart-callouts">
                    <ChartStatCallout
                        title="Normality check"
                        value={hasPValue ? formatPValueLabel(pValue) : 'AI estimate'}
                        tone={significant ? 'sig' : 'ns'}
                        subtitle={hasPValue ? 'points that bend far from the dashed line support a small p-value' : 'no computed p-value for this Q-Q comparison'}
                    />
                </div>
            )}
        >
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={xFor(min)} x2={xFor(max)} y1={yFor(min)} y2={yFor(max)} className="rchart__zero-line" />
            {qqPoints.map((point, index) => (
                <circle
                    key={index}
                    cx={xFor(point.x)}
                    cy={yFor(point.y)}
                    r="2.4"
                    fill={significant ? 'rgba(16,185,129,0.55)' : 'rgba(244,63,94,0.48)'}
                />
            ))}
            <text x={width / 2} y={height - 6} textAnchor="middle" className="rchart__axis-text">expected quantiles if the shape were normal</text>
            <text
                x={12}
                y={height / 2}
                textAnchor="middle"
                className="rchart__axis-text"
                transform={`rotate(-90 12 ${height / 2})`}
            >
                observed quantiles from your data
            </text>
        </svg>
        <div className="rchart__mini-legend">
            <span><span className="rchart__swatch rchart__swatch--tail" />dashed line = where the points would sit if the distribution were close to normal</span>
            <span><span className="rchart__swatch rchart__swatch--observed" />points = the ordered values from your data</span>
            <span>{significant ? 'Clear bends away from the dashed line support a low p-value.' : 'Points that mostly stay near the line support a higher p-value.'}</span>
        </div>
        </SummaryChartFrame>
    );
}

function ChiSquareReferenceViz({ contingency, pValue, significant }) {
    if (!contingency?.cells?.length) return null;
    const cells = contingency.cells;
    const observedDeviation = cells.reduce((sum, cell) => sum + ((cell.observed - cell.expected) ** 2) / Math.max(cell.expected, 1e-8), 0);
    const maxCell = cells.reduce((best, cell) => {
        const contribution = ((cell.observed - cell.expected) ** 2) / Math.max(cell.expected, 1e-8);
        return contribution > best.contribution ? { ...cell, contribution } : best;
    }, { contribution: -Infinity });
    const width = 300;
    const height = 82;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 52;
    const maxX = Math.max(1, observedDeviation * 1.1);
    const xFor = (value) => leftPad + (value / maxX) * (width - leftPad - rightPad);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
            <line x1={xFor(0)} x2={xFor(0)} y1={18} y2={axisY + 2} className="rchart__zero-line" />
            <line x1={xFor(observedDeviation)} x2={xFor(observedDeviation)} y1={18} y2={axisY + 2} className="rchart__delta-line" />
            <text x={xFor(0)} y={14} textAnchor="start" className="rchart__axis-text">0 = exactly what independence predicts</text>
            <text x={xFor(observedDeviation)} y={14} textAnchor="end" className="rchart__annotation-text">
                mismatch = {formatNumber(observedDeviation, 2)}
            </text>
            <text x={width - rightPad} y={28} textAnchor="end" className="rchart__annotation-text">
                {formatPValueLabel(pValue)}
            </text>
            <text x={width - rightPad} y={40} textAnchor="end" className="rchart__axis-text">
                {significant ? 'because the whole table departs from independence' : 'because the whole table is still close to independence'}
            </text>
            <text x={leftPad} y={height - 8} textAnchor="start" className="rchart__axis-text">
                biggest push: {maxCell.row} × {maxCell.col}
            </text>
        </svg>
    );
}

function OutlierReferenceViz({ col, pValue, significant }) {
    const raw = (col?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value));
    const fence = getOutlierFence(col);
    if (!raw.length || !Number.isFinite(fence)) return null;
    const beyond = raw.filter((value) => value > fence).sort((a, b) => a - b);
    const maxDistance = Math.max(...beyond.map((value) => value - fence), 0);
    const width = 300;
    const height = 90;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 56;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + (value / Math.max(0.0001, maxDistance || 1)) * plotWidth;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
            <text x={leftPad} y={14} textAnchor="start" className="rchart__axis-text">0 = exactly at the outlier fence</text>
            {beyond.map((value, index) => {
                const distance = value - fence;
                const x = xFor(distance);
                return <circle key={`${value}-${index}`} cx={x} cy={axisY - (index % 3) * 10 - 6} r="3.6" fill={significant ? SIG_COLOR : NOT_COLOR} />;
            })}
            <text x={width - rightPad} y={14} textAnchor="end" className="rchart__annotation-text">
                {formatPValueLabel(pValue)}
            </text>
            <text x={width - rightPad} y={26} textAnchor="end" className="rchart__axis-text">
                {significant ? 'because several values sit clearly beyond the fence' : 'because the values do not stretch far enough beyond the fence'}
            </text>
            <text x={leftPad} y={height - 8} textAnchor="start" className="rchart__axis-text">
                {beyond.length} values beyond fence {formatNumber(fence, 2)}
            </text>
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

function StatisticTailPlot({
    distribution,
    observed,
    df1 = null,
    df2 = null,
    pValue,
    title = 'P-value plot',
}) {
    const obs = Number(observed);
    if (!Number.isFinite(obs)) return null;

    let minX = -4;
    let maxX = 4;
    let pdf = null;
    let twoSided = false;
    let zeroLabel = '0 = no effect';

    if (distribution === 'student_t') {
        const df = Number(df1);
        if (!Number.isFinite(df) || df <= 0) return null;
        const limit = Math.max(4, Math.abs(obs) * 1.2);
        minX = -limit;
        maxX = limit;
        twoSided = true;
        zeroLabel = '0 = no effect';
        pdf = (x) => jStat.studentt.pdf(x, df);
    } else if (distribution === 'f') {
        const a = Number(df1);
        const b = Number(df2);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
        minX = 0;
        maxX = Math.max(5, obs * 1.15);
        zeroLabel = 'small F = groups look similar';
        pdf = (x) => (x <= 0 ? 0 : jStat.centralF.pdf(x, a, b));
    } else if (distribution === 'chisquare') {
        const df = Number(df1);
        if (!Number.isFinite(df) || df <= 0) return null;
        minX = 0;
        maxX = Math.max(6, obs * 1.15);
        zeroLabel = 'small χ² = close to independence';
        pdf = (x) => (x <= 0 ? 0 : jStat.chisquare.pdf(x, df));
    } else {
        return null;
    }

    const width = 300;
    const height = 96;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 68;
    const plotWidth = width - leftPad - rightPad;
    const sampleCount = 160;
    const step = (maxX - minX) / (sampleCount - 1);
    const points = Array.from({ length: sampleCount }, (_, i) => {
        const x = minX + i * step;
        return { x, y: pdf(x) || 0 };
    });
    const maxY = Math.max(...points.map((point) => point.y), 1e-6);
    const xFor = (value) => leftPad + ((value - minX) / Math.max(1e-6, maxX - minX)) * plotWidth;
    const yFor = (value) => axisY - (value / maxY) * 42;
    const inTail = (x) => {
        if (twoSided) return Math.abs(x) >= Math.abs(obs);
        return x >= obs;
    };
    const tailPoints = points.filter((point) => inTail(point.x));
    const tailPath = tailPoints.length
        ? [
            `M ${xFor(tailPoints[0].x)} ${axisY}`,
            ...tailPoints.map((point) => `L ${xFor(point.x)} ${yFor(point.y)}`),
            `L ${xFor(tailPoints[tailPoints.length - 1].x)} ${axisY}`,
        ].join(' ')
        : null;
    const leftTailPoints = twoSided ? points.filter((point) => point.x <= -Math.abs(obs)) : [];
    const leftTailPath = leftTailPoints.length
        ? [
            `M ${xFor(leftTailPoints[0].x)} ${axisY}`,
            ...leftTailPoints.map((point) => `L ${xFor(point.x)} ${yFor(point.y)}`),
            `L ${xFor(leftTailPoints[leftTailPoints.length - 1].x)} ${axisY}`,
        ].join(' ')
        : null;

    return (
        <div className="rchart__null">
            <div className="rchart__null-title">{title}</div>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                {leftTailPath ? <path d={leftTailPath} className="rchart__null-tail" /> : null}
                {tailPath ? <path d={tailPath} className="rchart__null-tail" /> : null}
                <path
                    d={points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.x)} ${yFor(point.y)}`).join(' ')}
                    fill="none"
                    stroke="rgba(99,102,241,0.75)"
                    strokeWidth="2"
                />
                <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
                {twoSided ? (
                    <>
                        <line x1={xFor(-Math.abs(obs))} x2={xFor(-Math.abs(obs))} y1={18} y2={axisY} className="rchart__delta-line" />
                        <line x1={xFor(Math.abs(obs))} x2={xFor(Math.abs(obs))} y1={18} y2={axisY} className="rchart__delta-line" />
                    </>
                ) : (
                    <line x1={xFor(obs)} x2={xFor(obs)} y1={18} y2={axisY} className="rchart__delta-line" />
                )}
                <text x={width - rightPad} y={14} textAnchor="end" className="rchart__annotation-text">
                    {formatPValueLabel(pValue)}
                </text>
                <text x={width - rightPad} y={26} textAnchor="end" className="rchart__axis-text">
                    shaded tail area = p-value
                </text>
                <text x={leftPad} y={height - 6} textAnchor="start" className="rchart__axis-text">
                    {zeroLabel}
                </text>
                <text x={width - rightPad} y={height - 6} textAnchor="end" className="rchart__axis-text">
                    observed statistic = {formatNumber(obs, 3)}
                </text>
            </svg>
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

function CorrelationIntegratedViz({ scatterData, significant, pValue, xName, yName, aiAssisted = false }) {
    const observedBand = buildObservedBand(scatterData);
    if (!observedBand) return null;
    const xs = scatterData.map((point) => point.x);
    const ys = scatterData.map((point) => point.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const width = 360;
    const height = 220;
    const leftPad = 34;
    const rightPad = 16;
    const topPad = 16;
    const bottomPad = 28;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;
    const xFor = (value) => leftPad + ((value - xMin) / Math.max(1e-6, xMax - xMin)) * plotWidth;
    const yFor = (value) => topPad + plotHeight - ((value - yMin) / Math.max(1e-6, yMax - yMin)) * plotHeight;
    const linePath = (points) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.x)} ${yFor(point.y)}`).join(' ');
    const bandPath = [
        ...observedBand.high.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.x)} ${yFor(point.y)}`),
        ...[...observedBand.low].reverse().map((point) => `L ${xFor(point.x)} ${yFor(point.y)}`),
        'Z',
    ].join(' ');

    const hasPValue = Number.isFinite(Number(pValue)) && !aiAssisted;
    return (
        <div className="rchart__integrated-chart">
            <div className="rchart__chart-callouts">
                <ChartStatCallout
                    title="Correlation p-value"
                    value={hasPValue ? formatPValueLabel(pValue) : 'AI estimate'}
                    tone={significant ? 'sig' : 'ns'}
                    subtitle={hasPValue
                        ? (significant ? 'the green trend band still slopes after uncertainty is included' : 'the trend is weak once uncertainty is included')
                        : 'no computed p-value for this fitted trend'}
                />
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                <line x1={leftPad} x2={leftPad} y1={topPad} y2={height - bottomPad} className="rchart__gridline" />
                <line x1={leftPad} x2={width - rightPad} y1={height - bottomPad} y2={height - bottomPad} className="rchart__gridline" />
                <path d={bandPath} fill="rgba(16,185,129,0.14)" stroke="none" />
                {scatterData.map((point, index) => (
                    <circle key={index} cx={xFor(point.x)} cy={yFor(point.y)} r="3.2" fill="rgba(148,163,184,0.45)" />
                ))}
                <path d={linePath(observedBand.center)} fill="none" stroke={significant ? SIG_COLOR : NOT_COLOR} strokeWidth="2.4" />
                <text x={width - rightPad} y={topPad + 10} textAnchor="end" className="rchart__annotation-text">
                    fitted trend line
                </text>
                <text x={width / 2} y={height - 6} textAnchor="middle" className="rchart__axis-text">{xName}</text>
                <text x={10} y={topPad + 12} textAnchor="start" className="rchart__axis-text">{yName}</text>
                <text x={leftPad} y={height - 8} textAnchor="start" className="rchart__axis-text">{formatNumber(xMin, 0)}</text>
                <text x={width - rightPad} y={height - 8} textAnchor="end" className="rchart__axis-text">{formatNumber(xMax, 0)}</text>
                <text x={12} y={topPad + 8} textAnchor="start" className="rchart__axis-text">{formatNumber(yMax, 0)}</text>
                <text x={12} y={height - bottomPad + 4} textAnchor="start" className="rchart__axis-text">{formatNumber(yMin, 0)}</text>
            </svg>
            <div className="rchart__mini-legend">
                <span><span className="rchart__swatch rchart__swatch--observed" />colored line = fitted trend through the data</span>
                <span><span className="rchart__swatch rchart__swatch--tail" />green band = uncertainty around that fitted trend</span>
                <span><span className="rchart__swatch rchart__swatch--null" />gray points = the observed data</span>
            </div>
        </div>
    );
}

function OutlierSeverityViz({ col, pValue, significant, aiAssisted = false }) {
    const values = (col?.raw_values ?? []).map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value)).sort((a, b) => a - b);
    if (values.length < 5) return null;
    const summary = getNumericShapeSummary(col);
    if (!summary) return null;
    const iqr = summary.q3 - summary.q1;
    const lowerFence = summary.q1 - 1.5 * iqr;
    const upperFence = summary.q3 + 1.5 * iqr;
    const lowOutliers = values.filter((value) => value < lowerFence);
    const highOutliers = values.filter((value) => value > upperFence);
    const allOutliers = [...lowOutliers, ...highOutliers];
    const suspectPoint = allOutliers.length
        ? allOutliers.reduce((best, value) => (
            Math.abs(value - summary.median) > Math.abs(best - summary.median) ? value : best
        ), allOutliers[0])
        : null;
    const displayedOrdinary = values
        .filter((value) => value !== suspectPoint)
        .filter((_, index, arr) => {
            if (arr.length <= 18) return true;
            const stride = (arr.length - 1) / 17;
            const nearest = Math.round(index / stride) * stride;
            return Math.abs(index - nearest) < 0.5;
        });
    const nonOutlierValues = values.filter((value) => value >= lowerFence && value <= upperFence);
    const whiskerLow = nonOutlierValues.length ? Math.min(...nonOutlierValues) : summary.min;
    const whiskerHigh = nonOutlierValues.length ? Math.max(...nonOutlierValues) : summary.max;
    const min = Math.min(summary.min, Number.isFinite(lowerFence) ? lowerFence : summary.min);
    const max = Math.max(summary.max, Number.isFinite(upperFence) ? upperFence : summary.max);
    const width = 280;
    const height = 120;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 74;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (value) => leftPad + ((value - min) / Math.max(0.0001, max - min)) * plotWidth;
    const hasPValue = Number.isFinite(Number(pValue)) && !aiAssisted;
    const suspectX = suspectPoint != null ? xFor(suspectPoint) : null;
    const suspectLabel = suspectPoint != null
        ? `suspected outlier${allOutliers.length > 1 ? 's' : ''}`
        : '';
    const suspectAnchor = suspectX == null
        ? 'middle'
        : suspectX < leftPad + 54
            ? 'start'
            : suspectX > width - rightPad - 54
                ? 'end'
                : 'middle';
    const suspectLabelX = suspectX == null
        ? null
        : suspectAnchor === 'start'
            ? Math.max(leftPad + 4, suspectX)
            : suspectAnchor === 'end'
                ? Math.min(width - rightPad - 4, suspectX)
                : suspectX;

    return (
        <SummaryChartFrame
            chartLabel="Box-and-strip plot"
            overlay={(
                <div className="rchart__chart-callouts">
                    <ChartStatCallout
                        title="Outlier p-value"
                        value={hasPValue ? formatPValueLabel(pValue) : 'AI estimate'}
                        tone={significant ? 'sig' : 'ns'}
                        subtitle={hasPValue ? 'highlighted point marks the outlier region' : 'no computed p-value for this outlier check'}
                    />
                </div>
            )}
        >
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
            <line x1={xFor(whiskerLow)} x2={xFor(summary.q1)} y1={axisY} y2={axisY} className="rchart__whisker" />
            <line x1={xFor(summary.q3)} x2={xFor(whiskerHigh)} y1={axisY} y2={axisY} className="rchart__whisker" />
            <line x1={xFor(whiskerLow)} x2={xFor(whiskerLow)} y1={axisY - 6} y2={axisY + 6} className="rchart__whisker" />
            <line x1={xFor(whiskerHigh)} x2={xFor(whiskerHigh)} y1={axisY - 6} y2={axisY + 6} className="rchart__whisker" />
            <rect
                x={xFor(summary.q1)}
                y={axisY - 12}
                width={Math.max(8, xFor(summary.q3) - xFor(summary.q1))}
                height={24}
                rx={8}
                className="rchart__iqr-box"
            />
            <line x1={xFor(summary.median)} x2={xFor(summary.median)} y1={axisY - 12} y2={axisY + 12} className="rchart__median-line" />
            {displayedOrdinary.map((value, index) => (
                <circle
                    key={`ordinary-${value}-${index}`}
                    cx={xFor(value)}
                    cy={axisY - 20}
                    r="2.1"
                    fill="rgba(148,163,184,0.38)"
                />
            ))}
            {suspectPoint != null ? (
                <circle cx={suspectX} cy={axisY - 22} r="3.6" fill="rgba(239,68,68,0.92)" />
            ) : null}
            <text x={leftPad} y={14} textAnchor="start" className="rchart__axis-text">{col?.name ?? 'value'}</text>
            {suspectPoint != null ? (
                <text x={suspectLabelX} y={18} textAnchor={suspectAnchor} className="rchart__annotation-text">
                    {suspectLabel}
                </text>
            ) : null}
            <text x={xFor(whiskerLow)} y={height - 20} textAnchor="middle" className="rchart__axis-text">lower whisker</text>
            <text x={xFor(whiskerHigh)} y={height - 20} textAnchor="middle" className="rchart__axis-text">upper whisker</text>
            <text x={leftPad} y={height - 8} textAnchor="start" className="rchart__axis-text">{formatNumber(min, 0)}</text>
            <text x={width - rightPad} y={height - 8} textAnchor="end" className="rchart__axis-text">{formatNumber(max, 0)}</text>
            <text x={width / 2} y={height - 1} textAnchor="middle" className="rchart__axis-text">value axis</text>
        </svg>
        <div className="rchart__mini-legend">
            <span><span className="rchart__swatch rchart__swatch--flagged" />red point{allOutliers.length > 1 ? 's' : ''} = suspected outlier{allOutliers.length > 1 ? 's' : ''}</span>
            <span><span className="rchart__swatch rchart__swatch--a" />purple box = middle 50% of values</span>
            <span>{suspectPoint != null ? `gray points are a sample of the rest of the distribution; ${allOutliers.length > 1 ? 'the red points mark values beyond the whisker cutoffs.' : 'the red point marks a value beyond the whisker cutoffs.'}` : 'No point sits beyond the whisker cutoffs, so this sample does not show a clear single-point outlier.'}</span>
        </div>
        </SummaryChartFrame>
    );
}

function ScatterResultViz({ col1, col2, significant, stat, pValue, aiAssisted = false, mode = 'raw' }) {
    const scatterData = getScatterData(col1, col2);
    if (!scatterData.length) return null;

    if (mode === 'statistical') {
        return (
            <div className="rchart__panel">
                <div className="rchart__panel-copy">
                    <span className="rchart__panel-title">Statistical Evidence</span>
                    <span className="rchart__panel-subtitle">
                        The fitted trend line and its green uncertainty band show both the relationship and how confidently it differs from a flat line.
                    </span>
                </div>
                <EvidenceSummaryCard
                    title="Observed Relationship"
                    subtitle="If the green band still leans in one direction even after uncertainty is included, the relationship is easier to distinguish from chance."
                >
                    <CorrelationIntegratedViz
                        scatterData={scatterData}
                        significant={significant}
                        pValue={pValue}
                        xName={col1.name}
                        yName={col2.name}
                        aiAssisted={aiAssisted}
                    />
                </EvidenceSummaryCard>
                <div className="rchart__chart-note">
                    <span>{col1.name}</span>
                    <span className="ichart__vs">vs</span>
                    <span>{col2.name}</span>
                    <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                        r = {formatNumber(stat, 3)}
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
                    This view shows the raw point cloud only, so you can judge the relationship without the test overlay.
                </span>
            </div>
            <SummaryChartFrame chartLabel="Scatter plot">
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
                        <Scatter data={scatterData} fill="#94a3b8" opacity={0.45} r={2.2} />
                    </ScatterChart>
                </ResponsiveContainer>
            </SummaryChartFrame>
            <div className="rchart__chart-note">
                <span>{col1.name}</span>
                <span className="ichart__vs">vs</span>
                <span>{col2.name}</span>
            </div>
        </div>
    );
}

function GroupDifferenceViz({ catCol, numCol, significant, pValue, evidence, stat, aiAssisted = false, mode = 'raw' }) {
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
                            ? 'Each row shows one pairwise gap. The dot marks the estimated gap, and the line shows the likely range for that gap.'
                            : 'The dot marks the estimated gap, and the line shows the likely range for that gap.'}
                    </span>
                </div>
                <EvidenceSummaryCard
                    title={isOverallScope ? 'Average Score Gaps Between Groups' : 'Difference Between Group Means'}
                    subtitle={isOverallScope
                        ? 'Rows that stay entirely on one side of 0 indicate average-score gaps that are distinguishable from no difference.'
                        : 'If the interval stays away from 0, the two groups differ in average score.'}
                >
                    {isOverallScope
                        ? (
                            <PairwiseForestViz
                                summary={summary}
                                pValue={pValue}
                                significant={significant}
                                effectSizeLabel={evidence?.details?.effectSizeLabel}
                                effectSizeValue={evidence?.details?.effectSizeValue}
                            />
                        )
                        : <PairwiseDifferenceViz evidence={evidence} significant={significant} />}
                </EvidenceSummaryCard>
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
    const hasOutlierBins = fence != null && data.some((bin) => bin?.x0 >= fence);
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
                {markOutliers && hasOutlierBins ? <span className="ichart__outlier-note">red = beyond Q3+1.5×IQR</span> : null}
            </div>
        </div>
    );
}

function ChiSquareEvidenceViz({ col1, col2, significant, mode = 'raw', resultEvidence, aiAssisted = false, pValue = null }) {
    const contingency = getContingencyEvidence(col1, col2);
    if (!contingency) return null;

    const { rows, cols, cells } = contingency;
    const hasPValue = Number.isFinite(Number(pValue)) && !aiAssisted;
    const palette = ['#10b981', '#6366f1', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6'];
    const chartData = rows.map((rowName) => {
        const row = { row: rowName };
        cols.forEach((colName) => {
            const cell = cells.find((entry) => entry.row === rowName && entry.col === colName);
            row[colName] = cell?.observed ?? 0;
        });
        return row;
    });

    return (
        <div className="rchart__panel">
            <div className="rchart__panel-copy">
                <span className="rchart__panel-title">Statistical Evidence</span>
                <span className="rchart__panel-subtitle">
                    Grouped bars show the observed counts for each category combination. Large pattern differences across these bars support a smaller p-value.
                </span>
            </div>
            <SummaryChartFrame
                chartLabel="Grouped bar chart"
                overlay={(
                    <div className="rchart__chart-callouts">
                        <ChartStatCallout
                            title="Chi-square p-value"
                            value={hasPValue ? formatPValueLabel(pValue) : 'AI estimate'}
                            tone={significant ? 'sig' : 'ns'}
                            subtitle={hasPValue ? 'bigger mismatches across the grouped bars support a smaller p-value' : 'no computed p-value for this association check'}
                        />
                    </div>
                )}
            >
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 26, left: 2 }} barCategoryGap="16%">
                        <XAxis dataKey="row" tick={TICK} />
                        <YAxis tick={TICK} label={{ value: 'Observed count', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 9 }} />
                        <Tooltip
                            contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                            formatter={(v, key) => [v, key]}
                            labelFormatter={(label) => `${col1.name}: ${label}`}
                        />
                        <Legend wrapperStyle={{ fontSize: 9, color: '#64748b' }} />
                        {cols.map((colName, index) => (
                            <Bar
                                key={colName}
                                dataKey={colName}
                                name={`${col2.name}: ${colName}`}
                                fill={palette[index % palette.length]}
                                radius={[3, 3, 0, 0]}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </SummaryChartFrame>
            {resultEvidence?.details?.effectSizeValue != null && (
                <EffectSizeMeter
                    label={resultEvidence?.details?.effectSizeLabel ?? "Cramer's V"}
                    value={resultEvidence?.details?.effectSizeValue}
                    kind="cramersV"
                />
            )}
            <div className="rchart__mini-legend">
                <span>Each group of bars is one {col1.name} category.</span>
                <span>Different colored bars within a group are the observed counts for {col2.name}.</span>
                <span>If the bar pattern changes a lot from one {col1.name} category to another, the p-value gets smaller.</span>
            </div>
            <div className="rchart__chart-note">
                <span>{col1.name}</span>
                <span className="ichart__vs">×</span>
                <span>{col2.name}</span>
                <span className={`rchart__effect-pill ${significant ? 'rchart__effect-pill--sig' : 'rchart__effect-pill--ns'}`}>
                    observed counts by category
                </span>
            </div>
        </div>
    );
}

// ── Group mean delta (CI vs zero) — the p-value visual for group comparison ───

function GroupMeanDeltaViz({ summary, significant, pValue, numColName = 'value' }) {
    if (!summary || summary.length !== 2) return null;
    const [a, b] = summary;
    const diff = b.mean - a.mean;
    const se = Math.sqrt(
        (a.std * a.std) / Math.max(1, a.count) +
        (b.std * b.std) / Math.max(1, b.count)
    );
    const low = diff - 1.96 * se;
    const high = diff + 1.96 * se;

    const vals = [low, high, diff, 0];
    const dMin = Math.min(...vals);
    const dMax = Math.max(...vals);
    const pad = Math.max(0.2, (dMax - dMin) * 0.2 || 1);
    const domainMin = dMin - pad;
    const domainMax = dMax + pad;
    const width = 280;
    const height = 90;
    const leftPad = 18;
    const rightPad = 18;
    const axisY = 40;
    const plotWidth = width - leftPad - rightPad;
    const xFor = (v) => leftPad + ((v - domainMin) / Math.max(0.0001, domainMax - domainMin)) * plotWidth;
    const color = significant ? SIG_COLOR : NOT_COLOR;
    const ciCrossesZero = low <= 0 && high >= 0;

    return (
        <SummaryChartFrame
            chartLabel="Confidence interval plot"
            overlay={(
                <div className="rchart__chart-callouts">
                    {Number.isFinite(Number(pValue)) ? (
                        <ChartStatCallout
                            title="P-value"
                            value={formatPValueLabel(pValue)}
                            tone={significant ? 'sig' : 'ns'}
                            subtitle={ciCrossesZero ? 'the interval still touches the no-gap line' : 'the interval stays away from the no-gap line'}
                        />
                    ) : null}
                </div>
            )}
        >
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                <line x1={leftPad} x2={width - rightPad} y1={axisY} y2={axisY} className="rchart__gridline" />
                <line x1={xFor(0)} x2={xFor(0)} y1={14} y2={axisY + 10} className="rchart__zero-line" />
                <line x1={xFor(low)} x2={xFor(high)} y1={axisY} y2={axisY} className="rchart__delta-line" />
                <line x1={xFor(low)} x2={xFor(low)} y1={axisY - 8} y2={axisY + 8} className="rchart__delta-cap" />
                <line x1={xFor(high)} x2={xFor(high)} y1={axisY - 8} y2={axisY + 8} className="rchart__delta-cap" />
                <circle cx={xFor(diff)} cy={axisY} r="4.5" fill={color} />
                <text x={xFor(diff)} y={12} textAnchor="middle" className="rchart__annotation-text">
                    average score gap = {formatNumber(diff, 2)}
                </text>
                <text x={leftPad} y={height - 9} textAnchor="start" className="rchart__axis-text">{formatNumber(domainMin, 1)}</text>
                <text x={xFor(0)} y={height - 9} textAnchor="middle" className="rchart__axis-text">0 = no gap</text>
                <text x={width - rightPad} y={height - 9} textAnchor="end" className="rchart__axis-text">{formatNumber(domainMax, 1)}</text>
                <text x={width / 2} y={height - 1} textAnchor="middle" className="rchart__axis-text">
                    difference in {numColName}
                </text>
            </svg>
            <div className="rchart__mini-legend">
                <span><span className="rchart__swatch rchart__swatch--observed" />green dot = observed difference between the two group averages</span>
                <span><span className="rchart__swatch rchart__swatch--tail" />green line = 95% confidence interval ({formatNumber(low, 2)} to {formatNumber(high, 2)})</span>
                <span>{ciCrossesZero ? 'Because the interval crosses 0, the difference is still uncertain.' : 'Because the interval stays away from 0, the difference is statistically reliable.'}</span>
            </div>
        </SummaryChartFrame>
    );
}

// ── All-group CI forest plot — p-value visual for multi-group comparison ────────

function GroupAllMeansCIViz({ summary, significant, pValue, numColName = 'value' }) {
    if (!summary || summary.length < 2) return null;
    const color = significant ? SIG_COLOR : NOT_COLOR;
    const allVals = summary.flatMap((g) => [g.ciLow, g.ciHigh, g.mean]);
    const dMin = Math.min(...allVals);
    const dMax = Math.max(...allVals);
    const rangePad = Math.max((dMax - dMin) * 0.15, 0.5);
    const domainMin = dMin - rangePad;
    const domainMax = dMax + rangePad;
    const svgWidth = 300;
    const rowH = 26;
    const topPad = 22;
    const bottomPad = 18;
    const leftPad = 64;
    const rightPad = 12;
    const plotWidth = svgWidth - leftPad - rightPad;
    const svgHeight = topPad + summary.length * rowH + bottomPad;
    const xFor = (v) => leftPad + ((v - domainMin) / Math.max(0.0001, domainMax - domainMin)) * plotWidth;
    const yFor = (i) => topPad + i * rowH + rowH / 2;

    return (
        <SummaryChartFrame
            chartLabel="Group means interval plot"
            overlay={(
                <div className="rchart__chart-callouts">
                    {Number.isFinite(Number(pValue)) ? (
                        <ChartStatCallout
                            title="Overall p-value"
                            value={formatPValueLabel(pValue)}
                            tone={significant ? 'sig' : 'ns'}
                            subtitle={significant ? 'at least one group differs' : 'overall gap is not clear'}
                        />
                    ) : null}
                </div>
            )}
        >
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
            {summary.map((g, i) => {
                const y = yFor(i);
                const gLabel = String(g.name).length > 9 ? `${String(g.name).slice(0, 8)}…` : String(g.name);
                return (
                    <g key={g.name}>
                        <text x={leftPad - 6} y={y + 4} textAnchor="end" className="rchart__axis-text">{gLabel}</text>
                        <line x1={xFor(g.ciLow)} x2={xFor(g.ciHigh)} y1={y} y2={y}
                            stroke={color} strokeWidth={2} opacity={0.7} />
                        <line x1={xFor(g.ciLow)} x2={xFor(g.ciLow)} y1={y - 5} y2={y + 5}
                            stroke={color} strokeWidth={1.5} />
                        <line x1={xFor(g.ciHigh)} x2={xFor(g.ciHigh)} y1={y - 5} y2={y + 5}
                            stroke={color} strokeWidth={1.5} />
                        <circle cx={xFor(g.mean)} cy={y} r={4} fill={color} />
                        <text x={xFor(g.mean)} y={y - 7} textAnchor="middle" className="rchart__axis-text">
                            {formatNumber(g.mean, 1)}
                        </text>
                    </g>
                );
            })}
            <line
                x1={leftPad} x2={svgWidth - rightPad}
                y1={topPad + summary.length * rowH + 2}
                y2={topPad + summary.length * rowH + 2}
                className="rchart__gridline"
            />
            <text x={(leftPad + svgWidth - rightPad) / 2} y={svgHeight - 3} textAnchor="middle" className="rchart__axis-text">
                95% CI for {numColName} in each group
            </text>
        </svg>
        <div className="rchart__mini-legend">
            <span><span className="rchart__swatch rchart__swatch--observed" />green dot = group average</span>
            <span><span className="rchart__swatch rchart__swatch--tail" />green line = 95% confidence interval</span>
            <span>If two groups sit clearly apart on this axis, the evidence for a real difference is stronger.</span>
        </div>
        </SummaryChartFrame>
    );
}

// ── Group box / jitter plot with significance annotation ──────────────────────

function GroupBoxJitterViz({ catCol, numCol, significant, pValue, aiAssisted, pairwiseComparisons = [] }) {
    const summary = getGroupDistributionSummary(catCol, numCol);
    const points = getGroupPointData(catCol, numCol, 32, 6);
    if (!summary.length || !points.length) return null;

    const color = significant ? SIG_COLOR : NOT_COLOR;
    const width = Math.max(280, 80 + summary.length * 72);
    const extraBracketRows = summary.length === 2 ? 1 : 0;
    const bracketSpace = extraBracketRows ? 18 + extraBracketRows * 16 : 0;
    const height = 210 + bracketSpace;
    const leftPad = 42;
    const rightPad = 18;
    const topPad = 36 + bracketSpace;
    const bottomPad = 52;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;
    const yMin = Math.min(...summary.map((g) => g.min));
    const yMax = Math.max(...summary.map((g) => g.max));
    const yFor = (value) => topPad + plotHeight - ((value - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
    const compactWidth = Math.min(plotWidth, summary.length === 2 ? 150 : 210);
    const compactStart = leftPad + (plotWidth - compactWidth) / 2;
    const xForGroup = (index) => compactStart + compactWidth * (summary.length === 1 ? 0.5 : index / Math.max(1, summary.length - 1));
    const boxWidth = Math.min(34, compactWidth / Math.max(2, summary.length * 1.9));
    const ticks = Array.from({ length: 4 }, (_, i) => {
        const value = yMin + ((yMax - yMin) * i) / 3;
        return { value, y: yFor(value) };
    });
    const pairwiseOnly = summary.length === 2;
    const hasPValue = Number.isFinite(Number(pValue)) && !aiAssisted;
    const renderBracket = (startIndex, endIndex, y, label) => {
        const x1 = xForGroup(startIndex);
        const x2 = xForGroup(endIndex);
        return (
            <g key={`${startIndex}-${endIndex}-${label}`}>
                <line x1={x1} x2={x1} y1={y} y2={y + 8} className="rchart__delta-line" />
                <line x1={x2} x2={x2} y1={y} y2={y + 8} className="rchart__delta-line" />
                <line x1={x1} x2={x2} y1={y} y2={y} className="rchart__delta-line" />
                <text x={(x1 + x2) / 2} y={y - 4} textAnchor="middle" className="rchart__annotation-text">
                    {label}
                </text>
            </g>
        );
    };

    return (
        <SummaryChartFrame
            chartLabel="Box-and-jitter plot"
            overlay={(
                <div className="rchart__chart-callouts">
                    <ChartStatCallout
                        title={pairwiseOnly ? 'Welch p-value' : 'ANOVA p-value'}
                        value={hasPValue ? formatPValueLabel(pValue) : 'AI estimate'}
                        tone={significant ? 'sig' : 'ns'}
                        subtitle={pairwiseOnly
                            ? (hasPValue ? 'shown by the bracket over the two groups' : 'no computed p-value for this comparison')
                            : (hasPValue ? 'overall difference across groups' : 'no computed p-value for this comparison')}
                    />
                </div>
            )}
        >
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rchart__summary-svg">
                {ticks.map((tick) => (
                    <g key={tick.y}>
                        <line x1={leftPad} x2={width - rightPad} y1={tick.y} y2={tick.y} className="rchart__gridline" />
                        <text x={leftPad - 6} y={tick.y + 3} textAnchor="end" className="rchart__axis-text">
                            {formatNumber(tick.value, 1)}
                        </text>
                    </g>
                ))}
                <text x={12} y={topPad - 10} textAnchor="start" className="rchart__axis-text">{numCol.name}</text>
                {summary.map((group, index) => {
                    const x = xForGroup(index);
                    const groupPoints = points.filter((point) => point.group === group.name);
                    return (
                        <g key={group.name}>
                            <line x1={x} x2={x} y1={yFor(group.min)} y2={yFor(group.max)} className="rchart__whisker" />
                            <rect
                                x={x - boxWidth / 2}
                                y={yFor(group.q3)}
                                width={boxWidth}
                                height={Math.max(8, yFor(group.q1) - yFor(group.q3))}
                                rx={8}
                                className="rchart__iqr-box"
                            />
                            <line x1={x - boxWidth / 2} x2={x + boxWidth / 2} y1={yFor(group.median)} y2={yFor(group.median)} className="rchart__median-line" />
                            <line x1={x - 10} x2={x + 10} y1={yFor(group.min)} y2={yFor(group.min)} className="rchart__whisker" />
                            <line x1={x - 10} x2={x + 10} y1={yFor(group.max)} y2={yFor(group.max)} className="rchart__whisker" />
                            {groupPoints.map((point, idx) => (
                                <circle
                                    key={`${group.name}-${idx}`}
                                    cx={x + point.jitterX * 16}
                                    cy={yFor(point.value)}
                                    r="2.1"
                                    fill="rgba(148,163,184,0.52)"
                                />
                            ))}
                            <circle cx={x} cy={yFor(group.mean)} r="4.2" fill={color} />
                            <text x={x} y={yFor(group.mean) - 8} textAnchor="middle" className="rchart__annotation-text">
                                {formatNumber(group.mean, 1)}
                            </text>
                            <text x={x} y={height - 18} textAnchor="middle" className="rchart__axis-text">{group.name}</text>
                        </g>
                    );
                })}
                {pairwiseOnly && (
                    renderBracket(0, 1, topPad - 18, hasPValue ? formatPValueLabel(pValue) : 'AI estimate')
                )}
            </svg>
            <div className="rchart__mini-legend">
                <span><span className="rchart__swatch rchart__swatch--observed" />green dot = group average</span>
                <span><span className="rchart__swatch rchart__swatch--a" />purple box = middle 50% of scores</span>
                <span>{pairwiseOnly ? 'top bracket = the p-value for the group comparison' : 'pairwise p-values are listed in the comparison rows below this chart'}</span>
                <span>gray dots = individual observations, jittered sideways so they do not overlap</span>
            </div>
        </SummaryChartFrame>
    );
}

// ── Grouped bars with 95% CI + p-value strip ─────────────────────────────────

function GroupedBarResultViz({ catCol, numCol, significant, pValue, aiAssisted, pairwiseComparisons = [] }) {
    const summary = getGroupDistributionSummary(catCol, numCol);
    if (!summary.length) return null;
    const isPairwise = summary.length === 2;
    const canShowPValueViz = shouldRenderInlinePValue({ pValue, aiAssisted });
    const significantPairwise = pairwiseComparisons.filter((pair) => pair?.significant);

    return (
        <div className="rchart__integrated-chart">
            <GroupBoxJitterViz
                catCol={catCol}
                numCol={numCol}
                significant={significant}
                pValue={pValue}
                aiAssisted={aiAssisted}
                pairwiseComparisons={pairwiseComparisons}
            />
            <div className="rchart__chart-note">
                <span>{catCol.name}</span>
                <span className="ichart__vs">→</span>
                <span>{numCol.name}</span>
            </div>
            {canShowPValueViz && isPairwise && <GroupMeanDeltaViz summary={summary} significant={significant} pValue={pValue} numColName={numCol.name} />}
            {canShowPValueViz && !isPairwise && significantPairwise.length > 0 && (
                <EvidenceSummaryCard
                    title="Pairwise mean differences"
                    subtitle="Each row compares two groups directly. If the interval stays on one side of 0, that pair is statistically different."
                >
                    <PairwiseForestViz pairwiseComparisons={pairwiseComparisons} numColName={numCol.name} />
                </EvidenceSummaryCard>
            )}
            {canShowPValueViz && !isPairwise && !significantPairwise.length && (
                <div className="rchart__mini-legend">
                    <span>{formatPValueLabel(pValue)} applies to the overall multi-group test.</span>
                    <span>This box-and-jitter plot shows each group’s spread; none of the stored pairwise comparisons are strong enough to label individually.</span>
                </div>
            )}
        </div>
    );
}

// ── Histogram + Q-Q reference cue — the p-value visual for distribution shape ─

function HistogramWithReferenceCue({ col, pValue, significant, aiAssisted }) {
    return (
        <div className="rchart__integrated-chart">
            <QQReferenceViz col={col} pValue={pValue} significant={significant} aiAssisted={aiAssisted} />
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
    narrative = null,
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
    const baseInterpretation = buildResultInterpretation({
        evidence: resolvedEvidence,
        method,
        significant,
        aiAssisted,
    });
    const interpretation = buildVisualInterpretationOverride({
        interpretation: baseInterpretation,
        evidence: resolvedEvidence,
        numeric,
        aiAssisted,
    });
    const narrativeLinesByKind = (() => {
        if (resolvedEvidence.kind === EVIDENCE_KINDS.TREND && numeric.length >= 2) {
            return buildTrendGrammar({
                col1: numeric[0],
                col2: numeric[1],
                pValue,
                aiAssisted,
                scatterData: getScatterData(numeric[0], numeric[1]),
            });
        }
        if (resolvedEvidence.kind === EVIDENCE_KINDS.GROUP_COMPARISON && categorical[0] && numeric[0]) {
            const summary = getGroupDistributionSummary(categorical[0], numeric[0]);
            const isOverallScope = resolvedEvidence?.details?.scope === 'overall_multi_group' || summary.length > 2;
            return isOverallScope
                ? buildOverallGroupGrammar({ summary, evidence: resolvedEvidence, pValue, aiAssisted })
                : buildPairwiseGrammar({ summary, evidence: resolvedEvidence, pValue, aiAssisted });
        }
        if (resolvedEvidence.kind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION && categorical.length >= 2) {
            return buildChiSquareGrammar({
                contingency: getContingencyEvidence(categorical[0], categorical[1]),
                resultEvidence: resolvedEvidence,
                pValue,
                aiAssisted,
            });
        }
        if (resolvedEvidence.kind === EVIDENCE_KINDS.DISTRIBUTION_SHAPE && numeric[0]) {
            return buildDistributionGrammar({ col: numeric[0], pValue, aiAssisted });
        }
        if (resolvedEvidence.kind === EVIDENCE_KINDS.OUTLIER_SIGNAL && numeric[0]) {
            return buildOutlierSummary({ col: numeric[0], aiAssisted });
        }
        return [];
    })();
    const narrativeLines = resolveNarrativeLines(narrative, narrativeLinesByKind);
    const sigBadge = significant
        ? <span className="ichart__sig-badge ichart__sig-badge--yes">significant</span>
        : <span className="ichart__sig-badge ichart__sig-badge--no">not significant</span>;
    const aiBadge = aiAssisted
        ? <span className="ichart__sig-badge ichart__sig-badge--ai">AI estimate</span>
        : null;

    let mainChart = null;
    let label = null;
    const chanceCopy = buildChanceCopy({
        pValue,
        aiAssisted,
        evidenceKind: resolvedEvidence.kind,
    });

    if (resolvedEvidence.kind === EVIDENCE_KINDS.TREND && numeric.length >= 2) {
        mainChart = <ScatterResultViz col1={numeric[0]} col2={numeric[1]} significant={significant} stat={stat} pValue={pValue} aiAssisted={aiAssisted} mode="statistical" />;
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
        mainChart = (
            <GroupedBarResultViz
                catCol={categorical[0]}
                numCol={numeric[0]}
                significant={significant}
                pValue={pValue}
                aiAssisted={aiAssisted}
                pairwiseComparisons={resolvedEvidence?.details?.pairwiseComparisons ?? []}
            />
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
        mainChart = <ChiSquareEvidenceViz col1={categorical[0]} col2={categorical[1]} significant={significant} mode="statistical" resultEvidence={resolvedEvidence} aiAssisted={aiAssisted} pValue={pValue} />;
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
        mainChart = (
            <HistogramWithReferenceCue
                col={numeric[0]}
                pValue={pValue}
                significant={significant}
                aiAssisted={aiAssisted}
            />
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{numeric[0].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    } else if (resolvedEvidence.kind === EVIDENCE_KINDS.OUTLIER_SIGNAL && numeric[0]) {
        mainChart = (
            <OutlierSeverityViz
                col={numeric[0]}
                pValue={pValue}
                significant={significant}
                aiAssisted={aiAssisted}
            />
        );
        label = (
            <div className="ichart__axis-labels">
                <span>{numeric[0].name}</span>
                {aiBadge}
                {sigBadge}
            </div>
        );
    }

    if (!mainChart) return null;

    return (
        <div className="ichart ichart--result nodrag">
            <VerdictSummary
                interpretation={interpretation}
                significant={significant}
                aiAssisted={aiAssisted}
                narrativeLines={narrativeLines}
            />
            <MainChartBlock chanceCopy={chanceCopy}>
                {mainChart}
            </MainChartBlock>
            <details className="rchart__details">
                <summary>Test details</summary>
                <div className="rchart__details-body">
                    <div className="ichart__axis-labels">
                        <span>{method || resolvedEvidence?.details?.statLabel || 'test'}</span>
                        {stat != null ? <span>stat = {formatNumber(stat, 3)}</span> : null}
                        {Number.isFinite(Number(pValue)) ? <span>{formatPValueLabel(pValue)}</span> : null}
                    </div>
                    <ResultEvidenceHeader evidence={resolvedEvidence} />
                    <div className="ichart__axis-labels">
                        {label?.props?.children}
                    </div>
                </div>
            </details>
        </div>
    );
}

export default ResultChart;
