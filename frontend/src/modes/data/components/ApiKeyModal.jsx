import { useState } from 'react';
import useDataModeStore from '../store/useDataModeStore';
import './ApiKeyModal.css';

function ApiKeyModal() {
    const [value, setValue] = useState('');
    const setApiKey = useDataModeStore((s) => s.setApiKey);

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) setApiKey(trimmed);
    };

    return (
        <div className="akm__overlay">
            <div className="akm__card">
                <div className="akm__icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                </div>
                <h2 className="akm__title">Enter your OpenAI API key</h2>
                <p className="akm__desc">
                    StatViz uses OpenAI to generate dataset descriptions, insights, and hypotheses.
                    Your key is stored only in this browser session and sent directly to OpenAI — never anywhere else.
                </p>
                <form className="akm__form" onSubmit={handleSubmit}>
                    <input
                        className="akm__input"
                        type="password"
                        placeholder="sk-..."
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <button
                        className="akm__btn"
                        type="submit"
                        disabled={!value.trim()}
                    >
                        Start using StatViz
                    </button>
                </form>
                <a
                    className="akm__link"
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Get an API key →
                </a>
            </div>
        </div>
    );
}

export default ApiKeyModal;
