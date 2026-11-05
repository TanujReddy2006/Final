import crypto from 'node:crypto';

export function normalizeLesson(lesson) {
  return {
    id: lesson.id || crypto.randomUUID(),
    title: String(lesson.title || '').trim(),
    description: String(lesson.description || '').trim(),
    content: String(lesson.content || '').trim(),
    type: lesson.type || 'READING',
    duration: lesson.duration || '30 min',
    videoUrl: lesson.videoUrl || '',
    resourceUrl: lesson.resourceUrl || ''
  };
}

export function normalizeModule(module) {
  return {
    id: module.id || crypto.randomUUID(),
    title: String(module.title || '').trim(),
    description: String(module.description || '').trim(),
    duration: module.duration || '30 min',
    learningObjectives: module.learningObjectives || [],
    lessons: (module.lessons || []).map(normalizeLesson),
    assessmentId: module.assessmentId || null
  };
}

export function validateCourseForPublish(course, assessments = []) {
  const errors = [];

  if (!course.title) errors.push('Course title is required');
  if (!course.description) errors.push('Course description is required');
  if (!course.category) errors.push('Course category is required');
  if (!course.difficulty) errors.push('Course difficulty is required');
  if (!course.modules?.length) errors.push('At least one module is required');

  course.modules?.forEach((module, moduleIndex) => {
    if (!module.title) errors.push(`Module ${moduleIndex + 1} has no title`);
    if (!module.lessons?.length) errors.push(`Module ${moduleIndex + 1} has no lessons`);
    module.lessons?.forEach((lesson, lessonIndex) => {
      // Accept lesson if content, description, videoUrl or title is provided
      if (!lesson.content && !lesson.description && !lesson.videoUrl && !lesson.title) {
        errors.push(`Module ${moduleIndex + 1}, lesson ${lessonIndex + 1} has no content`);
      }
    });
  });

  // Find final assessment by ID, courseId, or first available assessment for this course
  const finalAssessment =
    assessments.find(a => a.id === course.assessmentId || a.courseId === course.id) ||
    assessments[0];

  if (!finalAssessment) {
    errors.push('Final assessment is required before publishing');
  } else {
    if (!finalAssessment.questions?.length) {
      errors.push('Final assessment must have at least one question');
    } else {
      finalAssessment.questions.forEach((question, questionIndex) => {
        if (!question.text && !question.title) {
          errors.push(`Question ${questionIndex + 1} is missing question text`);
        }
        if (!question.options?.length) {
          errors.push(`Question ${questionIndex + 1} has no options`);
        } else if (!question.options.some(option => option.correct)) {
          errors.push(`Question ${questionIndex + 1} has no correct answer selected`);
        }
      });
    }
  }

  return errors;
}
