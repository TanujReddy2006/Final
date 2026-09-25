import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/config/database.js';

test('health and demo login work', async () => {
  const health = await request(app).get('/api/v1/health');
  assert.equal(health.status, 200);

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'learner@example.com', password: 'Demo@123' });
  assert.equal(login.status, 200);
  assert.ok(login.body.data.token);
});

test('empty course catalog is public and contains no seeded courses', async () => {
  const result = await request(app).get('/api/v1/courses');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, []);
});

test('only companies can create courses', async () => {
  const learner = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'learner@example.com', password: 'Demo@123' });

  const result = await request(app)
    .post('/api/v1/courses')
    .set('Authorization', `Bearer ${learner.body.data.token}`)
    .send({
      title: 'Unauthorized',
      description: 'Should not be created',
      modules: [{ title: 'One', content: 'Content' }]
    });

  assert.equal(result.status, 403);
});

test('company-to-certificate flow is backend validated', async () => {
  const company = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'company@example.com', password: 'Demo@123' });

  const learner = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'learner@example.com', password: 'Demo@123' });

  const companyHeaders = { Authorization: `Bearer ${company.body.data.token}` };
  const learnerHeaders = { Authorization: `Bearer ${learner.body.data.token}` };

  const draft = await request(app)
    .post('/api/v1/courses/draft')
    .set(companyHeaders)
    .send({
      title: 'API Foundations',
      description: 'Learn APIs',
      modules: [
        {
          title: 'HTTP',
          lessons: [{ title: 'Requests', content: 'Read HTTP content', type: 'READING' }]
        }
      ],
      assessmentTitle: 'Final',
      passingScore: 70,
      questions: [
        {
          id: 'flow-q',
          text: 'What transports API data?',
          marks: 2,
          options: [
            { id: 'flow-a', text: 'HTTP', correct: true },
            { id: 'flow-b', text: 'Paper', correct: false }
          ]
        }
      ]
    });
  assert.equal(draft.status, 200);

  const invalidPublish = await request(app)
    .patch(`/api/v1/courses/${draft.body.data.id}/publish`)
    .set(companyHeaders);
  assert.equal(invalidPublish.status, 200);

  const course = invalidPublish.body.data;
  const enrollment = await request(app)
    .post('/api/v1/enrollments')
    .set(learnerHeaders)
    .send({ courseId: course.id });
  assert.equal(enrollment.status, 200);

  const module = course.modules[0];
  const lesson = module.lessons[0];

  assert.equal(
    (await request(app).post(`/api/v1/progress/${course.id}/${module.id}/read`).set(learnerHeaders)).status,
    200
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/v1/progress/${course.id}/${module.id}/lessons/${lesson.id}/complete`)
        .set(learnerHeaders)
    ).status,
    200
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/progress')
        .set(learnerHeaders)
        .send({ courseId: course.id, moduleId: module.id })
    ).status,
    200
  );

  const assessment = db.assessments.find(item => item.id === course.assessmentId);
  const result = await request(app)
    .post(`/api/v1/assessments/${assessment.id}/submit`)
    .set(learnerHeaders)
    .send({ answers: { 'flow-q': 'flow-a' } });

  assert.equal(result.body.data.passed, true);
  assert.ok(result.body.data.certificate.certificateId);

  const pdf = await request(app).get(`/api/v1/certificates/${result.body.data.certificate.certificateId}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
});

