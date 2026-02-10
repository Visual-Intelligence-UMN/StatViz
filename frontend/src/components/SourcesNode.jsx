import { Handle, Position } from '@xyflow/react';
import { useState, useEffect } from 'react';
import './SourcesNode.css';
import { fetchArticleImage } from '../services/perplexity';

/**
 * SourcesNode - Displays web search results/sources
 * Color-coded orange as per the proposal
 */
function SourcesNode({ data }) {
  const [sources, setSources] = useState([]);

  const truncateTitle = (title, maxLength = 80) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  // Update sources when data changes and load images
  useEffect(() => {
    console.log('SourcesNode data updated:', data);
    if (data.sources && data.sources.length > 0) {
      // Set sources immediately (with placeholders)
      setSources(data.sources);
      
      // Then load images in background
      const loadImages = async () => {
        console.log('Starting to load images for sources');
        const sourcesWithImages = await Promise.all(
          data.sources.map(async (source, index) => {
            if (source.url) {
              console.log(`Loading image ${index + 1}/${data.sources.length}`);
              const imageUrl = await fetchArticleImage(source.url);
              return { ...source, image: imageUrl };
            }
            return source;
          })
        );
        console.log('Images loaded, updating sources:', sourcesWithImages);
        setSources(sourcesWithImages);
      };
      
      loadImages();
    }
  }, [data.sources]);

  console.log('SourcesNode rendering with sources:', sources);

  return (
    <div className="sources-node">
      <div className="sources-node-header">
        <span className="sources-node-icon">🔗</span>
        <span className="sources-node-label">Sources</span>
      </div>
      
      <div className="sources-node-content">
        {sources.length > 0 ? (
          sources.map((source, index) => (
            <a
              key={index}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-item"
              onClick={(e) => e.stopPropagation()}
            >
              {source.image ? (
                <div className="source-image">
                  <img src={source.image} alt="" onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div class="source-icon">📄</div>';
                  }} />
                </div>
              ) : (
                <div className="source-icon">
                  📄
                </div>
              )}
              <div className="source-content">
                <div className="source-title" title={source.title}>
                  {truncateTitle(source.title)}
                </div>
                <div className="source-domain">
                  {new URL(source.url).hostname.replace('www.', '')}
                </div>
              </div>
            </a>
          ))
        ) : (
          <div className="sources-placeholder">
            {data.label || 'Sources will appear here'}
          </div>
        )}
      </div>
      
      {/* Input handle - connects from answer nodes */}
      <Handle 
        type="target" 
        position={Position.Top} 
        className="sources-handle"
      />
    </div>
  );
}

export default SourcesNode;
