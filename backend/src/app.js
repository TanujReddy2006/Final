import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import {
  query,
  id,
  now,
  mapUser,
  mapCompany,
  mapCourse,
  mapEnrollment,
  mapAssessment,
  mapAttempt,
  mapCertificate,
  mapAuditLog,
  mapPendingCompany,
  mapNotification,
  mapVerification,
  db
} from './config/database.js';
import { allow, publicUser, requireAuth, signToken } from './middleware/auth.js';
import { CertificationEligibilityService } from './services/certificationEligibilityService.js';
import { issueCertificate, readCertificatePdf } from './services/certificateService.js';
import { normalizeModule, validateCourseForPublish } from './services/courseValidationService.js';
import { getCached, invalidateCached, setCached } from './config/cache.js';
import lmsRoutes from './routes/lmsRoutes.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
];

const isAllowedOrigin = origin => {
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/+$/, '');
  if (configuredOrigins.includes(cleanOrigin) || defaultOrigins.includes(cleanOrigin)) {
    return true;
  }
  if (/^https:\/\/[a-zA-Z0-9-_.]+\.vercel\.app$/.test(cleanOrigin)) {
    return true;
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 1000,
    standardHeaders: true
  })
);

const response = (res, data, message = '') =>
  res.json({
    success: true,
    message,
    data
  });

const audit = async (req, action, entityType, entityId, metadata = {}) => {
  const actorId = req?.user?.id || metadata?.actorId || null;
  let userName = metadata?.userName || req?.user?.name;
  let userRole = metadata?.userRole || metadata?.role || req?.user?.role;

  if (actorId && (!userName || !userRole)) {
    try {
      const { rows } = await query('SELECT name, role FROM users WHERE id = $1', [actorId]);
      if (rows && rows.length > 0) {
        userName = userName || rows[0].name;
        userRole = userRole || rows[0].role;
      }
    } catch {
      // fallback handled below
    }
  }

  userName = userName || (action === 'REGISTER' && metadata?.name) || 'System';
  userRole = userRole || 'SYSTEM';

  const enrichedMetadata = {
    ...metadata,
    userName,
    userRole
  };

  const logEntry = {
    id: id(),
    actorId,
    action,
    entityType,
    entityId,
    timestamp: now(),
    status: 'SUCCESS',
    metadata: enrichedMetadata,
    userName,
    userRole,
    ip: req?.ip || '127.0.0.1'
  };

  db.auditLogs = db.auditLogs || [];
  db.auditLogs.push(logEntry);
  if (db.auditLogs.length > 500) {
    db.auditLogs.shift();
  }

  await query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, timestamp, status, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)`,
    [
      logEntry.id,
      actorId,
      action,
      entityType,
      entityId,
      'SUCCESS',
      JSON.stringify(enrichedMetadata),
      logEntry.ip
    ]
  );
};

const notify = async (userId, title, body) => {
  const notification = {
    id: id(),
    userId,
    title,
    body,
    read: false,
    createdAt: now()
  };
  db.notifications = db.notifications || [];
  db.notifications.push(notification);

  await query(
    `INSERT INTO notifications (id, user_id, title, body, read, created_at)
     VALUES ($1, $2, $3, $4, false, now())`,
    [notification.id, userId, title, body]
  );
};

const ownsCourse = (req, course) =>
  req.user.role === 'ADMIN' || (req.user.role === 'COMPANY' && course.companyId === req.user.companyId);

const ensureCourseIds = course => {
  if (!course || !course.modules) return course;
  course.modules.forEach(module => {
    if (!module.id) module.id = id();
    if (!module.lessons) module.lessons = [];
    module.lessons.forEach(lesson => {
      if (!lesson.id) lesson.id = id();
    });
  });
  return course;
};

// Health check endpoints for Render, uptime monitors, and tests
app.get(['/health', '/healthz', '/api/v1/health'], (_, res) =>
  response(res, {
    service: 'LearnForge API',
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    timestamp: now()
  })
);

// Standard LMS Adapter Routes (ONEST / Beckn compliant)
app.use('/api/v1/lms', lmsRoutes);

// Auth endpoints
app.post('/api/v1/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const requestedRole = String(req.body.role || '').toUpperCase();

  // Strict check: Only one admin exists in the platform. New users cannot register as ADMIN.
  if (requestedRole === 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Registration as administrator is not permitted. Only one system administrator exists.'
    });
  }

  const allowedRoles = ['LEARNER', 'COMPANY', 'HR'];
  const role = allowedRoles.includes(requestedRole) ? requestedRole : 'LEARNER';
  const companyName = String(req.body.companyName || '').trim();

  // Validate Name
  if (!name || name.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required (at least 2 characters)'
    });
  }

  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Valid email address is required (e.g. user@example.com)'
    });
  }

  // Validate Password: min 6 chars, >= 1 uppercase letter, >= 1 special character
  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({
      success: false,
      message: 'Password must contain at least one uppercase letter'
    });
  }
  if (!/[!@#$%^&*(),.?":{}|<>_~`'+\-=\\/[\]]/.test(password)) {
    return res.status(400).json({
      success: false,
      message: 'Password must contain at least one special character'
    });
  }

  // Validate Company name if role === COMPANY
  if (role === 'COMPANY' && (!companyName || companyName.length < 2)) {
    return res.status(400).json({
      success: false,
      message: 'Company name is required for company provider accounts'
    });
  }

  // Check email uniqueness directly in PostgreSQL users table
  const { rows: existingEmailRows } = await query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (existingEmailRows.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'Email already registered'
    });
  }

  // Check email uniqueness against pending registrations table
  const { rows: existingPendingRows } = await query(
    "SELECT id FROM pending_company_registrations WHERE LOWER(email) = LOWER($1) AND status = 'PENDING'",
    [email]
  );
  if (existingPendingRows.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'A registration request with this email is already awaiting administrator approval.'
    });
  }

  // When a user registers as COMPANY or HR, require administrator approval before adding details to database
  if (role === 'COMPANY' || role === 'HR') {
    const pending = {
      id: id(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companyName: role === 'COMPANY' ? (companyName || `${name}'s Company`) : (companyName || ''),
      role,
      status: 'PENDING',
      createdAt: now()
    };

    await query(
      `INSERT INTO pending_company_registrations (id, name, email, password_hash, company_name, role, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [pending.id, pending.name, pending.email, pending.passwordHash, pending.companyName, pending.role, pending.status]
    );

    db.pendingCompanyRegistrations = db.pendingCompanyRegistrations || [];
    db.pendingCompanyRegistrations.push(pending);

    await audit(req, `${role}_REGISTRATION_PENDING`, 'REGISTRATION_PENDING', pending.id, {
      userName: pending.name,
      userRole: role,
      companyName: pending.companyName,
      email: pending.email
    });

    const roleLabel = role === 'COMPANY' ? 'Company provider' : 'HR / employer';
    return res.status(200).json({
      success: true,
      pendingApproval: true,
      role,
      message: `${roleLabel} registration submitted successfully. Your request has been sent to the administrator for approval before you can sign in.`,
      data: {
        pendingApproval: true,
        name: pending.name,
        role: pending.role,
        email: pending.email,
        companyName: pending.companyName
      }
    });
  }

  // Non-company/HR accounts (LEARNER) are registered immediately
  const user = {
    id: id(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    companyId: null,
    active: true
  };

  await query(
    `INSERT INTO users (id, name, email, password_hash, role, company_id, active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [user.id, user.name, user.email, user.passwordHash, user.role, user.companyId, user.active]
  );

  db.users = db.users || [];
  db.users.push(user);

  await audit(req, 'REGISTER', 'USER', user.id, {
    userName: user.name,
    userRole: user.role,
    email: user.email
  });

  return response(
    res,
    {
      user: publicUser(user),
      token: signToken(user)
    },
    'Registration successful'
  );
});

app.post('/api/v1/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  // Check if user registration is pending approval in PostgreSQL
  const { rows: pendingRows } = await query(
    "SELECT * FROM pending_company_registrations WHERE LOWER(email) = LOWER($1) AND status = 'PENDING'",
    [email]
  );
  if (pendingRows.length > 0) {
    const pendingComp = pendingRows[0];
    const roleLabel = pendingComp.role === 'HR' ? 'HR / employer' : 'company';
    return res.status(403).json({
      success: false,
      message: `Your ${roleLabel} account registration is awaiting administrator approval. Please wait for an administrator to review and approve your account.`
    });
  }

  // Query user directly from PostgreSQL users table
  const { rows: userRows } = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (!userRows.length) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  const user = mapUser(userRows[0]);
  if (!user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  await audit(req, 'LOGIN', 'USER', user.id, {
    userName: user.name,
    userRole: user.role,
    email: user.email
  });

  return response(
    res,
    {
      user: publicUser(user),
      token: signToken(user)
    },
    'Welcome back'
  );
});

app.post('/api/v1/auth/logout', requireAuth, async (req, res) => {
  await audit(req, 'LOGOUT', 'USER', req.user.id);
  response(res, null, 'Logged out');
});

app.get('/api/v1/auth/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  return response(res, publicUser(mapUser(rows[0])));
});

