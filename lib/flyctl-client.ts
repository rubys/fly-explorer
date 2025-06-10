import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class FlyctlMCPClient {
  private client: Client;
  private transport?: StdioClientTransport;

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
    const command = flyctlPath || 'flyctl';
    
    console.log(`Spawning flyctl MCP server: ${command}`);

    this.transport = new StdioClientTransport({
      command,
      args: ['mcp', 'server'],
      env: process.env as Record<string, string>
    });

    await this.client.connect(this.transport);
    console.log('Connected to flyctl MCP server');
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