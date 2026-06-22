import { LLMProvider } from './LLMProvider.js';
import { MODULE_ID, SETTINGS } from '../constants.js';

const API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

export class ClaudeProvider extends LLMProvider {
  static providerId = 'claude';
  static label = 'Claude (Anthropic)';

  static getDefaultModels() {
    return [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ];
  }

  async complete(prompt, options = {}) {
    const apiKey = game.settings.get(MODULE_ID, `${SETTINGS.API_KEY_PREFIX}.claude`);
    const model = game.settings.get(MODULE_ID, SETTINGS.MODEL);

    const messages = options.messages ?? [{ role: 'user', content: prompt }];

    const body = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.8,
      messages,
    };
    if (options.systemPrompt) body.system = options.systemPrompt;

    const response = await LLMProvider._fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: { input: data.usage.input_tokens, output: data.usage.output_tokens },
    };
  }

  async validateKey(apiKey) {
    const response = await LLMProvider._fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    }, 10000);
    // 200 = valid key, 400 = bad request but key was recognised
    return response.ok || response.status === 400;
  }
}
