/**
 * Refines Phase 4 base action scores using live tag state.
 *
 * Scores stay on the 0–255 scale so the INT gate in CombatAI can compare
 * refined scores directly against the threshold without rescaling.
 *
 * Score adjustments are additive modifiers to the base score, with the
 * immunity short-circuit being the sole exception (returns 0 immediately).
 */
export class ActionScorer {
  /** @param {import('./TagEngine.js').TagEngine} tagEngine */
  constructor(tagEngine) {
    this._tags = tagEngine;
  }

  /**
   * @param {import('./CombatSystem.js').ScoredAction} action
   * @param {object} attackerCombatant  Combatant snapshot from BattleState
   * @param {import('./BattleState.js').BattleState} battleState
   * @returns {number}  0–255 clamped refined score
   */
  refine(action, attackerCombatant, battleState) {
    let score = action.baseScore;

    const attackerTags = this._tags.getTagsFor(attackerCombatant.id);
    const target       = action.targetId ? battleState.getCombatant(action.targetId) : null;
    const targetTags   = target ? this._tags.getTagsFor(target.id) : [];

    // ── Learning discount ──────────────────────────────────────────────────────
    const dmgType     = action.data?.damageType;
    const actorId     = target?.actorId;
    const discount    = dmgType && actorId
      ? this._tags.getLearningDiscount(attackerCombatant.id, dmgType, actorId)
      : 0;
    score -= discount;
    if (score <= 0) return 0; // learning fully kills this choice for this creature

    // ── Damage-type adjustments ────────────────────────────────────────────────
    if (dmgType) {
      if (targetTags.some(t => t.type === 'immunity' && t.key === dmgType)) {
        return 0; // visible immunity — never do this
      }
      if (targetTags.some(t => t.type === 'vulnerability' && t.key === dmgType)) {
        score += 45; // exploit the weakness
      }
      if (targetTags.some(t => t.type === 'resistance' && t.key === dmgType)) {
        score = Math.floor(score * 0.55); // poor damage efficiency
      }
    }

    // ── Target condition bonuses ───────────────────────────────────────────────
    // Conditions on the TARGET that benefit the attacker:
    if (targetTags.some(t => t.type === 'condition' && t.key === 'prone')) {
      if (action.type === 'attack') score += 15; // melee attacks have advantage vs. prone
    }
    if (targetTags.some(t => t.type === 'condition' && ['stunned', 'paralyzed', 'incapacitated'].includes(t.key))) {
      score += 30; // attacks auto-crit / have advantage
    }
    if (targetTags.some(t => t.type === 'condition' && t.key === 'blinded')) {
      score += 20; // attacks against a blinded target have advantage
    }
    if (targetTags.some(t => t.type === 'condition' && t.key === 'restrained')) {
      score += 15; // attacks have advantage; target can't move
    }

    // ── Attacker condition penalties ───────────────────────────────────────────
    if (attackerTags.some(t => t.type === 'condition' && t.key === 'blinded')) {
      if (action.type === 'attack' || action.type === 'cantrip') score = Math.floor(score * 0.6);
    }
    if (attackerTags.some(t => t.type === 'condition' && t.key === 'restrained')) {
      if (action.data?.actionType === 'rwak') score = Math.floor(score * 0.7); // ranged has disadvantage
    }

    // ── Position ───────────────────────────────────────────────────────────────
    if (attackerTags.some(t => t.type === 'position' && t.key === 'in_melee')) {
      // Ranged attack while in melee = disadvantage in D&D; penalise regardless of system
      if (action.data?.actionType === 'rwak') score = Math.floor(score * 0.75);
    }

    // ── Attacker HP threshold modifiers ───────────────────────────────────────
    const criticalHp = attackerTags.some(t => t.key === 'critical_hp');
    const lowHp      = attackerTags.some(t => t.key === 'low_hp');
    if (criticalHp && action.data?.isHealing) score += 40;
    else if (lowHp && action.data?.isHealing) score += 20;

    // ── AoE extra-target bonus ─────────────────────────────────────────────────
    if (action.aoeTargetIds?.length > 0) {
      score += action.aoeTargetIds.length * 10;
    }

    return Math.max(0, Math.min(255, Math.round(score)));
  }
}
