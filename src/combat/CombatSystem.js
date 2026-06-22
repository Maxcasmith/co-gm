/**
 * Abstract base class for all combat system adapters.
 *
 * To add a new game system:
 *   1. Extend this class and implement all abstract methods.
 *   2. Set static systemId (must match game.system.id) and static label.
 *   3. Call registerCombatSystem(YourClass) before the settings form opens.
 *
 * ---------------------------------------------------------------------------
 * Shared type definitions used across the combat pipeline
 * ---------------------------------------------------------------------------
 *
 * @typedef {Object} ScoredAction
 * @property {string}   id            Unique identifier for this action instance
 * @property {string}   name          Display name (e.g. "Longsword → Goblin")
 * @property {string}   type          'attack' | 'spell' | 'cantrip' | 'ability' | 'move' | 'utility'
 * @property {number}   baseScore     0–255; drives the INT gate. Simple = low, tactical = high.
 * @property {string|null} targetId   Combatant ID of the primary target; null for self/movement
 * @property {string[]} aoeTargetIds  Additional combatant IDs for AoE actions
 * @property {object}   data          System-specific payload (item IDs, roll data, etc.)
 *
 * @typedef {Object} ActionResult
 * @property {ScoredAction} action
 * @property {boolean}  hit
 * @property {number}   damage          Total damage dealt (negative = healing)
 * @property {string[]} effectsApplied  Condition IDs applied to target
 * @property {string}   narrative       Brief mechanical description passed to LLM for flavour
 *
 * @typedef {Object} Tag
 * @property {string}  type     'resistance' | 'vulnerability' | 'immunity' | 'conditionImmunity' |
 *                               'condition' | 'position' | 'behavioral' | 'learned'
 * @property {string}  key      Specific value, e.g. 'fire', 'prone', 'in_melee', 'low_hp'
 * @property {boolean} learned  True if acquired via learning system, false if intrinsic
 * @property {string}  [source] Where the tag originated ('actor', 'status', 'position', 'learned')
 */

export class CombatSystem {
  /** @type {string} Must match game.system.id for auto-detection */
  static systemId = null;

  /** @type {string} Display name shown in the settings UI */
  static label = null;

  /**
   * Return all legal actions the creature can take on its turn, each with a base score.
   * Phase 5's scoring engine will refine scores using the tag system.
   *
   * @param {object}                              combatant   Snapshot from BattleState.combatants
   * @param {import('./BattleState.js').BattleState} battleState
   * @returns {Promise<ScoredAction[]>}
   */
  async getAvailableActions(combatant, battleState) {
    throw new Error(`${this.constructor.name} must implement getAvailableActions()`);
  }

  /**
   * Roll dice and compute the mechanical outcome of a chosen action.
   * Does NOT apply the result — that is applyResult()'s job.
   *
   * @param {ScoredAction}                           action
   * @param {import('./BattleState.js').BattleState} battleState
   * @returns {Promise<ActionResult>}
   */
  async resolveAction(action, battleState) {
    throw new Error(`${this.constructor.name} must implement resolveAction()`);
  }

  /**
   * Apply a resolved result to Foundry documents (HP changes, conditions, movement).
   *
   * @param {ActionResult}                           result
   * @param {import('./BattleState.js').BattleState} battleState
   * @returns {Promise<void>}
   */
  async applyResult(result, battleState) {
    throw new Error(`${this.constructor.name} must implement applyResult()`);
  }

  /**
   * Build the intrinsic tag list for a combatant from actor data and current state.
   * The Phase 5 tag engine merges in learned tags on top of these.
   *
   * @param {object}                                 combatant  Snapshot from BattleState.combatants
   * @param {import('./BattleState.js').BattleState} battleState
   * @returns {Tag[]}
   */
  getTagsForCombatant(combatant, battleState) {
    throw new Error(`${this.constructor.name} must implement getTagsForCombatant()`);
  }
}
