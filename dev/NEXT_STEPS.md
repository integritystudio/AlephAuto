# Code Consolidation System - Next Steps

## Objective
Build an automated system combining ast-grep, pydantic, schema-org, and repomix to efficiently scan for duplicate logical code blocks that can be consolidated. Start with intra-project scanning, then expand to inter-project analysis for abstraction into utils/tools/MCPs/agents. Run 5-10 repositories per night via cron.

## Phase 1: Research & Design

1. **Research and design: Analyze ast-grep capabilities for multi-language AST pattern matching**
   - Understand supported languages and pattern syntax
   - Evaluate structural vs semantic matching capabilities
   - Test sample patterns for common code duplicates

2. **Research and design: Evaluate pydantic for structuring duplicate detection results and metadata**
   - Define data models for code blocks, duplicates, and suggestions
   - Plan validation rules and serialization formats
   - Consider integration with existing logging systems

3. **Research and design: Determine how schema-org can annotate code blocks with semantic metadata**
   - Define vocabulary for code block types (utility, helper, validator, etc.)
   - Plan semantic categorization strategy
   - Design annotation schema for consolidation recommendations

4. **Research and design: Understand repomix's role in context aggregation and repository scanning**
   - Review existing repomix configuration
   - Plan integration with duplicate detection pipeline
   - Evaluate performance for large-scale scanning

5. **Design system architecture: Create data flow diagram for duplicate detection pipeline**
   - Map data flow from repository scan to consolidation report
   - Define component interfaces and responsibilities
   - Plan error handling and recovery strategies

6. **Design duplicate detection algorithm: Define similarity thresholds and matching criteria**
   - Establish structural similarity metrics
   - Define semantic equivalence criteria
   - Set confidence thresholds for consolidation suggestions

## Phase 2: Core Implementation

7. **Create pydantic models for CodeBlock, DuplicateGroup, and ConsolidationSuggestion**
   - CodeBlock: location, AST structure, semantic tags, hash
   - DuplicateGroup: member blocks, similarity score, consolidation target
   - ConsolidationSuggestion: strategy (local/shared/MCP/agent), impact score, migration path
   - ScanReport: repository info, duplicate groups, metrics, recommendations

8. **Build ast-grep pattern library for common duplicate patterns (utilities, helpers, validators)**
   - Authentication helpers
   - Validation functions
   - API request utilities
   - Data transformation helpers
   - Error handling patterns

9. **Implement intra-project scanner: Detect duplicates within single repository**
   - Parse repository using ast-grep
   - Extract code blocks with structural patterns
   - Compare blocks for similarity
   - Group duplicates by similarity threshold
   - Generate consolidation suggestions

10. **Implement inter-project scanner: Detect duplicates across multiple repositories**
    - Aggregate code blocks from multiple repos
    - Perform cross-repository similarity analysis
    - Identify candidates for shared abstractions
    - Recommend consolidation tier (shared package vs MCP vs agent)

11. **Build consolidation recommendation engine with abstraction strategy suggestions**
    - Score duplicates by frequency and impact
    - Suggest consolidation tier based on usage patterns:
      - Local utils: Used within 1 project
      - Shared package: Used across 2-3 projects
      - MCP server: Cross-language or tool-level abstraction needed
      - Autonomous agent: Complex logic requiring orchestration
    - Generate migration steps and code examples

12. **Create reporting system that generates actionable consolidation reports**
    - JSON output with structured recommendations
    - HTML dashboard with visualizations
    - Priority ranking based on impact scores
    - Track consolidation history and metrics

## Phase 3: Automation

13. **Build cron job scheduler to process 5-10 repositories per night**
    - Configure cron schedule (e.g., 2 AM daily)
    - Implement repository selection logic
    - Add resource throttling and rate limiting
    - Log execution times and resource usage

14. **Implement job queue system with retry logic and progress tracking**
    - Queue repositories with priority levels
    - Handle failures with exponential backoff
    - Track progress per repository
    - Store intermediate results

15. **Create configuration system for repository selection and scanning priorities**
    - Define repository lists and scanning frequency
    - Set priority rules (activity level, size, last scan date)
    - Configure exclusion patterns and ignore rules
    - Manage scanning quotas and limits

16. **Build MCP server interface for external tool integration**
    - Expose duplicate detection as MCP tool
    - Provide query interface for on-demand scans
    - Support streaming results for large repositories
    - Enable integration with other automation tools

17. **Add logging and monitoring for nightly scan jobs with Sentry integration**
    - Log scan progress and results
    - Track error rates and failure patterns
    - Monitor resource usage and performance
    - Set up alerts for scan failures

## Phase 4: Validation & Documentation

18. **Create test suite for duplicate detection accuracy and false positive rates**
    - Build test repository with known duplicates
    - Measure precision and recall
    - Test edge cases and boundary conditions
    - Validate across different languages and patterns

19. **Write documentation for system architecture, usage, and consolidation workflows**
    - System architecture diagram
    - API documentation for MCP interface
    - Consolidation workflow guides
    - Configuration reference
    - Troubleshooting guide

20. **Run pilot scan on 3 repositories and validate results**
    - Select representative repositories
    - Execute full scan pipeline
    - Review duplicate detection accuracy
    - Validate consolidation recommendations
    - Gather feedback and iterate

## Key Technical Decisions

### Duplicate Detection Strategy
- Use ast-grep to extract semantic patterns
- Compare using structural similarity (not just string matching)
- Apply configurable similarity thresholds
- Consider semantic context and usage patterns

### Consolidation Tiers
1. **Local utils**: Single-project utilities
2. **Shared package**: Cross-project shared library
3. **MCP server**: Tool-level abstraction for external integration
4. **Autonomous agent**: Complex orchestration requiring AI

### Nightly Processing
- Stagger repo scans to avoid resource spikes
- Prioritize active repos and recently modified code
- Process 5-10 repos per night initially
- Scale up based on performance metrics

### Output Format
- JSON reports with actionable suggestions
- HTML dashboards for visualization
- Impact scores for prioritization
- Migration paths with code examples

## Success Metrics

- Number of duplicate groups detected
- Consolidation recommendations accepted
- Code reduction percentage
- Time saved in development
- False positive rate < 10%
- Scan completion rate > 95%

## Next Action

Begin with Phase 1, Task 1: Research ast-grep capabilities and test pattern matching on sample repositories.
