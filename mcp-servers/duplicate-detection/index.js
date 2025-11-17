#!/usr/bin/env node

/**
 * Duplicate Detection MCP Server
 *
 * Model Context Protocol server for duplicate code detection.
 * Exposes tools for scanning repositories, retrieving results, and managing configuration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { CachedScanner } from '../../lib/cache/cached-scanner.js';
import { InterProjectScanner } from '../../lib/inter-project-scanner.js';
import { RepositoryConfigLoader } from '../../lib/config/repository-config-loader.js';
import { ReportCoordinator } from '../../lib/reports/report-coordinator.js';
import { createComponentLogger } from '../../sidequest/logger.js';
import path from 'path';
import fs from 'fs/promises';

const logger = createComponentLogger('DuplicateDetectionMCP');

// Initialize server
const server = new Server({
  name: 'duplicate-detection',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Initialize components
const cachedScanner = new CachedScanner({ cacheEnabled: true });
const interProjectScanner = new InterProjectScanner();
const configLoader = new RepositoryConfigLoader();
const reportCoordinator = new ReportCoordinator(path.join(process.cwd(), 'output', 'reports'));

// Load configuration
try {
  await configLoader.load();
  logger.info('Configuration loaded successfully');
} catch (error) {
  logger.error({ error }, 'Failed to load configuration');
}

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'scan_repository',
        description: 'Scan a single repository for duplicate code. Returns metrics and suggestions for consolidation.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryPath: {
              type: 'string',
              description: 'Absolute path to the repository to scan'
            },
            useCache: {
              type: 'boolean',
              description: 'Use cached results if available (default: true)',
              default: true
            },
            forceRefresh: {
              type: 'boolean',
              description: 'Force a fresh scan, ignoring cache (default: false)',
              default: false
            }
          },
          required: ['repositoryPath']
        }
      },
      {
        name: 'scan_multiple_repositories',
        description: 'Perform inter-project scan across multiple repositories to find cross-repository duplicates.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryPaths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of absolute paths to repositories'
            },
            groupName: {
              type: 'string',
              description: 'Optional name for this repository group'
            }
          },
          required: ['repositoryPaths']
        }
      },
      {
        name: 'get_scan_results',
        description: 'Retrieve results from a completed scan by scan ID.',
        inputSchema: {
          type: 'object',
          properties: {
            scanId: {
              type: 'string',
              description: 'Scan ID from a previous scan'
            },
            format: {
              type: 'string',
              enum: ['json', 'summary'],
              description: 'Result format (default: summary)',
              default: 'summary'
            }
          },
          required: ['scanId']
        }
      },
      {
        name: 'list_repositories',
        description: 'List all configured repositories available for scanning.',
        inputSchema: {
          type: 'object',
          properties: {
            enabledOnly: {
              type: 'boolean',
              description: 'Show only enabled repositories (default: true)',
              default: true
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Filter by priority'
            }
          }
        }
      },
      {
        name: 'get_suggestions',
        description: 'Get consolidation suggestions for duplicates found in a scan.',
        inputSchema: {
          type: 'object',
          properties: {
            scanId: {
              type: 'string',
              description: 'Scan ID'
            },
            minImpactScore: {
              type: 'number',
              description: 'Minimum impact score (0-100)',
              default: 50
            },
            strategy: {
              type: 'string',
              enum: ['local_util', 'shared_package', 'mcp_server', 'autonomous_agent'],
              description: 'Filter by consolidation strategy'
            }
          },
          required: ['scanId']
        }
      },
      {
        name: 'get_cache_status',
        description: 'Check if a repository scan is cached and get cache metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryPath: {
              type: 'string',
              description: 'Absolute path to repository'
            }
          },
          required: ['repositoryPath']
        }
      },
      {
        name: 'invalidate_cache',
        description: 'Invalidate cached scan results for a repository.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryPath: {
              type: 'string',
              description: 'Absolute path to repository'
            }
          },
          required: ['repositoryPath']
        }
      },
      {
        name: 'get_repository_groups',
        description: 'List configured repository groups for inter-project scanning.',
        inputSchema: {
          type: 'object',
          properties: {
            enabledOnly: {
              type: 'boolean',
              description: 'Show only enabled groups (default: true)',
              default: true
            }
          }
        }
      }
    ]
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    logger.info({ toolName: name, arguments: args }, 'Tool called');

    switch (name) {
      case 'scan_repository':
        return await handleScanRepository(args);

      case 'scan_multiple_repositories':
        return await handleScanMultipleRepositories(args);

      case 'get_scan_results':
        return await handleGetScanResults(args);

      case 'list_repositories':
        return await handleListRepositories(args);

      case 'get_suggestions':
        return await handleGetSuggestions(args);

      case 'get_cache_status':
        return await handleGetCacheStatus(args);

      case 'invalidate_cache':
        return await handleInvalidateCache(args);

      case 'get_repository_groups':
        return await handleGetRepositoryGroups(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error({ error, toolName: name }, 'Tool execution failed');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }, null, 2)
      }],
      isError: true
    };
  }
});

/**
 * Handle scan_repository tool
 */
