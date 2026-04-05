export { default as DatasetNode } from './DatasetNode';
export { default as DatasetSummaryNode } from './DatasetSummaryNode';
export { default as ColumnNode } from './ColumnNode';
export { default as HypothesisNode } from './HypothesisNode';
export { default as TestNode } from './TestNode';
export { default as ResultNode } from './ResultNode';
export { default as InsightNode } from './InsightNode';
export { default as InterpretationNode } from './InterpretationNode';
export { default as NextStepNode } from './NextStepNode';

// Ready-to-use nodeTypes map — pass directly to <DataCanvas nodeTypes={nodeTypes} />
import DatasetNode from './DatasetNode';
import DatasetSummaryNode from './DatasetSummaryNode';
import ColumnNode from './ColumnNode';
import HypothesisNode from './HypothesisNode';
import TestNode from './TestNode';
import ResultNode from './ResultNode';
import InsightNode from './InsightNode';
import InterpretationNode from './InterpretationNode';
import NextStepNode from './NextStepNode';

export const nodeTypes = {
    dataset:        DatasetNode,
    datasetsummary: DatasetSummaryNode,
    column:         ColumnNode,
    hypothesis:     HypothesisNode,
    test:           TestNode,
    result:         ResultNode,
    insight:        InsightNode,
    interpretation: InterpretationNode,
    nextstep:       NextStepNode,
};

