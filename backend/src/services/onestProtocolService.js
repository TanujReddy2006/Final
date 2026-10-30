/**
 * ONEST (Open Network for Education & Skilling Transformations) Protocol Service
 * 
 * Implements Beckn Protocol v2.0.0 specifications for the 'onest:learning-experiences' domain.
 * Strictly separates ONEST Beckn protocol orchestration from provider-specific LMS logic.
 * 
 * Core Capabilities:
 *  1. Beckn Context Builder & Validator (transaction_id, message_id, bap_id, bpp_id)
 *  2. Inbound 'on_status' Hook Handler (Fulfillment updates, Verifiable Credentials)
 *  3. Inbound 'on_search' / 'on_select' / 'on_confirm' Handlers
 *  4. Beckn Standard ACK / NACK Generator
 */

import crypto from 'node:crypto';

export class OnestProtocolService {
  constructor(config = {}) {
    this.bapId = config.bapId || process.env.ONEST_BAP_ID || 'learnforge.network';
    this.bapUri = config.bapUri || process.env.ONEST_BAP_URI || 'http://localhost:4000/api/onest';
    this.domain = 'onest:learning-experiences';
    this.version = '2.0.0';
    this.country = 'IND';
    this.city = 'std:080';
  }

  /**
   * Generates a standard Beckn Context object
   */
  createContext({ action, transactionId = null, messageId = null, bppId = null, bppUri = null }) {
    return {
      domain: this.domain,
      version: this.version,
      action: action || 'status',
      country: this.country,
      city: this.city,
      bap_id: this.bapId,
      bap_uri: this.bapUri,
      ...(bppId && { bpp_id: bppId }),
      ...(bppUri && { bpp_uri: bppUri }),
      transaction_id: transactionId || crypto.randomUUID(),
      message_id: messageId || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ttl: 'PT30S'
    };
  }

  /**
   * Validates inbound Beckn Context structure
   */
  validateContext(context) {
    if (!context) {
      throw new Error('Missing Beckn context object');
    }
    const required = ['domain', 'version', 'action', 'transaction_id', 'message_id', 'bap_id', 'bap_uri'];
    for (const field of required) {
      if (!context[field]) {
        throw new Error(`Invalid Beckn context: missing required field '${field}'`);
      }
    }
    if (context.domain !== this.domain) {
      throw new Error(`Unsupported domain '${context.domain}'. Expected '${this.domain}'`);
    }
    return true;
  }

  /**
   * Generate Beckn standard ACK response
   */
  createAck() {
    return {
      message: {
        ack: {
          status: 'ACK'
        }
      }
    };
  }

  /**
   * Generate Beckn standard NACK error response
   */
  createNack(errorCode = '10001', errorMessage = 'Invalid ONEST Payload') {
    return {
      message: {
        ack: {
          status: 'NACK'
        }
      },
      error: {
        code: String(errorCode),
        message: String(errorMessage),
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Build outbound ONEST 'status' query for an order / enrollment
   */
  buildStatusRequest({ orderId, transactionId = null, bppId = null, bppUri = null }) {
    return {
      context: this.createContext({
        action: 'status',
        transactionId,
        bppId,
        bppUri
      }),
      message: {
        order_id: String(orderId)
      }
    };
  }

  /**
   * Parse and normalize inbound ONEST 'on_status' Beckn payload
   * Extracts learner identity, course completion, and certificate credentials
   */
  parseOnStatusPayload(body) {
    this.validateContext(body?.context);

    const order = body?.message?.order;
    if (!order) {
      throw new Error("Invalid 'on_status' message: missing 'order' object");
    }

    const orderId = order.id || body.context.transaction_id;
    const fulfillments = order.fulfillments || [];
    const items = order.items || [];
    const customer = order.customer || {};

    // 1. Extract learner identity
    let learnerEmail = customer.person?.email || customer.email || '';
    let learnerName = customer.person?.name || customer.name || 'Verified Learner';

    // 2. Extract item / course metadata
    const firstItem = items[0] || {};
    const courseId = firstItem.id || 'moodle-crs-101';
    const courseTitle = firstItem.descriptor?.name || 'Moodle Certified Specialization';

    // 3. Extract completion status from fulfillments
    let isCompleted = false;
    let completionPercentage = 0;
    let certificateData = null;

    for (const f of fulfillments) {
      const stateCode = f.state?.descriptor?.code || '';
      if (stateCode === 'COMPLETED') {
        isCompleted = true;
        completionPercentage = 100;
      }

      // Check tags for progress & credentials
      const tags = f.tags || [];
      for (const tag of tags) {
        if (tag.descriptor?.code === 'progress') {
          const list = tag.list || [];
          const pctItem = list.find(l => l.descriptor?.code === 'percentage');
          if (pctItem) completionPercentage = Number(pctItem.value || 0);
        }

        if (tag.descriptor?.code === 'credential' || tag.descriptor?.code === 'certificate') {
          const list = tag.list || [];
          const certId = list.find(l => l.descriptor?.code === 'certificate_id')?.value;
          const certUrl = list.find(l => l.descriptor?.code === 'verification_url')?.value;
          const issuedDate = list.find(l => l.descriptor?.code === 'issue_date')?.value;
          const score = list.find(l => l.descriptor?.code === 'score')?.value;

          if (certId) {
            certificateData = {
              certificateId: certId,
              credentialId: certId,
              courseName: courseTitle,
              verificationUrl: certUrl || '',
              issueDate: issuedDate || new Date().toISOString(),
              score: Number(score || 100)
            };
          }
        }
      }
    }

    // Direct credential attachment inside order
    if (order.credentials && Array.isArray(order.credentials) && order.credentials.length > 0) {
      const cred = order.credentials[0];
      certificateData = {
        certificateId: cred.id || cred.credentialId,
        credentialId: cred.id || cred.credentialId,
        courseName: courseTitle,
        verificationUrl: cred.verification_url || cred.verificationUrl || '',
        issueDate: cred.issuance_date || cred.issuedDate || new Date().toISOString(),
        score: Number(cred.score || 100)
      };
    }

    return {
      orderId,
      transactionId: body.context.transaction_id,
      learnerEmail: learnerEmail ? learnerEmail.trim().toLowerCase() : '',
      learnerName,
      courseId,
      courseTitle,
      isCompleted,
      completionPercentage,
      certificateData,
      rawContext: body.context,
      rawOrder: order
    };
  }
}

export const onestProtocolService = new OnestProtocolService();
