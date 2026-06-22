import { MODULE_ID, SETTINGS } from '../constants.js';
import { VaultManager } from '../vault/VaultManager.js';

/**
 * Per-encounter tag state and cross-encounter learning system.
 *
 * Learning keys use actorId (stable across encounters) rather than combatantId
 * (ephemeral per encounter) so memory persists correctly.
 *
 * learnKey format: `${targetActorId}:immunity:${damageType}`
 *                  `${targetActorId}:resistance:${damageType}`
 */
export class TagEngine {
  constructor() {
    /** @type {Map<string, import('./CombatSystem.js').Tag[]>} combatantId → tags */
    this._tags = new Map();
    /**
     * @type {Map<string, Map<string, {learnKey: string, events: number, totalDiscount: number}>>}
     * attackerId → (learnKey → LearningEntry)
     */
    this._learning = new Map();
  }

  // ---------------------------------------------------------------------------
  // Tag state
  // ---------------------------------------------------------------------------

  setTagsFor(combatantId, tags) {
    this._tags.set(combatantId, tags);
  }

  /** @returns {import('./CombatSystem.js').Tag[]} */
  getTagsFor(combatantId) {
    return this._tags.get(combatantId) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Learning discount query
  // ---------------------------------------------------------------------------

  /**
   * Returns the total score discount the attacker has accumulated against
   * using `damageType` on `targetActorId`. Used by ActionScorer.
   *
   * @param {string} attackerId     combatant ID of the attacker
   * @param {string} damageType     e.g. 'fire', 'slashing'
   * @param {string} targetActorId  stable actorId of the target
   */
  getLearningDiscount(attackerId, damageType, targetActorId) {
    if (!damageType || !targetActorId) return 0;
    const entries = this._learning.get(attackerId);
    if (!entries) return 0;

    const immunityEntry = entries.get(`${targetActorId}:immunity:${damageType}`);
    if (immunityEntry) return immunityEntry.totalDiscount;

    const resistEntry = entries.get(`${targetActorId}:resistance:${damageType}`);
    // Resistance = poor choice but not hopeless — apply half the discount
    if (resistEntry) return Math.floor(resistEntry.totalDiscount * 0.5);

    return 0;
  }

  // ---------------------------------------------------------------------------
  // Learning events
  // ---------------------------------------------------------------------------

  /**
   * Inspect the action result and fire a learning event if something was revealed
   * about the target that the attacker didn't "know" via base score alone.
   *
   * INT < 3 → mindless; no learning fires.
   */
  processLearning(attackerCombatant, action, result, battleState) {
    const int = this._getInt(attackerCombatant);
    if (int < 3) return;

    const damageType = action.data?.damageType;
    const targetId   = action.targetId;
    if (!damageType || !targetId) return;

    const target = battleState.getCombatant(targetId);
    const targetActorId = target?.actorId ?? targetId;

    const targetTags = this.getTagsFor(targetId);
    let learnKey = null;

    if (result.hit && result.damage === 0) {
      // Hit but zero damage → immunity revealed
      if (targetTags.some(t => t.type === 'immunity' && t.key === damageType)) {
        learnKey = `${targetActorId}:immunity:${damageType}`;
      }
    } else if (result.hit && result.damage > 0) {
      // Damage landed but resistance was present — system already halved it
      if (targetTags.some(t => t.type === 'resistance' && t.key === damageType)) {
        learnKey = `${targetActorId}:resistance:${damageType}`;
      }
    }

    if (learnKey) {
      this._applyEvent(attackerCombatant.id, int, learnKey);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** Save NPC learning to the world setting and update the vault display. */
  async persistLearning(battleState) {
    const stored = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.LEARNED_ENEMY_STATE) ?? {});

    for (const [attackerId, entries] of this._learning) {
      const combatant = battleState.getCombatant(attackerId);
      if (!combatant || combatant.isPC) continue; // only persist NPC-side learning

      const actorName = combatant.name;
      if (!stored[actorName]) stored[actorName] = {};

      for (const [learnKey, entry] of entries) {
        stored[actorName][learnKey] = {
          events:   entry.events,
          discount: entry.totalDiscount,
        };
      }
    }

    await game.settings.set(MODULE_ID, SETTINGS.LEARNED_ENEMY_STATE, stored);
    await this._updateVaultDisplay(stored);
  }

  /** Restore NPC learning from the world setting at the start of a new combat. */
  async loadLearning(battleState) {
    const stored = game.settings.get(MODULE_ID, SETTINGS.LEARNED_ENEMY_STATE) ?? {};

    for (const combatant of battleState.getLiving()) {
      if (combatant.isPC) continue;
      const actorData = stored[combatant.name];
      if (!actorData) continue;

      const entries = new Map();
      for (const [learnKey, val] of Object.entries(actorData)) {
        entries.set(learnKey, {
          learnKey,
          events:        val.events   ?? 0,
          totalDiscount: val.discount ?? 0,
        });
      }
      this._learning.set(combatant.id, entries);
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _applyEvent(attackerId, int, learnKey) {
    const discountPerEvent = Math.floor((int / 30) * 60);
    const maxDiscount      = Math.floor((int / 30) * 200);
    const memoryCapacity   = Math.max(1, Math.floor((int / 30) * 10));

    if (!this._learning.has(attackerId)) this._learning.set(attackerId, new Map());
    const entries = this._learning.get(attackerId);

    // Evict the oldest entry when at capacity and this is a new key
    if (!entries.has(learnKey) && entries.size >= memoryCapacity) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }

    const existing = entries.get(learnKey) ?? { learnKey, events: 0, totalDiscount: 0 };
    existing.events++;
    existing.totalDiscount = Math.min(existing.totalDiscount + discountPerEvent, maxDiscount);
    entries.set(learnKey, existing);
  }

  _getInt(combatant) {
    const actor = game.actors.get(combatant.actorId);
    return actor?.system?.abilities?.int?.value ?? 10;
  }

  async _updateVaultDisplay(stored) {
    const actorBlocks = Object.entries(stored).map(([actorName, learns]) => {
      const items = Object.entries(learns).map(([key, val]) =>
        `<li><strong>${key}</strong> — ${val.events} event(s), ${val.discount} pts discount</li>`
      ).join('');
      return `<h2>${actorName}</h2><ul>${items}</ul>`;
    });

    const html = actorBlocks.length
      ? `<h1>Learned Enemy State</h1>${actorBlocks.join('')}`
      : '<h1>Learned Enemy State</h1><p><em>No learning recorded yet.</em></p>';

    await VaultManager.writeEntry('learnedState', html);
  }
}
