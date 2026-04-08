import { Handle, Position } from '@xyflow/react';
import './nodes.css';

function ResultNode({ data, selected }) {
    const sig = data.significant;

    return (
        <div className={`dm-node dm-node--result ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                Result
                {data.aiAssisted && (
                    <span className="res__ai-badge">AI-assisted</span>
                )}
            </div>

            <div className="dm-node__body">

                {/* Method name */}
                {data.method && (
                    <div className="res__method">{data.method}</div>
                )}

                {/* Significance verdict */}
                {sig != null && (
                    <div className={`res__verdict res__verdict--${sig ? 'significant' : 'not'}`}>
                        {sig ? '✓ Significant' : '✗ Not significant'}
                        <span className="res__alpha"> (α = 0.05)</span>
                    </div>
                )}

                {/* Stats row */}
                {(data.stat != null || data.pValue != null) && (
                    <div className="res__stats-row">
                        {data.stat != null && (
                            <span className="res__stat-pill">stat = {data.stat}</span>
                        )}
                        {data.pValue != null && (
                            <span className="res__stat-pill">p = {data.pValue}</span>
                        )}
                    </div>
                )}

                {/* Plain-English summary */}
                {data.summary && (
                    <div className="dm-node__meta res__summary">{data.summary}</div>
                )}

            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default ResultNode;
