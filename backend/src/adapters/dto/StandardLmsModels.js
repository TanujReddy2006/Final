/**
 * Standard LMS Canonical Data Models (DTOs)
 * 
 * Provides unified, normalized response structures for all LMS platforms
 * adhering to ONEST (Open Network for Education & Skilling Transformations)
 * and Beckn Protocol specifications.
 */

/**
 * Standard Normalized Course
 */
export function createStandardCourse({
  id,
  externalId,
  provider,
  title,
  description,
  detailedDescription = '',
  category = 'Professional Skills',
  difficulty = 'INTERMEDIATE',
  duration = '40 hours',
  thumbnail = '',
  skills = [],
  nsqfLevel = 'Level 6',
  sfiaLevel = 'Level 3 - Apply',
  modulesCount = 0,
  instructor = '',
  status = 'PUBLISHED',
  portalUrl = '',
  rawData = null
}) {
  return {
    id: id || externalId,
    externalId: externalId || id,
    provider: provider || 'UNKNOWN_LMS',
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    detailedDescription: String(detailedDescription || description || '').trim(),
    category,
    difficulty,
    duration,
    thumbnail,
    skills: Array.isArray(skills) ? skills : [],
    nsqfLevel,
    sfiaLevel,
    modulesCount: Number(modulesCount || 0),
    instructor,
    status,
    portalUrl,
    // ONEST / Beckn descriptor compatibility
    onestDescriptor: {
      name: title,
      short_desc: description,
      long_desc: detailedDescription || description,
      images: thumbnail ? [{ url: thumbnail }] : []
    },
    onestTags: [
      {
        display: true,
        descriptor: { code: 'competency_framework' },
        list: [
          { descriptor: { code: 'nsqf_level' }, value: nsqfLevel },
          { descriptor: { code: 'sfia_level' }, value: sfiaLevel }
        ]
      },
      {
        display: true,
        descriptor: { code: 'skills' },
        list: (Array.isArray(skills) ? skills : []).map(skill => ({
          descriptor: { code: 'skill' },
          value: skill
        }))
      }
    ],
    metadata: {
      syncedAt: new Date().toISOString(),
      rawData: rawData || undefined
    }
  };
}

/**
 * Standard Course Detail with Modules and Lessons
 */
export function createStandardCourseDetail({
  course,
  modules = [],
  prerequisites = '',
  learningObjectives = [],
  assessment = null
}) {
  return {
    ...course,
    prerequisites: prerequisites || 'None',
    learningObjectives: Array.isArray(learningObjectives) ? learningObjectives : [],
    modules: modules.map((mod, index) => ({
      id: mod.id || `mod-${index + 1}`,
      title: mod.title || `Module ${index + 1}`,
      description: mod.description || '',
      duration: mod.duration || '2 hours',
      order: index + 1,
      lessons: (mod.lessons || []).map((les, lesIdx) => ({
        id: les.id || `les-${index + 1}-${lesIdx + 1}`,
        title: les.title || `Lesson ${lesIdx + 1}`,
        type: les.type || 'VIDEO',
        duration: les.duration || '15 min',
        videoUrl: les.videoUrl || null,
        resourceUrl: les.resourceUrl || null,
        content: les.content || ''
      }))
    })),
    assessment: assessment
      ? {
          id: assessment.id,
          title: assessment.title,
          passingScore: Number(assessment.passingScore || 70),
          maxAttempts: Number(assessment.maxAttempts || 3),
          totalQuestions: assessment.questions?.length || 0
        }
      : null
  };
}

/**
 * Standard Enrollment
 */
export function createStandardEnrollment({
  id,
  learnerId,
  learnerEmail,
  courseId,
  courseTitle,
  provider,
  progress = 0,
  status = 'IN_PROGRESS',
  enrolledAt = new Date().toISOString(),
  lastAccessed = new Date().toISOString()
}) {
  return {
    id,
    learnerId,
    learnerEmail,
    courseId,
    courseTitle,
    provider,
    progress: Number(progress || 0),
    status, // 'ENROLLED', 'IN_PROGRESS', 'COMPLETED'
    enrolledAt,
    lastAccessed
  };
}

/**
 * Standard Learner Progress
 */
