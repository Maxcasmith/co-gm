import { CombatSystem } from '../CombatSystem.js';

/**
 * Combat system adapter for the dnd5e Foundry system.
 * Tested against dnd5e v3.x. Uses optional chaining throughout to
 * tolerate minor API differences between minor versions.
 *
 * Base scores are calibrated to the 0–255 INT gate scale:
 *   Simple melee   ~20–40   (accessible to INT 3+, threshold ~25)
 *   Tactical play  ~50–90   (requires INT 8–12, threshold ~68–102)
 *   Optimal spell  ~100–160 (requires INT 15–20+, threshold ~127–170)
 *
 * Phase 5's tag engine refines these scores using live tag state.
 */
export class DnD5eCombatSystem extends CombatSystem {
  static systemId = 'dnd5e';
  static label = 'D&D 5th Edition';

  // ---------------------------------------------------------------------------
  // Interface implementation
  // ---------------------------------------------------------------------------

  getTagsForCombatant(combatant, battleState) {
    const actor = game.actors.get(combatant.actorId);
    const tags = [];

    if (actor) {
      const traits = actor.system?.traits ?? {};

      for (const dmgType of [...(traits.dr?.value ?? [])]) {
        tags.push({ type: 'resistance',        key: dmgType, learned: false, source: 'actor' });
      }
      for (const dmgType of [...(traits.di?.value ?? [])]) {
        tags.push({ type: 'immunity',          key: dmgType, learned: false, source: 'actor' });
      }
      for (const dmgType of [...(traits.dv?.value ?? [])]) {
        tags.push({ type: 'vulnerability',     key: dmgType, learned: false, source: 'actor' });
      }
      for (const cond of [...(traits.ci?.value ?? [])]) {
        tags.push({ type: 'conditionImmunity', key: cond,    learned: false, source: 'actor' });
      }
    }

    for (const status of (combatant.conditions ?? [])) {
      tags.push({ type: 'condition', key: status, learned: false, source: 'status' });
    }

    // Position tags
    const enemies = battleState.getEnemiesOf(combatant);
    const inMelee = enemies.some(e => this._dist(combatant.position, e.position) <= 5);
    if (inMelee) tags.push({ type: 'position', key: 'in_melee', learned: false, source: 'position' });

    // HP threshold tags
    const hpPct = combatant.hp / combatant.maxHp;
    if (hpPct < 0.25)      tags.push({ type: 'condition', key: 'critical_hp', learned: false, source: 'hp' });
    else if (hpPct < 0.50) tags.push({ type: 'condition', key: 'low_hp',      learned: false, source: 'hp' });

    return tags;
  }

  async getAvailableActions(combatant, battleState) {
    const actor = game.actors.get(combatant.actorId);
    if (!actor) return [];

    const enemies = battleState.getEnemiesOf(combatant);
    const allies  = battleState.getAlliesOf(combatant);
    const actions = [];

    // -- Weapons --
    const weapons = actor.items.filter(i => i.type === 'weapon' && i.system?.equipped);
    for (const weapon of weapons) {
      const range = this._weaponRange(weapon);
      for (const target of enemies.filter(e => this._dist(combatant.position, e.position) <= range)) {
        actions.push(this._weaponAction(combatant, actor, weapon, target));
      }
    }

    // -- Cantrips --
    const cantrips = actor.items.filter(i =>
      i.type === 'spell' && i.system?.level === 0 && this._isActionActivation(i)
    );
    for (const cantrip of cantrips) {
      const range = this._spellRange(cantrip);
      for (const target of enemies.filter(e => this._dist(combatant.position, e.position) <= range)) {
        actions.push(this._spellAction(combatant, actor, cantrip, [target]));
      }
    }

    // -- Levelled spells --
    const spells = actor.items.filter(i =>
      i.type === 'spell' &&
      (i.system?.level ?? 0) > 0 &&
      this._isSpellCastable(actor, i) &&
      this._isActionActivation(i)
    );

    for (const spell of spells) {
      const range     = this._spellRange(spell);
      const isAoe     = this._isAoe(spell);
      const isHealing = this._isHealing(spell);

      if (isHealing) {
        // Heal most-wounded ally
        const target = battleState.getMostWoundedAlly(combatant);
        if (target) actions.push(this._spellAction(combatant, actor, spell, [target]));
        // Self-heal
        if ((combatant.hp / combatant.maxHp) < 0.5) {
          actions.push(this._spellAction(combatant, actor, spell, [combatant], true));
        }
      } else if (isAoe) {
        const inRange = enemies.filter(e => this._dist(combatant.position, e.position) <= range);
        if (inRange.length > 0) actions.push(this._spellAction(combatant, actor, spell, inRange));
      } else {
        for (const target of enemies.filter(e => this._dist(combatant.position, e.position) <= range)) {
          actions.push(this._spellAction(combatant, actor, spell, [target]));
        }
      }
    }

    return actions;
  }

