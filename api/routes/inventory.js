/**
 * Code Inventory Routes
 *
 * API endpoints for fetching repository inventory from GitHub
 */

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import * as Sentry from '@sentry/node';

const router = express.Router();
const logger = createComponentLogger('InventoryRoutes');
const execAsync = promisify(exec);

/**
 * Convert SSH git URL to HTTPS format
 */
function convertToHttpsUrl(url) {
  if (!url) return null;

  // Already HTTPS
  if (url.startsWith('https://')) {
    return url;
  }

  // Convert SSH format: git@github.com:user/repo.git -> https://github.com/user/repo.git
  if (url.startsWith('git@')) {
    return url
      .replace(/^git@/, 'https://')
      .replace(/\.com:/, '.com/');
  }

  // If it's just user/repo format, prepend GitHub
  if (url.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/)) {
    return `https://github.com/${url}.git`;
  }

  return url;
}

/**
 * Fetch repositories from GitHub using gh CLI
 */
async function fetchRepositoriesFromGitHub() {
  try {
    const { stdout } = await execAsync(
      'gh repo list aledlie --limit 1000 --json name,url,description,primaryLanguage,pushedAt,isPrivate,stargazerCount'
    );

    const repos = JSON.parse(stdout);
    return repos;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch repositories from GitHub');
    throw error;
  }
}

/**
 * GET /api/inventory/stats
 * Get repository statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const repos = await fetchRepositoriesFromGitHub();

    // Count by language
    const languageCounts = {};
    repos.forEach(repo => {
      if (repo.primaryLanguage && repo.primaryLanguage.name) {
        const lang = repo.primaryLanguage.name;
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    });

    // Convert to array and sort by count
    const languages = Object.entries(languageCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const stats = {
      totalProjects: repos.length,
      languages: languages,
      privateRepos: repos.filter(r => r.isPrivate).length,
      publicRepos: repos.filter(r => !r.isPrivate).length,
      totalStars: repos.reduce((sum, r) => sum + (r.stargazerCount || 0), 0)
    };

    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get inventory stats');
    Sentry.captureException(error, {
      tags: { component: 'InventoryRoutes', endpoint: '/api/inventory/stats' }
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch repository statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/inventory/projects
 * Get list of all repositories with pagination
 */
router.get('/projects', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const repos = await fetchRepositoriesFromGitHub();

    // Sort by most recently pushed
    repos.sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));

    // Paginate
    const paginatedRepos = repos.slice(offset, offset + limit);

    // Format response with HTTPS URLs
    const data = paginatedRepos.map(repo => ({
      name: repo.name,
      gitRemote: convertToHttpsUrl(repo.url),
      description: repo.description || '',
      language: repo.primaryLanguage?.name || 'Unknown',
      lastPushed: repo.pushedAt,
      isPrivate: repo.isPrivate,
      stars: repo.stargazerCount || 0
    }));

    res.json({
      data,
      pagination: {
        page,
        limit,
        total: repos.length,
        totalPages: Math.ceil(repos.length / limit)
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get inventory projects');
    Sentry.captureException(error, {
      tags: { component: 'InventoryRoutes', endpoint: '/api/inventory/projects' }
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch repository list',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
