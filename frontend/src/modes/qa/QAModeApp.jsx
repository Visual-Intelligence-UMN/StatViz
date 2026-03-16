import MindMapCanvas from '../../components/MindMapCanvas';

/**
 * QAModeApp — Wrapper for the Q&A reasoning graph mode.
 *
 * Intentionally thin: its only job is to mount the existing
 * MindMapCanvas system when Q&A Mode is active.
 *
 * Do not add logic here — all Q&A orchestration lives in MindMapCanvas.
 */
function QAModeApp() {
    return <MindMapCanvas />;
}

export default QAModeApp;
