import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { useCallback } from 'react';
import '@xyflow/react/dist/style.css';
import useDataModeStore from '../store/useDataModeStore';

/**
 * DataCanvas — React Flow canvas for Data Mode.
 *
 * Reads nodes/edges from useDataModeStore (Zustand).
 * nodeTypes and edgeTypes are passed in as props.
 */
function DataCanvas({ nodeTypes = {}, edgeTypes = {} }) {
    const nodes = useDataModeStore((s) => s.nodes);
    const edges = useDataModeStore((s) => s.edges);
    const setNodes = useDataModeStore((s) => s.setNodes);
    const setEdges = useDataModeStore((s) => s.setEdges);
    const storeAddEdge = useDataModeStore((s) => s.addEdge);
    const setSelectedNode = useDataModeStore((s) => s.setSelectedNode);

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [setNodes]
    );

    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        [setEdges]
    );

    const onConnect = useCallback(
        (params) => storeAddEdge(addEdge(params, edges)),
        [storeAddEdge, edges]
    );

    const onNodeClick = useCallback(
        (_event, node) => setSelectedNode(node),
        [setSelectedNode]
    );

    const onPaneClick = useCallback(
        () => setSelectedNode(null),
        [setSelectedNode]
    );

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            maxZoom={2}
            panOnScroll
            zoomOnScroll
            zoomOnPinch
        >
            <Background color="#6366f1" gap={24} size={1} style={{ opacity: 0.12 }} />
            <Controls position="bottom-right" />
            <MiniMap
                position="bottom-left"
                nodeColor="#6366f1"
                maskColor="rgba(0,0,0,0.3)"
            />
        </ReactFlow>
    );
}

export default DataCanvas;
