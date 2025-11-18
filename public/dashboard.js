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
    }

    /**
     * Fetch initial status from REST API
     */
    async fetchInitialStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            const data = await response.json();

            if (data.status === 'healthy') {
                this.updateSystemStatus('healthy', 'System Healthy');
            }

            // Try to fetch detailed status if available
            try {
                const statusResponse = await fetch(`${this.apiBaseUrl}/api/status`);
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    this.renderInitialStatus(statusData);
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
        // Mock pipeline data
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
                name: 'Documentation Enhancement',
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
                message: 'Documentation Enhancement job queued',
                timestamp: new Date(Date.now() - 7200000).toISOString()
            }
        ];

        this.renderActivity(mockActivity);
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws`;
        console.log('Connecting to WebSocket:', wsUrl);

        this.updateSystemStatus('connecting', 'Connecting...');

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

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateSystemStatus('error', 'Connection Error');
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.updateSystemStatus('connecting', 'Reconnecting...');
                this.scheduleReconnect();
            };

        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.updateSystemStatus('error', 'Connection Failed');
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule WebSocket reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.updateSystemStatus('error', 'Connection Lost');
            this.addActivity('error', 'WebSocket connection lost after multiple attempts');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
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
                    break;
                case 'job:started':
                    this.addActivity('info', `Job started: ${event.job.name || event.job.id}`);
                    break;
                case 'job:completed':
                    this.addActivity('success', `Job completed: ${event.job.name || event.job.id}`);
                    break;
                case 'job:failed':
                    this.addActivity('error', `Job failed: ${event.job.name || event.job.id}`);
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
     * Format relative time
     */
    formatRelativeTime(isoString) {
        if (!isoString) return 'Never';

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
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
                const targetDoc = tab.dataset.doc;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active panel
                panels.forEach(panel => {
                    if (panel.dataset.panel === targetDoc) {
                        panel.classList.add('active');
                    } else {
                        panel.classList.remove('active');
                    }
                });
            });
        });
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
