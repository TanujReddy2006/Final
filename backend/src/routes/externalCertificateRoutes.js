/**
 * External Certificates API Routes
 * 
 * Manages external certifications earned through Moodle LMS, ONEST, or external portals.
 * Strictly separates external certificates from internal LearnForge course completion records.
 */

import express from 'express';
import { query, id as uuid, now, db } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/external-certificates
 * Retrieve external certificates with filters for provider, status, and course
 * Learner receives their own certificates; HR / Admin can view all certificates
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { provider, verification_status, status, search } = req.query;
    const filterStatus = verification_status || status;

    let sql = 'SELECT * FROM external_certificates WHERE 1=1';
    const params = [];

    // Learners only see their own certificates
    if (req.user.role === 'LEARNER') {
      params.push(req.user.id);
      sql += ` AND user_id = $${params.length}`;
    }

    if (provider) {
      params.push(provider.toUpperCase());
      sql += ` AND UPPER(provider) = $${params.length}`;
    }

    if (filterStatus) {
      params.push(filterStatus.toUpperCase());
      sql += ` AND UPPER(verification_status) = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(certificate_title) LIKE $${params.length} OR LOWER(course_name) LIKE $${params.length} OR LOWER(credential_id) LIKE $${params.length})`;
    }

    sql += ' ORDER BY issue_date DESC, created_at DESC';

    let result;
    try {
      result = await query(sql, params);
    } catch {
      // In-memory fallback
      let certs = db.externalCertificates || [];
      if (req.user.role === 'LEARNER') {
        certs = certs.filter(c => c.user_id === req.user.id);
      }
      if (provider) {
        certs = certs.filter(c => (c.provider || '').toUpperCase() === provider.toUpperCase());
      }
      if (filterStatus) {
        certs = certs.filter(c => (c.verification_status || '').toUpperCase() === filterStatus.toUpperCase());
      }
      result = { rows: certs };
    }

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows.map(mapExternalCert)
    });
  } catch (error) {
    console.error('Error fetching external certificates:', error);
    return res.status(500).json({ error: 'Failed to retrieve external certificates' });
  }
});

/**
 * POST /api/external-certificates
 * Learner registers an external certificate manually.
 * Initial status is strictly UNVERIFIED until reviewed by HR / Admin.
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      courseName,
      certificateTitle,
      issuingOrganization,
      credentialId,
      verificationUrl,
      issueDate,
      provider = 'MANUAL'
    } = req.body;

    if (!courseName || !certificateTitle || !issuingOrganization) {
      return res.status(400).json({
        error: 'Missing required certificate details: courseName, certificateTitle, and issuingOrganization are required.'
      });
    }

    const cleanCredId = credentialId ? String(credentialId).trim() : null;

    // Duplicate check for identical credential ID under the same provider
    if (cleanCredId) {
      const existing = await query(
        'SELECT id FROM external_certificates WHERE UPPER(provider) = UPPER($1) AND credential_id = $2',
        [provider, cleanCredId]
      ).catch(() => ({ rows: [] }));

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: `A certificate with credential ID '${cleanCredId}' from ${provider} is already registered.`
        });
      }
    }

    const certId = `ext-${uuid()}`;
    const cleanDate = issueDate ? new Date(issueDate).toISOString() : now();

    const insertSql = `
      INSERT INTO external_certificates (
        id, user_id, provider, course_id, course_name,
        certificate_title, issuing_organization, credential_id,
        verification_url, issue_date, completion_date,
        verification_status, source_data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `;

    const params = [
      certId,
      req.user.id,
      provider.toUpperCase(),
      null,
      courseName.trim(),
      certificateTitle.trim(),
      issuingOrganization.trim(),
      cleanCredId,
      verificationUrl ? verificationUrl.trim() : null,
      cleanDate,
      cleanDate,
      'UNVERIFIED',
      JSON.stringify({ submittedBy: req.user.email, manualEntry: true })
    ];

    const result = await query(insertSql, params);
    const saved = result.rows[0] || {
      id: certId,
      user_id: req.user.id,
      provider: provider.toUpperCase(),
      course_name: courseName,
      certificate_title: certificateTitle,
      issuing_organization: issuingOrganization,
      credential_id: cleanCredId,
      verification_url: verificationUrl,
      issue_date: cleanDate,
      verification_status: 'UNVERIFIED'
    };

    // Audit log entry
    await query(`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, timestamp, status, metadata)
      VALUES ($1, $2, $3, $4, $5, NOW(), 'SUCCESS', $6)
    `, [
      uuid(),
      req.user.id,
      'EXTERNAL_CERTIFICATE_SUBMITTED',
      'EXTERNAL_CERTIFICATE',
      certId,
      JSON.stringify({ provider, credentialId: cleanCredId, status: 'UNVERIFIED' })
    ]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'External certificate registered successfully. Status is UNVERIFIED pending verification.',
      data: mapExternalCert(saved)
    });
  } catch (error) {
    console.error('Error submitting external certificate:', error);
    return res.status(500).json({ error: 'Failed to submit external certificate' });
  }
});

/**
 * PATCH /api/external-certificates/:id/verify
 * HR or Admin verifies or revokes an external certificate
 */
router.patch('/:id/verify', authenticateToken, requireRole('HR', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'VERIFIED', notes } = req.body;

    const validStatuses = ['VERIFIED', 'UNVERIFIED', 'REVOKED'];
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({ error: `Invalid verification status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updateSql = `
      UPDATE external_certificates
      SET verification_status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(updateSql, [status.toUpperCase(), id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'External certificate not found' });
    }

    const updated = result.rows[0];

    // Audit log
    await query(`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, timestamp, status, metadata)
      VALUES ($1, $2, $3, $4, $5, NOW(), 'SUCCESS', $6)
    `, [
      uuid(),
      req.user.id,
      'EXTERNAL_CERTIFICATE_VERIFIED',
      'EXTERNAL_CERTIFICATE',
      id,
      JSON.stringify({ newStatus: status.toUpperCase(), verifiedBy: req.user.email, notes: notes || '' })
    ]).catch(() => {});

    return res.json({
      success: true,
      message: `Certificate status updated to ${status.toUpperCase()}`,
      data: mapExternalCert(updated)
    });
  } catch (error) {
    console.error('Error verifying external certificate:', error);
    return res.status(500).json({ error: 'Failed to update certificate verification status' });
  }
});

/**
 * GET /api/external-certificates/unmatched
 * Admin only: inspect staged certificates where learner email had no matching LearnForge account
 */
router.get('/unmatched', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const resUnmatched = await query(
      'SELECT * FROM unmatched_external_certificates WHERE status = $1 ORDER BY created_at DESC',
      ['PENDING_REVIEW']
    ).catch(() => ({ rows: [] }));

    return res.json({
      success: true,
      count: resUnmatched.rows.length,
      data: resUnmatched.rows
    });
  } catch (error) {
    console.error('Error fetching unmatched certificates:', error);
    return res.status(500).json({ error: 'Failed to retrieve unmatched certificates' });
  }
});

function mapExternalCert(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    courseId: row.course_id,
    courseName: row.course_name,
    certificateTitle: row.certificate_title,
    issuingOrganization: row.issuing_organization,
    credentialId: row.credential_id,
    verificationUrl: row.verification_url,
    issueDate: row.issue_date,
    completionDate: row.completion_date,
    verificationStatus: row.verification_status,
    isExternal: true,
    sourceData: typeof row.source_data === 'string' ? JSON.parse(row.source_data || '{}') : (row.source_data || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default router;
