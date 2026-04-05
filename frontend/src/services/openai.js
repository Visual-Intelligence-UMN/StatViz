import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../constants/api';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
});

/**
 * Get an AI response formatted as bullet points
 * @param {string} query - The user's question
 * @param {Array} context - Optional context from previous interactions
 * @returns {Promise<Array<string>>} - Array of bullet points (max 6)
 */
export async function getAIResponse(query, context = []) {
  try {
    const systemPrompt = `You are a helpful AI assistant that provides clear, concise answers. 
Format your response as 5-6 bullet points maximum. Each bullet point should be:
- A complete, standalone sentence or statement
- Clear and informative
- Not numbered or prefixed with bullet symbols (just the text)
Keep responses focused and relevant to the question.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: query }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0].message.content;
    
    // Parse the response into bullet points
    const bullets = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove common bullet point prefixes
        return line
          .replace(/^[-•*]\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .trim();
      })
      .filter(line => line.length > 0)
      .slice(0, 6); // Limit to 6 bullets

    return bullets;
  } catch (error) {
    console.error('Error fetching AI response:', error);
    
    // Return error message as bullets
    if (error.status === 401) {
      return ['API key is invalid or expired. Please check your OpenAI API key.'];
    } else if (error.status === 429) {
      return ['Rate limit exceeded. Please wait a moment and try again.'];
    } else {
      return [
        'Error getting AI response. Please try again.',
        `Error details: ${error.message || 'Unknown error'}`
      ];
    }
  }
}

/**
 * Expand on a specific bullet point
 * @param {string} bulletText - The bullet point to expand on
 * @param {string} originalQuery - The original question for context
 * @returns {Promise<Array<string>>} - Array of bullet points elaborating on the topic
 */
export async function expandBullet(bulletText, originalQuery) {
  const expandQuery = `Based on this context: "${originalQuery}", please elaborate on this point: "${bulletText}". Provide 5-6 detailed bullet points.`;
  return getAIResponse(expandQuery);
}

/**
 * Get sources/references for a bullet point
 * @param {string} bulletText - The bullet point to find sources for
 * @returns {Promise<Array<string>>} - Array of source references
 */
export async function getBulletSources(bulletText) {
  const sourcesQuery = `What are credible sources or references for this statement: "${bulletText}"? Provide 4-5 specific sources with brief descriptions.`;
  return getAIResponse(sourcesQuery);
}
