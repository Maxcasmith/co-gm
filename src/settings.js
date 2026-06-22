import { MODULE_ID, SETTINGS } from './constants.js';
import { AIDMSettingsForm } from './ui/AIDMSettingsForm.js';
import { getAllProviders } from './providers/registry.js';

export function registerSettings() {
  game.settings.registerMenu(MODULE_ID, 'settingsMenu', {
    name: 'AIDM.Settings.Menu.Name',
    label: 'AIDM.Settings.Menu.Label',
    hint: 'AIDM.Settings.Menu.Hint',
    icon: 'fa-solid fa-robot',
    type: AIDMSettingsForm,
    restricted: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.PROVIDER, {
    scope: 'world',
    config: false,
    type: String,
    default: 'claude',
  });

  game.settings.register(MODULE_ID, SETTINGS.MODEL, {
    scope: 'world',
    config: false,
    type: String,
    default: 'claude-sonnet-4-6',
  });

  // Register an API key setting per provider so keys are stored independently.
  // getAllProviders() is safe here because initBuiltInProviders() runs first in main.js.
  for (const ProviderClass of getAllProviders()) {
    game.settings.register(MODULE_ID, `${SETTINGS.API_KEY_PREFIX}.${ProviderClass.providerId}`, {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });
  }

  // Empty string = auto-detect from game.system.id at runtime.
  game.settings.register(MODULE_ID, SETTINGS.COMBAT_SYSTEM, {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  // GM oversight mode — pause before each NPC action for GM approval.
  game.settings.register(MODULE_ID, SETTINGS.GM_OVERSIGHT, {
    name: 'AIDM.Settings.GMOversight.Name',
    hint: 'AIDM.Settings.GMOversight.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // AI combat auto-run toggle — visible in the standard Foundry module settings.
  game.settings.register(MODULE_ID, SETTINGS.AI_COMBAT_AUTO, {
    name: 'AIDM.Settings.AICombatAuto.Name',
    hint: 'AIDM.Settings.AICombatAuto.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // Persisted NPC learning — machine-readable Object, not shown in config UI.
  game.settings.register(MODULE_ID, SETTINGS.LEARNED_ENEMY_STATE, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });
}
