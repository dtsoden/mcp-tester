const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// Store connected servers
const connectedServers = new Map();

// Configuration persistence
const CONFIG_STORAGE_KEY = 'mcp_server_configs';

function saveServerConfig(config) {
    const configs = loadServerConfigs();
    // Check if config with same name exists
    const existingIndex = configs.findIndex(c => c.name === config.name);
    if (existingIndex >= 0) {
        configs[existingIndex] = config;
    } else {
        configs.push(config);
    }
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
}

function loadServerConfigs() {
    try {
        const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Failed to load configs:', e);
        return [];
    }
}

function deleteServerConfig(name) {
    const configs = loadServerConfigs();
    const filtered = configs.filter(c => c.name !== name);
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(filtered));
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadSavedConfigs();
});

function setupEventListeners() {
    // Connection type radio buttons
    document.querySelectorAll('input[name="connectionType"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionTypeChange);
    });

    // Connect button
    document.getElementById('connectBtn').addEventListener('click', handleConnect);

    // SSE Auth type dropdown
    document.getElementById('sseAuthType').addEventListener('change', handleSseAuthTypeChange);

    // Stdio command dropdown
    document.getElementById('stdioCommand').addEventListener('change', handleStdioCommandChange);

    // Stdio package dropdown
    document.getElementById('stdioPackage').addEventListener('change', handleStdioPackageChange);

    // Stdio transport dropdown
    document.getElementById('stdioTransport').addEventListener('change', handleStdioTransportChange);

    // Stdio auth type dropdown
    document.getElementById('stdioAuthType').addEventListener('change', handleStdioAuthTypeChange);
}

function handleStdioCommandChange(e) {
    const customField = document.getElementById('stdioCommandCustom');
    if (e.target.value === 'custom') {
        customField.style.display = 'block';
    } else {
        customField.style.display = 'none';
    }
}

function handleStdioPackageChange(e) {
    const customField = document.getElementById('stdioPackageCustom');
    if (e.target.value === 'custom') {
        customField.style.display = 'block';
    } else {
        customField.style.display = 'none';
    }
}

function handleStdioTransportChange(e) {
    const httpFields = document.getElementById('stdioHttpFields');
    if (e.target.value === 'streamableHttp') {
        httpFields.style.display = 'block';
    } else {
        httpFields.style.display = 'none';
    }
}

function handleStdioAuthTypeChange(e) {
    const bearerField = document.getElementById('stdioBearerField');
    const apiKeyField = document.getElementById('stdioApiKeyField');

    bearerField.style.display = 'none';
    apiKeyField.style.display = 'none';

    if (e.target.value === 'bearer') {
        bearerField.style.display = 'block';
    } else if (e.target.value === 'apikey') {
        apiKeyField.style.display = 'block';
    }
}

function handleConnectionTypeChange(e) {
    const type = e.target.value;
    const sseForm = document.getElementById('sseForm');
    const stdioForm = document.getElementById('stdioForm');

    if (type === 'sse') {
        sseForm.style.display = 'block';
        stdioForm.style.display = 'none';
    } else {
        sseForm.style.display = 'none';
        stdioForm.style.display = 'block';
    }
}

function handleSseAuthTypeChange(e) {
    const authType = e.target.value;
    const bearerAuth = document.getElementById('sseBearerAuth');
    const customAuth = document.getElementById('sseCustomAuth');

    bearerAuth.style.display = 'none';
    customAuth.style.display = 'none';

    if (authType === 'bearer') {
        bearerAuth.style.display = 'block';
    } else if (authType === 'custom') {
        customAuth.style.display = 'block';
    }
}

