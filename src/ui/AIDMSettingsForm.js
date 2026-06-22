import { MODULE_ID, SETTINGS } from '../constants.js';
import { getAllProviders, getProvider } from '../providers/registry.js';
import { getAllCombatSystems } from '../combat/registry.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AIDMSettingsForm extends HandlebarsApplicationMixin(ApplicationV2) {
  // Static action methods are declared before DEFAULT_OPTIONS so they are
  // already on the class when DEFAULT_OPTIONS is evaluated.

  static async onSave(event, target) {
    const form = target.closest('.aidm-settings-form');
    const provider     = form.querySelector('[name="provider"]').value;
    const model        = form.querySelector('[name="model"]').value;
    const apiKey       = form.querySelector('[name="apiKey"]').value;
    const combatSystem = form.querySelector('[name="combatSystem"]').value;

    await game.settings.set(MODULE_ID, SETTINGS.PROVIDER,       provider);
    await game.settings.set(MODULE_ID, SETTINGS.MODEL,          model);
    await game.settings.set(MODULE_ID, `${SETTINGS.API_KEY_PREFIX}.${provider}`, apiKey);
    await game.settings.set(MODULE_ID, SETTINGS.COMBAT_SYSTEM,  combatSystem);

    ui.notifications.info('AI DM settings saved.');
    this.close();
  }

  static async onTestConnection(event, target) {
    const form = target.closest('.aidm-settings-form');
    const provider = form.querySelector('[name="provider"]').value;
    const apiKey = form.querySelector('[name="apiKey"]').value;

    if (!apiKey) {
      ui.notifications.warn('API key is invalid or missing.');
      return;
    }

    const ProviderClass = getProvider(provider);
    if (!ProviderClass) return;

    try {
      const valid = await new ProviderClass().validateKey(apiKey);
      if (valid) {
        ui.notifications.info('Connection successful.');
      } else {
        ui.notifications.error('API key is invalid or missing.');
      }
    } catch (err) {
      ui.notifications.error(`Connection failed: ${err.message}`);
    }
  }

  static DEFAULT_OPTIONS = {
    id: 'aidm-settings',
    classes: ['aidm-settings'],
    window: {
      title: 'AI Dungeon Master Settings',
      icon: 'fa-solid fa-robot',
      resizable: false,
    },
    position: {
      width: 480,
      height: 'auto',
    },
    actions: {
      save: AIDMSettingsForm.onSave,
      testConnection: AIDMSettingsForm.onTestConnection,
    },
  };

  static PARTS = {
    form: {
      template: 'modules/ai-vtt/templates/settings.hbs',
    },
  };

  async _prepareContext(options) {
    const currentProvider     = game.settings.get(MODULE_ID, SETTINGS.PROVIDER);
    const currentModel        = game.settings.get(MODULE_ID, SETTINGS.MODEL);
    const currentCombatSystem = game.settings.get(MODULE_ID, SETTINGS.COMBAT_SYSTEM);
    const ProviderClass       = getProvider(currentProvider);

    const autoLabel = `Auto-detect (${game.system?.title ?? game.system?.id ?? 'unknown'})`;

    return {
      providers: getAllProviders().map(P => ({
        id: P.providerId,
        label: P.label,
        active: P.providerId === currentProvider,
      })),
      models: (ProviderClass?.getDefaultModels() ?? []).map(m => ({
        ...m,
        active: m.id === currentModel,
      })),
      apiKey: game.settings.get(MODULE_ID, `${SETTINGS.API_KEY_PREFIX}.${currentProvider}`) ?? '',
      combatSystems: [
        { id: '', label: autoLabel, active: !currentCombatSystem },
        ...getAllCombatSystems().map(S => ({
          id: S.systemId,
          label: S.label,
          active: S.systemId === currentCombatSystem,
        })),
      ],
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element
      .querySelector('#aidm-provider')
      ?.addEventListener('change', this._onProviderChange.bind(this));
  }

  _onProviderChange(event) {
    const providerId = event.target.value;
    const ProviderClass = getProvider(providerId);
    const models = ProviderClass?.getDefaultModels() ?? [];

    this.element.querySelector('#aidm-model').innerHTML = models
      .map(m => `<option value="${m.id}">${m.label}</option>`)
      .join('');

    this.element.querySelector('[name="apiKey"]').value =
      game.settings.get(MODULE_ID, `${SETTINGS.API_KEY_PREFIX}.${providerId}`) ?? '';
  }
}
