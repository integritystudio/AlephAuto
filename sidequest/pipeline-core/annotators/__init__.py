"""
Annotators module for semantic analysis of code blocks.

Provides rich semantic metadata extraction for duplicate detection.
"""

from .semantic_annotator import SemanticAnnotation, SemanticAnnotator

__all__ = ['SemanticAnnotation', 'SemanticAnnotator']
