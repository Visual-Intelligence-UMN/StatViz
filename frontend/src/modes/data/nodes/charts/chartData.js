/**
 * chartData.js — Pure data-preparation helpers for insight/result charts.
 * No React, no side effects — just transforms spec columns into chart-ready arrays.
 */

/** Find numeric and categorical columns by name from spec */
export function findCols(spec, colNames) {
    const cols = colNames
        .map((n) => spec.columns.find((c) => c.name === n))
        .filter(Boolean);
    const numeric     = cols.filter((c) => c.type === 'numeric');
    const categorical = cols.filter((c) => c.type !== 'numeric');
    return { cols, numeric, categorical };
}

function toNumericValues(col) {
    return (col?.raw_values ?? [])
        .map((value) => parseFloat(value))
        .filter((value) => !Number.isNaN(value));
}

function sortedUniqueNumericValues(col) {
    return [...new Set(toNumericValues(col))].sort((a, b) => a - b);
}

function getFrequencyMap(values) {
    const freq = new Map();
    values.forEach((value) => {
        freq.set(value, (freq.get(value) ?? 0) + 1);
    });
    return freq;
}

function gapVariation(values) {
    if (values.length < 3) return { meanGap: null, cv: Infinity };
    const gaps = values.slice(1).map((value, index) => value - values[index]);
    const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    if (meanGap <= 0) return { meanGap, cv: Infinity };
    const variance = gaps.reduce((sum, gap) => sum + (gap - meanGap) ** 2, 0) / gaps.length;
    return {
        meanGap,
        cv: Math.sqrt(variance) / meanGap,
    };
}

/**
 * Returns true when a numeric column behaves like a sequential record key
 * rather than a measured variable. This is intentionally based on the value
 * distribution, not on the column name.
 */
export function isIdentifierLikeColumn(col) {
    if (!col || col.type !== 'numeric') return false;

    const numericValues = toNumericValues(col);
    const rowCount = numericValues.length;
    if (rowCount < 8 || col.unique_count == null) return false;

    const values = sortedUniqueNumericValues(col);
    if (values.length < 8) return false;

    const { meanGap, cv } = gapVariation(values);
    if (!Number.isFinite(meanGap) || meanGap <= 0) return false;

    const span = values[values.length - 1] - values[0];
    if (span <= 0) return false;

    const expectedSpan = meanGap * (values.length - 1);
    const spanConsistency = Math.abs(expectedSpan - span) / span;

    const looksSequential = cv <= 0.02 && spanConsistency <= 0.02;
    if (!looksSequential) return false;

    const uniqueRatio = values.length / rowCount;
    if (uniqueRatio >= 0.95) return true;

    const frequencies = [...getFrequencyMap(numericValues).values()];
    const meanFrequency = frequencies.reduce((sum, count) => sum + count, 0) / frequencies.length;
    if (!Number.isFinite(meanFrequency) || meanFrequency <= 1) return false;

    const frequencyVariance = frequencies.reduce(
        (sum, count) => sum + (count - meanFrequency) ** 2,
        0
    ) / frequencies.length;
    const frequencyCv = Math.sqrt(frequencyVariance) / meanFrequency;

    return uniqueRatio >= 0.2 && frequencyCv <= 0.05;
}

export function isVisualizableSummaryColumn(col) {
    if (!col) return false;
    if (col.type === 'numeric') return !isIdentifierLikeColumn(col);
    return true;
}

/** Scatter plot data — subsample to maxPoints for perf */
export function getScatterData(col1, col2, maxPoints = 250) {
    const out = [];
    const n   = Math.min(col1.raw_values.length, col2.raw_values.length);
    for (let i = 0; i < n; i++) {
        const x = parseFloat(col1.raw_values[i]);
        const y = parseFloat(col2.raw_values[i]);
        if (!isNaN(x) && !isNaN(y)) out.push({ x, y });
    }
    if (out.length <= maxPoints) return out;
    const step = out.length / maxPoints;
    return Array.from({ length: maxPoints }, (_, i) => out[Math.floor(i * step)]);
}

/** Histogram data from pre-computed bins */
export function getHistogramData(col) {
    return (col.histogram ?? []).map((b) => ({
        name:  b.x0.toFixed(1),
        count: b.count,
        x0:    b.x0,
        x1:    b.x1,
    }));
}

