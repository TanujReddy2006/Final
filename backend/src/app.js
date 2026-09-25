import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { db, query, id, now, persistDatabase, isDatabaseConnected, mapCourse } from './config/database.js';
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

app.use((req, res, next) => {
  res.on('finish', () => {
    persistDatabase().catch(error =>
      console.warn(`Could not persist request changes: ${error.message}`)
    );
  });
  next();
});

const response = (res, data, message = '') =>
  res.json({
    success: true,
    message,
    data
  });

const audit = async (req, action, entityType, entityId, metadata = {}) => {
  await query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, timestamp, status, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)`,
    [
      id(),
      req.user?.id || null,
      action,
      entityType,
      entityId,
      'SUCCESS',
      JSON.stringify(metadata),
      req.ip
    ]
  );
};

const notify = async (userId, title, body) => {
  await query(
    `INSERT INTO notifications (id, user_id, title, body, read, created_at)
     VALUES ($1, $2, $3, $4, false, now())`,
    [id(), userId, title, body]
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

const courseWithCompany = course => ({
  ...ensureCourseIds(course),
  company: db.companies.find(company => company.id === course.companyId)
});

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

  // Check email uniqueness across PostgreSQL and db.users
  const existingEmailInDb = db.users.some(u => u.email && u.email.toLowerCase() === email);
  const { rows: existingEmailRows } = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existingEmailInDb || existingEmailRows.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'Email already registered'
    });
  }

  let companyId = null;
  if (role === 'COMPANY') {
    const company = {
      id: id(),
      name: companyName || `${name}'s Company`,
      description: '',
      website: ''
    };
    await query(
      `INSERT INTO companies (id, name, description, website) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [company.id, company.name, company.description, company.website]
    );
    db.companies.push(company);
    companyId = company.id;
  }

  const user = {
    id: id(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    companyId,
    active: true
  };

  await query(
    `INSERT INTO users (id, name, email, password_hash, role, company_id, active) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, user.name, user.email, user.passwordHash, user.role, user.companyId, user.active]
  );
  db.users.push(user);
  persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));

  audit(req, 'REGISTER', 'USER', user.id);

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

  const user = db.users.find(u => u.email && u.email.toLowerCase() === email);
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
  audit(req, 'LOGIN', 'USER', user.id);
  return response(
    res,
    {
      user: publicUser(user),
      token: signToken(user)
    },
    'Welcome back'
  );
});

app.post('/api/v1/auth/logout', requireAuth, (req, res) => {
  audit(req, 'LOGOUT', 'USER', req.user.id);
  response(res, null, 'Logged out');
});

app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  return response(res, publicUser(user));
});

app.patch('/api/v1/users/me', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const rawName = req.body.name;
  if (!rawName || typeof rawName !== 'string' || rawName.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required (at least 2 characters)'
    });
  }

  const name = rawName.trim();
  user.name = name;
  await query('UPDATE users SET name = $1 WHERE id = $2', [name, userId]);
  await persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));

  audit(req, 'NAME_UPDATED', 'USER', userId, { name });
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

  // Combine PostgreSQL rows with db.courses so changes (like publishing) are immediately visible
  const memPublished = db.courses.filter(c => c.status === 'PUBLISHED');
  const courseMap = new Map();

  if (isDatabaseConnected()) {
    try {
      const { rows } = await query('SELECT * FROM courses WHERE status = $1', ['PUBLISHED']);
      if (rows && rows.length > 0) {
        for (const row of rows) {
          const c = mapCourse(row);
          courseMap.set(c.id, c);
        }
      }
    } catch (err) {
      console.warn('PostgreSQL courses query failed:', err.message);
    }
  }

  // In-memory has latest edits/publishes from current server session
  for (const c of memPublished) {
    courseMap.set(c.id, c);
  }

  let list = Array.from(courseMap.values());
  if (search) {
    list = list.filter(c =>
      `${c.title} ${c.description} ${c.category} ${c.instructorName}`.toLowerCase().includes(search)
    );
  }

  response(res, list.map(courseWithCompany));
});

app.get('/api/v1/courses/:id', async (req, res) => {
  let course = db.courses.find(c => c.id === req.params.id);
  if ((!course || course.status !== 'PUBLISHED') && isDatabaseConnected()) {
    try {
      const { rows } = await query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
      if (rows && rows.length > 0) {
        course = mapCourse(rows[0]);
      }
    } catch (err) {
      console.warn('PostgreSQL course by id query failed:', err.message);
    }
  }

  if (!course || course.status !== 'PUBLISHED') {
    return res.status(404).json({
      success: false,
      message: 'Published course not found'
    });
  }
  response(res, courseWithCompany(course));
});

