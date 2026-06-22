import { MODULE_ID } from '../constants.js';
import { VaultManager } from '../vault/VaultManager.js';
import { ContextBuilder } from './ContextBuilder.js';
import { buildNoteTakingPrompt } from '../prompts/sessionPrompts.js';

const SCRIBE_DIRECTIVE = `You are a meticulous campaign scribe. Extract structured notes from the provided DM session exchange and return ONLY valid JSON as specified. No commentary, no markdown fences.`;

export class NoteTaker {
  /**
   * Summarise the brain's current conversation history and write to the vault.
   *
   * @param {import('./DMBrain.js').DMBrain} brain
   * @returns {Promise<{ sessionLog: string, plotUpdates: object[], npcUpdates: object[], newFacts: string[] } | null>}
   */
  static async takeNotes(brain) {
    if (!brain.history.length) return null;

    const conversationText = brain.history
      .map(m => `${m.role === 'user' ? 'GM' : 'DM'}: ${m.content}`)
      .join('\n\n');

    const basePrompt = await ContextBuilder.buildSystemPrompt();
    const systemPrompt = `${basePrompt}\n\n${SCRIBE_DIRECTIVE}`;
    const response = await brain.oneShot(buildNoteTakingPrompt(conversationText), systemPrompt);

    let notes;
    try {
      const raw = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      notes = JSON.parse(raw);
    } catch {
      console.error(`${MODULE_ID} | Note parsing failed`, response);
      return null;
    }

    await NoteTaker._appendSessionLog(notes.sessionLog);
    return notes;
  }

  static async _appendSessionLog(entry) {
    if (!entry) return;
    const existing = VaultManager.getEntryContent('sessionLog') ?? '';
    const date = new Date().toLocaleDateString(undefined, { dateStyle: 'medium' });
    const updated = `${existing}<h3>Session — ${date}</h3><p>${entry}</p>`;
    await VaultManager.writeEntry('sessionLog', updated);
  }
}
