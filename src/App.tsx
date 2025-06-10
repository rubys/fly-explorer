import React, { useState, useEffect } from 'react';
import './App.css';
import { MachineCreateForm } from './components/MachineCreateForm';
import { MachineLifecycle } from './components/MachineLifecycle';
import { MCPToolExplorer } from './components/MCPToolExplorer';
import { AppManagement } from './components/AppManagement';
import { PlatformInfo } from './components/PlatformInfo';

interface Organization {
  slug: string;
  name: string;
  type: string;
}

interface App {
  id: string;
  name: string;
  status: string;
  organization: {
    slug: string;
  };
}

interface Machine {
  id: string;
  name: string;
  state: string;
  region: string;
  created_at: string;
}

interface MachineDetails {
  id: string;
  name: string;
  state: string;
  region: string;
  image: string;
  instance_id: string;
  private_ip: string;
  cpu_kind: string;
  vcpus: string;
  memory: string;
  created: string;
  config: any;
  events: any[];
  checks: any[];
  raw_text: string;
}

interface ResourceDetails {
  volumes?: any[];
  secrets?: any[];
  certificates?: any[];
  releases?: any[];
  status?: any;
  logs?: any[];
}

interface OrganizationDetails {
  slug: string;
  name: string;
  type: string;
  appCount: number;
  apps: App[];
}