async function handleConnect() {
    const type = document.querySelector('input[name="connectionType"]:checked').value;
    const statusEl = document.getElementById('connectionStatus');
    const connectBtn = document.getElementById('connectBtn');

    // Clear previous status
    statusEl.className = 'status-message';
    statusEl.textContent = '';

    // Get form data
    let serverData;
    if (type === 'sse') {
        const name = document.getElementById('serverName').value.trim();
        const url = document.getElementById('sseUrl').value.trim();

        if (!name || !url) {
            showStatus('error', 'Please fill in all fields');
            return;
        }

        serverData = { type: 'sse', name, url };

        // Collect authentication data
        const authType = document.getElementById('sseAuthType').value;
        serverData.authType = authType; // Save auth type for reloading

        if (authType === 'bearer') {
            const token = document.getElementById('sseBearerToken').value.trim();
            if (token) {
                serverData.headers = {
                    'Authorization': `Bearer ${token}`
                };
                serverData.bearerToken = token; // Save raw token for reloading
            }
        } else if (authType === 'custom') {
            const headersStr = document.getElementById('sseHeaders').value.trim();
            if (headersStr) {
                try {
                    serverData.headers = JSON.parse(headersStr);
                } catch (e) {
                    showStatus('error', 'Invalid JSON in custom headers');
                    return;
                }
            }
        }
    } else {
        const name = document.getElementById('stdioName').value.trim();
        let command = document.getElementById('stdioCommand').value;

        if (command === 'custom') {
            command = document.getElementById('stdioCommandCustom').value.trim();
            if (!command) {
                showStatus('error', 'Please enter custom command');
                return;
            }
        }

        let packageStr = document.getElementById('stdioPackage').value.trim();

        if (packageStr === 'custom') {
            packageStr = document.getElementById('stdioPackageCustom').value.trim();
            if (!packageStr) {
                showStatus('error', 'Please enter custom package/script');
                return;
            }
        }

        const transport = document.getElementById('stdioTransport').value;
        const endpoint = document.getElementById('stdioEndpoint').value.trim();
        const authType = document.getElementById('stdioAuthType').value;

        if (!name) {
            showStatus('error', 'Please enter server name');
            return;
        }

        // Build args array based on structured inputs
        const args = [];

        // Add package/script args
        if (packageStr) {
            // Split package string properly (handles "-y package" or just "package")
            const packageParts = packageStr.split(/\s+/).filter(s => s.length > 0);
            args.push(...packageParts);
        }

        // Add transport-specific args
        if (transport === 'streamableHttp') {
            if (!endpoint) {
                showStatus('error', 'Please enter HTTP endpoint');
                return;
            }

            args.push('--streamableHttp', endpoint);

            // Add authentication header if specified
            if (authType === 'bearer') {
                const token = document.getElementById('stdioBearer').value.trim();
                if (token) {
                    // CRITICAL: Build as single argument with NO SPACE after Bearer
                    args.push('--header', `authorization:Bearer ${token}`);
                }
            } else if (authType === 'apikey') {
                const keyName = document.getElementById('stdioApiKeyName').value.trim();
                const keyValue = document.getElementById('stdioApiKeyValue').value.trim();
                if (keyName && keyValue) {
                    args.push('--header', `${keyName}:${keyValue}`);
                }
            }
        }

        // Add extra args if specified
        const extraArgsStr = document.getElementById('stdioExtraArgs').value.trim();
        if (extraArgsStr) {
            const extraArgs = extraArgsStr.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            args.push(...extraArgs);
        }

        serverData = {
            type: 'stdio',
            name,
            command,
            args,
            // Save all form field values for reloading
            packageStr,
            transport,
            endpoint,
            authType
        };

        // Save bearer token if present
        if (authType === 'bearer') {
            const token = document.getElementById('stdioBearer').value.trim();
            if (token) {
                serverData.bearerToken = token;
            }
        } else if (authType === 'apikey') {
            serverData.apiKeyName = document.getElementById('stdioApiKeyName').value.trim();
            serverData.apiKeyValue = document.getElementById('stdioApiKeyValue').value.trim();
        }

        // Save extra args (already retrieved above)
        if (extraArgsStr) {
            serverData.extraArgs = extraArgsStr;
        }

        // Collect environment variables
        const envStr = document.getElementById('stdioEnv').value.trim();
        if (envStr) {
            try {
                serverData.env = JSON.parse(envStr);
            } catch (e) {
                showStatus('error', 'Invalid JSON in environment variables');
                return;
            }
        }
    }

    // Disable button during connection
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';

    try {
        const response = await fetch(`${API_BASE}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serverData)
        });

        const result = await response.json();

        if (result.success) {
            const server = {
                id: result.connectionId,
                name: serverData.name,
                type: serverData.type,
                config: serverData
            };

            connectedServers.set(result.connectionId, server);
            addServerCard(server);

            // Save configuration to localStorage
            saveServerConfig(serverData);

            clearForm(type);
            showStatus('success', `Successfully connected to ${serverData.name}`);
        } else {
            showStatus('error', result.error || 'Connection failed');
        }
    } catch (error) {
        showStatus('error', `Connection error: ${error.message}`);
    } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to Server';
    }
}

function showStatus(type, message) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.className = `status-message ${type}`;
    statusEl.textContent = message;
}

function clearForm(type) {
    if (type === 'sse') {
        document.getElementById('serverName').value = '';
        document.getElementById('sseUrl').value = '';
        document.getElementById('sseAuthType').value = 'none';
        document.getElementById('sseBearerToken').value = '';
        document.getElementById('sseHeaders').value = '';
    } else {
        document.getElementById('stdioName').value = '';
        document.getElementById('stdioCommand').value = 'npx';
        document.getElementById('stdioPackage').value = '';
        document.getElementById('stdioPackageCustom').value = '';
        document.getElementById('stdioTransport').value = 'streamableHttp';
        document.getElementById('stdioEndpoint').value = '';
        document.getElementById('stdioAuthType').value = 'none';
        document.getElementById('stdioBearer').value = '';
        document.getElementById('stdioExtraArgs').value = '';
        document.getElementById('stdioEnv').value = '';
    }
}

function addServerCard(server) {
    const serversList = document.getElementById('serversList');

    // Remove empty state
    const emptyState = serversList.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const card = document.createElement('div');
    card.className = 'server-card';
    card.id = `server-${server.id}`;

    card.innerHTML = `
        <div class="server-header">
            <div class="server-info">
                <h3>${escapeHtml(server.name)}</h3>
                <div class="server-meta">
                    <div class="status-indicator">
                        <span class="status-dot"></span>
                        <span>Connected</span>
                    </div>
                    <span>•</span>
                    <span>${server.type.toUpperCase()}</span>
                </div>
            </div>
            <div class="server-actions">
                <button class="btn btn-secondary btn-sm" onclick="testConnectivity('${server.id}')">Test</button>
                <button class="btn btn-secondary btn-sm" onclick="disconnectServer('${server.id}')">Disconnect</button>
            </div>
        </div>

        <div class="tabs">
            <button class="tab active" data-tab="tools" onclick="switchTab('${server.id}', 'tools')">Tools</button>
            <button class="tab" data-tab="resources" onclick="switchTab('${server.id}', 'resources')">Resources</button>
            <button class="tab" data-tab="prompts" onclick="switchTab('${server.id}', 'prompts')">Prompts</button>
            <button class="tab" data-tab="info" onclick="switchTab('${server.id}', 'info')">Server Info</button>
        </div>

        <div class="tab-content active" id="tools-${server.id}">
            <div class="test-section">
                <div class="test-header">
                    <h4>Available Tools</h4>
                    <button class="btn btn-secondary btn-sm" onclick="loadTools('${server.id}')">Refresh</button>
                </div>
                <div class="list-container" id="tools-list-${server.id}">
                    <div class="loading">Loading tools...</div>
                </div>
            </div>
        </div>

        <div class="tab-content" id="resources-${server.id}">
            <div class="test-section">
                <div class="test-header">
                    <h4>Available Resources</h4>
                    <button class="btn btn-secondary btn-sm" onclick="loadResources('${server.id}')">Refresh</button>
                </div>
                <div class="list-container" id="resources-list-${server.id}">
                    <div class="loading">Loading resources...</div>
                </div>
            </div>
        </div>

        <div class="tab-content" id="prompts-${server.id}">
            <div class="test-section">
                <div class="test-header">
                    <h4>Available Prompts</h4>
                    <button class="btn btn-secondary btn-sm" onclick="loadPrompts('${server.id}')">Refresh</button>
                </div>
                <div class="list-container" id="prompts-list-${server.id}">
                    <div class="loading">Loading prompts...</div>
                </div>
            </div>
        </div>

        <div class="tab-content" id="info-${server.id}">
            <div class="test-section">
                <div class="test-header">
                    <h4>Server Information</h4>
                    <button class="btn btn-secondary btn-sm" onclick="loadServerInfo('${server.id}')">Refresh</button>
                </div>
                <div class="list-container" id="info-list-${server.id}">
                    <div class="loading">Loading server info...</div>
                </div>
            </div>
        </div>
    `;

    serversList.appendChild(card);

    // Auto-load tools
    loadTools(server.id);
}

function switchTab(serverId, tabName) {
    const card = document.getElementById(`server-${serverId}`);

    // Update tab buttons
    card.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab content
    card.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-${serverId}`).classList.add('active');

    // Load data if not already loaded
    const listContainer = document.getElementById(`${tabName}-list-${serverId}`);
    if (listContainer.querySelector('.loading')) {
        if (tabName === 'tools') loadTools(serverId);
        else if (tabName === 'resources') loadResources(serverId);
        else if (tabName === 'prompts') loadPrompts(serverId);
        else if (tabName === 'info') loadServerInfo(serverId);
    }
}

async function loadTools(serverId) {
    const container = document.getElementById(`tools-list-${serverId}`);
    container.innerHTML = '<div class="loading">Loading tools...</div>';

    try {
        const response = await fetch(`${API_BASE}/tools/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: serverId })
        });

        const data = await response.json();
        console.log('Tools response:', data);

        if (data.error) {
            // Check if it's a "Method not found" error (server doesn't support this feature)
            if (data.error.code === -32601) {
                container.innerHTML = '<div class="empty-state"><p>Tools not supported by this server</p></div>';
            } else {
                container.innerHTML = `<div class="error-message">${escapeHtml(formatError(data.error))}</div>`;
            }
            return;
        }

        const tools = data.result?.tools || [];

        if (tools.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No tools available</p></div>';
            return;
        }

        container.innerHTML = tools.map((tool, index) => {
            const properties = tool.inputSchema?.properties || {};
            const required = tool.inputSchema?.required || [];
            const paramList = Object.entries(properties).map(([name, schema]) => {
                const isRequired = required.includes(name);
                const type = schema.type || 'any';
                const desc = schema.description || '';
                return `<li><strong>${escapeHtml(name)}</strong>${isRequired ? ' <em>(required)</em>' : ''} - ${escapeHtml(String(type))}${desc ? ': ' + escapeHtml(desc) : ''}</li>`;
            }).join('');

            // Store tool data in a global map
            if (!window.toolsData) window.toolsData = {};
            const toolId = `${serverId}-${tool.name}`;
            window.toolsData[toolId] = tool;

            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${escapeHtml(String(tool.name))}</div>
                        <button class="btn btn-primary btn-sm" onclick="showToolTest('${serverId}', '${tool.name}')">Explore</button>
                    </div>
                    ${tool.description ? `<div class="list-item-description">${escapeHtml(String(tool.description))}</div>` : ''}
                    ${paramList ? `<div class="list-item-meta"><strong>Parameters:</strong><ul style="margin: 0.5rem 0 0 1rem; padding: 0;">${paramList}</ul></div>` : '<div class="list-item-meta">No parameters</div>'}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('loadTools error:', error);
        container.innerHTML = `<div class="error-message">Failed to load tools: ${escapeHtml(error.message)}</div>`;
    }
}

async function loadResources(serverId) {
    const container = document.getElementById(`resources-list-${serverId}`);
    container.innerHTML = '<div class="loading">Loading resources...</div>';

    try {
        const response = await fetch(`${API_BASE}/resources/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: serverId })
        });

        const data = await response.json();
        console.log('Resources response:', data);

        if (data.error) {
            // Check if it's a "Method not found" error (server doesn't support this feature)
            if (data.error.code === -32601) {
                container.innerHTML = '<div class="empty-state"><p>Resources not supported by this server</p></div>';
            } else {
                container.innerHTML = `<div class="error-message">${escapeHtml(formatError(data.error))}</div>`;
            }
            return;
        }

        const resources = data.result?.resources || [];

        if (resources.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No resources available</p></div>';
            return;
        }

        container.innerHTML = resources.map(resource => {
            const name = String(resource.name || resource.uri || 'Unknown');
            const uri = String(resource.uri || '');
            const description = resource.description ? String(resource.description) : '';

            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${escapeHtml(name)}</div>
                        <button class="btn btn-secondary btn-sm" onclick="readResource('${serverId}', ${JSON.stringify(uri)})">Read</button>
                    </div>
                    ${description ? `<div class="list-item-description">${escapeHtml(description)}</div>` : ''}
                    <div class="list-item-meta">${escapeHtml(uri)}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('loadResources error:', error);
        container.innerHTML = `<div class="error-message">Failed to load resources: ${escapeHtml(error.message)}</div>`;
    }
}

