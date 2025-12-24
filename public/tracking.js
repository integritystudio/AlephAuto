// @ts-check

/**
 * Google Analytics / GTM Tracking Utility
 *
 * Provides helper functions for tracking events via GTM dataLayer.
 * GTM Container: GTM-NR4GGH5K
 * GA4 Measurement ID: G-J7TL7PQH7S
 */

/**
 * @typedef {Window & { dataLayer?: Object[], AlephTracking?: Object }} TrackingWindow
 */

/** @type {TrackingWindow} */
const trackingWindow = window;

// Ensure dataLayer exists
trackingWindow.dataLayer = trackingWindow.dataLayer || [];

/**
 * Push an event to the GTM dataLayer
 * @param {string} eventName - GA4 event name (e.g., 'pipeline_triggered', 'job_viewed')
 * @param {Object} eventParams - Additional event parameters
 */
function trackEvent(eventName, eventParams = {}) {
    trackingWindow.dataLayer?.push({
        event: eventName,
        ...eventParams
    });
}

/**
 * Track pipeline interactions
 * @param {string} action - 'view', 'trigger', 'expand'
 * @param {string} pipelineId - Pipeline identifier
 * @param {Object} additionalParams - Extra parameters
 */
function trackPipeline(action, pipelineId, additionalParams = {}) {
    trackEvent('pipeline_interaction', {
        pipeline_action: action,
        pipeline_id: pipelineId,
        ...additionalParams
    });
}

/**
 * Track job interactions
 * @param {string} action - 'view', 'retry', 'cancel'
 * @param {string} jobId - Job identifier
 * @param {string} pipelineId - Parent pipeline
 * @param {Object} additionalParams - Extra parameters
 */
function trackJob(action, jobId, pipelineId, additionalParams = {}) {
    trackEvent('job_interaction', {
        job_action: action,
        job_id: jobId,
        pipeline_id: pipelineId,
        ...additionalParams
    });
}

/**
 * Track documentation tab views
 * @param {string} tabName - Tab identifier
 */
function trackDocTab(tabName) {
    trackEvent('doc_tab_view', {
        tab_name: tabName
    });
}

/**
 * Track panel interactions
 * @param {string} action - 'open', 'close', 'tab_switch'
 * @param {string} panelName - Panel identifier
 * @param {Object} additionalParams - Extra parameters
 */
function trackPanel(action, panelName, additionalParams = {}) {
    trackEvent('panel_interaction', {
        panel_action: action,
        panel_name: panelName,
        ...additionalParams
    });
}

/**
 * Track errors for debugging
 * @param {string} errorType - Error category
 * @param {string} errorMessage - Error description
 * @param {Object} additionalParams - Extra context
 */
function trackError(errorType, errorMessage, additionalParams = {}) {
    trackEvent('dashboard_error', {
        error_type: errorType,
        error_message: errorMessage,
        ...additionalParams
    });
}

/**
 * Track WebSocket connection status changes
 * @param {string} status - 'connected', 'disconnected', 'error'
 */
function trackConnectionStatus(status) {
    trackEvent('websocket_status', {
        connection_status: status,
        timestamp: new Date().toISOString()
    });
}

// Export for use in dashboard.js
trackingWindow.AlephTracking = {
    trackEvent,
    trackPipeline,
    trackJob,
    trackDocTab,
    trackPanel,
    trackError,
    trackConnectionStatus
};
