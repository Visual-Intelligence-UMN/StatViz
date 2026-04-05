import { Handle, Position } from '@xyflow/react';
import './nodes.css';

// Maps inferred type to a short coloured label
const TYPE_LABEL = {
    numeric:     { label: 'NUM',  color: '#6ee7b7' },
    datetime:    { label: 'DATE', color: '#fcd34d' },
    categorical: { label: 'CAT', color: '#a5b4fc' },
};

function ColumnNode({ data, selected }) {
    const { label: typeLabel, color: typeColor } =
        TYPE_LABEL[data.type] ?? TYPE_LABEL.categorical;

    return (
        <div className={`dm-node dm-node--column ${selected ? 'dm-node--selected' : ''}`}>
            <div className="dm-node__header">
                <span className="dm-node__icon">📋</span>
                Column
            </div>
            <div className="dm-node__body">
                <div className="dm-node__label">{data.name || 'Unnamed Column'}</div>

                {/* Type badge */}
                <div className="dm-node__meta" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.07)',
                        color: typeColor,
                        border: `1px solid ${typeColor}40`,
                    }}>
                        {typeLabel}
                    </span>
                </div>

                {/* Null + unique counts */}
                <div className="dm-node__meta" style={{ display: 'flex', gap: 10 }}>
                    {data.nullCount != null && (
                        <span title="missing values">↯ {data.nullCount.toLocaleString()} missing</span>
                    )}
                    {data.uniqueCount != null && (
                        <span title="unique values"># {data.uniqueCount.toLocaleString()} unique</span>
                    )}
                </div>
            </div>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default ColumnNode;
