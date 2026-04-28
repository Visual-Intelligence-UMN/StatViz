import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import ResultChart from './charts/ResultChart';
import './nodes.css';

function ResultNode({ data, selected }) {
    const datasetSpec = useDataModeStore((s) => s.datasetSpec);

    return (
        <div className={`dm-node dm-node--result ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                Result
                {data.identifier && <span className="dm-node__header-id">{data.identifier}</span>}
                {data.aiAssisted && (
                    <span className="res__ai-badge">AI-assisted</span>
                )}
            </div>

            <div className="dm-node__body">

                {/* Method name */}
                {data.method && (
                    <div className="res__method">{data.method}</div>
                )}

                <ResultChart
                    chart_type={data.chart_type}
                    columns={data.columns}
                    spec={datasetSpec}
                    significant={data.significant}
                    aiAssisted={data.aiAssisted}
                    pValue={data.pValue}
                    stat={data.stat}
                    method={data.method}
                    testType={data.testType}
                    evidence={data.evidence}
                />

            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default ResultNode;
