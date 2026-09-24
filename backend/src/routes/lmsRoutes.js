/**
 * LMS Standard REST Routes
 * 
 * Exposes a single, unified backend interface for all LMS platform integrations
 * adhering to ONEST / Beckn standards.
 */

import { Router } from 'express';
import { lmsRegistry } from '../adapters/LmsRegistry.js';
import { db, id, now, persistDatabase } from '../config/database.js';
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

    // Synchronize into LearnForge certificates table for seamless HR verification
    const existingIndex = db.certificates.findIndex(
      c => c.certificateId.toLowerCase() === standardCert.certificateId.toLowerCase()
    );

    const learnforgeCertRecord = {
      id: id(),
      certificateId: standardCert.certificateId,
      certificateNumber: standardCert.certificateNumber,
      learnerId: standardCert.learnerId,
      learnerName: standardCert.learnerName,
      courseId: standardCert.courseId,
      courseName: standardCert.courseName,
      certification: `${standardCert.courseName} Certification`,
      issuedBy: standardCert.issuedBy,
      score: standardCert.score,
      completionDate: standardCert.issuedDate,
      issuedDate: standardCert.issuedDate,
      verificationUrl: standardCert.verificationUrl,
      pdfUrl: standardCert.pdfUrl,
      status: standardCert.status,
      skills: standardCert.skills
    };

    if (existingIndex >= 0) {
      db.certificates[existingIndex] = {
        ...db.certificates[existingIndex],
        ...learnforgeCertRecord
      };
    } else {
      db.certificates.push(learnforgeCertRecord);
    }

    await persistDatabase().catch(e => console.warn(`Persistence notice: ${e.message}`));

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
