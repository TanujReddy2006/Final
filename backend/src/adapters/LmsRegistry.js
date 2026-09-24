/**
 * LMS Registry & Manager
 * 
 * Central registry implementing the Registry & Strategy pattern.
 * Enables the backend to interact with ANY LMS through standard BaseLmsAdapter
 * without tightly coupling to any specific provider.
 */

import { InfosysSpringboardAdapter } from './providers/InfosysSpringboardAdapter.js';

class LmsRegistry {
  constructor() {
    this.adapters = new Map();
    this._initializeDefaultAdapters();
  }

  /**
   * Register default active adapters
   */
  _initializeDefaultAdapters() {
    // Register Infosys Springboard adapter
    const infosysAdapter = new InfosysSpringboardAdapter();
    this.registerAdapter(infosysAdapter.getProviderId(), infosysAdapter);
  }

  /**
   * Register a new LMS adapter instance
   * @param {string} providerId - Unique key (e.g. 'INFOSYS_SPRINGBOARD')
   * @param {BaseLmsAdapter} adapterInstance - Subclass instance of BaseLmsAdapter
   */
  registerAdapter(providerId, adapterInstance) {
    if (!providerId || !adapterInstance) {
      throw new Error('providerId and adapterInstance are required to register an LMS adapter');
    }
    const key = String(providerId).toUpperCase();
    this.adapters.set(key, adapterInstance);
    // Also support lowercase/slug aliases
    this.adapters.set(String(providerId).toLowerCase(), adapterInstance);
  }

  /**
   * Retrieve an adapter by its provider key
   * @param {string} providerId - e.g. 'INFOSYS_SPRINGBOARD' or 'infosys'
   * @returns {BaseLmsAdapter}
   */
  getAdapter(providerId = 'INFOSYS_SPRINGBOARD') {
    if (!providerId) return null;
    const key = String(providerId).toUpperCase();
    return this.adapters.get(key) || this.adapters.get(String(providerId).toLowerCase()) || null;
  }

  /**
   * Return a list of all currently registered LMS providers
   * @returns {Array<{ providerId: string, providerName: string, enabled: boolean }>}
   */
  getRegisteredProviders() {
    const unique = new Map();
    for (const adapter of this.adapters.values()) {
      if (!unique.has(adapter.getProviderId())) {
        unique.set(adapter.getProviderId(), {
          providerId: adapter.getProviderId(),
          providerName: adapter.getProviderName(),
          enabled: adapter.enabled
        });
      }
    }
    return Array.from(unique.values());
  }

  /**
   * Aggregate courses across all registered LMS adapters
   * @param {Object} filters - Search and filtering parameters
   * @returns {Promise<Array<StandardCourse>>}
   */
  async getAllCourses(filters = {}) {
    const allCourses = [];
    const unique = new Set();

    for (const adapter of this.adapters.values()) {
      if (unique.has(adapter.getProviderId())) continue;
      unique.add(adapter.getProviderId());

      if (adapter.enabled) {
        try {
          const courses = await adapter.getCourses(filters);
          allCourses.push(...courses);
        } catch (err) {
          console.warn(`Error querying courses from ${adapter.getProviderId()}: ${err.message}`);
        }
      }
    }
    return allCourses;
  }

  /**
   * Find a course by ID across registered LMS adapters
   */
  async getCourseById(courseId, preferredProvider = null) {
    if (preferredProvider) {
      const adapter = this.getAdapter(preferredProvider);
      if (adapter) {
        return adapter.getCourseDetails(courseId);
      }
    }

    for (const adapter of this.adapters.values()) {
      try {
        const detail = await adapter.getCourseDetails(courseId);
        if (detail && detail.id === courseId) {
          return detail;
        }
      } catch {
        // continue search
      }
    }
    return null;
  }

  /**
   * Ingest a webhook or ONEST sync event for any registered provider
   */
  async handleInboundSync(providerId, type, payload) {
    const adapter = this.getAdapter(providerId);
    if (!adapter) {
      throw new Error(`No registered LMS adapter for provider: ${providerId}`);
    }

    if (type === 'CERTIFICATE') {
      return adapter.syncCertificate(payload);
    }
    return adapter.syncProgress(payload);
  }

  /**
   * Run health checks on all registered adapters
   */
  async runHealthChecks() {
    const results = [];
    const visited = new Set();

    for (const adapter of this.adapters.values()) {
      if (visited.has(adapter.getProviderId())) continue;
      visited.add(adapter.getProviderId());

      try {
        const check = await adapter.healthCheck();
        results.push(check);
      } catch (err) {
        results.push({
          status: 'DOWN',
          provider: adapter.getProviderId(),
          error: err.message
        });
      }
    }
    return results;
  }
}

export const lmsRegistry = new LmsRegistry();
