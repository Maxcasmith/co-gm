/**
 * Abstract base class for all LLM provider adapters.
 * To add a new provider: extend this class, implement all methods,
 * set static providerId and label, then register via registry.registerProvider().
 */
export class LLMProvider {
  /** @type {string} Unique provider identifier used as a settings key */
  static providerId = null;

  /** @type {string} Display name shown in the settings UI */
  static label = null;

  /**
   * @returns {{ id: string, label: string }[]} Default models for this provider
   */
  static getDefaultModels() {
    return [];
  }

  /**
   * Send a prompt to the LLM and return the text response.
   *
   * @param {string} prompt
   * @param {{ systemPrompt?: string, temperature?: number, maxTokens?: number }} [options]
   * @returns {Promise<{ content: string, usage: { input: number, output: number } }>}
   */
  async complete(prompt, options = {}) {
    throw new Error(`${this.constructor.name} must implement complete()`);
  }

  /**
   * Validate an API key with a minimal request.
   *
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validateKey(apiKey) {
    throw new Error(`${this.constructor.name} must implement validateKey()`);
  }

  /**
   * Drop-in replacement for `fetch()` with an AbortController timeout.
   * All provider subclasses should call this instead of raw `fetch()`.
   *
   * @param {string} url
   * @param {RequestInit} options
   * @param {number} [timeoutMs=60000]
   * @returns {Promise<Response>}
   */
  static async _fetch(url, options, timeoutMs = 60000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
