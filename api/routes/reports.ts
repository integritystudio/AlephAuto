/**
 * Report Routes
 *
 * API endpoints for retrieving scan reports.
 */

import express from 'express';
import { createComponentLogger, logError } from '#sidequest/utils/logger.ts';
import { validateQuery } from '../middleware/validation.ts';
import { ReportQuerySchema } from '../types/report-requests.ts';
import fs from 'fs/promises';
import path from 'path';
import { HttpStatus } from '../../shared/constants/http-status.ts';
import { VALIDATION } from '#sidequest/core/constants.ts';
import { sendError, ERROR_CODES } from '../utils/api-error.ts';
import { config } from '#sidequest/core/config.ts';
import { convertMarkdownToHTML, convertJSONToHTML } from '../utils/report-renderers.ts';

const router = express.Router();
const logger = createComponentLogger('ReportRoutes');

const REPORTS_DIR = path.join(config.scanReportsDir, 'reports');

// Ensure reports directory exists at module load (non-blocking)
fs.mkdir(REPORTS_DIR, { recursive: true }).catch(() => {});

/**
 * GET /api/reports
 * List available reports
 */
router.get('/', validateQuery(ReportQuerySchema), async (req, res, next) => {
  try {
    // Query params are now validated by Zod
    const { limit = 20, format, type } = req.query;

    logger.debug({ limit, format, type }, 'Listing reports');

    let files: string[];
    try {
      files = await fs.readdir(REPORTS_DIR);
    } catch {
      res.json({ total: 0, reports: [], timestamp: new Date().toISOString() });
      return;
    }

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
      .slice(0, parseInt(limit as string));

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
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid filename'
        },
        timestamp: new Date().toISOString()
      });
    }

    let reportPath = path.join(REPORTS_DIR, filename);

    // Security: verify resolved path stays within REPORTS_DIR
    const resolvedReportPath = path.resolve(reportPath);
    const resolvedReportsDir = path.resolve(REPORTS_DIR);
    if (!resolvedReportPath.startsWith(resolvedReportsDir + path.sep)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid filename'
        },
        timestamp: new Date().toISOString()
      });
    }

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

        let files: string[];
        try {
          files = await fs.readdir(REPORTS_DIR);
        } catch {
          return res.status(HttpStatus.NOT_FOUND).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Report '${filename}' not found`
            },
            timestamp: new Date().toISOString()
          });
        }

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
          return res.status(HttpStatus.NOT_FOUND).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Report '${filename}' not found`
            },
            timestamp: new Date().toISOString()
          });
        }
      } else {
        logger.warn({ filename }, 'Invalid filename pattern');
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Report '${filename}' not found`
          },
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

    if (reportPath.endsWith('.md')) {
      const html = await convertMarkdownToHTML(content, path.basename(reportPath, '.md'));
      res.type('text/html').send(html);
    } else if (reportPath.endsWith('.json')) {
      const html = convertJSONToHTML(content, path.basename(reportPath));
      res.type('text/html').send(html);
    } else {
      res.type(contentType).send(content);
    }
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
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid filename'
        },
        timestamp: new Date().toISOString()
      });
    }

    const reportPath = path.join(REPORTS_DIR, filename);

    // Security: verify resolved path stays within REPORTS_DIR
    const resolvedReportPath = path.resolve(reportPath);
    const resolvedReportsDir = path.resolve(REPORTS_DIR);
    if (!resolvedReportPath.startsWith(resolvedReportsDir + path.sep)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid filename'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if file exists
    try {
      await fs.access(reportPath);
    } catch {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Report '${filename}' not found`
        },
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

    if (!VALIDATION.JOB_ID_PATTERN.test(scanId)) {
      return sendError(res, ERROR_CODES.INVALID_REQUEST, 'Invalid scanId format', HttpStatus.BAD_REQUEST);
    }

    logger.debug({ scanId }, 'Getting scan summary');

    let files: string[];
    try {
      files = await fs.readdir(REPORTS_DIR);
    } catch {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Summary not found for scan '${scanId}'`
        },
        timestamp: new Date().toISOString()
      });
    }

    const summaryFile = files.find(f =>
      f.includes(scanId) && f.includes('summary') && f.endsWith('.json')
    );

    if (!summaryFile) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Summary not found for scan '${scanId}'`
        },
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
