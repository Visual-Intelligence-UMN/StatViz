const DEFAULT_ALPHA = 0.05;

export const EVIDENCE_KINDS = {
    TREND: 'trend',
    GROUP_COMPARISON: 'group_comparison',
    CONTINGENCY_DEVIATION: 'contingency_deviation',
    DISTRIBUTION_SHAPE: 'distribution_shape',
    OUTLIER_SIGNAL: 'outlier_signal',
    MATRIX_RELATIONSHIP: 'matrix_relationship',
    UNKNOWN: 'unknown',
};

export function inferEvidenceKindFromChartType(chartType = '') {
    switch (chartType) {
        case 'scatter':
            return EVIDENCE_KINDS.TREND;
        case 'grouped_bar':
            return EVIDENCE_KINDS.GROUP_COMPARISON;
        case 'histogram':
            return EVIDENCE_KINDS.DISTRIBUTION_SHAPE;
        case 'histogram_outlier':
            return EVIDENCE_KINDS.OUTLIER_SIGNAL;
        case 'correlation_heatmap':
            return EVIDENCE_KINDS.MATRIX_RELATIONSHIP;
        default:
            return EVIDENCE_KINDS.UNKNOWN;
    }
}

export function inferEvidenceKindFromHypothesisType(type = '') {
    switch (type) {
        case 'association':
            return EVIDENCE_KINDS.TREND;
        case 'group_difference':
            return EVIDENCE_KINDS.GROUP_COMPARISON;
        case 'categorical_relationship':
            return EVIDENCE_KINDS.CONTINGENCY_DEVIATION;
        case 'distribution_difference':
            return EVIDENCE_KINDS.DISTRIBUTION_SHAPE;
        default:
            return EVIDENCE_KINDS.UNKNOWN;
    }
}

export function makeEvidence({
    kind = EVIDENCE_KINDS.UNKNOWN,
    renderHint = null,
    alpha = DEFAULT_ALPHA,
    effectLabel = '',
    effectValue = null,
    variables = [],
    notes = [],
    details = {},
} = {}) {
    return {
        version: 1,
        kind,
        renderHint,
        alpha,
        effectLabel,
        effectValue,
        variables,
        notes,
        details,
    };
}

export function inferStatisticLabel(method = '', kind = EVIDENCE_KINDS.UNKNOWN) {
    if (/pearson/i.test(method)) return 'r';
    if (/spearman/i.test(method)) return 'ρ';
    if (/welch|t-test|t test/i.test(method)) return 't';
    if (/\banova\b/i.test(method)) return 'F';
    if (/chi-?square/i.test(method)) return 'χ²';
    if (/mann.?whitney/i.test(method)) return 'U';
    if (/wilcoxon/i.test(method)) return 'W';
    if (/kruskal/i.test(method)) return 'H';
    if (kind === EVIDENCE_KINDS.TREND) return 'stat';
    if (kind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION) return 'stat';
    return 'stat';
}

export function buildFallbackResultEvidence({
    hypothesisType = '',
    chartType = '',
    variables = [],
    stat = null,
    pValue = null,
    significant = false,
    method = '',
    details = {},
} = {}) {
    const kind = inferEvidenceKindFromHypothesisType(hypothesisType) !== EVIDENCE_KINDS.UNKNOWN
        ? inferEvidenceKindFromHypothesisType(hypothesisType)
        : inferEvidenceKindFromChartType(chartType);

    const statLabel = inferStatisticLabel(method, kind);
    let effectLabel = '';
    if (/pearson/i.test(method)) effectLabel = 'r';
    else if (/t-test/i.test(method)) effectLabel = 'mean diff';
    else if (/\banova\b/i.test(method)) effectLabel = 'overall difference';
    else if (/chi-square/i.test(method)) effectLabel = 'chi-square';
    else if (kind === EVIDENCE_KINDS.TREND) effectLabel = 'stat';
    else if (kind === EVIDENCE_KINDS.GROUP_COMPARISON) effectLabel = 'overall difference';
    else if (kind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION) effectLabel = 'deviation';

    return makeEvidence({
        kind,
        renderHint: chartType || null,
        effectLabel,
        effectValue: stat,
        variables,
        details: {
            statLabel,
            pValue,
            significant,
            method,
            ...details,
        },
    });
}

