/**
 * statisticsService.js — Statistical test runner for Data Mode
 *
 * Two exports:
 *   runTest(hypothesis, spec)         → runs test in-browser via jstat
 *   fetchTestResult(hypothesis, ...)  → AI fallback when test is unsupported
 *
 * Result shape:
 * {
 *   supported:   true,
 *   method:      string,   // e.g. "Pearson correlation"
 *   stat:        number,   // test statistic
 *   pValue:      number,
 *   significant: boolean,  // p < 0.05
 *   summary:     string,   // plain-English sentence
 *   aiAssisted:  false,
 * }
 *
 * Unsupported shape:
 * { supported: false, testName: string }
 */

import { jStat } from 'jstat';
import { getApiKey, OPENAI_API_URL } from '../../../constants/api';
import { OPENAI_MODEL } from '../../../constants/models';
import { EVIDENCE_KINDS, buildFallbackResultEvidence, inferStatisticLabel, makeEvidence } from '../utils/evidenceModel';

const ALPHA = 0.05;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce a raw_values string array to clean numeric array */
function toNums(rawValues) {
    return (rawValues ?? [])
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));
}

/** Get raw_values for a named column from spec */
function colRaw(spec, name) {
    return spec.columns.find((c) => c.name === name)?.raw_values ?? [];
}

function fmt(n, decimals = 4) {
    if (n == null || isNaN(n)) return '–';
    return Number(n.toFixed(decimals));
}

function getGroupedNumericValues(groupCol, valueCol, spec) {
    const groupRaw = colRaw(spec, groupCol);
    const valueRaw = colRaw(spec, valueCol);
    const groups = new Map();
    const orderedGroups = [];
    const n = Math.min(groupRaw.length, valueRaw.length);

    for (let i = 0; i < n; i++) {
        const group = String(groupRaw[i] ?? '').trim();
        const value = parseFloat(valueRaw[i]);
        if (!group || Number.isNaN(value)) continue;
        if (!groups.has(group)) {
            groups.set(group, []);
            orderedGroups.push(group);
        }
        groups.get(group).push(value);
    }

    return orderedGroups.map((name) => ({ name, values: groups.get(name) ?? [] }));
}

function buildEstimatedSummary({ method, significant, pValue, scopeDetails }) {
    const cat = scopeDetails.variableRoles?.categorical?.[0];
    const num = scopeDetails.variableRoles?.numeric?.[0];
    const pText = pValue != null ? ` (p = ${fmt(pValue, 4)})` : '';

    if (scopeDetails.scope === 'overall_multi_group' && cat && num) {
        return `${method} ${significant ? 'suggests' : 'does not suggest'} that ${num} differs across groups of ${cat}${pText}. This is an AI estimate and should be interpreted as an overall multi-group comparison, not a single pairwise contrast.`;
    }

    if (scopeDetails.scope === 'pairwise_group' && cat && num) {
        return `${method} ${significant ? 'suggests' : 'does not suggest'} a difference in ${num} between groups of ${cat}${pText}. This is an AI estimate based on the structured column context.`;
    }

    if (scopeDetails.scope === 'overall_relationship' && scopeDetails.variableRoles?.numeric?.length >= 2) {
        const [x, y] = scopeDetails.variableRoles.numeric;
        return `${method} ${significant ? 'suggests' : 'does not suggest'} a relationship between ${x} and ${y}${pText}. This is an AI estimate based on the structured column context.`;
    }

    return `${method} ${significant ? 'suggests' : 'does not suggest'} the hypothesized effect${pText}. This is an AI estimate based on the structured column context.`;
}

// ── Pearson Correlation ───────────────────────────────────────────────────────

