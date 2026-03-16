import { create } from 'zustand';

/**
 * useDataModeStore — Zustand store for Data Mode
 *
 * Single source of truth for all Data Mode state.
 * Completely isolated from Q&A Mode.
 */
const useDataModeStore = create((set, get) => ({

    // ── Graph state ──────────────────────────────────────────
    nodes: [],
    edges: [],

    // ── Selection ────────────────────────────────────────────
    selectedNode: null,

    // ── Dataset ──────────────────────────────────────────────
    // Metadata: { name, rowCount, columnCount, source }
    datasetMetadata: null,
    // Spec: { columns: [{ name, type, nullCount, uniqueCount }] }
    datasetSpec: null,

    // ── AI output ────────────────────────────────────────────
    insightSuggestions: [],

    // ── Pipeline progress ────────────────────────────────────
    // e.g. 'idle' | 'dataset' | 'hypothesis' | 'test' | 'result' | 'insight'
    workflowStep: 'idle',


    // ── Actions ──────────────────────────────────────────────

    /** Replace the full nodes array (mirrors ReactFlow's setNodes signature) */
    setNodes: (nodes) => set({
        nodes: typeof nodes === 'function' ? nodes(get().nodes) : nodes,
    }),

    /** Replace the full edges array */
    setEdges: (edges) => set({
        edges: typeof edges === 'function' ? edges(get().edges) : edges,
    }),

    /** Append a single node */
    addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),

    /** Append a single edge */
    addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),

    /** Set the currently selected node (null to clear) */
    setSelectedNode: (node) => set({ selectedNode: node }),

    /**
     * Load dataset info into the store.
     * @param {{ metadata: object, spec: object }} payload
     */
    setDataset: ({ metadata, spec }) => set({
        datasetMetadata: metadata,
        datasetSpec: spec,
        workflowStep: 'dataset',
    }),

    /** Update AI-generated insight suggestions */
    setInsights: (suggestions) => set({
        insightSuggestions: suggestions,
        workflowStep: 'insight',
    }),

}));

export default useDataModeStore;
