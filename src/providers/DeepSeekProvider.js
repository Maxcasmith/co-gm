import { LLMProvider } from './LLMProvider.js';
import { MODULE_ID, SETTINGS } from '../constants.js';

const API_BASE = 'https://api.deepseek.com/v1';

export class DeepSeekProvider extends LLMProvider {
  static providerId = 'deepseek';
  static label = 'DeepSeek';

  static getDefaultModels() {
    return [
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ];
  }

  async complete(prompt, options = {}) {
    const apiKey = game.settings.get(MODULE_ID, `${SETTINGS.API_KEY_PREFIX}.deepseek`);
    const model = game.settings.get(MODULE_ID, SETTINGS.MODEL);

    const messages = options.messages ? [...options.messages] : [{ role: 'user', content: prompt }];
    if (options.systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const response = await LLMProvider._fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.8,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens },
    };
  }

  async validateKey(apiKey) {
    const response = await LLMProvider._fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 10000);
    return response.ok;
  }
}
