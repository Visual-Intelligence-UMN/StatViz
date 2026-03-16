import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function TestNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--test ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">⚗️</span>
                Statistical Test
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.testType || 'No test selected'}</div>
                {data.alpha != null && (
                    <div className="dm-node__meta">α = {data.alpha}</div>
                )}
                {data.status && (
                    <div className="dm-node__meta">Status: {data.status}</div>
                )}
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default TestNode;
