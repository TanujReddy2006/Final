/**
 * LMS Standard REST Routes
 * 
 * Exposes a single, unified backend interface for all LMS platform integrations
 * adhering to ONEST / Beckn standards.
 */

import { Router } from 'express';
import { lmsRegistry } from '../adapters/LmsRegistry.js';
import { db, query, id, now } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * List all active/registered LMS providers
 * GET /api/v1/lms/providers
 */
router.get('/providers', (req, res) => {
  const providers = lmsRegistry.getRegisteredProviders();
  res.json({
    success: true,
    data: providers,
    message: 'Registered LMS providers'
  });
});

/**
 * Health check across all registered LMS adapters
 * GET /api/v1/lms/health
 */
router.get('/health', async (req, res) => {
  const checks = await lmsRegistry.runHealthChecks();
  res.json({
    success: true,
    data: checks
  });
});

/**
 * Fetch courses via the standard LMS adapter layer
 * GET /api/v1/lms/courses?provider=infosys&search=cloud
 */
router.get('/courses', async (req, res) => {
  const { provider, search, category, difficulty } = req.query;

  try {
    if (provider) {
      const adapter = lmsRegistry.getAdapter(provider);
      if (!adapter) {
        return res.status(404).json({
          success: false,
          message: `LMS provider '${provider}' not found`
        });
      }
      const courses = await adapter.getCourses({ search, category, difficulty });
      return res.json({ success: true, data: courses });
    }

    // Default: Aggregate across all active LMS providers
    const courses = await lmsRegistry.getAllCourses({ search, category, difficulty });
    return res.json({ success: true, data: courses });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error querying courses from standard LMS adapter'
    });
  }
});

/**
 * Fetch course details via the standard LMS adapter layer
 * GET /api/v1/lms/courses/:id?provider=infosys
 */
router.get('/courses/:id', async (req, res) => {
  const { id: courseId } = req.params;
  const { provider } = req.query;

  try {
    const courseDetail = await lmsRegistry.getCourseById(courseId, provider);
    if (!courseDetail) {
      return res.status(404).json({
        success: false,
        message: `Course '${courseId}' not found in registered LMS adapters`
      });
    }
    return res.json({ success: true, data: courseDetail });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error fetching course details from LMS adapter'
    });
  }
});

/**
 * Fetch complete learner details based on email address
 * GET /api/v1/lms/learner/:email?provider=infosys
 */
router.get('/learner/:email', async (req, res) => {
  const { email } = req.params;
  const { provider } = req.query;

  try {
    const adapter = lmsRegistry.getAdapter(provider || 'INFOSYS_SPRINGBOARD');
    if (!adapter) {
      return res.status(404).json({ success: false, message: 'LMS provider not found' });
    }

    const learnerDetails = await adapter.getLearnerDetails(email);
    return res.json({ success: true, data: learnerDetails });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error fetching learner details by email'
    });
  }
});

/**
 * Fetch learner enrollments across external LMS platforms
 * GET /api/v1/lms/enrollments?email=...&provider=infosys
 */