app.patch('/api/v1/users/me', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const rawName = req.body.name;
  if (!rawName || typeof rawName !== 'string' || rawName.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required (at least 2 characters)'
    });
  }

  const name = rawName.trim();
  const { rows } = await query('UPDATE users SET name = $1 WHERE id = $2 RETURNING *', [name, userId]);
  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const user = mapUser(rows[0]);
  const memUser = (db.users || []).find(u => u.id === userId);
  if (memUser) memUser.name = name;

  await audit(req, 'NAME_UPDATED', 'USER', userId, { name });
  return response(res, { user: publicUser(user) }, 'Profile updated successfully');
});

app.post('/api/v1/auth/forgot-password', (_, res) =>
  response(res, null, 'If the account exists, reset instructions have been queued')
);

app.post('/api/v1/auth/reset-password', (_, res) =>
  response(res, null, 'Password reset complete')
);

// Course endpoints
app.get('/api/v1/courses', async (req, res) => {
  const search = String(req.query.search || '').toLowerCase();

  const { rows } = await query(
    `SELECT c.*, comp.name AS comp_name, comp.description AS comp_desc, comp.website AS comp_web
     FROM courses c
     LEFT JOIN companies comp ON c.company_id = comp.id
     WHERE c.status = 'PUBLISHED'
     ORDER BY c.created_at DESC`
  );

  let list = rows.map(r => {
    const c = mapCourse(r);
    ensureCourseIds(c);
    c.company = r.comp_name
      ? {
          id: r.company_id,
          name: r.comp_name,
          description: r.comp_desc || '',
          website: r.comp_web || ''
        }
      : null;
    return c;
  });

  if (search) {
    list = list.filter(c =>
      `${c.title} ${c.description} ${c.category} ${c.instructorName}`.toLowerCase().includes(search)
    );
  }

  return response(res, list);
});

app.get('/api/v1/courses/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, comp.name AS comp_name, comp.description AS comp_desc, comp.website AS comp_web
     FROM courses c
     LEFT JOIN companies comp ON c.company_id = comp.id
     WHERE c.id = $1 AND c.status = 'PUBLISHED'`,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Published course not found'
    });
  }

  const course = mapCourse(rows[0]);
  ensureCourseIds(course);
  course.company = rows[0].comp_name
    ? {
        id: rows[0].company_id,
        name: rows[0].comp_name,
        description: rows[0].comp_desc || '',
        website: rows[0].comp_web || ''
      }
    : null;

  return response(res, course);
});

// Company course endpoints
app.get('/api/v1/company/courses', requireAuth, allow('COMPANY'), async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, comp.name AS comp_name, comp.description AS comp_desc, comp.website AS comp_web
     FROM courses c
     LEFT JOIN companies comp ON c.company_id = comp.id
     WHERE c.company_id = $1
     ORDER BY c.created_at DESC`,
    [req.user.companyId]
  );

  const list = rows.map(r => {
    const c = mapCourse(r);
    ensureCourseIds(c);
    c.company = r.comp_name
      ? {
          id: r.company_id,
          name: r.comp_name,
          description: r.comp_desc || '',
          website: r.comp_web || ''
        }
      : null;
    return c;
  });

  return response(res, list);
});

app.get('/api/v1/company/courses/:id', requireAuth, allow('COMPANY'), async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, comp.name AS comp_name, comp.description AS comp_desc, comp.website AS comp_web
     FROM courses c
     LEFT JOIN companies comp ON c.company_id = comp.id
     WHERE c.id = $1`,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  const course = mapCourse(rows[0]);
  if (!ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  ensureCourseIds(course);
  course.company = rows[0].comp_name
    ? {
        id: rows[0].company_id,
        name: rows[0].comp_name,
        description: rows[0].comp_desc || '',
        website: rows[0].comp_web || ''
      }
    : null;

  return response(res, course);
});

app.get('/api/v1/company/overview', requireAuth, allow('COMPANY'), async (req, res) => {
  const [coursesRes, enrollmentsRes] = await Promise.all([
    query(
      `SELECT c.*, comp.name AS comp_name, comp.description AS comp_desc, comp.website AS comp_web
       FROM courses c
       LEFT JOIN companies comp ON c.company_id = comp.id
       WHERE c.company_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.companyId]
    ),
    query(
      `SELECT e.*
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE c.company_id = $1`,
      [req.user.companyId]
    )
  ]);

  const courses = coursesRes.rows.map(r => {
    const c = mapCourse(r);
    ensureCourseIds(c);
    c.company = r.comp_name
      ? {
          id: r.company_id,
          name: r.comp_name,
          description: r.comp_desc || '',
          website: r.comp_web || ''
        }
      : null;
    return c;
  });

  const enrollments = enrollmentsRes.rows.map(mapEnrollment);

  return response(res, {
    courses,
    metrics: {
      totalCourses: courses.length,
      publishedCourses: courses.filter(c => c.status === 'PUBLISHED').length,
      draftCourses: courses.filter(c => c.status === 'DRAFT').length,
      totalLearners: new Set(enrollments.map(e => e.userId)).size,
      completionRate: enrollments.length
        ? Math.round(
            (enrollments.filter(e => e.status === 'COMPLETED').length / enrollments.length) * 100
          )
        : 0
    }
  });
});