function App() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgDetails, setOrgDetails] = useState<OrganizationDetails | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [machineDetails, setMachineDetails] = useState<MachineDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceDetails, setResourceDetails] = useState<ResourceDetails>({});
  const [activeTab, setActiveTab] = useState<string>('machines');
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilters, setLogFilters] = useState({ machine: '', region: '', lines: '100' });
  const [machineOperation, setMachineOperation] = useState<{ [key: string]: string }>({});
  const [secretsOperation, setSecretsOperation] = useState<string>('');
  const [newSecret, setNewSecret] = useState({ key: '', value: '' });
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [deployOperation, setDeployOperation] = useState<string>('');
  const [secretsModified, setSecretsModified] = useState(false);
  const [volumeOperation, setVolumeOperation] = useState<{ [key: string]: string }>({});
  const [showCreateVolume, setShowCreateVolume] = useState(false);
  const [newVolume, setNewVolume] = useState({ name: '', region: '', size_gb: '1' });
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [volumeDetails, setVolumeDetails] = useState<any>(null);
  const [platformRegions, setPlatformRegions] = useState<any[]>([]);
  const [showCreateMachine, setShowCreateMachine] = useState(false);
  const [showToolExplorer, setShowToolExplorer] = useState(false);
  const [showAppManagement, setShowAppManagement] = useState(false);
  const [showPlatformInfo, setShowPlatformInfo] = useState(false);

  // Fetch organizations and platform regions on mount
  useEffect(() => {
    fetchOrganizations();
    fetchPlatformRegions();
  }, []);

  const fetchOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/organizations');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch organizations: ${errorText}`);
      }
      const data = await response.json();
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchApps = async (org: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${org}/apps`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch apps: ${errorText}`);
      }
      const data = await response.json();
      setApps(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching apps:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchMachines = async (app: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/apps/${app}/machines`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch machines: ${errorText}`);
      }
      const data = await response.json();
      setMachines(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching machines:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchResourceDetails = async (app: string) => {
    const resources = ['volumes', 'secrets', 'certificates', 'releases', 'status'];
    const details: ResourceDetails = {};
    
    for (const resource of resources) {
      try {
        const response = await fetch(`/api/apps/${app}/${resource}`);
        if (response.ok) {
          details[resource as keyof ResourceDetails] = await response.json();
        }
      } catch (err) {
        console.error(`Failed to fetch ${resource}:`, err);
      }
    }
    
    setResourceDetails(details);
  };

  const fetchLogs = async (app: string, filters: any = {}) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.machine) params.append('machine', filters.machine);
      if (filters.region) params.append('region', filters.region);
      if (filters.lines) params.append('lines', filters.lines);
      
      const response = await fetch(`/api/apps/${app}/logs?${params}`);
      if (response.ok) {
        const logsData = await response.json();
        setLogs(logsData);
      } else {
        console.error('Failed to fetch logs');
        setLogs([]);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const controlMachine = async (app: string, machineId: string, action: 'start' | 'stop' | 'restart') => {
    const operationKey = `${machineId}-${action}`;
    setMachineOperation(prev => ({ ...prev, [operationKey]: 'pending' }));
    
    try {
      const response = await fetch(`/api/apps/${app}/machines/${machineId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setMachineOperation(prev => ({ ...prev, [operationKey]: 'success' }));
        // Refresh machines list after operation
        setTimeout(() => {
          fetchMachines(app);
          setMachineOperation(prev => {
            const newState = { ...prev };
            delete newState[operationKey];
            return newState;
          });
        }, 2000);
      } else {
        const errorData = await response.json();
        console.error(`Failed to ${action} machine:`, errorData);
        setMachineOperation(prev => ({ ...prev, [operationKey]: 'error' }));
        setTimeout(() => {
          setMachineOperation(prev => {
            const newState = { ...prev };
            delete newState[operationKey];
            return newState;
          });
        }, 3000);
      }
    } catch (err) {
      console.error(`Error ${action}ing machine:`, err);
      setMachineOperation(prev => ({ ...prev, [operationKey]: 'error' }));
      setTimeout(() => {
        setMachineOperation(prev => {
          const newState = { ...prev };
          delete newState[operationKey];
          return newState;
        });
      }, 3000);
    }
  };

  const addSecret = async (app: string, key: string, value: string) => {
    setSecretsOperation('adding');
    
    try {
      const response = await fetch(`/api/apps/${app}/secrets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          secrets: { [key]: value }
        })
      });
      
      if (response.ok) {
        setSecretsOperation('success');
        setNewSecret({ key: '', value: '' });
        setShowAddSecret(false);
        setSecretsModified(true);
        // Refresh secrets list
        setTimeout(() => {
          fetchResourceDetails(app);
          setSecretsOperation('');
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error('Failed to add secret:', errorData);
        setSecretsOperation('error');
        setTimeout(() => setSecretsOperation(''), 3000);
      }
    } catch (err) {
      console.error('Error adding secret:', err);
      setSecretsOperation('error');
      setTimeout(() => setSecretsOperation(''), 3000);
    }
  };

  const deleteSecret = async (app: string, secretName: string) => {
    setSecretsOperation(`deleting-${secretName}`);
    
    try {
      const response = await fetch(`/api/apps/${app}/secrets/${secretName}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setSecretsOperation('success');
        setSecretsModified(true);
        // Refresh secrets list
        setTimeout(() => {
          fetchResourceDetails(app);
          setSecretsOperation('');
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error('Failed to delete secret:', errorData);
        setSecretsOperation('error');
        setTimeout(() => setSecretsOperation(''), 3000);
      }
    } catch (err) {
      console.error('Error deleting secret:', err);
      setSecretsOperation('error');
      setTimeout(() => setSecretsOperation(''), 3000);
    }
  };

  const deployApp = async (app: string) => {
    setDeployOperation('deploying');
    
    try {
      const response = await fetch(`/api/apps/${app}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setDeployOperation('success');
        setSecretsModified(false);
        setTimeout(() => setDeployOperation(''), 3000);
      } else {
        const errorData = await response.json();
        console.error('Failed to deploy app:', errorData);
        setDeployOperation('error');
        setTimeout(() => setDeployOperation(''), 3000);
      }
    } catch (err) {
      console.error('Error deploying app:', err);
      setDeployOperation('error');
      setTimeout(() => setDeployOperation(''), 3000);
    }
  };

  const createVolume = async (app: string, name: string, region: string, size_gb: string) => {
    setVolumeOperation({ create: 'creating' });
    
    try {
      const response = await fetch(`/api/apps/${app}/volumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          region,
          size_gb: parseInt(size_gb)
        })
      });
      
      if (response.ok) {
        setVolumeOperation({ create: 'success' });
        setNewVolume({ name: '', region: '', size_gb: '1' });
        setShowCreateVolume(false);
        // Refresh volumes list
        setTimeout(() => {
          fetchResourceDetails(app);
          setVolumeOperation({});
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error('Failed to create volume:', errorData);
        setVolumeOperation({ create: 'error' });
        setTimeout(() => setVolumeOperation({}), 3000);
      }
    } catch (err) {
      console.error('Error creating volume:', err);
      setVolumeOperation({ create: 'error' });
      setTimeout(() => setVolumeOperation({}), 3000);
    }
  };

  const deleteVolume = async (app: string, volumeId: string) => {
    setVolumeOperation({ [`delete-${volumeId}`]: 'deleting' });
    
    try {
      const response = await fetch(`/api/apps/${app}/volumes/${volumeId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setVolumeOperation({ [`delete-${volumeId}`]: 'success' });
        // Refresh volumes list
        setTimeout(() => {
          fetchResourceDetails(app);
          setVolumeOperation({});
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error('Failed to delete volume:', errorData);
        setVolumeOperation({ [`delete-${volumeId}`]: 'error' });
        setTimeout(() => setVolumeOperation({}), 3000);
      }
    } catch (err) {
      console.error('Error deleting volume:', err);
      setVolumeOperation({ [`delete-${volumeId}`]: 'error' });
      setTimeout(() => setVolumeOperation({}), 3000);
    }
  };

  const extendVolume = async (app: string, volumeId: string, newSize: string) => {
    setVolumeOperation({ [`extend-${volumeId}`]: 'extending' });
    
    try {
      const response = await fetch(`/api/apps/${app}/volumes/${volumeId}/extend`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          size_gb: parseInt(newSize)
        })
      });
      
      if (response.ok) {
        setVolumeOperation({ [`extend-${volumeId}`]: 'success' });
        // Refresh volumes list
        setTimeout(() => {
          fetchResourceDetails(app);
          setVolumeOperation({});
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error('Failed to extend volume:', errorData);
        setVolumeOperation({ [`extend-${volumeId}`]: 'error' });
        setTimeout(() => setVolumeOperation({}), 3000);
      }
    } catch (err) {
      console.error('Error extending volume:', err);
      setVolumeOperation({ [`extend-${volumeId}`]: 'error' });
      setTimeout(() => setVolumeOperation({}), 3000);
    }
  };

  const fetchVolumeDetails = async (app: string, volumeId: string) => {
    try {
      const response = await fetch(`/api/apps/${app}/volumes/${volumeId}`);
      if (response.ok) {
        const data = await response.json();
        setVolumeDetails(data);
      }
    } catch (err) {
      console.error('Error fetching volume details:', err);
    }
  };

  const fetchPlatformRegions = async () => {
    try {
      const response = await fetch('/api/platform/regions');
      if (response.ok) {
        const regions = await response.json();
        setPlatformRegions(Array.isArray(regions) ? regions : []);
      }
    } catch (err) {
      console.error('Error fetching platform regions:', err);
    }
  };

  const fetchOrgDetails = async (orgSlug: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${orgSlug}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch organization details: ${errorText}`);
      }
      const data = await response.json();
      setOrgDetails(data);
    } catch (err) {
      console.error('Error fetching organization details:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleOrgSelect = (orgSlug: string) => {
    setSelectedOrg(orgSlug);
    setSelectedApp(null);
    setSelectedMachine(null);
    setApps([]);
    setMachines([]);
    setResourceDetails({});
    setActiveTab('overview');
    fetchOrgDetails(orgSlug);
    fetchApps(orgSlug);
  };

  const handleAppSelect = (appName: string) => {
    setSelectedApp(appName);
    setSelectedMachine(null);
    setMachines([]);
    setLogs([]);
    setSecretsModified(false);
    fetchMachines(appName);
    fetchResourceDetails(appName);
  };

  const fetchMachineDetails = async (app: string, machineId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/apps/${app}/machines/${machineId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch machine details: ${errorText}`);
      }
      const data = await response.json();
      setMachineDetails(data);
    } catch (err) {
      console.error('Error fetching machine details:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMachineSelect = (machineId: string) => {
    setSelectedMachine(machineId);
    setActiveTab('machine-details');
    if (selectedApp) {
      fetchMachineDetails(selectedApp, machineId);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fly.io Explorer</h1>
        <div className="header-actions">
          <button 
            className="tool-explorer-btn"
            onClick={() => setShowPlatformInfo(true)}
            title="View Platform Information"
          >
            ℹ️ Platform Info
          </button>
          <button 
            className="tool-explorer-btn"
            onClick={() => setShowToolExplorer(true)}
            title="Open MCP Tool Explorer"
          >
            🔧 Tools
          </button>
        </div>
      </header>
      
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3>Organizations</h3>
            {loading && !organizations.length && <p>Loading...</p>}
            {error && <p className="error">{error}</p>}
            <ul className="resource-list">
              {organizations.map(org => (
                <li
                  key={org.slug}
                  className={selectedOrg === org.slug ? 'selected' : ''}
                  onClick={() => handleOrgSelect(org.slug)}
                >
                  <span className="resource-name">{org.name}</span>
                  <span className="resource-type">{org.type}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {selectedOrg && (
            <div className="sidebar-section">
              <h3>Applications</h3>
              {loading && !apps.length && <p>Loading...</p>}
              <ul className="resource-list">
                {apps.map(app => (
                  <li
                    key={app.id}
                    className={selectedApp === app.name ? 'selected' : ''}
                    onClick={() => handleAppSelect(app.name)}
                  >
                    <span className="resource-name">{app.name}</span>
                    <span className={`status ${app.status}`}>{app.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {selectedApp && (
            <div className="sidebar-section">
              <h3>Machines</h3>
              <ul className="resource-list">
                {machines.map(machine => (
                  <li
                    key={machine.id}
                    className={selectedMachine === machine.id ? 'selected' : ''}
                    onClick={() => handleMachineSelect(machine.id)}
                  >
                    <span className="resource-name">{machine.id.substring(0, 8)}</span>
                    <span className={`status ${machine.state}`}>{machine.state}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
        
        <main className="main-content">
          {!selectedOrg && (
            <div className="welcome">
              <h2>Welcome to Fly.io Explorer</h2>
              <p>Select an organization to get started</p>
            </div>
          )}
          
          {selectedOrg && !selectedApp && orgDetails && (
            <div className="org-details">
              <h2>{orgDetails.name}</h2>
              <p className="org-slug">Organization: {orgDetails.slug}</p>
              
              <div className="tabs">
                <button
                  className={activeTab === 'overview' ? 'active' : ''}
                  onClick={() => setActiveTab('overview')}
                >
                  Overview
                </button>
                <button
                  className={activeTab === 'apps' ? 'active' : ''}
                  onClick={() => setActiveTab('apps')}
                >
                  Applications ({orgDetails.appCount})
                </button>
              </div>
              
              <div className="tab-content">
                {activeTab === 'overview' && (
                  <div className="overview">
                    <div className="overview-header">
                      <div className="stats-grid">
                        <div className="stat-card">
                          <h3>Applications</h3>
                          <div className="stat-number">{orgDetails.appCount}</div>
                        </div>
                        <div className="stat-card">
                          <h3>Running Apps</h3>
                          <div className="stat-number">
                            {orgDetails.apps.filter(app => app.status === 'deployed').length}
                          </div>
                        </div>
                        <div className="stat-card">
                          <h3>Suspended Apps</h3>
                          <div className="stat-number">
                            {orgDetails.apps.filter(app => app.status === 'suspended').length}
                          </div>
                        </div>
                      </div>
                      
                      <div className="overview-actions">
                        <button 
                          className="manage-apps-btn"
                          onClick={() => setShowAppManagement(true)}
                        >
                          📱 Manage Apps
                        </button>
                      </div>
                    </div>
                    
                    <div className="recent-apps">
                      <h3>Recent Applications</h3>
                      <div className="app-list">
                        {orgDetails.apps.slice(0, 5).map(app => (
                          <div key={app.id} className="app-item" onClick={() => handleAppSelect(app.name)}>
                            <span className="app-name">{app.name}</span>
                            <span className={`status ${app.status}`}>{app.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'apps' && (
                  <div className="apps-grid">
                    {orgDetails.apps.map(app => (
                      <div key={app.id} className="app-card" onClick={() => handleAppSelect(app.name)}>
                        <h4>{app.name}</h4>
                        <p>Status: <span className={`status ${app.status}`}>{app.status}</span></p>
                        {app.hostname && <p>Hostname: {app.hostname}</p>}
                        {app.platformVersion && <p>Platform: {app.platformVersion}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {selectedApp && (
            <div className="app-details">
              <h2>{selectedApp}</h2>
              
              <div className="tabs">
                <button
                  className={activeTab === 'machines' ? 'active' : ''}
                  onClick={() => setActiveTab('machines')}
                >
                  Machines ({machines.length})
                </button>
                {selectedMachine && (
                  <button
                    className={activeTab === 'machine-details' ? 'active' : ''}
                    onClick={() => setActiveTab('machine-details')}
                  >
                    Machine Details
                  </button>
                )}
                <button
                  className={activeTab === 'volumes' ? 'active' : ''}
                  onClick={() => setActiveTab('volumes')}
                >
                  Volumes ({resourceDetails.volumes?.length || 0})
                </button>
                <button
                  className={activeTab === 'secrets' ? 'active' : ''}
                  onClick={() => setActiveTab('secrets')}
                >
                  Secrets ({resourceDetails.secrets?.length || 0})
                </button>
                <button
                  className={activeTab === 'certificates' ? 'active' : ''}
                  onClick={() => setActiveTab('certificates')}
                >
                  Certificates ({resourceDetails.certificates?.length || 0})
                </button>
                <button
                  className={activeTab === 'releases' ? 'active' : ''}
                  onClick={() => setActiveTab('releases')}
                >
                  Releases ({resourceDetails.releases?.length || 0})
                </button>
                <button
                  className={activeTab === 'logs' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('logs');
                    if (selectedApp && logs.length === 0) {
                      fetchLogs(selectedApp, logFilters);
                    }
                  }}
                >
                  Logs
                </button>
              </div>
              
              <div className="tab-content">
                {activeTab === 'machines' && (
                  <div className="machines-management">
                    <div className="machines-header">
                      <h3>Virtual Machines</h3>
                      <button
                        className="add-machine-btn"
                        onClick={() => setShowCreateMachine(true)}
                      >
                        Create Machine
                      </button>
                    </div>
                    
                    {showCreateMachine && (
                      <MachineCreateForm
                        appName={selectedApp}
                        onSuccess={() => {
                          setShowCreateMachine(false);
                          fetchMachines(selectedApp);
                        }}
                        onCancel={() => setShowCreateMachine(false)}
                      />
                    )}
                    
                    <div className="machines-grid">
                      {machines.map(machine => (
                        <div 
                          key={machine.id} 
                          className={`machine-card ${selectedMachine === machine.id ? 'selected' : ''}`}
                          onClick={() => handleMachineSelect(machine.id)}
                        >
                          <h4>{machine.id}</h4>
                          <p>Name: {machine.name}</p>
                          <p>State: <span className={`status ${machine.state}`}>{machine.state}</span></p>
                          <p>Region: {machine.region}</p>
                          <p>Created: {new Date(machine.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {activeTab === 'machine-details' && selectedMachine && (
                  <div className="machine-details">
                    {loading && <p>Loading machine details...</p>}
                    {error && <p className="error">{error}</p>}
                    {machineDetails && (
                      <div className="machine-info">
                        <div className="machine-header">
                          <div className="machine-header-info">
                            <h3>Machine: {machineDetails.id}</h3>
                            <span className={`status ${machineDetails.state}`}>{machineDetails.state}</span>
                          </div>
                          <div className="machine-controls">
                            <button
                              className={`control-btn start-btn ${machineDetails.state === 'started' ? 'disabled' : ''}`}
                              onClick={() => selectedApp && controlMachine(selectedApp, machineDetails.id, 'start')}
                              disabled={machineDetails.state === 'started' || machineOperation[`${machineDetails.id}-start`] === 'pending'}
                            >
                              {machineOperation[`${machineDetails.id}-start`] === 'pending' ? 'Starting...' : 'Start'}
                            </button>
                            <button
                              className={`control-btn stop-btn ${machineDetails.state === 'stopped' ? 'disabled' : ''}`}
                              onClick={() => selectedApp && controlMachine(selectedApp, machineDetails.id, 'stop')}
                              disabled={machineDetails.state === 'stopped' || machineOperation[`${machineDetails.id}-stop`] === 'pending'}
                            >
                              {machineOperation[`${machineDetails.id}-stop`] === 'pending' ? 'Stopping...' : 'Stop'}
                            </button>
                            <button
                              className="control-btn restart-btn"
                              onClick={() => selectedApp && controlMachine(selectedApp, machineDetails.id, 'restart')}
                              disabled={machineOperation[`${machineDetails.id}-restart`] === 'pending'}
                            >
                              {machineOperation[`${machineDetails.id}-restart`] === 'pending' ? 'Restarting...' : 'Restart'}
                            </button>
                          </div>
                        </div>
                        
                        <div className="machine-sections">
                          <section className="machine-section">
                            <h4>Basic Information</h4>
                            <div className="info-grid">
                              <div className="info-item">
                                <label>ID:</label>
                                <span>{machineDetails.id}</span>
                              </div>
                              <div className="info-item">
                                <label>Name:</label>
                                <span>{machineDetails.name}</span>
                              </div>
                              <div className="info-item">
                                <label>State:</label>
                                <span className={`status ${machineDetails.state}`}>{machineDetails.state}</span>
                              </div>
                              <div className="info-item">
                                <label>Region:</label>
                                <span>{machineDetails.region}</span>
                              </div>
                              <div className="info-item">
                                <label>Image:</label>
                                <span>{machineDetails.image}</span>
                              </div>
                              <div className="info-item">
                                <label>Instance ID:</label>
                                <span>{machineDetails.instance_id}</span>
                              </div>
                              <div className="info-item">
                                <label>Private IP:</label>
                                <span>{machineDetails.private_ip}</span>
                              </div>
                              {machineDetails.cpu_kind && (
                                <div className="info-item">
                                  <label>CPU Kind:</label>
                                  <span>{machineDetails.cpu_kind}</span>
                                </div>
                              )}
                              {machineDetails.vcpus && (
                                <div className="info-item">
                                  <label>vCPUs:</label>
                                  <span>{machineDetails.vcpus}</span>
                                </div>
                              )}
                              {machineDetails.memory && (
                                <div className="info-item">
                                  <label>Memory:</label>
                                  <span>{machineDetails.memory}</span>
                                </div>
                              )}
                              {machineDetails.created && (
                                <div className="info-item">
                                  <label>Created:</label>
                                  <span>{new Date(machineDetails.created).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </section>
                          
                          
                          {machineDetails.events && machineDetails.events.length > 0 && (
                            <section className="machine-section">
                              <h4>Recent Events</h4>
                              <div className="events-list">
                                {machineDetails.events.slice(0, 10).map((event: any, index: number) => (
                                  <div key={index} className="event-item">
                                    <span className="event-time">
                                      {new Date(event.timestamp).toLocaleString()}
                                    </span>
                                    <span className="event-type">{event.type}</span>
                                    <span className="event-status">{event.status}</span>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                          
                          {machineDetails.checks && machineDetails.checks.length > 0 && (
                            <section className="machine-section">
                              <h4>Health Checks</h4>
                              <div className="checks-list">
                                {machineDetails.checks.map((check: any, index: number) => (
                                  <div key={index} className="check-item">
                                    <span className="check-name">{check.name}</span>
                                    <span className={`check-status ${check.status}`}>{check.status}</span>
                                    <span className="check-output">{check.output}</span>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                          
                          <section className="machine-section">
                            <MachineLifecycle
                              appName={selectedApp}
                              machineId={machineDetails.id}
                              machineName={machineDetails.name}
                              machineState={machineDetails.state}
                              onStateChange={() => {
                                fetchMachineDetails(selectedApp, machineDetails.id);
                                fetchMachines(selectedApp);
                              }}
                            />
                          </section>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'volumes' && (
                  <div className="volumes-management">
                    <div className="volumes-header">
                      <h3>Storage Volumes</h3>
                      <button
                        className="add-volume-btn"
                        onClick={() => {
                          // Preselect the most common region from existing machines
                          const machineRegions = machines.map(m => m.region);
                          const mostCommonRegion = machineRegions.length > 0 ? 
                            machineRegions.reduce((a, b, i, arr) => 
                              arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
                            ) : '';
                          
                          setNewVolume(prev => ({ ...prev, region: mostCommonRegion }));
                          setShowCreateVolume(true);
                        }}
                        disabled={volumeOperation.create === 'creating'}
                      >
                        {volumeOperation.create === 'creating' ? 'Creating...' : 'Create Volume'}
                      </button>
                    </div>
                    
                    {showCreateVolume && (
                      <div className="create-volume-form">
                        <div className="form-row">
                          <div className="form-group">
                            <label>Volume Name</label>
                            <input
                              type="text"
                              value={newVolume.name}
                              onChange={(e) => setNewVolume(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="e.g., data-volume"
                            />
                          </div>
                          <div className="form-group">
                            <label>Region</label>
                            <select
                              value={newVolume.region}
                              onChange={(e) => setNewVolume(prev => ({ ...prev, region: e.target.value }))}
                            >
                              <option value="">Select region</option>
                              {platformRegions.map(region => (
                                <option key={region.Code || region.code} value={region.Code || region.code}>
                                  {region.Code || region.code} - {region.Name || region.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Size (GB)</label>
                            <input
                              type="number"
                              value={newVolume.size_gb}
                              onChange={(e) => setNewVolume(prev => ({ ...prev, size_gb: e.target.value }))}
                              min="1"
                              max="500"
                            />
                          </div>
                        </div>
                        <div className="form-actions">
                          <button
                            className="save-btn"
                            onClick={() => {
                              if (selectedApp && newVolume.name && newVolume.region && newVolume.size_gb) {
                                createVolume(selectedApp, newVolume.name, newVolume.region, newVolume.size_gb);
                              }
                            }}
                            disabled={!newVolume.name || !newVolume.region || volumeOperation.create === 'creating'}
                          >
                            {volumeOperation.create === 'creating' ? 'Creating...' : 'Create Volume'}
                          </button>
                          <button
                            className="cancel-btn"
                            onClick={() => {
                              setShowCreateVolume(false);
                              setNewVolume({ name: '', region: '', size_gb: '1' });
                            }}
                            disabled={volumeOperation.create === 'creating'}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <div className="volumes-list">
                      {resourceDetails.volumes && resourceDetails.volumes.length > 0 ? (
                        resourceDetails.volumes.map((volume: any) => (
                          <div key={volume.id} className="volume-item">
                            <div className="volume-info">
                              <h4>{volume.name || volume.id}</h4>
                              <div className="volume-details">
                                <span>Size: {volume.size_gb}GB</span>
                                <span>Region: {volume.region}</span>
                                <span>State: <span className={`status ${volume.state}`}>{volume.state}</span></span>
                                <span>Attached: {volume.attached ? 'Yes' : 'No'}</span>
                              </div>
                            </div>
                            <div className="volume-actions">
                              <button
                                className="extend-volume-btn"
                                onClick={() => {
                                  const newSize = prompt(`Current size: ${volume.size_gb}GB. Enter new size (GB):`, String(volume.size_gb + 10));
                                  if (newSize && parseInt(newSize) > volume.size_gb && selectedApp) {
                                    extendVolume(selectedApp, volume.id, newSize);
                                  }
                                }}
                                disabled={volumeOperation[`extend-${volume.id}`] === 'extending'}
                              >
                                {volumeOperation[`extend-${volume.id}`] === 'extending' ? 'Extending...' : 'Extend'}
                              </button>
                              <button
                                className="delete-volume-btn"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete volume "${volume.name || volume.id}"? This action cannot be undone.`) && selectedApp) {
                                    deleteVolume(selectedApp, volume.id);
                                  }
                                }}
                                disabled={volumeOperation[`delete-${volume.id}`] === 'deleting' || volume.attached}
                              >
                                {volumeOperation[`delete-${volume.id}`] === 'deleting' ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          <p>No volumes configured for this application.</p>
                          <p>Click "Create Volume" to add persistent storage.</p>
                        </div>
                      )}
                    </div>
                    
                    {volumeOperation.create === 'success' && (
                      <div className="success-message">
                        Volume created successfully!
                      </div>
                    )}
                    
                    {volumeOperation.create === 'error' && (
                      <div className="error-message">
                        Failed to create volume. Please check your configuration and try again.
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'secrets' && (
                  <div className="secrets-management">
                    <div className="secrets-header">
                      <h3>Application Secrets</h3>
                      <div className="secrets-actions">
                        <button
                          className="add-secret-btn"
                          onClick={() => setShowAddSecret(true)}
                          disabled={secretsOperation === 'adding'}
                        >
                          {secretsOperation === 'adding' ? 'Adding...' : 'Add Secret'}
                        </button>
                        {secretsModified && (
                          <button
                            className="deploy-btn"
                            onClick={() => selectedApp && deployApp(selectedApp)}
                            disabled={deployOperation === 'deploying'}
                          >
                            {deployOperation === 'deploying' ? 'Deploying...' : 'Deploy Changes'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {showAddSecret && (
                      <div className="add-secret-form">
                        <div className="form-row">
                          <div className="form-group">
                            <label>Secret Name</label>
                            <input
                              type="text"
                              value={newSecret.key}
                              onChange={(e) => setNewSecret(prev => ({ ...prev, key: e.target.value }))}
                              placeholder="e.g., DATABASE_URL"
                            />
                          </div>
                          <div className="form-group">
                            <label>Secret Value</label>
                            <input
                              type="password"
                              value={newSecret.value}
                              onChange={(e) => setNewSecret(prev => ({ ...prev, value: e.target.value }))}
                              placeholder="Enter secret value"
                            />
                          </div>
                        </div>
                        <div className="form-actions">
                          <button
                            className="save-btn"
                            onClick={() => {
                              if (selectedApp && newSecret.key && newSecret.value) {
                                addSecret(selectedApp, newSecret.key, newSecret.value);
                              }
                            }}
                            disabled={!newSecret.key || !newSecret.value || secretsOperation === 'adding'}
                          >
                            {secretsOperation === 'adding' ? 'Adding...' : 'Add Secret'}
                          </button>
                          <button
                            className="cancel-btn"
                            onClick={() => {
                              setShowAddSecret(false);
                              setNewSecret({ key: '', value: '' });
                            }}
                            disabled={secretsOperation === 'adding'}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <div className="secrets-list">
                      {resourceDetails.secrets && resourceDetails.secrets.length > 0 ? (
                        resourceDetails.secrets.map((secret: any) => (
                          <div key={secret.name} className="secret-item">
                            <div className="secret-info">
                              <h4>{secret.name}</h4>
                              <p>Created: {new Date(secret.created_at).toLocaleDateString()}</p>
                            </div>
                            <button
                              className="delete-secret-btn"
                              onClick={() => selectedApp && deleteSecret(selectedApp, secret.name)}
                              disabled={secretsOperation === `deleting-${secret.name}`}
                            >
                              {secretsOperation === `deleting-${secret.name}` ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          <p>No secrets configured for this application.</p>
                          <p>Click "Add Secret" to create your first secret.</p>
                        </div>
                      )}
                    </div>
                    
                    {secretsOperation === 'success' && (
                      <div className="success-message">
                        Operation completed successfully!
                      </div>
                    )}
                    
                    {secretsOperation === 'error' && (
                      <div className="error-message">
                        Failed to complete operation. Please try again.
                      </div>
                    )}
                    
                    {deployOperation === 'success' && (
                      <div className="success-message">
                        App deployed successfully! Secrets are now active.
                      </div>
                    )}
                    
                    {deployOperation === 'error' && (
                      <div className="error-message">
                        Failed to deploy app. Please check app configuration and try again.
                      </div>
                    )}
                    
                    {secretsModified && deployOperation !== 'deploying' && (
                      <div className="warning-message">
                        <strong>⚠️ Deployment Required:</strong> Secrets have been modified. Deploy the app to apply changes.
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'certificates' && (
                  <div className="resource-table">
                    {resourceDetails.certificates?.map((cert: any) => (
                      <div key={cert.id} className="resource-item">
                        <h4>{cert.hostname}</h4>
                        <p>Status: {cert.status}</p>
                        <p>Expires: {new Date(cert.expires_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                {activeTab === 'releases' && (
                  <div className="resource-table">
                    {resourceDetails.releases && resourceDetails.releases.length > 0 ? (
                      resourceDetails.releases.slice(0, 10).map((release: any) => (
                        <div key={release.id} className="resource-item">
                          <h4>v{release.version}</h4>
                          <p>Status: {release.status}</p>
                          <p>User: {release.user?.email || 'System'}</p>
                          <p>Created: {new Date(release.created_at).toLocaleString()}</p>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        <p>No releases found for this application.</p>
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'logs' && (
                  <div className="logs-viewer">
                    <div className="logs-controls">
                      <div className="logs-filters">
                        <select
                          value={logFilters.machine}
                          onChange={(e) => setLogFilters(prev => ({ ...prev, machine: e.target.value }))}
                        >
                          <option value="">All machines</option>
                          {machines.map(machine => (
                            <option key={machine.id} value={machine.id}>
                              {machine.id.substring(0, 8)} ({machine.region})
                            </option>
                          ))}
                        </select>
                        
                        <select
                          value={logFilters.region}
                          onChange={(e) => setLogFilters(prev => ({ ...prev, region: e.target.value }))}
                        >
                          <option value="">All regions</option>
                          {Array.from(new Set(machines.map(m => m.region))).map(region => (
                            <option key={region} value={region}>{region}</option>
                          ))}
                        </select>
                        
                        <select
                          value={logFilters.lines}
                          onChange={(e) => setLogFilters(prev => ({ ...prev, lines: e.target.value }))}
                        >
                          <option value="50">Last 50 lines</option>
                          <option value="100">Last 100 lines</option>
                          <option value="200">Last 200 lines</option>
                          <option value="500">Last 500 lines</option>
                        </select>
                        
                        <button
                          className="refresh-logs-btn"
                          onClick={() => selectedApp && fetchLogs(selectedApp, logFilters)}
                          disabled={logsLoading}
                        >
                          {logsLoading ? 'Loading...' : 'Refresh'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="logs-container">
                      {logsLoading && <div className="logs-loading">Loading logs...</div>}
                      {!logsLoading && logs.length === 0 && (
                        <div className="logs-empty">
                          <p>No logs available for the selected filters.</p>
                          <p>Try adjusting the filters or check if the application is running.</p>
                        </div>
                      )}
                      {!logsLoading && logs.length > 0 && (
                        <div className="logs-list">
                          {logs.map((log: any) => (
                            <div key={log.id} className={`log-entry log-${log.level}`}>
                              <span className="log-timestamp">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span className={`log-level log-level-${log.level}`}>
                                {log.level.toUpperCase()}
                              </span>
                              <span 
                                className="log-message" 
                                dangerouslySetInnerHTML={{ __html: log.messageHtml || log.message }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      
      {showToolExplorer && (
        <MCPToolExplorer onClose={() => setShowToolExplorer(false)} />
      )}
      
      {showAppManagement && selectedOrg && (
        <AppManagement
          currentOrg={selectedOrg}
          availableOrgs={organizations}
          onAppCreated={() => {
            // Refresh organization details and apps list
            fetchOrgDetails(selectedOrg);
            fetchApps(selectedOrg);
            setShowAppManagement(false);
          }}
          onAppDeleted={() => {
            // Refresh organization details and apps list
            fetchOrgDetails(selectedOrg);
            fetchApps(selectedOrg);
            // Reset selected app if it was deleted
            setSelectedApp(null);
            setMachines([]);
            setResourceDetails({});
            setShowAppManagement(false);
          }}
          onAppMoved={() => {
            // Refresh organization details and apps list
            fetchOrgDetails(selectedOrg);
            fetchApps(selectedOrg);
            setShowAppManagement(false);
          }}
          onClose={() => setShowAppManagement(false)}
        />
      )}
      
      {showPlatformInfo && (
        <PlatformInfo onClose={() => setShowPlatformInfo(false)} />
      )}
    </div>
  );
}

export default App;