/**
 * AlephAuto Dashboard - Real-time Pipeline Monitoring
 *
 * Features:
 * - WebSocket connection for real-time updates
 * - REST API integration for status fetching
 * - Automatic reconnection with exponential backoff
 * - Event batching to prevent UI flicker
 */

class DashboardController {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.eventQueue = [];
        this.batchTimeout = null;
        this.apiBaseUrl = window.location.origin;

        this.init();
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
                const statusResponse = await fetch(`${this.apiBaseUrl}/api/status`);
                if (statusResponse.ok) {
                    const statusContentType = statusResponse.headers.get('content-type');
                    if (statusContentType && statusContentType.includes('application/json')) {
                        const statusData = await statusResponse.json();
                        this.renderInitialStatus(statusData);
                    } else {
                        this.showMockData();
                    }
                } else {
                    this.showMockData();
                }
            } catch (err) {
                console.warn('Detailed status not available, showing mock data');
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
        if (data.pipelines) {
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
        const container = document.getElementById('pipelineCards');

        if (!pipelines || pipelines.length === 0) {
            container.innerHTML = '<p class="empty-state">No pipelines configured</p>';
            return;
        }

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
        const { active = [], queued = [], capacity = 0 } = queue;

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
            });
        });
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

        container.innerHTML = jobs.map(job => {
            const hasResult = job.result && (job.result.output || job.result.error);
            const hasStats = job.result?.stats;

            return `
                <div class="panel-job-item">
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
                        ${job.parameters?.repositoryPath ? `
                            <div class="panel-job-meta-row">
                                <span class="meta-label">Repository:</span>
                                <span style="font-size: 11px; word-break: break-all;">${job.parameters.repositoryPath}</span>
                            </div>
                        ` : ''}
                    </div>
                    ${hasResult ? `
                        <div class="panel-job-result">
                            ${job.result.output ? `
                                <div class="result-output">${job.result.output}</div>
                            ` : ''}
                            ${job.result.error ? `
                                <div class="result-error">${job.result.error}</div>
                            ` : ''}
                            ${hasStats ? `
                                <div class="result-stats">
                                    ${job.result.stats.filesScanned !== undefined ? `
                                        <div class="result-stat">
                                            <span class="result-stat-label">Files</span>
                                            <span class="result-stat-value">${job.result.stats.filesScanned}</span>
                                        </div>
                                    ` : ''}
                                    ${job.result.stats.duplicatesFound !== undefined ? `
                                        <div class="result-stat">
                                            <span class="result-stat-label">Duplicates</span>
                                            <span class="result-stat-value">${job.result.stats.duplicatesFound}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
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
        new DashboardController();
    });
} else {
    new DashboardController();
}
