/**
 * Base LMS Adapter (Interface & Abstract Base Class)
 * 
 * Defines the standard contract and fixed set of functionalities that
 * EVERY LMS platform (Infosys Springboard, Sunbird, etc.) must implement.
 * 
 * All derived adapter classes MUST return standard DTOs from StandardLmsModels.js.
 */
export class BaseLmsAdapter {
  /**
   * @param {Object} config - LMS connection configuration (URL, keys, timeouts)
   */
  constructor(config = {}) {
    if (new.target === BaseLmsAdapter) {
      throw new TypeError('Cannot construct BaseLmsAdapter directly; instantiate a subclass instead.');
    }
    this.config = config;
    this.providerId = config.providerId || 'BASE_LMS';
    this.providerName = config.providerName || 'Base LMS Platform';
    this.enabled = config.enabled ?? true;
  }

  /**
   * Unique identifier for this LMS (e.g. 'INFOSYS_SPRINGBOARD')
   */
  getProviderId() {
    return this.providerId;
  }

  /**
   * Human-readable display name (e.g. 'Infosys Springboard')
   */
  getProviderName() {
    return this.providerName;
  }

  /**
   * Fetch courses matching optional search and filter criteria
   * @param {Object} filters - { search, category, difficulty, limit, offset }
   * @returns {Promise<Array<StandardCourse>>}
   */
  async getCourses(filters = {}) {
    throw new Error(`getCourses() not implemented by ${this.constructor.name}`);
  }

  /**
   * Fetch detailed course information including modules and lessons
   * @param {string} courseId - ID of the course in this LMS
   * @returns {Promise<StandardCourseDetail>}
   */
  async getCourseDetails(courseId) {
    throw new Error(`getCourseDetails() not implemented by ${this.constructor.name}`);
  }

  /**
   * Fetch complete learner profile, enrollments, and status based on email address
   * @param {string} email - Learner's email address
   * @returns {Promise<StandardLearnerProfile>}
   */
  async getLearnerDetails(email) {
    throw new Error(`getLearnerDetails() not implemented by ${this.constructor.name}`);
  }

  /**
   * Fetch all courses in which a learner is enrolled
   * @param {string} learnerId - Internal or external learner identifier
   * @param {string} [email] - Learner's email address
   * @returns {Promise<Array<StandardEnrollment>>}
   */
  async getLearnerEnrollments(learnerId, email) {
    throw new Error(`getLearnerEnrollments() not implemented by ${this.constructor.name}`);
  }

  /**
   * Fetch real-time progress for a learner in a specific course
   * @param {string} learnerId - Learner identifier
   * @param {string} courseId - Course identifier
   * @returns {Promise<StandardProgress>}
   */
  async getLearnerProgress(learnerId, courseId) {
    throw new Error(`getLearnerProgress() not implemented by ${this.constructor.name}`);
  }

  /**
   * Fetch completion status of a course for a learner
   * @param {string} learnerId - Learner identifier
   * @param {string} courseId - Course identifier
   * @returns {Promise<{ isCompleted: boolean, completionDate: string|null, score: number|null }>}
   */
  async getCompletionStatus(learnerId, courseId) {
    const progress = await this.getLearnerProgress(learnerId, courseId);
    return {
      isCompleted: progress.isCompleted,
      progressPercentage: progress.progressPercentage,
      status: progress.status,
      lastActivity: progress.lastActivity
    };
  }

  /**
   * Fetch assessment evaluation results and scores where supported
   * @param {string} learnerId - Learner identifier
   * @param {string} courseId - Course identifier
   * @returns {Promise<StandardAssessmentResult|null>}
   */
  async getAssessmentResults(learnerId, courseId) {
    throw new Error(`getAssessmentResults() not implemented by ${this.constructor.name}`);
  }

  /**
   * Fetch certificates issued to a learner for a course or across all courses
   * @param {string} learnerId - Learner identifier
   * @param {string} [courseId] - Optional course identifier filter
   * @returns {Promise<Array<StandardCertificate>>}
   */
  async getCertificates(learnerId, courseId = null) {
    throw new Error(`getCertificates() not implemented by ${this.constructor.name}`);
  }

  /**
   * Ingest and process an inbound progress update (Webhook or ONEST on_status)
   * @param {Object} payload - Inbound payload from this LMS
   * @returns {Promise<StandardProgress>}
   */
  async syncProgress(payload) {
    throw new Error(`syncProgress() not implemented by ${this.constructor.name}`);
  }

  /**
   * Ingest and process an inbound certificate issuance (Webhook or ONEST on_status)
   * @param {Object} payload - Inbound certificate payload from this LMS
   * @returns {Promise<StandardCertificate>}
   */
  async syncCertificate(payload) {
    throw new Error(`syncCertificate() not implemented by ${this.constructor.name}`);
  }

  /**
   * Health check and configuration verification
   * @returns {Promise<{ status: 'UP'|'DEGRADED'|'DOWN', provider: string, message: string }>}
   */
  async healthCheck() {
    return {
      status: 'UP',
      provider: this.providerId,
      message: `${this.providerName} adapter is registered and operational`
    };
  }
}
