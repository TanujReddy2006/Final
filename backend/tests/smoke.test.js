import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/data.js';

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



