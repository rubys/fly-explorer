import React, { useState } from 'react';

interface MachineLifecycleProps {
  appName: string;
  machineId: string;
  machineName: string;
  machineState: string;
  onStateChange: () => void;
}

export function MachineLifecycle({ appName, machineId, machineName, machineState, onStateChange }: MachineLifecycleProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [cloneData, setCloneData] = useState({
    name: `${machineName}-clone`,
    region: ''
  });

  const performAction = async (action: string, method: string = 'POST', body?: any) => {
    setLoading(action);
    setError(null);

    try {
      const url = `/api/apps/${appName}/machines/${machineId}${action}`;
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || `Failed to ${action}`);
      }

      onStateChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  const handleClone = async () => {
    await performAction('/clone', 'POST', cloneData);
    setShowCloneForm(false);
  };

  const handleDestroy = async () => {
    if (confirm(`Are you sure you want to destroy machine ${machineName}? This action cannot be undone.`)) {
      const force = confirm('Force destroy? (Skip health checks)');
      await performAction(`?force=${force}`, 'DELETE');
    }
  };

  return (
    <div className="machine-lifecycle">
      {error && <div className="error-message">{error}</div>}
      
      <div className="lifecycle-actions">
        <h4>Advanced Lifecycle Operations</h4>
        
        <div className="action-group">
          <button 
            onClick={() => performAction('/cordon')}
            disabled={loading !== null}
            title="Prevent new allocations to this machine"
          >
            {loading === '/cordon' ? 'Cordoning...' : 'Cordon'}
          </button>
          
          <button 
            onClick={() => performAction('/uncordon')}
            disabled={loading !== null}
            title="Allow new allocations to this machine"
          >
            {loading === '/uncordon' ? 'Uncordoning...' : 'Uncordon'}
          </button>
          
          <button 
            onClick={() => setShowCloneForm(true)}
            disabled={loading !== null}
            title="Create a copy of this machine"
          >
            Clone
          </button>
          
          <button 
            onClick={handleDestroy}
            disabled={loading !== null}
            className="danger"
            title="Permanently destroy this machine"
          >
            {loading === '?force=true' || loading === '?force=false' ? 'Destroying...' : 'Destroy'}
          </button>
        </div>
      </div>

      {showCloneForm && (
        <div className="clone-form">
          <h5>Clone Machine</h5>
          <div className="form-group">
            <label>New Machine Name:</label>
            <input
              type="text"
              value={cloneData.name}
              onChange={e => setCloneData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Region (optional):</label>
            <input
              type="text"
              value={cloneData.region}
              onChange={e => setCloneData(prev => ({ ...prev, region: e.target.value }))}
              placeholder="Leave empty to use same region"
            />
          </div>
          <div className="form-actions">
            <button onClick={handleClone} disabled={loading === '/clone'}>
              {loading === '/clone' ? 'Cloning...' : 'Clone Machine'}
            </button>
            <button onClick={() => setShowCloneForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}