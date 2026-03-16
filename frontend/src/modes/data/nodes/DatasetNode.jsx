import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function DatasetNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--dataset ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">🗃️</span>
                Dataset
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.name || 'Untitled Dataset'}</div>
                {data.rows != null && (
                    <div className="dm-node__meta">{data.rows} rows · {data.columns} columns</div>
                )}
                {data.source && (
                    <div className="dm-node__meta">Source: {data.source}</div>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default DatasetNode;