function pearsonCorrelation(x, y, meta = {}) {
    const n = Math.min(x.length, y.length);
    if (n < 3) throw new Error('Not enough data points for correlation (need ≥ 3).');
    const xs = x.slice(0, n);
    const ys = y.slice(0, n);

    const mx = jStat.mean(xs);
    const my = jStat.mean(ys);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        num  += dx * dy;
        dx2  += dx * dx;
        dy2  += dy * dy;
    }
    const r = num / Math.sqrt(dx2 * dy2);
    // t-statistic for significance
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // two-tailed p-value from t-distribution
    const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2));
    const significant = pValue < ALPHA;
    const dir = r > 0 ? 'positive' : 'negative';
    return {
        supported: true,
        method: 'Pearson correlation',
        testType: 'association',
        stat: fmt(r),
        pValue: fmt(pValue),
        significant,
        summary: `Pearson r = ${fmt(r, 3)}, p = ${fmt(pValue, 4)}. The association is ${significant ? '' : 'not '}statistically significant (α = 0.05). The correlation is ${dir}.`,
        aiAssisted: false,
        evidence: makeEvidence({
            kind: EVIDENCE_KINDS.TREND,
            renderHint: 'scatter',
            effectLabel: 'r',
            effectValue: fmt(r, 3),
            variables: [meta.xName, meta.yName].filter(Boolean),
            notes: [
                significant ? 'The fitted trend is statistically reliable.' : 'The fitted trend is weak relative to the spread.',
            ],
            details: {
                statLabel: 'r',
                scope: 'overall_relationship',
                sampleSize: n,
                direction: dir,
                pValue: fmt(pValue),
                significant,
            },
        }),
    };
}

// ── Two-Sample t-Test ─────────────────────────────────────────────────────────

function twoSampleTTest(groupCol, valueCol, spec) {
    const grouped = getGroupedNumericValues(groupCol, valueCol, spec);
    const groups = grouped.map((group) => group.name);
    if (groups.length < 2) throw new Error('Need at least 2 distinct groups for t-test.');

    const [g1, g2] = groups;
    const arr1 = grouped.find((group) => group.name === g1)?.values ?? [];
    const arr2 = grouped.find((group) => group.name === g2)?.values ?? [];

    if (arr1.length < 2 || arr2.length < 2)
        throw new Error('Not enough values in each group for t-test.');

    const m1 = jStat.mean(arr1), m2 = jStat.mean(arr2);
    const s1 = jStat.stdev(arr1, true), s2 = jStat.stdev(arr2, true);
    const n1 = arr1.length, n2 = arr2.length;

    // Welch's t-test
    const se = Math.sqrt(s1 * s1 / n1 + s2 * s2 / n2);
    const t  = (m1 - m2) / se;
    // Welch–Satterthwaite df
    const df = Math.pow(s1*s1/n1 + s2*s2/n2, 2) /
               (Math.pow(s1*s1/n1, 2)/(n1-1) + Math.pow(s2*s2/n2, 2)/(n2-1));
    const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
    const significant = pValue < ALPHA;
    const meanDiff = m1 - m2;
    const tCrit = jStat.studentt.inv(1 - ALPHA / 2, df);
    const ciLow = meanDiff - tCrit * se;
    const ciHigh = meanDiff + tCrit * se;
    const pooledStd = Math.sqrt((((n1 - 1) * s1 * s1) + ((n2 - 1) * s2 * s2)) / Math.max(1, n1 + n2 - 2));
    const cohensD = pooledStd > 0 ? meanDiff / pooledStd : 0;

    return {
        supported: true,
        method: "Welch's two-sample t-test",
        testType: 'group_difference',
        stat: fmt(t),
        pValue: fmt(pValue),
        significant,
        summary: `t(${fmt(df, 1)}) = ${fmt(t, 3)}, p = ${fmt(pValue, 4)}. Mean "${valueCol}": ${fmt(m1, 2)} ("${g1}") vs ${fmt(m2, 2)} ("${g2}"). Difference is ${significant ? '' : 'not '}statistically significant.`,
        aiAssisted: false,
        evidence: makeEvidence({
            kind: EVIDENCE_KINDS.GROUP_COMPARISON,
            renderHint: 'group_distribution',
            effectLabel: 'mean diff',
            effectValue: fmt(meanDiff, 2),
            variables: [groupCol, valueCol],
            notes: [
                'Interpret the mean shift together with how much the groups overlap.',
            ],
            details: {
                statLabel: 't',
                scope: 'pairwise_group',
                groupCount: 2,
                groupLabels: [g1, g2],
                meanDifference: fmt(meanDiff, 2),
                meanDifferenceCi: [fmt(ciLow, 2), fmt(ciHigh, 2)],
                effectSizeLabel: "Cohen's d",
                effectSizeValue: fmt(cohensD, 2),
                groups: [
                    { name: g1, mean: fmt(m1, 2), std: fmt(s1, 2), count: n1 },
                    { name: g2, mean: fmt(m2, 2), std: fmt(s2, 2), count: n2 },
                ],
                degreesOfFreedom: fmt(df, 1),
                pValue: fmt(pValue),
                significant,
            },
        }),
    };
}

