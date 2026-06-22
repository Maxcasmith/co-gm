import { MODULE_ID, SETTINGS } from '../constants.js';

const _systems = new Map();

/**
 * Register a combat system adapter. Call before module settings are opened.
 * @param {typeof import('./CombatSystem.js').CombatSystem} SystemClass
 */
export function registerCombatSystem(SystemClass) {
  if (!SystemClass.systemId) {
    throw new Error(`${SystemClass.name} must define a static systemId.`);
  }
  _systems.set(SystemClass.systemId, SystemClass);
}

/**
 * @param {string} systemId
 * @returns {typeof import('./CombatSystem.js').CombatSystem | null}
 */
export function getCombatSystem(systemId) {
  return _systems.get(systemId) ?? null;
}

/**
 * Returns a fresh instance of the active combat system adapter.
 * Checks the module setting for a manual override; falls back to game.system.id.
 * Returns null if no adapter is registered for the active system.
 *
 * @returns {import('./CombatSystem.js').CombatSystem | null}
 */
export function getActiveCombatSystem() {
  const override = game.settings.get(MODULE_ID, SETTINGS.COMBAT_SYSTEM);
  const systemId = override || game.system?.id;
  const SystemClass = _systems.get(systemId);
  return SystemClass ? new SystemClass() : null;
}

/** @returns {(typeof import('./CombatSystem.js').CombatSystem)[]} */
export function getAllCombatSystems() {
  return Array.from(_systems.values());
}