export function buildResultExplanation({
    evidence = null,
    method = '',
    significant = false,
    aiAssisted = false,
} = {}) {
    if (!evidence) return null;

    const scope = evidence.details?.scope ?? '';
    const statLabel = evidence.details?.statLabel ?? inferStatisticLabel(method, evidence.kind);

    const base = {
        title: 'How To Read This Result',
        whatTestChecks: '',
        whatToLookFor: '',
        whyItCanStillMakeSense: '',
        caution: aiAssisted
            ? 'This is an AI estimate, so treat the explanation as directional evidence rather than a final computed conclusion.'
            : '',
    };

    if (evidence.kind === EVIDENCE_KINDS.GROUP_COMPARISON) {
        base.whatTestChecks = scope === 'overall_multi_group'
            ? `${method || 'This test'} checks whether group centers differ overall, relative to within-group variation. It does not require every pair of groups to be fully separated.`
            : `${method || 'This test'} checks whether the group centers differ enough relative to within-group variation.`;
        base.whatToLookFor = scope === 'overall_multi_group'
            ? 'Focus on where the mean and median markers sit across all groups. The grey points may overlap substantially even when the overall group centers are consistently shifted.'
            : 'Focus on the shift in the group centers and confidence markers, not on whether all individual points fully separate.';
        base.whyItCanStillMakeSense = significant
            ? 'A significant result can still coexist with overlap because the test uses center differences, spread, and sample size together rather than requiring visual non-overlap of all points.'
            : 'If the group centers remain close relative to the spread, the test can stay non-significant even if some individual values look far apart.';
        return base;
    }

    if (evidence.kind === EVIDENCE_KINDS.TREND) {
        base.whatTestChecks = `${method || 'This test'} checks for a consistent directional relationship, not whether every point lies close to the fitted line.`;
        base.whatToLookFor = 'Look for whether the center of the cloud tends to rise or fall in one direction and whether the fitted line captures that overall movement.';
        base.whyItCanStillMakeSense = significant
            ? 'A trend can be significant even when the scatter still looks noisy, because the test is sensitive to consistent directional movement across many observations.'
            : 'If the point cloud is too diffuse around the fitted direction, the test may stay non-significant even when a slight visual slope exists.';
        return base;
    }

    if (evidence.kind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION) {
        base.whatTestChecks = `${method || 'This test'} checks whether the observed category combinations differ from what would be expected if the variables were independent.`;
        base.whatToLookFor = 'Look for cells that are systematically above or below their expected counts rather than only comparing the raw category totals.';
        base.whyItCanStillMakeSense = significant
            ? 'The result becomes significant when several cells deviate from expectation in a coordinated way, even if the raw table does not look dramatically unbalanced at first glance.'
            : 'If observed counts stay close to their expected pattern, the test remains non-significant even when some cells are a little larger than others.';
        return base;
    }

    if (evidence.kind === EVIDENCE_KINDS.DISTRIBUTION_SHAPE) {
        base.whatTestChecks = `${method || 'This test'} checks whether the distribution pattern itself differs, not just whether a few bars happen to be taller.`;
        base.whatToLookFor = 'Look for systematic shifts in where values cluster, how spread out they are, and whether the tails behave differently.';
        base.whyItCanStillMakeSense = significant
            ? 'A result can be significant when small differences across many parts of the distribution add up, even if no single bar looks dramatic on its own.'
            : 'If the overall shape stays similar, the test may remain non-significant even when a few local parts of the distribution differ slightly.';
        return base;
    }

    if (evidence.kind === EVIDENCE_KINDS.OUTLIER_SIGNAL) {
        base.whatTestChecks = `${method || 'This test'} is sensitive to unusual tail behavior or extreme values rather than the center of the distribution alone.`;
        base.whatToLookFor = 'Look toward the tails and the bins beyond the outlier fence, not only at the densest central bars.';
        base.whyItCanStillMakeSense = significant
            ? 'A result can be significant even when the middle looks stable if the tail behavior or extreme values differ enough to drive the test.'
            : 'If the apparent extremes are not strong or frequent enough relative to the rest of the distribution, the test can stay non-significant.';
        return base;
    }

    return {
        ...base,
        whatTestChecks: `${method || 'This test'} evaluates the structured difference captured by the result statistic.`,
        whatToLookFor: 'Use the chart to look for the dominant pattern emphasized by the result, rather than expecting every raw point to visibly separate.',
        whyItCanStillMakeSense: significant
            ? 'A significant result means the measured pattern is strong relative to the test’s uncertainty model, even when the raw visual pattern still looks messy.'
            : 'A non-significant result means the observed pattern is not strong enough relative to uncertainty, even if a visual pattern seems plausible at first glance.',
    };
}

