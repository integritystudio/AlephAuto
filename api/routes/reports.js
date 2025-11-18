/**
 * Report Routes
 *
 * API endpoints for retrieving scan reports.
 */

import express from 'express';
import { createComponentLogger } from '../../sidequest/logger.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const logger = createComponentLogger('ReportRoutes');

const REPORTS_DIR = path.join(process.cwd(), 'output', 'reports');

/**
 * GET /api/reports
 * List available reports
 */
router.get('/', async (req, res, next) => {
  try {
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

    // Determine content type
    let contentType = 'application/json';
    if (filename.endsWith('.html')) {
      contentType = 'text/html';
    } else if (filename.endsWith('.md')) {
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