test('assessment enforces maximum 3 attempts and uses highest score for certificate', async () => {
  const company = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'company@example.com', password: 'Demo@123' });
  const learner = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'learner@example.com', password: 'Demo@123' });

  const companyHeaders = { Authorization: `Bearer ${company.body.data.token}` };
  const learnerHeaders = { Authorization: `Bearer ${learner.body.data.token}` };

  // Create course with 2 questions (50% each), passing score 50%
  const draft = await request(app)
    .post('/api/v1/courses/draft')
    .set(companyHeaders)
    .send({
      title: 'Attempt Limit Course',
      description: 'Testing attempts and scores',
      modules: [
        {
          title: 'Module 1',
          lessons: [{ title: 'Lesson 1', content: 'Testing content', type: 'READING' }]
        }
      ],
      passingScore: 50,
      maxAttempts: 3,
      questions: [
        {
          id: 'q1',
          text: 'Question 1',
          marks: 1,
          options: [
            { id: 'q1-a', text: 'Correct 1', correct: true },
            { id: 'q1-b', text: 'Wrong 1', correct: false }
          ]
        },
        {
          id: 'q2',
          text: 'Question 2',
          marks: 1,
          options: [
            { id: 'q2-a', text: 'Correct 2', correct: true },
            { id: 'q2-b', text: 'Wrong 2', correct: false }
          ]
        }
      ]
    });

  await request(app)
    .patch(`/api/v1/courses/${draft.body.data.id}/publish`)
    .set(companyHeaders);

  const course = draft.body.data;
  await request(app).post('/api/v1/enrollments').set(learnerHeaders).send({ courseId: course.id });

  // Complete course module
  const modId = course.modules[0].id;
  await request(app).post(`/api/v1/progress/${course.id}/${modId}/read`).set(learnerHeaders);
  await request(app).post('/api/v1/progress').set(learnerHeaders).send({ courseId: course.id, moduleId: modId });

  // Attempt 1: score 50% (answers q1 correctly, q2 wrong)
  const attempt1 = await request(app)
    .post(`/api/v1/assessments/${course.assessmentId}/submit`)
    .set(learnerHeaders)
    .send({ answers: { q1: 'q1-a', q2: 'q2-b' } });

  assert.equal(attempt1.status, 200);
  assert.equal(attempt1.body.data.score, 50);
  assert.equal(attempt1.body.data.highestScore, 50);
  assert.equal(attempt1.body.data.attemptsTaken, 1);
  assert.equal(attempt1.body.data.remainingAttempts, 2);
  assert.equal(attempt1.body.data.certificate.score, 50);

  // Attempt 2: score 100% (answers both correctly)
  const attempt2 = await request(app)
    .post(`/api/v1/assessments/${course.assessmentId}/submit`)
    .set(learnerHeaders)
    .send({ answers: { q1: 'q1-a', q2: 'q2-a' } });

  assert.equal(attempt2.status, 200);
  assert.equal(attempt2.body.data.score, 100);
  assert.equal(attempt2.body.data.highestScore, 100);
  assert.equal(attempt2.body.data.attemptsTaken, 2);
  assert.equal(attempt2.body.data.remainingAttempts, 1);
  assert.equal(attempt2.body.data.certificate.score, 100);

  // Attempt 3: score 0% (answers both wrong)
  const attempt3 = await request(app)
    .post(`/api/v1/assessments/${course.assessmentId}/submit`)
    .set(learnerHeaders)
    .send({ answers: { q1: 'q1-b', q2: 'q2-b' } });

  assert.equal(attempt3.status, 200);
  assert.equal(attempt3.body.data.score, 0);
  // Highest score should still be 100!
  assert.equal(attempt3.body.data.highestScore, 100);
  assert.equal(attempt3.body.data.attemptsTaken, 3);
  assert.equal(attempt3.body.data.remainingAttempts, 0);
  assert.equal(attempt3.body.data.certificate.score, 100);

  // Attempt 4: Should be rejected because max 3 attempts reached
  const attempt4 = await request(app)
    .post(`/api/v1/assessments/${course.assessmentId}/submit`)
    .set(learnerHeaders)
    .send({ answers: { q1: 'q1-a', q2: 'q2-a' } });

  assert.equal(attempt4.status, 400);
  assert.match(attempt4.body.message, /Maximum assessment attempts/i);
});

