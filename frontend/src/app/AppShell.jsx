import { useState } from 'react';
import ModeSwitcher from './ModeSwitcher';
import QAModeApp from '../modes/qa/QAModeApp';
import DataModeApp from '../modes/data/DataModeApp';
import './AppShell.css';

/**
 * AppShell
 *
 * Top-level application container that owns the current mode state
 * and renders the appropriate mode application.
 *
 * Modes:
 *   "qa"   → Q&A Mode (MindMapCanvas — existing reasoning graph)
 *   "data" → Data Mode (DataModeApp — hypothesis-driven analysis pipeline)
 *
 * Architectural rule: the two mode apps are intentionally isolated.
 * No logic or node components are shared between Q&A and Data Mode.
 */
function AppShell() {
    const [mode, setMode] = useState('data');

    return (
        <div className="app-shell">
            {/* Global mode switcher */}
            {/* <ModeSwitcher currentMode={mode} onModeChange={setMode} /> */}

            {/* Mode renders — only one is mounted at a time */}
            {/* {mode === 'qa' && <QAModeApp />}
            {mode === 'data' && <DataModeApp />} */}

            <DataModeApp />
        </div>
    );
}

export default AppShell;
