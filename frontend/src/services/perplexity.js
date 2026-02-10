import { PERPLEXITY_API_KEY, PERPLEXITY_API_URL } from '../constants/api';

/**
 * Get an AI response from Perplexity Sonar formatted as bullet points
 * @param {string} query - The user's question
 * @param {Array} context - Optional context from previous interactions
 * @returns {Promise<Array<string>>} - Array of bullet points (max 6)
 */
export async function getAIResponse(query, context = []) {
  try {
    const systemPrompt = `You are a helpful AI assistant that provides clear, concise answers with the latest information. 
Format your response as 5-6 bullet points maximum. Each bullet point should be:
- A complete, standalone sentence or statement
- Clear and informative
- Include relevant facts, data, or recent developments
- Not numbered or prefixed with bullet symbols (just the text)
Keep responses focused and relevant to the question.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: query }
    ];

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the response into bullet points
    const bullets = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove common bullet point prefixes and formatting
        return line
          .replace(/^[-•*]\s*/, '')           // Remove bullet markers
          .replace(/^\d+\.\s*/, '')           // Remove numbered lists
          .replace(/\*\*/g, '')               // Remove bold markdown
          .replace(/\[[\d,\s]+\]/g, '')       // Remove citation markers like [1][2][3]
          .replace(/\[\d+\]/g, '')            // Remove individual citations like [1]
          .trim();
      })
      .filter(line => line.length > 0)
      .slice(0, 6); // Limit to 6 bullets

    return bullets;
  } catch (error) {
    console.error('Error fetching Perplexity response:', error);
    
    // Return error message as bullets
    if (error.message.includes('401')) {
      return ['API key is invalid or expired. Please check your Perplexity API key.'];
    } else if (error.message.includes('429')) {
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
 * Expand on a specific bullet point using Perplexity Sonar
 * @param {string} bulletText - The bullet point to expand on
 * @param {string} originalQuery - The original question for context
 * @returns {Promise<Array<string>>} - Array of bullet points elaborating on the topic
 */
export async function expandBullet(bulletText, originalQuery) {
  const expandQuery = `Based on this context: "${originalQuery}", please elaborate on this point: "${bulletText}". Provide 5-6 detailed bullet points with the latest information.`;
  return getAIResponse(expandQuery);
}

/**
 * Fetch Open Graph image from a URL using a CORS proxy
 * @param {string} url - The URL to fetch the image from
 * @returns {Promise<string|null>} - The image URL or null
 */
export async function fetchArticleImage(url) {
  try {
    console.log('Fetching image for:', url);
    // Use a free API to get Open Graph metadata
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=false&video=false`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.log('Microlink API failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Microlink response for', url, ':', data);
    
    // Get the image from Open Graph data
    if (data.data && data.data.image && data.data.image.url) {
      console.log('Found image:', data.data.image.url);
      return data.data.image.url;
    }
    
    console.log('No image found in response');
    return null;
  } catch (error) {
    console.error('Error fetching article image:', error);
    return null;
  }
}

/**
 * Get sources/references for a bullet point using Perplexity Sonar
 * @param {string} bulletText - The bullet point to find sources for
 * @returns {Promise<Array<Object>>} - Array of source objects with title, url, and optional image
 */
export async function getBulletSources(bulletText) {
  try {
    const sourcesQuery = `Provide credible sources about: "${bulletText}". List the article titles and URLs.`;

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'user', content: sourcesQuery }
        ],
        return_citations: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log('Perplexity sources response:', data);
    
    // Extract citations from Perplexity response
    const citations = data.citations || [];
    const content = data.choices[0].message.content;
    
    console.log('Citations:', citations);
    console.log('Content:', content);
    
    // Try to extract titles from the content
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        return line
          .replace(/^[-•*]\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .replace(/\*\*/g, '')
          .replace(/\[[\d,\s]+\]/g, '')
          .replace(/\[\d+\]/g, '')
          .trim();
      })
      .filter(line => line.length > 10);
    
    // Match citations with titles - return immediately without images
    const sources = citations.slice(0, 5).map((url, index) => {
      // Try to get a meaningful title from content, or extract from URL
      let title = lines[index] || '';
      
      // If no title from content, create one from URL
      if (!title) {
        try {
          const urlObj = new URL(url);
          const path = urlObj.pathname;
          // Extract meaningful text from URL path
          title = path
            .split('/')
            .filter(p => p.length > 0)
            .pop()
            ?.replace(/-/g, ' ')
            ?.replace(/_/g, ' ')
            || urlObj.hostname.replace('www.', '');
        } catch (e) {
          title = 'Article';
        }
      }
      
      return {
        title: title,
        url: url,
        image: null  // Will be loaded lazily in the component
      };
    });
    
    console.log('Final sources:', sources);
    
    // If no sources, provide fallback
    if (sources.length === 0) {
      return [{
        title: 'Search for more information about this topic',
        url: `https://www.google.com/search?q=${encodeURIComponent(bulletText)}`,
        image: null
      }];
    }
    
    return sources;
    
  } catch (error) {
    console.error('Error fetching sources:', error);
    return [
      { 
        title: 'Error loading sources - Click to search',
        url: `https://www.google.com/search?q=${encodeURIComponent(bulletText)}`,
        image: null
      }
    ];
  }
}