test('admin endpoints allow managing users and viewing certificates', async () => {
  const admin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: 'Demo@123' });
  const adminHeaders = { Authorization: `Bearer ${admin.body.data.token}` };

  const usersRes = await request(app).get('/api/v1/admin/users').set(adminHeaders);
  assert.equal(usersRes.status, 200);
  assert.ok(Array.isArray(usersRes.body.data));
  assert.ok(usersRes.body.data.length > 0);

  const certsRes = await request(app).get('/api/v1/admin/certificates').set(adminHeaders);
  assert.equal(certsRes.status, 200);
  assert.ok(Array.isArray(certsRes.body.data));

  // Cannot modify user role (admin cannot change user roles)
  const promoteRes = await request(app)
    .patch('/api/v1/admin/users/u-learner')
    .set(adminHeaders)
    .send({ role: 'ADMIN' });
  assert.equal(promoteRes.status, 400);

  // Cannot deactivate the sole admin account
  const deactRes = await request(app)
    .patch('/api/v1/admin/users/u-admin')
    .set(adminHeaders)
    .send({ active: false });
  assert.equal(deactRes.status, 400);

  // Register a temporary user to test deactivation and permanent deletion
  const tempEmail = `temp_del_${Date.now()}@example.com`;
  const tempUserRes = await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Temp Deletion User',
      email: tempEmail,
      password: 'Password@123'
    });
  assert.equal(tempUserRes.status, 200);
  const tempUserId = tempUserRes.body.data.user.id;

  // Cannot delete an active account
  const prematureDelete = await request(app)
    .delete(`/api/v1/admin/users/${tempUserId}`)
    .set(adminHeaders);
  assert.equal(prematureDelete.status, 400);

  // Deactivate the account
  const deactTemp = await request(app)
    .patch(`/api/v1/admin/users/${tempUserId}`)
    .set(adminHeaders)
    .send({ active: false });
  assert.equal(deactTemp.status, 200);

  // Delete the deactivated account permanently
  const deleteRes = await request(app)
    .delete(`/api/v1/admin/users/${tempUserId}`)
    .set(adminHeaders);
  assert.equal(deleteRes.status, 200);

  // Verify user is gone from user list and database
  const usersAfterDelete = await request(app)
    .get('/api/v1/admin/users')
    .set(adminHeaders);
  const foundDeleted = usersAfterDelete.body.data.find(u => u.id === tempUserId);
  assert.equal(foundDeleted, undefined);

  // Deleting primary admin account is strictly blocked
  const deleteAdminRes = await request(app)
    .delete('/api/v1/admin/users/u-admin')
    .set(adminHeaders);
  assert.equal(deleteAdminRes.status, 400);
});

test('company can view learners enrolled in their courses', async () => {
  const company = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'company@example.com', password: 'Demo@123' });
  const companyHeaders = { Authorization: `Bearer ${company.body.data.token}` };

  const learnersRes = await request(app).get('/api/v1/company/learners').set(companyHeaders);
  assert.equal(learnersRes.status, 200);
  assert.ok(Array.isArray(learnersRes.body.data));
});

