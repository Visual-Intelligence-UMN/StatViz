import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import { fetchHypothesis } from '../api/hypothesisService';
import './nodes.css';

const TYPE_META = {
    relationship:        { label: 'Relationship'      },
    group_difference:    { label: 'Group Difference'  },
    distribution_issue:  { label: 'Distribution Issue'},
    outlier_candidate:   { label: 'Outlier Candidate' },
};

const EDGE_HYPOTHESIS = {
    stroke:          '#a855f7',
    strokeWidth:     1.5,
    strokeDasharray: '5,3',
};

function InsightNode({ id, data, selected }) {
    const [hypStatus, setHypStatus] = useState('idle'); // 'idle' | 'loading' | 'error'

    const removeNode = useDataModeStore((s) => s.removeNode);

    const meta = TYPE_META[data.type] ?? { label: 'Insight' };

    // ── Dismiss ──────────────────────────────────────────────────────────

    const handleDismiss = (e) => {
        e.stopPropagation();
        removeNode(id);
    };

    // ── Generate Hypothesis ──────────────────────────────────────────────

    const handleGenerateHypothesis = async (e) => {
        e.stopPropagation();
        if (hypStatus === 'loading') return;

        const { datasetMetadata, datasetSpec, nodes, edges, addNode, addEdge } =
            useDataModeStore.getState();

        if (!datasetMetadata || !datasetSpec) return;

        setHypStatus('loading');

        try {
            const hypCount = nodes.filter((n) => n.type === 'hypothesis').length;
            const label    = `H${hypCount + 1}`;

            const hypothesis = await fetchHypothesis(data, datasetMetadata, datasetSpec, label);

            const hypId = `hyp-${id}-${Date.now()}`;

            const thisNode     = nodes.find((n) => n.id === id);
            const pos          = thisNode?.position ?? { x: 400, y: 600 };
            const siblingCount = edges
                .filter((e) => e.source === id)
                .map((e) => e.target)
                .filter((tid) => nodes.find((n) => n.id === tid)?.type === 'hypothesis')
                .length;

            addNode({
                id:       hypId,
                type:     'hypothesis',
                position: { x: pos.x + siblingCount * 380, y: pos.y + 280 },
                data:     { ...hypothesis, status: 'pending' },
            });

            addEdge({
                id:     `e-${id}-${hypId}`,
                source: id,
                target: hypId,
                style:  EDGE_HYPOTHESIS,
            });

            setHypStatus('idle');
        } catch (err) {
            console.error('[DataMode] fetchHypothesis failed:', err);
            setHypStatus('error');
        }
    };

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className={`dm-node dm-node--insight ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                {meta.label}
            </div>

            <div className="dm-node__body">
                <div className="dm-node__label">{data.title}</div>
                <div className="dm-node__meta">{data.description}</div>

                {data.reason && (
                    <div className="dm-node__evidence">{data.reason}</div>
                )}

                {data.columns_involved?.length > 0 && (
                    <div className="dm-node__tags">
                        {data.columns_involved.map((col) => (
                            <span key={col} className="dm-node__tag">{col}</span>
                        ))}
                    </div>
                )}
            </div>

            <div className="dm-node__actions">
                <button
                    className="dm-node__action-btn dm-node__action-btn--primary"
                    onClick={handleGenerateHypothesis}
                    disabled={hypStatus === 'loading'}
                >
                    {hypStatus === 'loading' ? 'Generating...' :
                     hypStatus === 'error'   ? 'Retry'         :
                                              'Generate Hypothesis'}
                </button>
                <button
                    className="dm-node__action-btn dm-node__action-btn--ghost"
                    onClick={handleDismiss}
                    title="Remove this insight"
                >
                    Dismiss
                </button>
            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default InsightNode;
