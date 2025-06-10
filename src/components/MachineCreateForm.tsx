import React, { useState, useEffect } from 'react';

interface MachineCreateFormProps {
  appName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

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

export function MachineCreateForm({ appName, onSuccess, onCancel }: MachineCreateFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    image: '',
    size: '',
    volumes: [] as { name: string; size_gb: number; mount_path: string }[],
    env: {} as Record<string, string>,
    autostart: true,
    autostop: true,
    services: [] as { ports: number[]; protocol: string; internal_port: number }[]
  });

  const [vmSizes, setVmSizes] = useState<VMSize[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch platform information on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/platform/vm-sizes').then(r => r.json()),
      fetch('/api/platform/regions').then(r => r.json())
    ]).then(([sizes, regions]) => {
      console.log('VM Sizes response:', sizes);
      console.log('Regions response:', regions);
      
      // Handle different response formats for VM sizes
      let vmSizesList: VMSize[] = [];
      if (Array.isArray(sizes)) {
        vmSizesList = sizes.map((size: any) => {
          console.log('VM Size item:', size);
          return {
            name: size.name || size.Name,
            cpu: size.cpus || size.cpu_cores || size.CPUCores || size.cpu || 0,
            memory: size.memory_mb || size.MemoryMB || size.memory || 0,
            monthly_cost: size.price_month || size.PriceMonth || size.monthly_cost || undefined
          };
        });
      } else if (sizes && typeof sizes === 'object') {
        // Convert object format to array if needed
        vmSizesList = Object.entries(sizes).map(([name, details]: [string, any]) => {
          console.log('VM Size entry:', name, details);
          // Check if details is a string (might be a description)
          if (typeof details === 'string') {
            // Try to parse CPU and memory from the string
            const cpuMatch = details.match(/(\d+)\s*(?:CPU|cpu|core|cores)/i);
            const memMatch = details.match(/(\d+)\s*(?:MB|mb|GB|gb)/i);
            const memUnit = details.match(/(\d+)\s*(MB|mb|GB|gb)/i)?.[2]?.toUpperCase();
            
            return {
              name,
              cpu: cpuMatch ? parseInt(cpuMatch[1]) : 0,
              memory: memMatch ? (memUnit === 'GB' ? parseInt(memMatch[1]) * 1024 : parseInt(memMatch[1])) : 0,
              monthly_cost: undefined
            };
          }
          
          return {
            name,
            cpu: details.cpus || details.cpu_cores || details.CPUCores || details.cpu || 0,
            memory: details.memory_mb || details.MemoryMB || details.memory || 0,
            monthly_cost: details.price_month || details.PriceMonth || details.monthly_cost || undefined,
            cpu_kind: details.cpu_kind,
            gpus: details.gpus,
            gpu_kind: details.gpu_kind
          };
        });
      }
      
      // Handle different response formats for regions
      let regionsList: Region[] = [];
      if (Array.isArray(regions)) {
        regionsList = regions.map((region: any) => ({
          code: region.code || region.Code,
          name: region.name || region.Name || region.code || region.Code,
          latitude: region.latitude || region.Latitude,
          longitude: region.longitude || region.Longitude
        }));
      } else if (regions && typeof regions === 'object') {
        // Convert object format to array if needed
        regionsList = Object.entries(regions).map(([code, details]: [string, any]) => ({
          code,
          name: typeof details === 'string' ? details : (details.name || details.Name || code),
          latitude: details.latitude || details.Latitude,
          longitude: details.longitude || details.Longitude
        }));
      }
      
      setVmSizes(vmSizesList);
      setRegions(regionsList);
      
      // Set default values
      if (vmSizesList.length > 0) {
        setFormData(prev => ({ ...prev, size: vmSizesList[0].name }));
      }
      if (regionsList.length > 0) {
        setFormData(prev => ({ ...prev, region: regionsList[0].code }));
      }
    }).catch(err => {
      console.error('Failed to fetch platform info:', err);
      setError('Failed to load platform information');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build the machine configuration using correct MCP parameters
      const config: any = {
        name: formData.name,
        region: formData.region,
        image: formData.image,
        'vm-size': formData.size,
        autostart: formData.autostart,
        autostop: formData.autostop ? 'stop' : 'off'
      };

      // Add environment variables if any
      if (Object.keys(formData.env).length > 0) {
        config.env = Object.entries(formData.env).map(([key, value]) => `${key}=${value}`);
      }

      // Add services/ports if any
      if (formData.services.length > 0) {
        config.port = formData.services.map(service => {
          let portConfig = `${service.ports[0]}:${service.internal_port}`;
          if (service.protocol !== 'tcp') {
            portConfig += `/${service.protocol}`;
          }
          return portConfig;
        });
      }

      // Add volumes if any
      if (formData.volumes.length > 0) {
        config.volume = formData.volumes.map(v => `${v.name}:${v.mount_path}`);
      }

      const response = await fetch(`/api/apps/${appName}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to create machine');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const addVolume = () => {
    setFormData(prev => ({
      ...prev,
      volumes: [...prev.volumes, { name: '', size_gb: 1, mount_path: '' }]
    }));
  };

  const removeVolume = (index: number) => {
    setFormData(prev => ({
      ...prev,
      volumes: prev.volumes.filter((_, i) => i !== index)
    }));
  };

  const addService = () => {
    setFormData(prev => ({
      ...prev,
      services: [...prev.services, { ports: [80], protocol: 'tcp', internal_port: 8080 }]
    }));
  };

  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
  };

  const addEnvVar = () => {
    const key = prompt('Environment variable name:');
    if (key) {
      setFormData(prev => ({
        ...prev,
        env: { ...prev.env, [key]: '' }
      }));
    }
  };

  const removeEnvVar = (key: string) => {
    setFormData(prev => {
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
  };

  return (
    <div className="machine-create-form">
      <h3>Create New Machine</h3>
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Machine Name:</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="my-machine"
            required
          />
        </div>

        <div className="form-group">
          <label>Region:</label>
          <select
            value={formData.region}
            onChange={e => setFormData(prev => ({ ...prev, region: e.target.value }))}
            required
          >
            {regions.length === 0 ? (
              <option value="">Loading regions...</option>
            ) : (
              regions.map(region => (
                <option key={region.code} value={region.code}>
                  {region.name} ({region.code})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="form-group">
          <label>VM Size:</label>
          <select
            value={formData.size}
            onChange={e => setFormData(prev => ({ ...prev, size: e.target.value }))}
            required
          >
            {vmSizes.length === 0 ? (
              <option value="">Loading VM sizes...</option>
            ) : (
              vmSizes.map(size => {
                const memoryGB = size.memory >= 1024 ? `${(size.memory / 1024).toFixed(1)}GB` : `${size.memory}MB`;
                let description = `${size.name} - ${size.cpu} CPU`;
                if (size.cpu_kind) {
                  description += ` (${size.cpu_kind})`;
                }
                description += `, ${memoryGB} RAM`;
                if (size.gpus && size.gpus > 0) {
                  description += `, ${size.gpus} GPU`;
                  if (size.gpu_kind) {
                    description += ` (${size.gpu_kind})`;
                  }
                }
                if (size.monthly_cost) {
                  description += ` - $${size.monthly_cost}/mo`;
                }
                return (
                  <option key={size.name} value={size.name}>
                    {description}
                  </option>
                );
              })
            )}
          </select>
        </div>

        <div className="form-group">
          <label>Docker Image:</label>
          <input
            type="text"
            value={formData.image}
            onChange={e => setFormData(prev => ({ ...prev, image: e.target.value }))}
            placeholder="flyio/hellofly:latest"
            required
          />
        </div>

        <div className="form-section">
          <h4>Environment Variables</h4>
          {Object.entries(formData.env).map(([key, value]) => (
            <div key={key} className="env-var">
              <span>{key}:</span>
              <input
                type="text"
                value={value}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  env: { ...prev.env, [key]: e.target.value }
                }))}
                placeholder="value"
              />
              <button type="button" onClick={() => removeEnvVar(key)}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addEnvVar}>Add Environment Variable</button>
        </div>

        <div className="form-section">
          <h4>Services</h4>
          {formData.services.map((service, index) => (
            <div key={index} className="service-config">
              <input
                type="number"
                value={service.internal_port}
                onChange={e => {
                  const newServices = [...formData.services];
                  newServices[index].internal_port = parseInt(e.target.value);
                  setFormData(prev => ({ ...prev, services: newServices }));
                }}
                placeholder="Internal Port"
              />
              <select
                value={service.protocol}
                onChange={e => {
                  const newServices = [...formData.services];
                  newServices[index].protocol = e.target.value;
                  setFormData(prev => ({ ...prev, services: newServices }));
                }}
              >
                <option value="tcp">TCP</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
              <button type="button" onClick={() => removeService(index)}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addService}>Add Service</button>
        </div>

        <div className="form-section">
          <h4>Volumes</h4>
          {formData.volumes.map((volume, index) => (
            <div key={index} className="volume-config">
              <input
                type="text"
                value={volume.name}
                onChange={e => {
                  const newVolumes = [...formData.volumes];
                  newVolumes[index].name = e.target.value;
                  setFormData(prev => ({ ...prev, volumes: newVolumes }));
                }}
                placeholder="Volume Name"
              />
              <input
                type="number"
                value={volume.size_gb}
                onChange={e => {
                  const newVolumes = [...formData.volumes];
                  newVolumes[index].size_gb = parseInt(e.target.value);
                  setFormData(prev => ({ ...prev, volumes: newVolumes }));
                }}
                placeholder="Size (GB)"
                min="1"
              />
              <input
                type="text"
                value={volume.mount_path}
                onChange={e => {
                  const newVolumes = [...formData.volumes];
                  newVolumes[index].mount_path = e.target.value;
                  setFormData(prev => ({ ...prev, volumes: newVolumes }));
                }}
                placeholder="Mount Path"
              />
              <button type="button" onClick={() => removeVolume(index)}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addVolume}>Add Volume</button>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Machine'}
          </button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}