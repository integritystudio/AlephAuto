"""
Timing utilities for performance metrics.

Provides timing collection for semantic annotation and grouping stages
when PIPELINE_DEBUG=1 is set.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class TimingMetrics:
    """Collected timing metrics for a processing stage.

    Tracks timing statistics including count, total, min, max, and average
    durations for a named processing stage.

    Attributes:
        stage_name: Name of the processing stage
        total_ms: Cumulative time in milliseconds
        count: Number of recorded durations
        min_ms: Minimum recorded duration
        max_ms: Maximum recorded duration
    """

    stage_name: str
    total_ms: float = 0.0
    count: int = 0
    min_ms: float = field(default=float('inf'))
    max_ms: float = 0.0

    def record(self, duration_ms: float) -> None:
        """Record a timing measurement.

        Args:
            duration_ms: Duration in milliseconds to record
        """
        self.total_ms += duration_ms
        self.count += 1
        self.min_ms = min(self.min_ms, duration_ms)
        self.max_ms = max(self.max_ms, duration_ms)

    @property
    def avg_ms(self) -> float:
        """Calculate average duration in milliseconds."""
        if self.count == 0:
            return 0.0
        return self.total_ms / self.count

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            'stage_name': self.stage_name,
            'total_ms': round(self.total_ms, 2),
            'count': self.count,
            'avg_ms': round(self.avg_ms, 2),
            'min_ms': round(self.min_ms, 2) if self.count > 0 else 0.0,
            'max_ms': round(self.max_ms, 2),
        }


class Timer:
    """Context manager for timing code blocks.

    Usage:
        metrics = TimingMetrics('my_stage')
        with Timer(metrics):
            # code to time
            pass
        print(f"Took {metrics.avg_ms}ms")

        # Or without metrics collection:
        with Timer() as t:
            # code to time
            pass
        print(f"Took {t.elapsed_ms}ms")
    """

    def __init__(self, metrics: TimingMetrics | None = None) -> None:
        """Initialize timer.

        Args:
            metrics: Optional TimingMetrics to record duration to
        """
        self._metrics = metrics
        self._start_time: float = 0.0
        self._elapsed_ms: float = 0.0

    @property
    def elapsed_ms(self) -> float:
        """Get elapsed time in milliseconds."""
        return self._elapsed_ms

    def __enter__(self) -> Timer:
        """Start timing."""
        self._start_time = time.perf_counter()
        return self

    def __exit__(self, *args) -> None:
        """Stop timing and record to metrics if provided."""
        end_time = time.perf_counter()
        self._elapsed_ms = (end_time - self._start_time) * 1000

        if self._metrics is not None:
            self._metrics.record(self._elapsed_ms)
