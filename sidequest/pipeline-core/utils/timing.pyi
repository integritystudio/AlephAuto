"""Type stubs for timing module."""

from dataclasses import dataclass


@dataclass
class TimingMetrics:
    """Collected timing metrics for a processing stage."""

    stage_name: str
    total_ms: float
    count: int
    min_ms: float
    max_ms: float

    def record(self, duration_ms: float) -> None: ...
    @property
    def avg_ms(self) -> float: ...
    def to_dict(self) -> dict: ...


class Timer:
    """Context manager for timing code blocks."""

    def __init__(self, metrics: TimingMetrics | None = ...) -> None: ...
    @property
    def elapsed_ms(self) -> float: ...
    def __enter__(self) -> Timer: ...
    def __exit__(self, *args) -> None: ...
