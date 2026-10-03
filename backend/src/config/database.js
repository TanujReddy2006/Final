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

function getDbKey(table) {
  const map = {
    users: 'users',
    companies: 'companies',
    courses: 'courses',
    enrollments: 'enrollments',
    assessments: 'assessments',
    attempts: 'attempts',
    certificates: 'certificates',
    verifications: 'verifications',
    audit_logs: 'auditLogs',
    notifications: 'notifications',
    pending_company_registrations: 'pendingCompanyRegistrations'
  };
  return map[table.toLowerCase()] || null;
}

function itemToRow(table, item) {
  if (!item) return item;
  const t = table.toLowerCase();
  if (t === 'users') {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      password_hash: item.password_hash || item.passwordHash,
      role: item.role,
      company_id: item.company_id || item.companyId || null,
      active: item.active ?? true,
      created_at: item.created_at || item.createdAt || now()
    };
  }
  if (t === 'pending_company_registrations') {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      password_hash: item.password_hash || item.passwordHash,
      company_name: item.company_name || item.companyName || '',
      role: item.role || 'COMPANY',
      status: item.status || 'PENDING',
      created_at: item.created_at || item.createdAt || now()
    };
  }
  if (t === 'companies') {
    return {
      id: item.id,
      name: item.name,
      description: item.description || '',
      website: item.website || '',
      created_at: item.created_at || item.createdAt || now()
    };
  }
  if (t === 'courses') {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      detailed_description: item.detailed_description || item.detailedDescription || '',
      thumbnail: item.thumbnail || '',
      category: item.category || '',
      difficulty: item.difficulty || 'BEGINNER',
      duration: item.duration || '',
      instructor_name: item.instructor_name || item.instructorName || '',
      instructor_bio: item.instructor_bio || item.instructorBio || '',
      prerequisites: item.prerequisites || '',
      learning_objectives: item.learning_objectives || item.learningObjectives || [],
      target_audience: item.target_audience || item.targetAudience || '',
      status: item.status || 'DRAFT',
      company_id: item.company_id || item.companyId,
      modules: item.modules || [],
      skills: item.skills || [],
      assessment_id: item.assessment_id || item.assessmentId || null,
      video_url: item.video_url || item.videoUrl || '',
      created_at: item.created_at || item.createdAt || now(),
      updated_at: item.updated_at || item.updatedAt || now()
    };
  }
  if (t === 'enrollments') {
    return {
      id: item.id,
      user_id: item.user_id || item.userId,
      course_id: item.course_id || item.courseId,
      progress: item.progress || 0,
      status: item.status || 'IN_PROGRESS',
      completed_modules: item.completed_modules || item.completedModules || [],
      completed_lessons: item.completed_lessons || item.completedLessons || [],
      started_at: item.started_at || item.startedAt || now(),
      completed_at: item.completed_at || item.completedAt || null
    };
  }
  if (t === 'assessments') {
    return {
      id: item.id,
      course_id: item.course_id || item.courseId,
      title: item.title,
      passing_score: item.passing_score ?? item.passingScore ?? 70,
      max_attempts: item.max_attempts ?? item.maxAttempts ?? 3,
      questions: item.questions || [],
      created_at: item.created_at || item.createdAt || now()
    };
  }
  if (t === 'attempts') {
    return {
      id: item.id,
      user_id: item.user_id || item.userId,
      assessment_id: item.assessment_id || item.assessmentId,
      score: item.score || 0,
      passed: item.passed ?? false,
      answers: item.answers || {},
      attempt_number: item.attempt_number || item.attemptNumber || 1,
      submitted_at: item.submitted_at || item.submittedAt || now()
    };
  }
  if (t === 'certificates') {
    return {
      id: item.id,
      certificate_id: item.certificate_id || item.certificateId,
      certificate_number: item.certificate_number || item.certificateNumber,
      learner_id: item.learner_id || item.learnerId,
      learner_name: item.learner_name || item.learnerName,
      course_id: item.course_id || item.courseId,
      course_name: item.course_name || item.courseName,
      certification: item.certification,
      issued_by: item.issued_by || item.issuedBy,
      score: item.score || 0,
      completion_date: item.completion_date || item.completionDate || now(),
      issued_date: item.issued_date || item.issuedDate || now(),
      expiry_date: item.expiry_date || item.expiryDate || null,
      verification_url: item.verification_url || item.verificationUrl,
      pdf_url: item.pdf_url || item.pdfUrl,
      status: item.status || 'VALID',
      skills: item.skills || [],
      revocation: item.revocation || null
    };
  }
  if (t === 'audit_logs') {
    return {
      id: item.id,
      actor_id: item.actor_id || item.actorId || null,
      action: item.action,
      entity_type: item.entity_type || item.entityType,
      entity_id: item.entity_id || item.entityId,
      timestamp: item.timestamp || now(),
      status: item.status || 'SUCCESS',
      metadata: item.metadata || {},
      ip: item.ip || '127.0.0.1'
    };
  }
  if (t === 'notifications') {
    return {
      id: item.id,
      user_id: item.user_id || item.userId,
      title: item.title,
      body: item.body,
      read: item.read ?? false,
      created_at: item.created_at || item.createdAt || now()
    };
  }
  if (t === 'verifications') {
    return {
      id: item.id,
      certificate_id: item.certificate_id || item.certificateId,
      searched_query: item.searched_query || item.searchedQuery || null,
      requested_at: item.requested_at || item.requestedAt || now(),
      ip: item.ip || null
    };
  }
  return item;
}

