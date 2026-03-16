import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './DataModeApp.css';

/**
 * DataModeApp — Data Mode React Flow canvas (Phase 1 scaffold)
 *
 * This is the root of the Data Mode system. It is intentionally isolated
 * from Q&A Mode — no shared components, state, or node types.
 *
 * Mental model:
 *   dataset driven → hypothesis pipeline → statistical testing → insight exploration
 *
 * Current status: Phase 1 scaffold — canvas with placeholder nodes.
 * Phase 2 will introduce:
 *   - DatasetNode    (upload / connect dataset)
 *   - HypothesisNode (define a hypothesis)
 *   - AnalysisNode   (statistical test or transform)
 *   - InsightNode    (result / visualization)
 *   - Custom node types registry
 *   - Data Mode services layer
 */

// Placeholder initial node shown while Data Mode is being built out
const initialNodes = [
    {
        id: 'data-welcome',
        type: 'default',
        position: { x: 300, y: 200 },
        data: {
            label: (
                <div className="data-welcome-label">
                    <div className="data-welcome-icon">📊</div>
                    <div className="data-welcome-title">Data Mode</div>
                    <div className="data-welcome-subtitle">
                        Hypothesis-driven analysis pipeline
                    </div>
                    <div className="data-welcome-status">
                        🚧 Coming in Phase 2
                    </div>
                </div>
            ),
        },
        style: {
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            border: '2px solid #6366f1',
            borderRadius: '16px',
            padding: 0,
            width: 320,
        },
    },
];

const initialEdges = [];

function DataModeApp() {
    return (
        <div className="data-mode-container">
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                fitView
                fitViewOptions={{ padding: 0.4 }}
                minZoom={0.2}
                maxZoom={2}
                nodesDraggable={false}
                nodesConnectable={false}
            >
                <Background color="#6366f1" gap={24} size={1} style={{ opacity: 0.15 }} />
                <Controls position="bottom-right" />
                <MiniMap
                    position="bottom-left"
                    nodeColor="#6366f1"
                    maskColor="rgba(0,0,0,0.3)"
                />
            </ReactFlow>
        </div>
    );
}

export default DataModeApp;
