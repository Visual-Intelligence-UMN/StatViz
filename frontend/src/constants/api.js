// Perplexity
export const PERPLEXITY_API_KEY = import.meta.env.VITE_PERPLEXITY_API_KEY;
export const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

// OpenAI — key is user-supplied at runtime, never hardcoded
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Returns the OpenAI API key entered by the user this session. */
export const getApiKey = () => sessionStorage.getItem('sv_openai_key') || '';
