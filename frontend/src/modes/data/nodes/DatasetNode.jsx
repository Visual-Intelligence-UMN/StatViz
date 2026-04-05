import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import './nodes.css';

const EDGE_SUMMARY = {
    stroke:          '#374151',
    strokeWidth:     1.5,
    strokeDasharray: '4,3',
};

function DatasetNode({ id, data, selected }) {
    // Reactive: button appears once spec is loaded
    const hasSpec = useDataModeStore((s) => !!s.datasetSpec);

    // Reactive: tracks whether a summary node exists and its collapsed state
    const summaryNode      = useDataModeStore(
        (s) => s.nodes.find((n) => n.id === `summary-${id}`) ?? null
    );
    const summaryCollapsed = summaryNode?.data?.collapsed ?? true;

    // ── View Summary ──────────────────────────────────────────────────────

    const handleViewSummary = () => {
        const { nodes, addNode, addEdge, updateNodeData, datasetSpec } =
            useDataModeStore.getState();

        if (!datasetSpec) return;

        const summaryId = `summary-${id}`;
        const exists    = nodes.find((n) => n.id === summaryId);

        if (!exists) {
            const thisNode = nodes.find((n) => n.id === id);
            const pos      = thisNode?.position ?? { x: 400, y: 200 };

            addNode({
                id:       summaryId,
                type:     'datasetsummary',
                position: { x: pos.x + 380, y: pos.y },
                data:     { spec: datasetSpec, collapsed: false },
            });

            addEdge({
                id:     `e-${id}-${summaryId}`,
                source: id,
                target: summaryId,
                style:  EDGE_SUMMARY,
            });
        } else {
            updateNodeData(summaryId, { collapsed: !summaryCollapsed });
        }
    };

    const summaryLabel = !summaryNode
        ? 'View Summary'
        : summaryCollapsed
            ? 'Expand Summary'
            : 'Collapse Summary';

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className={`dm-node dm-node--dataset ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                Dataset
            </div>

            <div className="dm-node__body">
                <div className="dm-node__label">{data.name || 'Untitled Dataset'}</div>
                {data.rows != null && (
                    <div className="dm-node__meta">
                        {data.rows.toLocaleString()} rows · {data.columns} columns
                    </div>
                )}
                {data.source && (
                    <div className="dm-node__meta">Source: {data.source}</div>
                )}
            </div>

            {hasSpec && (
                <div className="dm-node__actions">
                    <button
                        className="dm-node__action-btn dm-node__action-btn--ghost"
                        onClick={handleViewSummary}
                    >
                        {summaryLabel}
                    </button>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default DatasetNode;
