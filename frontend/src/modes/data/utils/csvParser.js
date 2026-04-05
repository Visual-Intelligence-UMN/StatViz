/**
 * csvParser.js — Browser-side CSV ingestion, schema extraction, and column statistics
 *
 * Exports:
 *   parseCSV(file) → Promise<{ metadata, spec }>
 *
 * metadata: { name, rows, columns, source }
 *
 * spec: {
 *   rowCount, columnCount, numericCount, categoricalCount,
 *   columns: [
 *     {
 *       name, type,
 *       missing_count, unique_count, total_count,
 *       stats:      { mean, median, min, max, std }   // numeric only
 *       top_values: [{ value, count }]                // categorical/datetime only
 *     }
 *   ]
 * }
 *
 * Types inferred per column: 'numeric' | 'categorical' | 'datetime'
 */

// ── Constants ──────────────────────────────────────────────────────────────

const MISSING_VALUES  = new Set(['', 'null', 'na', 'n/a', 'nan', 'none', '-']);
const TOP_VALUES_LIMIT = 5;

// ── Date-like pattern tests ────────────────────────────────────────────────

const DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/,   // ISO: 2020-01-01
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,          // US: 01/01/2020
    /^\d{1,2}-\d{1,2}-\d{2,4}$/,            // 01-01-2020
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}$/, // Jan 1, 2020
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/,   // 1 Jan 2020
];

function looksLikeDate(value) {
    return DATE_PATTERNS.some((re) => re.test(value.trim()));
}

function looksLikeNumeric(value) {
    const v = value.trim();
    if (v === '') return false;
    const cleaned = v.replace(/^[$]/, '').replace(/[%,]$/, '').replace(/,/g, '');
    return !isNaN(Number(cleaned));
}

// ── Type inference ─────────────────────────────────────────────────────────

function inferType(nonEmptyValues) {
    if (nonEmptyValues.length === 0) return 'categorical';
    const sample    = nonEmptyValues.slice(0, 200);
    const threshold = 0.8 * sample.length;
    if (sample.filter(looksLikeDate).length    >= threshold) return 'datetime';
    if (sample.filter(looksLikeNumeric).length >= threshold) return 'numeric';
    return 'categorical';
}

// ── Numeric helpers ────────────────────────────────────────────────────────

/** Parse a raw string cell to a Number, stripping common currency/percent/comma formatting. */
function toNumber(raw) {
    const cleaned = raw.replace(/^[$]/, '').replace(/[%,]$/, '').replace(/,/g, '');
    return Number(cleaned);
}

function round4(n) {
    return Math.round(n * 10000) / 10000;
}

function computeNumericStats(nums) {
    if (nums.length === 0) {
        return { mean: null, median: null, min: null, max: null, std: null };
    }

    const sorted = [...nums].sort((a, b) => a - b);
    const n      = nums.length;
    const sum    = nums.reduce((acc, v) => acc + v, 0);
    const mean   = sum / n;

    const mid    = Math.floor(n / 2);
    const median = n % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;

    // Quartiles via linear interpolation
    const q1f = (n - 1) * 0.25;
    const q3f = (n - 1) * 0.75;
    const q1  = sorted[Math.floor(q1f)] +
        (q1f % 1) * ((sorted[Math.ceil(q1f)] ?? sorted[Math.floor(q1f)]) - sorted[Math.floor(q1f)]);
    const q3  = sorted[Math.floor(q3f)] +
        (q3f % 1) * ((sorted[Math.ceil(q3f)] ?? sorted[Math.floor(q3f)]) - sorted[Math.floor(q3f)]);

    return {
        mean:   round4(mean),
        median: round4(median),
        min:    sorted[0],
        max:    sorted[n - 1],
        q1:     round4(q1),
        q3:     round4(q3),
        std:    round4(Math.sqrt(variance)),
    };
}

// ── Histogram (numeric) ────────────────────────────────────────────────────

/**
 * Compute a fixed-bin histogram for an array of numbers.
 * Returns an array of { x0, x1, count, portion } where portion = count / maxCount.
 */
