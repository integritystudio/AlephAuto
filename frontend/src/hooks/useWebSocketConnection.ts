/**
 * useWebSocketConnection Hook
 * React hook for WebSocket connection management
 *
 * Following AnalyticsBot patterns:
 * - Custom hook for service integration
 * - Cleanup on unmount
 * - Initial data loading
 */

import { useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { apiService } from '../services/api';
import { useDashboardStore } from '../store/dashboard';

/**
 * WebSocket Connection Hook
 *
 * Manages WebSocket connection lifecycle and initial data loading.
 * Sets up connection on mount and cleans up on unmount.
 *
 * @example
 * ```tsx
 * function App() {
 *   useWebSocketConnection();
 *   // ... rest of component
 * }
 * ```
 */
export const useWebSocketConnection = () => {
  const isInitialized = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitialized.current) return;
    isInitialized.current = true;

    /**
     * Load initial data from API
     */
    const loadInitialData = async () => {
      try {
        console.log('[Dashboard] Loading initial data...');

        const [systemStatusRes, pipelinesRes, activeJobsRes, queuedJobsRes] =
          await Promise.all([
            apiService.getSystemStatus(),
            apiService.getPipelines(),
            apiService.getActiveJobs(),
            apiService.getQueuedJobs(),
          ]);

        const store = useDashboardStore.getState();

        if (systemStatusRes.success) {
          store.setSystemStatus(systemStatusRes.data);
        }

        if (pipelinesRes.success) {
          store.setPipelines(pipelinesRes.data);
        }

        if (activeJobsRes.success) {
          store.setActiveJobs(activeJobsRes.data.jobs);
        }

        if (queuedJobsRes.success) {
          store.setQueuedJobs(queuedJobsRes.data.jobs);
        }

        console.log('[Dashboard] Initial data loaded');
      } catch (error) {
        console.error('[Dashboard] Failed to load initial data:', error);
      }
    };

    // Load initial data
    loadInitialData();

    // Connect WebSocket
    console.log('[Dashboard] Connecting WebSocket...');
    wsService.connect();

    // Set up polling fallback (every 5 seconds if WebSocket not connected)
    const pollInterval = setInterval(async () => {
      const systemStatus = useDashboardStore.getState().systemStatus;

      if (!systemStatus.websocketConnected) {
        console.log('[Dashboard] Polling for updates (WebSocket disconnected)');

        try {
          const [activeJobsRes, queuedJobsRes] = await Promise.all([
            apiService.getActiveJobs(),
            apiService.getQueuedJobs(),
          ]);

          const store = useDashboardStore.getState();

          if (activeJobsRes.success) {
            store.setActiveJobs(activeJobsRes.data.jobs);
          }

          if (queuedJobsRes.success) {
            store.setQueuedJobs(queuedJobsRes.data.jobs);
          }
        } catch (error) {
          console.error('[Dashboard] Polling failed:', error);
        }
      }
    }, 5000);

    // Cleanup on unmount
    return () => {
      console.log('[Dashboard] Cleaning up...');
      clearInterval(pollInterval);
      wsService.disconnect();
    };
  }, []);
};