// Company course endpoints
app.get('/api/v1/company/courses', requireAuth, allow('COMPANY'), (req, res) =>
  response(
    res,
    db.courses.filter(course => course.companyId === req.user.companyId).map(courseWithCompany)
  )
);

app.get('/api/v1/company/courses/:id', requireAuth, allow('COMPANY'), (req, res) => {
  const course = db.courses.find(item => item.id === req.params.id);
  if (!course || !ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }
  response(res, courseWithCompany(course));
});

app.get('/api/v1/company/overview', requireAuth, allow('COMPANY'), (req, res) => {
  const courses = db.courses.filter(course => course.companyId === req.user.companyId);
  const courseIds = new Set(courses.map(course => course.id));
  const enrollments = db.enrollments.filter(enrollment => courseIds.has(enrollment.courseId));

  response(res, {
    courses: courses.map(courseWithCompany),
    metrics: {
      totalCourses: courses.length,
      publishedCourses: courses.filter(course => course.status === 'PUBLISHED').length,
      draftCourses: courses.filter(course => course.status === 'DRAFT').length,
      totalLearners: new Set(enrollments.map(enrollment => enrollment.userId)).size,
      completionRate: enrollments.length
        ? Math.round(
            (enrollments.filter(enrollment => enrollment.status === 'COMPLETED').length /
              enrollments.length) *
              100
          )
        : 0
    }
  });
});

app.get('/api/v1/company/learners', requireAuth, allow('COMPANY'), (req, res) => {
  const courses = db.courses.filter(c => c.companyId === req.user.companyId);
  const courseIds = new Set(courses.map(c => c.id));
  const enrollments = db.enrollments.filter(e => courseIds.has(e.courseId));

  const list = enrollments.map(enrollment => {
    const learner = db.users.find(u => u.id === enrollment.userId);
    const course = courses.find(c => c.id === enrollment.courseId);
    const cert = db.certificates.find(
      c => c.courseId === enrollment.courseId && c.learnerId === enrollment.userId
    );
    return {
      id: enrollment.id,
      enrollmentId: enrollment.id,
      userId: enrollment.userId,
      learnerName: learner?.name || 'Learner',
      learnerEmail: learner?.email || '',
      courseId: enrollment.courseId,
      courseTitle: course?.title || 'Unknown course',
      progress: enrollment.progress || 0,
      status: enrollment.status || 'IN_PROGRESS',
      lastAccessed: enrollment.lastAccessed,
      certified: Boolean(cert),
      certificateId: cert?.certificateId || null
    };
  });

  response(res, list);
});

app.post('/api/v1/courses/draft', requireAuth, allow('COMPANY'), (req, res) => {
  if (!req.body.title || !req.body.description) {
    return res.status(400).json({
      success: false,
      message: 'Title and description are required to save a draft'
    });
  }

  const assessment = {
    id: id(),
    courseId: id(),
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

  const course = {
    id: assessment.courseId,
    title: req.body.title,
    description: req.body.description,
    detailedDescription: req.body.detailedDescription || req.body.description,
    category: req.body.category || 'Professional skills',
    difficulty: req.body.difficulty || 'BEGINNER',
    duration: req.body.duration || `${modules.length || 1} modules`,
    instructorName:
      req.body.instructorName ||
      db.companies.find(company => company.id === req.user.companyId)?.name ||
      'LearnForge provider',
    instructorBio: req.body.instructorBio || '',
    thumbnail: req.body.thumbnail || '',
    learningObjectives: req.body.learningObjectives || [],
    prerequisites: req.body.prerequisites || '',
    targetAudience: req.body.targetAudience || '',
    companyId: req.user.companyId,
    status: 'DRAFT',
    modules,
    skills: req.body.skills || [],
    assessmentId: assessment.id
  };

  assessment.courseId = course.id;
  db.courses.push(course);
  db.assessments.push(assessment);
  persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));
  audit(req, 'COURSE_DRAFT_CREATED', 'COURSE', course.id);
  response(res, courseWithCompany(course), 'Draft saved');
});

