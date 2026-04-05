import { useRef, useState } from 'react';
import useDataModeStore from '../store/useDataModeStore';
import { parseCSV } from '../utils/csvParser';
import './UploadPopup.css';

function UploadPopup({ position, onClose }) {
    const fileInputRef = useRef(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);
    const [dragging, setDragging] = useState(false);

    const addNode    = useDataModeStore((s) => s.addNode);
    const setDataset = useDataModeStore((s) => s.setDataset);
    const resetGraph = useDataModeStore((s) => s.resetGraph);

    const processFile = async (file) => {
        if (!file) return;
        setLoading(true);
        setError(null);
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
            onClose();
        } catch (err) {
            setError('Could not parse this file. Please check it is a valid CSV.');
            console.error(err);
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileInput = (e) => processFile(e.target.files?.[0]);

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e) => { e.preventDefault(); setDragging(true);  };
    const handleDragLeave = ()  => setDragging(false);

    const POPUP_W = 300;
    const POPUP_H = error ? 220 : 180;
    const left = Math.min(Math.max(position.x - POPUP_W / 2, 12), window.innerWidth  - POPUP_W - 12);
    const top  = Math.min(Math.max(position.y - 16,          12), window.innerHeight - POPUP_H - 12);

    return (
        <>
            <div className="upl-backdrop" onClick={onClose} />

            <div className="upl-popup" style={{ left, top, width: POPUP_W }}>
                <div className="upl-popup__header">
                    <span className="upl-popup__title">Upload Dataset</span>
                    <button className="upl-popup__close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* Drop zone — also acts as the click target */}
                <div
                    className={`upl-popup__dropzone ${dragging ? 'upl-popup__dropzone--over' : ''} ${loading ? 'upl-popup__dropzone--loading' : ''}`}
                    onClick={() => !loading && fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <span className="upl-popup__drop-icon">📂</span>
                    <span className="upl-popup__drop-text">
                        {loading ? 'Parsing…' : 'Drag and drop dataset here\nor click to upload'}
                    </span>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileInput}
                    style={{ display: 'none' }}
                />

                {error && <div className="upl-popup__error">{error}</div>}
            </div>
        </>
    );
}

export default UploadPopup;
