import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function InterpretationNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--interpretation ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">🧠</span>
                Interpretation
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.text || 'No interpretation yet'}</div>
                {data.source && (
                    <div className="dm-node__meta">via {data.source}</div>
                )}
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default InterpretationNode;
