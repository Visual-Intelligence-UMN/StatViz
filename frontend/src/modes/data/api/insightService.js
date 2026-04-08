/**
 * insightService.js — AI-driven insight foraging for Data Mode
 *
 * Sends dataset metadata + schema to OpenAI and receives a structured
 * array of exploratory insights back.
 *
 * Public API:
 *   fetchInsights(metadata, spec) → Promise<InsightDef[]>
 *
 * InsightDef: {
 *   title:            string,
 *   type:             'relationship' | 'group_difference' | 'distribution_issue' | 'outlier_candidate',
 *   description:      string,
 *   columns_involved: string[],
 *   reason:           string,
 * }
 */

import { getApiKey, OPENAI_API_URL } from '../../../constants/api';
import { OPENAI_MODEL } from '../../../constants/models';

const SYSTEM_PROMPT = `You are a data analysis assistant. Given a dataset schema with column statistics, generate 3-5 exploratory analytical insights that a researcher should investigate.

Return a JSON object with a single key "insights" containing an array. Each item must have exactly these fields:
- title: short descriptive title (max 10 words)
- type: one of "relationship", "group_difference", "distribution_issue", "outlier_candidate"
- description: 1-2 sentence plain-language explanation
- columns_involved: array of exact column names from the schema that are relevant
- reason: one sentence explaining why this is worth investigating analytically

Be specific — reference actual column names and observed statistics in your descriptions.`;

/**
 * Build the user message from dataset metadata and spec.
 */
function buildPrompt(metadata, spec, description) {
    const colLines = spec.columns.map((c) => {
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

    const descLine = description ? `\nContext: ${description}` : '';

    return `Dataset: "${metadata.name}"
Rows: ${metadata.rows.toLocaleString()} | Columns: ${spec.columnCount} (${spec.numericCount} numeric, ${spec.categoricalCount} categorical)${descLine}

Schema:
${colLines}`;
}

/**
 * Call OpenAI and return the parsed insight array.
 *
 * @param {{ name, rows, columns, source }} metadata
 * @param {{ rowCount, columnCount, numericCount, categoricalCount, columns: Array<{ name, type, missing_count, unique_count, stats?, top_values? }> }} spec
 * @param {string} [description] - optional user-provided dataset description
 * @returns {Promise<object[]>}
 */
export async function fetchInsights(metadata, spec, description = '') {
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: buildPrompt(metadata, spec, description) },
            ],
            temperature: 0.4,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error?.message ?? `OpenAI error ${response.status}`);
    }

    const json   = await response.json();
    const raw    = json.choices[0].message.content;
    const parsed = JSON.parse(raw);

    // Accept { insights: [...] } or a bare array, or first array value found
    const insights = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.insights)
            ? parsed.insights
            : Object.values(parsed).find((v) => Array.isArray(v)) ?? [];

    if (!Array.isArray(insights) || insights.length === 0) {
        throw new Error('No insights returned from OpenAI.');
    }

    // Stamp each insight with a unique id for use as React Flow node ids
    return insights.map((insight, i) => ({
        ...insight,
        id: `insight-ai-${Date.now()}-${i}`,
    }));
}
