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
    // Spec: {
    //   rowCount, columnCount, numericCount, categoricalCount,
    //   columns: [{
    //     name, type, missing_count, unique_count, total_count,
    //     stats:      { mean, median, min, max, std }   // numeric
    //     top_values: [{ value, count }]                // categorical/datetime
    //   }]
    // }
    datasetSpec: null,

    // ── AI output ────────────────────────────────────────────
    insightSuggestions: [],

    // ── Dataset description (AI-generated, user-editable) ────
    datasetDescription: '',

    // ── Pipeline progress ────────────────────────────────────
    // e.g. 'idle' | 'dataset' | 'hypothesis' | 'test' | 'result' | 'insight'
    workflowStep: 'idle',

    // ── API key (user-supplied, stored in sessionStorage) ────────────
    apiKey: sessionStorage.getItem('sv_openai_key') || '',


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

    /** Set or update the user-editable dataset description */
    setDatasetDescription: (text) => set({ datasetDescription: text }),

    /** Store the user-supplied OpenAI API key in state + sessionStorage */
    setApiKey: (key) => {
        sessionStorage.setItem('sv_openai_key', key);
        set({ apiKey: key });
    },

    /** Clear all nodes and edges (used before loading a new dataset) */
    resetGraph: () => set({ nodes: [], edges: [], datasetDescription: '' }),

    /**
     * Remove a node and all edges connected to it.
     * Used by node-level "Ignore" actions.
     */
    removeNode: (nodeId) => set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    })),

    /**
     * Merge data into an existing node's data field.
     */
    updateNodeData: (nodeId, patch) => set((state) => ({
        nodes: state.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
        ),
    })),

}));

export default useDataModeStore;