test('certificate verification supports both routes, case-insensitivity, and certificate numbers', async () => {
  const company = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'company@example.com', password: 'Demo@123' });
  const learner = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'learner@example.com', password: 'Demo@123' });
  const hr = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'hr@example.com', password: 'Demo@123' });

  const companyHeaders = { Authorization: `Bearer ${company.body.data.token}` };
  const learnerHeaders = { Authorization: `Bearer ${learner.body.data.token}` };
  const hrHeaders = { Authorization: `Bearer ${hr.body.data.token}` };

  // 1. Issue a certificate by completing a course
  const draft = await request(app)
    .post('/api/v1/courses/draft')
    .set(companyHeaders)
    .send({
      title: 'Verification Test Course',
      description: 'Course to verify certificate resolution',
      modules: [
        {
          title: 'Module 1',
          lessons: [{ title: 'Lesson 1', content: 'Study material', type: 'READING' }]
        }
      ],
      assessmentTitle: 'Final Exam',
      passingScore: 60,
      questions: [
        {
          id: 'v-q1',
          text: 'Is certificate verification working?',
          marks: 1,
          options: [
            { id: 'v-opt-yes', text: 'Yes', correct: true },
            { id: 'v-opt-no', text: 'No', correct: false }
          ]
        }
      ]
    });
  assert.equal(draft.status, 200);

  const published = await request(app)
    .patch(`/api/v1/courses/${draft.body.data.id}/publish`)
    .set(companyHeaders);
  const course = published.body.data;

  await request(app).post('/api/v1/enrollments').set(learnerHeaders).send({ courseId: course.id });
  const mod = course.modules[0];
  await request(app).post(`/api/v1/progress/${course.id}/${mod.id}/read`).set(learnerHeaders);
  await request(app).post(`/api/v1/progress/${course.id}/${mod.id}/lessons/${mod.lessons[0].id}/complete`).set(learnerHeaders);
  await request(app).post('/api/v1/progress').set(learnerHeaders).send({ courseId: course.id, moduleId: mod.id });

  const submitRes = await request(app)
    .post(`/api/v1/assessments/${course.assessmentId}/submit`)
    .set(learnerHeaders)
    .send({ answers: { 'v-q1': 'v-opt-yes' } });

  assert.equal(submitRes.status, 200);
  const cert = submitRes.body.data.certificate;
  assert.ok(cert.certificateId);

  // 2. Test verification via direct route /api/v1/verify/:certificateId
  const directRes = await request(app).get(`/api/v1/verify/${cert.certificateId}`);
  assert.equal(directRes.status, 200);
  assert.equal(directRes.body.data.valid, true);
  assert.equal(directRes.body.data.status, 'VALID');
  assert.equal(directRes.body.data.certificateId, cert.certificateId);

  // 3. Test verification via QR code route /api/v1/verify/certificate/:certificateId
  const qrRes = await request(app).get(`/api/v1/verify/certificate/${cert.certificateId}`);
  assert.equal(qrRes.status, 200);
  assert.equal(qrRes.body.data.valid, true);
  assert.equal(qrRes.body.data.certificateId, cert.certificateId);

  // 4. Test case-insensitivity (lowercase)
  const lowerRes = await request(app).get(`/api/v1/verify/${cert.certificateId.toLowerCase()}`);
  assert.equal(lowerRes.status, 200);
  assert.equal(lowerRes.body.data.valid, true);
  assert.equal(lowerRes.body.data.certificateId, cert.certificateId);

  // 5. Test verification by certificateNumber if present
  if (cert.certificateNumber) {
    const numRes = await request(app).get(`/api/v1/verify/${cert.certificateNumber}`);
    assert.equal(numRes.status, 200);
    assert.equal(numRes.body.data.valid, true);
    assert.equal(numRes.body.data.certificateId, cert.certificateId);
  }

  // 6. Test HR overview endpoint
  const hrOverviewRes = await request(app).get('/api/v1/hr/overview').set(hrHeaders);
  assert.equal(hrOverviewRes.status, 200);
  assert.ok(hrOverviewRes.body.data.certificatesCount > 0);
  assert.ok(hrOverviewRes.body.data.validCertificates > 0);

  // 7. Test HR certificates registry endpoint
  const hrCertsRes = await request(app).get('/api/v1/hr/certificates').set(hrHeaders);
  assert.equal(hrCertsRes.status, 200);
  assert.ok(Array.isArray(hrCertsRes.body.data));
  const foundInHr = hrCertsRes.body.data.find(c => c.certificateId === cert.certificateId);
  assert.ok(foundInHr);
  assert.equal(foundInHr.learnerName, 'Maya Chen');
});