function oneWayAnova(groupCol, valueCol, spec) {
    const grouped = getGroupedNumericValues(groupCol, valueCol, spec)
        .filter((group) => group.values.length >= 2);
    if (grouped.length < 2) throw new Error('Need at least 2 groups with 2 or more values for ANOVA.');

    const allValues = grouped.flatMap((group) => group.values);
    const totalN = allValues.length;
    const grandMean = jStat.mean(allValues);
    const k = grouped.length;

    const ssBetween = grouped.reduce((sum, group) => {
        const mean = jStat.mean(group.values);
        return sum + group.values.length * (mean - grandMean) ** 2;
    }, 0);
    const ssWithin = grouped.reduce((sum, group) => {
        const mean = jStat.mean(group.values);
        return sum + group.values.reduce((inner, value) => inner + (value - mean) ** 2, 0);
    }, 0);

    const df1 = k - 1;
    const df2 = totalN - k;
    if (df1 <= 0 || df2 <= 0) throw new Error('Not enough degrees of freedom for ANOVA.');

    const msBetween = ssBetween / df1;
    const msWithin = ssWithin / df2;
    const f = msWithin === 0 ? Infinity : msBetween / msWithin;
    const pValue = jStat.ftest(f, df1, df2);
    const significant = pValue < ALPHA;
    const ssTotal = ssBetween + ssWithin;
    const etaSquared = ssTotal > 0 ? ssBetween / ssTotal : 0;

    return {
        supported: true,
        method: 'ANOVA',
        testType: 'group_difference',
        stat: fmt(f),
        pValue: fmt(pValue),
        significant,
        summary: `ANOVA ${significant ? 'suggests' : 'does not suggest'} that ${valueCol} differs across groups of ${groupCol} (F(${df1}, ${df2}) = ${fmt(f, 3)}, p = ${fmt(pValue, 4)}).`,
        aiAssisted: false,
        evidence: makeEvidence({
            kind: EVIDENCE_KINDS.GROUP_COMPARISON,
            renderHint: 'group_distribution',
            effectLabel: 'F',
            effectValue: fmt(f, 3),
            variables: [groupCol, valueCol],
            notes: [
                'This is an overall multi-group comparison. Strong overlap between some pairs can still coexist with an overall group effect.',
            ],
            details: {
                statLabel: 'F',
                scope: 'overall_multi_group',
                groupCount: grouped.length,
                groupLabels: grouped.map((group) => group.name),
                grandMean: fmt(grandMean, 2),
                etaSquared: fmt(etaSquared, 3),
                effectSizeLabel: 'η²',
                effectSizeValue: fmt(etaSquared, 3),
                groups: grouped.map((group) => ({
                    name: group.name,
                    mean: fmt(jStat.mean(group.values), 2),
                    std: fmt(jStat.stdev(group.values, true), 2),
                    count: group.values.length,
                })),
                degreesOfFreedom: [df1, df2],
                pValue: fmt(pValue),
                significant,
            },
        }),
    };
}

// ── Chi-Square Test of Independence ──────────────────────────────────────────