app.post('/api/v1/courses', requireAuth, allow('COMPANY'), (req, res) => {
  if (!req.body.title || !req.body.description || !(req.body.modules || []).length) {
    return res.status(400).json({
      success: false,
      message: 'Title, description, and at least one module are required'
    });
  }

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

  const course = {
    id: id(),
    title: req.body.title,
    description: req.body.description,
    detailedDescription: req.body.detailedDescription || req.body.description,
    category: req.body.category || 'Professional skills',
    difficulty: req.body.difficulty || 'BEGINNER',
    duration: req.body.duration || `${modules.length} modules`,
    instructorName:
      req.body.instructorName ||
      db.companies.find(company => company.id === req.user.companyId)?.name,
    instructorBio: req.body.instructorBio || '',
    thumbnail: req.body.thumbnail || '',
    learningObjectives: req.body.learningObjectives || [],
    prerequisites: req.body.prerequisites || '',
    targetAudience: req.body.targetAudience || '',
    companyId: req.user.companyId,
    status: 'DRAFT',
    modules,
    skills: req.body.skills || [],
    assessmentId: null
  };

  const assessment = {
    id: id(),
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
      type: question.type || 'SINGLE'
    }))
  };

  course.assessmentId = assessment.id;
  db.courses.push(course);
  db.assessments.push(assessment);
  persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));
  audit(req, 'COURSE_CREATED', 'COURSE', course.id);
  response(res, courseWithCompany(course), 'Course created successfully');
});

app.patch('/api/v1/courses/:id', requireAuth, allow('COMPANY'), (req, res) => {
  const course = db.courses.find(item => item.id === req.params.id);
  if (!course || !ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  Object.assign(course, {
    title: req.body.title ?? course.title,
    description: req.body.description ?? course.description,
    detailedDescription: req.body.detailedDescription ?? course.detailedDescription,
    category: req.body.category ?? course.category,
    difficulty: req.body.difficulty ?? course.difficulty,
    duration: req.body.duration ?? course.duration,
    instructorName: req.body.instructorName ?? course.instructorName,
    instructorBio: req.body.instructorBio ?? course.instructorBio,
    thumbnail: req.body.thumbnail ?? course.thumbnail,
    learningObjectives: req.body.learningObjectives ?? course.learningObjectives,
    prerequisites: req.body.prerequisites ?? course.prerequisites,
    targetAudience: req.body.targetAudience ?? course.targetAudience,
    skills: req.body.skills ?? course.skills,
    modules: req.body.modules
      ? req.body.modules.map((module, idx) =>
          normalizeModule({
            ...module,
            id: module.id || course.modules?.[idx]?.id || id()
          })
        )
      : course.modules
  });

  persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));
  audit(req, 'COURSE_UPDATED', 'COURSE', course.id);
  response(res, courseWithCompany(course), 'Course updated successfully');
});

app.delete('/api/v1/courses/:id', requireAuth, allow('COMPANY'), (req, res) => {
  const index = db.courses.findIndex(item => item.id === req.params.id);
  const course = db.courses[index];
  if (index < 0 || !ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  db.courses.splice(index, 1);
  db.assessments = db.assessments.filter(assessment => assessment.courseId !== course.id);
  db.enrollments = db.enrollments.filter(enrollment => enrollment.courseId !== course.id);
  query('DELETE FROM courses WHERE id = $1', [course.id]).catch(() => {});
  persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));
  audit(req, 'COURSE_DELETED', 'COURSE', course.id);
  response(res, null, 'Course deleted');
});

app.patch('/api/v1/courses/:id/publish', requireAuth, allow('COMPANY'), async (req, res) => {
  const course = db.courses.find(item => item.id === req.params.id);
  if (!course || !ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned course not found'
    });
  }

  if (course.status !== 'PUBLISHED') {
    const errors = validateCourseForPublish(course, db.assessments);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: 'Course cannot be published',
        data: { errors }
      });
    }
  }

  course.status = course.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED';
  await query('UPDATE courses SET status = $1, updated_at = NOW() WHERE id = $2', [course.status, course.id]);
  await persistDatabase().catch(err => console.error('PostgreSQL persistence error:', err.message));

  audit(req, 'COURSE_PUBLICATION_CHANGED', 'COURSE', course.id, {
    status: course.status
  });
  response(res, courseWithCompany(course), `Course ${course.status.toLowerCase()}`);
});

