/**
 * Immutable snapshot of a combat at a specific turn.
 * Built from the live Foundry Combat document; used throughout the AI engine
 * without touching Foundry documents directly.
 */
export class BattleState {
  /**
   * @param {Combat} combat  Active Foundry Combat document
   * @returns {BattleState}
   */
  static fromCombat(combat) {
    const combatants = combat.combatants.contents.map(c => BattleState._snapshot(c));
    return new BattleState({
      combatants,
      round: combat.round ?? 1,
      turn: combat.turn ?? 0,
      sceneId: combat.scene?.id ?? null,
    });
  }

  static _snapshot(combatant) {
    const actor = combatant.actor;
    const token = combatant.token;
    const hp = actor?.system?.attributes?.hp ?? {};

    return {
      id: combatant.id,
      tokenId: token?.id ?? null,
      actorId: actor?.id ?? null,
      name: combatant.name,
      hp: hp.value ?? 0,
      maxHp: Math.max(hp.max ?? 1, 1),
      ac: actor?.system?.attributes?.ac?.value ?? 10,
      position: { x: token?.x ?? 0, y: token?.y ?? 0 },
      // actor.statuses is a Set<string> of condition IDs in Foundry v11+
      conditions: [...(actor?.statuses ?? [])],
      isPC: actor?.hasPlayerOwner ?? false,
      isAlive: (hp.value ?? 0) > 0,
      initiative: combatant.initiative ?? 0,
      // tags populated by the combat system adapter and tag engine
      tags: [],
    };
  }

  constructor({ combatants, round, turn, sceneId }) {
    this.combatants = combatants;
    this.round = round;
    this.turn = turn;
    this.sceneId = sceneId;
  }

  /** @param {string} id  Combatant ID */
  getCombatant(id) {
    return this.combatants.find(c => c.id === id) ?? null;
  }

  /** Living combatants on the opposing side */
  getEnemiesOf(combatant) {
    return this.combatants.filter(c => c.isPC !== combatant.isPC && c.isAlive);
  }

  /** Living combatants on the same side (excludes self) */
  getAlliesOf(combatant) {
    return this.combatants.filter(c => c.isPC === combatant.isPC && c.id !== combatant.id && c.isAlive);
  }

  getLiving() {
    return this.combatants.filter(c => c.isAlive);
  }

  /** The enemy with the lowest HP percentage */
  getMostWounded(combatant) {
    const enemies = this.getEnemiesOf(combatant);
    if (!enemies.length) return null;
    return enemies.reduce((lowest, c) =>
      (c.hp / c.maxHp) < (lowest.hp / lowest.maxHp) ? c : lowest
    , enemies[0]);
  }

  /** The ally with the lowest HP percentage */
  getMostWoundedAlly(combatant) {
    const allies = this.getAlliesOf(combatant);
    if (!allies.length) return null;
    return allies.reduce((lowest, c) =>
      (c.hp / c.maxHp) < (lowest.hp / lowest.maxHp) ? c : lowest
    , allies[0]);
  }
}
