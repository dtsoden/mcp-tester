# MCP Server Tester

A clean, minimalistic testing tool for Model Context Protocol (MCP) servers. Test SSE and Stdio connections, explore tools, resources, and prompts.

## Features

- Connect to MCP servers via SSE (HTTP) or Stdio (process)
- List and test available tools
- Browse and read resources
- View server prompts and capabilities
- Execute tools with custom arguments
- Test server connectivity

## Installation

```bash
npm install
```

## Usage

### Default Port (3000)
```bash
npm start
```
Then open `http://localhost:3000` in your browser.

### Custom Port
You can specify a custom port in two ways:

**Option 1: Command line argument**
```bash
npm start 3032
```

**Option 2: Environment variable**
```bash
PORT=3032 npm start
```

On Windows (Command Prompt):
```cmd
set PORT=3032 && npm start
```

On Windows (PowerShell):
```powershell
$env:PORT=3032; npm start
```

### Direct Node.js
You can also run the server directly with Node.js:

```bash
node server.js 3032
```

## Connecting to MCP Servers

### SSE Connection (Recommended)
1. Select "SSE (HTTP)" connection type
2. Enter server name and URL
3. **(Optional) Authentication:**
   - Expand "Authentication (Optional)" section
   - Choose auth type:
     - **Bearer Token**: Enter your access token
     - **Custom Headers**: Provide JSON headers like `{"Authorization": "Bearer token", "X-API-Key": "key"}`
4. Click "Connect to Server"

**Example with Bearer Token:**
```
Server Name: n8n MCP Server
Server URL: https://auto.cnxlab.us/mcp-server/http
Auth Type: Bearer Token
Token: your_access_token_here
```

### Stdio Connection (Legacy)
1. Select "Stdio (Process)" connection type
2. Enter server name
3. Enter command (e.g., `npx`)
4. Enter arguments (comma-separated)
   - Example: `-y, supergateway, --streamableHttp, https://example.com, --header, authorization:Bearer YOUR_TOKEN`
5. **(Optional) Environment Variables:**
   - Expand "Environment Variables (Optional)" section
   - Provide JSON like `{"API_KEY": "your_key"}`
6. Click "Connect to Server"

**Example from config:**
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "supergateway",
        "--streamableHttp",
        "https://auto.cnxlab.us/mcp-server/http",
        "--header",
        "authorization:Bearer YOUR_ACCESS_TOKEN"
      ]
    }
  }
}
```

In the UI, enter:
- Command: `npx`
- Arguments: `-y, supergateway, --streamableHttp, https://auto.cnxlab.us/mcp-server/http, --header, authorization:Bearer YOUR_ACCESS_TOKEN`

## Configuration Storage

Server configurations are automatically saved to browser localStorage after successful connection. This includes:
- Server name and connection details
- Authentication credentials (Bearer tokens, custom headers, environment variables)

**Saved configurations will appear in a "Saved Configurations" section when you reload the page.**

You can:
- **Load**: Click "Load" to populate the form with saved settings
- **Delete**: Click "Delete" to remove a saved configuration

Note: Configurations are stored in your browser only (not on the server). Clearing browser data will remove saved configurations.

## Testing Servers

Once connected, you can:

- **Test Connectivity**: Click the "Test" button to ping the server
- **Browse Tools**: View all available tools and their parameters
- **Execute Tools**: Click "Test" on any tool to execute it with custom JSON arguments
- **Read Resources**: Browse and read available resources
- **View Prompts**: See all available prompts
- **Server Info**: View server capabilities and information

## Design

Clean, professional interface with:
- Neutral color scheme (grays/whites with subtle green accents)
- Minimalistic, nature-inspired design
- Subtle shadows and effects
- No gradients or bright colors

## Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- MCP Protocol: JSON-RPC over SSE/Stdio

## License

MIT