app.get('/api/v1/company/learners', requireAuth, allow('COMPANY'), async (req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.id AS enrollment_id, e.user_id, e.course_id, e.progress, e.status, e.started_at,
            u.name AS learner_name, u.email AS learner_email,
            c.title AS course_title,
            cert.certificate_id
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     JOIN users u ON e.user_id = u.id
     LEFT JOIN certificates cert ON cert.course_id = e.course_id AND cert.learner_id = e.user_id
     WHERE c.company_id = $1
     ORDER BY e.started_at DESC`,
    [req.user.companyId]
  );

  const list = rows.map(r => ({
    id: r.id,
    enrollmentId: r.enrollment_id,
    userId: r.user_id,
    learnerName: r.learner_name || 'Learner',
    learnerEmail: r.learner_email || '',
    courseId: r.course_id,
    courseTitle: r.course_title || 'Unknown course',
    progress: r.progress || 0,
    status: r.status || 'IN_PROGRESS',
    lastAccessed: r.started_at,
    certified: Boolean(r.certificate_id),
    certificateId: r.certificate_id || null
  }));

  return response(res, list);
});

app.post('/api/v1/courses/draft', requireAuth, allow('COMPANY'), async (req, res) => {
  if (!req.body.title || !req.body.description) {
    return res.status(400).json({
      success: false,
      message: 'Title and description are required to save a draft'
    });
  }

  const assessmentId = id();
  const courseId = id();

  const assessment = {
    id: assessmentId,
    courseId,
    title: req.body.assessmentTitle || `${req.body.title} final assessment`,
    description: req.body.assessmentDescription || '',
    passingScore: Number(req.body.passingScore || 70),
    maxAttempts: Number(req.body.maxAttempts || 3),
    timeLimit: req.body.timeLimit || null,
    randomizeQuestions: Boolean(req.body.randomizeQuestions),
    showAnswersAfterSubmission: Boolean(req.body.showAnswersAfterSubmission),
    questions: (req.body.questions || []).map(question => ({
      ...question,
      id: question.id || id(),
      marks: Number(question.marks || 1),
      type: question.type || 'SINGLE',
      options: (question.options || []).map(opt => ({ ...opt, id: opt.id || id() }))
    }))
  };

  const modules = (req.body.modules || []).map(module =>
    normalizeModule({
      ...module,
      id: module.id || id(),
      lessons: module.lessons?.length
        ? module.lessons.map(lesson => ({ ...lesson, id: lesson.id || id() }))
        : [
            {
              id: id(),
              title: module.title,
              content: module.content || '',
              description: '',
              type: 'READING',
              duration: module.duration || '30 min'
            }
          ]
    })
  );

  let instructorName = req.body.instructorName;
  if (!instructorName) {
    const compRes = await query('SELECT name FROM companies WHERE id = $1', [req.user.companyId]);
    instructorName = compRes.rows[0]?.name || 'LearnForge provider';
  }

  const course = {
    id: courseId,
    title: req.body.title,
    description: req.body.description,
    detailedDescription: req.body.detailedDescription || req.body.description,
    category: req.body.category || 'Professional skills',
    difficulty: req.body.difficulty || 'BEGINNER',
    duration: req.body.duration || `${modules.length || 1} modules`,
    instructorName,
    instructorBio: req.body.instructorBio || '',
    thumbnail: req.body.thumbnail || '',
    learningObjectives: req.body.learningObjectives || [],
    prerequisites: req.body.prerequisites || '',
    targetAudience: req.body.targetAudience || '',
    companyId: req.user.companyId,
    status: 'DRAFT',
    modules,
    skills: req.body.skills || [],
    assessmentId: assessment.id,
    videoUrl: req.body.videoUrl || ''
  };

  await query(
    `INSERT INTO assessments (id, course_id, title, passing_score, max_attempts, questions, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      assessment.id,
      assessment.courseId,
      assessment.title,
      assessment.passingScore,
      assessment.maxAttempts,
      JSON.stringify(assessment.questions)
    ]
  );

  await query(
    `INSERT INTO courses (
       id, title, description, detailed_description, thumbnail, category, difficulty, duration,
       instructor_name, instructor_bio, prerequisites, learning_objectives, target_audience,
       status, company_id, modules, skills, assessment_id, video_url, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())`,
    [
      course.id,
      course.title,
      course.description,
      course.detailedDescription,
      course.thumbnail,
      course.category,
      course.difficulty,
      course.duration,
      course.instructorName,
      course.instructorBio,
      course.prerequisites,
      JSON.stringify(course.learningObjectives),
      course.targetAudience,
      course.status,
      course.companyId,
      JSON.stringify(course.modules),
      JSON.stringify(course.skills),
      course.assessmentId,
      course.videoUrl
    ]
  );

  db.courses = db.courses || [];
  db.courses.push(course);
  db.assessments = db.assessments || [];
  db.assessments.push(assessment);

  await audit(req, 'COURSE_DRAFT_CREATED', 'COURSE', course.id);
  return response(res, course, 'Draft saved');
});

