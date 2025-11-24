const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.argv[2] || process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store active MCP connections
const connections = new Map();

// Helper to generate unique IDs
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// MCP JSON-RPC helper
function createJsonRpcRequest(method, params = {}, id = null) {
  return {
    jsonrpc: '2.0',
    method,
    params,
    id: id || generateId()
  };
}

// Connect to SSE-based MCP server
async function connectSSE(url, customHeaders = {}) {
  try {
    const headers = {
      'Accept': 'text/event-stream',
      ...customHeaders
    };

    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return {
      type: 'sse',
      url,
      headers: customHeaders,
      connected: true
    };
  } catch (error) {
    throw new Error(`SSE connection failed: ${error.message}`);
  }
}

// Connect to stdio-based MCP server
function connectStdio(command, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Cross-platform command handling
      let actualCommand = command;
      let actualArgs = args;
      let useShell = false;

      // On Windows, handle .cmd executables and PATH resolution
      if (process.platform === 'win32') {
        // Common commands that are .cmd on Windows
        const cmdCommands = ['npx', 'npm', 'yarn', 'pnpm'];
        if (cmdCommands.includes(command.toLowerCase())) {
          actualCommand = `${command}.cmd`;
        }
        useShell = true; // Windows needs shell to resolve PATH

        // Quote arguments that contain spaces to prevent shell from splitting them
        actualArgs = args.map(arg => {
          if (typeof arg === 'string' && arg.includes(' ') && !arg.startsWith('"')) {
            return `"${arg}"`;
          }
          return arg;
        });
      }

      const spawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        shell: useShell
      };

      console.log('Spawning:', actualCommand, actualArgs);

      const child = spawn(actualCommand, actualArgs, spawnOptions);

      let initialized = false;

      child.stdout.on('data', (data) => {
        if (!initialized) {
          initialized = true;
          resolve({
            type: 'stdio',
            process: child,
            command,
            args,
            connected: true
          });
        }
      });

      child.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start process: ${error.message}`));
      });

      child.on('close', (code) => {
        console.log(`Process exited with code ${code}`);
      });

      // Send initialize request
      setTimeout(() => {
        const initRequest = createJsonRpcRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: false },
            sampling: {}
          },
          clientInfo: {
            name: 'mcp-tester',
            version: '1.0.0'
          }
        });
        child.stdin.write(JSON.stringify(initRequest) + '\n');
      }, 100);

      // Timeout if no response
      setTimeout(() => {
        if (!initialized) {
          child.kill();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}

// Send request to MCP server
async function sendMcpRequest(connection, method, params = {}) {
  return new Promise(async (resolve, reject) => {
    const request = createJsonRpcRequest(method, params);

    if (connection.type === 'sse') {
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(connection.headers || {})
        };

        const response = await fetch(connection.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        resolve(data);
      } catch (error) {
        reject(error);
      }
    } else if (connection.type === 'stdio') {
      let onData;
      const timeout = setTimeout(() => {
        if (onData) {
          connection.process.stdout.removeListener('data', onData);
        }
        reject(new Error('Request timeout'));
      }, 10000);

      onData = (data) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              // Accept response with matching ID (includes both result and error)
              // or matching method for notifications
              if (response.id === request.id || response.method === method) {
                clearTimeout(timeout);
                connection.process.stdout.removeListener('data', onData);
                resolve(response);
                return;
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          connection.process.stdout.removeListener('data', onData);
          reject(error);
        }
      };

      connection.process.stdout.on('data', onData);
      connection.process.stdin.write(JSON.stringify(request) + '\n');
    }
  });
}

// API Endpoints

// Connect to a new MCP server
app.post('/api/connect', async (req, res) => {
  try {
    const { type, url, command, args, headers, env } = req.body;

    let connection;
    if (type === 'sse') {
      connection = await connectSSE(url, headers || {});
    } else {
      connection = await connectStdio(command, args || [], env || {});
    }

    const id = generateId();
    connections.set(id, connection);

    res.json({ success: true, connectionId: id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect from MCP server
app.post('/api/disconnect', (req, res) => {
  const { connectionId } = req.body;
  const connection = connections.get(connectionId);

  if (connection && connection.type === 'stdio' && connection.process) {
    connection.process.kill();
  }

  connections.delete(connectionId);
  res.json({ success: true });
});

// List tools from MCP server
app.post('/api/tools/list', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'tools/list');
    console.log('tools/list response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('tools/list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List resources from MCP server
app.post('/api/resources/list', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'resources/list');
    console.log('resources/list response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('resources/list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List prompts from MCP server
app.post('/api/prompts/list', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'prompts/list');
    console.log('prompts/list response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('prompts/list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get server info
app.post('/api/server/info', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-tester', version: '1.0.0' }
    });
    console.log('server/info response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('server/info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Call a tool
app.post('/api/tools/call', async (req, res) => {
  try {
    const { connectionId, toolName, arguments: toolArgs } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'tools/call', {
      name: toolName,
      arguments: toolArgs || {}
    });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read a resource
app.post('/api/resources/read', async (req, res) => {
  try {
    const { connectionId, uri } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'resources/read', { uri });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test connectivity
app.post('/api/ping', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const connection = connections.get(connectionId);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await sendMcpRequest(connection, 'ping');
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`MCP Server Tester running at http://localhost:${PORT}`);
});