async function loadPrompts(serverId) {
    const container = document.getElementById(`prompts-list-${serverId}`);
    container.innerHTML = '<div class="loading">Loading prompts...</div>';

    try {
        const response = await fetch(`${API_BASE}/prompts/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: serverId })
        });

        const data = await response.json();
        console.log('Prompts response:', data);

        if (data.error) {
            // Check if it's a "Method not found" error (server doesn't support this feature)
            if (data.error.code === -32601) {
                container.innerHTML = '<div class="empty-state"><p>Prompts not supported by this server</p></div>';
            } else {
                container.innerHTML = `<div class="error-message">${escapeHtml(formatError(data.error))}</div>`;
            }
            return;
        }

        const prompts = data.result?.prompts || [];

        if (prompts.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No prompts available</p></div>';
            return;
        }

        container.innerHTML = prompts.map(prompt => {
            const name = String(prompt.name || 'Unknown');
            const description = prompt.description ? String(prompt.description) : '';

            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${escapeHtml(name)}</div>
                    </div>
                    ${description ? `<div class="list-item-description">${escapeHtml(description)}</div>` : ''}
                    ${prompt.arguments?.length ? `<div class="list-item-meta">${prompt.arguments.length} arguments</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('loadPrompts error:', error);
        container.innerHTML = `<div class="error-message">Failed to load prompts: ${escapeHtml(error.message)}</div>`;
    }
}

async function loadServerInfo(serverId) {
    const container = document.getElementById(`info-list-${serverId}`);
    container.innerHTML = '<div class="loading">Loading server info...</div>';

    try {
        const response = await fetch(`${API_BASE}/server/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: serverId })
        });

        const data = await response.json();
        console.log('Server Info response:', data);

        if (data.error) {
            container.innerHTML = `<div class="error-message">${escapeHtml(formatError(data.error))}</div>`;
            return;
        }

        const info = data.result || {};
        const capabilities = info.capabilities || {};
        const serverInfo = info.serverInfo || {};

        container.innerHTML = `
            <div class="list-item">
                <div class="list-item-title">Server Information</div>
                <div class="test-result">
                    <pre>${JSON.stringify({ serverInfo, capabilities }, null, 2)}</pre>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('loadServerInfo error:', error);
        container.innerHTML = `<div class="error-message">Failed to load server info: ${escapeHtml(error.message)}</div>`;
    }
}

async function testConnectivity(serverId) {
    const server = connectedServers.get(serverId);
    if (!server) return;

    const card = document.getElementById(`server-${serverId}`);
    const statusEl = card.querySelector('.status-indicator span:last-child');
    const originalText = statusEl.textContent;

    statusEl.textContent = 'Testing...';

    try {
        const response = await fetch(`${API_BASE}/ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: serverId })
        });

        const data = await response.json();

        if (data.success) {
            statusEl.textContent = 'Connected ✓';
            setTimeout(() => {
                statusEl.textContent = originalText;
            }, 2000);
        } else {
            statusEl.textContent = 'Failed ✗';
        }
    } catch (error) {
        statusEl.textContent = 'Error ✗';
    }
}

async function disconnectServer(serverId) {
    try {
        await fetch(`${API_BASE}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: serverId })
        });

        const card = document.getElementById(`server-${serverId}`);
        if (card) {
            card.remove();
        }

        connectedServers.delete(serverId);

        // Show empty state if no servers
        const serversList = document.getElementById('serversList');
        if (serversList.children.length === 0) {
            serversList.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                        <line x1="6" y1="6" x2="6.01" y2="6"></line>
                        <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                    <p>No servers connected yet</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

function showToolTest(serverId, toolName) {
    const toolId = `${serverId}-${toolName}`;
    const toolData = window.toolsData?.[toolId];

    if (!toolData) {
        console.error('Tool not found:', toolId);
        return;
    }

    // Build form fields for each parameter
    const properties = toolData.inputSchema?.properties || {};
    const required = toolData.inputSchema?.required || [];

    let formFields = '';
    for (const [name, schema] of Object.entries(properties)) {
        const isRequired = required.includes(name);
        const type = schema.type || 'string';
        const desc = schema.description || '';
        const placeholder = desc || `Enter ${name}`;

        formFields += `
            <div class="form-group" style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">${escapeHtml(name)}${isRequired ? ' <em style="color: #dc3545;">(required)</em>' : ''}</label>
                <input type="text" id="tool-param-${serverId}-${toolData.name}-${name}"
                       placeholder="${escapeHtml(placeholder)}"
                       style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.875rem;">
                <small style="color: #666; display: block; margin-top: 0.25rem;">${escapeHtml(String(type))}${desc ? ': ' + escapeHtml(desc) : ''}</small>
            </div>
        `;
    }

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem;';
    modal.id = `modal-${serverId}-${toolData.name}`;

    const content = document.createElement('div');
    content.style.cssText = 'background: white; padding: 2rem; border-radius: 8px; max-width: 600px; width: 100%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';

    content.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0;">${escapeHtml(toolData.name)}</h3>
            <button onclick="this.closest('[id^=modal-]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
        </div>
        ${toolData.description ? `<p style="color: #666; margin-bottom: 1.5rem;">${escapeHtml(toolData.description)}</p>` : ''}
        <form id="test-form-${serverId}-${toolData.name}" onsubmit="event.preventDefault(); executeTool('${serverId}', '${escapeHtml(toolData.name)}')">
            ${formFields || '<p style="color: #666;">No parameters required</p>'}
            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
                <button type="submit" class="btn btn-primary">Execute</button>
                <button type="button" class="btn btn-secondary" onclick="this.closest('[id^=modal-]').remove()">Cancel</button>
            </div>
        </form>
        <div id="tool-result-${serverId}-${toolData.name}" style="margin-top: 1.5rem;"></div>
    `;

    modal.appendChild(content);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

async function executeTool(serverId, toolName) {
    const resultDiv = document.getElementById(`tool-result-${serverId}-${toolName}`);
    const testForm = document.getElementById(`test-form-${serverId}-${toolName}`);

    resultDiv.innerHTML = '<div class="loading">Executing...</div>';

    try {
        // Gather parameter values from input fields
        const args = {};
        const inputs = testForm.querySelectorAll('[id^="tool-param-"]');
        inputs.forEach(input => {
            const paramName = input.id.split('-').pop();
            const value = input.value.trim();
            if (value) {
                // Try to parse as number if it looks like a number
                if (!isNaN(value) && value !== '') {
                    args[paramName] = Number(value);
                } else {
                    args[paramName] = value;
                }
            }
        });

        const response = await fetch(`${API_BASE}/tools/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                connectionId: serverId,
                toolName: toolName,
                arguments: args
            })
        });

        const data = await response.json();
        console.log('Tool execution result:', data);

        // Format the result nicely
        let resultHtml = '';
        if (data.error) {
            resultHtml = `<div class="error-message">${escapeHtml(formatError(data.error))}</div>`;
        } else if (data.result) {
            // Check if this is a workflow search result
            if (toolName === 'search_workflows' && data.result.content) {
                const content = data.result.content;
                if (Array.isArray(content) && content[0]?.type === 'text') {
                    try {
                        const parsed = JSON.parse(content[0].text);
                        if (parsed.data && Array.isArray(parsed.data)) {
                            resultHtml = `
                                <div style="background: white; padding: 1rem; margin-top: 1rem; border-radius: 4px; border: 1px solid #dee2e6;">
                                    <h6 style="margin-bottom: 1rem;">Found ${parsed.count} workflow(s)</h6>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <thead>
                                            <tr style="border-bottom: 2px solid #dee2e6;">
                                                <th style="text-align: left; padding: 0.5rem;">Name</th>
                                                <th style="text-align: left; padding: 0.5rem;">Description</th>
                                                <th style="text-align: center; padding: 0.5rem;">Active</th>
                                                <th style="text-align: left; padding: 0.5rem;">ID</th>
                                                <th style="text-align: center; padding: 0.5rem;">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${parsed.data.map(wf => `
                                                <tr style="border-bottom: 1px solid #eee;">
                                                    <td style="padding: 0.75rem;"><strong>${escapeHtml(wf.name || 'Unnamed')}</strong></td>
                                                    <td style="padding: 0.75rem;"><small>${escapeHtml(wf.description || 'No description')}</small></td>
                                                    <td style="padding: 0.75rem; text-align: center;">${wf.active ? '✓' : '✗'}</td>
                                                    <td style="padding: 0.75rem;"><code style="font-size: 0.85em;">${escapeHtml(wf.id)}</code></td>
                                                    <td style="padding: 0.75rem; text-align: center;">
                                                        <button class="btn btn-primary btn-sm" onclick="window.getWorkflowDetails('${serverId}', '${wf.id}')">Details</button>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `;
                        } else {
                            resultHtml = `<div class="test-result"><pre>${escapeHtml(content[0].text)}</pre></div>`;
                        }
                    } catch (e) {
                        resultHtml = `<div class="test-result"><pre>${escapeHtml(content[0].text)}</pre></div>`;
                    }
                } else {
                    resultHtml = `<div class="test-result"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
                }
            } else {
                resultHtml = `<div class="test-result"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
            }
        } else {
            resultHtml = `<div class="test-result"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
        }

        resultDiv.innerHTML = resultHtml;
    } catch (error) {
        console.error('executeTool error:', error);
        resultDiv.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
    }
}

async function getWorkflowDetails(serverId, workflowId) {
    try {
        const response = await fetch(`${API_BASE}/tools/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                connectionId: serverId,
                toolName: 'get_workflow_details',
                arguments: { workflowId }
            })
        });

        const data = await response.json();
        console.log('Workflow details:', data);

        // Show results in a modal-style overlay
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';

        const content = document.createElement('div');
        content.style.cssText = 'background: white; padding: 2rem; border-radius: 8px; max-width: 800px; max-height: 80vh; overflow: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';

        if (data.error) {
            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0;">Error</h3>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                </div>
                <p>${escapeHtml(formatError(data.error))}</p>
            `;
        } else if (data.result?.content?.[0]?.text) {
            try {
                const details = JSON.parse(data.result.content[0].text);
                content.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3 style="margin: 0;">${escapeHtml(details.workflow?.name || 'Workflow Details')}</h3>
                        <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                    </div>
                    <p><strong>ID:</strong> <code>${escapeHtml(workflowId)}</code></p>
                    <p><strong>Active:</strong> ${details.workflow?.active ? 'Yes ✓' : 'No ✗'}</p>
                    <p><strong>Trigger Count:</strong> ${details.workflow?.triggerCount || 0}</p>
                    <hr>
                    <h4>How to Trigger:</h4>
                    <p>${escapeHtml(details.triggerInfo || 'No trigger info available')}</p>
                    <hr>
                    <h4>Full Details:</h4>
                    <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto; max-height: 300px;">${JSON.stringify(details, null, 2)}</pre>
                `;
            } catch (e) {
                content.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3 style="margin: 0;">Workflow Details</h3>
                        <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                    </div>
                    <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>
                `;
            }
        } else {
            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0;">Workflow Details</h3>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                </div>
                <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>
            `;
        }

        modal.appendChild(content);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    } catch (error) {
        console.error('getWorkflowDetails error:', error);
        alert('Error getting workflow details: ' + error.message);
    }
}

// Make functions globally accessible
window.getWorkflowDetails = getWorkflowDetails;
window.executeTool = executeTool;
window.showToolTest = showToolTest;

async function readResource(serverId, uri) {
    const container = document.getElementById(`resources-list-${serverId}`);

    // Check if result already exists
    let resultDiv = container.querySelector(`#resource-result-${serverId}`);
    if (resultDiv) {
        resultDiv.remove();
    }

    resultDiv = document.createElement('div');
    resultDiv.id = `resource-result-${serverId}`;
    resultDiv.innerHTML = '<div class="loading">Reading resource...</div>';
    container.insertBefore(resultDiv, container.firstChild);

    try {
        const response = await fetch(`${API_BASE}/resources/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                connectionId: serverId,
                uri: uri
            })
        });

        const data = await response.json();

        resultDiv.innerHTML = `
            <div class="test-result">
                <h5 style="margin-bottom: 0.75rem; font-size: 0.938rem;">Resource: ${escapeHtml(uri)}</h5>
                <pre>${JSON.stringify(data, null, 2)}</pre>
            </div>
        `;
    } catch (error) {
        resultDiv.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
    }
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatError(error) {
    if (typeof error === 'string') {
        return error;
    }
    if (typeof error === 'object' && error !== null) {
        // JSON-RPC error object
        if (error.message) {
            return `${error.message}${error.code ? ` (Code: ${error.code})` : ''}`;
        }
        return JSON.stringify(error);
    }
    return String(error);
}

function loadSavedConfigs() {
    const configs = loadServerConfigs();
    if (configs.length === 0) return;

    // Find the connect button container
    const addServerSection = document.querySelector('.add-server-section');
    const connectBtn = document.getElementById('connectBtn');

    if (!connectBtn) return;

    // Create saved configs section that goes BEFORE the connect button
    const savedConfigsHtml = `
        <div class="form-group" id="savedConfigsSection" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #dee2e6;">
            <label>Or select a saved configuration:</label>
            <div class="saved-configs-radio" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <label class="radio-label" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 4px; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="radio" name="savedConfig" value="" checked>
                        <span style="font-weight: 500;">New Configuration</span>
                    </div>
                </label>
                ${configs.map(config => `
                    <label class="radio-label" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 4px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                            <input type="radio" name="savedConfig" value="${escapeHtml(config.name)}" onchange="loadConfig('${escapeHtml(config.name)}')">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 500;">${escapeHtml(config.name)}</span>
                                <small style="color: #666;">${config.type.toUpperCase()} - ${config.type === 'sse' ? escapeHtml(config.url || '') : (config.endpoint ? escapeHtml(config.endpoint) : escapeHtml(config.command || ''))}</small>
                            </div>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); deleteConfig('${escapeHtml(config.name)}')" style="margin-left: 1rem;">Delete</button>
                    </label>
                `).join('')}
            </div>
        </div>
        <div style="margin-top: 1.5rem;"></div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = savedConfigsHtml;

    // Insert before the connect button
    connectBtn.parentElement.insertBefore(tempDiv.firstChild, connectBtn);
    connectBtn.parentElement.insertBefore(tempDiv.firstChild, connectBtn); // Insert spacing div too
}

window.loadConfig = function(name) {
    const configs = loadServerConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) return;

    if (config.type === 'sse') {
        document.querySelector('input[name="connectionType"][value="sse"]').checked = true;
        handleConnectionTypeChange({ target: { value: 'sse' } });

        document.getElementById('serverName').value = config.name;
        document.getElementById('sseUrl').value = config.url || '';

        // Restore auth type
        if (config.authType) {
            document.getElementById('sseAuthType').value = config.authType;
            handleSseAuthTypeChange({ target: { value: config.authType } });

            if (config.authType === 'bearer' && config.bearerToken) {
                document.getElementById('sseBearerToken').value = config.bearerToken;
            } else if (config.authType === 'custom' && config.headers) {
                document.getElementById('sseHeaders').value = JSON.stringify(config.headers, null, 2);
            }
        }
    } else {
        document.querySelector('input[name="connectionType"][value="stdio"]').checked = true;
        handleConnectionTypeChange({ target: { value: 'stdio' } });

        document.getElementById('stdioName').value = config.name;
        document.getElementById('stdioCommand').value = config.command || 'npx';

        // Restore package/script
        if (config.packageStr) {
            // Check if it's a known package
            const packageSelect = document.getElementById('stdioPackage');
            const matchingOption = Array.from(packageSelect.options).find(opt => opt.value === config.packageStr);

            if (matchingOption) {
                packageSelect.value = config.packageStr;
            } else {
                // Custom package
                packageSelect.value = 'custom';
                handleStdioPackageChange({ target: { value: 'custom' } });
                document.getElementById('stdioPackageCustom').value = config.packageStr;
            }
        }

        // Restore transport type
        if (config.transport) {
            document.getElementById('stdioTransport').value = config.transport;
            handleStdioTransportChange({ target: { value: config.transport } });
        }

        // Restore endpoint
        if (config.endpoint) {
            document.getElementById('stdioEndpoint').value = config.endpoint;
        }

        // Restore auth type and credentials
        if (config.authType) {
            document.getElementById('stdioAuthType').value = config.authType;
            handleStdioAuthTypeChange({ target: { value: config.authType } });

            if (config.authType === 'bearer' && config.bearerToken) {
                document.getElementById('stdioBearer').value = config.bearerToken;
            } else if (config.authType === 'apikey') {
                if (config.apiKeyName) document.getElementById('stdioApiKeyName').value = config.apiKeyName;
                if (config.apiKeyValue) document.getElementById('stdioApiKeyValue').value = config.apiKeyValue;
            }
        }

        // Restore extra args
        if (config.extraArgs) {
            document.getElementById('stdioExtraArgs').value = config.extraArgs;
        }

        // Restore environment variables
        if (config.env) {
            document.getElementById('stdioEnv').value = JSON.stringify(config.env, null, 2);
        }
    }
};

window.deleteConfig = function(name) {
    if (confirm(`Delete saved configuration "${name}"?`)) {
        deleteServerConfig(name);
        location.reload();
    }
};
