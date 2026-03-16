import './ModeSwitcher.css';

const MODES = [
    {
        id: 'qa',
        label: 'Q&A Mode',
        icon: '💡',
        description: 'Question-driven reasoning graph',
    },
    {
        id: 'data',
        label: 'Data Mode',
        icon: '📊',
        description: 'Hypothesis-driven data analysis',
    },
];

/**
 * ModeSwitcher
 *
 * A floating pill-style toggle positioned top-left in the viewport.
 * Renders one button per mode; the active mode is highlighted.
 *
 * Props:
 *   currentMode  {string}   - Currently active mode ID ("qa" | "data")
 *   onModeChange {function} - Callback invoked with the new mode ID
 */
function ModeSwitcher({ currentMode, onModeChange }) {
    return (
        <div className="mode-switcher" role="tablist" aria-label="Application mode">
            {MODES.map((mode) => {
                const isActive = mode.id === currentMode;
                return (
                    <button
                        key={mode.id}
                        className={`mode-btn ${isActive ? 'mode-btn--active' : ''}`}
                        onClick={() => onModeChange(mode.id)}
                        role="tab"
                        aria-selected={isActive}
                        title={mode.description}
                    >
                        <span className="mode-btn__icon">{mode.icon}</span>
                        <span className="mode-btn__label">{mode.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default ModeSwitcher;
