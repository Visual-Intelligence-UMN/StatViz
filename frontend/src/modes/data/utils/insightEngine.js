/**
 * insightEngine.js — Rule-based insight generation from dataset schema
 *
 * Works entirely from the dataset spec (column names, types, nullCount, uniqueCount)
 * without access to raw data values.
 *
 * Returns: InsightDef[]
 * InsightDef: {
 *   id:             string,
 *   title:          string,
 *   type:           'distribution_oddity' | 'group_difference' | 'relationship' | 'outlier_cluster',
 *   explanation:    string,
 *   evidence:       string,
 *   linkedColumns:  string[],
 * }
 */

export const INSIGHT_TYPE_META = {
    distribution_oddity: { label: 'Distribution Oddity', icon: '📊' },
    group_difference:    { label: 'Group Difference',    icon: '🔀' },
    relationship:        { label: 'Relationship',        icon: '🔗' },
    outlier_cluster:     { label: 'Outlier Cluster',     icon: '⚠️'  },
};

function pct(count, total) {
    return total > 0 ? ((count / total) * 100).toFixed(1) : '0';
}

/**
 * Generate insight candidates from a dataset spec.
 *
 * @param {{ columns: Array<{ name, type, nullCount, uniqueCount }> }} spec
 * @param {{ rows: number, name: string }} metadata
 * @returns {InsightDef[]}
 */
export function generateInsights(spec, metadata) {
    const insights = [];
    const cols = spec.columns;
    const totalRows = metadata?.rows ?? 0;
    const ts = Date.now();

    const numeric     = cols.filter((c) => c.type === 'numeric');
    const categorical = cols.filter((c) => c.type === 'categorical');
    const datetime    = cols.filter((c) => c.type === 'datetime');

    // ── 1. Distribution Oddity ────────────────────────────────────────────

    // High-missing column (> 5% null)
    const highMissing = cols
        .filter((c) => totalRows > 0 && c.nullCount / totalRows > 0.05)
        .sort((a, b) => b.nullCount - a.nullCount);

    if (highMissing.length > 0) {
        const col = highMissing[0];
        insights.push({
            id:            `insight-dist-${ts}-0`,
            title:         `"${col.name}" has significant missing data`,
            type:          'distribution_oddity',
            explanation:   `Column "${col.name}" is missing ${pct(col.nullCount, totalRows)}% of values. This may bias analyses and could require imputation or column exclusion.`,
            evidence:      `${col.nullCount.toLocaleString()} of ${totalRows.toLocaleString()} rows are null (${pct(col.nullCount, totalRows)}%).`,
            linkedColumns: [col.name],
        });
    }

    // Low-cardinality numeric (≤ 5 unique values — likely encoded categorical)
    const lowCardNumeric = numeric.find(
        (c) => c.uniqueCount > 0 && c.uniqueCount <= 5,
    );
    if (lowCardNumeric) {
        insights.push({
            id:            `insight-dist-${ts}-1`,
            title:         `"${lowCardNumeric.name}" may be a categorical variable`,
            type:          'distribution_oddity',
            explanation:   `"${lowCardNumeric.name}" is typed as numeric but has only ${lowCardNumeric.uniqueCount} unique value(s), suggesting it encodes categories (e.g. 0/1 flag or ordinal level).`,
            evidence:      `${lowCardNumeric.uniqueCount} unique values across ${totalRows.toLocaleString()} rows.`,
            linkedColumns: [lowCardNumeric.name],
        });
    }

    // ── 2. Group Difference ───────────────────────────────────────────────

    if (categorical.length >= 1 && numeric.length >= 1) {
        const cat      = categorical[0];
        const numCols  = numeric.slice(0, 3);
        const numNames = numCols.map((c) => `"${c.name}"`).join(', ');
        insights.push({
            id:            `insight-grp-${ts}`,
            title:         `Group comparison: "${cat.name}" → ${numNames}`,
            type:          'group_difference',
            explanation:   `Categorical column "${cat.name}" (${cat.uniqueCount} group${cat.uniqueCount !== 1 ? 's' : ''}) could split rows for comparing distributions of ${numNames} across groups. An ANOVA or Kruskal-Wallis test could confirm differences.`,
            evidence:      `"${cat.name}" has ${cat.uniqueCount} unique categories; ${numCols.length} numeric column(s) available.`,
            linkedColumns: [cat.name, ...numCols.map((c) => c.name)],
        });
    }

    // ── 3. Relationship / Correlation ─────────────────────────────────────

    if (numeric.length >= 2) {
        const [a, b] = numeric;
        insights.push({
            id:            `insight-rel-${ts}`,
            title:         `Potential relationship: "${a.name}" ↔ "${b.name}"`,
            type:          'relationship',
            explanation:   `Both "${a.name}" and "${b.name}" are numeric. A correlation test (Pearson or Spearman) could reveal whether they co-vary and by how much.`,
            evidence:      `"${a.name}" has ${a.uniqueCount.toLocaleString()} unique values; "${b.name}" has ${b.uniqueCount.toLocaleString()} unique values.`,
            linkedColumns: [a.name, b.name],
        });
    }

    // Datetime + numeric → time trend
    if (datetime.length >= 1 && numeric.length >= 1) {
        const dt  = datetime[0];
        const num = numeric[0];
        insights.push({
            id:            `insight-trend-${ts}`,
            title:         `Time trend possible: "${dt.name}" → "${num.name}"`,
            type:          'relationship',
            explanation:   `"${dt.name}" is a datetime column. Plotting "${num.name}" over time may reveal trends, seasonality, or structural breaks worth investigating.`,
            evidence:      `"${dt.name}" has ${dt.uniqueCount.toLocaleString()} unique timestamps.`,
            linkedColumns: [dt.name, num.name],
        });
    }

    // ── 4. Outlier Cluster ────────────────────────────────────────────────

    // Nearly-unique numeric column (> 90% unique rows → continuous, outlier-prone)
    const highCardNumeric = numeric.find(
        (c) => totalRows > 0 && c.uniqueCount / totalRows > 0.9,
    );
    if (highCardNumeric) {
        insights.push({
            id:            `insight-out-${ts}`,
            title:         `"${highCardNumeric.name}" may contain outliers`,
            type:          'outlier_cluster',
            explanation:   `"${highCardNumeric.name}" has nearly unique values for every row (${pct(highCardNumeric.uniqueCount, totalRows)}% unique), typical of continuous measurements that are prone to extreme values.`,
            evidence:      `${highCardNumeric.uniqueCount.toLocaleString()} unique values in ${totalRows.toLocaleString()} rows.`,
            linkedColumns: [highCardNumeric.name],
        });
    }

    // Numeric column with non-trivial nulls → outlier risk fallback
    if (!highCardNumeric) {
        const missingNumeric = numeric.find((c) => c.nullCount > 0);
        if (missingNumeric) {
            insights.push({
                id:            `insight-out-${ts}`,
                title:         `Missing values in "${missingNumeric.name}" may indicate outliers`,
                type:          'outlier_cluster',
                explanation:   `"${missingNumeric.name}" has ${missingNumeric.nullCount} missing value(s). In numeric columns, missing data often co-occurs with extreme or erroneous measurements.`,
                evidence:      `${missingNumeric.nullCount.toLocaleString()} missing value(s) detected.`,
                linkedColumns: [missingNumeric.name],
            });
        }
    }

    return insights;
}