async function handleScanRepository(args) {
  const { repositoryPath, useCache = true, forceRefresh = false } = args;

  logger.info({ repositoryPath, useCache, forceRefresh }, 'Scanning repository');

  const result = await cachedScanner.scanRepository(repositoryPath, {
    forceRefresh: forceRefresh || !useCache
  });

  const summary = {
    success: true,
    scan_id: result.scan_metadata.scan_id,
    repository: repositoryPath,
    from_cache: result.scan_metadata.from_cache || false,
    metrics: {
      duplicate_groups: result.metrics.total_duplicate_groups || 0,
      suggestions: result.metrics.total_suggestions || 0,
      duplicated_lines: result.metrics.total_duplicated_lines || 0
    },
    top_suggestions: (result.consolidation_suggestions || [])
      .slice(0, 5)
      .map(s => ({
        id: s.suggestion_id,
        strategy: s.strategy,
        impact_score: s.duplicate_group?.impact_score || 0,
        roi_score: s.roi_score
      }))
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(summary, null, 2)
    }]
  };
}

/**
 * Handle scan_multiple_repositories tool
 */
async function handleScanMultipleRepositories(args) {
  const { repositoryPaths, groupName } = args;

  logger.info({
    repositoryCount: repositoryPaths.length,
    groupName
  }, 'Scanning multiple repositories');

  const result = await interProjectScanner.scanRepositories(repositoryPaths);

  const summary = {
    success: true,
    scan_id: result.scan_metadata.scan_id,
    group_name: groupName,
    repositories: repositoryPaths.length,
    metrics: {
      total_code_blocks: result.metrics.total_code_blocks,
      cross_repo_duplicates: result.metrics.total_cross_repository_groups,
      suggestions: result.metrics.total_suggestions,
      duplicated_lines: result.metrics.cross_repository_duplicated_lines
    },
    top_duplicates: (result.cross_repository_duplicates || [])
      .slice(0, 5)
      .map(d => ({
        id: d.group_id,
        repositories: d.repositories,
        occurrences: d.occurrence_count,
        impact_score: d.impact_score
      }))
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(summary, null, 2)
    }]
  };
}

/**
 * Handle get_scan_results tool
 */
async function handleGetScanResults(args) {
  const { scanId, format = 'summary' } = args;

  logger.info({ scanId, format }, 'Retrieving scan results');

  // Try to find the scan result file
  const outputDir = path.join(process.cwd(), 'output', 'reports');
  const files = await fs.readdir(outputDir);

  const resultFile = files.find(f => f.includes(scanId) && f.endsWith('.json'));

  if (!resultFile) {
    throw new Error(`Scan results not found for ID: ${scanId}`);
  }

  const resultPath = path.join(outputDir, resultFile);
  const resultContent = await fs.readFile(resultPath, 'utf-8');
  const result = JSON.parse(resultContent);

  if (format === 'summary') {
    const summary = {
      scan_id: result.scan_metadata?.scan_id,
      scan_type: result.scan_type,
      scanned_at: result.scan_metadata?.scanned_at,
      duration: result.scan_metadata?.duration_seconds,
      metrics: result.metrics
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(summary, null, 2)
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: resultContent
    }]
  };
}

/**
 * Handle list_repositories tool
 */
async function handleListRepositories(args) {
  const { enabledOnly = true, priority } = args;

  logger.info({ enabledOnly, priority }, 'Listing repositories');

  let repositories = enabledOnly
    ? configLoader.getEnabledRepositories()
    : configLoader.getAllRepositories();

  if (priority) {
    repositories = repositories.filter(r => r.priority === priority);
  }

  const repoList = repositories.map(r => ({
    name: r.name,
    path: r.path,
    priority: r.priority,
    scan_frequency: r.scanFrequency,
    enabled: r.enabled,
    last_scanned: r.lastScannedAt,
    tags: r.tags || []
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        total: repoList.length,
        repositories: repoList
      }, null, 2)
    }]
  };
}

/**
 * Handle get_suggestions tool
 */
