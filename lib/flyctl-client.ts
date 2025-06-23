import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { execSync } from 'child_process';
import * as os from 'os';

export class FlyctlMCPClient {
  private client: Client;
  private transport?: StdioClientTransport;
  
  // Callback properties for notifications
  public onProgress?: (progress: any) => void;
  public onLogMessage?: (logMessage: any) => void;
  public onUnhandledNotification?: (notification: any) => void;

  constructor() {
    this.client = new Client({
      name: 'flyctl-mcp-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });
  }

  async connect(flyctlPath?: string): Promise<void> {
    // Use flyctl from PATH or provided path
    let command = flyctlPath || 'flyctl';
    
    // If flyctl is not in PATH, check common installation locations
    if (!flyctlPath) {
      try {
        execSync('flyctl version', { stdio: 'ignore' });
      } catch {
        // Try common installation paths
        const homeDir = os.homedir();
        const platform = process.platform;
        
        const possiblePaths = [
          `${homeDir}/.fly/bin/flyctl`, // Unix-like default
          `${homeDir}\\.fly\\bin\\flyctl.exe`, // Windows default
          '/usr/local/bin/flyctl', // Homebrew or manual install
          '/opt/homebrew/bin/flyctl', // Homebrew on Apple Silicon
        ];
        
        for (const path of possiblePaths) {
          try {
            execSync(`"${path}" version`, { stdio: 'ignore' });
            command = path;
            console.log(`Found flyctl at: ${path}`);
            break;
          } catch {
            // Continue checking other paths
          }
        }
      }
    }
    
    console.log(`Spawning flyctl MCP server: ${command}`);

    this.transport = new StdioClientTransport({
      command,
      args: ['mcp', 'server'],
      env: process.env as Record<string, string>
    });

    await this.client.connect(this.transport);
    
    // Set up notification handlers after connecting
    this.setupNotificationHandlers();
    
    console.log('Connected to flyctl MCP server');
  }
  
  private setupNotificationHandlers(): void {
    // Define the progress notification schema
    const ProgressNotificationSchema = z.object({
      method: z.literal('notifications/progress'),
      params: z.object({
        progressToken: z.string(),
        progress: z.number().optional(),
        total: z.number().optional(),
        message: z.string().optional()
      })
    });
    
    // Handle progress notifications
    this.client.setNotificationHandler(ProgressNotificationSchema, (notification) => {
      this.onProgress?.(notification.params);
    });
    
    // Set up fallback notification handler for unknown notification types
    this.client.fallbackNotificationHandler = async (notification) => {
      this.onUnhandledNotification?.(notification);
    };
  }

  async listTools(): Promise<any[]> {
    const allTools: any[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await this.client.listTools({ cursor });
      allTools.push(...response.tools);
      cursor = response.nextCursor;
    } while (cursor);
    
    return allTools;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  // Expose the client for tool calls
  get rawClient(): Client {
    return this.client;
  }
}