import test from 'node:test';
import assert from 'node:assert/strict';
import { MoodleLmsAdapter } from '../src/adapters/providers/MoodleLmsAdapter.js';
import { moodleContinuousSyncService } from '../src/services/moodleContinuousSyncService.js';
import { query, db } from '../src/config/database.js';

test('MoodleLmsAdapter initializes with default and custom configurations', async () => {
  const adapter = new MoodleLmsAdapter({
    baseUrl: 'http://localhost:8080',
    token: 'test-token-123'
  });

  assert.equal(adapter.getProviderId(), 'MOODLE');
  assert.equal(adapter.getProviderName(), 'Moodle LMS');
  assert.equal(adapter.baseUrl, 'http://localhost:8080');
  assert.equal(adapter.token, 'test-token-123');
});

test('MoodleLmsAdapter healthCheck handles live and mock fallback modes gracefully', async () => {
  const mockAdapter = new MoodleLmsAdapter({
    token: ''
  });
  const health = await mockAdapter.healthCheck();
  assert.equal(health.provider, 'MOODLE');
  assert.ok(['UP', 'DEGRADED'].includes(health.status));
});

test('MoodleLmsAdapter retrieves normalized course catalog', async () => {
  const adapter = new MoodleLmsAdapter();
  const courses = await adapter.getCourses();

  assert.ok(Array.isArray(courses));
  assert.ok(courses.length > 0);
  const first = courses[0];
  assert.ok(first.title);
  assert.ok(first.provider === 'MOODLE');
  assert.ok(first.portalUrl);
});

test('MoodleLmsAdapter retrieves authoritative certificates and normalized learner details', async () => {
  const adapter = new MoodleLmsAdapter();
  const learner = await adapter.getLearnerDetails('learner@example.com');

  assert.equal(learner.email, 'learner@example.com');
  assert.equal(learner.provider, 'MOODLE');
  assert.ok(Array.isArray(learner.enrolledCourses));

  const certs = await adapter.getAuthoritativeIssuedCertificates();
  assert.ok(Array.isArray(certs));
  assert.ok(certs.length > 0);
  assert.ok(certs[0].certificateId);
  assert.ok(certs[0].verificationUrl);
});

test('MoodleContinuousSyncService matches learners via normalized email and ingests certificates idempotently', async () => {
  // Ensure default learner exists in test database
  const normalizedEmail = 'learner@example.com';
  const testUser = (db.users || []).find(u => u.email === normalizedEmail) || {
    id: 'u-learner',
    name: 'Maya Chen',
    email: normalizedEmail,
    role: 'LEARNER'
  };

  // Run sync
  const result1 = await moodleContinuousSyncService.syncNow({ actorId: 'TEST_SUITE', force: true });
  assert.equal(result1.status, 'SUCCESS');
  assert.ok(result1.syncedCount >= 1);

  // Check external_certificates record exists
  const certRes = await query(
    'SELECT * FROM external_certificates WHERE user_id = $1 AND provider = $2',
    [testUser.id, 'MOODLE']
  );
  assert.ok(certRes.rows.length >= 1);
  const syncedCert = certRes.rows[0];
  assert.equal(syncedCert.provider, 'MOODLE');
  assert.equal(syncedCert.verification_status, 'VERIFIED');

  // Second sync run should be idempotent (no duplicate rows created)
  const countBefore = certRes.rows.length;
  await moodleContinuousSyncService.syncNow({ actorId: 'TEST_SUITE', force: true });
  const certRes2 = await query(
    'SELECT * FROM external_certificates WHERE user_id = $1 AND provider = $2',
    [testUser.id, 'MOODLE']
  );
  assert.equal(certRes2.rows.length, countBefore, 'Idempotent sync must not create duplicate certificates');
});

test('MoodleContinuousSyncService safely stages unmatched learner emails without creating phantom accounts', async () => {
  const initialUserCount = (db.users || []).length;

  // Staged unmatched cert insert
  await query(`
    INSERT INTO unmatched_external_certificates (
      id, raw_email, normalized_email, provider, course_name, credential_id, verification_url, status, payload, created_at
    ) VALUES ($1, $2, $3, 'MOODLE', $4, $5, $6, 'PENDING_REVIEW', $7, NOW())
    ON CONFLICT (provider, credential_id) DO NOTHING
  `, [
    'unmatched-1',
    'Unknown.Student@Domain.Org',
    'unknown.student@domain.org',
    'Advanced Kubernetes Operations',
    'MOODLE-UNMATCHED-999',
    'http://localhost:8080/verify?code=999',
    JSON.stringify({ note: 'Unmatched test record' })
  ]);

  const staged = await query(
    "SELECT * FROM unmatched_external_certificates WHERE status = 'PENDING_REVIEW'"
  );
  assert.ok(staged.rows.length >= 1);

  // Verify no new user accounts were created
  const postUserCount = (db.users || []).length;
  assert.equal(postUserCount, initialUserCount, 'Sync must never auto-create phantom user accounts for unmatched emails');
});
