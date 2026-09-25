import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
let pool;
let enabled = false;

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
const defaultPasswordHash = bcrypt.hashSync('Demo@123', 10);

export const db = {
  catalogVersion: 3,
  users: [
    { id: 'u-learner', name: 'Maya Chen', username: 'mayachen', email: 'learner@example.com', passwordHash: defaultPasswordHash, role: 'LEARNER', active: true },
    { id: 'u-company', name: 'Jordan Blake', username: 'jordanblake', email: 'company@example.com', passwordHash: defaultPasswordHash, role: 'COMPANY', companyId: 'co-techcorp', active: true },
    { id: 'u-hr', name: 'Avery Singh', username: 'averysingh', email: 'hr@example.com', passwordHash: defaultPasswordHash, role: 'HR', active: true },
    { id: 'u-admin', name: 'Riley Admin', username: 'rileyadmin', email: 'admin@example.com', passwordHash: defaultPasswordHash, role: 'ADMIN', active: true }
  ],
  companies: [{ id: 'co-techcorp', name: 'TechCorp', description: 'Demo provider account for local role testing.', website: '' }],
  courses: [],
  enrollments: [],
  assessments: [],
  attempts: [],
  certificates: [],
  auditLogs: [],
  notifications: [],
  skills: [],
  verifications: [],
  pendingCompanyRegistrations: []
};

let initPromise = null;

export function isDatabaseConnected() {
  return enabled && !!pool;
}

export async function ensureDatabase() {
  if (!pool && !initPromise) {
    initPromise = initDatabase();
  }
  if (initPromise) {
    await initPromise;
  }
}

export async function query(text, params) {
  if (!pool) {
    await ensureDatabase();
  }
  if (pool && enabled) {
    return pool.query(text, params);
  }
  return { rows: [] };
}

