/**
 * Moodle Continuous Synchronization Service
 * 
 * Orchestrates periodic and on-demand synchronization between Moodle LMS and LearnForge.
 * 
 * Key Responsibilities:
 *  1. Automatic Learner Matching via normalized verified email (LOWER(TRIM(email)))
 *  2. Safe Unmatched Identity Handling (NO phantom accounts; staged in unmatched queue)
 *  3. Idempotent Ingestion of external courses and authoritative certificates
 *  4. External Certificate Lifecycle Management (verified status, revocation, deduplication)
 *  5. Observability: Sync state, telemetry, error tracking, and structured audit logs
 */

import { query, id as uuid, now, db } from '../config/database.js';
import { lmsRegistry } from '../adapters/LmsRegistry.js';

export class MoodleContinuousSyncService {
  constructor() {
    this.timer = null;
    this.isSyncing = false;
    this.syncIntervalMs = Number(process.env.MOODLE_SYNC_INTERVAL_MS || 60000);
    this.inMemorySyncState = {
      lastSyncTimestamp: null,
      lastStatus: 'IDLE',
      syncedCount: 0,
      unmatchedCount: 0,
      lastError: null,
      telemetry: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0
      }
    };
  }

  /**
   * Start background periodic sync poller
   */
  startPoller() {
    if (this.timer) return;
    console.log(`[MoodleContinuousSync] Starting periodic sync poller (interval: ${this.syncIntervalMs / 1000}s)`);
    
    // Initial sync after a short warm-up delay
    setTimeout(() => {
      this.syncNow().catch(err => {
        console.warn(`[MoodleContinuousSync] Initial background sync error: ${err.message}`);
      });
    }, 3000);

    this.timer = setInterval(() => {
      this.syncNow().catch(err => {
        console.warn(`[MoodleContinuousSync] Periodic sync error: ${err.message}`);
      });
    }, this.syncIntervalMs);
  }

  /**
   * Stop background sync poller
   */
  stopPoller() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[MoodleContinuousSync] Periodic sync poller stopped.');
    }
  }

  /**
   * Returns current sync telemetry and status for Admin dashboard
   */
  async getSyncStatus() {
    try {
      const res = await query('SELECT * FROM moodle_sync_state WHERE id = $1', ['moodle_state']);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          lastSyncTimestamp: row.last_sync_timestamp,
          lastStatus: row.last_status,
          syncedCount: row.synced_count,
          lastError: row.last_error,
          metadata: row.metadata || {}
        };
      }
    } catch {
      // Fallback to in-memory state
    }
    return this.inMemorySyncState;
  }

  /**
   * Core synchronization execution run
   */
  async syncNow(options = { actorId: 'SYSTEM_SYNC', force: false }) {
    if (this.isSyncing && !options.force) {
      console.log('[MoodleContinuousSync] Sync cycle already running; skipping concurrent invocation.');
      return { status: 'SKIPPED', message: 'Sync in progress' };
    }

    this.isSyncing = true;
    this.inMemorySyncState.lastStatus = 'RUNNING';
    this.inMemorySyncState.telemetry.totalRuns++;

    const startTime = Date.now();
    let syncedCertificates = 0;
    let unmatchedIdentities = 0;

    try {
      const adapter = lmsRegistry.getAdapter('MOODLE');
      if (!adapter) {
        throw new Error('Moodle LMS Adapter is not registered in LmsRegistry.');
      }

      // Step 1: Query Authoritative Issued Certificates from Moodle
      const authoritativeCerts = typeof adapter.getAuthoritativeIssuedCertificates === 'function'
        ? await adapter.getAuthoritativeIssuedCertificates()
        : await adapter.getCertificates('all');

      for (const cert of authoritativeCerts) {
        const rawEmail = cert.learnerEmail || cert.email;
        if (!rawEmail) {
          console.warn(`[MoodleContinuousSync] Certificate ${cert.certificateId} lacks learner email; skipping.`);
          continue;
        }

        const normalizedEmail = String(rawEmail).trim().toLowerCase();

        // Step 2: Strict Learner Matching in LearnForge users table
        let matchedUser = null;
        try {
          const userRes = await query(
            'SELECT id, name, email, role FROM users WHERE LOWER(TRIM(email)) = $1',
            [normalizedEmail]
          );
          if (userRes.rows.length > 0) {
            matchedUser = userRes.rows[0];
          }
        } catch (dbErr) {
          // In-memory fallback lookup
          matchedUser = (db.users || []).find(u => u.email.trim().toLowerCase() === normalizedEmail);
        }

        if (matchedUser) {
          // Step 3: Match Confirmed! Ingest or update in external_certificates
          const certRecordId = `ext-${cert.certificateId || uuid()}`;
          const credId = cert.certificateNumber || cert.certificateId || cert.credentialId;
          const issueDate = cert.issuedDate || cert.issueDate || now();
          const verificationUrl = cert.verificationUrl || '';
          const verificationStatus = cert.status === 'REVOKED' ? 'REVOKED' : 'VERIFIED';

          const sqlUpsert = `
            INSERT INTO external_certificates (
              id, user_id, provider, course_id, course_name,
              certificate_title, issuing_organization, credential_id,
              verification_url, issue_date, completion_date,
              verification_status, source_data, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
            ON CONFLICT (provider, credential_id) DO UPDATE SET
              verification_status = EXCLUDED.verification_status,
              verification_url = EXCLUDED.verification_url,
              source_data = EXCLUDED.source_data,
              updated_at = NOW()
          `;

          const params = [
            certRecordId,
            matchedUser.id,
            'MOODLE',
            cert.courseId || 'moodle-crs-101',
            cert.courseName || 'Moodle Certified Specialization',
            `${cert.courseName} - Certificate of Completion`,
            cert.issuedBy || 'Moodle LMS Global Academy',
            credId,
            verificationUrl,
            issueDate,
            cert.completionDate || issueDate,
            verificationStatus,
            JSON.stringify(cert)
          ];

          await query(sqlUpsert, params);
          await query('DELETE FROM unmatched_external_certificates WHERE provider = $1 AND credential_id = $2', ['MOODLE', credId]).catch(() => {});
          syncedCertificates++;

          // Structured Audit Log
          await query(`
            INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, timestamp, status, metadata)
            VALUES ($1, $2, $3, $4, $5, NOW(), 'SUCCESS', $6)
          `, [
            uuid(),
            options.actorId,
            'EXTERNAL_CERTIFICATE_SYNCED',
            'EXTERNAL_CERTIFICATE',
            credId,
            JSON.stringify({
              userId: matchedUser.id,
              learnerEmail: normalizedEmail,
              provider: 'MOODLE',
              credentialId: credId,
              verificationStatus
            })
          ]).catch(() => {});

        } else {
          // Step 4: Unmatched Email Handling - Do NOT auto-create phantom user accounts!
          unmatchedIdentities++;
          console.warn(`[MoodleContinuousSync] Unmatched learner email '${normalizedEmail}' for cert '${cert.certificateId}'. Staging for admin review.`);

          await query(`
            INSERT INTO unmatched_external_certificates (
              id, raw_email, normalized_email, provider, course_name,
              credential_id, verification_url, issue_date, status, payload, created_at
            ) VALUES ($1, $2, $3, 'MOODLE', $4, $5, $6, $7, 'PENDING_REVIEW', $8, NOW())
            ON CONFLICT (provider, credential_id) DO UPDATE SET
              status = 'PENDING_REVIEW',
              payload = EXCLUDED.payload
          `, [
            uuid(),
            rawEmail,
            normalizedEmail,
            cert.courseName || 'Moodle Course',
            cert.certificateNumber || cert.certificateId || uuid(),
            cert.verificationUrl || '',
            cert.issuedDate || now(),
            JSON.stringify(cert)
          ]).catch(() => {});
        }
      }

      // Update sync telemetry
      const durationMs = Date.now() - startTime;
      this.inMemorySyncState.lastSyncTimestamp = now();
      this.inMemorySyncState.lastStatus = 'SUCCESS';
      this.inMemorySyncState.syncedCount = syncedCertificates;
      this.inMemorySyncState.unmatchedCount = unmatchedIdentities;
      this.inMemorySyncState.lastError = null;
      this.inMemorySyncState.telemetry.successfulRuns++;

      await query(`
        INSERT INTO moodle_sync_state (id, last_sync_timestamp, last_status, synced_count, last_error, metadata)
        VALUES ('moodle_state', NOW(), 'SUCCESS', $1, NULL, $2)
        ON CONFLICT (id) DO UPDATE SET
          last_sync_timestamp = NOW(),
          last_status = 'SUCCESS',
          synced_count = EXCLUDED.synced_count,
          last_error = NULL,
          metadata = EXCLUDED.metadata
      `, [
        syncedCertificates,
        JSON.stringify({ durationMs, unmatchedCount: unmatchedIdentities, lastRun: now() })
      ]).catch(() => {});

      return {
        status: 'SUCCESS',
        syncedCount: syncedCertificates,
        unmatchedCount: unmatchedIdentities,
        durationMs
      };
    } catch (err) {
      console.error(`[MoodleContinuousSync] Sync failed: ${err.message}`);
      this.inMemorySyncState.lastStatus = 'FAILED';
      this.inMemorySyncState.lastError = err.message;
      this.inMemorySyncState.telemetry.failedRuns++;

      await query(`
        INSERT INTO moodle_sync_state (id, last_sync_timestamp, last_status, synced_count, last_error, metadata)
        VALUES ('moodle_state', NOW(), 'FAILED', 0, $1, $2)
        ON CONFLICT (id) DO UPDATE SET
          last_status = 'FAILED',
          last_error = EXCLUDED.last_error
      `, [
        err.message,
        JSON.stringify({ failedAt: now(), error: err.message })
      ]).catch(() => {});

      throw err;
    } finally {
      this.isSyncing = false;
    }
  }
}

export const moodleContinuousSyncService = new MoodleContinuousSyncService();
