/**
 * Create a new course in Moodle LMS programmatically
 * Usage: node backend/scripts/create_moodle_course.js "Course Full Name" "SHORTNAME-101"
 */

import 'dotenv/config';

async function createCourse() {
  const fullname = process.argv[2] || 'Full Stack Web Development with React & Node';
  const shortname = process.argv[3] || `FSWD-${Date.now().toString().slice(-4)}`;
  const categoryid = 1;

  console.log('====================================================');
  console.log('            Moodle LMS Course Creator               ');
  console.log('====================================================');
  console.log(`Course Title:      ${fullname}`);
  console.log(`Short Name (Code): ${shortname}`);
  console.log(`Category ID:       ${categoryid}\n`);

  const token = process.env.MOODLE_TOKEN || '98fbc12a3d4e5f678901234567890abc';
  const baseUrl = process.env.MOODLE_URL || 'http://localhost:8080';

  const params = new URLSearchParams();
  params.append('wstoken', token);
  params.append('wsfunction', 'core_course_create_courses');
  params.append('moodlewsrestformat', 'json');
  params.append('courses[0][fullname]', fullname);
  params.append('courses[0][shortname]', shortname);
  params.append('courses[0][categoryid]', String(categoryid));
  params.append('courses[0][enablecompletion]', '1');

  try {
    const res = await fetch(`${baseUrl}/webservice/rest/server.php`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].id) {
      const course = data[0];
      console.log('✓ Course created successfully in Moodle!');
      console.log(`  • Course ID:         ${course.id}`);
      console.log(`  • Short Name:        ${course.shortname}`);
      console.log(`  • Direct Course URL: ${baseUrl}/course/view.php?id=${course.id}`);
      console.log(`  • Course Edit URL:   ${baseUrl}/course/edit.php?id=${course.id}`);
    } else {
      console.error('✗ Failed to create course:', data);
    }
  } catch (err) {
    console.error('✗ Error connecting to Moodle API:', err.message);
  }

  console.log('\n====================================================\n');
}

createCourse();
