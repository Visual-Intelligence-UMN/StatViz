import { useRef, useState } from 'react';
import useDataModeStore from '../store/useDataModeStore';
import './DatasetSidebar.css';

/**
 * Parses the first line of a CSV file to extract column names.
 * Returns a promise resolving to an array of column name strings.
 */
function parseCsvHeaders(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const firstLine = text.split('\n')[0] || '';
            const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
            resolve(headers);
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * Counts the approximate number of data rows in a CSV string.
 */
function countRows(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split('\n').filter((l) => l.trim());
            resolve(Math.max(0, lines.length - 1)); // subtract header row
        };
        reader.readAsText(file);
    });
}

function DatasetSidebar() {
    const fileInputRef = useRef(null);
    const [dataset, setDataset] = useState(null); // { name, rows, columns }
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const addNode = useDataModeStore((s) => s.addNode);
    const addEdge = useDataModeStore((s) => s.addEdge);
    const setDataset_ = useDataModeStore((s) => s.setDataset);

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        try {
            const [headers, rowCount] = await Promise.all([
                parseCsvHeaders(file),
                countRows(file),
            ]);

            const meta = {
                name: file.name,
                rows: rowCount,
                columns: headers.length,
                source: 'Local upload',
            };

            const spec = {
                columns: headers.map((h) => ({ name: h, type: 'unknown', nullCount: 0 })),
            };

            // Update sidebar display state
            setDataset(meta);
            setColumns(spec.columns);

            // Update Zustand store
            setDataset_({ metadata: meta, spec });

            // ── Create Dataset node ──────────────────────────────
            const datasetNodeId = `dataset-${Date.now()}`;
            addNode({
                id: datasetNodeId,
                type: 'dataset',
                position: { x: 400, y: 50 },
                data: meta,
            });

            // ── Create one Column node per header ────────────────
            headers.forEach((colName, i) => {
                const colId = `col-${Date.now()}-${i}`;
                const spacing = 240;
                const startX = 400 - ((headers.length - 1) * spacing) / 2;

                addNode({
                    id: colId,
                    type: 'column',
                    position: { x: startX + i * spacing, y: 230 },
                    data: { name: colName, type: 'unknown', nullCount: 0 },
                });

                addEdge({
                    id: `e-${datasetNodeId}-${colId}`,
                    source: datasetNodeId,
                    target: colId,
                    style: { stroke: '#3b82f6', strokeWidth: 2 },
                });
            });

        } catch (err) {
            setError('Failed to parse CSV. Please check the file format.');
            console.error(err);
        } finally {
            setLoading(false);
            // Reset file input so the same file can be re-uploaded
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="dsb">

            {/* ── Upload area ────────────────────────────────── */}
            <div className="dsb__section-label">Dataset</div>

            <button
                className="dsb__upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
            >
                {loading ? '⏳ Parsing…' : '⬆ Upload CSV'}
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleUpload}
                style={{ display: 'none' }}
            />

            {error && <div className="dsb__error">{error}</div>}

            {/* ── Dataset summary ────────────────────────────── */}
            {dataset && (
                <div className="dsb__summary">
                    <div className="dsb__summary-name" title={dataset.name}>
                        📄 {dataset.name}
                    </div>
                    <div className="dsb__summary-meta">
                        {dataset.rows.toLocaleString()} rows · {dataset.columns} columns
                    </div>
                </div>
            )}

            {/* ── Column list ────────────────────────────────── */}
            {columns.length > 0 && (
                <>
                    <div className="dsb__divider" />
                    <div className="dsb__section-label">Schema</div>
                    <div className="dsb__col-list">
                        {columns.map((col) => (
                            <div key={col.name} className="dsb__col-item">
                                <span className="dsb__col-name">{col.name}</span>
                                <span className="dsb__col-type">{col.type}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ── Empty schema state ─────────────────────────── */}
            {columns.length === 0 && !loading && (
                <>
                    <div className="dsb__divider" />
                    <div className="dsb__section-label">Schema</div>
                    <div className="dsb__empty">Upload a CSV to see columns</div>
                </>
            )}

        </div>
    );
}

export default DatasetSidebar;
