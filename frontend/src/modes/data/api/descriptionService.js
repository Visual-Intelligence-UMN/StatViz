/**
 * descriptionService.js — AI-generated one-line dataset description
 *
 * Sends the dataset schema to OpenAI and gets back a single plain-English
 * sentence describing what the dataset appears to be about.
 *
 * Public API:
 *   fetchDatasetDescription(metadata, spec) → Promise<string>
 */

import { getApiKey, OPENAI_API_URL } from '../../../constants/api';
import { OPENAI_MODEL } from '../../../constants/models';

const SYSTEM_PROMPT = `You are a data analyst. Given a dataset name and its column schema, write ONE concise sentence (max 20 words) describing what this dataset is about and what it likely measures or tracks. Be specific and plain — no jargon, no filler phrases like "This dataset contains". Just the fact of what it is.`;

function buildPrompt(metadata, spec) {
    const colSummary = spec.columns
        .map((c) => `${c.name} (${c.type})`)
        .join(', ');
    return `Dataset name: "${metadata.name}"
Rows: ${metadata.rows}
Columns: ${colSummary}`;
}

/**
 * @param {{ name, rows }} metadata
 * @param {{ columns: Array<{ name, type }> }} spec
 * @returns {Promise<string>}
 */
export async function fetchDatasetDescription(metadata, spec) {
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
                { role: 'user',   content: buildPrompt(metadata, spec) },
            ],
            temperature: 0.3,
            max_tokens:  60,
        }),
    });

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error?.message ?? `OpenAI error ${response.status}`);
    }

    const json = await response.json();
    return json.choices[0].message.content.trim();
}