async function handleGetSuggestions(args) {
  const { scanId, minImpactScore = 50, strategy } = args;

  logger.info({ scanId, minImpactScore, strategy }, 'Retrieving suggestions');

  // Get scan results
  const { content } = await handleGetScanResults({ scanId, format: 'json' });
  const result = JSON.parse(content[0].text);

  let suggestions = result.consolidation_suggestions || [];

  // Filter by impact score
  suggestions = suggestions.filter(s =>
    (s.duplicate_group?.impact_score || 0) >= minImpactScore
  );

  // Filter by strategy
  if (strategy) {
    suggestions = suggestions.filter(s => s.strategy === strategy);
  }

  const suggestionList = suggestions.map(s => ({
    id: s.suggestion_id,
    strategy: s.strategy,
    target_location: s.target_location,
    complexity: s.complexity,
    risk: s.migration_risk,
    effort_hours: s.estimated_effort_hours,
    roi_score: s.roi_score,
    impact_score: s.duplicate_group?.impact_score || 0,
    rationale: s.strategy_rationale
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        total: suggestionList.length,
        suggestions: suggestionList
      }, null, 2)
    }]
  };
}

/**
 * Handle get_cache_status tool
 */
async function handleGetCacheStatus(args) {
  const { repositoryPath } = args;

  logger.info({ repositoryPath }, 'Getting cache status');

  const status = await cachedScanner.getCacheStatus(repositoryPath);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(status, null, 2)
    }]
  };
}

/**
 * Handle invalidate_cache tool
 */
async function handleInvalidateCache(args) {
  const { repositoryPath } = args;

  logger.info({ repositoryPath }, 'Invalidating cache');

  const deletedCount = await cachedScanner.invalidateCache(repositoryPath);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        repository: repositoryPath,
        cache_entries_deleted: deletedCount
      }, null, 2)
    }]
  };
}

/**
 * Handle get_repository_groups tool
 */
async function handleGetRepositoryGroups(args) {
  const { enabledOnly = true } = args;

  logger.info({ enabledOnly }, 'Listing repository groups');

  const groups = enabledOnly
    ? configLoader.getEnabledGroups()
    : configLoader.getAllGroups();

  const groupList = groups.map(g => ({
    name: g.name,
    description: g.description,
    scan_type: g.scanType,
    enabled: g.enabled,
    repositories: g.repositories
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        total: groupList.length,
        groups: groupList
      }, null, 2)
    }]
  };
}

/**
 * List available resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'scan://recent',
        name: 'Recent Scans',
        mimeType: 'application/json',
        description: 'List of recent duplicate detection scans'
      },
      {
        uri: 'scan://config',
        name: 'Repository Configuration',
        mimeType: 'application/json',
        description: 'Current repository scanning configuration'
      },
      {
        uri: 'scan://stats',
        name: 'Scanner Statistics',
        mimeType: 'application/json',
        description: 'Duplicate detection scanner statistics'
      }
    ]
  };
});

/**
 * Read resource contents
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  logger.info({ uri }, 'Reading resource');

  try {
    switch (uri) {
      case 'scan://recent':
        return await getRecentScans();

      case 'scan://config':
        return await getConfiguration();

      case 'scan://stats':
        return await getStatistics();

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    logger.error({ error, uri }, 'Failed to read resource');
    throw error;
  }
});

/**
 * Get recent scans
 */
async function getRecentScans() {
  const outputDir = path.join(process.cwd(), 'output', 'reports');

  try {
    const files = await fs.readdir(outputDir);
    const summaryFiles = files
      .filter(f => f.endsWith('-summary.json'))
      .sort()
      .reverse()
      .slice(0, 10);

    const recentScans = [];

    for (const file of summaryFiles) {
      const content = await fs.readFile(path.join(outputDir, file), 'utf-8');
      const summary = JSON.parse(content);
      recentScans.push(summary);
    }

    return {
      contents: [{
        uri: 'scan://recent',
        mimeType: 'application/json',
        text: JSON.stringify(recentScans, null, 2)
      }]
    };
  } catch (error) {
    return {
      contents: [{
        uri: 'scan://recent',
        mimeType: 'application/json',
        text: JSON.stringify({ error: error.message }, null, 2)
      }]
    };
  }
}

/**
 * Get configuration
 */
async function getConfiguration() {
  const config = {
    scan_config: configLoader.getScanConfig(),
    cache_config: configLoader.config?.cacheConfig || {},
    repository_count: configLoader.getAllRepositories().length,
    enabled_repositories: configLoader.getEnabledRepositories().length,
    group_count: configLoader.getAllGroups().length
  };

  return {
    contents: [{
      uri: 'scan://config',
      mimeType: 'application/json',
      text: JSON.stringify(config, null, 2)
    }]
  };
}

/**
 * Get statistics
 */
async function getStatistics() {
  const stats = await cachedScanner.getStats();

  return {
    contents: [{
      uri: 'scan://stats',
      mimeType: 'application/json',
      text: JSON.stringify(stats, null, 2)
    }]
  };
}

/**
 * Start server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Duplicate Detection MCP server running');
}

main().catch((error) => {
  logger.error({ error }, 'Server error');
  process.exit(1);
});
