import React, { useState, useEffect } from 'react';

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPToolExplorerProps {
  onClose: () => void;
}

export function MCPToolExplorer({ onClose }: MCPToolExplorerProps) {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [toolArgs, setToolArgs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tools');
      if (!response.ok) {
        throw new Error('Failed to fetch tools');
      }
      const toolsData = await response.json();
      setTools(toolsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleToolSelect = (tool: MCPTool) => {
    setSelectedTool(tool);
    setResult(null);
    setError(null);
    
    // Initialize arguments with default values
    const initialArgs: Record<string, any> = {};
    if (tool.inputSchema && tool.inputSchema.properties) {
      Object.entries(tool.inputSchema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) {
          initialArgs[key] = prop.default;
        } else if (prop.type === 'boolean') {
          initialArgs[key] = false;
        } else if (prop.type === 'array') {
          initialArgs[key] = [];
        } else {
          initialArgs[key] = '';
        }
      });
    }
    setToolArgs(initialArgs);
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;
    
    setExecuting(true);
    setError(null);
    setResult(null);
    
    try {
      // Clean up empty values and convert types
      const cleanedArgs: Record<string, any> = {};
      Object.entries(toolArgs).forEach(([key, value]) => {
        const propSchema = selectedTool.inputSchema.properties[key];
        if (value !== '' && value !== null && value !== undefined) {
          if (propSchema?.type === 'number') {
            cleanedArgs[key] = Number(value);
          } else if (propSchema?.type === 'boolean') {
            cleanedArgs[key] = Boolean(value);
          } else if (propSchema?.type === 'array') {
            if (Array.isArray(value)) {
              cleanedArgs[key] = value.filter(v => v !== '');
            } else if (typeof value === 'string' && value.trim()) {
              cleanedArgs[key] = value.split(',').map(v => v.trim()).filter(v => v);
            }
          } else {
            cleanedArgs[key] = value;
          }
        }
      });
      
      const response = await fetch(`/api/tools/${selectedTool.name}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: cleanedArgs })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || 'Failed to execute tool');
      }
      
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExecuting(false);
    }
  };

  const renderArgumentInput = (key: string, propSchema: any) => {
    const value = toolArgs[key] || '';
    const isRequired = selectedTool?.inputSchema.required?.includes(key);
    
    if (propSchema.enum) {
      return (
        <select
          value={value}
          onChange={(e) => setToolArgs(prev => ({ ...prev, [key]: e.target.value }))}
          required={isRequired}
        >
          <option value="">Select {key}</option>
          {propSchema.enum.map((option: string) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }
    
    if (propSchema.type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => setToolArgs(prev => ({ ...prev, [key]: e.target.checked }))}
        />
      );
    }
    
    if (propSchema.type === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => setToolArgs(prev => ({ ...prev, [key]: e.target.value }))}
          required={isRequired}
        />
      );
    }
    
    if (propSchema.type === 'array') {
      return (
        <textarea
          value={Array.isArray(value) ? value.join(', ') : value}
          onChange={(e) => setToolArgs(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder="Enter comma-separated values"
          rows={2}
          required={isRequired}
        />
      );
    }
    
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setToolArgs(prev => ({ ...prev, [key]: e.target.value }))}
        required={isRequired}
        placeholder={propSchema.description || `Enter ${key}`}
      />
    );
  };

  const filteredTools = tools.filter(tool =>
    tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="mcp-tool-explorer">
      <div>
        <div className="explorer-header">
          <h2>MCP Tool Explorer</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="explorer-content">
          <div className="tools-panel">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search tools..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {loading && <div className="loading">Loading tools...</div>}
            {error && <div className="error-message">Error: {error}</div>}
          
          <div className="tools-list">
            {filteredTools.map(tool => (
              <div
                key={tool.name}
                className={`tool-item ${selectedTool?.name === tool.name ? 'selected' : ''}`}
                onClick={() => handleToolSelect(tool)}
              >
                <h4>{tool.name}</h4>
                <p>{tool.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="tool-details">
          {selectedTool ? (
            <div>
              <h3>{selectedTool.name}</h3>
              <p className="tool-description">{selectedTool.description}</p>
              
              <div className="tool-form">
                <h4>Parameters</h4>
                {selectedTool.inputSchema && selectedTool.inputSchema.properties && Object.keys(selectedTool.inputSchema.properties).length > 0 ? (
                  <div className="parameters-form">
                    {Object.entries(selectedTool.inputSchema.properties).map(([key, propSchema]) => (
                      <div key={key} className="parameter-group">
                        <label>
                          {key}
                          {selectedTool.inputSchema.required?.includes(key) && <span className="required">*</span>}
                        </label>
                        <div className="parameter-meta">
                          <span className="parameter-type">{propSchema.type || 'string'}</span>
                          {propSchema.description && (
                            <span className="parameter-description">{propSchema.description}</span>
                          )}
                        </div>
                        {renderArgumentInput(key, propSchema)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-parameters">This tool requires no parameters.</div>
                )}
                
                <div className="form-actions">
                  <button
                    onClick={handleExecuteTool}
                    disabled={executing}
                    className="execute-btn"
                  >
                    {executing ? 'Executing...' : 'Execute Tool'}
                  </button>
                </div>
              </div>
              
              {error && (
                <div className="error-message">
                  <strong>Error:</strong> {error}
                </div>
              )}
              
              {result && (
                <div className="result-section">
                  <h4>Result</h4>
                  <pre className="result-output">
                    {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="no-tool-selected">
              <p>Select a tool from the list to view its details and execute it.</p>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}