export function classifyEffectStrength(evidence = null) {
    if (!evidence) return { level: 'unknown', label: 'unrated effect', value: null };

    const scope = evidence.details?.scope ?? '';
    const numeric = Number(
        evidence.details?.effectSizeValue ??
        evidence.effectValue
    );
    if (!Number.isFinite(numeric)) {
        return { level: 'unknown', label: 'unrated effect', value: null };
    }

    const magnitude = Math.abs(numeric);
    let thresholds = [0.1, 0.3, 0.5];
    if (scope === 'overall_multi_group' || evidence.details?.effectSizeLabel === 'η²') {
        thresholds = [0.01, 0.06, 0.14];
    }

    let level = 'small';
    if (magnitude >= thresholds[2]) level = 'large';
    else if (magnitude >= thresholds[1]) level = 'moderate';
    else if (magnitude < thresholds[0]) level = 'very_small';

    const labelMap = {
        very_small: 'very small effect',
        small: 'small effect',
        moderate: 'moderate effect',
        large: 'large effect',
    };

    return {
        level,
        label: labelMap[level] ?? 'effect',
        value: numeric,
    };
}

export function buildResultInterpretation({
    evidence = null,
    method = '',
    significant = false,
    aiAssisted = false,
} = {}) {
    if (!evidence) return null;

    const strength = classifyEffectStrength(evidence);
    const scope = evidence.details?.scope ?? '';
    const effectLabel = evidence.details?.effectSizeLabel ?? evidence.effectLabel ?? 'effect';
    const effectValue = evidence.details?.effectSizeValue ?? evidence.effectValue;

    let headline = significant ? 'Statistically reliable result' : 'No clear statistical evidence';
    let takeaway = significant
        ? 'The test detected a signal in the data.'
        : 'The observed pattern is not strong enough to treat as reliable.';

    if (evidence.kind === EVIDENCE_KINDS.GROUP_COMPARISON) {
        if (significant) {
            if (strength.level === 'very_small' || strength.level === 'small') {
                headline = 'Weak but statistically reliable difference';
                takeaway = scope === 'overall_multi_group'
                    ? `The group averages are a little different, and the test says that difference is real. But the size of the overall effect is small (${effectLabel} = ${effectValue}), so the raw score ranges still overlap a lot.`
                    : `The two group averages are a little different, and the test says that difference is real. But the size of the difference is small (${effectLabel} = ${effectValue}), so overlap in the raw scores is still expected.`;
            } else {
                headline = `${strength.label.charAt(0).toUpperCase()}${strength.label.slice(1)} with statistical support`;
                takeaway = scope === 'overall_multi_group'
                    ? 'At least one group average is different enough to matter in practice, not just on paper.'
                    : 'The gap between the two groups is large enough to matter in practice, not just on paper.';
            }
        } else {
            headline = 'No clear evidence of a meaningful difference';
            takeaway = scope === 'overall_multi_group'
                ? 'The group averages may not be exactly the same, but the data is still consistent with there being little or no real overall difference.'
                : 'The data is still consistent with little or no real gap between the two groups.';
        }
    } else if (evidence.kind === EVIDENCE_KINDS.TREND) {
        if (significant) {
            headline = `${strength.label.charAt(0).toUpperCase()}${strength.label.slice(1)} relationship`;
            takeaway = `The trend is statistically reliable, but its practical strength is best judged by ${effectLabel} = ${effectValue}, not by the p-value alone.`;
        } else {
            headline = 'No clear evidence of a reliable relationship';
            takeaway = 'The data may hint at a direction, but the relationship is too weak or noisy to treat as dependable.';
        }
    } else if (evidence.kind === EVIDENCE_KINDS.CONTINGENCY_DEVIATION) {
        if (significant) {
            headline = `${strength.label.charAt(0).toUpperCase()}${strength.label.slice(1)} categorical association`;
            takeaway = `Some category combinations deviate from expectation, but the practical strength is best judged by ${effectLabel} = ${effectValue} alongside the residual view.`;
        } else {
            headline = 'No clear categorical association';
            takeaway = 'Observed category counts stay close to their expected pattern, so any association is weak or uncertain.';
        }
    }

    if (aiAssisted) {
        takeaway += ' This is AI-assisted, so treat it as directional evidence rather than a final computed conclusion.';
    }

    return {
        headline,
        takeaway,
        strength,
        significanceLabel: significant ? 'statistically reliable' : 'not statistically reliable',
    };
}
