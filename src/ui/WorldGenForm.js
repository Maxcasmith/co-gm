import { MODULE_ID } from '../constants.js';
import { buildWorldGenPrompt } from '../prompts/worldGen.js';
import { writeWorldToVault } from '../vault/VaultWriter.js';
import { getActiveProvider } from '../providers/registry.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TONES = [
  { value: 'heroic',  label: 'Heroic & High Adventure' },
  { value: 'gritty',  label: 'Dark & Gritty' },
  { value: 'horror',  label: 'Horror' },
  { value: 'mystery', label: 'Mystery & Intrigue' },
  { value: 'epic',    label: 'Epic & Mythic' },
  { value: 'comedic', label: 'Lighthearted & Comedic' },
];

export class WorldGenForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static async onGenerate(event, target) {
    if (!game.user.isGM) {
      ui.notifications.error('This action is only available to the Game Master.');
      return;
    }
    const form = target.closest('.aidm-world-gen-form');
    const data = {
      campaignName:     form.querySelector('[name="campaignName"]').value.trim(),
      theme:            form.querySelector('[name="theme"]').value.trim(),
      tone:             form.querySelector('[name="tone"]').value,
      gameSystem:       form.querySelector('[name="gameSystem"]').value.trim(),
      playerCount:      parseInt(form.querySelector('[name="playerCount"]').value, 10),
      sessionZeroNotes: form.querySelector('[name="sessionZeroNotes"]').value.trim(),
    };

    if (!data.campaignName || !data.theme) {
      ui.notifications.warn('Campaign name and theme are required.');
      return;
    }

    const provider = getActiveProvider();
    if (!provider) {
      ui.notifications.error('No LLM provider configured. Open AI DM Settings first.');
      return;
    }

    target.disabled  = true;
    target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';

    try {
      const prompt = buildWorldGenPrompt(data);
      const { content } = await provider.complete(prompt, { maxTokens: 8000, temperature: 0.9 });

      let worldData;
      try {
        const raw = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        worldData = JSON.parse(raw);
      } catch {
        throw new Error('The AI response could not be parsed as JSON. Try again.');
      }

      await writeWorldToVault(worldData);
      ui.notifications.info('World generated and saved to the AIDM Vault.');
      this.close();

      // Switch to journal sidebar so the GM sees the vault immediately
      ui.sidebar.activateTab('journal');
    } catch (err) {
      console.error(`${MODULE_ID} | World generation failed`, err);
      ui.notifications.error(`World generation failed: ${err.message}`);
    } finally {
      target.disabled  = false;
      target.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate World';
    }
  }

  static DEFAULT_OPTIONS = {
    id: 'aidm-world-gen',
    classes: ['aidm-world-gen'],
    window: {
      title: 'Generate Campaign World',
      icon: 'fa-solid fa-wand-magic-sparkles',
      resizable: false,
    },
    position: {
      width: 520,
      height: 'auto',
    },
    actions: {
      generate: WorldGenForm.onGenerate,
    },
  };

  static PARTS = {
    form: {
      template: 'modules/ai-vtt/templates/world-gen.hbs',
    },
  };

  async _prepareContext(_options) {
    return {
      campaignName:     '',
      theme:            '',
      tones:            TONES.map((t, i) => ({ ...t, active: i === 0 })),
      gameSystem:       game.system?.title ?? '',
      playerCount:      4,
      sessionZeroNotes: '',
    };
  }
}
