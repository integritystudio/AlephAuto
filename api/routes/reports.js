/**
 * Report Routes
 *
 * API endpoints for retrieving scan reports.
 */

import express from 'express';
import { createComponentLogger } from '../../sidequest/utils/logger.js';
import { validateQuery } from '../middleware/validation.js';
import { ReportQuerySchema } from '../types/report-requests.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const logger = createComponentLogger('ReportRoutes');

const REPORTS_DIR = path.join(process.cwd(), 'output', 'reports');

/**
 * GET /api/reports
 * List available reports
 */
router.get('/', validateQuery(ReportQuerySchema), async (req, res, next) => {
  try {
    // Query params are now validated by Zod
    const { limit = 20, format, type } = req.query;

    logger.debug({ limit, format, type }, 'Listing reports');

    const files = await fs.readdir(REPORTS_DIR);

    let reportFiles = files;

    // Filter by format
    if (format) {
      const ext = format === 'html' ? '.html' : format === 'markdown' ? '.md' : '.json';
      reportFiles = reportFiles.filter(f => f.endsWith(ext));
    }

    // Filter by type
    if (type) {
      reportFiles = reportFiles.filter(f =>
        type === 'summary' ? f.includes('summary') : !f.includes('summary')
      );
    }

    // Sort by newest first
    const filesWithStats = await Promise.all(
      reportFiles.map(async (file) => {
        const filePath = path.join(REPORTS_DIR, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );

    const sortedFiles = filesWithStats
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .slice(0, parseInt(limit));

    const reports = sortedFiles.map(f => ({
      name: f.name,
      url: `/api/reports/${encodeURIComponent(f.name)}`,
      size: f.size,
      created: f.created,
      modified: f.modified,
      format: f.name.endsWith('.html') ? 'html' :
              f.name.endsWith('.md') ? 'markdown' : 'json',
      type: f.name.includes('summary') ? 'summary' : 'full'
    }));

    res.json({
      total: reports.length,
      reports,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:filename
 * Get a specific report
 */
router.get('/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;

    logger.info({ filename }, 'Retrieving report');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid filename',
        timestamp: new Date().toISOString()
      });
    }

    let reportPath = path.join(REPORTS_DIR, filename);

    // Check if exact file exists
    try {
      await fs.access(reportPath);
      logger.debug({ filename, reportPath }, 'Found exact report match');
    } catch {
      // Try pattern matching: extract job type and extension
      // Pattern: {jobType}-{jobId/timestamp}.{ext}
      // Job type can be single word (repomix) or hyphenated (claude-health, git-activity)
      const match = filename.match(/^([a-z]+(?:-[a-z]+)*)-.*\.(html|json|md)$/);

      if (match) {
        const [, jobType, ext] = match;

        try {
          const files = await fs.readdir(REPORTS_DIR);

          // Find files matching the job type and extension
          const matchingFiles = files.filter(f =>
            f.startsWith(`${jobType}-`) && f.endsWith(`.${ext}`)
          ).sort().reverse(); // Most recent first

          if (matchingFiles.length > 0) {
            reportPath = path.join(REPORTS_DIR, matchingFiles[0]);
            logger.info({
              filename,
              resolvedTo: matchingFiles[0],
              totalMatches: matchingFiles.length
            }, 'Resolved report via pattern matching');
          } else {
            logger.warn({ filename, jobType, ext }, 'No matching reports found');
            return res.status(404).json({
              error: 'Not Found',
              message: `Report '${filename}' not found`,
              timestamp: new Date().toISOString()
            });
          }
        } catch (readErr) {
          logger.error({ error: readErr }, 'Failed to read reports directory');
          throw readErr;
        }
      } else {
        logger.warn({ filename }, 'Invalid filename pattern');
        return res.status(404).json({
          error: 'Not Found',
          message: `Report '${filename}' not found`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Determine content type
    let contentType = 'application/json';
    if (reportPath.endsWith('.html')) {
      contentType = 'text/html';
    } else if (reportPath.endsWith('.md')) {
      contentType = 'text/markdown';
    }

    // Read and send file
    const content = await fs.readFile(reportPath, 'utf-8');

    res.type(contentType).send(content);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/reports/:filename
 * Delete a report
 */
router.delete('/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;

    logger.info({ filename }, 'Deleting report');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid filename',
        timestamp: new Date().toISOString()
      });
    }

    const reportPath = path.join(REPORTS_DIR, filename);

    // Check if file exists
    try {
      await fs.access(reportPath);
    } catch {
      return res.status(404).json({
        error: 'Not Found',
        message: `Report '${filename}' not found`,
        timestamp: new Date().toISOString()
      });
    }

    // Delete file
    await fs.unlink(reportPath);

    res.json({
      success: true,
      message: `Report '${filename}' deleted successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:scanId/summary
 * Get scan summary
 */
router.get('/:scanId/summary', async (req, res, next) => {
  try {
    const { scanId } = req.params;

    logger.debug({ scanId }, 'Getting scan summary');

    const files = await fs.readdir(REPORTS_DIR);
    const summaryFile = files.find(f =>
      f.includes(scanId) && f.includes('summary') && f.endsWith('.json')
    );

    if (!summaryFile) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Summary not found for scan '${scanId}'`,
        timestamp: new Date().toISOString()
      });
    }

    const summaryPath = path.join(REPORTS_DIR, summaryFile);
    const content = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(content);

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
