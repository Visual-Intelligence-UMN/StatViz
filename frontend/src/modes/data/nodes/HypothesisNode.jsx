import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import { runTest, fetchTestResult, fetchResultNarrative } from '../api/statisticsService';
import { buildFallbackResultEvidence } from '../utils/evidenceModel';
import './nodes.css';

const TYPE_LABEL = {
    association:               'Association',
    group_difference:          'Group Difference',
    categorical_relationship:  'Categorical Rel.',
    distribution_difference:   'Distribution Diff.',
};

const DIR_LABEL = {
    positive:           'Positive',
    negative:           'Negative',
    'non-directional':  'Non-directional',
    'two-tailed':       'Two-tailed',
};

const RESULT_EDGE = {
    stroke:          '#10b981',
    strokeWidth:     1.5,
    strokeDasharray: '4,3',
};

function HypothesisNode({ id, data, selected }) {
    const addResultRecord         = useDataModeStore((s) => s.addResultRecord);
    const updateHypothesisStatement = useDataModeStore((s) => s.updateHypothesisStatement);
    const hasExistingResult = useDataModeStore((s) =>
        Array.from(s.results.values()).some((record) => record.parentHypothesisNodeId === id)
    );
    const [editing, setEditing]       = useState(false);
    const [draft, setDraft]           = useState('');
    // 'idle' | 'running' | 'needs_consent' | 'error'
    const [runStatus, setRunStatus]   = useState('idle');
    const [unsupportedTest, setUnsupportedTest] = useState('');
    const [runError, setRunError]     = useState('');

    const status  = data.status ?? 'pending';
    const typeKey = (data.type ?? '').replace(/-/g, '_');

    const startEdit = (e) => {
        e.stopPropagation();
        setDraft(data.statement ?? '');
        setEditing(true);
    };
    const saveEdit   = () => { updateHypothesisStatement(id, draft); setEditing(false); };
    const cancelEdit = () => setEditing(false);

    // ── Spawn a ResultNode below this hypothesis ──────────────────────────

    function spawnResult(result) {
        const { nodes, addNode, addEdge } = useDataModeStore.getState();
        const thisNode   = nodes.find((n) => n.id === id);
        const pos        = thisNode?.position ?? { x: 400, y: 400 };
        const siblings   = useDataModeStore.getState().edges
            .filter((e) => e.source === id)
            .map((e) => e.target)
            .filter((tid) => nodes.find((n) => n.id === tid)?.type === 'result')
            .length;

        const resultId  = `result-${id}-${Date.now()}`;
        const { allocateResultIdentifier } = useDataModeStore.getState();
        const identifier = allocateResultIdentifier();
        const columns   = data.variables ?? [];
        const testType  = result.testType ?? data.type ?? '';
        const evidence  = result.evidence ?? buildFallbackResultEvidence({
            hypothesisType: data.type ?? '',
            chartType: data.chart_type ?? '',
            variables: columns,
            stat: result.stat ?? null,
            pValue: result.pValue ?? null,
            significant: result.significant ?? false,
            method: result.method ?? data.suggested_test ?? '',
        });
        addNode({
            id:       resultId,
            type:     'result',
            position: { x: pos.x + siblings * 380, y: pos.y + 280 },
            data:     {
                ...result,
                identifier,
                parentHypothesisNodeId: id,
                columns,
                testType,
                chart_type: data.chart_type ?? '',
                evidence,
            },
        });
        addEdge({
            id:     `e-${id}-${resultId}`,
            source: id,
            target: resultId,
            style:  RESULT_EDGE,
        });
        addResultRecord({
            nodeId:                  resultId,
            parentHypothesisNodeId:  id,
            method:                  result.method ?? '',
            testType:                result.testType ?? testType,
            columns,
            stat:                    result.stat ?? null,
            pValue:                  result.pValue ?? null,
            significant:             result.significant ?? false,
            summary:                 result.summary ?? '',
            aiAssisted:              result.aiAssisted ?? false,
            evidence,
        });
    }

    // ── Run Test (library path) ───────────────────────────────────────────

    const handleRunTest = async (e) => {
        e.stopPropagation();
        setRunError('');
        setRunStatus('running');

        const { datasetSpec, datasetMetadata, datasetDescription } = useDataModeStore.getState();
        if (!datasetSpec) { setRunStatus('idle'); return; }

        const result = runTest(data, datasetSpec);

        if (result.supported) {
            try {
                result.narrative = await fetchResultNarrative(result, data, datasetMetadata, datasetSpec, datasetDescription);
            } catch {
                // fall back to renderer defaults if narrative generation fails
            }
            spawnResult(result);
            setRunStatus('idle');
        } else {
            setUnsupportedTest(result.testName ?? data.suggested_test);
            setRunStatus('needs_consent');
        }
    };

    // ── AI fallback (after user consents) ────────────────────────────────

    const handleAIFallback = async (e) => {
        e.stopPropagation();
        setRunStatus('running');
        try {
            const { datasetMetadata, datasetSpec, datasetDescription } =
                useDataModeStore.getState();
            const result = await fetchTestResult(data, datasetMetadata, datasetSpec, datasetDescription);
            try {
                result.narrative = await fetchResultNarrative(result, data, datasetMetadata, datasetSpec, datasetDescription);
            } catch {
                // fall back to renderer defaults if narrative generation fails
            }
            spawnResult(result);
            setRunStatus('idle');
        } catch (err) {
            setRunError(err.message ?? 'AI estimation failed.');
            setRunStatus('error');
        }
    };

    const handleCancelConsent = (e) => {
        e.stopPropagation();
        setRunStatus('idle');
    };

    const runBtnLabel = runStatus === 'running'
        ? 'Running…'
        : hasExistingResult
            ? 'Test already run'
        : data.suggested_test
            ? `Run ${data.suggested_test}`
            : 'Run Test';

    return (
        <div className={`dm-node dm-node--hypothesis dm-node--hyp-${typeKey} dm-node--${status} ${selected ? 'dm-node--selected' : ''}`}>

            {/* Header */}
            <div className="dm-node__header">
                Hypothesis
                <div className="hyp__header-meta">
                    {data.label && <span className="hyp__label">{data.label}</span>}
                    {status !== 'pending' && (
                        <span className={`hyp__status hyp__status--${status}`}>
                            {status === 'accepted' ? 'Accepted' : 'Rejected'}
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="dm-node__body">

                {data.title && <div className="dm-node__label">{data.title}</div>}

                {editing ? (
                    <div className="hyp__edit-wrap">
                        <textarea
                            className="hyp__edit-input"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            autoFocus
                            rows={3}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                if (e.key === 'Escape') cancelEdit();
                            }}
                        />
                        <div className="hyp__edit-actions">
                            <button className="hyp__edit-btn hyp__edit-btn--save" onClick={saveEdit}>Save</button>
                            <button className="hyp__edit-btn hyp__edit-btn--cancel" onClick={cancelEdit}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    data.statement && (
                        <div className="hyp__statement" onClick={startEdit} title="Click to edit">
                            "{data.statement}"
                        </div>
                    )
                )}

                {typeKey && (
                    <span className={`hyp__type-badge hyp__type-badge--${typeKey}`}>
                        {TYPE_LABEL[typeKey] ?? data.type}
                    </span>
                )}

                {data.variables?.length > 0 && (
                    <div className="dm-node__tags">
                        {data.variables.map((v) => (
                            <span key={v} className="dm-node__tag">{v}</span>
                        ))}
                    </div>
                )}

                {data.suggested_test && (
                    <div className="hyp__test">
                        <strong>Test:</strong> {data.suggested_test}
                        {data.directionality && (
                            <> · {DIR_LABEL[data.directionality] ?? data.directionality}</>
                        )}
                    </div>
                )}

                {data.assumption_notes && <div className="hyp__note">{data.assumption_notes}</div>}
                {data.visualization_suggestion && <div className="hyp__viz">{data.visualization_suggestion}</div>}

                {/* Unsupported test — consent banner */}
                {runStatus === 'needs_consent' && (
                    <div className="hyp__consent">
                        <div className="hyp__consent-text">
                            <span className="hyp__consent-icon">⚠️</span>
                            <span>
                                <strong>"{unsupportedTest}"</strong> isn't available in our stats library.
                                Use AI to estimate this result instead?
                            </span>
                        </div>
                        <div className="hyp__consent-actions">
                            <button className="hyp__edit-btn hyp__edit-btn--save" onClick={handleAIFallback}>
                                Use AI
                            </button>
                            <button className="hyp__edit-btn hyp__edit-btn--cancel" onClick={handleCancelConsent}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {runStatus === 'error' && (
                    <div className="dm-node__error">{runError}</div>
                )}

            </div>

            {/* Actions */}
            <div className="dm-node__actions">
                <button
                    className="dm-node__action-btn dm-node__action-btn--primary"
                    onClick={handleRunTest}
                    disabled={runStatus === 'running' || runStatus === 'needs_consent' || status === 'rejected' || hasExistingResult}
                    title={data.suggested_test ? `Run: ${data.suggested_test}` : 'Run statistical test'}
                >
                    {runBtnLabel}
                </button>
            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default HypothesisNode;