app.post('/api/v1/courses', requireAuth, allow('COMPANY'), async (req, res) => {
  if (!req.body.title || !req.body.description || !(req.body.modules || []).length) {
    return res.status(400).json({
      success: false,
      message: 'Title, description, and at least one module are required'
    });
  }

  const courseId = id();
  const assessmentId = id();

  const modules = req.body.modules.map(module =>
    normalizeModule({
      ...module,
      id: id(),
      lessons: module.lessons?.length
        ? module.lessons.map(lesson => ({ ...lesson, id: id() }))
        : [
            {
              id: id(),
              title: module.title,
              content: module.content || '',
              description: '',
              type: 'READING',
              duration: module.duration || '30 min'
            }
          ]
    })
  );

  let instructorName = req.body.instructorName;
  if (!instructorName) {
    const compRes = await query('SELECT name FROM companies WHERE id = $1', [req.user.companyId]);
    instructorName = compRes.rows[0]?.name || 'LearnForge provider';
  }

  const course = {
    id: courseId,
    title: req.body.title,
    description: req.body.description,
    detailedDescription: req.body.detailedDescription || req.body.description,
    category: req.body.category || 'Professional skills',
    difficulty: req.body.difficulty || 'BEGINNER',
    duration: req.body.duration || `${modules.length} modules`,
    instructorName,
    instructorBio: req.body.instructorBio || '',
    thumbnail: req.body.thumbnail || '',
    learningObjectives: req.body.learningObjectives || [],
    prerequisites: req.body.prerequisites || '',
    targetAudience: req.body.targetAudience || '',
    companyId: req.user.companyId,
    status: 'DRAFT',
    modules,
    skills: req.body.skills || [],
    assessmentId,
    videoUrl: req.body.videoUrl || ''
  };

  const assessment = {
    id: assessmentId,
    courseId: course.id,
    title: req.body.assessmentTitle || `${course.title} final assessment`,
    description: req.body.assessmentDescription || '',
    passingScore: Number(req.body.passingScore || 70),
    maxAttempts: Number(req.body.maxAttempts || 3),
    timeLimit: req.body.timeLimit || null,
    randomizeQuestions: Boolean(req.body.randomizeQuestions),
    showAnswersAfterSubmission: Boolean(req.body.showAnswersAfterSubmission),
    questions: (req.body.questions || []).map(question => ({
      ...question,
      id: question.id || id(),
      marks: Number(question.marks || 1),
      type: question.type || 'SINGLE',
      options: (question.options || []).map(opt => ({ ...opt, id: opt.id || id() }))
    }))
  };

  await query(
    `INSERT INTO assessments (id, course_id, title, passing_score, max_attempts, questions, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      assessment.id,
      assessment.courseId,
      assessment.title,
      assessment.passingScore,
      assessment.maxAttempts,
      JSON.stringify(assessment.questions)
    ]
  );

  await query(
    `INSERT INTO courses (
       id, title, description, detailed_description, thumbnail, category, difficulty, duration,
       instructor_name, instructor_bio, prerequisites, learning_objectives, target_audience,
       status, company_id, modules, skills, assessment_id, video_url, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())`,
    [
      course.id,
      course.title,
      course.description,
      course.detailedDescription,
      course.thumbnail,
      course.category,
      course.difficulty,
      course.duration,
      course.instructorName,
      course.instructorBio,
      course.prerequisites,
      JSON.stringify(course.learningObjectives),
      course.targetAudience,
      course.status,
      course.companyId,
      JSON.stringify(course.modules),
      JSON.stringify(course.skills),
      course.assessmentId,
      course.videoUrl
    ]
  );

  db.courses = db.courses || [];
  db.courses.push(course);
  db.assessments = db.assessments || [];
  db.assessments.push(assessment);

  await audit(req, 'COURSE_CREATED', 'COURSE', course.id);
  return response(res, course, 'Course created successfully');
});

app.patch('/api/v1/courses/:id', requireAuth, allow('COMPANY'), async (req, res) => {
  const { rows } = await query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  const course = mapCourse(rows[0]);
  if (!ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  const updatedTitle = req.body.title ?? course.title;
  const updatedDescription = req.body.description ?? course.description;
  const updatedDetailedDescription = req.body.detailedDescription ?? course.detailedDescription;
  const updatedCategory = req.body.category ?? course.category;
  const updatedDifficulty = req.body.difficulty ?? course.difficulty;
  const updatedDuration = req.body.duration ?? course.duration;
  const updatedInstructorName = req.body.instructorName ?? course.instructorName;
  const updatedInstructorBio = req.body.instructorBio ?? course.instructorBio;
  const updatedThumbnail = req.body.thumbnail ?? course.thumbnail;
  const updatedLearningObjectives = req.body.learningObjectives ?? course.learningObjectives;
  const updatedPrerequisites = req.body.prerequisites ?? course.prerequisites;
  const updatedTargetAudience = req.body.targetAudience ?? course.targetAudience;
  const updatedSkills = req.body.skills ?? course.skills;
  const updatedModules = req.body.modules
    ? req.body.modules.map((module, idx) =>
        normalizeModule({
          ...module,
          id: module.id || course.modules?.[idx]?.id || id()
        })
      )
    : course.modules;

  const updateRes = await query(
    `UPDATE courses SET
       title = $1, description = $2, detailed_description = $3, category = $4,
       difficulty = $5, duration = $6, instructor_name = $7, instructor_bio = $8,
       thumbnail = $9, learning_objectives = $10, prerequisites = $11,
       target_audience = $12, skills = $13, modules = $14, updated_at = NOW()
     WHERE id = $15
     RETURNING *`,
    [
      updatedTitle,
      updatedDescription,
      updatedDetailedDescription,
      updatedCategory,
      updatedDifficulty,
      updatedDuration,
      updatedInstructorName,
      updatedInstructorBio,
      updatedThumbnail,
      JSON.stringify(updatedLearningObjectives),
      updatedPrerequisites,
      updatedTargetAudience,
      JSON.stringify(updatedSkills),
      JSON.stringify(updatedModules),
      course.id
    ]
  );

  const updatedCourse = mapCourse(updateRes.rows[0]);
  const memIdx = (db.courses || []).findIndex(c => c.id === updatedCourse.id);
  if (memIdx >= 0) db.courses[memIdx] = updatedCourse;

  await audit(req, 'COURSE_UPDATED', 'COURSE', updatedCourse.id);
  return response(res, updatedCourse, 'Course updated successfully');
});

app.delete('/api/v1/courses/:id', requireAuth, allow('COMPANY'), async (req, res) => {
  const { rows } = await query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  const course = mapCourse(rows[0]);
  if (!ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  await query('DELETE FROM assessments WHERE course_id = $1 OR id = $2', [course.id, course.assessmentId]);
  await query('DELETE FROM enrollments WHERE course_id = $1', [course.id]);
  await query('DELETE FROM courses WHERE id = $1', [course.id]);

  db.courses = (db.courses || []).filter(c => c.id !== course.id);
  db.assessments = (db.assessments || []).filter(a => a.courseId !== course.id && a.id !== course.assessmentId);
  db.enrollments = (db.enrollments || []).filter(e => e.courseId !== course.id);

  await audit(req, 'COURSE_DELETED', 'COURSE', course.id);
  return response(res, null, 'Course deleted');
});

app.patch('/api/v1/courses/:id/publish', requireAuth, allow('COMPANY'), async (req, res) => {
  const { rows } = await query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  const course = mapCourse(rows[0]);
  if (!ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  if (course.status !== 'PUBLISHED') {
    const asmtRows = (await query('SELECT * FROM assessments WHERE course_id = $1 OR id = $2', [course.id, course.assessmentId])).rows;
    const assessments = asmtRows.map(mapAssessment);
    const errors = validateCourseForPublish(course, assessments);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: 'Course cannot be published',
        data: { errors }
      });
    }
  }

  const nextStatus = course.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED';
  const updateRes = await query(
    'UPDATE courses SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [nextStatus, course.id]
  );
  const updatedCourse = mapCourse(updateRes.rows[0]);

  const memIdx = (db.courses || []).findIndex(c => c.id === updatedCourse.id);
  if (memIdx >= 0) db.courses[memIdx] = updatedCourse;

  await audit(req, 'COURSE_PUBLICATION_CHANGED', 'COURSE', updatedCourse.id, {
    status: updatedCourse.status
  });
  return response(res, updatedCourse, `Course ${updatedCourse.status.toLowerCase()}`);
});

// Enrollment & Progress endpoints
app.post('/api/v1/enrollments', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.body.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }
  const course = mapCourse(courseRes.rows[0]);

  const existingRes = await query(
    'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [req.user.id, course.id]
  );

  let enrollment;
  if (existingRes.rows.length > 0) {
    enrollment = mapEnrollment(existingRes.rows[0]);
  } else {
    const enrId = id();
    const insertRes = await query(
      `INSERT INTO enrollments (id, user_id, course_id, progress, status, completed_modules, completed_lessons, started_at)
       VALUES ($1, $2, $3, 0, 'IN_PROGRESS', '[]', '[]', NOW())
       RETURNING *`,
      [enrId, req.user.id, course.id]
    );
    enrollment = mapEnrollment(insertRes.rows[0]);
    db.enrollments = db.enrollments || [];
    db.enrollments.push(enrollment);

    await notify(req.user.id, 'Enrollment confirmed', `You are enrolled in ${course.title}`);
    await audit(req, 'ENROLLMENT', 'COURSE', course.id);
  }

  return response(res, enrollment, 'Enrollment confirmed');
});

app.get('/api/v1/enrollments/me', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, c.id AS c_id, c.title AS c_title, c.description AS c_description,
            c.thumbnail AS c_thumbnail, c.category AS c_category, c.difficulty AS c_difficulty,
            c.duration AS c_duration, c.instructor_name AS c_instructor_name,
            c.modules AS c_modules, c.assessment_id AS c_assessment_id, c.status AS c_status
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE e.user_id = $1
     ORDER BY e.started_at DESC`,
    [req.user.id]
  );

  const list = rows.map(r => {
    const e = mapEnrollment(r);
    e.course = {
      id: r.c_id,
      title: r.c_title,
      description: r.c_description,
      thumbnail: r.c_thumbnail,
      category: r.c_category,
      difficulty: r.c_difficulty,
      duration: r.c_duration,
      instructorName: r.c_instructor_name,
      modules: r.c_modules,
      assessmentId: r.c_assessment_id,
      status: r.c_status
    };
    return e;
  });

  return response(res, list);
});

app.get('/api/v1/progress/:courseId/:moduleId', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }
  const course = ensureCourseIds(mapCourse(courseRes.rows[0]));

  const enrRes = await query(
    'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [req.user.id, req.params.courseId]
  );

  let enrollment;
  if (enrRes.rows.length > 0) {
    enrollment = mapEnrollment(enrRes.rows[0]);
  } else {
    const insertRes = await query(
      `INSERT INTO enrollments (id, user_id, course_id, progress, status, completed_modules, completed_lessons, started_at)
       VALUES ($1, $2, $3, 0, 'IN_PROGRESS', '[]', '[]', NOW())
       RETURNING *`,
      [id(), req.user.id, course.id]
    );
    enrollment = mapEnrollment(insertRes.rows[0]);
  }

  const module = course.modules.find(m => m.id === req.params.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  const completed = (enrollment.completedModules || []).includes(module.id);
  return response(res, {
    module,
    viewed: completed,
    completed,
    quizPassed: true
  });
});

app.post('/api/v1/progress/:courseId/:moduleId/read', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  return response(res, { viewed: true }, 'Content marked as read');
});

