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
import { OPENAI_API_KEY, OPENAI_API_URL } from '../../../constants/api';
import { OPENAI_MODEL } from '../../../constants/models';

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

// ── Pearson Correlation ───────────────────────────────────────────────────────

function pearsonCorrelation(x, y) {
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
        stat: fmt(r),
        pValue: fmt(pValue),
        significant,
        summary: `Pearson r = ${fmt(r, 3)}, p = ${fmt(pValue, 4)}. The association is ${significant ? '' : 'not '}statistically significant (α = 0.05). The correlation is ${dir}.`,
        aiAssisted: false,
    };
}

// ── Two-Sample t-Test ─────────────────────────────────────────────────────────

function twoSampleTTest(groupCol, valueCol, spec) {
    const groupRaw = colRaw(spec, groupCol);
    const valueRaw = colRaw(spec, valueCol);

    const groups = [...new Set(groupRaw.filter(Boolean))];
    if (groups.length < 2) throw new Error('Need at least 2 distinct groups for t-test.');

    const [g1, g2] = groups;
    const arr1 = valueRaw
        .map((v, i) => ({ v: parseFloat(v), g: groupRaw[i] }))
        .filter(({ v, g }) => !isNaN(v) && g === g1)
        .map(({ v }) => v);
    const arr2 = valueRaw
        .map((v, i) => ({ v: parseFloat(v), g: groupRaw[i] }))
        .filter(({ v, g }) => !isNaN(v) && g === g2)
        .map(({ v }) => v);

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

    return {
        supported: true,
        method: "Welch's two-sample t-test",
        stat: fmt(t),
        pValue: fmt(pValue),
        significant,
        summary: `t(${fmt(df, 1)}) = ${fmt(t, 3)}, p = ${fmt(pValue, 4)}. Mean "${valueCol}": ${fmt(m1, 2)} ("${g1}") vs ${fmt(m2, 2)} ("${g2}"). Difference is ${significant ? '' : 'not '}statistically significant.`,
        aiAssisted: false,
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

    return {
        supported: true,
        method: 'Chi-square test of independence',
        stat: fmt(chi2),
        pValue: fmt(pValue),
        significant,
        summary: `χ²(${df}) = ${fmt(chi2, 3)}, p = ${fmt(pValue, 4)}. The relationship between "${col1Name}" and "${col2Name}" is ${significant ? '' : 'not '}statistically significant.`,
        aiAssisted: false,
    };
}

// ── Test dispatcher ───────────────────────────────────────────────────────────

const UNSUPPORTED_PATTERNS = [
    /spearman/i,
    /mann.?whitney/i,
    /wilcoxon/i,
    /kruskal/i,
    /anova/i,
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

        if (type === 'association' || /pearson/i.test(testName)) {
            if (numericVars.length < 2)
                return { supported: false, testName: 'Pearson correlation (need 2 numeric columns)' };
            const x = toNums(colRaw(spec, numericVars[0]));
            const y = toNums(colRaw(spec, numericVars[1]));
            return pearsonCorrelation(x, y);
        }

        if (type === 'group_difference' || type === 'distribution_difference' || /t.?test/i.test(testName)) {
            if (catVars.length >= 1 && numericVars.length >= 1) {
                return twoSampleTTest(catVars[0], numericVars[0], spec);
            }
            if (numericVars.length >= 2) {
                const x = toNums(colRaw(spec, numericVars[0]));
                const y = toNums(colRaw(spec, numericVars[1]));
                // treat as two independent samples
                return pearsonCorrelation(x, y); // fallback to correlation if same length
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
- summary: one plain-English sentence describing the result and what it means

Be specific about what the result suggests, referencing the actual column names and values from the stats provided.`;

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
            Authorization: `Bearer ${OPENAI_API_KEY}`,
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
        stat:        parsed.stat        ?? null,
        pValue:      parsed.pValue      ?? null,
        significant: parsed.significant ?? false,
        summary:     parsed.summary     ?? 'AI could not estimate a clear result.',
    };
}