const DDL_STATEMENTS = `
  DROP TABLE IF EXISTS learnforge_state;

  CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    website VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'LEARNER',
    company_id VARCHAR(100) REFERENCES companies(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    detailed_description TEXT,
    thumbnail VARCHAR(500),
    category VARCHAR(100),
    difficulty VARCHAR(50),
    duration VARCHAR(50),
    instructor_name VARCHAR(255),
    instructor_bio TEXT,
    prerequisites TEXT,
    learning_objectives JSONB DEFAULT '[]',
    target_audience TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    modules JSONB NOT NULL DEFAULT '[]',
    skills JSONB NOT NULL DEFAULT '[]',
    assessment_id VARCHAR(100),
    video_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    progress INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
    completed_modules JSONB NOT NULL DEFAULT '[]',
    completed_lessons JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id VARCHAR(100) PRIMARY KEY,
    course_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    passing_score INT NOT NULL DEFAULT 70,
    max_attempts INT NOT NULL DEFAULT 3,
    questions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id VARCHAR(100) NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    score INT NOT NULL,
    passed BOOLEAN NOT NULL,
    answers JSONB DEFAULT '{}',
    attempt_number INT NOT NULL DEFAULT 1,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS certificates (
    id VARCHAR(100) PRIMARY KEY,
    certificate_id VARCHAR(100) UNIQUE NOT NULL,
    certificate_number VARCHAR(100) UNIQUE NOT NULL,
    learner_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    learner_name VARCHAR(255) NOT NULL,
    course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_name VARCHAR(255) NOT NULL,
    certification VARCHAR(255) NOT NULL,
    issued_by VARCHAR(255) NOT NULL,
    score INT NOT NULL,
    completion_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_date TIMESTAMPTZ,
    verification_url VARCHAR(500) NOT NULL,
    pdf_url VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'VALID',
    skills JSONB NOT NULL DEFAULT '[]',
    revocation JSONB
  );

  CREATE TABLE IF NOT EXISTS verifications (
    id VARCHAR(100) PRIMARY KEY,
    certificate_id VARCHAR(100) NOT NULL,
    searched_query VARCHAR(255),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip VARCHAR(100)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    actor_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
    metadata JSONB DEFAULT '{}',
    ip VARCHAR(100)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS pending_company_registrations (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'COMPANY',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const parseJson = val => {
  if (!val) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

const mapCompany = r => ({
  id: r.id,
  name: r.name,
  description: r.description || '',
  website: r.website || '',
  createdAt: r.created_at
});

const mapUser = r => ({
  id: r.id,
  name: r.name,
  email: r.email,
  passwordHash: r.password_hash,
  role: r.role,
  companyId: r.company_id,
  active: r.active,
  createdAt: r.created_at
});

export const mapCourse = r => ({
  id: r.id,
  title: r.title,
  description: r.description,
  detailedDescription: r.detailed_description,
  thumbnail: r.thumbnail,
  category: r.category,
  difficulty: r.difficulty,
  duration: r.duration,
  instructorName: r.instructor_name,
  instructorBio: r.instructor_bio,
  prerequisites: r.prerequisites,
  learningObjectives: parseJson(r.learning_objectives) || [],
  targetAudience: r.target_audience,
  status: r.status,
  companyId: r.company_id,
  modules: parseJson(r.modules) || [],
  skills: parseJson(r.skills) || [],
  assessmentId: r.assessment_id,
  videoUrl: r.video_url || '',
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const mapEnrollment = r => {
  const completedModules = parseJson(r.completed_modules) || [];
  const completedLessons = parseJson(r.completed_lessons) || [];
  return {
    id: r.id,
    userId: r.user_id,
    courseId: r.course_id,
    progress: r.progress,
    status: r.status,
    completedModules,
    completedLessons,
    completedModuleIds: completedModules,
    completedLessonIds: completedLessons,
    startedAt: r.started_at,
    completedAt: r.completed_at
  };
};

const mapAssessment = r => ({
  id: r.id,
  courseId: r.course_id,
  title: r.title,
  passingScore: r.passing_score,
  maxAttempts: r.max_attempts,
  questions: parseJson(r.questions) || [],
  createdAt: r.created_at
});

const mapAttempt = r => ({
  id: r.id,
  userId: r.user_id,
  assessmentId: r.assessment_id,
  score: r.score,
  passed: r.passed,
  answers: parseJson(r.answers) || {},
  attemptNumber: r.attempt_number,
  submittedAt: r.submitted_at
});

const mapCertificate = r => ({
  id: r.id,
  certificateId: r.certificate_id,
  certificateNumber: r.certificate_number,
  learnerId: r.learner_id,
  learnerName: r.learner_name,
  courseId: r.course_id,
  courseName: r.course_name,
  certification: r.certification,
  issuedBy: r.issued_by,
  score: r.score,
  completionDate: r.completion_date,
  issuedDate: r.issued_date,
  expiryDate: r.expiry_date,
  verificationUrl: r.verification_url,
  pdfUrl: r.pdf_url,
  status: r.status,
  skills: parseJson(r.skills) || [],
  revocation: parseJson(r.revocation) || null
});

const mapVerification = r => ({
  id: r.id,
  certificateId: r.certificate_id,
  searchedQuery: r.searched_query,
  requestedAt: r.requested_at,
  ip: r.ip
});

const mapAuditLog = r => {
  const meta = parseJson(r.metadata) || {};
  return {
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    timestamp: r.timestamp,
    status: r.status,
    metadata: meta,
    userName: meta.userName || 'System',
    userRole: meta.userRole || 'SYSTEM',
    ip: r.ip
  };
};

const mapPendingCompany = r => ({
  id: r.id,
  name: r.name,
  email: r.email,
  passwordHash: r.password_hash,
  companyName: r.company_name || '',
  role: r.role || 'COMPANY',
  status: r.status || 'PENDING',
  createdAt: r.created_at
});

const mapNotification = r => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  body: r.body,
  read: r.read,
  createdAt: r.created_at
});

export async function initDatabase() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://learnforge:learnforge@localhost:5432/learnforge?schema=public';

  const isCloudPostgres =
    connectionString.includes('render.com') ||
    connectionString.includes('supabase') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require');

  try {
    pool = new Pool({
      connectionString,
      ssl: isCloudPostgres ? { rejectUnauthorized: false } : undefined
    });

    // Execute relational schema DDL
    await pool.query(DDL_STATEMENTS);

    // Self-healing schema migration for existing databases
    await pool.query(`
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS detailed_description TEXT;
      ALTER TABLE pending_company_registrations ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'COMPANY';
      ALTER TABLE pending_company_registrations ALTER COLUMN company_name DROP NOT NULL;
    `).catch(() => {});

    // Seed default companies and users if not already present
    const userCountRes = await pool.query('SELECT COUNT(*) AS count FROM users');
    if (parseInt(userCountRes.rows[0].count, 10) === 0) {
      for (const comp of db.companies) {
        await pool.query(
          `INSERT INTO companies (id, name, description, website)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [comp.id, comp.name, comp.description || null, comp.website || null]
        );
      }

      for (const usr of db.users) {
        await pool.query(
          `INSERT INTO users (id, name, email, password_hash, role, company_id, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             active = EXCLUDED.active,
             company_id = EXCLUDED.company_id`,
          [usr.id, usr.name, usr.email, usr.passwordHash, usr.role, usr.companyId || null, usr.active ?? true]
        );
      }
    }

    // Load persisted rows from all PostgreSQL tables into synchronized db state
    const [comps, usrs, crss, enrls, asmts, atmts, crts, vrfs, adts, ntfs, pndg] = await Promise.all([
      pool.query('SELECT * FROM companies ORDER BY created_at ASC'),
      pool.query('SELECT * FROM users ORDER BY created_at ASC'),
      pool.query('SELECT * FROM courses ORDER BY created_at ASC'),
      pool.query('SELECT * FROM enrollments ORDER BY started_at ASC'),
      pool.query('SELECT * FROM assessments ORDER BY created_at ASC'),
      pool.query('SELECT * FROM attempts ORDER BY submitted_at ASC'),
      pool.query('SELECT * FROM certificates ORDER BY issued_date ASC'),
      pool.query('SELECT * FROM verifications ORDER BY requested_at ASC'),
      pool.query('SELECT * FROM audit_logs ORDER BY timestamp ASC'),
      pool.query('SELECT * FROM notifications ORDER BY created_at ASC'),
      pool.query('SELECT * FROM pending_company_registrations ORDER BY created_at ASC')
    ]);

    if (comps.rows.length) db.companies = comps.rows.map(mapCompany);
    if (usrs.rows.length) db.users = usrs.rows.map(mapUser);
    if (crss.rows.length) db.courses = crss.rows.map(mapCourse);
    if (enrls.rows.length) db.enrollments = enrls.rows.map(mapEnrollment);
    if (asmts.rows.length) db.assessments = asmts.rows.map(mapAssessment);
    if (atmts.rows.length) db.attempts = atmts.rows.map(mapAttempt);
    if (crts.rows.length) db.certificates = crts.rows.map(mapCertificate);
    if (vrfs.rows.length) db.verifications = vrfs.rows.map(mapVerification);
    if (adts.rows.length) db.auditLogs = adts.rows.map(mapAuditLog);
    if (ntfs.rows.length) db.notifications = ntfs.rows.map(mapNotification);
    if (pndg.rows.length) db.pendingCompanyRegistrations = pndg.rows.map(mapPendingCompany);

    enabled = true;
    console.log('PostgreSQL relational database initialized and synchronized');
  } catch (error) {
    console.warn(`PostgreSQL unavailable; using in-memory mode: ${error.message}`);
    await pool?.end().catch(() => {});
    pool = undefined;
    enabled = false;
  }
}