function chiSquareTest(col1Name, col2Name, spec) {
    const raw1 = colRaw(spec, col1Name).filter(Boolean);
    const raw2 = colRaw(spec, col2Name).filter(Boolean);
    const n    = Math.min(raw1.length, raw2.length);
    if (n < 5) throw new Error('Not enough data for chi-square test.');

    const cats1 = [...new Set(raw1)];
    const cats2 = [...new Set(raw2)];

    // Build contingency table
    const table = cats1.map(() => cats2.map(() => 0));
    for (let i = 0; i < n; i++) {
        const r = cats1.indexOf(raw1[i]);
        const c = cats2.indexOf(raw2[i]);
        if (r >= 0 && c >= 0) table[r][c]++;
    }

    // Row/col totals
    const rowTotals = table.map((row) => row.reduce((s, v) => s + v, 0));
    const colTotals = cats2.map((_, c) => table.reduce((s, row) => s + row[c], 0));
    const total     = rowTotals.reduce((s, v) => s + v, 0);

    let chi2 = 0;
    for (let r = 0; r < cats1.length; r++) {
        for (let c = 0; c < cats2.length; c++) {
            const expected = (rowTotals[r] * colTotals[c]) / total;
            if (expected > 0) {
                chi2 += Math.pow(table[r][c] - expected, 2) / expected;
            }
        }
    }
    const df      = (cats1.length - 1) * (cats2.length - 1);
    const pValue  = 1 - jStat.chisquare.cdf(chi2, df);
    const significant = pValue < ALPHA;
    const minDim = Math.min(cats1.length - 1, cats2.length - 1);
    const cramersV = minDim > 0 && total > 0 ? Math.sqrt(chi2 / (total * minDim)) : 0;

    return {
        supported: true,
        method: 'Chi-square test of independence',
        testType: 'categorical_relationship',
        stat: fmt(chi2),
        pValue: fmt(pValue),
        significant,
        summary: `χ²(${df}) = ${fmt(chi2, 3)}, p = ${fmt(pValue, 4)}. The relationship between "${col1Name}" and "${col2Name}" is ${significant ? '' : 'not '}statistically significant.`,
        aiAssisted: false,
        evidence: makeEvidence({
            kind: EVIDENCE_KINDS.CONTINGENCY_DEVIATION,
            renderHint: 'contingency_heatmap',
            effectLabel: 'χ²',
            effectValue: fmt(chi2, 3),
            variables: [col1Name, col2Name],
            notes: [
                'The strongest cells are the ones farthest from their expected counts.',
            ],
            details: {
                statLabel: 'χ²',
                scope: 'overall_categorical',
                degreesOfFreedom: df,
                sampleSize: total,
                effectSizeLabel: "Cramer's V",
                effectSizeValue: fmt(cramersV, 3),
                pValue: fmt(pValue),
                significant,
            },
        }),
    };
}

// ── Test dispatcher ───────────────────────────────────────────────────────────

const UNSUPPORTED_PATTERNS = [
    /spearman/i,
    /mann.?whitney/i,
    /wilcoxon/i,
    /kruskal/i,
    /friedman/i,
];

/**
 * Run a statistical test in-browser using jstat.
 *
 * @param {{ type, suggested_test, variables, statement }} hypothesis
 * @param {{ columns: Array<{ name, type, raw_values }> }} spec
 * @returns {{ supported: boolean, ... }}
 */
export function runTest(hypothesis, spec) {
    const { type, suggested_test = '', variables = [] } = hypothesis;
    const testName = suggested_test.trim();

    // Check if the test is known-unsupported
    if (UNSUPPORTED_PATTERNS.some((re) => re.test(testName))) {
        return { supported: false, testName };
    }

    try {
        const numericVars = variables.filter(
            (v) => spec.columns.find((c) => c.name === v)?.type === 'numeric'
        );
        const catVars = variables.filter(
            (v) => spec.columns.find((c) => c.name === v)?.type !== 'numeric'
        );

        if (/anova/i.test(testName)) {
            if (catVars.length >= 1 && numericVars.length >= 1) {
                return oneWayAnova(catVars[0], numericVars[0], spec);
            }
            return { supported: false, testName: `${testName} (need 1 categorical and 1 numeric column)` };
        }

        if (type === 'association' || /pearson/i.test(testName)) {
            if (numericVars.length < 2)
                return { supported: false, testName: 'Pearson correlation (need 2 numeric columns)' };
            const x = toNums(colRaw(spec, numericVars[0]));
            const y = toNums(colRaw(spec, numericVars[1]));
            return pearsonCorrelation(x, y, { xName: numericVars[0], yName: numericVars[1] });
        }

        if (type === 'group_difference' || type === 'distribution_difference' || /t.?test/i.test(testName)) {
            if (catVars.length >= 1 && numericVars.length >= 1) {
                return twoSampleTTest(catVars[0], numericVars[0], spec);
            }
            if (numericVars.length >= 2) {
                const x = toNums(colRaw(spec, numericVars[0]));
                const y = toNums(colRaw(spec, numericVars[1]));
                // treat as two independent samples
                return pearsonCorrelation(x, y, { xName: numericVars[0], yName: numericVars[1] }); // fallback to correlation if same length
            }
            return { supported: false, testName };
        }

        if (type === 'categorical_relationship' || /chi.?square/i.test(testName)) {
            if (catVars.length >= 2) {
                return chiSquareTest(catVars[0], catVars[1], spec);
            }
            return { supported: false, testName };
        }

        // Unknown test type
        return { supported: false, testName: testName || type };

    } catch (err) {
        return { supported: false, testName, error: err.message };
    }
}

