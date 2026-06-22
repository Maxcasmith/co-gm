import { SceneGenerator } from '../generators/SceneGenerator.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SceneGenForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static async onGenerate(event, target) {
    if (!game.user.isGM) {
      ui.notifications.error('This action is only available to the Game Master.');
      return;
    }
    const form        = target.closest('.aidm-scene-gen-form');
    const name        = form.querySelector('[name="sceneName"]').value.trim();
    const description = form.querySelector('[name="description"]').value.trim();
    const size        = form.querySelector('[name="size"]').value;
    const lighting    = form.querySelector('[name="lighting"]').value;
    const sceneType   = form.querySelector('[name="sceneType"]').value;
    const lightCount  = parseInt(form.querySelector('[name="lightCount"]').value, 10) || 2;

    if (!description) {
      ui.notifications.warn('Please describe the scene.');
      return;
    }

    target.disabled    = true;
    target.textContent = 'Generating…';

    try {
      const { scene, data } = await SceneGenerator.generate({
        name: name || description.slice(0, 40),
        description,
        size,
        lighting,
        sceneType,
        lightCount,
      });

      ui.notifications.info(`Scene "${scene.name}" created and activated.`);

      // Show the GM the narrative description via a chat message
      if (data.description || data.mood) {
        await ChatMessage.create({
          content: `<div class="aidm-narration">
            <strong>${scene.name}</strong><br>
            ${data.description ?? ''}<br><em>${data.mood ?? ''}</em>
            ${data.suggestedEncounter ? `<br><br><strong>Suggested encounter:</strong> ${data.suggestedEncounter}` : ''}
          </div>`,
          speaker: { alias: 'Dungeon Master' },
        });
      }

      await scene.view();
      this.close();
    } catch (err) {
      ui.notifications.error(`Scene generation failed: ${err.message}`);
    } finally {
      target.disabled    = false;
      target.textContent = 'Generate Scene';
    }
  }

  static DEFAULT_OPTIONS = {
    id: 'aidm-scene-gen',
    classes: ['aidm-scene-gen'],
    window: {
      title: 'Generate Scene',
      icon: 'fa-solid fa-map',
      resizable: false,
    },
    position: { width: 440, height: 'auto' },
    actions: {
      generate: SceneGenForm.onGenerate,
    },
  };

  static PARTS = {
    form: { template: 'modules/ai-vtt/templates/scene-gen.hbs' },
  };

  async _prepareContext(_options) {
    return {
      sizes: [
        { id: 'small',  label: 'Small (1 room)',      active: false },
        { id: 'medium', label: 'Medium (multi-room)', active: true  },
        { id: 'large',  label: 'Large (dungeon wing)', active: false },
        { id: 'huge',   label: 'Huge (region)',        active: false },
      ],
      lightings: [
        { id: 'bright',     label: 'Bright (fully lit)', active: false },
        { id: 'dim',        label: 'Dim (torchlight)',   active: true  },
        { id: 'dark',       label: 'Dark (deep dungeon)', active: false },
        { id: 'pitchblack', label: 'Pitch Black',         active: false },
      ],
      sceneTypes: [
        { id: 'dungeon',    label: 'Dungeon'    },
        { id: 'wilderness', label: 'Wilderness' },
        { id: 'urban',      label: 'Urban'      },
        { id: 'interior',   label: 'Interior'   },
        { id: 'underwater', label: 'Underwater' },
        { id: 'aerial',     label: 'Aerial'     },
      ],
    };
  }
}