function computeHistogram(nums, bins = 10) {
    if (nums.length === 0) return [];
    const min = Math.min(...nums);
    const max = Math.max(...nums);

    // All-same-value edge case — one full bar
    if (min === max) {
        return [{ x0: min, x1: max, count: nums.length, portion: 1 }];
    }

    const binWidth = (max - min) / bins;
    const counts   = new Array(bins).fill(0);

    for (const v of nums) {
        const i = Math.min(Math.floor((v - min) / binWidth), bins - 1);
        counts[i]++;
    }

    const maxCount = Math.max(...counts);
    return counts.map((count, i) => ({
        x0:      round4(min + i * binWidth),
        x1:      round4(min + (i + 1) * binWidth),
        count,
        portion: maxCount > 0 ? count / maxCount : 0,
    }));
}

// ── Categorical helpers ────────────────────────────────────────────────────

function computeTopValues(values) {
    const counts = new Map();
    for (const v of values) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_VALUES_LIMIT)
        .map(([value, count]) => ({ value, count }));
}

// ── CSV line parser ────────────────────────────────────────────────────────

function parseLine(line) {
    const fields = [];
    let current  = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current.trim());
    return fields;
}

// ── File reader ────────────────────────────────────────────────────────────

function readAndParse(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload  = (e) => {
            const rawLines = e.target.result.split(/\r?\n/);
            const nonEmpty = rawLines.filter((l) => l.trim() !== '');

            if (nonEmpty.length === 0) {
                resolve({ headers: [], rows: [] });
                return;
            }

            const headers = parseLine(nonEmpty[0]).map((h) =>
                h.replace(/^"|"$/g, '').trim()
            );
            const rows = nonEmpty.slice(1).map((l) => parseLine(l));
            resolve({ headers, rows });
        };
        reader.readAsText(file);
    });
}

// ── Column analysis ────────────────────────────────────────────────────────

/**
 * Analyse a single column's values and compute statistics.
 *
 * @param   {string[]} values  One entry per row (empty string = missing)
 * @returns {object}           Column spec with type, counts, and stats/top_values
 */
function analyzeColumn(values) {
    let missingCount = 0;
    const nonEmpty   = [];

    for (const v of values) {
        if (MISSING_VALUES.has(v.trim().toLowerCase())) {
            missingCount++;
        } else {
            nonEmpty.push(v.trim());
        }
    }

    const type        = inferType(nonEmpty);
    const uniqueCount = new Set(nonEmpty).size;

    const base = {
        type,
        missing_count: missingCount,
        unique_count:  uniqueCount,
        total_count:   values.length,
    };

    if (type === 'numeric') {
        const nums = nonEmpty.map(toNumber).filter((n) => !isNaN(n));
        return {
            ...base,
            stats:     computeNumericStats(nums),
            histogram: computeHistogram(nums),
        };
    }

    // categorical or datetime
    return {
        ...base,
        top_values:        computeTopValues(nonEmpty),
        total_non_missing: nonEmpty.length,
    };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a CSV File and return dataset metadata + enriched column spec.
 *
 * @param   {File}   file
 * @returns {Promise<{ metadata: object, spec: object }>}
 */
export async function parseCSV(file) {
    const { headers, rows } = await readAndParse(file);

    if (headers.length === 0) {
        throw new Error('CSV appears to be empty or has no headers.');
    }

    // Transpose: rows × columns  →  columns × rows
    const columnValues = headers.map((_, colIdx) =>
        rows.map((row) => (row[colIdx] !== undefined ? row[colIdx] : ''))
    );

    const columns = headers.map((name, i) => ({
        name,
        ...analyzeColumn(columnValues[i]),
    }));

    const numericCount     = columns.filter((c) => c.type === 'numeric').length;
    const categoricalCount = columns.filter((c) => c.type !== 'numeric').length;

    const metadata = {
        name:    file.name,
        rows:    rows.length,
        columns: headers.length,
        source:  'Local upload',
    };

    const spec = {
        rowCount:          rows.length,
        columnCount:       headers.length,
        numericCount,
        categoricalCount,
        columns,
    };

    return { metadata, spec };
}
