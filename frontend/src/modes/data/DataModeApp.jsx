import { useState, useEffect, useCallback } from 'react';
import './DataModeApp.css';
import DataCanvas from './components/DataCanvas';
import UploadPopup from './components/UploadPopup';
import useDataModeStore from './store/useDataModeStore';
import { parseCSV } from './utils/csvParser';
import { nodeTypes } from './nodes/index';

function DataModeApp() {
    const [theme, setTheme]         = useState('light');
    const [uploadPos, setUploadPos] = useState(null);
    const [dragOver, setDragOver]   = useState(false);

    const datasetMetadata = useDataModeStore((s) => s.datasetMetadata);
    const addNode         = useDataModeStore((s) => s.addNode);
    const setDataset      = useDataModeStore((s) => s.setDataset);
    const resetGraph      = useDataModeStore((s) => s.resetGraph);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        return () => document.documentElement.removeAttribute('data-theme');
    }, [theme]);

    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

    // Click-to-upload popup (kept as-is)
    const handlePaneClick = useCallback((event) => {
        if (!datasetMetadata) setUploadPos({ x: event.clientX, y: event.clientY });
    }, [datasetMetadata]);

    // Direct drag-and-drop onto the canvas
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        if (!datasetMetadata) setDragOver(true);
    }, [datasetMetadata]);

    const handleDragLeave = useCallback((e) => {
        // Only clear when leaving the shell entirely
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        try {
            const { metadata, spec } = await parseCSV(file);
            resetGraph();
            setDataset({ metadata, spec });
            addNode({
                id:       `dataset-${Date.now()}`,
                type:     'dataset',
                position: { x: 400, y: 200 },
                data:     metadata,
            });
        } catch (err) {
            console.error('Drop parse error:', err);
        }
    }, [addNode, setDataset, resetGraph]);

    return (
        <div
            className={`dm-shell ${dragOver ? 'dm-shell--drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >

            {/* Dark mode toggle — top right corner */}
            <div className="dm-theme-fab">
                <span className="dm-theme-label">Dark Mode</span>
                <button
                    className={`dm-theme-track ${theme === 'dark' ? 'dm-theme-track--on' : ''}`}
                    onClick={toggleTheme}
                    role="switch"
                    aria-checked={theme === 'dark'}
                    aria-label="Toggle dark mode"
                >
                    <span className="dm-theme-knob" />
                </button>
            </div>

            {/* ── Canvas ──────────────────────────────────── */}
            <main className="dm-canvas">
                <DataCanvas nodeTypes={nodeTypes} onPaneClick={handlePaneClick} />

                {/* Empty-state hint */}
                {!datasetMetadata && (
                    <div className="dm-canvas__empty-state">
                        <div className="dm-canvas__empty-title">
                            {dragOver ? 'Drop to upload' : 'Drag & drop a CSV, or click anywhere to upload'}
                        </div>
                        {!dragOver && (
                            <div className="dm-canvas__empty-sub">Your analysis graph will appear here</div>
                        )}
                    </div>
                )}

                {/* Full-canvas drag overlay */}
                {dragOver && !datasetMetadata && (
                    <div className="dm-canvas__drag-overlay" />
                )}
            </main>

            {/* Upload popup (click path) */}
            {uploadPos && (
                <UploadPopup
                    position={uploadPos}
                    onClose={() => setUploadPos(null)}
                />
            )}

        </div>
    );
}

export default DataModeApp;