test('deployment readiness: health checks, Vercel CORS, and self-healing PDF regeneration', async () => {
  // 1. Health checks for Render
  const healthzRes = await request(app).get('/healthz');
  assert.equal(healthzRes.status, 200);
  assert.equal(healthzRes.body.data.status, 'ok');

  const healthRes = await request(app).get('/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.body.data.status, 'ok');

  // 2. Vercel domain CORS support
  const corsRes = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'https://learnforge-staging-123.vercel.app');
  assert.equal(corsRes.status, 200);
  assert.equal(corsRes.headers['access-control-allow-origin'], 'https://learnforge-staging-123.vercel.app');
  assert.equal(corsRes.headers['access-control-allow-credentials'], 'true');

  // 3. Self-healing PDF regeneration if file missing on disk
  const { readCertificatePdf } = await import('../src/services/certificateService.js');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const testCert = db.certificates[0];
  if (testCert) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const targetPdfPath = path.resolve(__dirname, '..', 'storage', 'certificates', `${testCert.certificateId}.pdf`);

    // Remove file from disk to simulate ephemeral container restart
    try {
      await fs.unlink(targetPdfPath);
    } catch {
      // ignore if already deleted
    }

    // readCertificatePdf should automatically regenerate it
    const regeneratedBuffer = await readCertificatePdf(testCert.certificateId);
    assert.ok(regeneratedBuffer);
    assert.ok(Buffer.isBuffer(regeneratedBuffer));
    assert.ok(regeneratedBuffer.length > 500);
    assert.equal(regeneratedBuffer.slice(0, 4).toString(), '%PDF');
  }
});

test('user registration validates all fields strictly and allows login after creation', async () => {
  // 1. Missing or short name
  const res1 = await request(app).post('/api/v1/auth/register').send({
    name: 'A',
    email: 'valid1@example.com',
    password: 'Password@123'
  });
  assert.equal(res1.status, 400);

  // 2. Malformed email
  const res2 = await request(app).post('/api/v1/auth/register').send({
    name: 'Valid Name',
    email: 'invalid-email@',
    password: 'Password@123'
  });
  assert.equal(res2.status, 400);

  // 3. Short password
  const res3 = await request(app).post('/api/v1/auth/register').send({
    name: 'Valid Name',
    email: 'valid2@example.com',
    password: 'P@1'
  });
  assert.equal(res3.status, 400);

  // 4. Missing uppercase in password
  const res4 = await request(app).post('/api/v1/auth/register').send({
    name: 'Valid Name',
    email: 'valid3@example.com',
    password: 'password@123'
  });
  assert.equal(res4.status, 400);

  // 5. Missing special character in password
  const res5 = await request(app).post('/api/v1/auth/register').send({
    name: 'Valid Name',
    email: 'valid4@example.com',
    password: 'Password123'
  });
  assert.equal(res5.status, 400);

  // 6. Duplicate email (learner@example.com already exists)
  const res6 = await request(app).post('/api/v1/auth/register').send({
    name: 'Duplicate Learner',
    email: 'learner@example.com',
    password: 'Password@123'
  });
  assert.equal(res6.status, 409);

  // 7. Successful registration
  const newEmail = `learner_${Date.now()}@example.com`;
  const regSuccess = await request(app).post('/api/v1/auth/register').send({
    name: 'New Registered User',
    email: newEmail,
    password: 'Password@123'
  });
  assert.equal(regSuccess.status, 200);
  assert.ok(regSuccess.body.data.token);
  assert.equal(regSuccess.body.data.user.email, newEmail);
  assert.equal(regSuccess.body.data.user.name, 'New Registered User');

  // 8. Immediate login with the new user credentials
  const loginSuccess = await request(app).post('/api/v1/auth/login').send({
    email: newEmail,
    password: 'Password@123'
  });
  assert.equal(loginSuccess.status, 200);
  assert.ok(loginSuccess.body.data.token);
  assert.equal(loginSuccess.body.data.user.email, newEmail);

  // 9. Registration as ADMIN is strictly prohibited
  const adminRegRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Rogue Admin',
    email: 'rogue_admin@example.com',
    password: 'Password@123',
    role: 'ADMIN'
  });
  assert.equal(adminRegRes.status, 403);
  assert.equal(adminRegRes.body.success, false);
});

