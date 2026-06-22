import { CombatSystem } from '../CombatSystem.js';

/**
 * Starter template for adding a new game system adapter.
 *
 * HOW TO CREATE A NEW ADAPTER
 * ────────────────────────────
 * 1. Copy this file to src/combat/systems/YourSystemCombatSystem.js
 * 2. Set `systemId` to match the Foundry system's `game.system.id`
 *    (open the browser console in Foundry and run: game.system.id)
 * 3. Implement the four interface methods below.
 * 4. Register in src/main.js (inside the 'init' hook):
 *
 *      import { YourSystemCombatSystem } from './combat/systems/YourSystemCombatSystem.js';
 *      registerCombatSystem(YourSystemCombatSystem);
 *
 * That's it. The rest of the AI engine (tag engine, action scorer, INT gate,
 * learning system, narration) works automatically.
 *
 * SCORE CALIBRATION GUIDE (0–255 scale)
 * ───────────────────────────────────────
 *   ≤  25  Always accessible — a mindless zombie can do this (INT 3+ threshold ≈ 25)
 *   ≤  85  Average INT play — tactical but not brilliant  (INT 10 threshold ≈ 85)
 *   ≤ 130  Smart play — multi-target, focus-fire on low-HP (INT 15 threshold ≈ 127)
 *   ≤ 200  Expert play — combo setups, resource exploitation (INT 25 threshold ≈ 212)
 *     255  Reserved for the theoretically perfect move
 *     0    Never choose this (immune target, no ammo, etc.)
 *
 * INT GATE FORMULA
 * ─────────────────
 *   threshold = floor((min(INT, 255) / 30) * 255)
 *   Creature picks the HIGHEST-SCORING action whose score ≤ threshold.
 *   If nothing qualifies, it falls back to the lowest-scoring action available.
 */
export class ExampleCombatSystem extends CombatSystem {
  /**
   * Must exactly match the Foundry system's `game.system.id`.
   * @type {string}
   */
  static systemId = 'your-system-id';

  /** Shown in Settings → Combat System dropdown. */
  static label = 'Your Game System';

  // ──────────────────────────────────────────────────────────────
  // 1. TAG EXTRACTION
  //    Called once per combatant at the start of each turn.
  //    Return an array of Tag objects describing permanent traits
  //    and current-turn state.
  // ──────────────────────────────────────────────────────────────

  /**
   * @param {object} combatant  BattleState snapshot
   * @param {import('../BattleState.js').BattleState} battleState
   * @returns {import('../CombatSystem.js').Tag[]}
   */
  getTagsForCombatant(combatant, battleState) {
    const actor = game.actors.get(combatant.actorId);
    const tags  = [];

    // ── Damage resistances / immunities / vulnerabilities ──────
    // Adjust field paths to match your system's actor schema:
    //
    // for (const dmgType of actor?.system?.traits?.dr?.value ?? []) {
    //   tags.push({ type: 'resistance',    key: dmgType, learned: false, source: 'actor' });
    // }
    // for (const dmgType of actor?.system?.traits?.di?.value ?? []) {
    //   tags.push({ type: 'immunity',      key: dmgType, learned: false, source: 'actor' });
    // }
    // for (const dmgType of actor?.system?.traits?.dv?.value ?? []) {
    //   tags.push({ type: 'vulnerability', key: dmgType, learned: false, source: 'actor' });
    // }

    // ── Active conditions (works for any Foundry v11+ system) ──
    for (const status of (combatant.conditions ?? [])) {
      tags.push({ type: 'condition', key: status, learned: false, source: 'status' });
    }

    // ── HP thresholds — used by ActionScorer for healing priority ─
    const hpPct = combatant.hp / combatant.maxHp;
    if (hpPct < 0.25)      tags.push({ type: 'condition', key: 'critical_hp', learned: false, source: 'hp' });
    else if (hpPct < 0.50) tags.push({ type: 'condition', key: 'low_hp',      learned: false, source: 'hp' });

    // ── Position (optional, improves scoring) ─────────────────
    // const inMelee = battleState.getEnemiesOf(combatant)
    //   .some(e => this._distFeet(combatant.position, e.position) <= 5);
    // if (inMelee) tags.push({ type: 'position', key: 'in_melee', learned: false, source: 'position' });

    return tags;
  }

  // ──────────────────────────────────────────────────────────────
  // 2. ACTION ENUMERATION
  //    Return every legal action the combatant can take this turn.
  //    Each ScoredAction gets a baseScore (0–255) which the tag
  //    engine will refine before the INT gate is applied.
  // ──────────────────────────────────────────────────────────────

