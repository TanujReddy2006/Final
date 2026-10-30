import test from 'node:test';
import assert from 'node:assert/strict';
import { OnestProtocolService } from '../src/services/onestProtocolService.js';

test('OnestProtocolService generates valid Beckn 2.0.0 Context', () => {
  const service = new OnestProtocolService({
    bapId: 'learnforge.network',
    bapUri: 'http://localhost:4000/api/onest'
  });

  const context = service.createContext({
    action: 'status',
    transactionId: 'txn-12345',
    bppId: 'moodle.network',
    bppUri: 'http://localhost:8080/onest'
  });

  assert.equal(context.domain, 'onest:learning-experiences');
  assert.equal(context.version, '2.0.0');
  assert.equal(context.action, 'status');
  assert.equal(context.transaction_id, 'txn-12345');
  assert.equal(context.bap_id, 'learnforge.network');
  assert.equal(context.bpp_id, 'moodle.network');
  assert.ok(context.timestamp);
});

test('OnestProtocolService validates Beckn Context strictly', () => {
  const service = new OnestProtocolService();

  // Valid context
  const validContext = service.createContext({ action: 'on_status' });
  assert.equal(service.validateContext(validContext), true);

  // Missing domain
  assert.throws(() => {
    service.validateContext({ ...validContext, domain: null });
  }, /missing required field 'domain'/i);

  // Wrong domain
  assert.throws(() => {
    service.validateContext({ ...validContext, domain: 'nic2004:retail' });
  }, /unsupported domain/i);
});

test('OnestProtocolService generates standard Beckn ACK and NACK responses', () => {
  const service = new OnestProtocolService();

  const ack = service.createAck();
  assert.deepEqual(ack, {
    message: {
      ack: {
        status: 'ACK'
      }
    }
  });

  const nack = service.createNack('10001', 'Validation error');
  assert.equal(nack.message.ack.status, 'NACK');
  assert.equal(nack.error.code, '10001');
  assert.equal(nack.error.message, 'Validation error');
  assert.ok(nack.error.timestamp);
});

test('OnestProtocolService parses Beckn on_status payload and extracts credentials', () => {
  const service = new OnestProtocolService();
  const context = service.createContext({ action: 'on_status' });

  const payload = {
    context,
    message: {
      order: {
        id: 'ord-9988',
        customer: {
          person: {
            name: 'Maya Chen',
            email: 'learner@example.com'
          }
        },
        items: [
          {
            id: 'moodle-crs-101',
            descriptor: { name: 'Enterprise Cloud Architecture with Kubernetes' }
          }
        ],
        fulfillments: [
          {
            state: { descriptor: { code: 'COMPLETED' } },
            tags: [
              {
                descriptor: { code: 'progress' },
                list: [{ descriptor: { code: 'percentage' }, value: '100' }]
              },
              {
                descriptor: { code: 'credential' },
                list: [
                  { descriptor: { code: 'certificate_id' }, value: 'ONEST-CERT-5544' },
                  { descriptor: { code: 'verification_url' }, value: 'http://localhost:8080/verify' },
                  { descriptor: { code: 'issue_date' }, value: '2026-10-27T10:00:00Z' },
                  { descriptor: { code: 'score' }, value: '95' }
                ]
              }
            ]
          }
        ]
      }
    }
  };

  const parsed = service.parseOnStatusPayload(payload);
  assert.equal(parsed.orderId, 'ord-9988');
  assert.equal(parsed.learnerEmail, 'learner@example.com');
  assert.equal(parsed.learnerName, 'Maya Chen');
  assert.equal(parsed.isCompleted, true);
  assert.equal(parsed.completionPercentage, 100);
  assert.ok(parsed.certificateData);
  assert.equal(parsed.certificateData.credentialId, 'ONEST-CERT-5544');
});
