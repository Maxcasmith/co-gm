import { MODULE_ID, SETTINGS } from '../constants.js';
import { ClaudeProvider } from './ClaudeProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { RateLimiter } from '../utils/RateLimiter.js';

const _registry    = new Map();
// Single module-level rate limiter shared across all LLM calls.
// 300ms minimum gap prevents thundering-herd during combat with many NPC turns.
const _rateLimiter = new RateLimiter(300);

/**
 * Register a provider adapter. Call this before registerSettings() runs.
 * @param {typeof import('./LLMProvider.js').LLMProvider} ProviderClass
 */
export function registerProvider(ProviderClass) {
  if (!ProviderClass.providerId) {
    throw new Error(`Provider ${ProviderClass.name} must define a static providerId.`);
  }
  _registry.set(ProviderClass.providerId, ProviderClass);
}

/**
 * @param {string} providerId
 * @returns {typeof import('./LLMProvider.js').LLMProvider | null}
 */
export function getProvider(providerId) {
  return _registry.get(providerId) ?? null;
}

/**
 * Returns a fresh instance of the currently selected provider, with its
 * `complete()` method wrapped in the module-level rate limiter.
 * @returns {import('./LLMProvider.js').LLMProvider | null}
 */
export function getActiveProvider() {
  const providerId   = game.settings.get(MODULE_ID, SETTINGS.PROVIDER);
  const ProviderClass = _registry.get(providerId);
  if (!ProviderClass) return null;

  const instance  = new ProviderClass();
  const _original = instance.complete.bind(instance);
  instance.complete = (prompt, opts) => _rateLimiter.schedule(() => _original(prompt, opts));
  return instance;
}

/**
 * @returns {(typeof import('./LLMProvider.js').LLMProvider)[]}
 */
export function getAllProviders() {
  return Array.from(_registry.values());
}

export function initBuiltInProviders() {
  registerProvider(ClaudeProvider);
  registerProvider(OpenAIProvider);
  registerProvider(DeepSeekProvider);
}
