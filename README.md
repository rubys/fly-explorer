# Fly.io Explorer

A comprehensive web-based dashboard for managing Fly.io infrastructure using Model Context Protocol (MCP) integration with flyctl. Provides a complete graphical interface for all Fly.io operations without requiring command-line usage.

## 🚀 Features

### **Organization & Application Management**
- **Multi-Organization Support**: Switch between organizations and view detailed statistics
- **Complete App Lifecycle**: Create, delete, and move applications between organizations
- **Application Monitoring**: Real-time status tracking (deployed, suspended, failed)
- **Deployment Management**: Deploy applications and track release history

### **Virtual Machine Management**
- **Machine Creation**: Advanced machine creation with platform-aware configuration:
  - Regional deployment with automatic region/VM size population
  - Docker image specification
  - Environment variable management
  - Service/port configuration
  - Volume attachment
- **Machine Operations**: Complete lifecycle control:
  - Start/Stop/Restart machines
  - Clone machines with optional region changes
  - Cordon/Uncordon for allocation management
  - Destroy machines with force options
- **Detailed Monitoring**: Comprehensive machine information including hardware specs, network details, event logs, and health checks

### **Network & IP Address Management**
- **Complete IP Management**: Comprehensive IP address allocation and management:
  - Allocate shared or dedicated IPv4 addresses
  - Allocate public IPv6 addresses
  - Allocate private IPv6 addresses for internal networking
  - Regional IP allocation with dropdown selection
  - View all assigned IP addresses (public and private) in organized table
  - Release public IP addresses when no longer needed
- **Network Configuration**: Custom network specification for advanced setups

### **Storage & Configuration Management**
- **Volume Management**: Create, extend, delete, and monitor persistent volumes
- **Secrets Management**: Secure environment variable handling with deployment tracking
- **SSL Certificate Monitoring**: View certificate status, expiration, and validity

### **Real-time Monitoring & Logging**
- **Live Log Streaming**: Real-time application logs with advanced filtering:
  - Filter by machine, region, or line count
  - Color-coded log levels (error, warn, info, debug)
  - ANSI escape sequence support for formatted output
  - **Progress Indicators**: Real-time progress notifications during log fetching
  - **Auto-scroll**: Automatically scrolls to show new messages as they arrive
  - **Auto-retry**: Automatically retries on timeout and resets the log window
- **Extended Timeout Support**: 24-hour timeout for long-running log operations
- **Machine State Tracking**: Live updates of machine status and events
- **Platform Status**: Monitor Fly.io platform health and available regions

### **Advanced Administration (MCP Tool Explorer)**
- **Universal Tool Access**: Execute any flyctl command through an intuitive interface
- **Dynamic Form Generation**: Automatically generates forms based on tool schemas
- **Parameter Validation**: Type checking and required field validation
- **Raw MCP Access**: Direct access to all 54+ flyctl MCP tools for advanced operations

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  React Frontend │    │  Express Server │    │   flyctl MCP    │
│   (Port 3000)   │◄──►│   (Port 3001)   │◄──►│     Server      │
│                 │    │                 │    │                 │
│ • UI Components │    │ • REST API      │    │ • Tool Execution│
│ • State Mgmt    │    │ • MCP Client    │    │ • Data Parsing  │
│ • Real-time UI  │    │ • Data Transform│    │ • flyctl Bridge │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **Technology Stack**
- **Frontend**: React with TypeScript, responsive CSS design
- **Backend**: Express.js with comprehensive error handling
- **MCP Integration**: Full Model Context Protocol client implementation
- **Real-time Updates**: Automatic refresh and live status monitoring

## 📦 Installation

### Quick Start with npx (Recommended)

Run instantly without installation:

```bash
npx @rubys/fly-explorer
```

This will download and start Fly Explorer automatically. Open your browser to http://localhost:3001

### Global Installation

Install globally via npm to use the `fly-explorer` command anywhere:

```bash
npm install -g @rubys/fly-explorer
fly-explorer
```

### Local Installation

Install in your project directory:

```bash
npm install @rubys/fly-explorer
npx fly-explorer
```

