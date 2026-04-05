import { Handle, Position } from '@xyflow/react';
import useDataModeStore from '../store/useDataModeStore';
import './nodes.css';

const TYPE_LABEL = {
    association:               'Association',
    group_difference:          'Group Difference',
    categorical_relationship:  'Categorical Rel.',
    distribution_difference:   'Distribution Diff.',
};

const DIR_LABEL = {
    positive:           'Positive',
    negative:           'Negative',
    'non-directional':  'Non-directional',
    'two-tailed':       'Two-tailed',
};

function HypothesisNode({ id, data, selected }) {
    const updateNodeData = useDataModeStore((s) => s.updateNodeData);

    const status  = data.status ?? 'pending';
    const typeKey = (data.type ?? '').replace(/-/g, '_');

    const handleAccept = (e) => {
        e.stopPropagation();
        updateNodeData(id, { status: status === 'accepted' ? 'pending' : 'accepted' });
    };

    const handleReject = (e) => {
        e.stopPropagation();
        updateNodeData(id, { status: status === 'rejected' ? 'pending' : 'rejected' });
    };

    return (
        <div className={`dm-node dm-node--hypothesis dm-node--${status} ${selected ? 'dm-node--selected' : ''}`}>

            {/* Header */}
            <div className="dm-node__header">
                Hypothesis
                <div className="hyp__header-meta">
                    {data.label && (
                        <span className="hyp__label">{data.label}</span>
                    )}
                    {status !== 'pending' && (
                        <span className={`hyp__status hyp__status--${status}`}>
                            {status === 'accepted' ? 'Accepted' : 'Rejected'}
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="dm-node__body">

                {data.title && (
                    <div className="dm-node__label">{data.title}</div>
                )}

                {data.statement && (
                    <div className="hyp__statement">"{data.statement}"</div>
                )}

                {typeKey && (
                    <span className={`hyp__type-badge hyp__type-badge--${typeKey}`}>
                        {TYPE_LABEL[typeKey] ?? data.type}
                    </span>
                )}

                {data.variables?.length > 0 && (
                    <div className="dm-node__tags">
                        {data.variables.map((v) => (
                            <span key={v} className="dm-node__tag">{v}</span>
                        ))}
                    </div>
                )}

                {data.suggested_test && (
                    <div className="hyp__test">
                        <strong>Test:</strong> {data.suggested_test}
                        {data.directionality && (
                            <> · {DIR_LABEL[data.directionality] ?? data.directionality}</>
                        )}
                    </div>
                )}

                {data.assumption_notes && (
                    <div className="hyp__note">{data.assumption_notes}</div>
                )}

                {data.visualization_suggestion && (
                    <div className="hyp__viz">{data.visualization_suggestion}</div>
                )}

            </div>

            {/* Actions */}
            <div className="dm-node__actions">
                <button
                    className={`dm-node__action-btn ${
                        status === 'accepted'
                            ? 'dm-node__action-btn--active-green'
                            : 'dm-node__action-btn--ghost'
                    }`}
                    onClick={handleAccept}
                    title={status === 'accepted' ? 'Undo accept' : 'Accept this hypothesis'}
                >
                    Accept
                </button>
                <button
                    className={`dm-node__action-btn ${
                        status === 'rejected'
                            ? 'dm-node__action-btn--active-red'
                            : 'dm-node__action-btn--ghost'
                    }`}
                    onClick={handleReject}
                    title={status === 'rejected' ? 'Undo reject' : 'Reject this hypothesis'}
                >
                    Reject
                </button>
                <button
                    className="dm-node__action-btn dm-node__action-btn--ghost"
                    disabled
                    title="Editing coming in a future phase"
                >
                    Edit
                </button>
                <button
                    className="dm-node__action-btn dm-node__action-btn--primary"
                    disabled
                    title="Run Test coming in next phase"
                >
                    Run Test
                </button>
            </div>

            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default HypothesisNode;
