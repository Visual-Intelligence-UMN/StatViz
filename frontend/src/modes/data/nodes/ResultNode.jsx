import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function ResultNode({ data, selected }) {
    return (
        <div className={`dm-node dm-node--result ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">📈</span>
                Result
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.summary || 'No result yet'}</div>
                {data.pValue != null && (
                    <div className="dm-node__meta">p-value: {data.pValue}</div>
                )}
                {data.significant != null && (
                    <div className="dm-node__meta">
                        {data.significant ? '✅ Significant' : '❌ Not significant'}
                    </div>
                )}
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default ResultNode;
