<?php
define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/webservice/lib.php');

global $DB, $CFG;

echo "=== Moodle Web Services & Token Configuration ===" . PHP_EOL;

// 1. Ensure external service exists
$shortname = 'learnforge_service';
$service = $DB->get_record('external_services', ['shortname' => $shortname]);

if (!$service) {
    $service = new stdClass();
    $service->name = 'LearnForge Integration Service';
    $service->shortname = $shortname;
    $service->enabled = 1;
    $service->restrictedusers = 0;
    $service->downloadfiles = 1;
    $service->uploadfiles = 1;
    $service->timecreated = time();
    $service->timemodified = time();
    $service->id = $DB->insert_record('external_services', $service);
    echo "Created external service: {$service->name} (id: {$service->id})" . PHP_EOL;
} else {
    echo "Found external service: {$service->name} (id: {$service->id})" . PHP_EOL;
}

// 2. Add required functions
$functions = [
    'core_webservice_get_site_info',
    'core_course_get_courses',
    'core_user_get_users_by_field',
    'core_enrol_get_users_courses',
    'core_completion_get_course_completion_status',
    'gradereport_user_get_grade_items'
];

foreach ($functions as $fname) {
    $exists = $DB->get_record('external_services_functions', [
        'externalserviceid' => $service->id,
        'functionname' => $fname
    ]);
    if (!$exists) {
        $frec = new stdClass();
        $frec->externalserviceid = $service->id;
        $frec->functionname = $fname;
        $DB->insert_record('external_services_functions', $frec);
        echo "  + Added function: {$fname}" . PHP_EOL;
    } else {
        echo "  ✓ Function already present: {$fname}" . PHP_EOL;
    }
}

// 3. Find admin user (id = 2 usually)
$admin = $DB->get_record('user', ['username' => 'admin']);
if (!$admin) {
    echo "Admin user not found!" . PHP_EOL;
    exit(1);
}

// 4. Create or update permanent token for admin
$fixedToken = '98fbc12a3d4e5f678901234567890abc';
$tokenRecord = $DB->get_record('external_tokens', [
    'externalserviceid' => $service->id,
    'userid' => $admin->id
]);

if (!$tokenRecord) {
    $tokenRecord = new stdClass();
    $tokenRecord->token = $fixedToken;
    $tokenRecord->tokentype = 0; // External service token
    $tokenRecord->userid = $admin->id;
    $tokenRecord->externalserviceid = $service->id;
    $tokenRecord->contextid = 1;
    $tokenRecord->creatorid = $admin->id;
    $tokenRecord->timecreated = time();
    $tokenRecord->lastaccess = time();
    $DB->insert_record('external_tokens', $tokenRecord);
    echo "Created permanent token for admin: {$fixedToken}" . PHP_EOL;
} else {
    $tokenRecord->token = $fixedToken;
    $tokenRecord->timemodified = time();
    $DB->update_record('external_tokens', $tokenRecord);
    echo "Updated token for admin: {$fixedToken}" . PHP_EOL;
}

// 5. Create demo course if needed
$courseShortname = 'K8S-ARCH-101';
$course = $DB->get_record('course', ['shortname' => $courseShortname]);
if (!$course) {
    $course = new stdClass();
    $course->category = 1;
    $course->fullname = 'Enterprise Cloud Architecture with Kubernetes';
    $course->shortname = $courseShortname;
    $course->summary = 'Master enterprise-scale cloud deployments, container orchestration, microservices, and Istio service mesh.';
    $course->summaryformat = 1;
    $course->format = 'topics';
    $course->showgrades = 1;
    $course->enablecompletion = 1;
    $course->timecreated = time();
    $course->timemodified = time();
    $course->visible = 1;
    $courseId = $DB->insert_record('course', $course);
    echo "Created demo course: {$course->fullname} (id: {$courseId})" . PHP_EOL;
} else {
    echo "Demo course already exists: {$course->fullname} (id: {$course->id})" . PHP_EOL;
}

echo "=== Moodle Setup Complete! ===" . PHP_EOL;
