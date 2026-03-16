import { useEffect } from 'react';
import './DataModeApp.css';
import DataCanvas from './components/DataCanvas';
import DatasetSidebar from './components/DatasetSidebar';
import useDataModeStore from './store/useDataModeStore';
import { nodeTypes } from './nodes/index';
import { mockNodes, mockEdges } from './utils/mockGraph';

function DataModeApp() {
    const setNodes = useDataModeStore((s) => s.setNodes);
    const setEdges = useDataModeStore((s) => s.setEdges);

    // Seed the canvas with mock data when Data Mode first mounts
    useEffect(() => {
        setNodes(mockNodes);
        setEdges(mockEdges);
    }, []);

    return (
        <div className="dm-shell">

            {/* ── Top Toolbar ───────────────────────────────── */}
            <header className="dm-toolbar">
                <div className="dm-toolbar__brand">
                    <span className="dm-toolbar__icon">📊</span>
                    <span className="dm-toolbar__title">Data Mode</span>
                </div>
                <div className="dm-toolbar__actions">
                    <button className="dm-btn dm-btn--ghost">+ Add Dataset</button>
                    <button className="dm-btn dm-btn--ghost">+ Hypothesis</button>
                    <button className="dm-btn dm-btn--primary">▶ Run Analysis</button>
                </div>
            </header>

            {/* ── Body row ──────────────────────────────────── */}
            <div className="dm-body">

                {/* Left Sidebar — Dataset / Schema */}
                <aside className="dm-sidebar">
                    <DatasetSidebar />
                </aside>

                {/* Center Canvas — React Flow */}
                <main className="dm-canvas">
                    <DataCanvas nodeTypes={nodeTypes} />
                </main>

                {/* Right Panel — Inspector / Suggestions */}
                <aside className="dm-inspector">
                    <div className="dm-sidebar__section-label">Inspector</div>
                    <div className="dm-sidebar__empty">Select a node to inspect</div>

                    <div className="dm-sidebar__divider" />

                    <div className="dm-sidebar__section-label">Suggestions</div>
                    <div className="dm-sidebar__empty">Suggestions will appear here</div>
                </aside>

            </div>
        </div>
    );
}

export default DataModeApp;
