import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import QueryNode from './QueryNode';
import AnswerNode from './AnswerNode';
import SourcesNode from './SourcesNode';
import './MindMapCanvas.css';
import { getAIResponse, expandBullet, getBulletSources } from '../services/perplexity';

// Register custom node types
const nodeTypes = {
  query: QueryNode,
  answer: AnswerNode,
  sources: SourcesNode,
};

// Demo initial nodes to showcase the interface
const initialNodes = [
  {
    id: 'query-1',
    type: 'query',
    position: { x: 250, y: 50 },
    data: { label: 'What is Climate Change?' },
  },
  {
    id: 'answer-1',
    type: 'answer',
    position: { x: 200, y: 180 },
    data: {
      bullets: [
        'Greenhouse gas emissions are the main driver of rising global temperatures',
        'Sea level rise threatens coastal communities and biodiversity',
        'International agreements like Paris Accord aim to limit temperature increases',
        'Low-lying cities face frequent flooding and infrastructure loss',
      ],
    },
  },
];

const initialEdges = [
  {
    id: 'e-query1-answer1',
    source: 'query-1',
    target: 'answer-1',
    style: { stroke: '#2196f3', strokeWidth: 2 },
  },
];

// Custom edge styling
const defaultEdgeOptions = {
  style: { strokeWidth: 2 },
  type: 'smoothstep',
};

function MindMapCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showQueryInput, setShowQueryInput] = useState(false);
  const [newQueryText, setNewQueryText] = useState('');
  const [nodeIdCounter, setNodeIdCounter] = useState(2);
  const [customQueryInput, setCustomQueryInput] = useState({ show: false, nodeId: null, bulletText: '', bulletIndex: null });
  const [customQueryText, setCustomQueryText] = useState('');

  // Handle edge connections
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params }, eds)),
    [setEdges]
  );

  // Generate unique ID
  const getNextId = useCallback((prefix) => {
    const id = `${prefix}-${nodeIdCounter}`;
    setNodeIdCounter((prev) => prev + 1);
    return id;
  }, [nodeIdCounter]);

  // Handle bullet expansion
  const handleExpand = useCallback(async (nodeId, bulletIndex, bulletText) => {
    const expandedAnswerId = getNextId('answer');
    
    // Find the source node to position the new node relative to it
    setNodes((nds) => {
      const sourceNode = nds.find((n) => n.id === nodeId);
      if (!sourceNode) return nds;

      // Create a loading answer node positioned to the right, near the bullet point
      // Each bullet is approximately 40px apart vertically within the node
      const loadingNode = {
        id: expandedAnswerId,
        type: 'answer',
        position: {
          x: sourceNode.position.x + 450,
          y: sourceNode.position.y + ((bulletIndex) * 40),
        },
        data: {
          bullets: ['Expanding...'],
          onExpand: handleExpand,
          onSources: handleSources,
          onCustomQuery: handleCustomQuery,
        },
      };

      return [...nds, loadingNode];
    });

    // Add edge from source answer to expanded answer (from specific bullet point)
    setEdges((eds) => [
      ...eds,
      {
        id: `e-${nodeId}-${expandedAnswerId}`,
        source: nodeId,
        sourceHandle: `bullet-${bulletIndex}`,
        target: expandedAnswerId,
        style: { stroke: '#9c27b0', strokeWidth: 2 },
      },
    ]);

    // Fetch expanded content from OpenAI
    try {
      const bullets = await expandBullet(bulletText, '');
      
      // Update the node with the expanded response
      setNodes((nds) =>
        nds.map((node) =>
          node.id === expandedAnswerId
            ? {
                ...node,
                data: {
                  bullets,
                  onExpand: handleExpand,
                  onSources: handleSources,
                  onCustomQuery: handleCustomQuery,
                },
              }
            : node
        )
      );
    } catch (error) {
      console.error('Error expanding bullet:', error);
      
      // Update with error message
      setNodes((nds) =>
        nds.map((node) =>
          node.id === expandedAnswerId
            ? {
                ...node,
                data: {
                  bullets: ['Error expanding. Please try again.'],
                  onExpand: handleExpand,
                  onSources: handleSources,
                  onCustomQuery: handleCustomQuery,
                },
              }
            : node
        )
      );
    }
  }, [getNextId, setNodes, setEdges]);

  // Handle sources lookup
  const handleSources = useCallback(async (nodeId, bulletIndex, bulletText) => {
    const sourcesId = getNextId('sources');
    
    // Find the source node to position the sources node relative to it
    setNodes((nds) => {
      const sourceNode = nds.find((n) => n.id === nodeId);
      if (!sourceNode) return nds;

      // Calculate vertical position based on bullet index
      const bulletOffsetY = bulletIndex * 40;

      // Create a loading sources node positioned to the right, near the bullet point
      const loadingNode = {
        id: sourcesId,
        type: 'sources',
        position: {
          x: sourceNode.position.x + 450,
          y: sourceNode.position.y + bulletOffsetY,
        },
        data: {
          label: 'Loading sources...',
          sources: [],
        },
      };

      return [...nds, loadingNode];
    });

    // Add edge from source answer to sources node
    setEdges((eds) => [
      ...eds,
      {
        id: `e-${nodeId}-${sourcesId}`,
        source: nodeId,
        sourceHandle: `bullet-${bulletIndex}`,
        target: sourcesId,
        style: { stroke: '#ff9800', strokeWidth: 2 },
      },
    ]);

    // Fetch sources from Perplexity
    try {
      const sources = await getBulletSources(bulletText);
      
      // Update the node with the sources
      setNodes((nds) =>
        nds.map((node) =>
          node.id === sourcesId
            ? {
                ...node,
                data: {
                  sources,
                },
              }
            : node
        )
      );
    } catch (error) {
      console.error('Error fetching sources:', error);
      
      // Update with error message
      setNodes((nds) =>
        nds.map((node) =>
          node.id === sourcesId
            ? {
                ...node,
                data: {
                  sources: [{ title: 'Error loading sources. Please try again.', url: '#' }],
                },
              }
            : node
        )
      );
    }
  }, [getNextId, setNodes, setEdges]);

  // Handle custom query from bullet
  const handleCustomQuery = useCallback((nodeId, bulletIndex, bulletText) => {
    setCustomQueryInput({ show: true, nodeId, bulletText, bulletIndex });
    setCustomQueryText('');
  }, []);

  // Submit custom query
  const submitCustomQuery = useCallback(async () => {
    if (!customQueryText.trim()) return;

    const { nodeId, bulletText, bulletIndex } = customQueryInput;
    const queryId = getNextId('query');
    const answerId = getNextId('answer');

    // Find the source node to position new nodes relative to it
    setNodes((nds) => {
      const sourceNode = nds.find((n) => n.id === nodeId);
      if (!sourceNode) return nds;

      // Calculate vertical position based on bullet index (each bullet ~40px apart)
      const bulletOffsetY = bulletIndex * 40;

      // Create query node positioned to the right, near the bullet point
      const queryNode = {
        id: queryId,
        type: 'query',
        position: {
          x: sourceNode.position.x + 450,
          y: sourceNode.position.y + bulletOffsetY,
        },
        data: { label: customQueryText },
      };

      // Create loading answer node positioned to the right of query, at same level
      const answerNode = {
        id: answerId,
        type: 'answer',
        position: {
          x: sourceNode.position.x + 900,
          y: sourceNode.position.y + bulletOffsetY,
        },
        data: {
          bullets: ['Loading response...'],
          onExpand: handleExpand,
          onSources: handleSources,
          onCustomQuery: handleCustomQuery,
        },
      };

      return [...nds, queryNode, answerNode];
    });

    // Add edges: source node -> query node and query node -> answer node
    setEdges((eds) => [
      ...eds,
      {
        id: `e-${nodeId}-${queryId}`,
        source: nodeId,
        sourceHandle: `bullet-${bulletIndex}`,
        target: queryId,
        style: { stroke: '#ff9800', strokeWidth: 2 },
      },
      {
        id: `e-${queryId}-${answerId}`,
        source: queryId,
        target: answerId,
        style: { stroke: '#2196f3', strokeWidth: 2 },
      },
    ]);

    // Close the input dialog
    setCustomQueryInput({ show: false, nodeId: null, bulletText: '', bulletIndex: null });
    setCustomQueryText('');

    // Fetch AI response
    try {
      const contextQuery = `Context: "${bulletText}". Question: ${customQueryText}`;
      const bullets = await getAIResponse(contextQuery);
      
      // Update the answer node with the response
      setNodes((nds) =>
        nds.map((node) =>
          node.id === answerId
            ? {
                ...node,
                data: {
                  bullets,
                  onExpand: handleExpand,
                  onSources: handleSources,
                  onCustomQuery: handleCustomQuery,
                },
              }
            : node
        )
      );
    } catch (error) {
      console.error('Error fetching custom query response:', error);
      
      // Update with error message
      setNodes((nds) =>
        nds.map((node) =>
          node.id === answerId
            ? {
                ...node,
                data: {
                  bullets: ['Error getting response. Please try again.'],
                  onExpand: handleExpand,
                  onSources: handleSources,
                  onCustomQuery: handleCustomQuery,
                },
              }
            : node
        )
      );
    }
  }, [customQueryText, customQueryInput, getNextId, setNodes, setEdges, handleExpand, handleSources, handleCustomQuery]);

  // Get an LLM response using OpenAI
  const simulateAnswer = useCallback(async (queryId, queryText) => {
    const answerId = getNextId('answer');
    
    // Get the query node's position
    setNodes((nds) => {
      const queryNode = nds.find((n) => n.id === queryId);
      if (!queryNode) return nds;

      // Create a loading answer node
      const loadingNode = {
        id: answerId,
        type: 'answer',
        position: {
          x: queryNode.position.x - 20,
          y: queryNode.position.y + 150,
        },
        data: {
          bullets: ['Loading response...'],
          onExpand: handleExpand,
          onSources: handleSources,
          onCustomQuery: handleCustomQuery,
        },
      };

      return [...nds, loadingNode];
    });

    // Add edge from query to answer
    setEdges((eds) => [
      ...eds,
      {
        id: `e-${queryId}-${answerId}`,
        source: queryId,
        target: answerId,
        style: { stroke: '#2196f3', strokeWidth: 2 },
      },
    ]);

    // Fetch real AI response
    try {
      const bullets = await getAIResponse(queryText);
      
      // Update the node with the actual response
      setNodes((nds) =>
        nds.map((node) =>
          node.id === answerId
            ? {
                ...node,
                data: {
                  bullets,
                  onExpand: handleExpand,
                  onSources: handleSources,
                  onCustomQuery: handleCustomQuery,
                },
              }
            : node
        )
      );
    } catch (error) {
      console.error('Error fetching AI response:', error);
      
      // Update with error message
      setNodes((nds) =>
        nds.map((node) =>
          node.id === answerId
            ? {
                ...node,
                data: {
                  bullets: ['Error getting response. Please try again.'],
                  onExpand: handleExpand,
                  onSources: handleSources,
                  onCustomQuery: handleCustomQuery,
                },
              }
            : node
        )
      );
    }
  }, [getNextId, setNodes, setEdges, handleExpand, handleSources, handleCustomQuery]);

  // Add a new root query node
  const addQueryNode = useCallback(() => {
    if (!newQueryText.trim()) return;

    const newNode = {
      id: getNextId('query'),
      type: 'query',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 200 + 50 },
      data: { label: newQueryText },
    };

    setNodes((nds) => [...nds, newNode]);
    setNewQueryText('');
    setShowQueryInput(false);

    // Trigger API call and create an answer node with the response
    simulateAnswer(newNode.id, newQueryText);
  }, [newQueryText, getNextId, setNodes, simulateAnswer]);

  // Update existing answer nodes with handlers
  const nodesWithHandlers = nodes.map((node) => {
    if (node.type === 'answer') {
      return {
        ...node,
        data: {
          ...node.data,
          onExpand: handleExpand,
          onSources: handleSources,
          onCustomQuery: handleCustomQuery,
        },
      };
    }
    return node;
  });

  return (
    <div className="mindmap-canvas-container">
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#94a3b8" gap={20} size={1} />
        <Controls position="bottom-right" />
        <MiniMap 
          position="bottom-left"
          nodeColor={(node) => {
            switch (node.type) {
              case 'query': return '#4caf50';
              case 'answer': return '#2196f3';
              case 'sources': return '#ff9800';
              default: return '#64748b';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        
        {/* Top panel with add query button */}
        <Panel position="top-left" className="canvas-panel">
          <div className="panel-content">
            <h1 className="panel-title">MindMapper</h1>
            <p className="panel-subtitle">Visual LLM Interaction Canvas</p>
            
            {showQueryInput ? (
              <div className="query-input-wrapper">
                <textarea
                  value={newQueryText}
                  onChange={(e) => setNewQueryText(e.target.value)}
                  placeholder="Enter your question..."
                  className="query-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addQueryNode();
                    }
                  }}
                />
                <div className="query-input-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={addQueryNode}
                  >
                    Add Query
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowQueryInput(false);
                      setNewQueryText('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button 
                className="btn btn-add-query"
                onClick={() => setShowQueryInput(true)}
              >
                + New Query
              </button>
            )}
          </div>
        </Panel>

        {/* Legend panel */}
        <Panel position="top-right" className="legend-panel">
          <div className="legend-item">
            <span className="legend-color query"></span>
            <span>Query</span>
          </div>
          <div className="legend-item">
            <span className="legend-color answer"></span>
            <span>Answer</span>
          </div>
          <div className="legend-item">
            <span className="legend-color sources"></span>
            <span>Sources</span>
          </div>
        </Panel>

        {/* Custom query input panel (modal-like) */}
        {customQueryInput.show && (
          <Panel position="top-center" className="canvas-panel custom-query-panel">
            <div className="panel-content">
              <h3 className="panel-title">✏️ Custom Query</h3>
              <p className="panel-subtitle" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Context: "{customQueryInput.bulletText.substring(0, 60)}..."
              </p>
              
              <div className="query-input-wrapper">
                <textarea
                  value={customQueryText}
                  onChange={(e) => setCustomQueryText(e.target.value)}
                  placeholder="Ask a question about this point..."
                  className="query-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitCustomQuery();
                    }
                  }}
                />
                <div className="query-input-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={submitCustomQuery}
                  >
                    Submit Query
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setCustomQueryInput({ show: false, nodeId: null, bulletText: '', bulletIndex: null });
                      setCustomQueryText('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default MindMapCanvas;