// Enrollment & Progress endpoints
app.post('/api/v1/enrollments', requireAuth, allow('LEARNER'), (req, res) => {
  const course = db.courses.find(c => c.id === req.body.courseId);
  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  let enrollment = db.enrollments.find(e => e.userId === req.user.id && e.courseId === course.id);
  if (!enrollment) {
    enrollment = {
      id: id(),
      userId: req.user.id,
      courseId: course.id,
      progress: 0,
      viewedModuleIds: [],
      completedLessonIds: [],
      completedModuleIds: [],
      passedQuizIds: [],
      status: 'IN_PROGRESS',
      lastAccessed: now()
    };
    db.enrollments.push(enrollment);
    notify(req.user.id, 'Enrollment confirmed', `You are enrolled in ${course.title}`);
    audit(req, 'ENROLLMENT', 'COURSE', course.id);
  }

  response(res, enrollment, 'Enrollment confirmed');
});

app.get('/api/v1/enrollments/me', requireAuth, (req, res) =>
  response(
    res,
    db.enrollments
      .filter(e => e.userId === req.user.id)
      .map(e => ({
        ...e,
        course: db.courses.find(c => c.id === e.courseId)
      }))
  )
);

app.get('/api/v1/progress/:courseId/:moduleId', requireAuth, allow('LEARNER'), (req, res) => {
  const course = ensureCourseIds(db.courses.find(c => c.id === req.params.courseId));
  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  let enrollment = db.enrollments.find(
    e => e.userId === req.user.id && e.courseId === req.params.courseId
  );
  if (!enrollment) {
    enrollment = {
      id: id(),
      userId: req.user.id,
      courseId: course.id,
      progress: 0,
      viewedModuleIds: [],
      completedLessonIds: [],
      completedModuleIds: [],
      passedQuizIds: [],
      status: 'IN_PROGRESS',
      lastAccessed: now()
    };
    db.enrollments.push(enrollment);
  }

  const module = course.modules.find(m => m.id === req.params.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  enrollment.viewedModuleIds ||= [];
  enrollment.completedModuleIds ||= [];

  response(res, {
    module,
    viewed: enrollment.viewedModuleIds.includes(module.id),
    completed: enrollment.completedModuleIds.includes(module.id),
    quizPassed: module.quiz?.every(q => enrollment.passedQuizIds?.includes(q.id)) ?? true
  });
});

app.post('/api/v1/progress/:courseId/:moduleId/read', requireAuth, allow('LEARNER'), (req, res) => {
  const course = ensureCourseIds(db.courses.find(c => c.id === req.params.courseId));
  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  let enrollment = db.enrollments.find(
    e => e.userId === req.user.id && e.courseId === req.params.courseId
  );
  if (!enrollment) {
    enrollment = {
      id: id(),
      userId: req.user.id,
      courseId: course.id,
      progress: 0,
      viewedModuleIds: [],
      completedLessonIds: [],
      completedModuleIds: [],
      passedQuizIds: [],
      status: 'IN_PROGRESS',
      lastAccessed: now()
    };
    db.enrollments.push(enrollment);
  }

  const module = course.modules.find(m => m.id === req.params.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  enrollment.viewedModuleIds ||= [];
  if (!enrollment.viewedModuleIds.includes(module.id)) {
    enrollment.viewedModuleIds.push(module.id);
  }
  enrollment.lastAccessed = now();

  response(res, { viewed: true }, 'Content marked as read');
});

app.post(
  '/api/v1/progress/:courseId/:moduleId/lessons/:lessonId/complete',
  requireAuth,
  allow('LEARNER'),
  (req, res) => {
    const course = ensureCourseIds(db.courses.find(c => c.id === req.params.courseId));
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    let enrollment = db.enrollments.find(
      e => e.userId === req.user.id && e.courseId === req.params.courseId
    );
    if (!enrollment) {
      enrollment = {
        id: id(),
        userId: req.user.id,
        courseId: course.id,
        progress: 0,
        viewedModuleIds: [],
        completedLessonIds: [],
        completedModuleIds: [],
        passedQuizIds: [],
        status: 'IN_PROGRESS',
        lastAccessed: now()
      };
      db.enrollments.push(enrollment);
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

    enrollment.completedLessonIds ||= [];
    if (!enrollment.completedLessonIds.includes(lesson.id)) {
      enrollment.completedLessonIds.push(lesson.id);
    }
    enrollment.completedLessons = enrollment.completedLessonIds;
    enrollment.lastAccessed = now();

    response(
      res,
      {
        completedLessonIds: enrollment.completedLessonIds,
        completedLessons: enrollment.completedLessonIds
      },
      'Lesson completed'
    );
  }
);

app.post('/api/v1/progress', requireAuth, allow('LEARNER'), async (req, res) => {
  const course = ensureCourseIds(db.courses.find(c => c.id === req.body.courseId));
  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  let enrollment = db.enrollments.find(e => e.userId === req.user.id && e.courseId === req.body.courseId);
  if (!enrollment) {
    enrollment = {
      id: id(),
      userId: req.user.id,
      courseId: course.id,
      progress: 0,
      viewedModuleIds: [],
      completedLessonIds: [],
      completedModuleIds: [],
      passedQuizIds: [],
      status: 'IN_PROGRESS',
      lastAccessed: now()
    };
    db.enrollments.push(enrollment);
  }

  const module = course.modules.find(m => m.id === req.body.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  enrollment.viewedModuleIds ||= [];
  enrollment.completedLessonIds ||= [];
  enrollment.completedModuleIds ||= [];
  enrollment.passedQuizIds ||= [];

  if (!enrollment.viewedModuleIds.includes(module.id)) {
    enrollment.viewedModuleIds.push(module.id);
  }

  module.lessons?.forEach(l => {
    if (!enrollment.completedLessonIds.includes(l.id)) {
      enrollment.completedLessonIds.push(l.id);
    }
  });

  if (module.quiz?.some(q => !enrollment.passedQuizIds.includes(q.id))) {
    return res.status(400).json({
      success: false,
      message: 'Pass the module quiz before completing it'
    });
  }

  if (!enrollment.completedModuleIds.includes(module.id)) {
    enrollment.completedModuleIds.push(module.id);
  }

  enrollment.progress = Math.round((enrollment.completedModuleIds.length / course.modules.length) * 100);
  enrollment.lastAccessed = now();

  let certificate = null;
  if (enrollment.progress === 100) {
    enrollment.status = 'COMPLETED';
    enrollment.completedAt = enrollment.completedAt || now();
    notify(req.user.id, 'Course completed', `You completed ${course.title}`);

    // If final assessment was already taken and passed, automatically issue/update certificate
    const userAttempts = db.attempts.filter(
      a => a.userId === req.user.id && a.assessmentId === course.assessmentId
    );
    const passed = userAttempts.some(a => a.passed);
    if (passed) {
      const highestScore = Math.max(...userAttempts.map(a => a.score));
      certificate = await issueCertificate({
        user: db.users.find(u => u.id === req.user.id),
        course,
        score: highestScore
      });
    }
  }

  audit(req, 'MODULE_COMPLETION', 'COURSE', course.id, { moduleId: module.id });
  response(res, { ...enrollment, certificate }, 'Progress saved');
});

app.get('/api/v1/modules/:courseId/:moduleId/quiz', requireAuth, allow('LEARNER'), (req, res) => {
  const course = ensureCourseIds(db.courses.find(c => c.id === req.params.courseId));
  const module = course?.modules.find(m => m.id === req.params.moduleId) || course?.modules?.[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  response(res, {
    moduleId: module.id,
    questions: (module.quiz || []).map(q => ({
      id: q.id,
      text: q.text,
      options: q.options.map(({ correct, ...option }) => option)
    }))
  });
});

app.post('/api/v1/modules/:courseId/:moduleId/quiz', requireAuth, allow('LEARNER'), (req, res) => {
  const course = ensureCourseIds(db.courses.find(c => c.id === req.params.courseId));
  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  const module = course.modules.find(m => m.id === req.params.moduleId) || course.modules[0];
  if (!module) {
    return res.status(404).json({
      success: false,
      message: 'Module not found'
    });
  }

  let enrollment = db.enrollments.find(
    e => e.userId === req.user.id && e.courseId === req.params.courseId
  );
  if (!enrollment) {
    enrollment = {
      id: id(),
      userId: req.user.id,
      courseId: course.id,
      progress: 0,
      viewedModuleIds: [],
      completedLessonIds: [],
      completedModuleIds: [],
      passedQuizIds: [],
      status: 'IN_PROGRESS',
      lastAccessed: now()
    };
    db.enrollments.push(enrollment);
  }

  if (!enrollment.viewedModuleIds?.includes(module.id)) {
    return res.status(400).json({
      success: false,
      message: 'Mark the module content as read first'
    });
  }

  const passed = (module.quiz || []).every(
    q => req.body.answers?.[q.id] && q.options.find(o => o.id === req.body.answers[q.id])?.correct
  );

  enrollment.passedQuizIds ||= [];
  if (passed) {
    module.quiz.forEach(q => {
      if (!enrollment.passedQuizIds.includes(q.id)) {
        enrollment.passedQuizIds.push(q.id);
      }
    });
  }

  response(
    res,
    { passed, score: passed ? 100 : 0 },
    passed ? 'Module quiz passed' : 'Review the content and try again'
  );
});

// Assessment endpoints
app.get('/api/v1/assessments/:id', requireAuth, (req, res) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({
      success: false,
      message: 'Assessment not found'
    });
  }

  const userAttempts = db.attempts.filter(
    a => a.assessmentId === assessment.id && a.userId === req.user.id
  );
  const maxAttempts = Number(assessment.maxAttempts || 3);
  const attemptsTaken = userAttempts.length;
  const remainingAttempts = Math.max(0, maxAttempts - attemptsTaken);
  const highestScore = userAttempts.length ? Math.max(...userAttempts.map(a => a.score)) : null;
  const passed = userAttempts.some(a => a.passed);

  response(res, {
    ...assessment,
    questions: assessment.questions.map(q => ({
      ...q,
      options: q.options.map(({ correct, ...option }) => option)
    })),
    attemptsTaken,
    maxAttempts,
    remainingAttempts,
    highestScore,
    passed,
    attempts: userAttempts
  });
});

app.patch('/api/v1/assessments/:id', requireAuth, allow('COMPANY'), (req, res) => {
  const assessment = db.assessments.find(item => item.id === req.params.id);
  const course = db.courses.find(item => item.assessmentId === req.params.id);
  if (!assessment || !course || !ownsCourse(req, course)) {
    return res.status(404).json({
      success: false,
      message: 'Owned assessment not found'
    });
  }

  Object.assign(assessment, {
    title: req.body.title ?? assessment.title,
    description: req.body.description ?? assessment.description,
    passingScore: Number(req.body.passingScore ?? assessment.passingScore),
    maxAttempts: Number(req.body.maxAttempts ?? assessment.maxAttempts),
    timeLimit: req.body.timeLimit ?? assessment.timeLimit,
    randomizeQuestions: req.body.randomizeQuestions ?? assessment.randomizeQuestions,
    showAnswersAfterSubmission: req.body.showAnswersAfterSubmission ?? assessment.showAnswersAfterSubmission,
    questions: req.body.questions
      ? req.body.questions.map(question => ({
          ...question,
          id: question.id || id(),
          marks: Number(question.marks || 1),
          type: question.type || 'SINGLE'
        }))
      : assessment.questions
  });

  response(res, assessment, 'Assessment updated');
});

app.post('/api/v1/assessments/:id/submit', requireAuth, allow('LEARNER'), async (req, res) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({
      success: false,
      message: 'Assessment not found'
    });
  }

  const maxAttempts = Number(assessment.maxAttempts || 3);
  const priorAttempts = db.attempts.filter(
    a => a.assessmentId === assessment.id && a.userId === req.user.id
  );

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
    const correct = q.options
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

  const attempt = {
    id: id(),
    assessmentId: assessment.id,
    userId: req.user.id,
    score,
    earnedMarks,
    maxMarks,
    passed: isPassed,
    submittedAt: now()
  };
  db.attempts.push(attempt);

  const allUserAttempts = db.attempts.filter(
    a => a.assessmentId === assessment.id && a.userId === req.user.id
  );
  const highestScore = Math.max(...allUserAttempts.map(a => a.score));
  const hasEverPassed = allUserAttempts.some(a => a.passed);

  const course = db.courses.find(item => item.assessmentId === assessment.id);
  const enrollment =
    course &&
    db.enrollments.find(item => item.courseId === course.id && item.userId === req.user.id);

  const allModulesDone =
    course &&
    enrollment &&
    course.modules.length > 0 &&
    course.modules.every(m => enrollment.completedModuleIds?.includes(m.id));

  let certificate = null;
  // If the learner has passed and course modules are completed, issue or update the certificate with highestScore
  if (hasEverPassed && (enrollment?.status === 'COMPLETED' || allModulesDone)) {
    if (enrollment) {
      enrollment.status = 'COMPLETED';
      enrollment.progress = 100;
      enrollment.completedAt = enrollment.completedAt || now();
    }
    certificate = await issueCertificate({
      user: db.users.find(user => user.id === req.user.id),
      course,
      score: highestScore
    });
  }

  notify(
    req.user.id,
    'Assessment result',
    `You scored ${score}% (Attempt ${allUserAttempts.length}/${maxAttempts}). Maximum score: ${highestScore}%. ${
      isPassed ? 'You passed!' : allUserAttempts.length < maxAttempts ? 'You can try again.' : 'Attempts exhausted.'
    }`
  );

  audit(req, 'ASSESSMENT_SUBMISSION', 'ASSESSMENT', assessment.id, {
    score,
    highestScore,
    attemptNumber: allUserAttempts.length
  });

  response(
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
app.get('/api/v1/certifications/eligibility/:courseId', requireAuth, allow('LEARNER'), (req, res) => {
  const course = db.courses.find(c => c.id === req.params.courseId);
  const enrollment = db.enrollments.find(e => e.courseId === course.id && e.userId === req.user.id);
  const passed = db.attempts.some(
    a => a.userId === req.user.id && a.passed && a.assessmentId === course.assessmentId
  );

  response(
    res,
    new CertificationEligibilityService().evaluate({
      course,
      enrollment: enrollment || { completedModuleIds: [] },
      assessmentPassed: passed
    })
  );
});

app.post('/api/v1/certificates/issue/:courseId', requireAuth, allow('LEARNER'), async (req, res) => {
  const course = db.courses.find(c => c.id === req.params.courseId);
  const enrollment = course && db.enrollments.find(e => e.courseId === course.id && e.userId === req.user.id);
  const userAttempts = course
    ? db.attempts.filter(a => a.userId === req.user.id && a.assessmentId === course.assessmentId)
    : [];
  const passed = userAttempts.some(a => a.passed);

  if (!course || enrollment?.status !== 'COMPLETED' || !passed) {
    return res.status(400).json({
      success: false,
      message: 'Certificate is generated automatically only after course completion and a passing final assessment'
    });
  }

  const highestScore = Math.max(...userAttempts.map(a => a.score));

  const certificate = await issueCertificate({
    user: db.users.find(u => u.id === req.user.id),
    course,
    score: highestScore
  });

  response(res, certificate, 'Certificate available');
});

app.get('/api/v1/certificates/me', requireAuth, (req, res) =>
  response(res, db.certificates.filter(c => c.learnerId === req.user.id))
);

app.get('/api/v1/certificates/:certificateId/pdf', async (req, res) => {
  const query = String(req.params.certificateId || '').trim().toLowerCase();
  const certificate = db.certificates.find(item => {
    const certId = String(item.certificateId || '').trim().toLowerCase();
    const certNum = String(item.certificateNumber || '').trim().toLowerCase();
    const idVal = String(item.id || '').trim().toLowerCase();
    return certId === query || certNum === query || idVal === query;
  });

  if (!certificate) {
    return res.status(404).json({
      success: false,
      message: 'Certificate not found'
    });
  }

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

  const certificate = db.certificates.find(item => {
    const itemCertId = String(item.certificateId || '').trim().toLowerCase();
    const itemCertNum = String(item.certificateNumber || '').trim().toLowerCase();
    const itemId = String(item.id || '').trim().toLowerCase();
    return itemCertId === normalizedQuery || itemCertNum === normalizedQuery || itemId === normalizedQuery;
  });

  db.verifications.push({
    id: id(),
    certificateId: certificate ? certificate.certificateId : rawQuery,
    searchedQuery: rawQuery,
    requestedAt: now(),
    ip: req.ip
  });

  if (!certificate) {
    return res.status(404).json({
      success: false,
      message: 'Certificate not found'
    });
  }

  audit(req, 'CERTIFICATE_VERIFICATION', 'CERTIFICATE', certificate.id);
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
  const certificate = db.certificates.find(c => c.id === req.params.id || c.certificateId === req.params.id);
  if (!certificate || !req.body.reason) {
    return res.status(400).json({
      success: false,
      message: 'Certificate and revocation reason are required'
    });
  }

  certificate.status = 'REVOKED';
  certificate.revocation = {
    reason: req.body.reason,
    actorId: req.user.id,
    timestamp: now()
  };

  await invalidateCached(`certificate:${certificate.certificateId}`);
  audit(req, 'CERTIFICATE_REVOKED', 'CERTIFICATE', certificate.id, certificate.revocation);
  notify(certificate.learnerId, 'Certificate revoked', 'Your certificate status has changed.');
  response(res, certificate, 'Certificate revoked');
});

// General portal dashboards
app.get('/api/v1/dashboard', requireAuth, (req, res) => {
  const enrollments = db.enrollments.filter(e => e.userId === req.user.id);
  response(res, {
    user: publicUser(db.users.find(u => u.id === req.user.id)),
    enrollments: enrollments.map(e => ({
      ...e,
      course: db.courses.find(c => c.id === e.courseId)
    })),
    certificates: db.certificates.filter(c => c.learnerId === req.user.id),
    notifications: db.notifications.filter(n => n.userId === req.user.id).slice(-5)
  });
});

app.get('/api/v1/notifications', requireAuth, (req, res) =>
  response(res, db.notifications.filter(n => n.userId === req.user.id).reverse())
);

app.get('/api/v1/companies', (req, res) => response(res, db.companies));

app.get('/api/v1/audit', requireAuth, allow('ADMIN'), (req, res) =>
  response(res, db.auditLogs.slice().reverse())
);

// Admin portal endpoints
app.get('/api/v1/admin/overview', requireAuth, allow('ADMIN'), (req, res) =>
  response(res, {
    learners: db.users.filter(u => u.role === 'LEARNER').length,
    companies: db.companies.length,
    courses: db.courses.length,
    enrollments: db.enrollments.length,
    certificates: db.certificates.length,
    revoked: db.certificates.filter(c => c.status === 'REVOKED').length,
    verifications: db.verifications.length,
    auditLogs: db.auditLogs.slice(-20).reverse()
  })
);

app.get('/api/v1/admin/users', requireAuth, allow('ADMIN'), (req, res) => {
  const users = db.users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active ?? true,
    companyId: u.companyId,
    companyName: db.companies.find(c => c.id === u.companyId)?.name || null
  }));
  response(res, users);
});

app.patch('/api/v1/admin/users/:id', requireAuth, allow('ADMIN'), async (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

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
    persistDatabase().catch(err => console.error('Database sync error on status update:', err.message));
  }

  audit(req, 'USER_UPDATED', 'USER', user.id, {
    active: user.active
  });

  response(res, publicUser(user), 'User updated successfully');
});