export {
  mapCompany,
  mapUser,
  mapEnrollment,
  mapAssessment,
  mapAttempt,
  mapCertificate,
  mapVerification,
  mapAuditLog,
  mapPendingCompany,
  mapNotification
};

export async function syncDbCache() {
  if (!pool || !enabled) return;
  try {
    const [comps, usrs, crss, enrls, asmts, atmts, crts, vrfs, adts, ntfs, pndg] = await Promise.all([
      pool.query('SELECT * FROM companies ORDER BY created_at ASC'),
      pool.query('SELECT * FROM users ORDER BY created_at ASC'),
      pool.query('SELECT * FROM courses ORDER BY created_at ASC'),
      pool.query('SELECT * FROM enrollments ORDER BY started_at ASC'),
      pool.query('SELECT * FROM assessments ORDER BY created_at ASC'),
      pool.query('SELECT * FROM attempts ORDER BY submitted_at ASC'),
      pool.query('SELECT * FROM certificates ORDER BY issued_date ASC'),
      pool.query('SELECT * FROM verifications ORDER BY requested_at ASC'),
      pool.query('SELECT * FROM audit_logs ORDER BY timestamp ASC'),
      pool.query('SELECT * FROM notifications ORDER BY created_at ASC'),
      pool.query('SELECT * FROM pending_company_registrations ORDER BY created_at ASC')
    ]);

    db.companies = comps.rows.map(mapCompany);
    db.users = usrs.rows.map(mapUser);
    db.courses = crss.rows.map(mapCourse);
    db.enrollments = enrls.rows.map(mapEnrollment);
    db.assessments = asmts.rows.map(mapAssessment);
    db.attempts = atmts.rows.map(mapAttempt);
    db.certificates = crts.rows.map(mapCertificate);
    db.verifications = vrfs.rows.map(mapVerification);
    db.auditLogs = adts.rows.map(mapAuditLog);
    db.notifications = ntfs.rows.map(mapNotification);
    db.pendingCompanyRegistrations = pndg.rows.map(mapPendingCompany);
  } catch (err) {
    console.warn(`syncDbCache error: ${err.message}`);
  }
}

export async function persistDatabase() {
  // All state is now directly persisted to PostgreSQL via SQL queries.
  // Maintained as a lightweight cache sync for backward compatibility.
  await syncDbCache().catch(() => {});
}


export const isDatabaseEnabled = () => enabled;
export const getPool = () => pool;
