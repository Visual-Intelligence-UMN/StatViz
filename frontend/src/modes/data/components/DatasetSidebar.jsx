import { useRef, useState } from 'react';
import useDataModeStore from '../store/useDataModeStore';
import { parseCSV } from '../utils/csvParser';
import './DatasetSidebar.css';

const TYPE_CLASS = {
    numeric:     'numeric',
    datetime:    'datetime',
    categorical: 'categorical',
};

function DatasetSidebar() {
    const fileInputRef = useRef(null);
    const [dataset, setDataset] = useState(null);
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const addNode    = useDataModeStore((s) => s.addNode);
    const setDataset_= useDataModeStore((s) => s.setDataset);
    const resetGraph = useDataModeStore((s) => s.resetGraph);

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        try {
            const { metadata, spec } = await parseCSV(file);

            // Update sidebar display state
            setDataset(metadata);
            setColumns(spec.columns);

            // Reset the canvas and load fresh dataset into the store
            resetGraph();
            setDataset_({ metadata, spec });

            // ── One Dataset node on the canvas ────────────────────
            addNode({
                id:       `dataset-${Date.now()}`,
                type:     'dataset',
                position: { x: 400, y: 200 },
                data:     metadata,
            });

            // Column details live in the sidebar only — no column nodes.

        } catch (err) {
            setError('Failed to parse CSV. Please check the file format.');
            console.error(err);
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="dsb">

            {/* ── Upload ───────────────────────────────────────── */}
            <div className="dsb__section-label">Dataset</div>

            <button
                className="dsb__upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
            >
                {loading ? 'Parsing...' : 'Upload CSV'}
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleUpload}
                style={{ display: 'none' }}
            />

            {error && <div className="dsb__error">{error}</div>}

            {/* ── Dataset summary ──────────────────────────────── */}
            {dataset && (
                <div className="dsb__summary">
                    <div className="dsb__summary-name" title={dataset.name}>
                        {dataset.name}
                    </div>
                    <div className="dsb__summary-meta">
                        {dataset.rows.toLocaleString()} rows · {dataset.columns} columns
                    </div>
                </div>
            )}

            {/* ── Schema ───────────────────────────────────────── */}
            <div className="dsb__divider" />
            <div className="dsb__section-label">Schema</div>

            {columns.length > 0 ? (
                <div className="dsb__col-list">
                    {columns.map((col) => (
                        <div key={col.name} className="dsb__col-item">
                            <span className="dsb__col-name" title={col.name}>
                                {col.name}
                            </span>
                            <div className="dsb__col-stats">
                                <span className={`dsb__col-type dsb__col-type--${TYPE_CLASS[col.type] ?? 'categorical'}`}>
                                    {col.type}
                                </span>
                                <span className="dsb__col-null" title="missing values">
                                    {col.missing_count}↯
                                </span>
                                <span className="dsb__col-unique" title="unique values">
                                    {col.unique_count}#
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="dsb__empty">Upload a CSV to see schema</div>
            )}

        </div>
    );
}

export default DatasetSidebar;
