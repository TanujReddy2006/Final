/**
 * Moodle Continuous Sync Management Routes
 * 
 * Provides administrative endpoints for monitoring sync telemetry,
 * viewing health checks, and triggering on-demand synchronization runs.
 */

import express from 'express';
import { moodleContinuousSyncService } from '../services/moodleContinuousSyncService.js';
import { lmsRegistry } from '../adapters/LmsRegistry.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/moodle-sync/status
 * Returns current continuous sync state, adapter health check, and metrics
 */
router.get('/status', authenticateToken, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const syncStatus = await moodleContinuousSyncService.getSyncStatus();
    const adapter = lmsRegistry.getAdapter('MOODLE');
    const health = adapter ? await adapter.healthCheck() : { status: 'DOWN', message: 'Adapter not found' };

    return res.json({
      success: true,
      sync: syncStatus,
      adapterHealth: health
    });
  } catch (error) {
    console.error('Error getting Moodle sync status:', error);
    return res.status(500).json({ error: 'Failed to retrieve sync status' });
  }
});

/**
 * POST /api/moodle-sync/trigger
 * Manually trigger a synchronization cycle (Admin only)
 */
router.post('/trigger', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await moodleContinuousSyncService.syncNow({
      actorId: req.user.email || req.user.id,
      force: true
    });

    return res.json({
      success: true,
      message: 'Moodle synchronization completed successfully.',
      result
    });
  } catch (error) {
    console.error('Error triggering Moodle sync:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Moodle synchronization failed'
    });
  }
});

export default router;
