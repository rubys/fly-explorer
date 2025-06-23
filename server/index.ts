import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { FlyctlMCPClient } from '../lib/flyctl-client.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory in production
// In npm package: __dirname is dist/server, we want to serve from dist/ (parent dir)
const distPath = path.join(__dirname, '..');
app.use(express.static(distPath));

let mcpClient: FlyctlMCPClient | null = null;

// Check if flyctl is installed
async function checkFlyctl(): Promise<boolean> {
  try {
    execSync('flyctl version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Install flyctl
async function installFlyctl() {
  console.log('flyctl not found in PATH. Installing...');
  
  try {
    const platform = process.platform;
    
    if (platform === 'darwin' || platform === 'linux') {
      // Download and execute the install script directly
      console.log('Downloading flyctl install script...');
      
      try {
        // Fetch the install script
        const response = await fetch('https://fly.io/install.sh');
        if (!response.ok) {
          throw new Error(`Failed to download install script: ${response.statusText}`);
        }
        
        const scriptContent = await response.text();
        
        // Write script to a temporary file and execute it
        const tmpDir = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
        const scriptPath = path.join(tmpDir, `fly-install-${Date.now()}.sh`);
        
        writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
        
        console.log('Running flyctl installer...');
        const { stdout, stderr } = await execAsync(`sh ${scriptPath}`);
        
        // Clean up temporary file
        try {
          unlinkSync(scriptPath);
        } catch {}
        
        if (stderr && !stderr.includes('successfully')) {
          throw new Error(stderr);
        }
        
        // Add to PATH for current session
        const homeDir = process.env.HOME;
        const flyctlPath = `${homeDir}/.fly/bin`;
        process.env.PATH = `${flyctlPath}:${process.env.PATH}`;
        
        console.log('flyctl installed successfully!');
        console.log('Note: You may need to restart your terminal or add ~/.fly/bin to your PATH permanently.');
        
      } catch (fetchError) {
        // Fallback to curl if fetch fails
        console.log('Direct download failed, trying curl fallback...');
        const { stdout, stderr } = await execAsync('curl -L https://fly.io/install.sh | sh');
        
        if (stderr && !stderr.includes('successfully')) {
          throw new Error(stderr);
        }
        
        // Add to PATH for current session
        const homeDir = process.env.HOME;
        const flyctlPath = `${homeDir}/.fly/bin`;
        process.env.PATH = `${flyctlPath}:${process.env.PATH}`;
        
        console.log('flyctl installed successfully!');
        console.log('Note: You may need to restart your terminal or add ~/.fly/bin to your PATH permanently.');
      }
      
    } else if (platform === 'win32') {
      // For Windows, use PowerShell
      console.log('Installing flyctl using PowerShell...');
      const { stdout, stderr } = await execAsync('powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"');
      
      if (stderr && !stderr.includes('successfully')) {
        throw new Error(stderr);
      }
      
      console.log('flyctl installed successfully!');
      console.log('Note: You may need to restart your terminal for the PATH changes to take effect.');
      
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    
    // Verify installation and add to PATH if needed
    const installed = await ensureFlyctlInPath();
    if (!installed) {
      throw new Error('flyctl installation verification failed');
    }
    
    return true;
  } catch (error) {
    console.error('Failed to install flyctl:', error);
    console.error('\nPlease install flyctl manually:');
    console.error('  macOS/Linux: curl -L https://fly.io/install.sh | sh');
    console.error('  Windows: powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"');
    console.error('  Or visit: https://fly.io/docs/flyctl/install/');
    return false;
  }
}

// Check if flyctl exists in common locations and add to PATH if needed
async function ensureFlyctlInPath(): Promise<boolean> {
  // First check if it's already in PATH
  try {
    execSync('flyctl version', { stdio: 'ignore' });
    return true;
  } catch {
    // Not in PATH, check common locations
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const platform = process.platform;
    
    const possiblePaths = [
      `${homeDir}/.fly/bin/flyctl`, // Default install location
      `${homeDir}\\.fly\\bin\\flyctl.exe`, // Windows default
      '/usr/local/bin/flyctl', // Homebrew or manual install
      '/opt/homebrew/bin/flyctl', // Homebrew on Apple Silicon
    ];
    
    for (const flyctlPath of possiblePaths) {
      try {
        execSync(`"${flyctlPath}" version`, { stdio: 'ignore' });
        // Found flyctl, add its directory to PATH
        const flyctlDir = path.dirname(flyctlPath);
        process.env.PATH = `${flyctlDir}:${process.env.PATH}`;
        console.log(`Found flyctl at ${flyctlPath}, added to PATH`);
        return true;
      } catch {
        // Continue checking other paths
      }
    }
    
    return false;
  }
}

// Initialize MCP client
async function initializeMCPClient() {
  try {
    // First check if flyctl is available in PATH or can be added
    const flyctlAvailable = await ensureFlyctlInPath();
    
    if (!flyctlAvailable) {
      console.log('flyctl not found in common locations, attempting to install...');
      const installed = await installFlyctl();
      if (!installed) {
        throw new Error('flyctl is required but could not be installed automatically');
      }
    } else {
      console.log('flyctl is available');
    }
    
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
async function callTool(toolName: string, args: any, parseJson: boolean = true, options?: any): Promise<any> {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }
  
  const client = mcpClient.rawClient;
  const params: any = { name: toolName, arguments: args };
  
  // Add _meta if provided in options
  if (options?._meta) {
    params._meta = options._meta;
  }
  
  // Use request instead of callTool to avoid schema validation issues
  const request = {
    method: 'tools/call' as const,
    params: params
  };
  
  let response;
  if (toolName === 'fly-logs') {
    // Pass timeout as request option for fly-logs (24 hours)
    response = await client.request(request, CallToolResultSchema, { 
      timeout: 24 * 60 * 60 * 1000,
      resetTimeoutOnProgress: true
    });
  } else {
    response = await client.request(request, CallToolResultSchema);
  }
  
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

// Helper function to call MCP tools with notification support
async function callToolWithNotifications(
  toolName: string, 
  args: any, 
  progressToken: string,
  notificationCallback?: (notification: any) => void,
  timeoutMs?: number
): Promise<any> {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }
  
  // Store the original progress handler
  const originalProgressHandler = mcpClient.onProgress;
  
  // Set up progress callback for this specific token
  mcpClient.onProgress = (progress) => {
    // Only handle notifications for our specific token
    if (progress.progressToken === progressToken && notificationCallback) {
      notificationCallback(progress);
    }
    // Also call the original handler if it exists
    if (originalProgressHandler) {
      originalProgressHandler(progress);
    }
  };
  
  try {
    const options = {
      _meta: {
        progressToken: progressToken
      }
    };
    
    let response;
    if (timeoutMs) {
      // Create a timeout promise that never rejects for fly-logs
      response = await callTool(toolName, args, false, options);
    } else {
      response = await callTool(toolName, args, false, options);
    }
    
    return response;
  } finally {
    // Restore the original handler
    mcpClient.onProgress = originalProgressHandler;
  }
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
  const { machine, region, lines, stream } = req.query;
  
  // If not streaming, use the regular response
  if (stream !== 'true') {
    try {
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
    return;
  }
  
  // Set up SSE for streaming logs with progress
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });
  
  // Disable timeout for this specific request
  req.setTimeout(0);
  res.setTimeout(0);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  
  try {
    const params: any = { 
      app: req.params.app
    };
    if (machine) params.machine = machine;
    if (region) params.region = region;
    
    // Generate progress token
    const progressToken = randomUUID();
    
    // Track progress messages
    const progressMessages: string[] = [];
    
    // Call tool with notification support (timeout resets on progress)
    const logs = await callToolWithNotifications('fly-logs', params, progressToken, (notification) => {
      const message = notification.message || notification.params?.message;
      if (message) {
        progressMessages.push(message);
        // Send progress notification via SSE
        res.write(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: message,
          params: notification
        })}\n\n`);
      }
    });
    
    // Process the final logs
    const logLines = logs.split('\n')
      .filter((line: string) => line.trim())
      .slice(-(parseInt(lines as string) || 100))
      .map((line: string, index: number) => ({
        id: index,
        timestamp: extractTimestamp(line),
        message: line,
        messageHtml: ansiToHtml(line),
        level: extractLogLevel(line)
      }));
    
    // Send the complete logs
    res.write(`data: ${JSON.stringify({ 
      type: 'complete', 
      logs: logLines,
      progressMessages: progressMessages
    })}\n\n`);
    
    res.end();
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: 'Failed to fetch logs', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    })}\n\n`);
    res.end();
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

// Settings management
const settingsFile = path.join(__dirname, 'settings.json');

let settings = {
  provider: 'openai' as 'openai' | 'anthropic' | 'gemini' | 'cohere' | 'mistral',
  apiKey: ''
};

// Function to load settings from file
function loadSettings() {
  try {
    if (existsSync(settingsFile)) {
      const data = readFileSync(settingsFile, 'utf8');
      const savedSettings = JSON.parse(data);
      if (savedSettings.provider && savedSettings.apiKey) {
        settings.provider = savedSettings.provider;
        settings.apiKey = savedSettings.apiKey;
        console.log('Loaded settings from file:', { provider: settings.provider, hasApiKey: !!settings.apiKey });
        return;
      }
    }
  } catch (error) {
    console.error('Failed to load settings from file:', error);
  }
  
  // Fallback to environment variables if no saved settings
  if (process.env.OPENAI_API_KEY) {
    settings.provider = 'openai';
    settings.apiKey = process.env.OPENAI_API_KEY;
    console.log('Loaded settings from environment: OpenAI');
  } else if (process.env.ANTHROPIC_API_KEY) {
    settings.provider = 'anthropic';
    settings.apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('Loaded settings from environment: Anthropic');
  } else if (process.env.GEMINI_API_KEY) {
    settings.provider = 'gemini';
    settings.apiKey = process.env.GEMINI_API_KEY;
    console.log('Loaded settings from environment: Gemini');
  } else if (process.env.COHERE_API_KEY) {
    settings.provider = 'cohere';
    settings.apiKey = process.env.COHERE_API_KEY;
    console.log('Loaded settings from environment: Cohere');
  } else if (process.env.MISTRAL_API_KEY) {
    settings.provider = 'mistral';
    settings.apiKey = process.env.MISTRAL_API_KEY;
    console.log('Loaded settings from environment: Mistral');
  } else {
    console.log('No saved settings or environment variables found, using defaults');
  }
}

// Function to save settings to file
function saveSettings() {
  try {
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log('Settings saved to file');
  } catch (error) {
    console.error('Failed to save settings to file:', error);
  }
}

// Load settings on startup
loadSettings();

// Settings endpoints
app.get('/api/settings', (req, res) => {
  res.json({
    provider: settings.provider,
    hasApiKey: !!settings.apiKey,
    apiKeyMask: settings.apiKey ? '***' + settings.apiKey.slice(-4) : ''
  });
});

app.post('/api/settings', (req, res) => {
  const { provider, apiKey } = req.body;
  console.log('Saving settings:', { provider, apiKey: apiKey ? '***' + apiKey.slice(-4) : 'none' });
  console.log('Current stored settings before save:', { provider: settings.provider, hasApiKey: !!settings.apiKey });
  if (provider && apiKey) {
    settings.provider = provider;
    settings.apiKey = apiKey;
    saveSettings(); // Persist to file
    console.log('Settings saved successfully. New settings:', { provider: settings.provider, hasApiKey: !!settings.apiKey });
    res.json({ success: true });
  } else {
    console.log('Missing provider or apiKey');
    res.status(400).json({ error: 'Provider and API key are required' });
  }
});

app.get('/api/settings/api-key/status', (req, res) => {
  console.log('Checking API key status:', !!settings.apiKey, 'Provider:', settings.provider);
  res.json({ hasApiKey: !!settings.apiKey });
});

// Debug endpoint to see current settings
app.get('/api/settings/debug', (req, res) => {
  res.json({
    provider: settings.provider,
    hasApiKey: !!settings.apiKey,
    apiKeyLength: settings.apiKey.length,
    apiKeyPreview: settings.apiKey ? settings.apiKey.substring(0, 6) + '...' : 'none'
  });
});

app.post('/api/settings/test', async (req, res) => {
  // Use settings from request body if provided, otherwise use stored settings
  const testSettings = req.body && req.body.apiKey ? req.body : settings;
  
  if (!testSettings.apiKey) {
    return res.status(400).json({ success: false, error: 'No API key configured' });
  }

  try {
    console.log('Testing connection with provider:', testSettings.provider);
    if (testSettings.provider === 'openai') {
      console.log('Using OpenAI API');
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: testSettings.apiKey });
      await openai.models.list();
    } else if (testSettings.provider === 'anthropic') {
      console.log('Using Anthropic API');
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: testSettings.apiKey });
      await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      });
    } else if (testSettings.provider === 'gemini') {
      console.log('Using Gemini API');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(testSettings.apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      await model.generateContent('test');
    } else if (testSettings.provider === 'cohere') {
      console.log('Using Cohere API');
      const { CohereClient } = await import('cohere-ai');
      const cohere = new CohereClient({ token: testSettings.apiKey });
      await cohere.chat({ message: 'test', maxTokens: 1 });
    } else if (testSettings.provider === 'mistral') {
      console.log('Using Mistral API');
      const { Mistral } = await import('@mistralai/mistralai');
      const mistral = new Mistral({ apiKey: testSettings.apiKey });
      await mistral.models.list();
    }
    res.json({ success: true });
  } catch (error: any) {
    console.log('Test connection error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// Helper function to handle different AI providers
async function handleProviderChat(provider: string, apiKey: string, chatMessages: any[], systemPrompt: string, availableTools: any[], res: any) {
  if (provider === 'openai') {
    console.log('Using OpenAI provider');
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: chatMessages as any,
      tools: availableTools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputSchema || { type: 'object', properties: {} }
        }
      }))
    });

    const message = completion.choices[0]?.message;
    
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolMessages = [];
      for (const toolCall of message.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await callTool(toolCall.function.name, args);
          toolMessages.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        } catch (error) {
          toolMessages.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: `Error: ${error}`
          });
        }
      }

      const finalCompletion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [...chatMessages, message, ...toolMessages] as any,
        stream: true
      });

      for await (const chunk of finalCompletion) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
    } else if (message?.content) {
      const words = message.content.split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } else if (provider === 'anthropic') {
    console.log('Using Anthropic provider');
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4096,
      messages: chatMessages.filter(m => m.role !== 'system') as any,
      system: systemPrompt,
      tools: availableTools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        input_schema: tool.inputSchema || { type: 'object', properties: {} }
      }))
    });

    const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
    
    if (toolUseBlocks.length > 0) {
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        try {
          const result = await callTool(toolUse.name, toolUse.input || {});
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: `Error: ${error}`,
            is_error: true
          });
        }
      }

      const finalResponse = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 4096,
        messages: [
          ...chatMessages.filter(m => m.role !== 'system'),
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults }
        ] as any,
        system: systemPrompt,
        stream: true
      });

      for await (const chunk of finalResponse) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
        }
      }
    } else {
      const textBlocks = response.content.filter(block => block.type === 'text');
      if (textBlocks.length > 0) {
        for (const block of textBlocks) {
          const words = block.text.split(' ');
          for (const word of words) {
            res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
    }
  } else if (provider === 'gemini') {
    console.log('Using Gemini provider');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-pro',
      tools: availableTools.length > 0 ? [{
        functionDeclarations: availableTools.map(tool => ({
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputSchema || { type: 'object', properties: {} }
        }))
      }] : undefined
    });

    const chat = model.startChat({
      history: chatMessages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      generationConfig: { maxOutputTokens: 4096 }
    });

    const lastMessage = chatMessages[chatMessages.length - 1];
    const result = await chat.sendMessage(systemPrompt + '\n\n' + lastMessage.content);
    
    const functionCalls = result.response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const toolResults = [];
      for (const funcCall of functionCalls) {
        try {
          const toolResult = await callTool(funcCall.name, funcCall.args || {});
          toolResults.push({
            functionResponse: {
              name: funcCall.name,
              response: toolResult
            }
          });
        } catch (error) {
          toolResults.push({
            functionResponse: {
              name: funcCall.name,
              response: { error: (error as Error).toString() }
            }
          });
        }
      }

      const finalResult = await chat.sendMessage(toolResults);
      const words = finalResult.response.text().split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } else {
      const words = result.response.text().split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } else if (provider === 'cohere') {
    console.log('Using Cohere provider');
    const { CohereClient } = await import('cohere-ai');
    const cohere = new CohereClient({ token: apiKey });

    const lastMessage = chatMessages[chatMessages.length - 1];
    const chatHistory = chatMessages.slice(0, -1).filter(m => m.role !== 'system').map(m => ({
      role: m.role.toUpperCase() as 'USER' | 'CHATBOT',
      message: m.content
    }));

    const tools = availableTools.length > 0 ? availableTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameterDefinitions: Object.entries(tool.inputSchema?.properties || {}).reduce((acc, [key, value]: [string, any]) => {
        acc[key] = {
          description: value.description || '',
          type: value.type || 'string',
          required: tool.inputSchema?.required?.includes(key) || false
        };
        return acc;
      }, {} as any)
    })) : undefined;

    const response = await cohere.chat({
      message: systemPrompt + '\n\n' + lastMessage.content,
      chatHistory,
      model: 'command-r-plus',
      maxTokens: 4096,
      tools
    });

    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = [];
      for (const toolCall of response.toolCalls) {
        try {
          const result = await callTool(toolCall.name, toolCall.parameters || {});
          toolResults.push({
            call: toolCall,
            outputs: [{ result: JSON.stringify(result) }]
          });
        } catch (error) {
          toolResults.push({
            call: toolCall,
            outputs: [{ result: `Error: ${error}` }]
          });
        }
      }

      const finalResponse = await cohere.chat({
        message: '',
        chatHistory: [
          ...chatHistory,
          { role: 'USER', message: lastMessage.content },
          { role: 'CHATBOT', message: response.text, toolCalls: response.toolCalls }
        ],
        model: 'command-r-plus',
        maxTokens: 4096,
        toolResults
      });

      const words = finalResponse.text.split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } else {
      const words = response.text.split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } else if (provider === 'mistral') {
    console.log('Using Mistral provider');
    const { Mistral } = await import('@mistralai/mistralai');
    const mistral = new Mistral({ apiKey });

    const tools = availableTools.length > 0 ? availableTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      }
    })) : undefined;

    const response = await mistral.chat.complete({
      model: 'mistral-large-latest',
      messages: chatMessages as any,
      tools,
      maxTokens: 4096
    });

    const message = response.choices[0]?.message;
    
    if (message?.toolCalls && message.toolCalls.length > 0) {
      const toolMessages = [];
      for (const toolCall of message.toolCalls) {
        try {
          const args = typeof toolCall.function.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
          const result = await callTool(toolCall.function.name, args);
          toolMessages.push({
            role: 'tool' as const,
            name: toolCall.function.name,
            content: JSON.stringify(result),
            toolCallId: toolCall.id
          });
        } catch (error) {
          toolMessages.push({
            role: 'tool' as const,
            name: toolCall.function.name,
            content: `Error: ${error}`,
            toolCallId: toolCall.id
          });
        }
      }

      const finalResponse = await mistral.chat.complete({
        model: 'mistral-large-latest',
        messages: [...chatMessages, message, ...toolMessages] as any,
        maxTokens: 4096
      });

      const finalMessage = finalResponse.choices[0]?.message?.content;
      if (finalMessage && typeof finalMessage === 'string') {
        const words = finalMessage.split(' ');
        for (const word of words) {
          res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } else if (message?.content && typeof message.content === 'string') {
      const words = message.content.split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  if (!settings.apiKey) {
    return res.status(400).json({ error: 'No API key configured' });
  }

  const { messages } = req.body;
  
  // Set headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    console.log('Chat request received:', { messageCount: messages.length });
    
    // Get available tools from MCP client
    let availableTools: any[] = [];
    if (mcpClient) {
      try {
        const tools = await mcpClient.rawClient.listTools();
        availableTools = tools.tools || [];
        console.log(`Found ${availableTools.length} available tools`);
      } catch (error) {
        console.error('Failed to list tools:', error);
      }
    } else {
      console.log('No MCP client available');
    }

    // System prompt for Fly.io assistant
    const systemPrompt = `You are a helpful Fly.io assistant with access to the user's Fly.io infrastructure through MCP tools. You can:

1. List and manage organizations, applications, machines, volumes, secrets, and IP addresses
2. View logs, metrics, and deployment history
3. Create, update, and delete resources
4. Help with troubleshooting and best practices

When users ask questions, use the available tools to gather information and provide helpful, conversational responses. Format your responses for a chat interface:

- Use plain text, not XML or HTML formatting
- Use bullet points with dashes (-) or asterisks (*)
- Use line breaks for readability
- Present information clearly and concisely
- Don't use XML tags like <thinking> or <response>

Examples of good responses:
- "You have 3 applications running:
  * my-app (deployed, running in sydney)
  * test-app (suspended)
  * prod-app (deployed, running in frankfurt)"

- "Here are your current machines:
  * Machine abc123: running in sydney (shared-cpu-1x)
  * Machine def456: stopped in frankfurt (performance-1x)"

Available tools include:
- fly-apps-list, fly-apps-create, fly-apps-destroy
- fly-machine-list, fly-machine-create, fly-machine-start/stop/restart
- fly-volumes-list, fly-volumes-create, fly-volumes-extend
- fly-secrets-list, fly-secrets-set, fly-secrets-unset
- fly-ips-list, fly-ips-allocate-v4/v6, fly-ips-release
- fly-logs, fly-releases-list, fly-certs-list
- And many more...

Always be helpful, accurate, and cautious with destructive operations. Ask for confirmation before deleting resources.`;

    // Prepare messages with system prompt
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    await handleProviderChat(settings.provider, settings.apiKey, chatMessages, systemPrompt, availableTools, res);

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

async function start() {
  await initializeMCPClient();
  
  app.listen(port, async () => {
    const url = `http://localhost:${port}`;
    console.log(`Server running at ${url}`);
    
    // Open browser automatically
    if (process.env.NODE_ENV !== 'production') {
      try {
        const open = (await import('open')).default;
        // In dev mode with backend on 3001, open frontend on 3000
        const browserUrl = port === 3001 ? 'http://localhost:3000' : url;
        // Add a small delay to ensure server is fully ready
        setTimeout(async () => {
          await open(browserUrl);
          console.log(`Browser opened automatically at ${browserUrl}`);
        }, 1000);
      } catch (error) {
        console.log('Could not open browser automatically:', error);
      }
    }
  });
}

// Catch-all handler: send back React's index.html file for non-API routes
// This must be AFTER all API routes are defined
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (mcpClient) {
    await mcpClient.close();
  }
  process.exit(0);
});

start();