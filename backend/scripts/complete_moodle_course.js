/**
 * Helper script to mark course completion in Moodle and trigger LearnForge continuous sync
 * Usage: node backend/scripts/complete_moodle_course.js [email] [courseId]
 */

import 'dotenv/config';
import { query } from '../src/config/database.js';
import { lmsRegistry } from '../src/adapters/LmsRegistry.js';
import { moodleContinuousSyncService } from '../src/services/moodleContinuousSyncService.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function main() {
  const targetEmail = (process.argv[2] || 'tanuj@gmail.com').trim().toLowerCase();
  const courseId = parseInt(process.argv[3] || '2', 10);

  console.log('====================================================');
  console.log('   Moodle Course Completion & LearnForge Auto-Sync  ');
  console.log('====================================================');
  console.log(`Target Learner Email: ${targetEmail}`);
  console.log(`Target Course ID:     ${courseId}\n`);

  // 1. Find user in Moodle
  console.log('1. Locating learner in Moodle database...');
  const userSql = `SELECT id, username, email, firstname, lastname FROM mdl_user WHERE LOWER(email) = '${targetEmail}' AND deleted = 0 LIMIT 1;`;
  const { stdout: userOut } = await execAsync(`docker exec learnforge-moodle-mariadb mariadb -u moodle -pmoodle_secure_pass123 moodle -e "${userSql}"`);
  
  const lines = userOut.trim().split('\n');
  if (lines.length < 2) {
    console.error(`✗ Learner with email "${targetEmail}" was not found in Moodle!`);
    console.error(`  Please register first at http://localhost:8080/login/signup.php`);
    process.exit(1);
  }

  const [id, username, email, firstname, lastname] = lines[1].split('\t');
  console.log(`   ✓ Found Moodle user: [ID: ${id}] ${username} (${firstname} ${lastname})`);

  // 2. Mark course completion in Moodle
  console.log('\n2. Recording course completion in Moodle...');
  const compSql = `INSERT INTO mdl_course_completions (userid, course, timeenrolled, timestarted, timecompleted, reaggregate) VALUES (${id}, ${courseId}, UNIX_TIMESTAMP(), UNIX_TIMESTAMP(), UNIX_TIMESTAMP(), 0) ON DUPLICATE KEY UPDATE timecompleted = UNIX_TIMESTAMP();`;
  await execAsync(`docker exec learnforge-moodle-mariadb mariadb -u moodle -pmoodle_secure_pass123 moodle -e "${compSql}"`);
  console.log(`   ✓ Course ID ${courseId} marked as COMPLETED for user ID ${id}`);

  // 3. Trigger LearnForge continuous sync
  console.log('\n3. Executing LearnForge Continuous Sync Engine...');
  const syncResult = await moodleContinuousSyncService.syncNow({ force: true });
  console.log(`   ✓ Sync status: ${syncResult.status}`);
  console.log(`   ✓ Synced certificates: ${syncResult.syncedCount}`);

  // 4. Query resulting external certificate in LearnForge
  console.log('\n4. Verifying certificate record in LearnForge PostgreSQL...');
  const certRes = await query(
    `SELECT ec.credential_id, ec.course_name, ec.verification_status, u.name, u.email
     FROM external_certificates ec
     JOIN users u ON ec.user_id = u.id
     WHERE LOWER(u.email) = $1 AND ec.provider = 'MOODLE'
     ORDER BY ec.created_at DESC LIMIT 1`,
    [targetEmail]
  );

  if (certRes.rows.length > 0) {
    const cert = certRes.rows[0];
    console.log(`   ✓ Found verified certificate in LearnForge!`);
    console.log(`     • Credential ID:       ${cert.credential_id}`);
    console.log(`     • Course:              ${cert.course_name}`);
    console.log(`     • Learner:             ${cert.name} (${cert.email})`);
    console.log(`     • Status:              ${cert.verification_status}`);
    console.log(`\nDirect Access Links:`);
    console.log(`  - LearnForge Verification: http://localhost:5173/verify/${cert.credential_id}`);
    console.log(`  - Moodle LMS Verification: http://localhost:8080/mod/customcert/verify_certificate.php?code=${cert.credential_id}`);
  } else {
    console.log(`   ℹ Certificate synced but pending matching user in LearnForge.`);
  }

  console.log('\n====================================================');
  console.log('   All steps completed successfully!               ');
  console.log('====================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
