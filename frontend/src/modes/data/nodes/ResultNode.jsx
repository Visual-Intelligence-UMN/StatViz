import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import { runTest, fetchTestResult, fetchResultNarrative } from '../api/statisticsService';
import { buildFallbackResultEvidence } from '../utils/evidenceModel';
import ResultChart from './charts/ResultChart';
import './nodes.css';

const RESULT_EDGE = {
    stroke: '#10b981',
    strokeWidth: 1.5,
    strokeDasharray: '4,3',
};

function ResultNode({ id, data, selected }) {
    const datasetSpec = useDataModeStore((s) => s.datasetSpec);
    const datasetMetadata = useDataModeStore((s) => s.datasetMetadata);
    const datasetDescription = useDataModeStore((s) => s.datasetDescription);
    const updateHypothesisStatus = useDataModeStore((s) => s.updateHypothesisStatus);
    const addResultRecord = useDataModeStore((s) => s.addResultRecord);
    const resultRecord = useDataModeStore((s) => s.results.get(id));
    const parentHypothesisId = data.parentHypothesisNodeId ?? resultRecord?.parentHypothesisNodeId ?? null;
    const parentHypothesisRecord = useDataModeStore((s) => (
        parentHypothesisId ? s.hypotheses.get(parentHypothesisId) : null
    ));
    const parentStatus = parentHypothesisRecord?.status ?? 'pending';
    const [rerunStatus, setRerunStatus] = useState('idle');
    const [rerunError, setRerunError] = useState('');

    const spawnResult = (result) => {
        const { nodes, edges, addNode, addEdge, allocateResultIdentifier } = useDataModeStore.getState();
        const thisNode = nodes.find((node) => node.id === id);
        const pos = thisNode?.position ?? { x: 400, y: 400 };
        const siblingCount = edges
            .filter((edge) => edge.source === (parentHypothesisId ?? id))
            .map((edge) => edge.target)
            .filter((targetId) => nodes.find((node) => node.id === targetId)?.type === 'result')
            .length;
        const resultId = `result-${parentHypothesisId ?? id}-${Date.now()}`;
        const identifier = allocateResultIdentifier();
        const evidence = result.evidence ?? buildFallbackResultEvidence({
            hypothesisType: data.testType ?? parentHypothesisRecord?.type ?? '',
            chartType: data.chart_type ?? '',
            variables: data.columns ?? [],
            stat: result.stat ?? null,
            pValue: result.pValue ?? null,
            significant: result.significant ?? false,
            method: result.method ?? data.method ?? '',
        });
        addNode({
            id: resultId,
            type: 'result',
            position: { x: pos.x + siblingCount * 360, y: pos.y + 300 },
            data: {
                ...result,
                identifier,
                parentHypothesisNodeId: parentHypothesisId,
                columns: data.columns ?? [],
                testType: result.testType ?? data.testType ?? parentHypothesisRecord?.type ?? '',
                chart_type: data.chart_type ?? '',
                evidence,
            },
        });
        addEdge({
            id: `e-${parentHypothesisId ?? id}-${resultId}`,
            source: parentHypothesisId ?? id,
            target: resultId,
            style: RESULT_EDGE,
        });
        addResultRecord({
            nodeId: resultId,
            parentHypothesisNodeId: parentHypothesisId,
            method: result.method ?? '',
            testType: result.testType ?? data.testType ?? '',
            columns: data.columns ?? [],
            stat: result.stat ?? null,
            pValue: result.pValue ?? null,
            significant: result.significant ?? false,
            summary: result.summary ?? '',
            aiAssisted: result.aiAssisted ?? false,
            evidence,
        });
    };

    const handleAccept = (e) => {
        e.stopPropagation();
        if (!parentHypothesisId) return;
        updateHypothesisStatus(parentHypothesisId, parentStatus === 'accepted' ? 'pending' : 'accepted');
    };

    const handleReject = (e) => {
        e.stopPropagation();
        if (!parentHypothesisId) return;
        updateHypothesisStatus(parentHypothesisId, parentStatus === 'rejected' ? 'pending' : 'rejected');
    };

    const handleRerun = async (e) => {
        e.stopPropagation();
        if (!datasetSpec) return;
        setRerunError('');
        setRerunStatus('running');

        const hypothesis = {
            type: data.testType ?? parentHypothesisRecord?.type ?? '',
            suggested_test: data.method ?? parentHypothesisRecord?.suggestedTest ?? '',
            variables: data.columns ?? parentHypothesisRecord?.variables ?? [],
            statement: parentHypothesisRecord?.statement ?? '',
            chart_type: data.chart_type ?? '',
        };

        try {
            let result = runTest(hypothesis, datasetSpec);
            if (!result.supported) {
                result = await fetchTestResult(hypothesis, datasetMetadata, datasetSpec, datasetDescription);
            }
            try {
                result.narrative = await fetchResultNarrative(result, hypothesis, datasetMetadata, datasetSpec, datasetDescription);
            } catch {
                // renderer fallback stays available
            }
            spawnResult(result);
            setRerunStatus('idle');
        } catch (err) {
            setRerunError(err.message ?? 'Failed to rerun test.');
            setRerunStatus('error');
        }
    };

    return (
        <div className={`dm-node dm-node--result ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                Result
                {data.identifier && <span className="dm-node__header-id">{data.identifier}</span>}
                {data.aiAssisted && (
                    <span className="res__ai-badge">AI-assisted</span>
                )}
            </div>

            <div className="dm-node__body">
                {data.method && (
                    <div className="res__method">{data.method}</div>
                )}

                <ResultChart
                    chart_type={data.chart_type}
                    columns={data.columns}
                    spec={datasetSpec}
                    significant={data.significant}
                    aiAssisted={data.aiAssisted}
                    pValue={data.pValue}
                    stat={data.stat}
                    method={data.method}
                    testType={data.testType}
                    evidence={data.evidence}
                    narrative={data.narrative}
                />

                {rerunStatus === 'error' && (
                    <div className="dm-node__error">{rerunError}</div>
                )}
            </div>

            <div className="dm-node__actions">
                <button
                    className={`dm-node__action-btn ${parentStatus === 'accepted' ? 'dm-node__action-btn--active-green' : 'dm-node__action-btn--ghost'}`}
                    onClick={handleAccept}
                    disabled={!parentHypothesisId}
                    title={parentStatus === 'accepted' ? 'Undo accept' : 'Accept this hypothesis'}
                >
                    Accept
                </button>
                <button
                    className={`dm-node__action-btn ${parentStatus === 'rejected' ? 'dm-node__action-btn--active-red' : 'dm-node__action-btn--ghost'}`}
                    onClick={handleReject}
                    disabled={!parentHypothesisId}
                    title={parentStatus === 'rejected' ? 'Undo reject' : 'Reject this hypothesis'}
                >
                    Reject
                </button>
                <button
                    className="dm-node__action-btn dm-node__action-btn--primary"
                    onClick={handleRerun}
                    disabled={rerunStatus === 'running'}
                    title="Run this test again"
                >
                    {rerunStatus === 'running' ? 'Re-running…' : 'Re-run test'}
                </button>
            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default ResultNode;