router.get('/enrollments', async (req, res) => {
  const learnerEmail = req.query.email || req.user?.email;
  const learnerId = req.user?.id || learnerEmail;
  const { provider } = req.query;

  if (!learnerEmail && !learnerId) {
    return res.status(400).json({ success: false, message: 'Learner email is required' });
  }

  try {
    const adapter = lmsRegistry.getAdapter(provider || 'INFOSYS_SPRINGBOARD');
    if (!adapter) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    const enrollments = await adapter.getLearnerEnrollments(learnerId, learnerEmail);
    return res.json({ success: true, data: enrollments });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Fetch real-time progress for a learner in an LMS course based on email or id
 * GET /api/v1/lms/progress/:courseId?email=...&provider=infosys
 */
router.get('/progress/:courseId', async (req, res) => {
  const { courseId } = req.params;
  const { provider } = req.query;
  const learnerEmail = req.query.email || req.user?.email;
  const learnerIdentifier = learnerEmail || req.user?.id;

  if (!learnerIdentifier) {
    return res.status(400).json({ success: false, message: 'Learner email is required to fetch progress' });
  }

  try {
    const adapter = lmsRegistry.getAdapter(provider || 'INFOSYS_SPRINGBOARD');
    if (!adapter) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    const progress = await adapter.getLearnerProgress(learnerIdentifier, courseId);
    return res.json({ success: true, data: progress });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Fetch assessment evaluation results
 * GET /api/v1/lms/assessment/:courseId?email=...&provider=infosys
 */
router.get('/assessment/:courseId', async (req, res) => {
  const { courseId } = req.params;
  const { provider } = req.query;
  const learnerEmail = req.query.email || req.user?.email;
  const learnerIdentifier = learnerEmail || req.user?.id;

  try {
    const adapter = lmsRegistry.getAdapter(provider || 'INFOSYS_SPRINGBOARD');
    if (!adapter) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    const result = await adapter.getAssessmentResults(learnerIdentifier, courseId);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Fetch certificates issued by an LMS provider based on email or id
 * GET /api/v1/lms/certificates?email=...&provider=infosys
 */
router.get('/certificates', async (req, res) => {
  const { provider, courseId } = req.query;
  const learnerEmail = req.query.email || req.user?.email;
  const learnerIdentifier = learnerEmail || req.user?.id;

  try {
    const adapter = lmsRegistry.getAdapter(provider || 'INFOSYS_SPRINGBOARD');
    if (!adapter) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    const certs = await adapter.getCertificates(learnerIdentifier, courseId);
    return res.json({ success: true, data: certs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Ingest / Sync real-time progress update from external LMS
 * POST /api/v1/lms/sync/progress
 */
router.post('/sync/progress', async (req, res) => {
  const provider = req.body.provider || 'INFOSYS_SPRINGBOARD';

  try {
    const adapter = lmsRegistry.getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ success: false, message: `LMS provider '${provider}' not found` });
    }

    const progress = await adapter.syncProgress(req.body);
    return res.json({
      success: true,
      message: `Progress synced successfully from ${adapter.getProviderName()}`,
      data: progress
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Ingest / Sync certificate from external LMS
 * POST /api/v1/lms/sync/certificate
 * Automatically records into LearnForge certificates table so HR can verify it immediately!
 */
router.post('/sync/certificate', async (req, res) => {
  const provider = req.body.provider || 'INFOSYS_SPRINGBOARD';

  try {
    const adapter = lmsRegistry.getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ success: false, message: `LMS provider '${provider}' not found` });
    }

    const standardCert = await adapter.syncCertificate(req.body);

    const certNumber = standardCert.certificateNumber || standardCert.certificateId;
    const certRecord = {
      id: id(),
      certificateId: standardCert.certificateId,
      certificateNumber: certNumber,
      learnerId: standardCert.learnerId,
      learnerName: standardCert.learnerName,
      courseId: standardCert.courseId,
      courseName: standardCert.courseName,
      certification: `${standardCert.courseName} Certification`,
      issuedBy: standardCert.issuedBy,
      score: standardCert.score,
      completionDate: standardCert.issuedDate || now(),
      issuedDate: standardCert.issuedDate || now(),
      verificationUrl: standardCert.verificationUrl,
      pdfUrl: standardCert.pdfUrl,
      status: standardCert.status || 'VALID',
      skills: standardCert.skills || []
    };

    let actualCourseId = certRecord.courseId;
    const { rows: courseRows } = await query('SELECT id FROM courses WHERE id = $1', [actualCourseId]);
    if (!courseRows.length) {
      const compId = 'co-infosys';
      await query(
        `INSERT INTO companies (id, name, description, website) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [compId, certRecord.issuedBy || 'Infosys Springboard', 'LMS Provider', 'https://springboard.infosys.com']
      );
      await query(
        `INSERT INTO courses (id, title, description, company_id, status) VALUES ($1, $2, $3, $4, 'PUBLISHED') ON CONFLICT (id) DO NOTHING`,
        [actualCourseId, certRecord.courseName, `${certRecord.courseName} by ${certRecord.issuedBy}`, compId]
      );
    }

    let actualLearnerId = certRecord.learnerId;
    const { rows: userRows } = await query(
      'SELECT id FROM users WHERE id = $1 OR LOWER(email) = LOWER($2)',
      [actualLearnerId, standardCert.learnerEmail || '']
    );
    if (userRows.length) {
      actualLearnerId = userRows[0].id;
    } else {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, 'external', 'LEARNER') ON CONFLICT (id) DO NOTHING`,
        [actualLearnerId, certRecord.learnerName, standardCert.learnerEmail || `${actualLearnerId}@example.com`]
      );
    }
    certRecord.learnerId = actualLearnerId;

    await query(
      `INSERT INTO certificates (
         id, certificate_id, certificate_number, learner_id, learner_name, course_id, course_name,
         certification, issued_by, score, completion_date, issued_date, verification_url, pdf_url, status, skills
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (certificate_id) DO UPDATE SET
         score = EXCLUDED.score,
         status = EXCLUDED.status,
         skills = EXCLUDED.skills,
         verification_url = EXCLUDED.verification_url,
         pdf_url = EXCLUDED.pdf_url`,
      [
        certRecord.id,
        certRecord.certificateId,
        certRecord.certificateNumber,
        certRecord.learnerId,
        certRecord.learnerName,
        certRecord.courseId,
        certRecord.courseName,
        certRecord.certification,
        certRecord.issuedBy,
        certRecord.score,
        certRecord.completionDate,
        certRecord.issuedDate,
        certRecord.verificationUrl,
        certRecord.pdfUrl,
        certRecord.status,
        JSON.stringify(certRecord.skills)
      ]
    );

    db.certificates = db.certificates || [];
    const existingIndex = db.certificates.findIndex(
      c => c.certificateId.toLowerCase() === standardCert.certificateId.toLowerCase()
    );
    if (existingIndex >= 0) {
      db.certificates[existingIndex] = { ...db.certificates[existingIndex], ...certRecord };
    } else {
      db.certificates.push(certRecord);
    }

    return res.json({
      success: true,
      message: `Certificate ${standardCert.certificateId} synced from ${adapter.getProviderName()} and available for HR verification`,
      data: standardCert
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
