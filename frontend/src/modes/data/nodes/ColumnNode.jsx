import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function ColumnNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--column ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">📋</span>
                Column
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.name || 'Unnamed Column'}</div>
                {data.type && (
                    <div className="dm-node__meta">Type: {data.type}</div>
                )}
                {data.nullCount != null && (
                    <div className="dm-node__meta">Nulls: {data.nullCount}</div>
                )}
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default ColumnNode;