app.post(
  '/api/v1/progress/:courseId/:moduleId/lessons/:lessonId/complete',
  requireAuth,
  allow('LEARNER'),
  async (req, res) => {
    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
    if (!courseRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    const course = ensureCourseIds(mapCourse(courseRes.rows[0]));

    const enrRes = await query(
      'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, req.params.courseId]
    );

    let enrollment;
    if (enrRes.rows.length > 0) {
      enrollment = mapEnrollment(enrRes.rows[0]);
    } else {
      const insertRes = await query(
        `INSERT INTO enrollments (id, user_id, course_id, progress, status, completed_modules, completed_lessons, started_at)
         VALUES ($1, $2, $3, 0, 'IN_PROGRESS', '[]', '[]', NOW())
         RETURNING *`,
        [id(), req.user.id, course.id]
      );
      enrollment = mapEnrollment(insertRes.rows[0]);
    }

    const module = course.modules.find(item => item.id === req.params.moduleId) || course.modules[0];
    const lesson =
      module?.lessons?.find(item => item.id === req.params.lessonId) || module?.lessons?.[0];
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    const completedLessonIds = Array.isArray(enrollment.completedLessons) ? [...enrollment.completedLessons] : [];
    if (!completedLessonIds.includes(lesson.id)) {
      completedLessonIds.push(lesson.id);
      await query('UPDATE enrollments SET completed_lessons = $1 WHERE id = $2', [
        JSON.stringify(completedLessonIds),
        enrollment.id
      ]);
    }

    return response(
      res,
      {
        completedLessonIds,
        completedLessons: completedLessonIds
      },
      'Lesson completed'
    );
  }
);

app.post('/api/v1/progress', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.body.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }
  const course = ensureCourseIds(mapCourse(courseRes.rows[0]));

  const enrRes = await query(
    'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [req.user.id, course.id]
  );

  let enrollment;
  if (enrRes.rows.length > 0) {
    enrollment = mapEnrollment(enrRes.rows[0]);
  } else {
    const insertRes = await query(
      `INSERT INTO enrollments (id, user_id, course_id, progress, status, completed_modules, completed_lessons, started_at)
       VALUES ($1, $2, $3, 0, 'IN_PROGRESS', '[]', '[]', NOW())
       RETURNING *`,
      [id(), req.user.id, course.id]
    );
    enrollment = mapEnrollment(insertRes.rows[0]);
  }

  const module = course.modules.find(m => m.id === req.body.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  const completedModules = Array.isArray(enrollment.completedModules) ? [...enrollment.completedModules] : [];
  const completedLessons = Array.isArray(enrollment.completedLessons) ? [...enrollment.completedLessons] : [];

  module.lessons?.forEach(l => {
    if (!completedLessons.includes(l.id)) {
      completedLessons.push(l.id);
    }
  });

  if (module.id && !completedModules.includes(module.id)) {
    completedModules.push(module.id);
  }

  const progress = Math.min(100, Math.round((completedModules.length / (course.modules.length || 1)) * 100));
  const isCompleted = progress === 100;
  const status = isCompleted ? 'COMPLETED' : enrollment.status;
  const completedAt = isCompleted ? (enrollment.completedAt || new Date().toISOString()) : null;

  await query(
    `UPDATE enrollments SET
       progress = $1, completed_modules = $2, completed_lessons = $3, status = $4, completed_at = $5
     WHERE id = $6`,
    [progress, JSON.stringify(completedModules), JSON.stringify(completedLessons), status, completedAt, enrollment.id]
  );

  enrollment.progress = progress;
  enrollment.completedModules = completedModules;
  enrollment.completedLessons = completedLessons;
  enrollment.completedModuleIds = completedModules;
  enrollment.completedLessonIds = completedLessons;
  enrollment.status = status;
  enrollment.completedAt = completedAt;

  let certificate = null;
  if (isCompleted) {
    await notify(req.user.id, 'Course completed', `You completed ${course.title}`);

    // If final assessment was already taken and passed, automatically issue/update certificate
    const attemptsRes = await query(
      'SELECT * FROM attempts WHERE user_id = $1 AND assessment_id = $2',
      [req.user.id, course.assessmentId]
    );
    const userAttempts = attemptsRes.rows.map(mapAttempt);
    if (userAttempts.some(a => a.passed)) {
      const highestScore = Math.max(...userAttempts.map(a => a.score));
      const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const user = mapUser(userRes.rows[0]);
      certificate = await issueCertificate({
        user,
        course,
        score: highestScore
      });
    }
  }

  const memIdx = (db.enrollments || []).findIndex(e => e.id === enrollment.id);
  if (memIdx >= 0) db.enrollments[memIdx] = enrollment;
  else (db.enrollments = db.enrollments || []).push(enrollment);

  await audit(req, 'MODULE_COMPLETION', 'COURSE', course.id, { moduleId: module.id });
  return response(res, { ...enrollment, certificate }, 'Progress saved');
});

app.get('/api/v1/modules/:courseId/:moduleId/quiz', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }
  const course = ensureCourseIds(mapCourse(courseRes.rows[0]));
  const module = course.modules.find(m => m.id === req.params.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  return response(res, {
    moduleId: module.id,
    questions: (module.quiz || []).map(q => ({
      id: q.id,
      text: q.text,
      options: (q.options || []).map(({ correct, ...option }) => option)
    }))
  });
});

app.post('/api/v1/modules/:courseId/:moduleId/quiz', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }
  const course = ensureCourseIds(mapCourse(courseRes.rows[0]));
  const module = course.modules.find(m => m.id === req.params.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  const passed = (module.quiz || []).every(
    q => req.body.answers?.[q.id] && q.options.find(o => o.id === req.body.answers[q.id])?.correct
  );

  return response(
    res,
    { passed, score: passed ? 100 : 0 },
    passed ? 'Module quiz passed' : 'Review the content and try again'
  );
});

// Assessment endpoints
app.get('/api/v1/assessments/:id', requireAuth, async (req, res) => {
  const asmtRes = await query('SELECT * FROM assessments WHERE id = $1', [req.params.id]);
  if (!asmtRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Assessment not found'
    });
  }
  const assessment = mapAssessment(asmtRes.rows[0]);

  const attemptsRes = await query(
    'SELECT * FROM attempts WHERE assessment_id = $1 AND user_id = $2 ORDER BY submitted_at ASC',
    [assessment.id, req.user.id]
  );
  const userAttempts = attemptsRes.rows.map(mapAttempt);

  const maxAttempts = Number(assessment.maxAttempts || 3);
  const attemptsTaken = userAttempts.length;
  const remainingAttempts = Math.max(0, maxAttempts - attemptsTaken);
  const highestScore = userAttempts.length ? Math.max(...userAttempts.map(a => a.score)) : null;
  const passed = userAttempts.some(a => a.passed);

  return response(res, {
    ...assessment,
    questions: assessment.questions.map(q => ({
      ...q,
      options: (q.options || []).map(({ correct, ...option }) => option)
    })),
    attemptsTaken,
    maxAttempts,
    remainingAttempts,
    highestScore,
    passed,
    attempts: userAttempts
  });
});

app.patch('/api/v1/assessments/:id', requireAuth, allow('COMPANY'), async (req, res) => {
  const asmtRes = await query('SELECT * FROM assessments WHERE id = $1', [req.params.id]);
  if (!asmtRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Owned assessment not found'
    });
  }
  const assessment = mapAssessment(asmtRes.rows[0]);

  const courseRes = await query('SELECT * FROM courses WHERE assessment_id = $1 OR id = $2', [
    assessment.id,
    assessment.courseId
  ]);
  const course = courseRes.rows.length ? mapCourse(courseRes.rows[0]) : null;
  if (!course || !ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned assessment not found'
    });
  }

  const title = req.body.title ?? assessment.title;
  const passingScore = Number(req.body.passingScore ?? assessment.passingScore);
  const maxAttempts = Number(req.body.maxAttempts ?? assessment.maxAttempts);
  const questions = req.body.questions
    ? req.body.questions.map(question => ({
        ...question,
        id: question.id || id(),
        marks: Number(question.marks || 1),
        type: question.type || 'SINGLE'
      }))
    : assessment.questions;

  const updateRes = await query(
    `UPDATE assessments SET title = $1, passing_score = $2, max_attempts = $3, questions = $4 WHERE id = $5 RETURNING *`,
    [title, passingScore, maxAttempts, JSON.stringify(questions), assessment.id]
  );
  const updatedAssessment = mapAssessment(updateRes.rows[0]);

  const memIdx = (db.assessments || []).findIndex(a => a.id === updatedAssessment.id);
  if (memIdx >= 0) db.assessments[memIdx] = updatedAssessment;

  return response(res, updatedAssessment, 'Assessment updated');
});

