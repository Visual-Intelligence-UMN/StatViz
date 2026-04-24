/**
 * chatTools.js
 *
 * Two exports consumed by ChatPanel:
 *   TOOL_DEFINITIONS  — JSON schema array for OpenAI tool_calling
 *   streamChat(userMessages, spec, callbacks) → Promise<updatedMessages>
 *
 * All tools execute client-side using datasetSpec already in memory.
 * No extra OpenAI calls are made for tool execution.
 */

import { getApiKey, OPENAI_API_URL } from '../../../constants/api';
import { OPENAI_MODEL } from '../../../constants/models';
import { runTest } from './statisticsService';
import { getCorrelationMatrix } from '../nodes/charts/chartData';
import { buildAnalysisContext } from '../store/analysisContext';
import useDataModeStore from '../store/useDataModeStore';

// ── Tool JSON schemas ──────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'get_column_stats',
            description: 'Get statistics for one or more columns: type, missing/unique counts, numeric stats (mean/median/min/max/std) or top categorical values.',
            parameters: {
                type: 'object',
                properties: {
                    columns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Column names to fetch stats for.',
                    },
                },
                required: ['columns'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_column_values',
            description: 'Get a sample of raw values from a specific column.',
            parameters: {
                type: 'object',
                properties: {
                    column: { type: 'string', description: 'Column name.' },
                    limit:  { type: 'number', description: 'Max values to return (default 50, max 200).' },
                },
                required: ['column'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'run_statistical_test',
            description: 'Run a statistical test on the dataset in-browser. Supports Pearson correlation (association), Welch\'s t-test (group_difference), Chi-square (categorical_relationship). Returns stat, p-value, significance, and a plain-English summary.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['association', 'group_difference', 'categorical_relationship'],
                        description: 'Hypothesis type.',
                    },
                    suggested_test: {
                        type: 'string',
                        description: 'Test name, e.g. "Pearson correlation", "Welch\'s two-sample t-test", "Chi-square test of independence".',
                    },
                    variables: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Column names involved in the test (2 columns).',
                    },
                    statement: {
                        type: 'string',
                        description: 'Plain-English hypothesis statement (optional).',
                    },
                },
                required: ['type', 'suggested_test', 'variables'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'filter_and_describe',
            description: 'Filter rows where a column equals a specific value, then return descriptive stats for a target column in that subset vs the full dataset.',
            parameters: {
                type: 'object',
                properties: {
                    filter_column: { type: 'string', description: 'Column to filter on (usually categorical).' },
                    filter_value:  { type: 'string', description: 'Value to match exactly.' },
                    target_column: { type: 'string', description: 'Numeric column to describe in the filtered subset.' },
                },
                required: ['filter_column', 'filter_value', 'target_column'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_correlation_matrix',
            description: 'Compute pairwise Pearson correlation matrix for numeric columns.',
            parameters: {
                type: 'object',
                properties: {
                    columns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional subset of numeric column names. Omit to use all numeric columns.',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_analysis_summary',
            description: 'Get the current analysis graph summary: all insights, hypotheses with their status, and test results.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
];

// ── Tool executors ─────────────────────────────────────────────────────────────

function execGetColumnStats(args, spec) {
    const columns = (args.columns ?? []).map((name) => {
        const col = spec.columns.find((c) => c.name === name);
        if (!col) return { name, error: 'Column not found' };
        const out = { name, type: col.type, missing: col.missing_count, unique: col.unique_count };
        if (col.stats) out.stats = col.stats;
        if (col.top_values?.length) out.topValues = col.top_values.slice(0, 8);
        return out;
    });
    return { type: 'stats', columns };
}

function execGetColumnValues(args, spec) {
    const col = spec.columns.find((c) => c.name === args.column);
    if (!col) return { type: 'values', error: 'Column not found' };
    const limit = Math.min(args.limit ?? 50, 200);
    return {
        type:   'values',
        column: args.column,
        values: col.raw_values.slice(0, limit),
        total:  col.raw_values.length,
    };
}

function execRunTest(args, spec) {
    const result = runTest(
        {
            type:           args.type,
            suggested_test: args.suggested_test,
            variables:      args.variables,
            statement:      args.statement ?? '',
        },
        spec,
    );
    return { type: 'test', ...result, variables: args.variables ?? [], testKind: args.type };
}

function execFilterAndDescribe(args, spec) {
    const filterCol = spec.columns.find((c) => c.name === args.filter_column);
    const targetCol = spec.columns.find((c) => c.name === args.target_column);
    if (!filterCol) return { type: 'filter', error: `Column "${args.filter_column}" not found` };
    if (!targetCol) return { type: 'filter', error: `Column "${args.target_column}" not found` };

    const indices = [];
    filterCol.raw_values.forEach((v, i) => {
        if (String(v).trim() === String(args.filter_value).trim()) indices.push(i);
    });

    const subsetNums = indices
        .map((i) => parseFloat(targetCol.raw_values[i]))
        .filter((v) => !isNaN(v));
    const fullNums = targetCol.raw_values
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));

    const describe = (vals) => {
        if (!vals.length) return null;
        const sorted  = [...vals].sort((a, b) => a - b);
        const mean    = vals.reduce((s, v) => s + v, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        return {
            count:  vals.length,
            mean:   +mean.toFixed(3),
            median: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
            std:    +Math.sqrt(variance).toFixed(3),
            min:    +sorted[0].toFixed(3),
            max:    +sorted[sorted.length - 1].toFixed(3),
        };
    };

    return {
        type:         'filter',
        filterColumn: args.filter_column,
        filterValue:  args.filter_value,
        targetColumn: args.target_column,
        subset:       describe(subsetNums),
        full:         describe(fullNums),
    };
}

function execCorrelation(args, spec) {
    const filteredSpec = args.columns?.length
        ? { ...spec, columns: spec.columns.filter((c) => args.columns.includes(c.name)) }
        : spec;
    const result = getCorrelationMatrix(filteredSpec);
    if (!result) return { type: 'correlation', error: 'Not enough numeric columns' };
    return { type: 'correlation', cols: result.cols, matrix: result.matrix };
}

function execAnalysisSummary() {
    const ctx = buildAnalysisContext(useDataModeStore.getState());
    return { type: 'summary', ...ctx };
}

export function executeTool(name, args, spec) {
    switch (name) {
        case 'get_column_stats':       return execGetColumnStats(args, spec);
        case 'get_column_values':      return execGetColumnValues(args, spec);
        case 'run_statistical_test':   return execRunTest(args, spec);
        case 'filter_and_describe':    return execFilterAndDescribe(args, spec);
        case 'get_correlation_matrix': return execCorrelation(args, spec);
        case 'get_analysis_summary':   return execAnalysisSummary();
        default: return { type: 'error', message: `Unknown tool: ${name}` };
    }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt() {
    const ctx  = buildAnalysisContext(useDataModeStore.getState());
    const name = ctx.dataset?.name ?? 'the dataset';
    return `You are a concise statistical analysis assistant for the dataset "${name}".
Use tools when the user asks for specific stats, correlations, tests, or filtered data.
Answer concisely. Do not repeat tool output verbatim — interpret and explain it.

Current analysis context:
${JSON.stringify(ctx, null, 2)}`;
}

// ── Streaming engine ──────────────────────────────────────────────────────────

async function doStream(messages, spec, callbacks, depth = 0) {
    if (depth > 4) { callbacks.onDone?.(); return messages; }

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
            model:      OPENAI_MODEL,
            messages,
            tools:      TOOL_DEFINITIONS,
            tool_choice: 'auto',
            stream:     true,
            max_tokens: 1000,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `OpenAI error ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let finishReason = null;
    let textContent  = '';
    const toolCalls  = {}; // index → { id, name, args }

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') break;
            try {
                const chunk  = JSON.parse(raw);
                const choice = chunk.choices?.[0];
                if (!choice) continue;

                const { delta } = choice;

                if (delta?.content) {
                    textContent += delta.content;
                    callbacks.onToken?.(delta.content);
                }

                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const i = tc.index;
                        if (!toolCalls[i]) toolCalls[i] = { id: '', name: '', args: '' };
                        if (tc.id)                  toolCalls[i].id   += tc.id;
                        if (tc.function?.name)      toolCalls[i].name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[i].args += tc.function.arguments;
                    }
                }

                if (choice.finish_reason) finishReason = choice.finish_reason;
            } catch { /* skip malformed SSE chunks */ }
        }
    }

    if (finishReason === 'tool_calls') {
        const list = Object.values(toolCalls);

        const assistantMsg = {
            role:       'assistant',
            content:    textContent || null,
            tool_calls: list.map((tc) => ({
                id:       tc.id,
                type:     'function',
                function: { name: tc.name, arguments: tc.args },
            })),
        };

        const toolMessages = list.map((tc) => {
            let args = {};
            try { args = JSON.parse(tc.args); } catch { /* malformed args */ }
            const result = executeTool(tc.name, args, spec);
            callbacks.onToolResult?.({ toolName: tc.name, result });
            return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
        });

        return doStream(
            [...messages, assistantMsg, ...toolMessages],
            spec, callbacks, depth + 1,
        );
    }

    // finish_reason === 'stop' — text response complete
    const finalMessages = textContent
        ? [...messages, { role: 'assistant', content: textContent }]
        : messages;
    callbacks.onDone?.();
    return finalMessages;
}

/**
 * streamChat(userMessages, spec, callbacks) → Promise<updatedMessages>
 *
 * userMessages: OpenAI-format array (user + assistant history, no system msg)
 * Returns the updated conversation (system message stripped) for caller to store.
 */
export async function streamChat(userMessages, spec, callbacks) {
    const systemMsg = { role: 'system', content: buildSystemPrompt() };
    try {
        const final = await doStream([systemMsg, ...userMessages], spec, callbacks);
        return final.slice(1); // strip system message before returning
    } catch (err) {
        callbacks.onError?.(err);
        return userMessages;
    }
}