  async resolveAction(action, battleState) {
    const attacker = battleState.getCombatant(action.data.attackerId);
    const target   = action.targetId ? battleState.getCombatant(action.targetId) : null;

    if (action.type === 'attack' || action.type === 'cantrip') {
      return this._resolveAttack(action, attacker, target);
    }
    if (action.type === 'spell') {
      return this._resolveSpell(action, attacker, target);
    }
    return {
      action,
      hit: true,
      damage: 0,
      effectsApplied: [],
      narrative: `${attacker?.name ?? 'The creature'} uses ${action.name}.`,
    };
  }

  async applyResult(result, battleState) {
    // Consume spell slots / innate uses on the caster before touching the target
    if (result.action.type === 'spell' && (result.action.data?.spellLevel ?? 0) > 0) {
      await this._consumeSpellSlot(result.action, battleState);
    }

    const targetSnap = battleState.getCombatant(result.action.targetId);
    if (!targetSnap || !result.hit) return;

    const actor = game.actors.get(targetSnap.actorId);
    if (!actor) return;

    if (result.damage !== 0) {
      try {
        if (result.damage > 0) {
          await actor.applyDamage([{ value: result.damage, type: result.action.data?.damageType ?? 'bludgeoning' }]);
        } else {
          await actor.applyDamage([{ value: result.damage, type: 'healing' }]);
        }
      } catch {
        // Fallback for dnd5e v2 / API variation
        const current = actor.system.attributes.hp.value ?? 0;
        const updated = Math.max(0, Math.min(actor.system.attributes.hp.max ?? 0, current - result.damage));
        await actor.update({ 'system.attributes.hp.value': updated });
      }
    }

    for (const conditionId of (result.effectsApplied ?? [])) {
      try {
        await actor.toggleStatusEffect(conditionId, { active: true });
      } catch {
        // Non-fatal — condition API varies across dnd5e versions
      }
    }
  }