app.post('/api/v1/assessments/:id/submit', requireAuth, allow('LEARNER'), async (req, res) => {
  const asmtRes = await query('SELECT * FROM assessments WHERE id = $1', [req.params.id]);
  if (!asmtRes.rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Assessment not found'
    });
  }
  const assessment = mapAssessment(asmtRes.rows[0]);

  const maxAttempts = Number(assessment.maxAttempts || 3);
  const priorAttemptsRes = await query(
    'SELECT * FROM attempts WHERE assessment_id = $1 AND user_id = $2 ORDER BY submitted_at ASC',
    [assessment.id, req.user.id]
  );
  const priorAttempts = priorAttemptsRes.rows.map(mapAttempt);

  if (priorAttempts.length >= maxAttempts) {
    return res.status(400).json({
      success: false,
      message: `Maximum assessment attempts (${maxAttempts}) reached. No further attempts are allowed.`
    });
  }

  const maxMarks = assessment.questions.reduce(
    (total, question) => total + Number(question.marks || 1),
    0
  );

  let earnedMarks = 0;
  assessment.questions.forEach(q => {
    const answer = req.body.answers?.[q.id];
    const correct = (q.options || [])
      .filter(o => o.correct)
      .map(o => o.id)
      .sort()
      .join(',');
    const given = Array.isArray(answer) ? [...answer].sort().join(',') : answer;
    if (given === correct) {
      earnedMarks += Number(q.marks || 1);
    }
  });

  const score = maxMarks ? Math.round((earnedMarks / maxMarks) * 100) : 0;
  const isPassed = score >= assessment.passingScore;
  const attemptNumber = priorAttempts.length + 1;

  const attempt = {
    id: id(),
    userId: req.user.id,
    assessmentId: assessment.id,
    score,
    earnedMarks,
    maxMarks,
    passed: isPassed,
    attemptNumber,
    answers: req.body.answers || {},
    submittedAt: now()
  };

  await query(
    `INSERT INTO attempts (id, user_id, assessment_id, score, passed, answers, attempt_number, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      attempt.id,
      attempt.userId,
      attempt.assessmentId,
      attempt.score,
      attempt.passed,
      JSON.stringify(attempt.answers),
      attempt.attemptNumber
    ]
  );

  db.attempts = db.attempts || [];
  db.attempts.push(attempt);

  const allUserAttempts = [...priorAttempts, attempt];
  const highestScore = Math.max(...allUserAttempts.map(a => a.score));
  const hasEverPassed = allUserAttempts.some(a => a.passed);

  const courseRes = await query(
    'SELECT * FROM courses WHERE assessment_id = $1 OR id = $2',
    [assessment.id, assessment.courseId]
  );
  const course = courseRes.rows.length ? mapCourse(courseRes.rows[0]) : null;

  let enrollment = null;
  if (course) {
    const enrRes = await query(
      'SELECT * FROM enrollments WHERE course_id = $1 AND user_id = $2',
      [course.id, req.user.id]
    );
    if (enrRes.rows.length) {
      enrollment = mapEnrollment(enrRes.rows[0]);
    }
  }

  const allModulesDone =
    course &&
    enrollment &&
    course.modules.length > 0 &&
    course.modules.every(m => (enrollment.completedModules || []).includes(m.id));

  let certificate = null;
  if (hasEverPassed && (enrollment?.status === 'COMPLETED' || allModulesDone)) {
    if (enrollment) {
      await query(
        `UPDATE enrollments SET status = 'COMPLETED', progress = 100, completed_at = COALESCE(completed_at, NOW()) WHERE id = $1`,
        [enrollment.id]
      );
      enrollment.status = 'COMPLETED';
      enrollment.progress = 100;
    }
    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = mapUser(userRes.rows[0]);
    certificate = await issueCertificate({
      user,
      course,
      score: highestScore
    });
  }

  await notify(
    req.user.id,
    'Assessment result',
    `You scored ${score}% (Attempt ${allUserAttempts.length}/${maxAttempts}). Maximum score: ${highestScore}%. ${
      isPassed ? 'You passed!' : allUserAttempts.length < maxAttempts ? 'You can try again.' : 'Attempts exhausted.'
    }`
  );

  await audit(req, 'ASSESSMENT_SUBMISSION', 'ASSESSMENT', assessment.id, {
    score,
    highestScore,
    attemptNumber: allUserAttempts.length
  });

  return response(
    res,
    {
      ...attempt,
      highestScore,
      attemptsTaken: allUserAttempts.length,
      maxAttempts,
      remainingAttempts: Math.max(0, maxAttempts - allUserAttempts.length),
      certificate
    },
    isPassed ? 'Assessment passed' : 'Assessment not passed'
  );
});

// Certification eligibility & Issuing
app.get('/api/v1/certifications/eligibility/:courseId', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({ success: false, message: 'Course not found' });
  }
  const course = mapCourse(courseRes.rows[0]);

  const enrRes = await query(
    'SELECT * FROM enrollments WHERE course_id = $1 AND user_id = $2',
    [course.id, req.user.id]
  );
  const enrollment = enrRes.rows.length ? mapEnrollment(enrRes.rows[0]) : { completedModuleIds: [] };

  const attemptsRes = await query(
    'SELECT * FROM attempts WHERE user_id = $1 AND passed = true AND assessment_id = $2',
    [req.user.id, course.assessmentId]
  );
  const passed = attemptsRes.rows.length > 0;

  return response(
    res,
    new CertificationEligibilityService().evaluate({
      course,
      enrollment,
      assessmentPassed: passed
    })
  );
});

app.post('/api/v1/certificates/issue/:courseId', requireAuth, allow('LEARNER'), async (req, res) => {
  const courseRes = await query('SELECT * FROM courses WHERE id = $1', [req.params.courseId]);
  if (!courseRes.rows.length) {
    return res.status(404).json({ success: false, message: 'Course not found' });
  }
  const course = mapCourse(courseRes.rows[0]);

  const enrRes = await query(
    'SELECT * FROM enrollments WHERE course_id = $1 AND user_id = $2',
    [course.id, req.user.id]
  );
  const enrollment = enrRes.rows.length ? mapEnrollment(enrRes.rows[0]) : null;

  const attemptsRes = await query(
    'SELECT * FROM attempts WHERE user_id = $1 AND assessment_id = $2',
    [req.user.id, course.assessmentId]
  );
  const userAttempts = attemptsRes.rows.map(mapAttempt);
  const passed = userAttempts.some(a => a.passed);

  if (enrollment?.status !== 'COMPLETED' || !passed) {
    return res.status(400).json({
      success: false,
      message: 'Certificate is generated automatically only after course completion and a passing final assessment'
    });
  }

  const highestScore = Math.max(...userAttempts.map(a => a.score));
  const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = mapUser(userRes.rows[0]);

  const certificate = await issueCertificate({
    user,
    course,
    score: highestScore
  });

  return response(res, certificate, 'Certificate available');
});

app.get('/api/v1/certificates/me', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM certificates WHERE learner_id = $1 ORDER BY issued_date DESC',
    [req.user.id]
  );
  return response(res, rows.map(mapCertificate));
});

app.get('/api/v1/certificates/:certificateId/pdf', async (req, res) => {
  const queryStr = String(req.params.certificateId || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT * FROM certificates
     WHERE LOWER(certificate_id) = LOWER($1)
        OR LOWER(certificate_number) = LOWER($1)
        OR LOWER(id) = LOWER($1)`,
    [queryStr]
  );

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Certificate not found'
    });
  }

  const certificate = mapCertificate(rows[0]);
  try {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${certificate.certificateId}.pdf`);
    res.send(await readCertificatePdf(certificate.certificateId));
  } catch {
    res.status(404).json({
      success: false,
      message: 'Certificate PDF not found'
    });
  }
});

// Verification handler supporting direct IDs, certificate numbers, and QR-code route formats
const handleCertificateVerification = async (req, res) => {
  const rawQuery = String(req.params.certificateId || '').trim();
  const normalizedQuery = rawQuery.toLowerCase();

  if (!normalizedQuery) {
    return res.status(400).json({
      success: false,
      message: 'Certificate identifier is required'
    });
  }

  const cacheKey = `certificate:${normalizedQuery}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    return response(res, cached);
  }

  const { rows } = await query(
    `SELECT * FROM certificates
     WHERE LOWER(certificate_id) = LOWER($1)
        OR LOWER(certificate_number) = LOWER($1)
        OR LOWER(id) = LOWER($1)`,
    [normalizedQuery]
  );

  const certificate = rows.length ? mapCertificate(rows[0]) : null;

  await query(
    `INSERT INTO verifications (id, certificate_id, searched_query, requested_at, ip)
     VALUES ($1, $2, $3, NOW(), $4)`,
    [id(), certificate ? certificate.certificateId : rawQuery, rawQuery, req.ip || null]
  );

  if (!certificate) {
    return res.status(404).json({
      success: false,
      message: 'Certificate not found'
    });
  }

  await audit(req, 'CERTIFICATE_VERIFICATION', 'CERTIFICATE', certificate.id);
  const result = {
    valid: certificate.status === 'VALID',
    status: certificate.status,
    certificateId: certificate.certificateId,
    certificateNumber: certificate.certificateNumber,
    learnerName: certificate.learnerName,
    courseName: certificate.courseName,
    certification: certificate.certification,
    issuedBy: certificate.issuedBy,
    score: certificate.score,
    completionDate: certificate.completionDate,
    issuedDate: certificate.issuedDate,
    expiryDate: certificate.expiryDate,
    pdfUrl: certificate.pdfUrl,
    skills: certificate.skills
  };

  await setCached(cacheKey, result);
  return response(res, result);
};

