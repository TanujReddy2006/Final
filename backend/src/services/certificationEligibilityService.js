export class CertificationEligibilityService {
  evaluate({ course, enrollment, assessmentPassed }) {
    const modules = (course.modules || []).map(module => ({
      requirement: `Complete ${module.title}`,
      complete: Boolean(enrollment?.completedModuleIds?.includes(module.id))
    }));

    const completedRequirements = modules
      .filter(item => item.complete)
      .map(item => item.requirement);

    const pendingRequirements = modules
      .filter(item => !item.complete)
      .map(item => item.requirement);

    if (!assessmentPassed) {
      pendingRequirements.push('Pass the final assessment with 70% or higher');
    } else {
      completedRequirements.push('Pass the final assessment with 70% or higher');
    }

    return {
      eligible: pendingRequirements.length === 0,
      completedRequirements,
      pendingRequirements
    };
  }
}