test('profile full name update PATCH /api/v1/users/me enforces authentication and validation', async () => {
  // 1. Unauthenticated request rejected
  const unauth = await request(app)
    .patch('/api/v1/users/me')
    .send({ name: 'New Name' });
  assert.equal(unauth.status, 401);

  // Login as demo learner
  const learner = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'learner@example.com', password: 'Demo@123' });
  const token = learner.body.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  // 2. Empty or invalid name (< 2 characters)
  const invalidShort = await request(app)
    .patch('/api/v1/users/me')
    .set(headers)
    .send({ name: 'A' });
  assert.equal(invalidShort.status, 400);

  const invalidEmpty = await request(app)
    .patch('/api/v1/users/me')
    .set(headers)
    .send({ name: '   ' });
  assert.equal(invalidEmpty.status, 400);

  // 3. Successful name update
  const updatedName = `Maya Chen ${Date.now().toString().slice(-4)}`;
  const success = await request(app)
    .patch('/api/v1/users/me')
    .set(headers)
    .send({ name: updatedName });
  assert.equal(success.status, 200);
  assert.equal(success.body.data.user.name, updatedName);

  // Verify /auth/me reflects the new name
  const me = await request(app).get('/api/v1/auth/me').set(headers);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.name, updatedName);
});

test('course publishing makes course immediately available in learner catalog', async () => {
  const company = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'company@example.com', password: 'Demo@123' });
  const companyHeaders = { Authorization: `Bearer ${company.body.data.token}` };

  // Create draft course
  const draftRes = await request(app)
    .post('/api/v1/courses/draft')
    .set(companyHeaders)
    .send({
      title: 'Catalog Test Course',
      description: 'Course to verify immediate appearance in learner catalog',
      modules: [
        {
          title: 'Module 1',
          lessons: [{ title: 'Lesson 1', content: 'Study material', type: 'READING' }]
        }
      ],
      assessmentTitle: 'Final Exam',
      passingScore: 70,
      questions: [
        {
          id: 'cat-q1',
          text: 'Is course catalog working?',
          marks: 1,
          options: [{ id: 'opt-yes', text: 'Yes', correct: true }]
        }
      ]
    });
  assert.equal(draftRes.status, 200);
  const courseId = draftRes.body.data.id;

  // Publish course
  const publishRes = await request(app)
    .patch(`/api/v1/courses/${courseId}/publish`)
    .set(companyHeaders);
  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.body.data.status, 'PUBLISHED');

  // Verify learner catalog GET /api/v1/courses immediately contains the published course
  const catalogRes = await request(app).get('/api/v1/courses');
  assert.equal(catalogRes.status, 200);
  const found = catalogRes.body.data.find(c => c.id === courseId);
  assert.ok(found, 'Published course must be present in learner catalog');
  assert.equal(found.title, 'Catalog Test Course');
});