app.get('/api/v1/verify/certificate/:certificateId', handleCertificateVerification);
app.get('/api/v1/verify/:certificateId', handleCertificateVerification);

app.post('/api/v1/certificates/:id/revoke', requireAuth, allow('ADMIN', 'COMPANY'), async (req, res) => {
  if (!req.body.reason) {
    return res.status(400).json({
      success: false,
      message: 'Certificate and revocation reason are required'
    });
  }

  const { rows } = await query(
    'SELECT * FROM certificates WHERE id = $1 OR certificate_id = $1',
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Certificate not found'
    });
  }

  const revocation = {
    reason: req.body.reason,
    actorId: req.user.id,
    timestamp: now()
  };

  const updateRes = await query(
    `UPDATE certificates SET status = 'REVOKED', revocation = $1 WHERE id = $2 RETURNING *`,
    [JSON.stringify(revocation), rows[0].id]
  );
  const certificate = mapCertificate(updateRes.rows[0]);

  await invalidateCached(`certificate:${certificate.certificateId.toLowerCase()}`);
  await audit(req, 'CERTIFICATE_REVOKED', 'CERTIFICATE', certificate.id, revocation);
  await notify(certificate.learnerId, 'Certificate revoked', 'Your certificate status has changed.');

  const memIdx = (db.certificates || []).findIndex(c => c.id === certificate.id);
  if (memIdx >= 0) db.certificates[memIdx] = certificate;

  return response(res, certificate, 'Certificate revoked');
});

// General portal dashboards
app.get('/api/v1/dashboard', requireAuth, async (req, res) => {
  const [userRes, enrollmentsRes, certificatesRes, notificationsRes] = await Promise.all([
    query('SELECT * FROM users WHERE id = $1', [req.user.id]),
    query(
      `SELECT e.*, c.id AS c_id, c.title AS c_title, c.description AS c_description,
              c.thumbnail AS c_thumbnail, c.category AS c_category, c.difficulty AS c_difficulty,
              c.duration AS c_duration, c.instructor_name AS c_instructor_name,
              c.modules AS c_modules, c.assessment_id AS c_assessment_id, c.status AS c_status
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = $1
       ORDER BY e.started_at DESC`,
      [req.user.id]
    ),
    query('SELECT * FROM certificates WHERE learner_id = $1 ORDER BY issued_date DESC', [req.user.id]),
    query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5', [req.user.id])
  ]);

  const user = userRes.rows.length ? mapUser(userRes.rows[0]) : req.user;
  const enrollments = enrollmentsRes.rows.map(r => {
    const e = mapEnrollment(r);
    e.course = {
      id: r.c_id,
      title: r.c_title,
      description: r.c_description,
      thumbnail: r.c_thumbnail,
      category: r.c_category,
      difficulty: r.c_difficulty,
      duration: r.c_duration,
      instructorName: r.c_instructor_name,
      modules: r.c_modules,
      assessmentId: r.c_assessment_id,
      status: r.c_status
    };
    return e;
  });

  return response(res, {
    user: publicUser(user),
    enrollments,
    certificates: certificatesRes.rows.map(mapCertificate),
    notifications: notificationsRes.rows.map(mapNotification)
  });
});

app.get('/api/v1/notifications', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  return response(res, rows.map(mapNotification));
});

app.get('/api/v1/companies', async (req, res) => {
  const { rows } = await query('SELECT * FROM companies ORDER BY name ASC');
  return response(res, rows.map(mapCompany));
});

app.get('/api/v1/audit', requireAuth, allow('ADMIN'), async (req, res) => {
  const { rows } = await query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
  return response(res, rows.map(mapAuditLog));
});

// Admin portal endpoints
app.get('/api/v1/admin/overview', requireAuth, allow('ADMIN'), async (req, res) => {
  const [
    learnersCountRes,
    companiesCountRes,
    coursesCountRes,
    enrollmentsCountRes,
    certificatesCountRes,
    revokedCountRes,
    verificationsCountRes,
    pendingCompaniesCountRes,
    auditLogsRes
  ] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM users WHERE role = 'LEARNER'"),
    query('SELECT COUNT(*) AS count FROM companies'),
    query('SELECT COUNT(*) AS count FROM courses'),
    query('SELECT COUNT(*) AS count FROM enrollments'),
    query('SELECT COUNT(*) AS count FROM certificates'),
    query("SELECT COUNT(*) AS count FROM certificates WHERE status = 'REVOKED'"),
    query('SELECT COUNT(*) AS count FROM verifications'),
    query("SELECT COUNT(*) AS count FROM pending_company_registrations WHERE status = 'PENDING'"),
    query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 20')
  ]);

  return response(res, {
    learners: parseInt(learnersCountRes.rows[0]?.count || 0, 10),
    companies: parseInt(companiesCountRes.rows[0]?.count || 0, 10),
    courses: parseInt(coursesCountRes.rows[0]?.count || 0, 10),
    enrollments: parseInt(enrollmentsCountRes.rows[0]?.count || 0, 10),
    certificates: parseInt(certificatesCountRes.rows[0]?.count || 0, 10),
    revoked: parseInt(revokedCountRes.rows[0]?.count || 0, 10),
    verifications: parseInt(verificationsCountRes.rows[0]?.count || 0, 10),
    pendingCompanies: parseInt(pendingCompaniesCountRes.rows[0]?.count || 0, 10),
    auditLogs: auditLogsRes.rows.map(mapAuditLog)
  });
});

app.get(
  ['/api/v1/admin/pending-companies', '/api/v1/admin/pending-approvals'],
  requireAuth,
  allow('ADMIN'),
  async (req, res) => {
    const { rows } = await query(
      "SELECT * FROM pending_company_registrations WHERE status = 'PENDING' ORDER BY created_at ASC"
    );
    const list = rows.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      companyName: p.company_name || '',
      role: p.role || 'COMPANY',
      status: p.status || 'PENDING',
      createdAt: p.created_at
    }));
    return response(res, list);
  }
);

