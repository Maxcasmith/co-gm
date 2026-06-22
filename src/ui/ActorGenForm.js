import { ActorGenerator } from '../generators/ActorGenerator.js';
import { TokenSpawner } from '../generators/TokenSpawner.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CR_OPTIONS = [
  { value: '0',     label: '0'   },
  { value: '0.125', label: '1/8' },
  { value: '0.25',  label: '1/4' },
  { value: '0.5',   label: '1/2' },
  ...[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30].map(
    n => ({ value: String(n), label: String(n) })
  ),
];

export class ActorGenForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static async onGenerate(event, target) {
    if (!game.user.isGM) {
      ui.notifications.error(game.i18n.localize('AIDM.Error.GMOnly'));
      return;
    }
    const form       = target.closest('.aidm-actor-gen-form');
    const concept    = form.querySelector('[name="concept"]').value.trim();
    const cr         = parseFloat(form.querySelector('[name="cr"]').value) || 1;
    const role       = form.querySelector('[name="role"]').value;
    const spawnCount = parseInt(form.querySelector('[name="spawnCount"]').value, 10) || 0;

    if (!concept) {
      ui.notifications.warn(game.i18n.localize('AIDM.ActorGen.Validation.Required'));
      return;
    }

    target.disabled    = true;
    target.textContent = game.i18n.localize('AIDM.ActorGen.Generating');

    try {
      const actor = await ActorGenerator.generate({ concept, cr, role });

      ui.notifications.info(
        game.i18n.format('AIDM.ActorGen.Success', { name: actor.name })
      );

      // Optionally spawn tokens immediately onto the current scene
      if (spawnCount > 0) {
        if (!canvas?.scene) {
          ui.notifications.warn(game.i18n.localize('AIDM.Combat.NoCombat'));
        } else {
          await TokenSpawner.spawnGroup(actor, spawnCount);
          ui.notifications.info(
            game.i18n.format('AIDM.ActorGen.Spawned', { count: spawnCount, name: actor.name })
          );
        }
      }

      // Open the actor sheet so the GM can review it immediately
      actor.sheet.render(true);

      this.close();
    } catch (err) {
      ui.notifications.error(
        game.i18n.format('AIDM.ActorGen.Error.Failed', { error: err.message })
      );
    } finally {
      target.disabled    = false;
      target.textContent = game.i18n.localize('AIDM.ActorGen.Generate');
    }
  }

  static DEFAULT_OPTIONS = {
    id: 'aidm-actor-gen',
    classes: ['aidm-actor-gen'],
    window: {
      title:     'AIDM.ActorGen.Title',
      icon:      'fa-solid fa-person-rays',
      resizable: false,
    },
    position: { width: 440, height: 'auto' },
    actions: {
      generate: ActorGenForm.onGenerate,
    },
  };

  static PARTS = {
    form: { template: 'modules/ai-vtt/templates/actor-gen.hbs' },
  };

  async _prepareContext(_options) {
    return {
      crOptions: CR_OPTIONS,
      roles: [
        { id: 'soldier',     label: game.i18n.localize('AIDM.ActorGen.Role.Soldier')     },
        { id: 'spellcaster', label: game.i18n.localize('AIDM.ActorGen.Role.Spellcaster') },
        { id: 'supporter',   label: game.i18n.localize('AIDM.ActorGen.Role.Supporter')   },
        { id: 'boss',        label: game.i18n.localize('AIDM.ActorGen.Role.Boss')        },
        { id: 'minion',      label: game.i18n.localize('AIDM.ActorGen.Role.Minion')      },
      ],
    };
  }
}
