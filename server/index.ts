import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FlyctlMCPClient } from '../lib/flyctl-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory in production
const distPath = path.join(__dirname, '..', '..');
app.use(express.static(distPath));

let mcpClient: FlyctlMCPClient | null = null;

// Initialize MCP client
async function initializeMCPClient() {
  try {
    mcpClient = new FlyctlMCPClient();
    // Use flyctl from system PATH
    await mcpClient.connect();
    console.log('MCP client connected successfully');
  } catch (error) {
    console.error('Failed to connect MCP client:', error);
    process.exit(1);
  }
}

// Helper function to call MCP tools
async function callTool(toolName: string, args: any, parseJson: boolean = true): Promise<any> {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }
  
  const client = mcpClient.rawClient;
  const response = await client.callTool({ name: toolName, arguments: args });
  
  if (response.content && Array.isArray(response.content) && response.content.length > 0) {
    const content = response.content[0];
    if (content.type === 'text') {
      if (parseJson) {
        try {
          return JSON.parse(content.text);
        } catch (e) {
          // If JSON parsing fails, return the raw text
          return { raw_text: content.text };
        }
      } else {
        return content.text;
      }
    }
  }
  
  throw new Error('Invalid response from tool');
}

// API Routes
app.get('/api/organizations', async (req, res) => {
  try {
    const orgs = await callTool('fly-orgs-list', {});
    
    // Convert object format {"slug": "name"} to array format
    const orgArray = Object.entries(orgs).map(([slug, name]) => ({
      slug,
      name: typeof name === 'string' ? name : slug,
      type: 'organization'
    }));
    
    res.json(orgArray);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

app.get('/api/organizations/:org', async (req, res) => {
  try {
    // Get organization details and apps
    const [orgsData, apps] = await Promise.all([
      callTool('fly-orgs-list', {}),
      callTool('fly-apps-list', { org: req.params.org })
    ]);
    
    // Find the specific organization
    const orgSlug = req.params.org;
    const orgName = orgsData[orgSlug] || orgSlug;
    
    // Transform the app data
    const transformedApps = apps.map((app: any) => ({
      id: app.ID || app.id,
      name: app.Name || app.name,
      status: app.Status || app.status,
      deployed: app.Deployed || false,
      hostname: app.Hostname || '',
      platformVersion: app.PlatformVersion || ''
    }));
    
    res.json({
      slug: orgSlug,
      name: orgName,
      type: 'organization',
      appCount: transformedApps.length,
      apps: transformedApps
    });
  } catch (error) {
    console.error('Error fetching organization details:', error);
    res.status(500).json({ error: 'Failed to fetch organization details' });
  }
});

app.get('/api/organizations/:org/apps', async (req, res) => {
  try {
    const apps = await callTool('fly-apps-list', { org: req.params.org });
    
    // Transform the app data to expected format
    const transformedApps = apps.map((app: any) => ({
      id: app.ID || app.id,
      name: app.Name || app.name,
      status: app.Status || app.status,
      organization: {
        slug: req.params.org
      }
    }));
    
    res.json(transformedApps);
  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({ error: 'Failed to fetch apps' });
  }
});

app.get('/api/apps/:app/machines', async (req, res) => {
  try {
    const machines = await callTool('fly-machine-list', { app: req.params.app });
    
    // Transform the machines data to expected format
    const transformedMachines = Array.isArray(machines) ? machines.map((machine: any) => ({
      id: machine.id || machine.ID,
      name: machine.name || machine.Name || machine.id || machine.ID,
      state: machine.state || machine.State || 'unknown',
      region: machine.region || machine.Region || 'unknown',
      created_at: machine.created_at || machine.CreatedAt || new Date().toISOString()
    })) : [];
    
    res.json(transformedMachines);
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ error: 'Failed to fetch machines', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/apps/:app/machines/:machineId', async (req, res) => {
  try {
    const machineStatus = await callTool('fly-machine-status', { 
      app: req.params.app,
      id: req.params.machineId,
      'display-config': true 
    });
    
    // If we got raw text, parse it and structure it
    if (machineStatus.raw_text) {
      const parsedData = parseMachineStatusText(machineStatus.raw_text);
      res.json(parsedData);
    } else {
      res.json(machineStatus);
    }
  } catch (error) {
    console.error('Error fetching machine details:', error);
    res.status(500).json({ error: 'Failed to fetch machine details', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Helper function to parse machine status text
function parseMachineStatusText(text: string) {
  const lines = text.split('\n');
  let id = '', name = '', state = '', region = '', image = '', instance_id = '', private_ip = '';
  let cpu_kind = '', vcpus = '', memory = '', created = '';
  let eventSection = false;
  let configSection = false;
  let configText = '';
  let events: any[] = [];
  
  for (const line of lines) {
    if (line.includes('Machine ID:')) {
      id = line.split(':')[1]?.trim() || '';
    } else if (line.includes('Instance ID:')) {
      instance_id = line.split(':')[1]?.trim() || '';
    } else if (line.includes('State')) {
      const parts = line.split('=');
      if (parts.length > 1) {
        state = parts[1]?.trim() || '';
      } else {
        state = line.split(':')[1]?.trim() || '';
      }
    } else if (line.includes('Image') && line.includes('=')) {
      image = line.split('=')[1]?.trim() || '';
    } else if (line.includes('Name') && line.includes('=')) {
      name = line.split('=')[1]?.trim() || '';
    } else if (line.includes('Private IP') && line.includes('=')) {
      private_ip = line.split('=')[1]?.trim() || '';
    } else if (line.includes('Region') && line.includes('=')) {
      region = line.split('=')[1]?.trim() || '';
    } else if (line.includes('CPU Kind') && line.includes('=')) {
      cpu_kind = line.split('=')[1]?.trim() || '';
    } else if (line.includes('vCPUs') && line.includes('=')) {
      vcpus = line.split('=')[1]?.trim() || '';
    } else if (line.includes('Memory') && line.includes('=')) {
      memory = line.split('=')[1]?.trim() || '';
    } else if (line.includes('Created') && line.includes('=')) {
      created = line.split('=')[1]?.trim() || '';
    } else if (line.includes('Event Logs')) {
      eventSection = true;
    } else if (line.includes('Config:')) {
      configSection = true;
      eventSection = false;
    } else if (configSection) {
      configText += line + '\n';
    } else if (eventSection && line.trim() && !line.includes('STATE') && !line.includes('---')) {
      // Parse event lines like: "started start flyd 2025-06-08T17:55:09.699-04:00"
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        events.push({
          status: parts[0],
          type: parts[1],
          source: parts[2],
          timestamp: parts[3]
        });
      }
    }
  }
  
  return {
    id,
    name: name || id,
    state: state.toLowerCase(),
    region,
    image,
    instance_id,
    private_ip,
    cpu_kind,
    vcpus,
    memory,
    created,
    config: configText.trim() ? { raw: configText.trim() } : null,
    events,
    checks: [],
    raw_text: text
  };
}

app.get('/api/apps/:app/status', async (req, res) => {
  try {
    const status = await callTool('fly-status', { app: req.params.app });
    res.json(status);
  } catch (error) {
    console.error('Error fetching app status:', error);
    res.status(500).json({ error: 'Failed to fetch app status' });
  }
});

app.get('/api/apps/:app/volumes', async (req, res) => {
  try {
    const volumes = await callTool('fly-volumes-list', { app: req.params.app });
    
    // Transform the volumes data to expected format
    const transformedVolumes = Array.isArray(volumes) ? volumes.map((volume: any) => ({
      id: volume.id || volume.ID,
      name: volume.name || volume.Name || volume.id || volume.ID,
      size_gb: volume.size_gb || volume.SizeGb || volume['size-gb'] || volume.size,
      region: volume.region || volume.Region,
      state: volume.state || volume.State || 'unknown',
      attached: volume.attached || volume.Attached || (volume.attached_machine_id || volume.AttachedMachineId || volume['attached-machine-id']) ? true : false,
      attached_machine_id: volume.attached_machine_id || volume.AttachedMachineId || volume['attached-machine-id'],
      created_at: volume.created_at || volume.CreatedAt || new Date().toISOString()
    })) : [];
    
    res.json(transformedVolumes);
  } catch (error) {
    console.error('Error fetching volumes:', error);
    res.status(500).json({ error: 'Failed to fetch volumes' });
  }
});

app.get('/api/apps/:app/secrets', async (req, res) => {
  try {
    const secrets = await callTool('fly-secrets-list', { app: req.params.app });
    
    // Transform the secrets data to expected format
    const transformedSecrets = Array.isArray(secrets) ? secrets.map((secret: any) => ({
      name: secret.Name || secret.name,
      created_at: secret.CreatedAt || secret.created_at,
      digest: secret.Digest || secret.digest
    })) : [];
    
    res.json(transformedSecrets);
  } catch (error) {
    console.error('Error fetching secrets:', error);
    res.status(500).json({ error: 'Failed to fetch secrets' });
  }
});

app.get('/api/apps/:app/certificates', async (req, res) => {
  try {
    const certs = await callTool('fly-certs-list', { app: req.params.app });
    res.json(certs);
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

app.get('/api/apps/:app/releases', async (req, res) => {
  try {
    const releases = await callTool('fly-apps-releases', { name: req.params.app });
    
    // If we got raw text, parse it and structure it
    if (releases.raw_text) {
      const parsedReleases = parseReleasesText(releases.raw_text);
      res.json(parsedReleases);
    } else if (Array.isArray(releases)) {
      // Transform the JSON response to expected format
      const transformedReleases = releases.map((release: any) => ({
        id: release.ID || release.id,
        version: release.Version || release.version,
        status: release.Status || release.status,
        created_at: release.CreatedAt || release.created_at,
        user: {
          email: release.User?.Email || release.user?.email || 'Unknown'
        }
      }));
      res.json(transformedReleases);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Helper function to parse releases text
function parseReleasesText(text: string) {
  const lines = text.split('\n');
  const releases: any[] = [];
  
  for (const line of lines) {
    if (line.trim() && !line.includes('VERSION') && !line.includes('---')) {
      // Parse release lines like: "v1231 2025-06-08T21:55:09Z success user@example.com"
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        releases.push({
          version: parts[0],
          created_at: parts[1],
          status: parts[2],
          user: { email: parts[3] },
          id: parts[0]
        });
      }
    }
  }
  
  return releases;
}

app.get('/api/apps/:app/logs', async (req, res) => {
  try {
    const { machine, region, lines } = req.query;
    
    const params: any = { app: req.params.app };
    if (machine) params.machine = machine;
    if (region) params.region = region;
    
    const logs = await callTool('fly-logs', params, false); // Don't parse as JSON
    
    // Split logs into individual entries
    const logLines = logs.split('\n')
      .filter((line: string) => line.trim())
      .slice(-(parseInt(lines as string) || 100)) // Get last N lines
      .map((line: string, index: number) => ({
        id: index,
        timestamp: extractTimestamp(line),
        message: line,
        messageHtml: ansiToHtml(line),
        level: extractLogLevel(line)
      }));
    
    res.json(logLines);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Machine control endpoints
app.post('/api/apps/:app/machines/:machineId/start', async (req, res) => {
  try {
    const result = await callTool('fly-machine-start', { 
      app: req.params.app,
      id: req.params.machineId 
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error starting machine:', error);
    res.status(500).json({ 
      error: 'Failed to start machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/apps/:app/machines/:machineId/stop', async (req, res) => {
  try {
    const result = await callTool('fly-machine-stop', { 
      app: req.params.app,
      id: req.params.machineId 
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error stopping machine:', error);
    res.status(500).json({ 
      error: 'Failed to stop machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/apps/:app/machines/:machineId/restart', async (req, res) => {
  try {
    const result = await callTool('fly-machine-restart', { 
      app: req.params.app,
      id: req.params.machineId 
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error restarting machine:', error);
    res.status(500).json({ 
      error: 'Failed to restart machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Secrets management endpoints
app.post('/api/apps/:app/secrets', async (req, res) => {
  try {
    const { secrets } = req.body;
    
    // Build the arguments for fly-secrets-set
    // The tool expects keyvalues as an array of "KEY=VALUE" strings
    const keyvalues = Object.entries(secrets).map(([key, value]) => {
      return `${key}=${value}`;
    });
    
    const args = {
      app: req.params.app,
      keyvalues: keyvalues
    };
    
    const result = await callTool('fly-secrets-set', args);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error setting secrets:', error);
    res.status(500).json({ 
      error: 'Failed to set secrets', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.delete('/api/apps/:app/secrets/:secretName', async (req, res) => {
  try {
    const result = await callTool('fly-secrets-unset', { 
      app: req.params.app,
      names: [req.params.secretName]
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error unsetting secret:', error);
    res.status(500).json({ 
      error: 'Failed to unset secret', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Deploy endpoint
app.post('/api/apps/:app/deploy', async (req, res) => {
  try {
    const result = await callTool('fly-secrets-deploy', { 
      app: req.params.app
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error deploying app:', error);
    res.status(500).json({ 
      error: 'Failed to deploy app', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Volume management endpoints
app.post('/api/apps/:app/volumes', async (req, res) => {
  try {
    const { name, region, size_gb, machines } = req.body;
    
    const args: any = {
      app: req.params.app,
      name: name,
      region: region,
      size: size_gb
    };
    
    // Add machines array if provided
    if (machines && machines.length > 0) {
      args.machines = machines;
    }
    
    const result = await callTool('fly-volumes-create', args);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error creating volume:', error);
    res.status(500).json({ 
      error: 'Failed to create volume', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.delete('/api/apps/:app/volumes/:volumeId', async (req, res) => {
  try {
    const result = await callTool('fly-volumes-destroy', { 
      app: req.params.app,
      id: req.params.volumeId
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error destroying volume:', error);
    res.status(500).json({ 
      error: 'Failed to destroy volume', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.put('/api/apps/:app/volumes/:volumeId/extend', async (req, res) => {
  try {
    const { size_gb } = req.body;
    const result = await callTool('fly-volumes-extend', { 
      app: req.params.app,
      id: req.params.volumeId,
      size: size_gb
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error extending volume:', error);
    res.status(500).json({ 
      error: 'Failed to extend volume', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/apps/:app/volumes/:volumeId', async (req, res) => {
  try {
    const result = await callTool('fly-volumes-show', { 
      app: req.params.app,
      id: req.params.volumeId
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching volume details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch volume details', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Platform regions endpoint
app.get('/api/platform/regions', async (req, res) => {
  try {
    const regions = await callTool('fly-platform-regions', {});
    res.json(regions);
  } catch (error) {
    console.error('Error fetching platform regions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch platform regions', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Platform VM sizes endpoint
app.get('/api/platform/vm-sizes', async (req, res) => {
  try {
    const vmSizes = await callTool('fly-platform-vm-sizes', {});
    res.json(vmSizes);
  } catch (error) {
    console.error('Error fetching VM sizes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch VM sizes', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Platform status endpoint
app.get('/api/platform/status', async (req, res) => {
  try {
    const status = await callTool('fly-platform-status', {});
    res.json(status);
  } catch (error) {
    console.error('Error fetching platform status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch platform status', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// App management endpoints
app.post('/api/organizations/:org/apps', async (req, res) => {
  try {
    const result = await callTool('fly-apps-create', {
      org: req.params.org,
      ...req.body
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error creating app:', error);
    res.status(500).json({ 
      error: 'Failed to create app', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.delete('/api/apps/:app', async (req, res) => {
  try {
    const result = await callTool('fly-apps-destroy', { 
      name: req.params.app
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error destroying app:', error);
    res.status(500).json({ 
      error: 'Failed to destroy app', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.put('/api/apps/:app/move', async (req, res) => {
  try {
    const result = await callTool('fly-apps-move', { 
      name: req.params.app,
      ...req.body
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error moving app:', error);
    res.status(500).json({ 
      error: 'Failed to move app', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Machine lifecycle endpoints
app.post('/api/apps/:app/machines', async (req, res) => {
  try {
    const result = await callTool('fly-machine-create', {
      app: req.params.app,
      ...req.body
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error creating machine:', error);
    res.status(500).json({ 
      error: 'Failed to create machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.delete('/api/apps/:app/machines/:machineId', async (req, res) => {
  try {
    const result = await callTool('fly-machine-destroy', { 
      app: req.params.app,
      id: req.params.machineId,
      force: req.query.force === 'true'
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error destroying machine:', error);
    res.status(500).json({ 
      error: 'Failed to destroy machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/apps/:app/machines/:machineId/clone', async (req, res) => {
  try {
    const result = await callTool('fly-machine-clone', { 
      app: req.params.app,
      id: req.params.machineId,
      ...req.body
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error cloning machine:', error);
    res.status(500).json({ 
      error: 'Failed to clone machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/apps/:app/machines/:machineId/cordon', async (req, res) => {
  try {
    const result = await callTool('fly-machine-cordon', { 
      app: req.params.app,
      id: req.params.machineId
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error cordoning machine:', error);
    res.status(500).json({ 
      error: 'Failed to cordon machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/apps/:app/machines/:machineId/uncordon', async (req, res) => {
  try {
    const result = await callTool('fly-machine-uncordon', { 
      app: req.params.app,
      id: req.params.machineId
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error uncordoning machine:', error);
    res.status(500).json({ 
      error: 'Failed to uncordon machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.put('/api/apps/:app/machines/:machineId', async (req, res) => {
  try {
    const result = await callTool('fly-machine-update', { 
      app: req.params.app,
      id: req.params.machineId,
      ...req.body
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating machine:', error);
    res.status(500).json({ 
      error: 'Failed to update machine', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Helper functions for log parsing
function extractTimestamp(logLine: string): string {
  const timestampMatch = logLine.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?)/);
  return timestampMatch ? timestampMatch[1] : new Date().toISOString();
}

function extractLogLevel(logLine: string): string {
  const line = logLine.toLowerCase();
  if (line.includes('error') || line.includes('err')) return 'error';
  if (line.includes('warn') || line.includes('warning')) return 'warn';
  if (line.includes('info')) return 'info';
  if (line.includes('debug')) return 'debug';
  return 'info';
}

// ANSI color codes to HTML conversion
function ansiToHtml(text: string): string {
  // Remove ANSI escape sequences and convert to HTML
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let html = '';
  let lastIndex = 0;
  let currentStyles: string[] = [];
  
  const ansiColorMap: Record<string, string> = {
    // Foreground colors
    '30': 'color: #000000',     // black
    '31': 'color: #e74c3c',     // red
    '32': 'color: #2ecc71',     // green
    '33': 'color: #f1c40f',     // yellow
    '34': 'color: #3498db',     // blue
    '35': 'color: #9b59b6',     // magenta
    '36': 'color: #1abc9c',     // cyan
    '37': 'color: #ecf0f1',     // white
    '90': 'color: #7f8c8d',     // bright black (gray)
    '91': 'color: #ff6b6b',     // bright red
    '92': 'color: #51cf66',     // bright green
    '93': 'color: #ffd93d',     // bright yellow
    '94': 'color: #74c0fc',     // bright blue
    '95': 'color: #d0bfff',     // bright magenta
    '96': 'color: #66d9ef',     // bright cyan
    '97': 'color: #ffffff',     // bright white
    // Background colors
    '40': 'background-color: #000000',     // black
    '41': 'background-color: #e74c3c',     // red
    '42': 'background-color: #2ecc71',     // green
    '43': 'background-color: #f1c40f',     // yellow
    '44': 'background-color: #3498db',     // blue
    '45': 'background-color: #9b59b6',     // magenta
    '46': 'background-color: #1abc9c',     // cyan
    '47': 'background-color: #ecf0f1',     // white
    '100': 'background-color: #7f8c8d',    // bright black (gray)
    '101': 'background-color: #ff6b6b',    // bright red
    '102': 'background-color: #51cf66',    // bright green
    '103': 'background-color: #ffd93d',    // bright yellow
    '104': 'background-color: #74c0fc',    // bright blue
    '105': 'background-color: #d0bfff',    // bright magenta
    '106': 'background-color: #66d9ef',    // bright cyan
    '107': 'background-color: #ffffff',    // bright white
    // Text formatting
    '1': 'font-weight: bold',
    '2': 'opacity: 0.7',
    '3': 'font-style: italic',
    '4': 'text-decoration: underline',
  };
  
  let match;
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before the ANSI code
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (currentStyles.length > 0) {
        html += `<span style="${currentStyles.join('; ')}">${escapeHtml(textBefore)}</span>`;
      } else {
        html += escapeHtml(textBefore);
      }
    }
    
    // Parse the ANSI code
    const codes = match[1].split(';');
    for (const code of codes) {
      if (code === '0' || code === '') {
        // Reset all styles
        currentStyles = [];
      } else if (ansiColorMap[code]) {
        // Add or update style
        const style = ansiColorMap[code];
        const property = style.split(':')[0];
        
        // Remove existing style of the same property
        currentStyles = currentStyles.filter(s => !s.startsWith(property));
        currentStyles.push(style);
      }
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (currentStyles.length > 0) {
      html += `<span style="${currentStyles.join('; ')}">${escapeHtml(remainingText)}</span>`;
    } else {
      html += escapeHtml(remainingText);
    }
  }
  
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// List available tools
app.get('/api/tools', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(500).json({ error: 'MCP client not initialized' });
    }
    const tools = await mcpClient.listTools();
    res.json(tools);
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

// Execute any MCP tool
app.post('/api/tools/:toolName/execute', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(500).json({ error: 'MCP client not initialized' });
    }
    
    const { toolName } = req.params;
    const { arguments: toolArgs } = req.body;
    
    console.log(`Executing tool: ${toolName} with args:`, toolArgs);
    
    const result = await callTool(toolName, toolArgs || {});
    res.json({ success: true, result });
  } catch (error) {
    console.error(`Error executing tool ${req.params.toolName}:`, error);
    res.status(500).json({ 
      error: `Failed to execute tool ${req.params.toolName}`, 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mcpConnected: mcpClient !== null });
});

// Catch-all handler: send back React's index.html file for non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath);
});

// Start server
async function start() {
  await initializeMCPClient();
  
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (mcpClient) {
    await mcpClient.close();
  }
  process.exit(0);
});

start();