import { SceneGenerator } from '../generators/SceneGenerator.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SceneGenForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static async onGenerate(event, target) {
    if (!game.user.isGM) {
      ui.notifications.error(game.i18n.localize('AIDM.Error.GMOnly'));
      return;
    }
    const form       = target.closest('.aidm-scene-gen-form');
    const name       = form.querySelector('[name="sceneName"]').value.trim();
    const description = form.querySelector('[name="description"]').value.trim();
    const size       = form.querySelector('[name="size"]').value;
    const lighting   = form.querySelector('[name="lighting"]').value;
    const sceneType  = form.querySelector('[name="sceneType"]').value;
    const lightCount = parseInt(form.querySelector('[name="lightCount"]').value, 10) || 2;

    if (!description) {
      ui.notifications.warn(game.i18n.localize('AIDM.SceneGen.Validation.Required'));
      return;
    }

    target.disabled  = true;
    target.textContent = game.i18n.localize('AIDM.SceneGen.Generating');

    try {
      const { scene, data } = await SceneGenerator.generate({
        name: name || description.slice(0, 40),
        description,
        size,
        lighting,
        sceneType,
        lightCount,
      });

      ui.notifications.info(
        game.i18n.format('AIDM.SceneGen.Success', { name: scene.name })
      );

      // Show the GM the narrative description via a chat message
      if (data.description || data.mood) {
        await ChatMessage.create({
          content: `<div class="aidm-narration">
            <strong>${scene.name}</strong><br>
            ${data.description ?? ''}<br><em>${data.mood ?? ''}</em>
            ${data.suggestedEncounter ? `<br><br><strong>Suggested encounter:</strong> ${data.suggestedEncounter}` : ''}
          </div>`,
          speaker: { alias: game.i18n.localize('AIDM.Panel.ChatAlias') },
        });
      }

      await scene.view();
      this.close();
    } catch (err) {
      ui.notifications.error(
        game.i18n.format('AIDM.SceneGen.Error.Failed', { error: err.message })
      );
    } finally {
      target.disabled    = false;
      target.textContent = game.i18n.localize('AIDM.SceneGen.Generate');
    }
  }

  static DEFAULT_OPTIONS = {
    id: 'aidm-scene-gen',
    classes: ['aidm-scene-gen'],
    window: {
      title:     'AIDM.SceneGen.Title',
      icon:      'fa-solid fa-map',
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
        { id: 'small',  label: game.i18n.localize('AIDM.SceneGen.Size.Small'),  active: false },
        { id: 'medium', label: game.i18n.localize('AIDM.SceneGen.Size.Medium'), active: true  },
        { id: 'large',  label: game.i18n.localize('AIDM.SceneGen.Size.Large'),  active: false },
        { id: 'huge',   label: game.i18n.localize('AIDM.SceneGen.Size.Huge'),   active: false },
      ],
      lightings: [
        { id: 'bright',     label: game.i18n.localize('AIDM.SceneGen.Lighting.Bright'),     active: false },
        { id: 'dim',        label: game.i18n.localize('AIDM.SceneGen.Lighting.Dim'),        active: true  },
        { id: 'dark',       label: game.i18n.localize('AIDM.SceneGen.Lighting.Dark'),       active: false },
        { id: 'pitchblack', label: game.i18n.localize('AIDM.SceneGen.Lighting.PitchBlack'), active: false },
      ],
      sceneTypes: [
        { id: 'dungeon',    label: game.i18n.localize('AIDM.SceneGen.Type.Dungeon')    },
        { id: 'wilderness', label: game.i18n.localize('AIDM.SceneGen.Type.Wilderness') },
        { id: 'urban',      label: game.i18n.localize('AIDM.SceneGen.Type.Urban')      },
        { id: 'interior',   label: game.i18n.localize('AIDM.SceneGen.Type.Interior')   },
        { id: 'underwater', label: game.i18n.localize('AIDM.SceneGen.Type.Underwater') },
        { id: 'aerial',     label: game.i18n.localize('AIDM.SceneGen.Type.Aerial')     },
      ],
    };
  }
}