test('standard LMS adapter layer operates cleanly with Infosys Springboard provider and ONEST schema', async () => {
  // 1. Providers endpoint lists Infosys Springboard
  const provRes = await request(app).get('/api/v1/lms/providers');
  assert.equal(provRes.status, 200);
  assert.ok(Array.isArray(provRes.body.data));
  const hasInfosys = provRes.body.data.some(p => p.providerId === 'INFOSYS_SPRINGBOARD');
  assert.ok(hasInfosys, 'Infosys Springboard provider must be registered');

  // 2. Query courses via standard LMS adapter
  const coursesRes = await request(app).get('/api/v1/lms/courses?provider=INFOSYS_SPRINGBOARD');
  assert.equal(coursesRes.status, 200);
  assert.ok(Array.isArray(coursesRes.body.data));
  assert.ok(coursesRes.body.data.length > 0);
  const sampleCourse = coursesRes.body.data[0];
  assert.equal(sampleCourse.provider, 'INFOSYS_SPRINGBOARD');
  assert.ok(sampleCourse.onestDescriptor);
  assert.ok(sampleCourse.onestTags);
  assert.ok(sampleCourse.nsqfLevel);

  // 3. Query course details via standard LMS adapter
  const detailRes = await request(app).get(`/api/v1/lms/courses/${sampleCourse.id}?provider=INFOSYS_SPRINGBOARD`);
  assert.equal(detailRes.status, 200);
  assert.ok(Array.isArray(detailRes.body.data.modules));
  assert.ok(detailRes.body.data.modules.length > 0);

  // 4. Progress sync via standard LMS adapter
  const syncProgRes = await request(app)
    .post('/api/v1/lms/sync/progress')
    .send({
      provider: 'INFOSYS_SPRINGBOARD',
      studentEmail: 'learner@example.com',
      courseId: sampleCourse.id,
      progressPercentage: 85,
      completedModules: 4,
      totalModules: 5
    });
  assert.equal(syncProgRes.status, 200);
  assert.equal(syncProgRes.body.data.progressPercentage, 85);
  assert.equal(syncProgRes.body.data.provider, 'INFOSYS_SPRINGBOARD');

  // 5. Certificate sync from Infosys Springboard and HR verification
  const testCertId = `INFY-TEST-${Date.now().toString().slice(-5)}`;
  const syncCertRes = await request(app)
    .post('/api/v1/lms/sync/certificate')
    .send({
      provider: 'INFOSYS_SPRINGBOARD',
      certificateId: testCertId,
      studentEmail: 'learner@example.com',
      studentName: 'Maya Chen',
      courseTitle: sampleCourse.title,
      score: 95,
      skills: ['Cloud', 'DevOps', 'CI/CD']
    });
  assert.equal(syncCertRes.status, 200);
  assert.equal(syncCertRes.body.data.certificateId, testCertId);

  // 6. Verify HR verification endpoint immediately resolves the Infosys certificate
  const hrVerifyRes = await request(app).get(`/api/v1/verify/${testCertId}`);
  assert.equal(hrVerifyRes.status, 200);
  assert.equal(hrVerifyRes.body.data.valid, true);
  assert.equal(hrVerifyRes.body.data.certificateId, testCertId);
  assert.equal(hrVerifyRes.body.data.issuedBy, 'Infosys Springboard');

  // 7. Email-based learner details lookup
  const learnerRes = await request(app).get('/api/v1/lms/learner/learner@example.com?provider=INFOSYS_SPRINGBOARD');
  assert.equal(learnerRes.status, 200);
  assert.equal(learnerRes.body.success, true);
  assert.equal(learnerRes.body.data.email, 'learner@example.com');
  assert.ok(learnerRes.body.data.learnerId);
  assert.ok(Array.isArray(learnerRes.body.data.enrollments));
  assert.ok(Array.isArray(learnerRes.body.data.skills));
  assert.ok(learnerRes.body.data.nsqfCompetencies);

  // 8. Email-based enrollments lookup
  const enrollRes = await request(app).get('/api/v1/lms/enrollments?email=learner@example.com&provider=INFOSYS_SPRINGBOARD');
  assert.equal(enrollRes.status, 200);
  assert.equal(enrollRes.body.success, true);
  assert.ok(Array.isArray(enrollRes.body.data));
  assert.ok(enrollRes.body.data.length > 0);

  // 9. Email-based certificates lookup
  const certRes = await request(app).get('/api/v1/lms/certificates?email=learner@example.com&provider=INFOSYS_SPRINGBOARD');
  assert.equal(certRes.status, 200);
  assert.equal(certRes.body.success, true);
  assert.ok(Array.isArray(certRes.body.data));
});