export function createStandardProgress({
  learnerId,
  learnerEmail,
  courseId,
  courseTitle,
  provider,
  progressPercentage = 0,
  completedModules = 0,
  totalModules = 0,
  completedLessons = 0,
  totalLessons = 0,
  status = 'IN_PROGRESS',
  lastActivity = new Date().toISOString()
}) {
  const percentage = Math.min(100, Math.max(0, Number(progressPercentage || 0)));
  const isCompleted = percentage >= 100 || status === 'COMPLETED';

  return {
    learnerId,
    learnerEmail,
    courseId,
    courseTitle,
    provider,
    progressPercentage: percentage,
    completedModules: Number(completedModules || 0),
    totalModules: Number(totalModules || 0),
    completedLessons: Number(completedLessons || 0),
    totalLessons: Number(totalLessons || 0),
    status: isCompleted ? 'COMPLETED' : status,
    isCompleted,
    lastActivity,
    lastSyncedAt: new Date().toISOString(),
    // ONEST / Beckn fulfillments schema
    onestFulfillment: {
      state: {
        descriptor: {
          code: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
          name: `Progress ${percentage}%`
        }
      },
      tags: [
        {
          display: true,
          descriptor: { code: 'progress' },
          list: [
            { descriptor: { code: 'percentage' }, value: String(percentage) },
            { descriptor: { code: 'completed_modules' }, value: String(completedModules) },
            { descriptor: { code: 'total_modules' }, value: String(totalModules) }
          ]
        }
      ]
    }
  };
}

/**
 * Standard Assessment Result
 */
export function createStandardAssessmentResult({
  assessmentId,
  learnerId,
  courseId,
  provider,
  score = 0,
  passingScore = 70,
  passed = false,
  attemptNumber = 1,
  maxAttempts = 3,
  completedAt = new Date().toISOString()
}) {
  const calculatedPassed = score >= passingScore;
  return {
    assessmentId,
    learnerId,
    courseId,
    provider,
    score: Number(score || 0),
    passingScore: Number(passingScore || 70),
    passed: Boolean(passed || calculatedPassed),
    attemptNumber: Number(attemptNumber || 1),
    maxAttempts: Number(maxAttempts || 3),
    attemptsRemaining: Math.max(0, Number(maxAttempts || 3) - Number(attemptNumber || 1)),
    completedAt
  };
}

/**
 * Standard Verifiable Certificate (W3C / ONEST Compliant)
 */
export function createStandardCertificate({
  certificateId,
  certificateNumber,
  learnerId,
  learnerName,
  learnerEmail = '',
  courseId,
  courseName,
  issuedBy,
  score = 100,
  issuedDate = new Date().toISOString(),
  verificationUrl = '',
  pdfUrl = '',
  status = 'VALID',
  skills = [],
  nsqfLevel = 'Level 6',
  sfiaLevel = 'Level 3 - Apply',
  metadata = {}
}) {
  return {
    certificateId: String(certificateId || '').toUpperCase(),
    certificateNumber: String(certificateNumber || certificateId || '').toUpperCase(),
    learnerId,
    learnerName,
    learnerEmail,
    courseId,
    courseName,
    issuedBy,
    score: Number(score || 0),
    issuedDate,
    verificationUrl,
    pdfUrl,
    status, // 'VALID', 'REVOKED'
    skills: Array.isArray(skills) ? skills : [],
    nsqfLevel,
    sfiaLevel,
    isExternal: true,
    // W3C Verifiable Credential compatible structure
    verifiableCredential: {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://onest.network/credentials/v1'
      ],
      id: `urn:onest:cert:${certificateId}`,
      type: ['VerifiableCredential', 'CorporateCertification'],
      issuer: {
        id: `urn:onest:org:${encodeURIComponent(issuedBy)}`,
        name: issuedBy
      },
      issuanceDate: issuedDate,
      credentialSubject: {
        id: `urn:onest:learner:${learnerId}`,
        name: learnerName,
        email: learnerEmail,
        courseName,
        score,
        competencies: skills,
        nsqfLevel,
        sfiaLevel
      }
    },
    metadata
  };
}

/**
 * Standard Learner Profile (Identified by Email)
 */
export function createStandardLearnerProfile({
  email,
  name,
  provider,
  externalUserId = '',
  status = 'ACTIVE',
  enrolledCourses = [],
  completedCoursesCount = 0,
  certificates = [],
  skills = [],
  nsqfCompetencies = [],
  metadata = {}
}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const userId = externalUserId || `lms-${cleanEmail.split('@')[0]}`;
  const courses = Array.isArray(enrolledCourses) ? enrolledCourses : [];
  return {
    email: cleanEmail,
    name: String(name || '').trim(),
    provider: provider || 'UNKNOWN_LMS',
    externalUserId: userId,
    learnerId: userId,
    status,
    enrolledCourses: courses,
    enrollments: courses,
    totalEnrolled: courses.length,
    completedCoursesCount: Number(completedCoursesCount || 0),
    certificates: Array.isArray(certificates) ? certificates : [],
    skills: Array.isArray(skills) && skills.length > 0 
      ? skills 
      : ['Cloud Architecture', 'DevOps & CI/CD', 'Software Engineering'],
    nsqfCompetencies: Array.isArray(nsqfCompetencies) && nsqfCompetencies.length > 0
      ? nsqfCompetencies
      : ['NSQF Level 6 Competency in Cloud & Systems Architecture'],
    metadata: {
      syncedAt: new Date().toISOString(),
      ...metadata
    }
  };
}
