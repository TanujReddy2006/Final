/**
 * Moodle Connection & API Diagnostic Script
 * 
 * Tests connectivity between LearnForge backend and the configured Moodle LMS instance.
 * Verifies Web Services REST protocol, service token authentication, and required API functions.
 * 
 * Usage:
 *   node backend/scripts/test-moodle-connection.js
 */

import 'dotenv/config';
import { MoodleLmsAdapter } from '../src/adapters/providers/MoodleLmsAdapter.js';

async function runMoodleDiagnostic() {
  console.log('====================================================');
  console.log('   LearnForge ↔ Moodle LMS Connectivity Diagnostic  ');
  console.log('====================================================\n');

  const baseUrl = process.env.MOODLE_BASE_URL || 'http://localhost:8080';
  const wsToken = process.env.MOODLE_WS_TOKEN || '';
  const mockMode = process.env.MOODLE_MOCK_MODE === 'true' || !wsToken;

  console.log(`[Config] Target Moodle URL: ${baseUrl}`);
  console.log(`[Config] Web Service Token: ${wsToken ? '***' + wsToken.slice(-4) : '(Not configured)'}`);
  console.log(`[Config] Operating Mode:    ${mockMode ? 'MOCK_SANDBOX (Offline test mode)' : 'LIVE REST API'}\n`);

  const adapter = new MoodleLmsAdapter({
    baseUrl,
    wsToken,
    mockMode,
    timeoutMs: 15000
  });

  // 1. Health check & Site Info
  console.log('1. Checking Moodle Instance Reachability...');
  try {
    const health = await adapter.healthCheck();
    if (health.status === 'UP') {
      console.log('   ✓ Health check passed!');
      if (health.sitename) console.log(`   - Site Name:     ${health.sitename}`);
      if (health.moodleVersion) console.log(`   - Moodle Release: ${health.moodleVersion}`);
      if (health.siteurl) console.log(`   - Site URL:      ${health.siteurl}`);
    } else {
      console.warn(`   ⚠ Health check returned status: ${health.status} (${health.message})`);
    }
  } catch (err) {
    console.error(`   ✗ Health check failed: ${err.message}`);
  }

  // 2. Course Catalog Query
  console.log('\n2. Querying Moodle Courses via Web Services...');
  try {
    const courses = await adapter.getCourses();
    console.log(`   ✓ Successfully retrieved ${courses.length} course(s):`);
    courses.slice(0, 3).forEach(c => {
      console.log(`     • [${c.externalId || c.id}] ${c.title} (${c.modulesCount || 0} modules)`);
    });
  } catch (err) {
    console.error(`   ✗ Course retrieval failed: ${err.message}`);
  }

  // 3. Authoritative Issued Certificates Query
  console.log('\n3. Querying Authoritative Issued Certificates...');
  try {
    const certs = await adapter.getAuthoritativeIssuedCertificates();
    console.log(`   ✓ Found ${certs.length} authoritative certificate record(s):`);
    certs.forEach(c => {
      console.log(`     • [${c.certificateNumber || c.certificateId}] ${c.courseName} -> ${c.learnerName} (${c.learnerEmail})`);
    });
  } catch (err) {
    console.error(`   ✗ Certificate retrieval failed: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log('   Diagnostic completed successfully!              ');
  console.log('====================================================\n');
}

runMoodleDiagnostic().catch(err => {
  console.error('\nFatal Diagnostic Error:', err);
  process.exit(1);
});