app.delete('/api/v1/admin/users/:id', requireAuth, allow('ADMIN'), async (req, res) => {
  const userId = req.params.id;
  const user = db.users.find(u => u.id === userId);

  let targetUser = user;
  if (!targetUser) {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    targetUser = rows[0];
  }

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

  // 1. Delete from PostgreSQL database
  await query('DELETE FROM users WHERE id = $1', [userId]);

  // 2. Delete from in-memory db
  const userIdx = db.users.findIndex(u => u.id === userId);
  if (userIdx !== -1) {
    db.users.splice(userIdx, 1);
  }
  db.enrollments = db.enrollments.filter(e => e.userId !== userId);
  db.attempts = db.attempts.filter(a => a.userId !== userId);
  db.certificates = db.certificates.filter(c => c.learnerId !== userId);
  db.notifications = db.notifications.filter(n => n.userId !== userId);

  // 3. Persist changes to database if connected
  persistDatabase().catch(err => console.error('Database sync error on delete:', err.message));

  audit(req, 'USER_DELETED', 'USER', userId, {
    email: targetUser.email,
    name: targetUser.name,
    role: targetUser.role
  });

  return response(res, { id: userId }, 'User permanently deleted from database');
});

app.get('/api/v1/admin/certificates', requireAuth, allow('ADMIN'), (req, res) =>
  response(res, db.certificates.slice().reverse())
);

// HR portal endpoints
app.get('/api/v1/hr/overview', requireAuth, allow('HR', 'ADMIN'), (req, res) => {
  const validCertificates = db.certificates.filter(c => c.status === 'VALID').length;
  const revokedCertificates = db.certificates.filter(c => c.status === 'REVOKED').length;
  response(res, {
    certificatesCount: db.certificates.length,
    validCertificates,
    revokedCertificates,
    verificationsCount: db.verifications.length,
    recentCertificates: db.certificates.slice(-10).reverse(),
    recentVerifications: db.verifications.slice(-10).reverse()
  });
});

app.get('/api/v1/hr/certificates', requireAuth, allow('HR', 'ADMIN'), (req, res) => {
  const certificates = db.certificates
    .map(c => ({
      id: c.id,
      certificateId: c.certificateId,
      certificateNumber: c.certificateNumber,
      learnerName: c.learnerName,
      courseName: c.courseName,
      certification: c.certification,
      issuedBy: c.issuedBy,
      status: c.status,
      score: c.score,
      issuedDate: c.issuedDate,
      pdfUrl: c.pdfUrl
    }))
    .reverse();
  response(res, certificates);
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
