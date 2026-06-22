import { getActiveProvider } from '../providers/registry.js';
import { buildNPCGenPrompt } from '../prompts/scenePrompts.js';
import { ContextBuilder } from '../ai/ContextBuilder.js';

/**
 * Generates a Foundry Actor document from an AI-produced stat block.
 *
 * Currently targets the dnd5e system. If game.system.id is not 'dnd5e',
 * the actor is created as a generic Actor with minimal data and the full
 * AI JSON stored in the biography. Other system adapters should extend this.
 *
 * Assumptions to verify:
 * - AmbientLight bright/dim values are in scene distance units (feet), not grid squares.
 * - dnd5e v3.x Actor schema fields (abilities, attributes.ac.flat, etc.) are stable.
 * - dnd5e 'feat' item type accepts system.activation.type = 'action'.
 */
export class ActorGenerator {
  /**
   * @param {{ concept: string, cr: number, role: string }} params
   * @returns {Promise<Actor>}
   */
  static async generate(params) {
    const provider = getActiveProvider();
    if (!provider) throw new Error(game.i18n.localize('AIDM.SceneGen.Error.NoProvider'));

    const systemPrompt = await ContextBuilder.buildSystemPrompt();
    const prompt       = buildNPCGenPrompt(params);

    const { content } = await provider.complete(prompt, {
      systemPrompt,
      maxTokens: 1500,
      temperature: 0.75,
    });

    const raw = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(game.i18n.localize('AIDM.ActorGen.Error.ParseFailed'));
    }

    if (game.system?.id === 'dnd5e') {
      return this._createDnD5eActor(data);
    }
    return this._createGenericActor(data);
  }

  // ---------------------------------------------------------------------------
  // D&D 5e actor creation
  // ---------------------------------------------------------------------------

  static async _createDnD5eActor(data) {
    const actor = await Actor.create({
      name: data.name ?? 'Generated NPC',
      type: 'npc',
      img:  'icons/svg/mystery-man.svg',
      system: {
        abilities: {
          str: { value: data.str ?? 10 },
          dex: { value: data.dex ?? 10 },
          con: { value: data.con ?? 10 },
          int: { value: data.int ?? 10 },
          wis: { value: data.wis ?? 10 },
          cha: { value: data.cha ?? 10 },
        },
        attributes: {
          hp: {
            value:   data.hp ?? 10,
            max:     data.hp ?? 10,
            formula: data.hpFormula ?? '',
          },
          ac:       { flat: data.ac ?? 10, calc: 'flat' },
          movement: { walk: data.speed ?? 30, units: 'ft' },
        },
        details: {
          cr:        data.cr ?? 1,
          type: {
            value:   data.type    ?? 'humanoid',
            subtype: data.subtype ?? '',
          },
          alignment: data.alignment ?? '',
          biography: { value: this._buildBiographyHtml(data) },
        },
        traits: {
          dr: { value: this._normalizeDmgTypes(data.resistances)      },
          di: { value: this._normalizeDmgTypes(data.immunities)       },
          dv: { value: this._normalizeDmgTypes(data.vulnerabilities)  },
          ci: { value: data.conditionImmunities ?? []                 },
          senses: { special: data.senses ?? '' },
          languages: {
            value: this._parseLanguages(data.languages),
            custom: '',
          },
        },
      },
      prototypeToken: {
        name:        data.name ?? 'NPC',
        displayName: CONST.TOKEN_DISPLAY_MODES.OWNER,
        disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
        actorLink:   false,
        sight:       { enabled: false },
      },
    });

    // Create Feature items for traits and actions
    const items = [
      ...this._buildFeatureItems(data.traits      ?? [], 'passive'),
      ...this._buildFeatureItems(data.actions     ?? [], 'action'),
      ...this._buildFeatureItems(data.reactions   ?? [], 'reaction'),
      ...this._buildFeatureItems(data.legendaryActions ?? [], 'legendary'),
    ];
    if (items.length) await actor.createEmbeddedDocuments('Item', items);

    return actor;
  }

  // ---------------------------------------------------------------------------
  // Generic fallback for other game systems
  // ---------------------------------------------------------------------------

  static async _createGenericActor(data) {
    return Actor.create({
      name: data.name ?? 'Generated NPC',
      type: 'npc',
      img:  'icons/svg/mystery-man.svg',
      system: {
        details: {
          biography: {
            value: `<pre>${JSON.stringify(data, null, 2)}</pre>`,
          },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  static _buildBiographyHtml(data) {
    const sections = [];

    if (data.biography) {
      sections.push(`<h2>Background</h2><p>${data.biography.replace(/\n/g, '</p><p>')}</p>`);
    }

    if (data.senses || data.languages) {
      const details = [data.senses, data.languages ? `Languages: ${data.languages}` : '']
        .filter(Boolean).join(' | ');
      sections.push(`<p><em>${details}</em></p>`);
    }

    return sections.join('\n');
  }

  static _buildFeatureItems(list, activationType) {
    const typeMap = {
      passive:   'passive',
      action:    'action',
      reaction:  'reaction',
      legendary: 'legendary',
    };
    return list.map((entry, i) => ({
      name:   entry.name ?? `Feature ${i + 1}`,
      type:   'feat',
      system: {
        description:  { value: `<p>${entry.description ?? ''}</p>` },
        activation:   {
          type:      typeMap[activationType] ?? 'passive',
          cost:      activationType === 'action' ? 1 : null,
          condition: '',
        },
        requirements: '',
      },
    }));
  }

  static _normalizeDmgTypes(list) {
    if (!Array.isArray(list)) return [];
    // dnd5e damage type IDs are lowercase: fire, cold, bludgeoning, etc.
    return list.map(t => String(t).toLowerCase().trim()).filter(Boolean);
  }

  static _parseLanguages(str) {
    if (!str) return [];
    return str.split(',')
      .map(l => l.trim().toLowerCase())
      .filter(Boolean)
      .map(l => l.replace(/\s+/g, '-'));
  }
}