// ── AI Fallback ───────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a statistical analyst. Given a hypothesis, the suggested test, and relevant column statistics, estimate the result of the statistical test as if you had run it on the data. Be honest that this is an AI estimate, not a computed result.

Return a JSON object with exactly these fields:
- method: the statistical test name (use the suggested test)
- stat: estimated test statistic as a number (use null if not estimable)
- pValue: estimated p-value as a number between 0 and 1
- significant: boolean, true if p < 0.05
- interpretation: one short sentence about the likely result, without introducing any variables other than the provided ones

Do not invent new variables. Do not mention columns that are not in the provided relevant-column list.`;

function buildScopeDetails(hypothesis, spec) {
    const variables = hypothesis.variables ?? [];
    const relevantCols = spec.columns.filter((c) => variables.includes(c.name));
    const categoricalCols = relevantCols.filter((c) => c.type !== 'numeric');
    const numericCols = relevantCols.filter((c) => c.type === 'numeric');

    const primaryCategorical = categoricalCols[0] ?? null;
    const groupLabels = (primaryCategorical?.top_values ?? []).map((tv) => String(tv.value));
    const groupCount = primaryCategorical?.unique_count ?? groupLabels.length ?? 0;
    const scope = groupCount > 2 ? 'overall_multi_group' : groupCount === 2 ? 'pairwise_group' : 'single_scope';

    return {
        scope,
        variableRoles: {
            categorical: categoricalCols.map((c) => c.name),
            numeric: numericCols.map((c) => c.name),
        },
        groupCount,
        groupLabels,
    };
}

/**
 * AI fallback for unsupported tests.
 *
 * @param {{ type, suggested_test, variables, statement }} hypothesis
 * @param {{ name, rows }} metadata
 * @param {{ columns }} spec
 * @param {string} description
 * @returns {Promise<object>}
 */
export async function fetchTestResult(hypothesis, metadata, spec, description = '') {
    const scopeDetails = buildScopeDetails(hypothesis, spec);
    const relevantCols = spec.columns.filter((c) =>
        (hypothesis.variables ?? []).includes(c.name)
    );

    const colLines = relevantCols.map((c) => {
        const base = `  - ${c.name} (${c.type}): ${c.missing_count} missing, ${c.unique_count} unique`;
        if (c.type === 'numeric' && c.stats) {
            const { mean, median, min, max, std } = c.stats;
            return `${base} | mean=${mean}, median=${median}, min=${min}, max=${max}, std=${std}`;
        }
        if (c.top_values?.length) {
            const top = c.top_values.map((tv) => `${tv.value}(${tv.count})`).join(', ');
            return `${base} | top: ${top}`;
        }
        return base;
    }).join('\n');

    const prompt = `Hypothesis: "${hypothesis.statement}"
Type: ${hypothesis.type}
Suggested test: ${hypothesis.suggested_test}
${description ? `Dataset context: ${description}` : ''}

Dataset: "${metadata.name}" — ${metadata.rows} rows
Relevant columns:
${colLines || '  (no column stats available)'}`;

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: AI_SYSTEM_PROMPT },
                { role: 'user',   content: prompt },
            ],
            temperature: 0.2,
            max_tokens:  300,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error?.message ?? `OpenAI error ${response.status}`);
    }

    const json   = await response.json();
    const parsed = JSON.parse(json.choices[0].message.content);

    return {
        supported:   true,
        aiAssisted:  true,
        method:      parsed.method      ?? hypothesis.suggested_test,
        testType:    hypothesis.type ?? '',
        stat:        parsed.stat        ?? null,
        pValue:      parsed.pValue      ?? null,
        significant: parsed.significant ?? false,
        summary:     buildEstimatedSummary({
            method: parsed.method ?? hypothesis.suggested_test,
            significant: parsed.significant ?? false,
            pValue: parsed.pValue ?? null,
            scopeDetails,
        }),
        evidence:    buildFallbackResultEvidence({
            hypothesisType: hypothesis.type ?? '',
            variables: hypothesis.variables ?? [],
            stat: parsed.stat ?? null,
            pValue: parsed.pValue ?? null,
            significant: parsed.significant ?? false,
            method: parsed.method ?? hypothesis.suggested_test,
            details: {
                statLabel: inferStatisticLabel(parsed.method ?? hypothesis.suggested_test, undefined),
                ...scopeDetails,
            },
        }),
    };
}
