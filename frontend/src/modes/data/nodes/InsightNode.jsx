import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function InsightNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--insight ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">💡</span>
                Insight
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.text || 'No insight generated'}</div>
                {data.confidence && (
                    <div className="dm-node__meta">Confidence: {data.confidence}</div>
                )}
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default InsightNode;
