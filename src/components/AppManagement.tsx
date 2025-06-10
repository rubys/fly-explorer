import React, { useState, useEffect } from 'react';

interface AppManagementProps {
  currentOrg: string;
  availableOrgs: { slug: string; name: string }[];
  onAppCreated: () => void;
  onAppDeleted: () => void;
  onAppMoved: () => void;
  onClose: () => void;
}

export function AppManagement({ 
  currentOrg, 
  availableOrgs, 
  onAppCreated, 
  onAppDeleted, 
  onAppMoved, 
  onClose 
}: AppManagementProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'delete' | 'move'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create app form
  const [createForm, setCreateForm] = useState({
    name: '',
    network: ''
  });

  // Delete app form
  const [deleteForm, setDeleteForm] = useState({
    appName: ''
  });

  // Move app form
  const [moveForm, setMoveForm] = useState({
    appName: '',
    targetOrg: '',
    skipHealthChecks: false
  });

  const resetForms = () => {
    setCreateForm({ name: '', network: '' });
    setDeleteForm({ appName: '' });
    setMoveForm({ appName: '', targetOrg: '', skipHealthChecks: false });
    setError(null);
    setSuccess(null);
  };

  useEffect(() => {
    resetForms();
  }, [activeTab]);

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {};
      if (createForm.name) payload.name = createForm.name;
      if (createForm.network) payload.network = createForm.network;

      const response = await fetch(`/api/organizations/${currentOrg}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to create app');
      }

      const result = await response.json();
      setSuccess(`App "${createForm.name || 'new app'}" created successfully!`);
      setCreateForm({ name: '', network: '' });
      onAppCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteApp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!confirm(`Are you sure you want to delete the app "${deleteForm.appName}"? This action cannot be undone and will destroy all machines, volumes, and data associated with this app.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/apps/${deleteForm.appName}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to delete app');
      }

      setSuccess(`App "${deleteForm.appName}" deleted successfully!`);
      setDeleteForm({ appName: '' });
      onAppDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!confirm(`Are you sure you want to move the app "${moveForm.appName}" to organization "${moveForm.targetOrg}"?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        org: moveForm.targetOrg
      };
      
      if (moveForm.skipHealthChecks) {
        payload['skip-health-checks'] = true;
      }

      const response = await fetch(`/api/apps/${moveForm.appName}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to move app');
      }

      setSuccess(`App "${moveForm.appName}" moved to "${moveForm.targetOrg}" successfully!`);
      setMoveForm({ appName: '', targetOrg: '', skipHealthChecks: false });
      onAppMoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-management-modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>App Management</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="tabs">
          <button
            className={activeTab === 'create' ? 'active' : ''}
            onClick={() => setActiveTab('create')}
          >
            Create App
          </button>
          <button
            className={activeTab === 'delete' ? 'active' : ''}
            onClick={() => setActiveTab('delete')}
          >
            Delete App
          </button>
          <button
            className={activeTab === 'move' ? 'active' : ''}
            onClick={() => setActiveTab('move')}
          >
            Move App
          </button>
        </div>

        <div className="tab-content">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {activeTab === 'create' && (
            <form onSubmit={handleCreateApp} className="app-form">
              <h3>Create New App in {currentOrg}</h3>
              
              <div className="form-group">
                <label>App Name (optional)</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Leave empty for auto-generated name"
                />
                <small>If not provided, Fly.io will generate a unique name</small>
              </div>

              <div className="form-group">
                <label>Custom Network ID (optional)</label>
                <input
                  type="text"
                  value={createForm.network}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, network: e.target.value }))}
                  placeholder="Custom network identifier"
                />
                <small>Advanced: Specify a custom network for the app</small>
              </div>

              <div className="form-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create App'}
                </button>
                <button type="button" onClick={onClose}>Cancel</button>
              </div>
            </form>
          )}

          {activeTab === 'delete' && (
            <form onSubmit={handleDeleteApp} className="app-form">
              <h3>Delete App</h3>
              <div className="warning-box">
                <strong>⚠️ Warning:</strong> Deleting an app will permanently destroy all machines, 
                volumes, and data associated with it. This action cannot be undone.
              </div>
              
              <div className="form-group">
                <label>App Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={deleteForm.appName}
                  onChange={(e) => setDeleteForm(prev => ({ ...prev, appName: e.target.value }))}
                  placeholder="Enter the exact app name to delete"
                  required
                />
              </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  disabled={loading || !deleteForm.appName}
                  className="danger-btn"
                >
                  {loading ? 'Deleting...' : 'Delete App'}
                </button>
                <button type="button" onClick={onClose}>Cancel</button>
              </div>
            </form>
          )}

          {activeTab === 'move' && (
            <form onSubmit={handleMoveApp} className="app-form">
              <h3>Move App to Different Organization</h3>
              
              <div className="form-group">
                <label>App Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={moveForm.appName}
                  onChange={(e) => setMoveForm(prev => ({ ...prev, appName: e.target.value }))}
                  placeholder="Name of the app to move"
                  required
                />
              </div>

              <div className="form-group">
                <label>Target Organization <span className="required">*</span></label>
                <select
                  value={moveForm.targetOrg}
                  onChange={(e) => setMoveForm(prev => ({ ...prev, targetOrg: e.target.value }))}
                  required
                >
                  <option value="">Select organization</option>
                  {availableOrgs
                    .filter(org => org.slug !== currentOrg)
                    .map(org => (
                      <option key={org.slug} value={org.slug}>
                        {org.name} ({org.slug})
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={moveForm.skipHealthChecks}
                    onChange={(e) => setMoveForm(prev => ({ ...prev, skipHealthChecks: e.target.checked }))}
                  />
                  Skip health checks during move
                </label>
                <small>Only check this if you're experiencing issues with the move process</small>
              </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  disabled={loading || !moveForm.appName || !moveForm.targetOrg}
                >
                  {loading ? 'Moving...' : 'Move App'}
                </button>
                <button type="button" onClick={onClose}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}