/** Mean-per-group bar data with std deviation for error bars */
export function getGroupBarData(catCol, numCol, maxGroups = 7) {
    const groups = {};
    const n = Math.min(catCol.raw_values.length, numCol.raw_values.length);
    for (let i = 0; i < n; i++) {
        const g = catCol.raw_values[i];
        const v = parseFloat(numCol.raw_values[i]);
        if (!g || isNaN(v)) continue;
        if (!groups[g]) groups[g] = { vals: [] };
        groups[g].vals.push(v);
    }
    return Object.entries(groups)
        .map(([name, { vals }]) => {
            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
            const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
            const std = Math.sqrt(variance);
            return { name, mean: +mean.toFixed(2), std: +std.toFixed(2), count: vals.length };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, maxGroups);
}

/** Raw point data for grouped numeric comparisons, with deterministic jitter */
export function getGroupPointData(catCol, numCol, maxPointsPerGroup = 40, limitGroups = 2) {
    const groups = new Map();
    const orderedGroups = [];
    const n = Math.min(catCol.raw_values.length, numCol.raw_values.length);

    for (let i = 0; i < n; i++) {
        const group = String(catCol.raw_values[i] ?? '').trim();
        const value = parseFloat(numCol.raw_values[i]);
        if (!group || isNaN(value)) continue;

        if (!groups.has(group)) {
            groups.set(group, []);
            orderedGroups.push(group);
        }
        groups.get(group).push(value);
    }

    const selectedGroups = orderedGroups.slice(0, limitGroups);
    return selectedGroups.flatMap((groupName, groupIndex) => {
        const vals = groups.get(groupName) ?? [];
        const step = vals.length > maxPointsPerGroup ? vals.length / maxPointsPerGroup : 1;
        const sampled = vals.length > maxPointsPerGroup
            ? Array.from({ length: maxPointsPerGroup }, (_, i) => vals[Math.floor(i * step)])
            : vals;

        return sampled.map((value, pointIndex) => {
            const jitterSeed = ((pointIndex % 9) - 4) / 28;
            return {
                group: groupName,
                groupIndex,
                value: +value.toFixed(4),
                jitterX: +(groupIndex + jitterSeed).toFixed(4),
            };
        });
    });
}

/** Summary stats for the first N groups used in the numeric group comparison result view */
export function getGroupComparisonSummary(catCol, numCol, limitGroups = 2) {
    const groups = new Map();
    const orderedGroups = [];
    const n = Math.min(catCol.raw_values.length, numCol.raw_values.length);

    for (let i = 0; i < n; i++) {
        const group = String(catCol.raw_values[i] ?? '').trim();
        const value = parseFloat(numCol.raw_values[i]);
        if (!group || isNaN(value)) continue;

        if (!groups.has(group)) {
            groups.set(group, []);
            orderedGroups.push(group);
        }
        groups.get(group).push(value);
    }

    return orderedGroups.slice(0, limitGroups).map((group) => {
        const vals = groups.get(group) ?? [];
        const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
        const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
        return {
            name: group,
            mean: +mean.toFixed(3),
            std: +Math.sqrt(variance).toFixed(3),
            count: vals.length,
        };
    });
}

function quantile(sortedVals, q) {
    if (!sortedVals.length) return null;
    if (sortedVals.length === 1) return sortedVals[0];
    const pos = (sortedVals.length - 1) * q;
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    if (lower === upper) return sortedVals[lower];
    const weight = pos - lower;
    return sortedVals[lower] * (1 - weight) + sortedVals[upper] * weight;
}

/** Richer summary for 2-group comparison visuals: quartiles, CI, and overlap cues */
export function getGroupDistributionSummary(catCol, numCol, limitGroups = 2) {
    const groups = new Map();
    const orderedGroups = [];
    const n = Math.min(catCol.raw_values.length, numCol.raw_values.length);

    for (let i = 0; i < n; i++) {
        const group = String(catCol.raw_values[i] ?? '').trim();
        const value = parseFloat(numCol.raw_values[i]);
        if (!group || isNaN(value)) continue;
        if (!groups.has(group)) {
            groups.set(group, []);
            orderedGroups.push(group);
        }
        groups.get(group).push(value);
    }

    return orderedGroups.slice(0, limitGroups).map((group) => {
        const vals = [...(groups.get(group) ?? [])].sort((a, b) => a - b);
        if (!vals.length) return null;
        const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
        const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
        const std = Math.sqrt(variance);
        const se = vals.length > 0 ? std / Math.sqrt(vals.length) : 0;
        const ciHalf = 1.96 * se;

        return {
            name: group,
            count: vals.length,
            mean: +mean.toFixed(3),
            std: +std.toFixed(3),
            min: +vals[0].toFixed(3),
            q1: +quantile(vals, 0.25).toFixed(3),
            median: +quantile(vals, 0.5).toFixed(3),
            q3: +quantile(vals, 0.75).toFixed(3),
            max: +vals[vals.length - 1].toFixed(3),
            ciLow: +(mean - ciHalf).toFixed(3),
            ciHigh: +(mean + ciHalf).toFixed(3),
        };
    }).filter(Boolean);
}

export function getIqrOverlapSummary(groupSummary) {
    if (!groupSummary || groupSummary.length < 2) return null;
    const [a, b] = groupSummary;
    const overlap = Math.max(0, Math.min(a.q3, b.q3) - Math.max(a.q1, b.q1));
    const minIqr = Math.max(0.0001, Math.min(a.q3 - a.q1, b.q3 - b.q1));
    const ratio = overlap / minIqr;

    let label = 'little overlap';
    if (ratio >= 0.8) label = 'substantial overlap';
    else if (ratio >= 0.35) label = 'moderate overlap';

    return {
        ratio: +ratio.toFixed(3),
        label,
        overlap: +overlap.toFixed(3),
    };
}

/** Pairwise Pearson r matrix for all numeric columns */
export function getCorrelationMatrix(spec) {
    const numCols = spec.columns.filter(
        (c) => c.type === 'numeric' && c.raw_values?.length && !isIdentifierLikeColumn(c)
    );
    if (numCols.length < 2) return null;

    const pearson = (a, b) => {
        const n   = Math.min(a.length, b.length);
        const xs  = a.slice(0, n).map(Number).filter((v, i) => !isNaN(v) && !isNaN(Number(b[i])));
        const ys  = b.slice(0, n).map(Number).filter((v, i) => !isNaN(v) && !isNaN(Number(a[i])));
        const len = Math.min(xs.length, ys.length);
        if (len < 3) return 0;
        const mx = xs.reduce((s, v) => s + v, 0) / len;
        const my = ys.reduce((s, v) => s + v, 0) / len;
        let num = 0, dx2 = 0, dy2 = 0;
        for (let i = 0; i < len; i++) {
            const dx = xs[i] - mx, dy = ys[i] - my;
            num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
        }
        return dx2 && dy2 ? +(num / Math.sqrt(dx2 * dy2)).toFixed(3) : 0;
    };

    const matrix = numCols.map((row) =>
        numCols.map((col) => (row.name === col.name ? 1 : pearson(row.raw_values, col.raw_values)))
    );
    return { cols: numCols.map((c) => c.name), matrix };
}

/** Outlier fence: Q3 + 1.5 * IQR */
export function getOutlierFence(col) {
    const { q1, q3 } = col.stats ?? {};
    if (q1 == null || q3 == null) return null;
    return +(q3 + 1.5 * (q3 - q1)).toFixed(4);
}

/** Linear regression line — returns 30 evenly spaced {x, y} points */
export function getRegressionLine(scatterData) {
    const n = scatterData.length;
    if (n < 3) return null;
    const sumX  = scatterData.reduce((s, p) => s + p.x, 0);
    const sumY  = scatterData.reduce((s, p) => s + p.y, 0);
    const sumXY = scatterData.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = scatterData.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const m    = (n * sumXY - sumX * sumY) / denom;
    const b    = (sumY - m * sumX) / n;
    const xMin = Math.min(...scatterData.map((p) => p.x));
    const xMax = Math.max(...scatterData.map((p) => p.x));
    return Array.from({ length: 30 }, (_, i) => {
        const x = xMin + (i / 29) * (xMax - xMin);
        return { x: +x.toFixed(4), y: +(m * x + b).toFixed(4) };
    });
}

/** Contingency-table evidence for chi-square style result charts */
export function getContingencyEvidence(col1, col2, maxRows = 5, maxCols = 5) {
    const raw1 = (col1?.raw_values ?? []).map((v) => String(v ?? '').trim());
    const raw2 = (col2?.raw_values ?? []).map((v) => String(v ?? '').trim());
    const n = Math.min(raw1.length, raw2.length);
    if (n < 2) return null;

    const counts1 = new Map();
    const counts2 = new Map();
    for (let i = 0; i < n; i++) {
        if (raw1[i]) counts1.set(raw1[i], (counts1.get(raw1[i]) ?? 0) + 1);
        if (raw2[i]) counts2.set(raw2[i], (counts2.get(raw2[i]) ?? 0) + 1);
    }

    const cats1 = [...counts1.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxRows).map(([name]) => name);
    const cats2 = [...counts2.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCols).map(([name]) => name);
    if (!cats1.length || !cats2.length) return null;

    const table = cats1.map(() => cats2.map(() => 0));
    for (let i = 0; i < n; i++) {
        const r = cats1.indexOf(raw1[i]);
        const c = cats2.indexOf(raw2[i]);
        if (r >= 0 && c >= 0) table[r][c]++;
    }

    const rowTotals = table.map((row) => row.reduce((sum, value) => sum + value, 0));
    const colTotals = cats2.map((_, c) => table.reduce((sum, row) => sum + row[c], 0));
    const total = rowTotals.reduce((sum, value) => sum + value, 0);
    if (!total) return null;

    const cells = [];
    for (let r = 0; r < cats1.length; r++) {
        for (let c = 0; c < cats2.length; c++) {
            const observed = table[r][c];
            const expected = (rowTotals[r] * colTotals[c]) / total;
            const residual = expected > 0 ? (observed - expected) / Math.sqrt(expected) : 0;
            cells.push({
                row: cats1[r],
                col: cats2[c],
                observed,
                expected: +expected.toFixed(3),
                residual: +residual.toFixed(3),
            });
        }
    }

    return { rows: cats1, cols: cats2, cells };
}