  async _consumeSpellSlot(action, battleState) {
    const attackerSnap = battleState.getCombatant(action.data?.attackerId);
    const actor = attackerSnap ? game.actors.get(attackerSnap.actorId) : null;
    if (!actor) return;

    const item = actor.items.get(action.data?.itemId);
    const mode = item?.system?.preparation?.mode;

    // Innate spellcasting uses limited uses per day rather than spell slots
    if (mode === 'innate' && (item?.system?.uses?.max ?? 0) > 0) {
      const current = item.system.uses.value ?? 0;
      if (current > 0) await item.update({ 'system.uses.value': current - 1 });
      return;
    }

    // Standard slot consumption — use the lowest available slot at or above spell level
    const level = action.data?.spellLevel ?? 1;
    const slots  = actor.system?.spells ?? {};
    for (let l = level; l <= 9; l++) {
      const key = `spell${l}`;
      if ((slots[key]?.value ?? 0) > 0) {
        await actor.update({ [`system.spells.${key}.value`]: slots[key].value - 1 });
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Action builders
  // ---------------------------------------------------------------------------

  _weaponAction(combatant, actor, weapon, target) {
    const hpPct = target.hp / target.maxHp;
    let score = 25;
    if (hpPct < 0.25) score += 20; // can finish them off
    else if (hpPct < 0.5) score += 10;

    // Two-handed / heavy weapons are marginally smarter to use (more damage)
    const props = weapon.system?.properties;
    if (props?.has?.('two') || props?.has?.('hvy') || props?.two || props?.hvy) score += 5;

    return {
      id: `weapon-${weapon.id}-${target.id}`,
      name: `${weapon.name} → ${target.name}`,
      type: 'attack',
      baseScore: score,
      targetId: target.id,
      aoeTargetIds: [],
      data: {
        attackerId:   combatant.id,
        itemId:       weapon.id,
        actionType:   weapon.system?.actionType ?? 'mwak',
        attackBonus:  this._weaponAttackBonus(actor, weapon),
        damageParts:  weapon.system?.damage?.parts ?? [],
        damageType:   weapon.system?.damage?.parts?.[0]?.[1] ?? 'bludgeoning',
      },
    };
  }

  _spellAction(combatant, actor, spell, targets, isSelf = false) {
    const level     = spell.system?.level ?? 0;
    const isCantrip = level === 0;
    const isAoe     = targets.length > 1;
    const isHealing = this._isHealing(spell);

    let score;
    if (isHealing) {
      const pct = targets[0] ? targets[0].hp / targets[0].maxHp : 1;
      score = 55 + Math.round((1 - pct) * 30);    // more valuable when target is low
    } else if (isCantrip) {
      score = 30;
    } else if (isAoe) {
      score = 70 + (targets.length - 1) * 15;     // each extra target adds value
    } else {
      score = 40 + level * 10;                     // higher slot = smarter investment
    }
    score = Math.min(Math.round(score), 200);

    const primary = isSelf ? combatant : (targets[0] ?? combatant);

    return {
      id: `spell-${spell.id}-${primary.id}-${Date.now()}`,
      name: `${spell.name}${isAoe ? ` (×${targets.length})` : ''} → ${isSelf ? 'self' : primary.name}`,
      type: isCantrip ? 'cantrip' : 'spell',
      baseScore: score,
      targetId: primary.id,
      aoeTargetIds: targets.slice(1).map(t => t.id),
      data: {
        attackerId:  combatant.id,
        itemId:      spell.id,
        spellLevel:  level,
        actionType:  spell.system?.actionType ?? 'other',
        attackBonus: this._spellAttackBonus(actor),
        damageParts: spell.system?.damage?.parts ?? [],
        damageType:  spell.system?.damage?.parts?.[0]?.[1] ?? 'force',
        saveDC:      actor.system?.attributes?.spelldc ?? 10,
        saveAbility: spell.system?.save?.ability ?? null,
        isAoe,
        isHealing,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Resolution helpers
  // ---------------------------------------------------------------------------

  async _resolveAttack(action, attacker, target) {
    if (!target) {
      return { action, hit: false, damage: 0, effectsApplied: [], narrative: 'No target.' };
    }
    const attackRoll = await new Roll('1d20 + @bonus', { bonus: action.data.attackBonus ?? 0 }).evaluate();
    const hit = attackRoll.total >= target.ac;
    let damage = 0;
    if (hit) {
      for (const [formula] of (action.data.damageParts ?? [])) {
        const dmg = await new Roll(formula).evaluate();
        damage += dmg.total;
      }
    }
    const aName = attacker?.name ?? 'The creature';
    const tName = target.name;
    const narrative = hit
      ? `${aName} hits ${tName} with ${action.name.split(' →')[0]} for ${damage} damage (${attackRoll.total} vs AC ${target.ac}).`
      : `${aName} misses ${tName} (${attackRoll.total} vs AC ${target.ac}).`;
    return { action, hit, damage, effectsApplied: [], narrative };
  }

  async _resolveSpell(action, attacker, target) {
    const { data } = action;
    const aName = attacker?.name ?? 'The creature';
    const spellName = action.name.split(' →')[0];

    if (data.isHealing) {
      const formula = data.damageParts?.[0]?.[0] ?? '1d8';
      const roll = await new Roll(formula).evaluate();
      return {
        action, hit: true, damage: -roll.total, effectsApplied: [],
        narrative: `${aName} casts ${spellName}, restoring ${roll.total} HP.`,
      };
    }

    if (data.saveAbility) {
      // Saving-throw spell: assume ~75% damage lands (accounts for average save rate)
      let raw = 0;
      for (const [formula] of (data.damageParts ?? [])) {
        const roll = await new Roll(formula).evaluate();
        raw += roll.total;
      }
      const effective = Math.floor(raw * 0.75);
      const tName = target?.name ?? 'the targets';
      return {
        action, hit: true, damage: effective, effectsApplied: [],
        narrative: `${aName} casts ${spellName} (DC ${data.saveDC}), dealing ~${effective} damage to ${tName}.`,
      };
    }

    // Spell attack roll
    const attackRoll = await new Roll('1d20 + @bonus', { bonus: data.attackBonus ?? 0 }).evaluate();
    const hit = !target || attackRoll.total >= (target.ac ?? 10);
    let damage = 0;
    if (hit) {
      for (const [formula] of (data.damageParts ?? [])) {
        const dmg = await new Roll(formula).evaluate();
        damage += dmg.total;
      }
    }
    const tName = target?.name ?? 'the targets';
    const narrative = hit
      ? `${aName} hits ${tName} with ${spellName} for ${damage} damage.`
      : `${aName}'s ${spellName} misses ${tName}.`;
    return { action, hit, damage, effectsApplied: [], narrative };
  }

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------

  _dist(pos1, pos2) {
    if (!canvas?.grid) return 0;
    try {
      return canvas.grid.measurePath([pos1, pos2]).distance;
    } catch {
      const gridSize = canvas.grid.size ?? 100;
      const gridDist = canvas.grid.distance ?? 5;
      const dx = Math.abs(pos2.x - pos1.x);
      const dy = Math.abs(pos2.y - pos1.y);
      return Math.max(dx, dy) / gridSize * gridDist;
    }
  }

  _weaponRange(weapon) {
    const r = weapon.system?.range;
    if (!r || r.units === 'touch') return 5;
    if (r.units === 'ft') return r.value ?? 5;
    return 5;
  }

  _spellRange(spell) {
    const r = spell.system?.range;
    if (!r) return 30;
    if (r.units === 'ft')   return r.value ?? 30;
    if (r.units === 'touch') return 5;
    if (r.units === 'self')  return 0;
    if (r.units === 'spec' || r.units === 'any') return 999;
    return r.value ?? 30;
  }

  _isActionActivation(item) {
    const type = item.system?.activation?.type;
    return !type || type === 'action' || type === 'special';
  }

  _isSpellCastable(actor, spell) {
    const mode = spell.system?.preparation?.mode;
    const prepared = spell.system?.preparation?.prepared;

    if (['always', 'innate', 'known', 'pact', 'atwill'].includes(mode)) {
      if (mode === 'innate' && (spell.system?.uses?.max ?? 0) > 0) {
        return (spell.system.uses.value ?? 0) > 0;
      }
      return true;
    }

    if (!prepared) return false;

    const level = spell.system?.level ?? 1;
    for (let l = level; l <= 9; l++) {
      if ((actor.system?.spells?.[`spell${l}`]?.value ?? 0) > 0) return true;
    }
    return false;
  }

  _isAoe(spell) {
    return ['sphere', 'cube', 'cylinder', 'cone', 'line', 'square', 'wall', 'radius']
      .includes(spell.system?.target?.type);
  }

  _isHealing(spell) {
    return (spell.system?.damage?.parts ?? []).some(([, type]) => type === 'healing');
  }

  _spellAttackBonus(actor) {
    // spellDC = 8 + prof + mod  →  attack bonus = spellDC − 8
    return (actor.system?.attributes?.spelldc ?? 10) - 8;
  }

  _weaponAttackBonus(actor, weapon) {
    const isRanged = weapon.system?.actionType === 'rwak';
    const ability  = weapon.system?.ability ?? (isRanged ? 'dex' : 'str');
    const mod      = actor.system?.abilities?.[ability]?.mod ?? 0;
    const prof     = weapon.system?.proficient !== false ? (actor.system?.attributes?.prof ?? 0) : 0;
    const bonus    = parseInt(weapon.system?.attackBonus ?? 0, 10) || 0;
    return mod + prof + bonus;
  }
}
