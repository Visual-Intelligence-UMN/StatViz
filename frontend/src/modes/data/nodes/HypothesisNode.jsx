import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function HypothesisNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--hypothesis ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">🔬</span>
                Hypothesis
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.statement || 'Define a hypothesis...'}</div>
                {data.nullHypothesis && (
                    <div className="dm-node__meta">H₀: {data.nullHypothesis}</div>
                )}
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default HypothesisNode;