  /**
   * @param {object} combatant
   * @param {import('../BattleState.js').BattleState} battleState
   * @returns {Promise<import('../CombatSystem.js').ScoredAction[]>}
   */
  async getAvailableActions(combatant, battleState) {
    const enemies = battleState.getEnemiesOf(combatant);
    const actions = [];

    // ── Example: basic melee attack on each enemy in range ─────
    for (const target of enemies) {
      actions.push({
        id:          `strike-${target.id}`,
        name:        `Strike → ${target.name}`,
        type:        'attack',
        baseScore:   25,               // low score — accessible to most creatures
        targetId:    target.id,
        aoeTargetIds: [],
        data: {
          attackerId:  combatant.id,
          attackBonus: 5,              // replace with real bonus from actor data
          damageFormula: '1d8 + 3',   // replace with real damage
          damageType:  'slashing',    // lowercase damage type key for tag matching
        },
      });
    }

    // ── Add more action types here (spells, abilities, etc.) ───
    // Higher baseScore = smarter creature needed to use it.

    return actions;
  }

  // ──────────────────────────────────────────────────────────────
  // 3. DICE RESOLUTION
  //    Roll dice for the chosen action. DO NOT touch Foundry
  //    documents here — just compute the mathematical result.
  //    applyResult() handles all document writes.
  // ──────────────────────────────────────────────────────────────

  /**
   * @param {import('../CombatSystem.js').ScoredAction} action
   * @param {import('../BattleState.js').BattleState} battleState
   * @returns {Promise<import('../CombatSystem.js').ActionResult>}
   */
  async resolveAction(action, battleState) {
    const attacker = battleState.getCombatant(action.data.attackerId);
    const target   = battleState.getCombatant(action.targetId);

    const attackRoll = await new Roll('1d20 + @bonus', {
      bonus: action.data.attackBonus ?? 0,
    }).evaluate();

    const hit    = attackRoll.total >= (target?.ac ?? 10);
    let   damage = 0;

    if (hit && action.data.damageFormula) {
      const dmgRoll = await new Roll(action.data.damageFormula).evaluate();
      damage = dmgRoll.total;
    }

    const aName    = attacker?.name ?? 'The creature';
    const tName    = target?.name   ?? 'the target';
    const narrative = hit
      ? `${aName} hits ${tName} for ${damage} ${action.data.damageType ?? ''} damage (${attackRoll.total} vs AC ${target?.ac ?? '?'}).`
      : `${aName} misses ${tName} (${attackRoll.total} vs AC ${target?.ac ?? '?'}).`;

    return {
      action,
      hit,
      damage,
      effectsApplied: [],
      narrative,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // 4. APPLY RESULT
  //    Write the action outcome to live Foundry documents.
  //    This is the ONLY place that calls actor.update() etc.
  //    Also consume any resources (spell slots, uses, ammo) here.
  // ──────────────────────────────────────────────────────────────

  /**
   * @param {import('../CombatSystem.js').ActionResult} result
   * @param {import('../BattleState.js').BattleState} battleState
   */
  async applyResult(result, battleState) {
    if (!result.hit || result.damage === 0) return;

    const targetSnap = battleState.getCombatant(result.action.targetId);
    const actor      = targetSnap ? game.actors.get(targetSnap.actorId) : null;
    if (!actor) return;

    // ── HP update — adjust path for your system ───────────────
    // Try to use your system's built-in damage method first:
    //   await actor.applyDamage([{ value: result.damage, type: 'slashing' }]);
    //
    // If it doesn't exist, fall back to a direct HP write:
    const hp    = actor.system?.attributes?.hp ?? actor.system?.hp ?? {};
    const newHp = Math.max(0, Math.min(hp.max ?? 1, (hp.value ?? 0) - result.damage));
    // Adjust the field path to match your system's schema:
    await actor.update({ 'system.attributes.hp.value': newHp });
  }

  // ──────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────

  _distFeet(pos1, pos2) {
    if (!canvas?.grid) return 0;
    try {
      return canvas.grid.measurePath([pos1, pos2]).distance;
    } catch {
      const gridSize = canvas.grid.size ?? 100;
      const gridDist = canvas.grid.distance ?? 5;
      return Math.max(Math.abs(pos2.x - pos1.x), Math.abs(pos2.y - pos1.y)) / gridSize * gridDist;
    }
  }
}
