/**
 * chartTypeService.js — AI decides the best chart type AND which spec columns to use.
 *
 * Used as a fallback when an insight was generated without a chart_type field,
 * or when the insight's column names don't match the spec exactly.
 *
 * Returns { chart_type: string, columns: string[] } where columns are real spec column names.
 */

import { getApiKey, OPENAI_API_URL } from '../../../constants/api';
import { OPENAI_MODEL } from '../../../constants/models';
import { isIdentifierLikeColumn } from '../nodes/charts/chartData';

/**
 * Ask AI which chart type best visualises this insight, and which spec columns to use.
 *
 * @param {{ type, title, description, columns_involved }} insight
 * @param {object} spec  — datasetSpec (columns with type info)
 * @returns {Promise<{ chart_type: string, columns: string[] }>}
 */
export async function resolveChartType(insight, spec) {
    const meaningfulCols = (spec.columns ?? []).filter((c) => {
        if (isIdentifierLikeColumn(c)) return false;
        return true;
    });

    const specColList = meaningfulCols
        .map((c) => `${c.name} (${c.type})`)
        .join(', ');

    const prompt = `Insight type: ${insight.type}
Title: ${insight.title}
Description: ${insight.description}
Insight's original columns: ${(insight.columns_involved ?? []).join(', ')}

Available columns in the actual dataset (use EXACT names from this list):
${specColList}

Chart types you can pick from:
- scatter              — exactly 2 numeric columns; best for showing relationship/correlation between two variables
- grouped_bar          — 1 categorical + 1 numeric; compares means per group
- histogram            — 1 numeric column; shows value distribution
- histogram_outlier    — 1 numeric column where outliers are the focus
- correlation_heatmap  — 3+ numeric columns only; pairwise Pearson r matrix. Do NOT use this for 2-column insights.
- category_frequency   — 1 categorical column; shows count per category value

Rules:
1. Pick the chart that most directly shows the pattern in the insight title/description.
2. For "columns", use EXACT column names from the list above — the ones most relevant to this specific insight.
3. If insight is about a relationship between 2 variables, prefer scatter (if both numeric) or grouped_bar (if one is categorical).
4. Only use correlation_heatmap when the insight explicitly covers 3 or more numeric variables.
5. Never include identifier or index columns.

Reply with a JSON object only, no explanation:
{"chart_type": "<type>", "columns": ["<col1>", "<col2>"]}`;

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: 'You are a data visualisation expert. Reply with valid JSON only.' },
                { role: 'user',   content: prompt },
            ],
            temperature: 0,
            max_tokens: 60,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) return { chart_type: 'histogram', columns: insight.columns_involved ?? [] };

    try {
        const json   = await response.json();
        const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
        return {
            chart_type: parsed.chart_type ?? 'histogram',
            columns:    Array.isArray(parsed.columns) ? parsed.columns : (insight.columns_involved ?? []),
        };
    } catch {
        return { chart_type: 'histogram', columns: insight.columns_involved ?? [] };
    }
}