### Prerequisites
- Node.js (v18+)
- flyctl binary available in system PATH ([install flyctl](https://fly.io/docs/hands-on/install-flyctl/))

## 🚦 Development Setup

### Quick Start

1. **Clone the repository:**
```bash
git clone https://github.com/rubys/fly-explorer.git
cd fly-explorer
```

2. **Install dependencies:**
```bash
npm install
```

3. **Ensure flyctl is available:**
```bash
flyctl version
```

4. **Start development environment:**
```bash
npm run dev
```

This starts:
- **Frontend**: http://localhost:5173 (React with Vite)
- **Backend**: http://localhost:3001 (Express API server)
- **MCP Connection**: Automatic connection to flyctl MCP server

### Production Build

```bash
npm run build  # Build React frontend and server
npm start      # Start production server
```

## 📡 API Reference

### **Organization Management**
- `GET /api/organizations` - List all organizations
- `GET /api/organizations/:org` - Get organization details
- `POST /api/organizations/:org/apps` - Create new application

### **Application Management**
- `GET /api/organizations/:org/apps` - List applications
- `DELETE /api/apps/:app` - Delete application
- `PUT /api/apps/:app/move` - Move app between organizations
- `POST /api/apps/:app/deploy` - Deploy application
- `GET /api/apps/:app/status` - Get application status
- `GET /api/apps/:app/releases` - Get release history

### **Machine Management**
- `GET /api/apps/:app/machines` - List machines
- `GET /api/apps/:app/machines/:id` - Get machine details
- `POST /api/apps/:app/machines` - Create machine
- `DELETE /api/apps/:app/machines/:id` - Destroy machine
- `POST /api/apps/:app/machines/:id/start` - Start machine
- `POST /api/apps/:app/machines/:id/stop` - Stop machine
- `POST /api/apps/:app/machines/:id/restart` - Restart machine
- `POST /api/apps/:app/machines/:id/clone` - Clone machine
- `POST /api/apps/:app/machines/:id/cordon` - Cordon machine
- `POST /api/apps/:app/machines/:id/uncordon` - Uncordon machine

### **IP Address Management**
- `POST /api/tools/fly-ips-list/execute` - List all IP addresses (public)
- `POST /api/tools/fly-ips-private/execute` - List private IP addresses
- `POST /api/tools/fly-ips-allocate-v4/execute` - Allocate IPv4 address (shared/dedicated)
- `POST /api/tools/fly-ips-allocate-v6/execute` - Allocate public IPv6 address
- `POST /api/tools/fly-ips-private/execute` - Allocate private IPv6 address
- `POST /api/tools/fly-ips-release/execute` - Release IP addresses

### **Storage & Configuration**
- `GET /api/apps/:app/volumes` - List volumes
- `POST /api/apps/:app/volumes` - Create volume
- `DELETE /api/apps/:app/volumes/:id` - Delete volume
- `PUT /api/apps/:app/volumes/:id/extend` - Extend volume
- `GET /api/apps/:app/secrets` - List secrets
- `POST /api/apps/:app/secrets` - Create/update secrets
- `DELETE /api/apps/:app/secrets/:name` - Delete secret
- `GET /api/apps/:app/certificates` - List SSL certificates

### **Platform Information**
- `GET /api/platform/regions` - List available regions
- `GET /api/platform/vm-sizes` - List VM sizes and pricing
- `GET /api/platform/status` - Platform health status

### **Monitoring & Logs**
- `GET /api/apps/:app/logs` - Stream application logs
- `GET /api/tools` - List all available MCP tools
- `POST /api/tools/:tool/execute` - Execute any MCP tool

## 🎯 Use Cases

### **Development Teams**
- **Rapid Prototyping**: Quickly spin up applications and machines for testing
- **Environment Management**: Manage development, staging, and production environments
- **Log Debugging**: Real-time log monitoring with advanced filtering
- **Resource Optimization**: Monitor and adjust machine sizes and regional deployment

### **DevOps & Infrastructure**
- **Infrastructure as Code**: Programmatic machine, volume, and IP management
- **Multi-Organization Management**: Handle multiple clients or projects
- **Network Management**: IP allocation and regional networking configuration
- **Operational Monitoring**: Track application health and performance
- **Disaster Recovery**: Machine cloning and cross-region deployment

### **Learning & Exploration**
- **Fly.io Onboarding**: Visual introduction to Fly.io concepts and capabilities
- **Command Discovery**: Explore flyctl functionality through the MCP Tool Explorer
- **Safe Experimentation**: GUI-based operations with confirmation prompts

## 🔧 Advanced Features

### **MCP Tool Explorer**
Access to all flyctl capabilities through a visual interface:
- Execute any of the 54+ available flyctl tools
- Dynamic parameter forms with validation
- Raw access to advanced operations not available in the main UI

### **Platform Integration**
- **Real-time Data**: Live synchronization with Fly.io APIs
- **Intelligent Parsing**: Automatic handling of various flyctl output formats
- **Error Handling**: Comprehensive error messages and recovery suggestions

### **Safety Features**
- **Confirmation Dialogs**: Protection against accidental destructive operations
- **Validation**: Input validation and type checking throughout
- **Rollback Information**: Clear indication of irreversible operations


## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Submit a pull request with a clear description

### Publishing (Maintainers Only)

To publish a new version to npm:

1. **Update version in package.json:**
```bash
npm version patch  # or minor/major
```

2. **Build and publish:**
```bash
npm run build
npm publish
```

3. **Push changes and tags:**
```bash
git push origin main --tags
```

The package is published as `@rubys/fly-explorer` on npm.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Related Projects

- [Fly.io](https://fly.io) - The platform this tool manages
- [flyctl](https://github.com/superfly/flyctl) - The CLI tool this interfaces with
- [Model Context Protocol](https://modelcontextprotocol.io) - The protocol used for integration