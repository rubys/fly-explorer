# Fly Explorer - Claude Development Guide

## Project Overview

Fly Explorer is a comprehensive web-based dashboard for managing Fly.io infrastructure. It provides a complete graphical interface for all Fly.io operations by leveraging the Model Context Protocol (MCP) integration with flyctl, eliminating the need for command-line usage.

## Architecture

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Integration**: MCP client for flyctl
- **Package**: Published as `@rubys/fly-explorer` on npm

### Key Components

1. **MCP Client** (`lib/flyctl-client.ts`): Handles all communication with flyctl MCP server
2. **Express Server** (`server/index.ts`): REST API endpoints and MCP integration
3. **React Frontend** (`src/`): User interface components
4. **CLI Entry** (`bin/fly-explorer`): Command-line interface for launching the app

## Development Workflow

### Getting Started
```bash
npm install
npm run dev  # Starts frontend (3000) and backend (3001) concurrently
```

### Building
```bash
npm run build  # Builds both server and client
npm run test:cli  # Tests the CLI locally
```

### Key Scripts
- `dev`: Runs development servers
- `build`: Production build
- `test:cli`: Tests CLI functionality
- `preview`: Preview production build

## Important Implementation Details

### MCP Integration
The project uses a custom MCP client implementation that:
- Connects to flyctl MCP server via stdio transport
- Handles tool invocations with proper parameter transformation
- Supports progress tokens for long-running operations
- Implements timeout handling with `resetTimeoutOnProgress`

### Real-time Features
- **Log Streaming**: Uses Server-Sent Events (SSE) for live logs
- **Progress Updates**: MCP progress tokens provide real-time feedback
- **Auto-retry**: Automatic retry on timeout for reliability

### API Endpoints Structure
All API endpoints are defined in `server/index.ts`:
- `/api/organizations/*` - Organization management
- `/api/apps/*` - Application operations
- `/api/machines/*` - VM management
- `/api/volumes/*` - Storage operations
- `/api/secrets/*` - Secrets management
- `/api/ips/*` - IP address allocation
- `/api/logs/*` - Log streaming
- `/api/tools/*` - MCP tool access

### Frontend Components
Key components in `src/components/`:
- `OrganizationSelector` - Organization switching
- `ApplicationList` - App management dashboard
- `AppDetails` - Detailed app view with tabs
- `MachineDetails` - VM management interface
- `LogViewer` - Real-time log display
- `ToolExplorer` - Direct MCP tool access

## Common Development Tasks

### Adding a New Feature

1. **Backend**: Add new endpoint in `server/index.ts`
   ```typescript
   app.post('/api/feature', async (req, res) => {
     const result = await client.callTool('fly_feature_tool', req.body);
     res.json(result);
   });
   ```

2. **Frontend**: Create component in `src/components/`
   ```typescript
   // src/components/NewFeature.tsx
   export function NewFeature() {
     // Component implementation
   }
   ```

3. **Integration**: Use fetch for API calls
   ```typescript
   const response = await fetch('/api/feature', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(params)
   });
   ```

### Working with MCP Tools

The project supports all 54+ flyctl MCP tools. To use a tool:

1. Check available tools: `/api/tools`
2. Get tool schema: `/api/tools/:toolName`
3. Invoke tool: `/api/tools/:toolName/invoke`

### Handling Logs

Log streaming is implemented with special handling:
- ANSI escape sequences converted to HTML
- 24-hour timeout support
- Progress indicators during streaming
- Automatic retry on timeout

## Testing & Debugging

### Local Testing
```bash
# Test the CLI
npm run test:cli

# Test specific endpoints
curl http://localhost:3001/api/organizations
```

### Common Issues

1. **MCP Connection**: Ensure flyctl is installed and authenticated
2. **Port Conflicts**: Frontend (3000) and backend (3001) must be available
3. **Build Issues**: Clean `dist/` directory if build fails

## Code Style Guidelines

- TypeScript strict mode enabled
- No explicit type annotations where inference is sufficient
- Async/await preferred over promises
- Error handling at API boundaries
- No console.log in production code

## Deployment

### npm Publishing
```bash
npm version patch  # or minor/major
npm run build
npm publish
```

### Running in Production
```bash
npx @rubys/fly-explorer
# or
fly-explorer
```

## Future Improvements

Consider these areas for enhancement:
- Add automated testing (unit/integration)
- Implement user authentication
- Add state management library for complex state
- Create reusable UI component library
- Add error boundary components
- Implement request caching
- Add WebSocket support for real-time updates

## Troubleshooting

### MCP Client Issues
- Check flyctl installation: `which flyctl`
- Verify MCP server: `flyctl mcp start`
- Check authentication: `fly auth whoami`

### Build Problems
- Clear node_modules and reinstall
- Remove dist/ directory
- Check TypeScript errors: `npx tsc --noEmit`

### Runtime Errors
- Check browser console for frontend errors
- Check server logs for backend errors
- Verify API endpoints are accessible
- Ensure CORS is properly configured

## Resources

- [Fly.io Documentation](https://fly.io/docs/)
- [MCP SDK Documentation](https://modelcontextprotocol.io)
- [Project Repository](https://github.com/rubys/fly-explorer)