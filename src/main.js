import { MODULE_ID, SETTINGS } from './constants.js';
import { initBuiltInProviders } from './providers/registry.js';
import { registerSettings } from './settings.js';
import { WorldGenForm } from './ui/WorldGenForm.js';
import { DMPanel } from './ui/DMPanel.js';
import { SceneGenForm } from './ui/SceneGenForm.js';
import { ActorGenForm } from './ui/ActorGenForm.js';
import { registerCombatSystem } from './combat/registry.js';
import { DnD5eCombatSystem } from './combat/systems/DnD5eCombatSystem.js';
import { CombatAI } from './combat/CombatAI.js';

Hooks.once('init', () => {
  initBuiltInProviders();
  registerCombatSystem(DnD5eCombatSystem);
  registerSettings();
  loadTemplates([
    'modules/ai-vtt/templates/settings.hbs',
    'modules/ai-vtt/templates/world-gen.hbs',
    'modules/ai-vtt/templates/dm-panel.hbs',
    'modules/ai-vtt/templates/scene-gen.hbs',
    'modules/ai-vtt/templates/actor-gen.hbs',
  ]);
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | Ready`);
});

// Auto-run AI turns for non-PC combatants when the setting is enabled.
// The hook fires after Foundry has finished updating combat state, so the
// current combatant is already reflected in combat.combatant.
Hooks.on('updateCombat', async (combat, changes, _options, userId) => {
  if (!game.user.isGM) return;
  if (!('turn' in changes)) return;                          // not a turn advance
  if (!game.settings.get(MODULE_ID, SETTINGS.AI_COMBAT_AUTO)) return;

  const combatant = combat.combatant;
  if (!combatant || combatant.actor?.hasPlayerOwner) return; // skip PC turns

  try {
    await CombatAI.getInstance().executeTurn(combatant, combat);
  } catch (err) {
    console.error(`${MODULE_ID} | CombatAI error:`, err);
    ui.notifications?.error(`AI Combat Error: ${err.message}`);
  }
});

// Persist NPC learning when a combat encounter ends.
Hooks.on('deleteCombat', async (combat) => {
  if (!game.user.isGM) return;
  try {
    await CombatAI.getInstance().endCombat(combat);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not persist combat learning:`, err);
  }
});

// Scenes sidebar — "Generate Scene" button (GM only)
Hooks.on('renderSceneDirectory', (app, [html]) => {
  if (!game.user.isGM) return;
  const actions = html.querySelector('.header-actions');
  if (!actions) return;
  const btn = document.createElement('button');
  btn.setAttribute('data-tooltip', game.i18n.localize('AIDM.SceneGen.Tooltip'));
  btn.setAttribute('aria-label',   game.i18n.localize('AIDM.SceneGen.Tooltip'));
  btn.innerHTML = '<i class="fa-solid fa-map-location-dot"></i>';
  btn.addEventListener('click', () => new SceneGenForm().render({ force: true }));
  actions.prepend(btn);
});

// Actors sidebar — "Generate NPC" button (GM only)
Hooks.on('renderActorDirectory', (app, [html]) => {
  if (!game.user.isGM) return;
  const actions = html.querySelector('.header-actions');
  if (!actions) return;
  const btn = document.createElement('button');
  btn.setAttribute('data-tooltip', game.i18n.localize('AIDM.ActorGen.Tooltip'));
  btn.setAttribute('aria-label',   game.i18n.localize('AIDM.ActorGen.Tooltip'));
  btn.innerHTML = '<i class="fa-solid fa-person-rays"></i>';
  btn.addEventListener('click', () => new ActorGenForm().render({ force: true }));
  actions.prepend(btn);
});

// Journal sidebar — "Generate World" and "Open DM Panel" buttons (GM only)
Hooks.on('renderJournalDirectory', (app, [html]) => {
  if (!game.user.isGM) return;

  const actions = html.querySelector('.header-actions');
  if (!actions) return;

  const worldGenBtn = document.createElement('button');
  worldGenBtn.setAttribute('data-tooltip', game.i18n.localize('AIDM.Journal.GenerateWorld'));
  worldGenBtn.setAttribute('aria-label', game.i18n.localize('AIDM.Journal.GenerateWorld'));
  worldGenBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
  worldGenBtn.addEventListener('click', () => new WorldGenForm().render({ force: true }));

  const panelBtn = document.createElement('button');
  panelBtn.setAttribute('data-tooltip', game.i18n.localize('AIDM.Panel.Open'));
  panelBtn.setAttribute('aria-label', game.i18n.localize('AIDM.Panel.Open'));
  panelBtn.innerHTML = '<i class="fa-solid fa-dragon"></i>';
  panelBtn.addEventListener('click', () => DMPanel.open());

  actions.prepend(panelBtn);
  actions.prepend(worldGenBtn);
});
