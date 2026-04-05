import './ModeSwitcher.css';

function ModeSwitcher({ currentMode, onModeChange }) {
    const toggle = () => onModeChange(currentMode === 'qa' ? 'data' : 'qa');

    return (
        <div className="mode-toggle">

            <span
                className={`mode-toggle__label ${currentMode === 'qa' ? 'mode-toggle__label--active' : ''}`}
                onClick={() => onModeChange('qa')}
            >
                Q&A Mode
            </span>

            <button
                className={`mode-toggle__track mode-toggle__track--${currentMode}`}
                onClick={toggle}
                role="switch"
                aria-checked={currentMode === 'data'}
                aria-label="Switch between Q&A and Data mode"
            >
                <span className={`mode-toggle__knob ${currentMode === 'data' ? 'mode-toggle__knob--data' : ''}`} />
            </button>

            <span
                className={`mode-toggle__label ${currentMode === 'data' ? 'mode-toggle__label--active' : ''}`}
                onClick={() => onModeChange('data')}
            >
                Data Mode
            </span>

        </div>
    );
}

export default ModeSwitcher;
