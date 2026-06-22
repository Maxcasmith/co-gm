import { MODULE_ID, SETTINGS } from '../constants.js';
import { BattleState } from './BattleState.js';
import { TagEngine } from './TagEngine.js';
import { ActionScorer } from './ActionScorer.js';
import { getActiveCombatSystem } from './registry.js';
import { getActiveProvider } from '../providers/registry.js';
import { buildCombatNarrationPrompt } from '../prompts/combatPrompts.js';
import { ContextBuilder } from '../ai/ContextBuilder.js';
import { GMOverrideDialog } from '../ui/GMOverrideDialog.js';

/**
 * Singleton orchestrator for AI-driven combat turns.
 *
 * Turn execution flow:
 *   1. Refresh intrinsic tags for all living combatants
 *   2. Enumerate available actions via the combat system adapter
 *   3. Refine base scores with the tag engine (learning, resistances, position)
 *   4. Apply the INT gate: threshold = floor((INT / 30) * 255)
 *   5. Choose the highest-scoring action at or below the threshold
 *   6. Resolve dice rolls (via the adapter)
 *   7. Fire learning events
 *   8. Generate LLM flavour text (AI is NOT in the decision loop)
 *   9. Send narration to chat
 *  10. Apply the result to Foundry documents (via the adapter)
 */
export class CombatAI {
  /** @type {CombatAI | null} */
  static instance = null;

  static getInstance() {
    if (!CombatAI.instance) CombatAI.instance = new CombatAI();
    return CombatAI.instance;
  }

  constructor() {
    this.tagEngine = new TagEngine();
    /** Combat ID we last ran for — detects a new encounter to reset state. */
    this._activeCombatId = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute a full AI turn for the given combatant.
   *
   * @param {Combatant} combatant  Live Foundry Combatant document
   * @param {Combat}    combat     Active Foundry Combat document
   * @returns {{ chosen, result, narration } | null}
   */
  async executeTurn(combatant, combat) {
    const combatSystem = getActiveCombatSystem();
    if (!combatSystem) {
      console.warn(`${MODULE_ID} | No combat system registered for "${game.system?.id}".`);
      return null;
    }

    // New encounter → reset tag engine and load prior NPC learning
    if (this._activeCombatId !== combat.id) {
      this._activeCombatId = combat.id;
      this.tagEngine = new TagEngine();
      await this.tagEngine.loadLearning(BattleState.fromCombat(combat));
    }

    const battleState = BattleState.fromCombat(combat);

    // Populate intrinsic tags for every living combatant (keeps learned tags)
    for (const c of battleState.getLiving()) {
      const intrinsic = combatSystem.getTagsForCombatant(c, battleState);
      const learned   = this.tagEngine.getTagsFor(c.id).filter(t => t.learned);
      this.tagEngine.setTagsFor(c.id, [...intrinsic, ...learned]);
    }

    const snap = battleState.getCombatant(combatant.id);
    if (!snap?.isAlive) return null;

    // 2. Available actions
    const available = await combatSystem.getAvailableActions(snap, battleState);
    if (!available.length) {
      await this._sendNarration(`${snap.name} has no available actions this turn.`);
      return null;
    }

    // 3. Refine scores
    const scorer = new ActionScorer(this.tagEngine);
    const scored = available.map(action => ({
      ...action,
      refinedScore: scorer.refine(action, snap, battleState),
    }));

    // 4. INT gate
    const threshold = this._calcThreshold(snap);
    let eligible = scored.filter(a => a.refinedScore <= threshold);

    // Fallback: creature is too dumb to access any optimal action → use the simplest one
    if (!eligible.length) {
      eligible = [scored.reduce((min, a) => a.refinedScore < min.refinedScore ? a : min, scored[0])];
    }

    // 5. Choose highest-scoring within the gate
    const chosen = eligible.reduce((best, a) => a.refinedScore > best.refinedScore ? a : best, eligible[0]);

    // 5a. GM oversight — pause and ask for approval before executing
    if (game.settings.get(MODULE_ID, SETTINGS.GM_OVERSIGHT)) {
      const decision = await GMOverrideDialog.prompt(snap, chosen, threshold);
      if (decision !== 'approve') {
        await this._sendNarration(
          `${snap.name} hesitates, their moment passing without action.`
        );
        return null;
      }
    }

    // 6. Resolve
    const result = await combatSystem.resolveAction(chosen, battleState);

    // 7. Learning
    this.tagEngine.processLearning(snap, chosen, result, battleState);

    // 8. Narration
    const narration = await this._generateNarration(snap, chosen, result);

    // 9. Send to chat
    await this._sendNarration(narration ?? result.narrative);

    // 10. Apply to Foundry documents
    await combatSystem.applyResult(result, battleState);

    return { chosen, result, narration };
  }

  /**
   * Called when the combat encounter ends. Persists NPC learning to the vault.
   * @param {Combat} combat
   */
  async endCombat(combat) {
    const battleState = BattleState.fromCombat(combat);
    await this.tagEngine.persistLearning(battleState);
    this._activeCombatId = null;
    this.tagEngine = new TagEngine();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * INT gate threshold: floor((min(INT, 255) / 30) * 255)
   * A creature with INT 10 (average) gets threshold 85 — enough for simple
   * tactics but not high-level spell selection.
   */
  _calcThreshold(combatantSnap) {
    const actor = game.actors.get(combatantSnap.actorId);
    const int   = Math.min(actor?.system?.abilities?.int?.value ?? 10, 255);
    return Math.floor((int / 30) * 255);
  }

  async _generateNarration(combatantSnap, action, result) {
    const provider = getActiveProvider();
    if (!provider) return result.narrative;

    try {
      const systemPrompt = await ContextBuilder.buildSystemPrompt();
      const prompt       = buildCombatNarrationPrompt(combatantSnap.name, action, result);
      const { content }  = await provider.complete(prompt, {
        systemPrompt,
        maxTokens: 150,
        temperature: 0.9,
      });
      return content.trim() || result.narrative;
    } catch {
      // Non-fatal — mechanical description is a valid fallback
      return result.narrative;
    }
  }

  async _sendNarration(text) {
    await ChatMessage.create({
      content: `<div class="aidm-narration">${text.replace(/\n/g, '<br>')}</div>`,
      speaker: { alias: game.i18n.localize('AIDM.Panel.ChatAlias') },
      flags:   { [MODULE_ID]: { isCombatNarration: true } },
    });
  }
}
