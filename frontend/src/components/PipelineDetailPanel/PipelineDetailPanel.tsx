import React, { useEffect, useState, useCallback } from 'react';
import type { Pipeline } from '../../types';
import './PipelineDetailPanel.css';

interface PipelineJob {
  id: string;
  pipelineId: string;
  status: string;
  startTime?: string;
  createdAt: string;
  endTime?: string;
  duration?: number;
  error?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

interface PipelineDetailPanelProps {
  pipeline: Pipeline;
  onClose: () => void;
  onJobClick?: (jobId: string) => void;
}

const STATUS_ICONS: Record<string, string> = {
  completed: '✓',
  failed: '✗',
  running: '▶',
  queued: '…',
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(0)}s`;
};

export const PipelineDetailPanel: React.FC<PipelineDetailPanelProps> = ({ pipeline, onClose, onJobClick }) => {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'recent' | 'failed'>('recent');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '15', tab });
      const res = await fetch(`/api/sidequest/pipeline-runners/${pipeline.id}/jobs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [pipeline.id, tab]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="panel-overlay" onClick={onClose} role="dialog" aria-label={`${pipeline.name} details`}>
      <div className="panel-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="panel-header">
          <div className="panel-title-row">
            <span className="panel-icon">{pipeline.icon}</span>
            <h2 className="panel-title">{pipeline.name}</h2>
            <span className={`panel-status panel-status-${pipeline.status}`}>{pipeline.status}</span>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Stats */}
        <div className="panel-stats">
          <div className="stat-item">
            <span className="stat-label">Total Jobs</span>
            <span className="stat-value">{pipeline.totalJobs ?? 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Success Rate</span>
            <span className="stat-value">{((pipeline.successRate ?? 1) * 100).toFixed(0)}%</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Last Run</span>
            <span className="stat-value">{pipeline.lastRunAt ? formatDate(pipeline.lastRunAt) : 'Never'}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="panel-tabs">
          <button
            className={`panel-tab ${tab === 'recent' ? 'panel-tab-active' : ''}`}
            onClick={() => setTab('recent')}
          >Recent</button>
          <button
            className={`panel-tab ${tab === 'failed' ? 'panel-tab-active' : ''}`}
            onClick={() => setTab('failed')}
          >Failed</button>
        </div>

        {/* Job History */}
        <div className="panel-jobs">
          {loading && <div className="panel-loading">Loading...</div>}
          {error && <div className="panel-error">{error}</div>}
          {!loading && !error && jobs.length === 0 && (
            <div className="panel-empty">No {tab} jobs found</div>
          )}
          {!loading && !error && jobs.map((job) => (
            <div
              key={job.id}
              className={`panel-job panel-job-${job.status}${onJobClick ? ' panel-job-clickable' : ''}`}
              onClick={onJobClick ? () => onJobClick(job.id) : undefined}
              onKeyDown={onJobClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJobClick(job.id); } } : undefined}
              role={onJobClick ? 'button' : undefined}
              tabIndex={onJobClick ? 0 : undefined}
            >
              <span className="job-status-icon">{STATUS_ICONS[job.status] || '?'}</span>
              <div className="job-info">
                <span className="job-id" title={job.id}>{job.id.length > 20 ? job.id.substring(0, 20) + '...' : job.id}</span>
                <span className="job-time">{formatDate(job.createdAt)}</span>
              </div>
              {job.duration != null && (
                <span className="job-duration">{formatDuration(job.duration)}</span>
              )}
              {job.error && (
                <span className="job-error-msg" title={String(job.error.message || '')}>
                  {String(job.error.message || 'Error').substring(0, 40)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
