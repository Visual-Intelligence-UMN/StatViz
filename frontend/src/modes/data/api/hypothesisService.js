/**
 * hypothesisService.js — AI-driven hypothesis generation for Data Mode
 *
 * Takes one Insight and dataset context, calls OpenAI, and returns a
 * single structured statistical hypothesis.
 *
 * Public API:
 *   fetchHypothesis(insight, metadata, spec, label) → Promise<HypothesisDef>
 *
 * HypothesisDef: {
 *   label:                    string,   // e.g. "H1"
 *   title:                    string,
 *   statement:                string,
 *   type:                     'association' | 'group_difference' | 'categorical_relationship' | 'distribution_difference',
 *   variables:                string[],
 *   directionality:           'positive' | 'negative' | 'non-directional' | 'two-tailed',
 *   suggested_test:           string,
 *   assumption_notes:         string,
 *   visualization_suggestion: string,
 * }
 */

import { OPENAI_API_KEY, OPENAI_API_URL } from '../../../constants/api';

const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a statistical hypothesis designer. Given an exploratory insight and dataset context, generate one precisely phrased, testable statistical hypothesis.

Return a JSON object with a single key "hypothesis" containing exactly these fields:
- label: string (use the provided label exactly as given)
- title: short title, max 8 words
- statement: full statistical hypothesis statement (e.g. "There is a significant positive association between X and Y")
- type: one of "association", "group_difference", "categorical_relationship", "distribution_difference"
- variables: array of exact column names from the schema that are involved
- directionality: one of "positive", "negative", "non-directional", "two-tailed"
- suggested_test: most appropriate statistical test name (e.g. "Pearson correlation", "Mann-Whitney U test", "Chi-square test of independence")
- assumption_notes: one sentence describing the key statistical assumptions to verify before running the test
- visualization_suggestion: one sentence naming a specific chart type that would help explore this hypothesis visually

Be specific — reference actual column names and mention observed statistics where relevant.`;

/**
 * Build the user prompt from the insight and dataset context.
 * Only includes schema rows for columns relevant to the insight.
 */
function buildPrompt(insight, metadata, spec, label) {
    const relevantNames = insight.columns_involved ?? [];
    const relevantCols  = spec.columns.filter((c) => relevantNames.includes(c.name));

    const colLines = relevantCols.map((c) => {
        const base = `  - ${c.name} (${c.type}): ${c.missing_count} missing, ${c.unique_count} unique`;
        if (c.type === 'numeric' && c.stats) {
            const { mean, min, max, std } = c.stats;
            return `${base} | mean=${mean}, min=${min}, max=${max}, std=${std}`;
        }
        if (c.top_values?.length) {
            const top = c.top_values.map((tv) => `${tv.value}(${tv.count})`).join(', ');
            return `${base} | top: ${top}`;
        }
        return base;
    }).join('\n');

    return `Insight:
  Title: ${insight.title}
  Type: ${insight.type}
  Description: ${insight.description}
  Reason: ${insight.reason}
  Columns: ${relevantNames.join(', ') || '(unspecified)'}

Dataset: "${metadata.name}" — ${metadata.rows.toLocaleString()} rows, ${spec.columnCount} columns (${spec.numericCount} numeric, ${spec.categoricalCount} categorical)

Hypothesis Label: ${label}

Relevant column stats:
${colLines || '  (no column-level stats available)'}`;
}

/**
 * Call OpenAI and return the parsed hypothesis object.
 *
 * @param {{ title, type, description, reason, columns_involved }} insight
 * @param {{ name, rows, columns }}                                metadata
 * @param {{ rowCount, columnCount, numericCount, categoricalCount, columns: [] }} spec
 * @param {string}                                                 label  e.g. "H1"
 * @returns {Promise<HypothesisDef>}
 */
export async function fetchHypothesis(insight, metadata, spec, label) {
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: buildPrompt(insight, metadata, spec, label) },
            ],
            temperature: 0.3,
            max_tokens:  700,
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

    // Accept { hypothesis: {...} } or the first plain object value in the response
    const hypothesis = parsed.hypothesis
        ?? Object.values(parsed).find(
            (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
        );

    if (!hypothesis?.statement) {
        throw new Error('No valid hypothesis returned from OpenAI.');
    }

    return hypothesis;
}