test('company registration requires admin approval before details enter database, and logs show user name and role', async () => {
  // 1. Register a new user with COMPANY role
  const testEmail = `pending_co_${Date.now()}@example.com`;
  const companyName = `Acme Training ${Date.now()}`;
  const applicantName = 'Samantha Vance';

  const regRes = await request(app).post('/api/v1/auth/register').send({
    name: applicantName,
    email: testEmail,
    password: 'Password@123',
    role: 'COMPANY',
    companyName
  });

  assert.equal(regRes.status, 200);
  assert.equal(regRes.body.success, true);
  assert.equal(regRes.body.pendingApproval, true);
  assert.ok(regRes.body.message.includes('Administrator approval is required'));

  // 2. Verify user and company are NOT in the active database or db.users
  const userInDb = db.users.find(u => u.email === testEmail);
  assert.equal(userInDb, undefined, 'User must not be added to users table/list before approval');

  const compInDb = db.companies.find(c => c.name === companyName);
  assert.equal(compInDb, undefined, 'Company must not be added to companies table/list before approval');

  // 3. Verify company cannot log in while pending approval (receives 403)
  const pendingLoginRes = await request(app).post('/api/v1/auth/login').send({
    email: testEmail,
    password: 'Password@123'
  });
  assert.equal(pendingLoginRes.status, 403);
  assert.equal(pendingLoginRes.body.success, false);
  assert.ok(pendingLoginRes.body.message.includes('awaiting administrator approval'));

  // 4. Admin logs in and checks pending companies list
  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: 'admin@example.com',
    password: 'Demo@123'
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  const pendingListRes = await request(app)
    .get('/api/v1/admin/pending-companies')
    .set(adminHeaders);
  assert.equal(pendingListRes.status, 200);
  assert.ok(Array.isArray(pendingListRes.body.data));

  const pendingItem = pendingListRes.body.data.find(p => p.email === testEmail);
  assert.ok(pendingItem, 'Pending registration should be visible to admin');
  assert.equal(pendingItem.companyName, companyName);
  assert.equal(pendingItem.name, applicantName);

  // 5. Admin approves the company registration
  const approveRes = await request(app)
    .post(`/api/v1/admin/pending-companies/${pendingItem.id}/approve`)
    .set(adminHeaders);
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.success, true);
  assert.ok(approveRes.body.data.company);
  assert.ok(approveRes.body.data.user);
  assert.equal(approveRes.body.data.user.role, 'COMPANY');

  // 6. User and company are now present in the database
  const approvedUser = db.users.find(u => u.email === testEmail);
  assert.ok(approvedUser, 'Approved user must now exist in users database');
  assert.equal(approvedUser.role, 'COMPANY');
  assert.equal(approvedUser.active, true);

  const approvedCompany = db.companies.find(c => c.name === companyName);
  assert.ok(approvedCompany, 'Approved company must now exist in companies database');

  // 7. Approved user can now log in successfully
  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: testEmail,
    password: 'Password@123'
  });
  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.body.data.token);
  assert.equal(loginRes.body.data.user.email, testEmail);
  assert.equal(loginRes.body.data.user.role, 'COMPANY');

  // 8. Verify audit logs contain user name and user role
  const auditRes = await request(app)
    .get('/api/v1/admin/overview')
    .set(adminHeaders);
  assert.equal(auditRes.status, 200);
  const logs = auditRes.body.data.auditLogs;
  assert.ok(Array.isArray(logs));
  assert.ok(logs.length > 0);

  // All recent logs must have non-empty userName and userRole
  for (const log of logs.slice(0, 5)) {
    assert.ok(log.userName, `Log ${log.action} should have userName`);
    assert.ok(log.userRole, `Log ${log.action} should have userRole`);
  }

  // Find the company registration and approval logs specifically
  const pendingLog = logs.find(l => l.action === 'COMPANY_REGISTRATION_PENDING');
  assert.ok(pendingLog, 'Should have logged COMPANY_REGISTRATION_PENDING');
  assert.equal(pendingLog.userName, applicantName);
  assert.equal(pendingLog.userRole, 'COMPANY');

  const approvedLog = logs.find(l => l.action === 'COMPANY_APPROVED');
  assert.ok(approvedLog, 'Should have logged COMPANY_APPROVED');
  assert.equal(approvedLog.userName, 'Riley Admin');
  assert.equal(approvedLog.userRole, 'ADMIN');
});




