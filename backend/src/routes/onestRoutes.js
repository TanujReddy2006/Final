/**
 * ONEST Protocol Inbound Routes
 * 
 * Provides Beckn Protocol endpoints for ONEST network interoperability.
 * Handles 'status' and 'on_status' callbacks strictly following Beckn v2.0.0.
 */

import express from 'express';
import { onestProtocolService } from '../services/onestProtocolService.js';
import { moodleContinuousSyncService } from '../services/moodleContinuousSyncService.js';

const router = express.Router();

/**
 * POST /api/onest/status
 * Handle Beckn status query
 */
router.post('/status', (req, res) => {
  try {
    const { context, message } = req.body;
    if (!context || !message?.order_id) {
      return res.status(400).json(onestProtocolService.createNack('10001', 'Missing context or order_id'));
    }

    // In a live ONEST network, this schedules an asynchronous on_status callback to the BAP
    return res.status(200).json(onestProtocolService.createAck());
  } catch (error) {
    return res.status(500).json(onestProtocolService.createNack('50000', error.message));
  }
});

/**
 * POST /api/onest/on_status
 * Inbound webhook callback from ONEST BPP delivering course fulfillment / certificate issuance
 */
router.post('/on_status', async (req, res) => {
  try {
    const parsed = onestProtocolService.parseOnStatusPayload(req.body);

    // If an authoritative certificate is delivered in the ONEST fulfillment payload, trigger sync
    if (parsed.certificateData && parsed.learnerEmail) {
      await moodleContinuousSyncService.syncNow({
        actorId: `ONEST_BPP_${req.body?.context?.bpp_id || 'UNKNOWN'}`,
        force: true
      }).catch(err => {
        console.warn(`[ONEST on_status] Background ingestion notice: ${err.message}`);
      });
    }

    return res.status(200).json(onestProtocolService.createAck());
  } catch (error) {
    console.error('[ONEST on_status Error]:', error.message);
    return res.status(400).json(onestProtocolService.createNack('10002', error.message));
  }
});

export default router;