export function executeInMemoryQuery(text, params = []) {
  const sql = text.trim();
  const lower = sql.toLowerCase();

  // 1. DELETE
  if (lower.startsWith('delete from')) {
    const tableMatch = lower.match(/^delete\s+from\s+([a-z0-9_]+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1];
    const key = getDbKey(table);
    if (!key) return { rows: [], rowCount: 0 };

    if (!lower.includes('where')) {
      const count = (db[key] || []).length;
      db[key] = [];
      return { rows: [], rowCount: count };
    }

    if (lower.includes("where id not in ('u-learner', 'u-company', 'u-hr', 'u-admin')")) {
      db[key] = (db[key] || []).filter(u => ['u-learner', 'u-company', 'u-hr', 'u-admin'].includes(u.id));
      return { rows: [], rowCount: 1 };
    }
    if (lower.includes("where id != 'co-techcorp'")) {
      db[key] = (db[key] || []).filter(c => c.id === 'co-techcorp');
      return { rows: [], rowCount: 1 };
    }
    if (lower.includes('where id = $1')) {
      const initial = (db[key] || []).length;
      db[key] = (db[key] || []).filter(item => item.id !== params[0]);
      return { rows: [], rowCount: initial - db[key].length };
    }
    return { rows: [], rowCount: 0 };
  }

  // 2. INSERT
  if (lower.startsWith('insert into')) {
    const tableMatch = sql.match(/insert\s+into\s+([a-z0-9_]+)\s*\(([^)]+)\)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1];
    const cols = tableMatch[2].split(',').map(c => c.trim().toLowerCase());
    const key = getDbKey(table);
    if (!key) return { rows: [], rowCount: 0 };

    const row = {};
    cols.forEach((col, idx) => {
      let val = params[idx];
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try { val = JSON.parse(val); } catch {}
      }
      if (val !== undefined) {
        row[col] = val;
      }
    });
    if (!row.timestamp) row.timestamp = now();
    if (!row.created_at) row.created_at = now();

    db[key] = db[key] || [];
    if (table.toLowerCase() === 'certificates') {
      row.certificateId = row.certificateId || row.certificate_id;
      row.certificateNumber = row.certificateNumber || row.certificate_number;
      row.learnerId = row.learnerId || row.learner_id;
      row.learnerName = row.learnerName || row.learner_name;
      row.courseId = row.courseId || row.course_id;
      row.courseName = row.courseName || row.course_name;
      const cId = row.certificate_id || row.certificateId;
      const existingIdx = (db.certificates || []).findIndex(x => (x.certificate_id || x.certificateId) === cId);
      if (existingIdx >= 0) {
        db.certificates[existingIdx] = { ...db.certificates[existingIdx], ...row };
        return { rows: [itemToRow(table, db.certificates[existingIdx])], rowCount: 1 };
      }
    }
    const existingIdx = row.id ? (db[key] || []).findIndex(x => x.id === row.id) : -1;
    if (existingIdx >= 0) {
      db[key][existingIdx] = { ...db[key][existingIdx], ...row };
      return { rows: [itemToRow(table, db[key][existingIdx])], rowCount: 1 };
    }
    db[key].push(row);
    return { rows: [itemToRow(table, row)], rowCount: 1 };
  }

  // 3. UPDATE
  if (lower.startsWith('update')) {
    const tableMatch = sql.match(/update\s+([a-z0-9_]+)\s+set/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1];
    const key = getDbKey(table);
    if (!key) return { rows: [], rowCount: 0 };

    if (lower.includes("name = 'maya chen'") && lower.includes("id = 'u-learner'")) {
      const u = (db.users || []).find(x => x.id === 'u-learner');
      if (u) u.name = 'Maya Chen';
      return { rows: [], rowCount: 1 };
    }

    if (lower.includes('where id =')) {
      const idParam = params[params.length - 1];
      const item = (db[key] || []).find(x => x.id === idParam);
      if (item) {
        if (lower.includes('active = $1')) {
          item.active = params[0];
        } else if (lower.includes('name = $1') && lower.includes('email = $2')) {
          item.name = params[0];
          item.email = params[1];
          if (params.length >= 4) item.role = params[2];
        } else if (lower.includes('name = $1')) {
          item.name = params[0];
        } else if (lower.includes('status = $1')) {
          item.status = params[0];
        } else if (table.toLowerCase() === 'courses') {
          if (params.length > 5) {
            item.title = params[0];
            item.description = params[1];
            item.detailed_description = params[2];
            item.detailedDescription = params[2];
          }
        }
      }
      return { rows: item ? [itemToRow(table, item)] : [], rowCount: item ? 1 : 0 };
    }

    if (lower.includes('where user_id = $1') && lower.includes('where course_id = $2')) {
      const e = (db.enrollments || []).find(x => (x.user_id || x.userId) === params[params.length - 2] && (x.course_id || x.courseId) === params[params.length - 1]);
      if (e) {
        if (params[0] !== undefined) e.progress = params[0];
        if (params[1] !== undefined) e.status = params[1];
      }
      return { rows: e ? [itemToRow(table, e)] : [], rowCount: e ? 1 : 0 };
    }

    if (lower.includes('where user_id = $1')) {
      const uid = params[0];
      (db[key] || []).filter(x => (x.user_id || x.userId) === uid).forEach(x => {
        if (lower.includes('read = true')) x.read = true;
      });
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  // 4. SELECT
  if (lower.startsWith('select')) {
    const tableMatch = sql.match(/from\s+([a-z0-9_]+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1];
    const key = getDbKey(table);
    if (!key) return { rows: [], rowCount: 0 };

    let items = (db[key] || []).map(item => itemToRow(table, item));

    if (lower.includes('count(*)')) {
      return { rows: [{ count: String(items.length) }], rowCount: 1 };
    }

    if (lower.includes('lower(email) = lower($1)')) {
      const email = String(params[0] || '').toLowerCase();
      items = items.filter(x => String(x.email || '').toLowerCase() === email);
      if (lower.includes("status = 'pending'")) {
        items = items.filter(x => x.status === 'PENDING');
      }
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('where id = $1 or lower(email) = lower($2)')) {
      const email = String(params[1] || '').toLowerCase();
      items = items.filter(x => x.id === params[0] || String(x.email || '').toLowerCase() === email);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('where id = $1')) {
      items = items.filter(x => x.id === params[0]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('course_id = $1') && lower.includes('learner_id = $2')) {
      items = items.filter(x => (x.course_id || x.courseId) === params[0] && (x.learner_id || x.learnerId) === params[1]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('assessment_id = $1') && lower.includes('id = $2')) {
      items = items.filter(x => (x.assessment_id || x.assessmentId) === params[0] || x.id === params[1]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('assessment_id = $1') && lower.includes('user_id = $2')) {
      items = items.filter(x => (x.assessment_id === params[0] || x.assessmentId === params[0]) && (x.user_id === params[1] || x.userId === params[1]));
      if (lower.includes('order by submitted_at desc')) {
        items.sort((a, b) => new Date(b.submitted_at || b.submittedAt) - new Date(a.submitted_at || a.submittedAt));
      }
      if (lower.includes('order by score desc')) {
        items.sort((a, b) => (b.score || 0) - (a.score || 0));
      }
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('user_id = $1') && lower.includes('assessment_id = $2')) {
      items = items.filter(x => (x.user_id === params[0] || x.userId === params[0]) && (x.assessment_id === params[1] || x.assessmentId === params[1]));
      if (lower.includes('order by submitted_at desc')) {
        items.sort((a, b) => new Date(b.submitted_at || b.submittedAt) - new Date(a.submitted_at || a.submittedAt));
      }
      if (lower.includes('order by score desc')) {
        items.sort((a, b) => (b.score || 0) - (a.score || 0));
      }
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('course_id = $1') && lower.includes('user_id = $2')) {
      items = items.filter(x => x.course_id === params[0] && x.user_id === params[1]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('user_id = $1') && lower.includes('course_id = $2')) {
      items = items.filter(x => x.user_id === params[0] && x.course_id === params[1]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('where course_id = $1')) {
      items = items.filter(x => x.course_id === params[0]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('where company_id = $1')) {
      items = items.filter(x => x.company_id === params[0]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('where learner_id = $1')) {
      items = items.filter(x => x.learner_id === params[0]);
      return { rows: items, rowCount: items.length };
    }
    if (lower.includes('where user_id = $1')) {
      items = items.filter(x => x.user_id === params[0]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('certificate_id') && lower.includes('certificate_number')) {
      const q = String(params[0] || '').toLowerCase();
      items = items.filter(x =>
        String(x.certificate_id || x.certificateId || '').toLowerCase() === q ||
        String(x.certificate_number || x.certificateNumber || '').toLowerCase() === q ||
        String(x.id || '').toLowerCase() === q
      );
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('where certificate_id = $1')) {
      items = items.filter(x => x.certificate_id === params[0] || x.id === params[0]);
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes("status = 'published'")) {
      items = items.filter(x => x.status === 'PUBLISHED');
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes("status = 'pending'")) {
      items = items.filter(x => x.status === 'PENDING');
      return { rows: items, rowCount: items.length };
    }

    if (lower.includes('order by timestamp desc')) {
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    const limitMatch = lower.match(/limit\s+(\d+)/);
    if (limitMatch) {
      items = items.slice(0, parseInt(limitMatch[1], 10));
    }

    return { rows: items, rowCount: items.length };
  }

  return { rows: [], rowCount: 0 };
}

export async function query(text, params) {
  if (!pool) {
    await ensureDatabase();
  }
  if (pool && enabled) {
    return pool.query(text, params);
  }
  return executeInMemoryQuery(text, params);
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
    actorId: r.actor_id || r.actorId,
    action: r.action,
    entityType: r.entity_type || r.entityType,
    entityId: r.entity_id || r.entityId,
    timestamp: r.timestamp || now(),
    status: r.status || 'SUCCESS',
    metadata: meta,
    userName: meta.userName || r.user_name || r.userName || 'System',
    userRole: meta.userRole || r.user_role || r.userRole || 'SYSTEM',
    ip: r.ip || '127.0.0.1'
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
