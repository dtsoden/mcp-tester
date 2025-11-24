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

        if (data.error) {
            container.innerHTML = `<div class="error-message">${escapeHtml(data.error)}</div>`;
            return;
        }

        const tools = data.result?.tools || [];

        if (tools.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No tools available</p></div>';
            return;
        }

        container.innerHTML = tools.map(tool => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${escapeHtml(tool.name)}</div>
                    <button class="btn btn-secondary btn-sm" onclick="showToolTest('${serverId}', ${escapeHtml(JSON.stringify(tool))})">Test</button>
                </div>
                ${tool.description ? `<div class="list-item-description">${escapeHtml(tool.description)}</div>` : ''}
                <div class="list-item-meta">
                    ${Object.keys(tool.inputSchema?.properties || {}).length} parameters
                </div>
            </div>
        `).join('');
    } catch (error) {
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

        if (data.error) {
            container.innerHTML = `<div class="error-message">${escapeHtml(data.error)}</div>`;
            return;
        }

        const resources = data.result?.resources || [];

        if (resources.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No resources available</p></div>';
            return;
        }

        container.innerHTML = resources.map(resource => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${escapeHtml(resource.name || resource.uri)}</div>
                    <button class="btn btn-secondary btn-sm" onclick="readResource('${serverId}', '${escapeHtml(resource.uri)}')">Read</button>
                </div>
                ${resource.description ? `<div class="list-item-description">${escapeHtml(resource.description)}</div>` : ''}
                <div class="list-item-meta">${escapeHtml(resource.uri)}</div>
            </div>
        `).join('');
    } catch (error) {
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

        if (data.error) {
            container.innerHTML = `<div class="error-message">${escapeHtml(data.error)}</div>`;
            return;
        }

        const prompts = data.result?.prompts || [];

        if (prompts.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No prompts available</p></div>';
            return;
        }

        container.innerHTML = prompts.map(prompt => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${escapeHtml(prompt.name)}</div>
                </div>
                ${prompt.description ? `<div class="list-item-description">${escapeHtml(prompt.description)}</div>` : ''}
                ${prompt.arguments?.length ? `<div class="list-item-meta">${prompt.arguments.length} arguments</div>` : ''}
            </div>
        `).join('');
    } catch (error) {
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

        if (data.error) {
            container.innerHTML = `<div class="error-message">${escapeHtml(data.error)}</div>`;
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

function showToolTest(serverId, tool) {
    const toolData = typeof tool === 'string' ? JSON.parse(tool) : tool;
    const container = document.getElementById(`tools-list-${serverId}`);

    // Check if test form already exists
    let testForm = container.querySelector(`#test-form-${serverId}-${toolData.name}`);
    if (testForm) {
        testForm.remove();
        return;
    }

    // Create test form
    const formHtml = `
        <div class="tool-test-form" id="test-form-${serverId}-${toolData.name}">
            <h5 style="margin-bottom: 0.75rem; font-size: 0.938rem;">Test: ${escapeHtml(toolData.name)}</h5>
            <div class="form-group">
                <label>Arguments (JSON)</label>
                <textarea id="tool-args-${serverId}-${toolData.name}" placeholder='{"param": "value"}'>${JSON.stringify(toolData.inputSchema?.properties || {}, null, 2)}</textarea>
            </div>
            <button class="btn btn-primary btn-sm" onclick="executeTool('${serverId}', '${escapeHtml(toolData.name)}')">Execute</button>
            <div id="tool-result-${serverId}-${toolData.name}"></div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formHtml;
    container.insertBefore(tempDiv.firstElementChild, container.firstChild);
}

async function executeTool(serverId, toolName) {
    const argsTextarea = document.getElementById(`tool-args-${serverId}-${toolName}`);
    const resultDiv = document.getElementById(`tool-result-${serverId}-${toolName}`);

    resultDiv.innerHTML = '<div class="loading">Executing...</div>';

    try {
        const args = JSON.parse(argsTextarea.value);

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

        resultDiv.innerHTML = `
            <div class="test-result">
                <pre>${JSON.stringify(data, null, 2)}</pre>
            </div>
        `;
    } catch (error) {
        resultDiv.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
    }
}

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

function loadSavedConfigs() {
    const configs = loadServerConfigs();
    if (configs.length === 0) return;

    // Add a "Saved Configurations" section above the add server section
    const main = document.querySelector('main');
    const addServerSection = document.querySelector('.add-server-section');

    const savedConfigsHtml = `
        <section class="card saved-configs-section">
            <h2>Saved Configurations</h2>
            <div class="saved-configs-list">
                ${configs.map(config => `
                    <div class="saved-config-item" data-name="${escapeHtml(config.name)}">
                        <div class="config-info">
                            <strong>${escapeHtml(config.name)}</strong>
                            <span class="config-meta">${config.type.toUpperCase()} - ${config.type === 'sse' ? escapeHtml(config.url || '') : (config.endpoint ? escapeHtml(config.endpoint) : escapeHtml(config.command || ''))}</span>
                        </div>
                        <div class="config-actions">
                            <button class="btn btn-secondary btn-sm" onclick="loadConfig('${escapeHtml(config.name)}')">Load</button>
                            <button class="btn btn-secondary btn-sm" onclick="deleteConfig('${escapeHtml(config.name)}')">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = savedConfigsHtml;
    main.insertBefore(tempDiv.firstElementChild, addServerSection);
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
