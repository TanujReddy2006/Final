import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const passwordHash = bcrypt.hashSync('Demo@123', 10);

export const db = {
  catalogVersion: 3,
  users: [
    { id: 'u-learner', name: 'Maya Chen', email: 'learner@example.com', passwordHash, role: 'LEARNER', active: true },
    { id: 'u-company', name: 'Jordan Blake', email: 'company@example.com', passwordHash, role: 'COMPANY', companyId: 'co-techcorp', active: true },
    { id: 'u-hr', name: 'Avery Singh', email: 'hr@example.com', passwordHash, role: 'HR', active: true },
    { id: 'u-admin', name: 'Riley Admin', email: 'admin@example.com', passwordHash, role: 'ADMIN', active: true }
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
  verifications: []
};
export { id, now };
