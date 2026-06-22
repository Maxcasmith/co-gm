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
      ui.notifications.error('This action is only available to the Game Master.');
      return;
    }
    const form       = target.closest('.aidm-actor-gen-form');
    const concept    = form.querySelector('[name="concept"]').value.trim();
    const cr         = parseFloat(form.querySelector('[name="cr"]').value) || 1;
    const role       = form.querySelector('[name="role"]').value;
    const spawnCount = parseInt(form.querySelector('[name="spawnCount"]').value, 10) || 0;

    if (!concept) {
      ui.notifications.warn('Please describe the NPC concept.');
      return;
    }

    target.disabled    = true;
    target.textContent = 'Generating…';

    try {
      const actor = await ActorGenerator.generate({ concept, cr, role });

      ui.notifications.info(`NPC "${actor.name}" created in the Actors directory.`);

      // Optionally spawn tokens immediately onto the current scene
      if (spawnCount > 0) {
        if (!canvas?.scene) {
          ui.notifications.warn('No active combat encounter.');
        } else {
          await TokenSpawner.spawnGroup(actor, spawnCount);
          ui.notifications.info(`${spawnCount} token(s) for ${actor.name} placed on the active scene.`);
        }
      }

      // Open the actor sheet so the GM can review it immediately
      actor.sheet.render(true);

      this.close();
    } catch (err) {
      ui.notifications.error(`NPC generation failed: ${err.message}`);
    } finally {
      target.disabled    = false;
      target.textContent = 'Generate NPC';
    }
  }

  static DEFAULT_OPTIONS = {
    id: 'aidm-actor-gen',
    classes: ['aidm-actor-gen'],
    window: {
      title:     'Generate NPC',
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
        { id: 'soldier',     label: 'Soldier (frontline fighter)'  },
        { id: 'spellcaster', label: 'Spellcaster (ranged/control)' },
        { id: 'supporter',   label: 'Supporter (healer/buffer)'    },
        { id: 'boss',        label: 'Boss (legendary threat)'      },
        { id: 'minion',      label: 'Minion (weak, numerous)'      },
      ],
    };
  }
}
