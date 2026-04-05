import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import '@xyflow/react/dist/style.css';
import useDataModeStore from '../store/useDataModeStore';
import { layoutGraph } from '../utils/layoutGraph';

/**
 * LayoutEngine — runs Dagre inside the ReactFlow context so we can call
 * fitView after repositioning nodes.
 *
 * Triggers re-layout when:
 *   • a node or edge is added / removed  (nodes.length / edges.length)
 *   • the DatasetSummaryNode is expanded or collapsed  (summaryCollapsed)
 *     because its rendered height changes dramatically
 *
 * Does NOT re-layout when a user drags a node — drag only changes
 * node positions, not the counts or the collapsed flag.
 */
function LayoutEngine() {
    const nodes    = useDataModeStore((s) => s.nodes);
    const edges    = useDataModeStore((s) => s.edges);
    const setNodes = useDataModeStore((s) => s.setNodes);
    const { fitView } = useReactFlow();

    // Track the collapsed state of the summary node so we can re-layout
    // when it expands (becomes ~500 px tall) or collapses (~110 px)
    const summaryCollapsed = useDataModeStore(
        (s) => s.nodes.find((n) => n.type === 'datasetsummary')?.data?.collapsed ?? true
    );

    // Avoid running layout on the very first mount with no nodes
    const hasMounted = useRef(false);

    useEffect(() => {
        if (nodes.length === 0) {
            hasMounted.current = false;
            return;
        }
        hasMounted.current = true;

        const laid = layoutGraph(nodes, edges);
        setNodes(laid);

        // Give React one frame to commit new positions before fitting
        setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 60);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes.length, edges.length, summaryCollapsed]);

    return null;
}

/**
 * DataCanvas — React Flow canvas for Data Mode.
 *
 * onPaneClick(event) — optional callback fired when the user clicks blank canvas.
 *   Receives the native MouseEvent so callers can read clientX/clientY.
 */
function DataCanvas({ nodeTypes = {}, edgeTypes = {}, onPaneClick: externalPaneClick }) {
    const nodes           = useDataModeStore((s) => s.nodes);
    const edges           = useDataModeStore((s) => s.edges);
    const setNodes        = useDataModeStore((s) => s.setNodes);
    const setEdges        = useDataModeStore((s) => s.setEdges);
    const storeAddEdge    = useDataModeStore((s) => s.addEdge);
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

    const onNodeClick  = useCallback((_e, node) => setSelectedNode(node),  [setSelectedNode]);
    const onPaneClick  = useCallback((event) => {
        setSelectedNode(null);
        externalPaneClick?.(event);
    }, [setSelectedNode, externalPaneClick]);

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
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            panOnScroll
            zoomOnScroll
            zoomOnPinch
        >
            <LayoutEngine />
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
