import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { signToken } from '../src/middleware/auth.js';
import { db } from '../src/config/database.js';

const learnerUser = (db.users || []).find(u => u.role === 'LEARNER') || {
  id: 'u-learner',
  name: 'Maya Chen',
  email: 'learner@example.com',
  role: 'LEARNER'
};

const hrUser = (db.users || []).find(u => u.role === 'HR') || {
  id: 'u-hr',
  name: 'Avery Singh',
  email: 'hr@example.com',
  role: 'HR'
};

const learnerToken = signToken(learnerUser);
const hrToken = signToken(hrUser);

test('Learner can register an external certificate manually (initial status: UNVERIFIED)', async () => {
  const credId = `MANUAL-CRED-${Date.now()}`;
  const res = await request(app)
    .post('/api/external-certificates')
    .set('Authorization', `Bearer ${learnerToken}`)
    .send({
      courseName: 'AWS Certified Solutions Architect - Associate',
      certificateTitle: 'AWS Certified Solutions Architect',
      issuingOrganization: 'Amazon Web Services',
      credentialId: credId,
      verificationUrl: `https://aws.amazon.com/verify?id=${credId}`,
      issueDate: '2026-09-15T00:00:00Z',
      provider: 'MANUAL'
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.verificationStatus, 'UNVERIFIED', 'Manual certificates must strictly start as UNVERIFIED');
  assert.equal(res.body.data.credentialId, credId);
});

test('Duplicate external certificates with the same credential ID under same provider are rejected', async () => {
  const duplicateId = 'DUP-CRED-TEST-1234';

  // First submission
  await request(app)
    .post('/api/external-certificates')
    .set('Authorization', `Bearer ${learnerToken}`)
    .send({
      courseName: 'Google Cloud Certified Professional Cloud Architect',
      certificateTitle: 'Professional Cloud Architect',
      issuingOrganization: 'Google Cloud',
      credentialId: duplicateId,
      provider: 'MANUAL'
    });

  // Second submission with identical ID
  const dupRes = await request(app)
    .post('/api/external-certificates')
    .set('Authorization', `Bearer ${learnerToken}`)
    .send({
      courseName: 'Google Cloud Certified Professional Cloud Architect',
      certificateTitle: 'Professional Cloud Architect',
      issuingOrganization: 'Google Cloud',
      credentialId: duplicateId,
      provider: 'MANUAL'
    });

  assert.equal(dupRes.status, 409, 'Duplicate submission should return HTTP 409 Conflict');
});

test('Learners can list only their external certificates with filters', async () => {
  const res = await request(app)
    .get('/api/external-certificates?provider=MANUAL')
    .set('Authorization', `Bearer ${learnerToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  res.body.data.forEach(c => {
    assert.equal(c.userId, learnerUser.id);
  });
});

test('HR or Admin can verify an external certificate', async () => {
  // First create a certificate to verify
  const credId = `HR-VERIFY-${Date.now()}`;
  const createRes = await request(app)
    .post('/api/external-certificates')
    .set('Authorization', `Bearer ${learnerToken}`)
    .send({
      courseName: 'Docker Certified Associate',
      certificateTitle: 'Docker Certified Associate',
      issuingOrganization: 'Docker Inc.',
      credentialId: credId,
      provider: 'MANUAL'
    });

  const certId = createRes.body.data.id;

  // HR verifies the certificate
  const verifyRes = await request(app)
    .patch(`/api/external-certificates/${certId}/verify`)
    .set('Authorization', `Bearer ${hrToken}`)
    .send({
      status: 'VERIFIED',
      notes: 'Authoritative issuer credential confirmed by HR'
    });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.success, true);
  assert.equal(verifyRes.body.data.verificationStatus, 'VERIFIED');
});

test('Learners cannot verify certificates (role enforcement)', async () => {
  const res = await request(app)
    .patch('/api/external-certificates/ext-fake-id/verify')
    .set('Authorization', `Bearer ${learnerToken}`)
    .send({ status: 'VERIFIED' });

  assert.equal(res.status, 403, 'Learners must be forbidden from verifying certificates');
});
