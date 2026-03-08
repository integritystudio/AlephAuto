import React, { useEffect, useState, useCallback } from 'react';
import './JobLogsModal.css';

interface JobLogsModalProps {
  jobId: string;
  onClose: () => void;
}

interface JobDetail {
  id: string;
  pipelineId: string;
  pipelineName?: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: unknown;
  result?: Record<string, unknown>;
}

export const JobLogsModal: React.FC<JobLogsModalProps> = ({ jobId, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, jobRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/logs`),
        fetch(`/api/jobs/${jobId}`),
      ]);

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.data?.logs || []);
      }

      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJob(jobData.data || null);
      }

      if (!logsRes.ok && !jobRes.ok) {
        throw new Error('Failed to load job data');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="logs-overlay" onClick={onClose} role="dialog" aria-label={`Logs for job ${jobId}`}>
      <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="logs-header">
          <div>
            <h2 className="logs-title">Job Logs</h2>
            <span className="logs-job-id" title={jobId}>{jobId}</span>
          </div>
          <button className="logs-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Job metadata */}
        {job && (
          <div className="logs-meta">
            <span className="logs-meta-item">
              <strong>Pipeline:</strong> {job.pipelineName || job.pipelineId}
            </span>
            <span className={`logs-meta-status logs-status-${job.status}`}>
              {job.status}
            </span>
          </div>
        )}

        {/* Log output */}
        <div className="logs-body">
          {loading && <div className="logs-loading">Loading logs...</div>}
          {error && <div className="logs-error">{error}</div>}
          {!loading && !error && logs.length === 0 && (
            <div className="logs-empty">No log entries available</div>
          )}
          {!loading && !error && logs.length > 0 && (
            <pre className="logs-output">{logs.map((line, i) => (
              <div key={i} className="log-line">
                <span className="log-line-num">{i + 1}</span>
                <span className="log-line-text">{line}</span>
              </div>
            ))}</pre>
          )}
        </div>
      </div>
    </div>
  );
};
