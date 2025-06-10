import React, { useState, useEffect } from 'react';

interface VMSize {
  name: string;
  cpu: number;
  memory: number;
  monthly_cost?: number;
  cpu_kind?: string;
  gpus?: number;
  gpu_kind?: string;
}

interface Region {
  code: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

interface PlatformStatus {
  incident?: {
    name: string;
    status: string;
    created_at: string;
    impact: string;
  };
  status?: string;
  notices?: Array<{
    name: string;
    created_at: string;
    updated_at: string;
  }>;
}

interface PlatformInfoProps {
  onClose: () => void;
}

export function PlatformInfo({ onClose }: PlatformInfoProps) {
  const [vmSizes, setVmSizes] = useState<VMSize[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'vm-sizes' | 'regions' | 'status'>('vm-sizes');

  useEffect(() => {
    fetchPlatformInfo();
  }, []);

  const fetchPlatformInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const [vmSizesResponse, regionsResponse, statusResponse] = await Promise.all([
        fetch('/api/platform/vm-sizes'),
        fetch('/api/platform/regions'),
        fetch('/api/platform/status')
      ]);

      // Parse VM sizes
      if (vmSizesResponse.ok) {
        const sizes = await vmSizesResponse.json();
        let vmSizesList: VMSize[] = [];
        
        if (Array.isArray(sizes)) {
          vmSizesList = sizes.map((size: any) => ({
            name: size.name || size.Name,
            cpu: size.cpus || size.cpu_cores || size.CPUCores || size.cpu || 0,
            memory: size.memory_mb || size.MemoryMB || size.memory || 0,
            monthly_cost: size.price_month || size.PriceMonth || size.monthly_cost || undefined,
            cpu_kind: size.cpu_kind,
            gpus: size.gpus,
            gpu_kind: size.gpu_kind
          }));
        } else if (sizes && typeof sizes === 'object') {
          vmSizesList = Object.entries(sizes).map(([name, details]: [string, any]) => ({
            name,
            cpu: details.cpus || details.cpu_cores || details.CPUCores || details.cpu || 0,
            memory: details.memory_mb || details.MemoryMB || details.memory || 0,
            monthly_cost: details.price_month || details.PriceMonth || details.monthly_cost || undefined,
            cpu_kind: details.cpu_kind,
            gpus: details.gpus,
            gpu_kind: details.gpu_kind
          }));
        }
        
        setVmSizes(vmSizesList);
      }

      // Parse regions
      if (regionsResponse.ok) {
        const regionsData = await regionsResponse.json();
        let regionsList: Region[] = [];
        
        if (Array.isArray(regionsData)) {
          regionsList = regionsData.map((region: any) => ({
            code: region.code || region.Code,
            name: region.name || region.Name || region.code || region.Code,
            latitude: region.latitude || region.Latitude,
            longitude: region.longitude || region.Longitude
          }));
        } else if (regionsData && typeof regionsData === 'object') {
          regionsList = Object.entries(regionsData).map(([code, details]: [string, any]) => ({
            code,
            name: typeof details === 'string' ? details : (details.name || details.Name || code),
            latitude: details.latitude || details.Latitude,
            longitude: details.longitude || details.Longitude
          }));
        }
        
        setRegions(regionsList);
      }

      // Parse platform status
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        setPlatformStatus(status);
      }

    } catch (err) {
      console.error('Error fetching platform info:', err);
      setError('Failed to load platform information');
    } finally {
      setLoading(false);
    }
  };

  const formatMemory = (memoryMB: number): string => {
    if (memoryMB >= 1024) {
      return `${(memoryMB / 1024).toFixed(1)}GB`;
    }
    return `${memoryMB}MB`;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const getPerformanceTier = (cpuKind?: string): string => {
    if (!cpuKind) return 'Standard';
    if (cpuKind.includes('performance')) return 'Performance';
    if (cpuKind.includes('shared')) return 'Shared';
    return cpuKind;
  };

  return (
    <div className="modal-overlay">
      <div className="modal platform-info-modal">
        <div className="modal-header">
          <h2>Fly.io Platform Information</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {loading && (
          <div className="modal-content">
            <div className="loading-state">Loading platform information...</div>
          </div>
        )}

        {error && (
          <div className="modal-content">
            <div className="error-message">{error}</div>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="modal-tabs">
              <button
                className={activeTab === 'vm-sizes' ? 'active' : ''}
                onClick={() => setActiveTab('vm-sizes')}
              >
                VM Sizes ({vmSizes.length})
              </button>
              <button
                className={activeTab === 'regions' ? 'active' : ''}
                onClick={() => setActiveTab('regions')}
              >
                Regions ({regions.length})
              </button>
              <button
                className={activeTab === 'status' ? 'active' : ''}
                onClick={() => setActiveTab('status')}
              >
                Platform Status
              </button>
            </div>

            <div className="modal-content">
              {activeTab === 'vm-sizes' && (
                <div className="vm-sizes-section">
                  <div className="section-header">
                    <h3>Available VM Sizes</h3>
                    <p>Choose the right compute power for your applications</p>
                  </div>
                  
                  <div className="vm-sizes-grid">
                    {vmSizes.map((vmSize) => (
                      <div key={vmSize.name} className="vm-size-card">
                        <div className="vm-size-header">
                          <h4>{vmSize.name}</h4>
                          {vmSize.monthly_cost && (
                            <span className="vm-size-price">
                              {formatCurrency(vmSize.monthly_cost)}/mo
                            </span>
                          )}
                        </div>
                        
                        <div className="vm-size-specs">
                          <div className="spec-item">
                            <span className="spec-label">CPU:</span>
                            <span className="spec-value">
                              {vmSize.cpu} {vmSize.cpu === 1 ? 'core' : 'cores'}
                              {vmSize.cpu_kind && (
                                <span className="spec-tier">({getPerformanceTier(vmSize.cpu_kind)})</span>
                              )}
                            </span>
                          </div>
                          
                          <div className="spec-item">
                            <span className="spec-label">Memory:</span>
                            <span className="spec-value">{formatMemory(vmSize.memory)}</span>
                          </div>
                          
                          {vmSize.gpus && vmSize.gpus > 0 && (
                            <div className="spec-item">
                              <span className="spec-label">GPU:</span>
                              <span className="spec-value">
                                {vmSize.gpus} {vmSize.gpu_kind || 'GPU'}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="vm-size-use-cases">
                          {vmSize.cpu <= 1 && vmSize.memory <= 512 && (
                            <span className="use-case">Development, Testing</span>
                          )}
                          {vmSize.cpu >= 2 && vmSize.cpu <= 4 && vmSize.memory <= 8192 && (
                            <span className="use-case">Web Apps, APIs</span>
                          )}
                          {vmSize.cpu >= 4 && vmSize.memory >= 8192 && !vmSize.gpus && (
                            <span className="use-case">High-Performance Apps</span>
                          )}
                          {vmSize.gpus && vmSize.gpus > 0 && (
                            <span className="use-case">AI/ML, GPU Computing</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'regions' && (
                <div className="regions-section">
                  <div className="section-header">
                    <h3>Available Regions</h3>
                    <p>Deploy your applications close to your users worldwide</p>
                  </div>
                  
                  <div className="regions-grid">
                    {regions.map((region) => (
                      <div key={region.code} className="region-card">
                        <div className="region-code">{region.code}</div>
                        <div className="region-name">{region.name}</div>
                        {region.latitude && region.longitude && (
                          <div className="region-coords">
                            {region.latitude.toFixed(2)}°, {region.longitude.toFixed(2)}°
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'status' && (
                <div className="status-section">
                  <div className="section-header">
                    <h3>Platform Status</h3>
                    <p>Current operational status of Fly.io infrastructure</p>
                  </div>
                  
                  {platformStatus ? (
                    <div className="platform-status">
                      <div className="status-summary">
                        <div className={`status-indicator ${platformStatus.status || 'operational'}`}>
                          <span className="status-dot"></span>
                          <span className="status-text">
                            {platformStatus.status === 'operational' ? 'All Systems Operational' : 
                             platformStatus.status || 'Status Unknown'}
                          </span>
                        </div>
                      </div>
                      
                      {platformStatus.incident && (
                        <div className="incident-info">
                          <h4>Current Incident</h4>
                          <div className="incident-card">
                            <div className="incident-name">{platformStatus.incident.name}</div>
                            <div className="incident-status">
                              Status: <span className={`status ${platformStatus.incident.status}`}>
                                {platformStatus.incident.status}
                              </span>
                            </div>
                            <div className="incident-impact">
                              Impact: <span className={`impact ${platformStatus.incident.impact}`}>
                                {platformStatus.incident.impact}
                              </span>
                            </div>
                            <div className="incident-time">
                              Started: {new Date(platformStatus.incident.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {platformStatus.notices && platformStatus.notices.length > 0 && (
                        <div className="notices-info">
                          <h4>Platform Notices</h4>
                          <div className="notices-list">
                            {platformStatus.notices.map((notice, index) => (
                              <div key={index} className="notice-card">
                                <div className="notice-name">{notice.name}</div>
                                <div className="notice-dates">
                                  <span>Created: {new Date(notice.created_at).toLocaleDateString()}</span>
                                  <span>Updated: {new Date(notice.updated_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="status-unavailable">
                      <p>Platform status information is currently unavailable.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}