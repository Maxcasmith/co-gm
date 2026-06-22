import { getActiveProvider } from '../providers/registry.js';
import { ContextBuilder } from './ContextBuilder.js';

export class DMBrain {
  constructor() {
    /** @type {{ role: 'user' | 'assistant', content: string }[]} */
    this.history = [];
    this._systemPrompt = null;
  }

  async _ensureSystemPrompt() {
    if (!this._systemPrompt) {
      this._systemPrompt = await ContextBuilder.buildSystemPrompt();
    }
  }

  async refreshSystemPrompt() {
    this._systemPrompt = await ContextBuilder.buildSystemPrompt();
  }

  /**
   * Send a message and get a response, maintaining conversation history.
   *
   * @param {string} userMessage
   * @param {{ systemPromptOverride?: string }} [options]
   * @returns {Promise<string>}
   */
  async chat(userMessage, options = {}) {
    await this._ensureSystemPrompt();
    const provider = getActiveProvider();
    if (!provider) throw new Error('No LLM provider configured. Open AI DM Settings first.');

    this.history.push({ role: 'user', content: userMessage });

    const { content } = await provider.complete(null, {
      systemPrompt: options.systemPromptOverride ?? this._systemPrompt,
      messages: [...this.history],
      maxTokens: 2048,
      temperature: 0.85,
    });

    this.history.push({ role: 'assistant', content });
    return content;
  }

  /**
   * One-shot prompt that does not touch conversation history.
   * Used for structured tasks like note-taking.
   *
   * @param {string} prompt
   * @param {string} systemPrompt
   * @returns {Promise<string>}
   */
  async oneShot(prompt, systemPrompt) {
    const provider = getActiveProvider();
    if (!provider) throw new Error('No LLM provider configured. Open AI DM Settings first.');
    const { content } = await provider.complete(prompt, { systemPrompt, maxTokens: 2048 });
    return content;
  }

  clearHistory() {
    this.history = [];
    this._systemPrompt = null;
  }
}
