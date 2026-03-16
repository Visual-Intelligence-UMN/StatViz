/**
 * mockGraph.js — Initial mock nodes and edges for Data Mode
 *
 * Layout (top-to-bottom pipeline):
 *
 *              [Dataset]
 *       ┌──────────┼──────────┐
 *    [Age]     [Income]  [Education]
 *       └──────────┼──────────┘
 *             [Insight]
 *           [Hypothesis]
 *              [Test]
 *             [Result]
 *         [Interpretation]
 *            [Next Step]
 */

export const mockNodes = [
    // ── Dataset ──────────────────────────────────────────────
    {
        id: 'dataset-1',
        type: 'dataset',
        position: { x: 400, y: 0 },
        data: {
            name: 'socioeconomic_survey.csv',
            rows: 4820,
            columns: 12,
            source: 'Local upload',
        },
    },

    // ── Column Nodes ─────────────────────────────────────────
    {
        id: 'col-age',
        type: 'column',
        position: { x: 100, y: 160 },
        data: { name: 'Age', type: 'numeric', nullCount: 3 },
    },
    {
        id: 'col-income',
        type: 'column',
        position: { x: 400, y: 160 },
        data: { name: 'Income', type: 'numeric', nullCount: 47 },
    },
    {
        id: 'col-education',
        type: 'column',
        position: { x: 700, y: 160 },
        data: { name: 'Education', type: 'categorical', nullCount: 0 },
    },

    // ── Insight ──────────────────────────────────────────────
    {
        id: 'insight-1',
        type: 'insight',
        position: { x: 350, y: 340 },
        data: {
            text: 'Income appears positively correlated with Education level.',
            confidence: 'High',
        },
    },

    // ── Hypothesis ───────────────────────────────────────────
    {
        id: 'hypothesis-1',
        type: 'hypothesis',
        position: { x: 350, y: 500 },
        data: {
            statement: 'Higher education level leads to higher income.',
            nullHypothesis: 'Education level has no effect on income.',
        },
    },

    // ── Test ─────────────────────────────────────────────────
    {
        id: 'test-1',
        type: 'test',
        position: { x: 350, y: 660 },
        data: {
            testType: 'One-Way ANOVA',
            alpha: 0.05,
            status: 'Pending',
        },
    },

    // ── Result ───────────────────────────────────────────────
    {
        id: 'result-1',
        type: 'result',
        position: { x: 350, y: 820 },
        data: {
            summary: 'F(3, 4816) = 42.7, p < 0.001',
            pValue: '< 0.001',
            significant: true,
        },
    },

    // ── Interpretation ───────────────────────────────────────
    {
        id: 'interpretation-1',
        type: 'interpretation',
        position: { x: 350, y: 980 },
        data: {
            text: 'We reject the null hypothesis. Education level is a significant predictor of income across all groups.',
            source: 'LLM summary',
        },
    },

    // ── Next Step ────────────────────────────────────────────
    {
        id: 'nextstep-1',
        type: 'nextstep',
        position: { x: 350, y: 1140 },
        data: {
            action: 'Run post-hoc Tukey HSD to identify which education groups differ.',
            rationale: 'ANOVA confirms group difference but not which pairs.',
        },
    },
];

export const mockEdges = [
    // Dataset → Columns
    { id: 'e-ds-age', source: 'dataset-1', target: 'col-age', style: { stroke: '#3b82f6', strokeWidth: 2 } },
    { id: 'e-ds-inc', source: 'dataset-1', target: 'col-income', style: { stroke: '#3b82f6', strokeWidth: 2 } },
    { id: 'e-ds-edu', source: 'dataset-1', target: 'col-education', style: { stroke: '#3b82f6', strokeWidth: 2 } },

    // Columns → Insight
    { id: 'e-age-ins', source: 'col-age', target: 'insight-1', style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'e-inc-ins', source: 'col-income', target: 'insight-1', style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'e-edu-ins', source: 'col-education', target: 'insight-1', style: { stroke: '#6366f1', strokeWidth: 2 } },

    // Pipeline
    { id: 'e-ins-hyp', source: 'insight-1', target: 'hypothesis-1', style: { stroke: '#a855f7', strokeWidth: 2 } },
    { id: 'e-hyp-tst', source: 'hypothesis-1', target: 'test-1', style: { stroke: '#f59e0b', strokeWidth: 2 } },
    { id: 'e-tst-res', source: 'test-1', target: 'result-1', style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-res-int', source: 'result-1', target: 'interpretation-1', style: { stroke: '#ec4899', strokeWidth: 2 } },
    { id: 'e-int-nxt', source: 'interpretation-1', target: 'nextstep-1', style: { stroke: '#f97316', strokeWidth: 2 } },
];
