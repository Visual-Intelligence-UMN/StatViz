import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import { refineHypothesis, fetchTestSuggestions } from '../api/customHypothesisService';
import { runTest, fetchTestResult, fetchResultNarrative } from '../api/statisticsService';
import { buildFallbackResultEvidence } from '../utils/evidenceModel';
import './nodes.css';

const RESULT_EDGE = {
    stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '4,3',
};

function CustomHypothesisNode({ id, data, selected }) {
    // ── Free-text input
    const [rawText,      setRawText]     = useState('');
    const [refining,     setRefining]    = useState(false);
    const [refineError,  setRefineError] = useState('');

    // ── Refined statement (once AI returns it)
    const [statement,    setStatement]   = useState(null); // null = not yet refined
    const [variables,    setVariables]   = useState([]);
    const [editingStmt,  setEditingStmt] = useState(false);
    const [stmtDraft,    setStmtDraft]   = useState('');

    // ── Test suggestions
    const [suggesting,   setSuggesting]  = useState(false);
    const [suggestError, setSuggestError]= useState('');
    const [suggestions,  setSuggestions] = useState([]);
    const [selectedIdx,  setSelectedIdx] = useState(null);

    // ── Running
    const [running,      setRunning]     = useState(false);
    const [needsConsent, setNeedsConsent]= useState(false);
    const [unsupported,  setUnsupported] = useState('');
    const [runError,     setRunError]    = useState('');
    const [done,         setDone]        = useState(false);

    const removeNode          = useDataModeStore((s) => s.removeNode);
    const addHypothesisRecord = useDataModeStore((s) => s.addHypothesisRecord);
    const addResultRecord     = useDataModeStore((s) => s.addResultRecord);

    // ── Step 1: Refine raw text ──────────────────────────────────────────

    const handleRefine = async (e) => {
        e.stopPropagation();
        if (!rawText.trim() || refining) return;
        setRefining(true);
        setRefineError('');
        try {
            const { datasetMetadata, datasetSpec, datasetDescription } =
                useDataModeStore.getState();
            const result = await refineHypothesis(
                rawText.trim(), datasetMetadata, datasetSpec, datasetDescription
            );
            setStatement(result.statement);
            setVariables(result.variables ?? []);
        } catch (err) {
            setRefineError(err.message ?? 'Failed to refine hypothesis.');
        } finally {
            setRefining(false);
        }
    };

    // ── Step 2: Suggest tests ────────────────────────────────────────────

    const handleSuggest = async (e) => {
        e.stopPropagation();
        if (!statement || suggesting) return;
        setSuggesting(true);
        setSuggestError('');
        setSuggestions([]);
        setSelectedIdx(null);
        setDone(false);
        setNeedsConsent(false);
        setRunError('');
        try {
            const { datasetMetadata, datasetSpec, datasetDescription } =
                useDataModeStore.getState();
            const list = await fetchTestSuggestions(
                statement, variables, datasetMetadata, datasetSpec, datasetDescription
            );
            setSuggestions(list);
            setSelectedIdx(0);
            addHypothesisRecord({
                nodeId:              id,
                parentInsightNodeId: null,
                label:               '',
                title:               '',
                statement,
                type:                list[0]?.type ?? '',
                variables,
                directionality:      '',
                suggestedTest:       list[0]?.test_name ?? '',
                assumptionNotes:     '',
                status:              'pending',
                isCustom:            true,
            });
        } catch (err) {
            setSuggestError(err.message ?? 'Failed to fetch suggestions.');
        } finally {
            setSuggesting(false);
        }
    };

    // ── Spawn ResultNode ─────────────────────────────────────────────────

    function spawnResult(result, suggestion) {
        const { nodes, addNode, addEdge } = useDataModeStore.getState();
        const thisNode = nodes.find((n) => n.id === id);
        const pos      = thisNode?.position ?? { x: 400, y: 400 };
        const siblings = useDataModeStore.getState().edges
            .filter((e) => e.source === id)
            .map((e) => e.target)
            .filter((tid) => nodes.find((n) => n.id === tid)?.type === 'result')
            .length;

        const resultId = `result-${id}-${Date.now()}`;
        const { allocateResultIdentifier } = useDataModeStore.getState();
        const identifier = allocateResultIdentifier();
        const evidence = result.evidence ?? buildFallbackResultEvidence({
            hypothesisType: suggestion.type ?? '',
            chartType: suggestion.chart_type ?? '',
            variables: suggestion.variables ?? [],
            stat: result.stat ?? null,
            pValue: result.pValue ?? null,
            significant: result.significant ?? false,
            method: result.method ?? suggestion.test_name ?? '',
        });
        addNode({
            id:   resultId,
            type: 'result',
            position: { x: pos.x + siblings * 380, y: pos.y + 340 },
            data: {
                ...result,
                identifier,
                parentHypothesisNodeId: id,
                columns:    suggestion.variables ?? [],
                chart_type: suggestion.chart_type ?? '',
                evidence,
            },
        });
        addEdge({
            id: `e-${id}-${resultId}`, source: id, target: resultId, style: RESULT_EDGE,
        });
        addResultRecord({
            nodeId:                 resultId,
            parentHypothesisNodeId: id,
            method:                 result.method ?? '',
            testType:               result.testType ?? suggestion.test_name ?? '',
            columns:                suggestion.variables ?? [],
            stat:                   result.stat ?? null,
            pValue:                 result.pValue ?? null,
            significant:            result.significant ?? false,
            summary:                result.summary ?? '',
            aiAssisted:             result.aiAssisted ?? false,
            evidence,
        });
        setDone(true);
    }

    // ── Step 3: Run test ─────────────────────────────────────────────────

    const handleRun = async (e) => {
        e.stopPropagation();
        const suggestion = suggestions[selectedIdx];
        if (!suggestion || running) return;
        setRunning(true);
        setRunError('');
        setNeedsConsent(false);

        const { datasetSpec, datasetMetadata, datasetDescription } = useDataModeStore.getState();
        if (!datasetSpec) { setRunning(false); return; }

        const hypothesis = {
            type:           suggestion.type,
            suggested_test: suggestion.test_name,
            variables:      suggestion.variables,
            statement,
        };

        const result = runTest(hypothesis, datasetSpec);

        if (result.supported) {
            try {
                result.narrative = await fetchResultNarrative(result, hypothesis, datasetMetadata, datasetSpec, datasetDescription);
            } catch {
                // fall back to renderer defaults if AI summary generation fails
            }
            setRunning(false);
            spawnResult(result, suggestion);
        } else {
            setRunning(false);
            setUnsupported(result.testName ?? suggestion.test_name);
            setNeedsConsent(true);
        }
    };

    const handleAIFallback = async (e) => {
        e.stopPropagation();
        setRunning(true);
        setNeedsConsent(false);
        try {
            const { datasetMetadata, datasetSpec, datasetDescription } =
                useDataModeStore.getState();
            const suggestion = suggestions[selectedIdx];
            const hypothesis = {
                type:           suggestion.type,
                suggested_test: suggestion.test_name,
                variables:      suggestion.variables,
                statement,
            };
            const result = await fetchTestResult(
                hypothesis, datasetMetadata, datasetSpec, datasetDescription
            );
            try {
                result.narrative = await fetchResultNarrative(result, hypothesis, datasetMetadata, datasetSpec, datasetDescription);
            } catch {
                // fall back to renderer defaults if AI summary generation fails
            }
            spawnResult(result, suggestion);
        } catch (err) {
            setRunError(err.message ?? 'AI estimation failed.');
        } finally {
            setRunning(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className={`dm-node dm-node--custom-hyp ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">Custom Hypothesis</div>

            <div className="dm-node__body">

                {/* ── Section 1: free-text input (always visible) */}
                <div className="chyp__section">
                    <div className="dm-node__meta" style={{ marginBottom: 4 }}>
                        Describe what you want to test:
                    </div>
                    <textarea
                        className="chyp__input nodrag"
                        rows={2}
                        placeholder="e.g. Does exercise duration affect pulse rate?"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine(e); }
                        }}
                    />
                    {refineError && <div className="dm-node__error">{refineError}</div>}
                    <button
                        className="dm-node__action-btn dm-node__action-btn--primary chyp__inline-btn"
                        onClick={handleRefine}
                        disabled={!rawText.trim() || refining}
                    >
                        {refining ? 'Refining…' : statement ? 'Re-refine' : 'Refine →'}
                    </button>
                </div>

                {/* ── Section 2: refined statement (appears once AI responds) */}
                {(statement !== null || refining) && (
                    <>
                        <div className="chyp__divider" />
                        <div className="chyp__section">
                            <div className="dm-node__meta" style={{ marginBottom: 4 }}>
                                Refined hypothesis:
                            </div>

                            {refining && !statement ? (
                                <div className="chyp__loading">AI is refining your hypothesis…</div>
                            ) : editingStmt ? (
                                <div className="hyp__edit-wrap">
                                    <textarea
                                        className="hyp__edit-input nodrag"
                                        rows={3}
                                        value={stmtDraft}
                                        onChange={(e) => setStmtDraft(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                setStatement(stmtDraft);
                                                setEditingStmt(false);
                                            }
                                            if (e.key === 'Escape') setEditingStmt(false);
                                        }}
                                    />
                                    <div className="hyp__edit-actions">
                                        <button className="hyp__edit-btn hyp__edit-btn--save"
                                            onClick={() => { setStatement(stmtDraft); setEditingStmt(false); }}>
                                            Save
                                        </button>
                                        <button className="hyp__edit-btn hyp__edit-btn--cancel"
                                            onClick={() => setEditingStmt(false)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="hyp__statement"
                                    title="Click to edit"
                                    onClick={() => { setStmtDraft(statement); setEditingStmt(true); }}
                                >
                                    "{statement}"
                                </div>
                            )}

                            {!refining && statement && (
                                <button
                                    className="dm-node__action-btn dm-node__action-btn--ghost chyp__inline-btn"
                                    onClick={handleSuggest}
                                    disabled={suggesting}
                                >
                                    {suggesting ? 'Fetching tests…' : suggestions.length ? 'Re-suggest Tests' : 'Suggest Tests →'}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {/* ── Section 3: test suggestions (appear below, nothing hides) */}
                {(suggesting || suggestions.length > 0 || suggestError) && (
                    <>
                        <div className="chyp__divider" />
                        <div className="chyp__section">
                            {suggesting && (
                                <div className="chyp__loading">AI is suggesting tests…</div>
                            )}
                            {suggestError && (
                                <div className="dm-node__error">{suggestError}</div>
                            )}
                            {suggestions.length > 0 && (
                                <>
                                    <div className="dm-node__meta" style={{ marginBottom: 6 }}>
                                        Select a test to run:
                                    </div>
                                    <div className="chyp__suggestions">
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={i}
                                                className={`chyp__suggestion ${selectedIdx === i ? 'chyp__suggestion--selected' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); setSelectedIdx(i); setNeedsConsent(false); setRunError(''); }}
                                            >
                                                <div className="chyp__sug-name">{s.test_name}</div>
                                                <div className="chyp__sug-desc">{s.description}</div>
                                                {s.variables?.length > 0 && (
                                                    <div className="dm-node__tags" style={{ marginTop: 4 }}>
                                                        {s.variables.map((v) => (
                                                            <span key={v} className="dm-node__tag">{v}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {needsConsent && (
                                        <div className="hyp__consent" style={{ marginTop: 8 }}>
                                            <div className="hyp__consent-text">
                                                <span className="hyp__consent-icon">⚠️</span>
                                                <span>
                                                    <strong>"{unsupported}"</strong> isn't in our stats library.
                                                    Use AI to estimate instead?
                                                </span>
                                            </div>
                                            <div className="hyp__consent-actions">
                                                <button className="hyp__edit-btn hyp__edit-btn--save" onClick={handleAIFallback}>
                                                    Use AI
                                                </button>
                                                <button className="hyp__edit-btn hyp__edit-btn--cancel"
                                                    onClick={(e) => { e.stopPropagation(); setNeedsConsent(false); }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {runError && <div className="dm-node__error">{runError}</div>}

                                    {done && (
                                        <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginTop: 6 }}>
                                            ✓ Result spawned below
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}

            </div>

            {/* Actions */}
            <div className="dm-node__actions">
                {suggestions.length > 0 && !done && (
                    <button
                        className="dm-node__action-btn dm-node__action-btn--primary"
                        onClick={handleRun}
                        disabled={selectedIdx === null || running || needsConsent}
                    >
                        {running ? 'Running…' : 'Run Test'}
                    </button>
                )}
                {done && (
                    <button
                        className="dm-node__action-btn dm-node__action-btn--ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            setStatement(null); setRawText(''); setVariables([]);
                            setSuggestions([]); setSelectedIdx(null);
                            setDone(false); setNeedsConsent(false); setRunError('');
                        }}
                    >
                        New Hypothesis
                    </button>
                )}
                <button
                    className="dm-node__action-btn dm-node__action-btn--ghost"
                    onClick={(e) => { e.stopPropagation(); removeNode(id); }}
                >
                    Dismiss
                </button>
            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default CustomHypothesisNode;