app.post(
  ['/api/v1/admin/pending-companies/:id/approve', '/api/v1/admin/pending-approvals/:id/approve'],
  requireAuth,
  allow('ADMIN'),
  async (req, res) => {
    const pendingId = req.params.id;
    const { rows: pendingRows } = await query(
      'SELECT * FROM pending_company_registrations WHERE id = $1',
      [pendingId]
    );

    if (!pendingRows.length) {
      return res.status(404).json({
        success: false,
        message: 'Pending registration not found'
      });
    }

    const pending = mapPendingCompany(pendingRows[0]);
    let company = null;
    let companyId = null;

    if (pending.role === 'COMPANY') {
      company = {
        id: id(),
        name: pending.companyName || `${pending.name}'s Company`,
        description: '',
        website: ''
      };
      await query(
        `INSERT INTO companies (id, name, description, website) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [company.id, company.name, company.description, company.website]
      );
      companyId = company.id;
      db.companies = db.companies || [];
      db.companies.push(company);
    }

    const user = {
      id: id(),
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
      role: pending.role || 'COMPANY',
      companyId,
      active: true
    };

    await query(
      `INSERT INTO users (id, name, email, password_hash, role, company_id, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [user.id, user.name, user.email, user.passwordHash, user.role, user.companyId, user.active]
    );

    db.users = db.users || [];
    db.users.push(user);

    await query('DELETE FROM pending_company_registrations WHERE id = $1', [pendingId]);
    db.pendingCompanyRegistrations = (db.pendingCompanyRegistrations || []).filter(p => p.id !== pendingId);

    await audit(req, `${user.role}_APPROVED`, 'USER', user.id, {
      approvedRole: user.role,
      companyName: company?.name || pending.companyName || null,
      approvedUserName: user.name,
      approvedUserEmail: user.email,
      userName: req.user.name,
      userRole: req.user.role
    });

    return response(
      res,
      {
        company,
        user: publicUser(user)
      },
      `${user.role} account for "${user.name}" approved successfully. User added to database.`
    );
  }
);

app.post(
  ['/api/v1/admin/pending-companies/:id/reject', '/api/v1/admin/pending-approvals/:id/reject'],
  requireAuth,
  allow('ADMIN'),
  async (req, res) => {
    const pendingId = req.params.id;
    const { rows: pendingRows } = await query(
      'SELECT * FROM pending_company_registrations WHERE id = $1',
      [pendingId]
    );

    if (!pendingRows.length) {
      return res.status(404).json({
        success: false,
        message: 'Pending registration not found'
      });
    }

    const pending = mapPendingCompany(pendingRows[0]);
    await query('DELETE FROM pending_company_registrations WHERE id = $1', [pendingId]);
    db.pendingCompanyRegistrations = (db.pendingCompanyRegistrations || []).filter(p => p.id !== pendingId);

    await audit(req, `${pending.role || 'USER'}_REJECTED`, 'REGISTRATION_PENDING', pendingId, {
      rejectedRole: pending.role,
      rejectedCompanyName: pending.companyName,
      rejectedUserName: pending.name,
      rejectedEmail: pending.email,
      userName: req.user.name,
      userRole: req.user.role
    });

    return response(
      res,
      { id: pendingId },
      `Registration request for "${pending.name}" (${pending.role}) rejected.`
    );
  }
);

app.get('/api/v1/admin/users', requireAuth, allow('ADMIN'), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.active, u.company_id, c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON u.company_id = c.id
     ORDER BY u.created_at ASC`
  );

  const users = rows.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active ?? true,
    companyId: u.company_id,
    companyName: u.company_name || null
  }));

  return response(res, users);
});

app.patch('/api/v1/admin/users/:id', requireAuth, allow('ADMIN'), async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const user = mapUser(rows[0]);

  // Admin cannot change user roles
  if (req.body.role !== undefined) {
    return res.status(400).json({
      success: false,
      message: 'Admin cannot change user roles. Role modification is disabled.'
    });
  }

  if (typeof req.body.active === 'boolean') {
    if (user.role === 'ADMIN' && req.body.active === false) {
      return res.status(400).json({
        success: false,
        message: 'The primary system administrator account cannot be deactivated.'
      });
    }
    user.active = req.body.active;
    await query('UPDATE users SET active = $1 WHERE id = $2', [user.active, user.id]);
    const memUser = (db.users || []).find(u => u.id === user.id);
    if (memUser) memUser.active = user.active;
  }

  await audit(req, 'USER_UPDATED', 'USER', user.id, {
    active: user.active
  });

  return response(res, publicUser(user), 'User updated successfully');
});

app.delete('/api/v1/admin/users/:id', requireAuth, allow('ADMIN'), async (req, res) => {
  const userId = req.params.id;
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const targetUser = mapUser(rows[0]);

  // Prevent deleting primary admin account
  if (targetUser.role === 'ADMIN' || targetUser.id === 'u-admin' || targetUser.email === 'admin@example.com') {
    return res.status(400).json({
      success: false,
      message: 'The primary system administrator account cannot be deleted.'
    });
  }

  // Require account to be deactivated before deletion
  if (targetUser.active) {
    return res.status(400).json({
      success: false,
      message: 'Account must be deactivated before it can be deleted.'
    });
  }

  await query('DELETE FROM users WHERE id = $1', [userId]);

  db.users = (db.users || []).filter(u => u.id !== userId);
  db.enrollments = (db.enrollments || []).filter(e => e.userId !== userId);
  db.attempts = (db.attempts || []).filter(a => a.userId !== userId);
  db.certificates = (db.certificates || []).filter(c => c.learnerId !== userId);
  db.notifications = (db.notifications || []).filter(n => n.userId !== userId);

  await audit(req, 'USER_DELETED', 'USER', userId, {
    email: targetUser.email,
    name: targetUser.name,
    role: targetUser.role
  });

  return response(res, { id: userId }, 'User permanently deleted from database');
});

app.get('/api/v1/admin/certificates', requireAuth, allow('ADMIN'), async (req, res) => {
  const { rows } = await query('SELECT * FROM certificates ORDER BY issued_date DESC');
  return response(res, rows.map(mapCertificate));
});

// HR portal endpoints
app.get('/api/v1/hr/overview', requireAuth, allow('HR', 'ADMIN'), async (req, res) => {
  const [
    totalCertsRes,
    validCertsRes,
    revokedCertsRes,
    totalVerifsRes,
    recentCertsRes,
    recentVerifsRes
  ] = await Promise.all([
    query('SELECT COUNT(*) AS count FROM certificates'),
    query("SELECT COUNT(*) AS count FROM certificates WHERE status = 'VALID'"),
    query("SELECT COUNT(*) AS count FROM certificates WHERE status = 'REVOKED'"),
    query('SELECT COUNT(*) AS count FROM verifications'),
    query('SELECT * FROM certificates ORDER BY issued_date DESC LIMIT 10'),
    query('SELECT * FROM verifications ORDER BY requested_at DESC LIMIT 10')
  ]);

  return response(res, {
    certificatesCount: parseInt(totalCertsRes.rows[0]?.count || 0, 10),
    validCertificates: parseInt(validCertsRes.rows[0]?.count || 0, 10),
    revokedCertificates: parseInt(revokedCertsRes.rows[0]?.count || 0, 10),
    verificationsCount: parseInt(totalVerifsRes.rows[0]?.count || 0, 10),
    recentCertificates: recentCertsRes.rows.map(mapCertificate),
    recentVerifications: recentVerifsRes.rows.map(mapVerification)
  });
});

app.get('/api/v1/hr/certificates', requireAuth, allow('HR', 'ADMIN'), async (req, res) => {
  const { rows } = await query('SELECT * FROM certificates ORDER BY issued_date DESC');
  return response(res, rows.map(mapCertificate));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Unexpected server error'
  });
});

export default app;
