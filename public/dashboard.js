// @ts-check

/**
 * AlephAuto Dashboard - Real-time Pipeline Monitoring
 *
 * Features:
 * - WebSocket connection for real-time updates
 * - REST API integration for status fetching
 * - Automatic reconnection with exponential backoff
 * - Event batching to prevent UI flicker
 */

/**
 * Global type declarations for window extensions
 * @typedef {Object} DashboardGlobals
 * @property {DashboardController} [dashboardController]
 * @property {string} [SIDEQUEST_API_BASE_URL]
 */

/** @type {Window & typeof globalThis & DashboardGlobals} */
const win = window;

/**
 * JSONReportViewer - Fetchable JSON report display component
 */
class JSONReportViewer {
    constructor(reportPath, container, options = {}) {
        this.reportPath = reportPath;
        this.container = container;
        this.options = {
            expandByDefault: true,
            maxCharSize: 50000,
            ...options
        };

        this.state = {
            isExpanded: this.options.expandByDefault,
            isLoading: false,
            error: null,
            jsonData: null
        };

        this.init();
    }

    async init() {
        this.render();
        this.attachEventListeners();

        if (this.state.isExpanded) {
            await this.loadReport();
        }
    }

    render() {
        this.container.innerHTML = `
            <div class="report-viewer">
                <div class="report-viewer-header">
                    <div>
                        <span class="report-viewer-label">Report Content</span>
                        <div class="report-viewer-filepath">${this.escapeHtml(this.reportPath)}</div>
                    </div>
                    <div class="report-viewer-controls">
                        <button class="report-btn report-copy-btn" aria-label="Copy JSON to clipboard" title="Copy to clipboard">
                            📋
                        </button>
                    </div>
                </div>
                <div class="report-viewer-body">
                    <div class="report-content-placeholder"></div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const copyBtn = this.container.querySelector('.report-copy-btn');

        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleCopy();
            });
        }
    }

    async loadReport() {
        if (this.state.isLoading) return;

        this.state.isLoading = true;
        this.renderLoading();

        try {
            // Convert file path to API endpoint
            const apiPath = this.reportPath.replace(/^.*\/output\/reports\//, '/api/reports/');
            const response = await fetch(apiPath);

            if (!response.ok) {
                throw new Error(`Failed to load report: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            this.state.jsonData = JSON.parse(text);
            this.state.error = null;
            this.renderJSON(this.state.jsonData);

        } catch (error) {
            this.state.error = error;
            this.renderError();
        } finally {
            this.state.isLoading = false;
        }
    }

    renderLoading() {
        const body = this.container.querySelector('.report-viewer-body');
        body.innerHTML = `
            <div class="report-loading">
                <div class="report-loading-spinner"></div>
                <span class="report-loading-text">Loading report...</span>
            </div>
        `;
    }

    renderError() {
        const body = this.container.querySelector('.report-viewer-body');
        body.innerHTML = `
            <div class="report-error">
                <span class="report-error-icon">⚠️</span>
                <div class="report-error-content">
                    <p class="report-error-title">Unable to Load Report</p>
                    <p class="report-error-message">${this.escapeHtml(this.state.error.message)}</p>
                    <p class="report-error-filepath">Path: ${this.escapeHtml(this.reportPath)}</p>
                    <button class="report-retry-btn">Retry</button>
                </div>
            </div>
        `;

        const retryBtn = body.querySelector('.report-retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.loadReport());
        }
    }

    renderJSON(data) {
        const body = this.container.querySelector('.report-viewer-body');
        const jsonStr = JSON.stringify(data, null, 2);

        if (jsonStr.length > this.options.maxCharSize) {
            body.innerHTML = `
                <pre class="json-content">${this.highlightJSON(jsonStr.slice(0, this.options.maxCharSize))}</pre>
                <div class="report-size-indicator">
                    Showing preview (${this.formatBytes(this.options.maxCharSize)} of ${this.formatBytes(jsonStr.length)})
                </div>
            `;
        } else {
            body.innerHTML = `
                <pre class="json-content">${this.highlightJSON(jsonStr)}</pre>
            `;
        }
    }

    highlightJSON(jsonStr) {
        let html = '';
        let i = 0;

        while (i < jsonStr.length) {
            const char = jsonStr[i];
            const nextChars = jsonStr.slice(i, i + 6);

            // String (key or value)
            if (char === '"') {
                const endQuote = jsonStr.indexOf('"', i + 1);
                if (endQuote !== -1) {
                    const str = jsonStr.slice(i, endQuote + 1);
                    const isKey = jsonStr.slice(endQuote + 1).match(/^\s*:/);
                    const cls = isKey ? 'json-key' : 'json-string';
                    html += `<span class="${cls}">${this.escapeHtml(str)}</span>`;
                    i = endQuote + 1;
                    continue;
                }
            }

            // Number
            if (/\d|-/.test(char)) {
                const match = jsonStr.slice(i).match(/^-?\d+\.?\d*([eE][+-]?\d+)?/);
                if (match) {
                    html += `<span class="json-number">${match[0]}</span>`;
                    i += match[0].length;
                    continue;
                }
            }

            // Boolean
            if (nextChars.startsWith('true') || nextChars.startsWith('false')) {
                const bool = nextChars.startsWith('true') ? 'true' : 'false';
                html += `<span class="json-boolean">${bool}</span>`;
                i += bool.length;
                continue;
            }

            // Null
            if (nextChars.startsWith('null')) {
                html += `<span class="json-null">null</span>`;
                i += 4;
                continue;
            }

            // Brackets and braces
            if (char === '{' || char === '}' || char === '[' || char === ']') {
                const cls = (char === '{' || char === '}') ? 'json-brace' : 'json-bracket';
                html += `<span class="${cls}">${char}</span>`;
                i++;
                continue;
            }

            // Comma and colon
            if (char === ',') {
                html += `<span class="json-comma">,</span>`;
                i++;
                continue;
            }

            if (char === ':') {
                html += `<span class="json-colon">:</span>`;
                i++;
                continue;
            }

            // Whitespace or default
            html += char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '&' ? '&amp;' : char;
            i++;
        }

        return html;
    }

    async handleCopy() {
        const copyBtn = this.container.querySelector('.report-copy-btn');

        if (!this.state.jsonData) {
            try {
                await this.loadReport();
            } catch {
                return;
            }
        }

        try {
            const jsonStr = JSON.stringify(this.state.jsonData, null, 2);
            await navigator.clipboard.writeText(jsonStr);

            copyBtn.classList.add('copied');
            copyBtn.setAttribute('aria-label', 'Copied!');

            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.setAttribute('aria-label', 'Copy JSON to clipboard');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

class DashboardController {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.eventQueue = [];
        this.batchTimeout = null;
        // Use SIDEQUEST_API_BASE_URL from meta tag or window object, fallback to current origin
        this.apiBaseUrl = this.getApiBaseUrl();

        this.init();
    }

    /**
     * Get API base URL from meta tag, window object, or fallback to current origin
     * Priority: meta tag > window.SIDEQUEST_API_BASE_URL > window.location.origin
     */
    getApiBaseUrl() {
        // 1. Check for meta tag (set during build/deploy)
        const metaTag = document.querySelector('meta[name="sidequest-api-base-url"]');
        if (metaTag) {
            const url = metaTag.getAttribute('content');
            if (url) {
                console.log(`Using API base URL from meta tag: ${url}`);
                return url;
            }
        }

        // 2. Check for window object (can be set by parent frame or config script)
        if (window.SIDEQUEST_API_BASE_URL) {
            console.log(`Using API base URL from window object: ${window.SIDEQUEST_API_BASE_URL}`);
            return window.SIDEQUEST_API_BASE_URL;
        }

        // 3. Fallback to current origin (for local development)
        console.log(`Using API base URL from current origin: ${window.location.origin}`);
        return window.location.origin;
    }

    /**
     * Initialize dashboard
     */
    async init() {
        console.log('Initializing AlephAuto Dashboard...');

        // Set up documentation tabs
        this.setupDocumentationTabs();

        // Fetch initial status from API
        await this.fetchInitialStatus();

        // Connect to WebSocket for real-time updates
        this.connectWebSocket();

        // Update timestamp every second
        setInterval(() => this.updateTimestamp(), 1000);

        // Update Doppler health status every minute
        this.updateDopplerHealth(); // Initial fetch
        setInterval(() => this.updateDopplerHealth(), 60000); // Every 60 seconds

        // Setup pipeline details panel
        this.setupPipelineDetailsPanel();
    }

    /**
     * Fetch initial status from REST API
     */
    async fetchInitialStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);

            // Check if response is OK and is JSON
            if (!response.ok) {
                throw new Error(`Health endpoint returned ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Health endpoint returned non-JSON response');
            }

            const data = await response.json();

            if (data.status === 'healthy') {
                this.updateSystemStatus('healthy', 'System Healthy');
            }

            // Try to fetch detailed status if available
            try {
                const statusResponse = await fetch(`${this.apiBaseUrl}/api/status`, {
                    cache: 'no-store' // Prevent caching
                });
                console.log('Status response:', statusResponse.status, statusResponse.ok);
                if (statusResponse.ok) {
                    const statusContentType = statusResponse.headers.get('content-type');
                    console.log('Content-Type:', statusContentType);
                    if (statusContentType && statusContentType.includes('application/json')) {
                        const statusData = await statusResponse.json();
                        console.log('Status data received:', statusData);
                        this.renderInitialStatus(statusData);
                        // Success - don't show mock data
                        return;
                    } else {
                        console.warn('Non-JSON response from /api/status');
                        this.showMockData();
                    }
                } else {
                    console.warn('Status response not OK:', statusResponse.status);
                    this.showMockData();
                }
            } catch (err) {
                console.error('Error fetching detailed status:', err);
                this.showMockData();
            }

        } catch (error) {
            console.error('Failed to fetch initial status:', error);
            this.updateSystemStatus('error', 'Connection Failed');
            this.showMockData();
        }
    }

    /**
     * Render initial status data
     */
    renderInitialStatus(data) {
        console.log('renderInitialStatus called with:', data);
        if (data.pipelines) {
            console.log('Rendering pipelines from API:', data.pipelines);
            this.renderPipelines(data.pipelines);
        }
        if (data.queue) {
            this.renderQueue(data.queue);
        }
        if (data.retryMetrics) {
            this.renderRetryMetrics(data.retryMetrics);
        }
        if (data.recentActivity) {
            this.renderActivity(data.recentActivity);
        }
    }

    /**
     * Show mock data for demonstration
     */
    showMockData() {
        console.warn('showMockData() called - falling back to demo data');
        // Mock pipeline data - all AlephAuto workers
        const mockPipelines = [
            {
                id: 'duplicate-detection',
                name: 'Duplicate Detection',
                status: 'idle',
                lastRun: new Date(Date.now() - 3600000).toISOString(),
                nextRun: new Date(Date.now() + 7200000).toISOString(),
                completedJobs: 42,
                failedJobs: 2
            },
            {
                id: 'doc-enhancement',
                name: 'Schema Enhancement',
                status: 'idle',
                lastRun: new Date(Date.now() - 7200000).toISOString(),
                nextRun: new Date(Date.now() + 3600000).toISOString(),
                completedJobs: 156,
                failedJobs: 0
            },
            {
                id: 'git-activity',
                name: 'Git Activity Reporter',
                status: 'idle',
                lastRun: new Date(Date.now() - 86400000).toISOString(),
                nextRun: new Date(Date.now() + 172800000).toISOString(),
                completedJobs: 8,
                failedJobs: 0
            },
            {
                id: 'plugin-manager',
                name: 'Plugin Manager',
                status: 'idle',
                lastRun: new Date(Date.now() - 172800000).toISOString(),
                nextRun: new Date(Date.now() + 259200000).toISOString(),
                completedJobs: 12,
                failedJobs: 1
            },
            {
                id: 'repomix',
                name: 'Repomix Generator',
                status: 'idle',
                lastRun: new Date(Date.now() - 43200000).toISOString(),
                nextRun: new Date(Date.now() + 86400000).toISOString(),
                completedJobs: 24,
                failedJobs: 0
            },
            {
                id: 'gitignore-manager',
                name: 'Gitignore Manager',
                status: 'idle',
                lastRun: new Date(Date.now() - 604800000).toISOString(),
                nextRun: null,
                completedJobs: 5,
                failedJobs: 0
            },
            {
                id: 'claude-health',
                name: 'Claude Health Monitor',
                status: 'idle',
                lastRun: new Date(Date.now() - 21600000).toISOString(),
                nextRun: new Date(Date.now() + 21600000).toISOString(),
                completedJobs: 7,
                failedJobs: 0
            },
            {
                id: 'test-refactor',
                name: 'Test Refactor Pipeline',
                status: 'idle',
                lastRun: new Date(Date.now() - 259200000).toISOString(),
                nextRun: null,
                completedJobs: 3,
                failedJobs: 1
            },
            {
                id: 'bugfix-audit',
                name: 'Bugfix Audit',
                status: 'idle',
                lastRun: new Date(Date.now() - 432000000).toISOString(),
                nextRun: null,
                completedJobs: 2,
                failedJobs: 0
            }
        ];

        this.renderPipelines(mockPipelines);

        // Mock queue data
        this.updateQueueStats(0, 0, 0);

        // Mock activity
        const mockActivity = [
            {
                type: 'success',
                message: 'Duplicate Detection completed successfully',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            },
            {
                type: 'info',
                message: 'Claude Health Monitor job queued',
                timestamp: new Date(Date.now() - 7200000).toISOString()
            }
        ];

        this.renderActivity(mockActivity);
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        // Skip WebSocket if already using polling fallback
        if (this.usingPolling) {
            return;
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

        // Only log on first attempt
        if (this.reconnectAttempts === 0) {
            console.log('Connecting to WebSocket:', wsUrl);
            this.updateSystemStatus('connecting', 'Connecting...');
        }

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.updateSystemStatus('healthy', 'Connected');
                this.addActivity('info', 'WebSocket connection established');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onerror = () => {
                // Suppress error logging - onclose will handle reconnection
            };

            this.ws.onclose = () => {
                this.scheduleReconnect();
            };

        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule WebSocket reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            // Fall back to polling mode instead of showing error
            console.log('WebSocket unavailable, switching to polling mode');
            this.usingPolling = true;
            this.updateSystemStatus('healthy', 'Polling');
            this.startPolling();
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    /**
     * Start polling for updates (fallback when WebSocket unavailable)
     */
    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        // Poll every 30 seconds
        this.pollingInterval = setInterval(() => {
            this.fetchInitialStatus();
        }, 30000);

        console.log('Polling mode active (30s interval)');
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(data) {
        console.log('WebSocket message received:', data);

        // Add to event queue for batched processing
        this.eventQueue.push(data);

        // Clear existing batch timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        // Process events after 500ms of no new events (prevent flicker)
        this.batchTimeout = setTimeout(() => {
            this.processBatchedEvents();
        }, 500);
    }

    /**
     * Process batched WebSocket events
     */
    processBatchedEvents() {
        const events = [...this.eventQueue];
        this.eventQueue = [];

        events.forEach(event => {
            switch (event.type) {
                case 'job:created':
                    this.addActivity('info', `Job created: ${event.job.name || event.job.id}`);
                    this.handleJobEvent(event);
                    break;
                case 'job:started':
                    this.addActivity('info', `Job started: ${event.job.name || event.job.id}`);
                    this.handleJobEvent(event);
                    break;
                case 'job:completed':
                    this.addActivity('success', `Job completed: ${event.job.name || event.job.id}`);
                    this.handleJobEvent(event);
                    break;
                case 'job:failed':
                    this.addActivity('error', `Job failed: ${event.job.name || event.job.id}`);
                    this.handleJobEvent(event);
                    break;
                case 'pipeline:status':
                    this.updatePipelineStatus(event.pipeline);
                    break;
                case 'queue:update':
                    this.updateQueueStats(event.active, event.queued, event.capacity);
                    break;
                case 'retry:update':
                    this.updateRetryMetrics(event.retryMetrics);
                    break;
            }
        });
    }

    /**
     * Handle job events for real-time panel updates
     */
    handleJobEvent(event) {
        // Only update if panel is open for this pipeline
        if (!this.currentPipelineId) return;

        const job = event.job;
        const pipelineId = job.pipelineId || this.extractPipelineFromJobId(job.id);

        // Check if this job belongs to the currently viewed pipeline
        if (pipelineId === this.currentPipelineId) {
            console.log('Refreshing panel jobs due to job event:', event.type, job.id);

            // Refresh the current tab's jobs
            this.fetchPipelineJobs(this.currentPipelineId, { tab: this.currentTab });

            // Also refresh other tabs to keep counts accurate
            const otherTabs = ['recent', 'failed', 'all'].filter(tab => tab !== this.currentTab);
            otherTabs.forEach(tab => {
                this.fetchPipelineJobs(this.currentPipelineId, { tab });
            });
        }
    }

    /**
     * Extract pipeline ID from job ID
     * Job IDs typically start with pipeline name (e.g., "duplicate-detection-job-123")
     */
    extractPipelineFromJobId(jobId) {
        // Simple heuristic: job ID might contain pipeline name
        // This is a fallback if pipelineId is not in the event
        const knownPipelines = ['duplicate-detection', 'doc-enhancement', 'git-activity', 'plugin-manager', 'gitignore'];

        for (const pipeline of knownPipelines) {
            if (jobId.includes(pipeline)) {
                return pipeline;
            }
        }

        return null;
    }

    /**
     * Render pipelines
     */
    renderPipelines(pipelines) {
        console.log('renderPipelines called with:', pipelines);
        console.log('Pipelines array length:', pipelines ? pipelines.length : 'null');
        console.log('Is array?', Array.isArray(pipelines));
        const container = document.getElementById('pipelineCards');
        console.log('Container element:', container);

        if (!pipelines || pipelines.length === 0) {
            console.warn('No pipelines to render, showing empty state');
            container.innerHTML = '<p class="empty-state">No pipelines configured</p>';
            return;
        }

        console.log('Rendering', pipelines.length, 'pipeline cards');
        container.innerHTML = pipelines.map((pipeline, index) => {
            const statusClass = pipeline.status || 'idle';
            const pipelineColor = `pipeline-${(index % 4) + 1}`;

            return `
                <div class="pipeline-card" data-pipeline-id="${pipeline.id}">
                    <div class="pipeline-card-header">
                        <span class="pipeline-name" style="color: var(--color-${pipelineColor})">
                            ${pipeline.name}
                        </span>
                        <span class="pipeline-badge badge-${statusClass}">${statusClass}</span>
                    </div>
                    <div class="pipeline-info">
                        <p style="font-size: 12px; color: var(--color-gray-600); margin-bottom: 8px;">
                            Last run: ${this.formatRelativeTime(pipeline.lastRun)}
                        </p>
                        <p style="font-size: 12px; color: var(--color-gray-600);">
                            Next run: ${this.formatRelativeTime(pipeline.nextRun)}
                        </p>
                    </div>
                    <div class="pipeline-stats">
                        <div class="pipeline-stat">
                            <span class="stat-label">Completed</span>
                            <span class="stat-value">${pipeline.completedJobs || 0}</span>
                        </div>
                        <div class="pipeline-stat">
                            <span class="stat-label">Failed</span>
                            <span class="stat-value" style="color: ${pipeline.failedJobs > 0 ? 'var(--color-error)' : 'var(--color-gray-900)'}">
                                ${pipeline.failedJobs || 0}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Update pipeline status
     */
    updatePipelineStatus(pipeline) {
        const card = document.querySelector(`[data-pipeline-id="${pipeline.id}"]`);
        if (card) {
            const badge = card.querySelector('.pipeline-badge');
            if (badge) {
                badge.className = `pipeline-badge badge-${pipeline.status}`;
                badge.textContent = pipeline.status;
            }
        }
    }

    /**
     * Render job queue
     */
    renderQueue(queue) {
        // Handle both array format and numeric format from API
        let active = queue.active || [];
        let queued = queue.queued || [];
        const capacity = queue.capacity || 0;

        // If active/queued are numbers, convert to empty arrays
        if (typeof active === 'number') active = [];
        if (typeof queued === 'number') queued = [];

        this.updateQueueStats(active.length, queued.length, capacity);

        const container = document.getElementById('queueJobs');
        const allJobs = [...active, ...queued];

        if (allJobs.length === 0) {
            container.innerHTML = '<p class="empty-state">No active or queued jobs</p>';
            return;
        }

        container.innerHTML = allJobs.map(job => `
            <div class="job-item">
                <div class="job-header">
                    <span class="job-name">${job.name || job.id}</span>
                    <span class="pipeline-badge badge-${job.status}">${job.status}</span>
                </div>
                <div class="job-meta">
                    Started: ${this.formatRelativeTime(job.startedAt || job.createdAt)}
                </div>
            </div>
        `).join('');
    }

    /**
     * Update queue statistics
     */
    updateQueueStats(active, queued, capacity) {
        document.getElementById('activeJobsCount').textContent = active;
        document.getElementById('queuedJobsCount').textContent = queued;
        document.getElementById('capacityValue').textContent = `${Math.round(capacity)}%`;
    }

    /**
     * Render retry metrics
     */
    renderRetryMetrics(retryMetrics) {
        if (!retryMetrics) {
            // Show empty state
            document.getElementById('activeRetriesCount').textContent = '0';
            document.getElementById('totalRetryAttempts').textContent = '0';
            document.getElementById('nearingLimitCount').textContent = '0';
            document.getElementById('retryJobsList').innerHTML = '<p class="empty-state">No jobs currently being retried</p>';
            return;
        }

        const {
            activeRetries = 0,
            totalRetryAttempts = 0,
            retryDistribution = {},
            jobsBeingRetried = []
        } = retryMetrics;

        // Update stats
        document.getElementById('activeRetriesCount').textContent = activeRetries;
        document.getElementById('totalRetryAttempts').textContent = totalRetryAttempts;
        document.getElementById('nearingLimitCount').textContent = retryDistribution.nearingLimit || 0;

        // Update distribution bars
        const maxAttempts = Math.max(
            retryDistribution.attempt1 || 0,
            retryDistribution.attempt2 || 0,
            retryDistribution.attempt3Plus || 0,
            1 // Avoid division by zero
        );

        this.updateDistributionBar('attempt1', retryDistribution.attempt1 || 0, maxAttempts);
        this.updateDistributionBar('attempt2', retryDistribution.attempt2 || 0, maxAttempts);
        this.updateDistributionBar('attempt3Plus', retryDistribution.attempt3Plus || 0, maxAttempts);

        // Update jobs being retried list
        const container = document.getElementById('retryJobsList');

        if (jobsBeingRetried.length === 0) {
            container.innerHTML = '<p class="empty-state">No jobs currently being retried</p>';
            return;
        }

        container.innerHTML = jobsBeingRetried.map(job => {
            const isWarning = job.attempts >= 3;
            return `
                <div class="retry-job-item ${isWarning ? 'warning' : ''}">
                    <div class="retry-job-header">
                        <span class="retry-job-id">${job.jobId}</span>
                        <span class="retry-attempts ${isWarning ? 'warning' : ''}">
                            ${job.attempts}/${job.maxAttempts} attempts
                        </span>
                    </div>
                    <div class="retry-job-meta">
                        Last attempt: ${this.formatRelativeTime(job.lastAttempt)}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Update distribution bar
     */
    updateDistributionBar(barId, value, maxValue) {
        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
        const barFill = document.getElementById(`${barId}Bar`);
        const barValue = document.getElementById(`${barId}Value`);

        if (barFill) {
            barFill.style.width = `${percentage}%`;
        }
        if (barValue) {
            barValue.textContent = value;
        }
    }

    /**
     * Update retry metrics from WebSocket event
     */
    updateRetryMetrics(retryMetrics) {
        this.renderRetryMetrics(retryMetrics);
    }

    /**
     * Render activity feed
     */
    renderActivity(activities) {
        const container = document.getElementById('activityFeed');

        if (!activities || activities.length === 0) {
            container.innerHTML = '<p class="empty-state">No recent activity</p>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item ${activity.type}">
                <span class="activity-time">${this.formatRelativeTime(activity.timestamp)}</span>
                <div class="activity-message">${activity.message}</div>
            </div>
        `).join('');
    }

    /**
     * Add activity to feed
     */
    addActivity(type, message) {
        const container = document.getElementById('activityFeed');

        // Remove empty state if present
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const activity = document.createElement('div');
        activity.className = `activity-item ${type}`;
        activity.innerHTML = `
            <span class="activity-time">${this.formatRelativeTime(new Date().toISOString())}</span>
            <div class="activity-message">${message}</div>
        `;

        container.insertBefore(activity, container.firstChild);

        // Keep only last 20 activities
        const items = container.querySelectorAll('.activity-item');
        if (items.length > 20) {
            items[items.length - 1].remove();
        }
    }

    /**
     * Update system status indicator
     */
    updateSystemStatus(status, text) {
        const statusElement = document.getElementById('systemStatus');
        const indicator = statusElement.querySelector('.status-indicator');
        const textElement = statusElement.querySelector('.status-text');

        indicator.className = `status-indicator status-${status}`;
        // Add ARIA attributes for accessibility
        indicator.setAttribute('role', 'img');
        indicator.setAttribute('aria-label', `Status: ${text}`);
        textElement.textContent = text;
    }

    /**
     * Update timestamp
     */
    updateTimestamp() {
        const timeElement = document.querySelector('.update-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString();
        }
    }

    /**
     * Update Doppler health status
     */
    async updateDopplerHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health/doppler`);

            // Check if response is OK and is JSON
            if (!response.ok) {
                throw new Error(`Doppler health endpoint returned ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Doppler health endpoint returned non-JSON response');
            }

            const health = await response.json();

            const container = document.getElementById('dopplerHealth');
            const indicator = container.querySelector('.health-indicator');
            const text = container.querySelector('.health-text');

            if (!container || !indicator || !text) return;

            // Remove all existing classes
            indicator.className = 'health-indicator';

            // Add appropriate class based on severity
            if (health.status === 'error') {
                indicator.classList.add('health-error');
                indicator.setAttribute('aria-label', 'Doppler: Error');
                text.textContent = `Doppler: Error`;
            } else if (health.severity === 'critical') {
                indicator.classList.add('health-critical');
                indicator.setAttribute('aria-label', 'Doppler: Critical');
                text.textContent = `Doppler: Stale ${health.cacheAgeHours}h`;
            } else if (health.severity === 'warning') {
                indicator.classList.add('health-warning');
                indicator.setAttribute('aria-label', 'Doppler: Warning');
                text.textContent = `Doppler: Cache ${health.cacheAgeHours}h`;
            } else if (health.usingFallback) {
                indicator.classList.add('health-healthy');
                indicator.setAttribute('aria-label', 'Doppler: Using Cache');
                text.textContent = `Doppler: Cache ${health.cacheAgeHours}h`;
            } else {
                indicator.classList.add('health-healthy');
                indicator.setAttribute('aria-label', 'Doppler: Live');
                text.textContent = 'Doppler: Live';
            }
        } catch (error) {
            console.error('Failed to fetch Doppler health:', error);

            const container = document.getElementById('dopplerHealth');
            if (container) {
                const indicator = container.querySelector('.health-indicator');
                const text = container.querySelector('.health-text');

                if (indicator && text) {
                    indicator.className = 'health-indicator health-error';
                    indicator.setAttribute('aria-label', 'Doppler: Unknown');
                    text.textContent = 'Doppler: Unknown';
                }
            }
        }
    }

    /**
     * Format relative time
     */
    formatRelativeTime(isoString) {
        if (!isoString) return 'Never';

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

        return date.toLocaleDateString();
    }

    /**
     * Setup documentation tabs
     */
    setupDocumentationTabs() {
        const tabs = document.querySelectorAll('.doc-tab');
        const panels = document.querySelectorAll('.doc-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetDoc = /** @type {HTMLElement} */ (tab).dataset.doc;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active panel
                panels.forEach(panel => {
                    if (/** @type {HTMLElement} */ (panel).dataset.panel === targetDoc) {
                        panel.classList.add('active');
                    } else {
                        panel.classList.remove('active');
                    }
                });

                // Load pipeline data flow documentation if that tab is clicked
                if (targetDoc === 'data-flow') {
                    this.loadPipelineDataFlow();
                }
            });
        });
    }

    /**
     * Load pipeline data flow documentation from markdown file
     */
    async loadPipelineDataFlow() {
        const container = document.getElementById('pipelineDataFlowContent');
        if (!container) return;

        // Check if already loaded
        if (container.dataset.loaded === 'true') return;

        try {
            const response = await fetch('/api/pipeline-data-flow');
            if (!response.ok) {
                throw new Error(`Failed to fetch documentation: ${response.statusText}`);
            }

            const html = await response.text();
            container.innerHTML = html;
            container.dataset.loaded = 'true';

            // Initialize mermaid diagrams after content is loaded
            // @ts-ignore - mermaid loaded from CDN
            if (window.mermaid) {
                // Wait for next tick to ensure DOM is ready
                setTimeout(async () => {
                    try {
                        // @ts-ignore - mermaid loaded from CDN
                        await window.mermaid.run({
                            querySelector: '.markdown-content pre.language-mermaid, .markdown-content code.language-mermaid'
                        });
                    } catch (mermaidError) {
                        console.warn('Failed to render mermaid diagrams:', mermaidError);
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Failed to load pipeline data flow documentation:', error);
            container.innerHTML = `
                <div class="error-state">
                    <p class="error-message">Failed to load pipeline data flow documentation</p>
                    <p class="error-details">${error.message}</p>
                    <button class="btn btn-secondary" onclick="dashboard.loadPipelineDataFlow()">Retry</button>
                </div>
            `;
        }
    }

    /**
     * Setup pipeline details panel
     */
    setupPipelineDetailsPanel() {
        const panel = document.getElementById('detailsPanel');
        const overlay = document.getElementById('panelOverlay');
        const closeBtn = document.getElementById('panelCloseBtn');

        // Current panel state
        this.currentPipelineId = null;
        this.currentTab = 'recent';

        // Close panel handlers
        const closePanel = () => this.closePipelinePanel();

        closeBtn?.addEventListener('click', closePanel);
        overlay?.addEventListener('click', closePanel);

        // Keyboard navigation - Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel?.classList.contains('active')) {
                closePanel();
            }
        });

        // Panel tab navigation
        const tabs = {
            recent: document.getElementById('recentTab'),
            failed: document.getElementById('failedTab'),
            all: document.getElementById('allTab')
        };

        Object.entries(tabs).forEach(([tabName, tabEl]) => {
            tabEl?.addEventListener('click', () => {
                this.switchPanelTab(tabName);
            });
        });

        // Make pipeline cards clickable
        // Use event delegation since cards may be re-rendered
        document.getElementById('pipelineCards')?.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            const card = /** @type {HTMLElement | null} */ (target.closest('.pipeline-card'));
            if (card) {
                const pipelineId = card.dataset.pipelineId;
                if (pipelineId) {
                    this.openPipelinePanel(pipelineId);
                }
            }
        });
    }

    /**
     * Open pipeline details panel
     */
    async openPipelinePanel(pipelineId) {
        console.log('Opening pipeline panel:', pipelineId);

        // Store the triggering element for focus return
        this.panelTriggerElement = document.activeElement;

        this.currentPipelineId = pipelineId;
        this.currentTab = 'recent';

        const panel = document.getElementById('detailsPanel');
        const overlay = document.getElementById('panelOverlay');

        // Show panel with animation
        overlay?.classList.add('active');
        panel?.classList.add('active');

        // Update ARIA attributes
        panel?.setAttribute('aria-hidden', 'false');
        overlay?.setAttribute('aria-hidden', 'false');

        // Update panel title
        const title = document.getElementById('panelTitle');
        if (title) {
            title.textContent = `${pipelineId} - Job History`;
        }

        // Focus close button for keyboard navigation
        document.getElementById('panelCloseBtn')?.focus();

        // Load jobs for all tabs
        await Promise.all([
            this.fetchPipelineJobs(pipelineId, { tab: 'recent' }),
            this.fetchPipelineJobs(pipelineId, { tab: 'failed' }),
            this.fetchPipelineJobs(pipelineId, { tab: 'all' })
        ]);
    }

    /**
     * Close pipeline details panel
     */
    closePipelinePanel() {
        console.log('Closing pipeline panel');

        const panel = document.getElementById('detailsPanel');
        const overlay = document.getElementById('panelOverlay');

        // Hide panel with animation
        overlay?.classList.remove('active');
        panel?.classList.remove('active');

        // Update ARIA attributes
        panel?.setAttribute('aria-hidden', 'true');
        overlay?.setAttribute('aria-hidden', 'true');

        // Return focus to triggering element
        if (this.panelTriggerElement && /** @type {HTMLElement} */ (this.panelTriggerElement).focus) {
            /** @type {HTMLElement} */ (this.panelTriggerElement).focus();
        }

        // Reset state
        this.currentPipelineId = null;
        this.currentTab = 'recent';
        this.panelTriggerElement = null;
    }

    /**
     * Switch panel tab
     */
    switchPanelTab(tabName) {
        console.log('Switching to tab:', tabName);

        this.currentTab = tabName;

        // Update tab active states
        const tabs = ['recent', 'failed', 'all'];
        tabs.forEach(tab => {
            const tabEl = document.getElementById(`${tab}Tab`);
            const panelEl = document.getElementById(`${tab}Panel`);

            if (tab === tabName) {
                tabEl?.classList.add('active');
                tabEl?.setAttribute('aria-selected', 'true');
                panelEl?.classList.add('active');
            } else {
                tabEl?.classList.remove('active');
                tabEl?.setAttribute('aria-selected', 'false');
                panelEl?.classList.remove('active');
            }
        });
    }

    /**
     * Fetch pipeline jobs from API
     */
    async fetchPipelineJobs(pipelineId, options = {}) {
        const { tab = 'recent', status, limit = 10 } = options;

        // Show loading state
        const loadingEl = document.getElementById(`${tab}Loading`);
        const listEl = document.getElementById(`${tab}JobsList`);
        const emptyEl = document.getElementById(`${tab}Empty`);

        if (loadingEl) loadingEl.style.display = 'flex';
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'none';

        try {
            // Build query params
            const params = new URLSearchParams();
            if (status) params.append('status', status);
            if (tab) params.append('tab', tab);
            params.append('limit', limit.toString());

            const response = await fetch(
                `${this.apiBaseUrl}/api/sidequest/pipeline-runners/${pipelineId}/jobs?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();

            // Hide loading state
            if (loadingEl) loadingEl.style.display = 'none';

            // Update tab counter
            const countEl = document.getElementById(`${tab}Count`);
            if (countEl) countEl.textContent = data.total || 0;

            // Render jobs or show empty state
            if (data.jobs && data.jobs.length > 0) {
                this.renderPipelineJobs(data.jobs, `${tab}JobsList`);
            } else {
                if (emptyEl) emptyEl.style.display = 'block';
            }

        } catch (error) {
            console.error('Failed to fetch pipeline jobs:', error);

            // Hide loading state
            if (loadingEl) loadingEl.style.display = 'none';

            // Show error message
            if (listEl) {
                listEl.innerHTML = `
                    <div class="panel-empty-state">
                        <p class="panel-empty-message">Failed to load jobs</p>
                        <p class="panel-empty-hint">${error.message}</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Render pipeline jobs
     */
    renderPipelineJobs(jobs, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Store jobs for click handler
        this.currentJobs = jobs;

        container.innerHTML = jobs.map((job, index) => {
            return `
                <div class="panel-job-item clickable" data-job-index="${index}" onclick="window.dashboardController.showJobDetails(${index})">
                    <div class="panel-job-header">
                        <span class="panel-job-id">${job.id}</span>
                        <span class="panel-job-status status-${job.status}">${job.status}</span>
                    </div>
                    <div class="panel-job-meta">
                        <div class="panel-job-meta-row">
                            <span class="meta-label">Started:</span>
                            <span>${this.formatRelativeTime(job.startTime)}</span>
                        </div>
                        ${job.endTime ? `
                            <div class="panel-job-meta-row">
                                <span class="meta-label">Duration:</span>
                                <span>${this.formatJobDuration(job.duration)}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="panel-job-click-hint">Click for details</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Show job details modal with enhanced UX
     */
    showJobDetails(index) {
        const job = this.currentJobs[index];
        if (!job) return;

        // Store current focus to restore later
        this.previousFocus = document.activeElement;

        // Create or get modal as semantic <dialog> element
        let modal = document.getElementById('job-details-modal');
        if (!modal) {
            modal = document.createElement('dialog');
            modal.id = 'job-details-modal';
            modal.className = 'job-details-modal';
            modal.setAttribute('aria-labelledby', 'job-details-title');
            modal.setAttribute('aria-modal', 'true');
            document.body.appendChild(modal);
        }

        // Generate content sections with enhanced formatting
        const heroHtml = this.formatHeroSection(job);
        const errorHtml = job.error ? this.formatErrorSection(job.error) : '';
        const resultHtml = job.result ? this.formatEnhancedJobResult(job) : '';
        const timelineHtml = this.formatTimeline(job);
        const gitHtml = job.git ? this.formatEnhancedGitInfo(job.git) : '';
        const parametersHtml = this.formatJobParameters(job.parameters);

        modal.innerHTML = `
            <div class="job-details-content">
                <header class="job-details-header">
                    <h3 id="job-details-title">Job Details</h3>
                    <button class="job-details-close"
                            aria-label="Close job details dialog"
                            onclick="window.dashboardController.closeJobDetails()">&times;</button>
                </header>
                <main class="job-details-body">
                    <section aria-labelledby="job-status-heading">
                        <h4 id="job-status-heading" class="sr-only">Job Status</h4>
                        ${heroHtml}
                    </section>
                    ${errorHtml ? `
                        <section aria-labelledby="job-error-heading" role="alert" aria-live="assertive">
                            <h4 id="job-error-heading" class="sr-only">Job Error</h4>
                            ${errorHtml}
                        </section>
                    ` : ''}
                    ${resultHtml ? `
                        <section aria-labelledby="job-result-heading">
                            <h4 id="job-result-heading" class="sr-only">Job Result</h4>
                            ${resultHtml}
                        </section>
                    ` : ''}
                    <section aria-labelledby="job-timeline-heading">
                        <h4 id="job-timeline-heading" class="sr-only">Job Timeline</h4>
                        ${timelineHtml}
                    </section>
                    ${gitHtml ? `
                        <section aria-labelledby="job-git-heading">
                            <h4 id="job-git-heading" class="sr-only">Git Information</h4>
                            ${gitHtml}
                        </section>
                    ` : ''}
                    ${parametersHtml ? `
                        <section aria-labelledby="job-parameters-heading">
                            <div class="collapsible-section collapsed" id="parameters-section">
                                <div class="collapsible-header"
                                     role="button"
                                     aria-expanded="false"
                                     aria-controls="parameters-content"
                                     tabindex="0"
                                     onclick="window.dashboardController.toggleSection('parameters-section')"
                                     onkeydown="window.dashboardController.handleCollapsibleKeydown(event, 'parameters-section')">
                                    <span class="collapsible-title">
                                        <span class="collapsible-toggle" aria-hidden="true">▼</span>
                                        <h4 id="job-parameters-heading" class="collapsible-heading">Parameters</h4>
                                    </span>
                                </div>
                                <div id="parameters-content" class="collapsible-content" role="region" aria-labelledby="job-parameters-heading">
                                    ${parametersHtml}
                                </div>
                            </div>
                        </section>
                    ` : ''}
                </main>
            </div>
        `;

        // Show modal using native dialog API
        /** @type {HTMLDialogElement} */ (modal).showModal();

        // Initialize copy buttons
        this.initializeCopyButtons();

        // Set up focus trap
        this.setupFocusTrap(modal);

        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts(modal, job);

        // Handle Escape key (native dialog handles this, but we add custom handler)
        modal.addEventListener('cancel', (e) => {
            e.preventDefault();
            this.closeJobDetails();
        });

        // Close on backdrop click (clicks outside dialog content)
        modal.addEventListener('click', (e) => {
            const rect = modal.getBoundingClientRect();
            const isInDialog = (
                rect.top <= e.clientY &&
                e.clientY <= rect.top + rect.height &&
                rect.left <= e.clientX &&
                e.clientX <= rect.left + rect.width
            );
            if (!isInDialog) {
                this.closeJobDetails();
            }
        });

        // Focus the close button
        const closeButton = /** @type {HTMLElement | null} */ (modal.querySelector('.job-details-close'));
        if (closeButton) {
            closeButton.focus();
        }
    }

    /**
     * Close job details modal and restore focus
     */
    closeJobDetails() {
        const modal = /** @type {HTMLDialogElement | null} */ (document.getElementById('job-details-modal'));
        if (modal && modal.open) {
            modal.close();

            // Restore focus to previously focused element
            const prevFocus = /** @type {HTMLElement | null} */ (this.previousFocus);
            if (prevFocus && typeof prevFocus.focus === 'function') {
                prevFocus.focus();
            }
            this.previousFocus = null;
        }
    }

    /**
     * Set up focus trap within modal
     */
    setupFocusTrap(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstFocusable = /** @type {HTMLElement} */ (focusableElements[0]);
        const lastFocusable = /** @type {HTMLElement} */ (focusableElements[focusableElements.length - 1]);

        const handleTabKey = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        };

        modal.addEventListener('keydown', handleTabKey);
    }

    /**
     * Handle keyboard navigation for collapsible sections
     */
    handleCollapsibleKeydown(event, sectionId) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.toggleSection(sectionId);
        }
    }

    /**
     * Set up keyboard shortcuts for modal
     */
    setupKeyboardShortcuts(modal, job) {
        const handleKeyboardShortcut = (e) => {
            // Cmd+C or Ctrl+C - Copy Job ID
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                // Only trigger if not inside an input or textarea
                if (document.activeElement.tagName !== 'INPUT' &&
                    document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();

                    // Copy job ID
                    navigator.clipboard.writeText(job.id).then(() => {
                        // Show visual feedback
                        const notification = document.createElement('div');
                        notification.className = 'keyboard-shortcut-notification';
                        notification.textContent = `Job ID copied: ${job.id}`;
                        modal.appendChild(notification);

                        setTimeout(() => {
                            notification.classList.add('fade-out');
                            setTimeout(() => notification.remove(), 300);
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy:', err);
                    });
                }
            }

            // ? - Show keyboard shortcuts help
            if (e.key === '?' && !e.shiftKey) {
                e.preventDefault();
                this.showKeyboardShortcutsHelp(modal);
            }
        };

        modal.addEventListener('keydown', handleKeyboardShortcut);
    }

    /**
     * Show keyboard shortcuts help overlay
     */
    showKeyboardShortcutsHelp(modal) {
        // Check if help is already shown
        if (modal.querySelector('.keyboard-shortcuts-help')) {
            return;
        }

        const helpOverlay = document.createElement('div');
        helpOverlay.className = 'keyboard-shortcuts-help';
        helpOverlay.setAttribute('role', 'dialog');
        helpOverlay.setAttribute('aria-label', 'Keyboard shortcuts');
        helpOverlay.innerHTML = `
            <div class="keyboard-shortcuts-content">
                <h4>Keyboard Shortcuts</h4>
                <dl class="keyboard-shortcuts-list">
                    <dt><kbd>Cmd/Ctrl</kbd> + <kbd>C</kbd></dt>
                    <dd>Copy Job ID to clipboard</dd>

                    <dt><kbd>Esc</kbd></dt>
                    <dd>Close modal</dd>

                    <dt><kbd>Tab</kbd></dt>
                    <dd>Navigate through interactive elements</dd>

                    <dt><kbd>Enter</kbd> / <kbd>Space</kbd></dt>
                    <dd>Expand/collapse sections</dd>

                    <dt><kbd>?</kbd></dt>
                    <dd>Show this help</dd>
                </dl>
                <button class="keyboard-shortcuts-close" onclick="this.parentElement.parentElement.remove()">
                    Close <span class="keyboard-hint">(Esc)</span>
                </button>
            </div>
        `;

        modal.appendChild(helpOverlay);

        // Close on Escape
        const closeHelp = (e) => {
            if (e.key === 'Escape') {
                helpOverlay.remove();
            }
        };
        helpOverlay.addEventListener('keydown', closeHelp);

        // Focus the close button
        const closeBtn = /** @type {HTMLElement | null} */ (helpOverlay.querySelector('.keyboard-shortcuts-close'));
        if (closeBtn) {
            closeBtn.focus();
        }
    }

    /**
     * Copy text to clipboard with visual feedback
     */
    copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = button.textContent;
            button.classList.add('copied');
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.classList.remove('copied');
                button.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    /**
     * Toggle collapsible section
     */
    toggleSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            const isCollapsed = section.classList.toggle('collapsed');
            const header = section.querySelector('.collapsible-header');
            if (header) {
                header.setAttribute('aria-expanded', String(!isCollapsed));
            }
        }
    }

    /**
     * Format timeline for job events
     */
    formatTimeline(job) {
        const events = [];

        if (job.createdAt) {
            events.push({
                label: 'Created',
                time: job.createdAt,
                status: 'completed'
            });
        }

        if (job.startTime) {
            events.push({
                label: 'Started',
                time: job.startTime,
                status: 'completed'
            });
        }

        if (job.status === 'running') {
            events.push({
                label: 'Running',
                time: new Date().toISOString(),
                status: 'active'
            });
        }

        if (job.endTime) {
            events.push({
                label: job.status === 'completed' ? 'Completed' : 'Failed',
                time: job.endTime,
                status: job.status === 'completed' ? 'completed' : 'failed'
            });
        }

        if (events.length === 0) return '';

        return `
            <div class="job-details-section">
                <h4>Timeline</h4>
                <div class="job-timeline">
                    ${events.map((event, index) => `
                        <div class="timeline-item">
                            <div class="timeline-marker ${event.status}"></div>
                            <div class="timeline-content">
                                <div class="timeline-label">${event.label}</div>
                                <div class="timeline-time">${new Date(event.time).toLocaleString()}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Format hero section with status and metrics
     */
    formatHeroSection(job) {
        const pipelineName = this.getPipelineDisplayName(job.pipelineId);
        const statusIcon = this.getStatusIcon(job.status);

        // Get HTML report path (always returns a path, either from result or constructed from job ID)
        const htmlReportPath = this.getHtmlReportPath(job);

        return `
            <div class="job-details-hero status-${job.status}">
                <div class="hero-header">
                    <div class="hero-title">
                        <div class="hero-job-id">
                            <div class="copyable-field">
                                <span class="copyable-value">${job.id}</span>
                                <a href="${htmlReportPath}" target="_blank" class="full-results-btn">
                                    View Report →
                                </a>
                            </div>
                        </div>
                        <div class="hero-pipeline-name">${pipelineName}</div>
                    </div>
                    <div class="hero-status status-${job.status}">
                        <span class="hero-status-icon">${statusIcon}</span>
                        ${job.status}
                    </div>
                </div>
                <div class="metric-cards">
                    ${job.duration ? `
                        <div class="metric-card">
                            <span class="metric-label">Duration</span>
                            <span class="metric-value ${job.duration > 60000 ? 'small' : ''}">${this.formatJobDuration(job.duration)}</span>
                        </div>
                    ` : ''}
                    ${job.attempts ? `
                        <div class="metric-card">
                            <span class="metric-label">Attempts</span>
                            <span class="metric-value">${job.attempts}</span>
                        </div>
                    ` : ''}
                    ${job.progress ? `
                        <div class="metric-card">
                            <span class="metric-label">Progress</span>
                            <span class="metric-value">${job.progress}%</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Format prominent error section
     */
    formatErrorSection(error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
        const errorStack = typeof error === 'object' && error.stack ? error.stack : '';

        return `
            <div class="error-section">
                <div class="error-title">
                    <span class="error-icon">⚠️</span>
                    Job Failed
                </div>
                <div class="error-message">${this.escapeHtml(errorMessage)}</div>
                ${errorStack ? `
                    <a class="error-stack-toggle" onclick="window.dashboardController.toggleSection('error-stack')">Show Stack Trace</a>
                    <div class="collapsible-section collapsed" id="error-stack" style="border: none; margin: 0;">
                        <pre class="error-stack">${this.escapeHtml(errorStack)}</pre>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Format enhanced job result with highlights
     */
    formatEnhancedJobResult(job) {
        if (!job.result) return '';

        const result = job.result;
        let highlightsHtml = '';
        let detailsHtml = '';

        // Extract key metrics for highlights
        const highlights = [];

        // Support both direct result fields and fields from job result
        const duplicates = result.totalDuplicates ?? result.crossRepoDuplicates ?? result.duplicates ?? result.suggestions;
        const blocks = result.totalBlocks ?? result.repositories;
        const duration = result.scanDuration ?? result.duration;

        if (duplicates !== undefined) {
            highlights.push({
                label: 'Duplicates Found',
                value: duplicates,
                type: duplicates > 0 ? 'warning' : 'success'
            });
        }

        // Show repositories for inter-project scans
        if (result.scanType === 'inter-project' && result.repositories !== undefined) {
            highlights.push({
                label: 'Repositories',
                value: result.repositories,
                type: 'default'
            });
        }

        // Show suggestions for all scan types
        if (result.suggestions !== undefined && result.suggestions !== duplicates) {
            highlights.push({
                label: 'Suggestions',
                value: result.suggestions,
                type: 'default'
            });
        }

        // Show code blocks for intra-project or if available
        if (blocks !== undefined && result.scanType !== 'inter-project') {
            highlights.push({
                label: 'Code Blocks',
                value: blocks,
                type: 'default'
            });
        }

        if (result.filesProcessed !== undefined) {
            highlights.push({
                label: 'Files Processed',
                value: result.filesProcessed,
                type: 'default'
            });
        }

        if (duration !== undefined) {
            const seconds = duration >= 1000 ? (duration / 1000).toFixed(2) : duration.toFixed(2);
            highlights.push({
                label: 'Scan Time',
                value: `${seconds}s`,
                type: 'default'
            });
        }

        // Format highlights
        if (highlights.length > 0) {
            highlightsHtml = `
                <div class="result-highlights">
                    ${highlights.map(h => `
                        <div class="result-highlight">
                            <span class="result-highlight-label">${h.label}</span>
                            <span class="result-highlight-value ${h.type}">${h.value}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Add report viewer if available
        if (result.reportPath) {
            const viewerId = `report-viewer-${job.id}`;
            detailsHtml = `<div id="${viewerId}" class="report-viewer-container"></div>`;

            // Schedule viewer initialization
            setTimeout(() => {
                const container = document.getElementById(viewerId);
                if (container) {
                    new JSONReportViewer(result.reportPath, container);
                }
            }, 0);
        } else if (result.output) {
            detailsHtml = `<pre class="result-output">${this.escapeHtml(result.output)}</pre>`;
        }

        return `
            <div class="job-details-section">
                <h4>Result</h4>
                ${highlightsHtml}
                ${detailsHtml}
            </div>
        `;
    }

    /**
     * Format enhanced git workflow information
     */
    formatEnhancedGitInfo(git) {
        if (!git) return '';

        return `
            <div class="job-details-section">
                <h4>Git Workflow</h4>
                ${git.branchName ? `
                    <div class="copyable-field">
                        <span class="copyable-value">${git.branchName}</span>
                        <button class="copy-btn" onclick="window.dashboardController.copyToClipboard('${git.branchName}', this)">Copy Branch</button>
                    </div>
                ` : ''}
                ${git.commitSha ? `
                    <div class="copyable-field">
                        <span class="copyable-value">${git.commitSha}</span>
                        <button class="copy-btn" onclick="window.dashboardController.copyToClipboard('${git.commitSha}', this)">Copy SHA</button>
                    </div>
                ` : ''}
                ${git.prUrl ? `
                    <a href="${git.prUrl}" target="_blank" class="pr-link">
                        <span class="pr-badge">PR</span>
                        View Pull Request →
                    </a>
                ` : ''}
                ${git.changedFiles && git.changedFiles.length > 0 ? `
                    <div style="margin-top: var(--space-2);">
                        <div style="font-size: 12px; font-weight: 600; color: var(--color-gray-700); margin-bottom: var(--space-1);">
                            Changed Files (${git.changedFiles.length})
                        </div>
                        <div class="changed-files-list">
                            ${git.changedFiles.map(file => `
                                <div class="changed-file">${file}</div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Initialize copy buttons in the modal
     */
    initializeCopyButtons() {
        // Copy buttons are already wired with onclick handlers
        // This method is for future enhancements if needed
    }

    /**
     * Get HTML report path from job result or construct from job ID
     */
    getHtmlReportPath(job) {
        // Check if reportPath exists in result
        if (job.result && job.result.reportPath) {
            // If it's already an HTML file
            if (job.result.reportPath.endsWith('.html')) {
                return job.result.reportPath.replace(/^.*\/output\/reports\//, '/api/reports/');
            }

            // Check for report_paths.html (new format from scan orchestrator)
            if (job.result.report_paths && job.result.report_paths.html) {
                return job.result.report_paths.html.replace(/^.*\/output\/reports\//, '/api/reports/');
            }

            // Construct HTML path from JSON/MD path
            // Pattern: "inter-project-scan-2repos-2025-11-24-summary.json" -> "inter-project-scan-2repos-2025-11-24.html"
            const htmlPath = job.result.reportPath
                .replace(/-summary\.(json|md)$/, '.html')  // Remove -summary suffix and change extension
                .replace(/\.(json|md)$/, '.html');         // Or just change extension if no -summary
            return htmlPath.replace(/^.*\/output\/reports\//, '/api/reports/');
        }

        // Fallback: construct from job ID
        // Pattern: "inter-project-scan-2repos-2025-11-24" -> "/api/reports/inter-project-scan-2repos-2025-11-24.html"
        const htmlFilename = `${job.id}.html`;
        return `/api/reports/${htmlFilename}`;
    }

    /**
     * Get pipeline display name
     */
    getPipelineDisplayName(pipelineId) {
        const names = {
            'duplicate-detection': 'Duplicate Detection',
            'doc-enhancement': 'Schema Enhancement',
            'git-activity': 'Git Activity Reporter',
            'plugin-manager': 'Plugin Manager',
            'repomix': 'Repomix Generator',
            'gitignore-manager': 'Gitignore Manager',
            'claude-health': 'Claude Health Monitor',
            'test-refactor': 'Test Refactor Pipeline',
            'bugfix-audit': 'Bugfix Audit'
        };
        return names[pipelineId] || pipelineId;
    }

    /**
     * Get status icon
     */
    getStatusIcon(status) {
        const icons = {
            'completed': '✅',
            'failed': '❌',
            'running': '⚡',
            'queued': '⏳',
            'cancelled': '🚫'
        };
        return icons[status] || '❓';
    }

    /**
     * Escape HTML for safe display
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Format job result for display
     */
    formatJobResult(job) {
        if (!job.result) return '';

        const result = job.result;
        let html = '<div class="job-result-data">';

        // Handle different result types
        if (result.totalDuplicates !== undefined) {
            html += `<div class="result-field"><span class="field-label">Total Duplicates</span><span class="field-value">${result.totalDuplicates}</span></div>`;
        }
        if (result.totalBlocks !== undefined) {
            html += `<div class="result-field"><span class="field-label">Total Blocks</span><span class="field-value">${result.totalBlocks}</span></div>`;
        }
        if (result.scanDuration) {
            html += `<div class="result-field"><span class="field-label">Scan Duration</span><span class="field-value">${result.scanDuration}ms</span></div>`;
        }
        if (result.output) {
            html += `<div class="result-field"><span class="field-label">Output</span><pre class="field-value">${result.output}</pre></div>`;
        }

        // JSON Report Viewer for report files
        if (result.reportPath) {
            const viewerId = `report-viewer-${job.id}`;
            html += `<div id="${viewerId}" class="report-viewer-container"></div>`;

            // Schedule viewer initialization after DOM update
            setTimeout(() => {
                const container = document.getElementById(viewerId);
                if (container) {
                    new JSONReportViewer(result.reportPath, container);
                }
            }, 0);
        }

        // Show raw result if no specific fields matched
        if (html === '<div class="job-result-data">') {
            html += `<pre class="raw-result">${JSON.stringify(result, null, 2)}</pre>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Format job parameters for display
     */
    formatJobParameters(parameters) {
        if (!parameters || Object.keys(parameters).length === 0) return '';

        let html = '<div class="job-params-data">';

        for (const [key, value] of Object.entries(parameters)) {
            const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
            html += `<div class="result-field"><span class="field-label">${key}</span><span class="field-value">${displayValue}</span></div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Format git workflow info
     */
    formatGitInfo(git) {
        let html = '<div class="job-git-data">';

        if (git.branchName) {
            html += `<div class="result-field"><span class="field-label">Branch</span><span class="field-value">${git.branchName}</span></div>`;
        }
        if (git.commitSha) {
            html += `<div class="result-field"><span class="field-label">Commit</span><span class="field-value">${git.commitSha}</span></div>`;
        }
        if (git.prUrl) {
            html += `<div class="result-field"><span class="field-label">PR URL</span><a href="${git.prUrl}" target="_blank" class="field-value">${git.prUrl}</a></div>`;
        }
        if (git.changedFiles && git.changedFiles.length > 0) {
            html += `<div class="result-field"><span class="field-label">Changed Files</span><span class="field-value">${git.changedFiles.join(', ')}</span></div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Format job duration
     */
    formatJobDuration(durationMs) {
        if (!durationMs) return 'N/A';

        const seconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        }

        return `${seconds}s`;
    }

}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        win.dashboardController = new DashboardController();
    });
} else {
    win.dashboardController = new DashboardController();
}
