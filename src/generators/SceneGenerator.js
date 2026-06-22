import { getActiveProvider } from '../providers/registry.js';
import { buildSceneGenPrompt } from '../prompts/scenePrompts.js';
import { ContextBuilder } from '../ai/ContextBuilder.js';

const SCENE_SIZES = {
  small:  { width: 1200, height:  900 },
  medium: { width: 2000, height: 1500 },
  large:  { width: 3000, height: 2000 },
  huge:   { width: 4000, height: 3000 },
};

// Named positions → fractional (x, y) within the scene rect
const LIGHT_POSITIONS = {
  northwest: [0.15, 0.15],
  north:     [0.50, 0.15],
  northeast: [0.85, 0.15],
  west:      [0.15, 0.50],
  center:    [0.50, 0.50],
  east:      [0.85, 0.50],
  southwest: [0.15, 0.85],
  south:     [0.50, 0.85],
  southeast: [0.85, 0.85],
};

export class SceneGenerator {
  /**
   * Run the full generation pipeline: prompt → parse → create Foundry Scene.
   *
   * @param {{ name, description, size, lighting, sceneType, lightCount }} params
   * @returns {Promise<{ scene: Scene, data: object }>}
   */
  static async generate(params) {
    const provider = getActiveProvider();
    if (!provider) throw new Error('No LLM provider configured. Open AI DM Settings first.');

    const systemPrompt = await ContextBuilder.buildSystemPrompt();
    const prompt       = buildSceneGenPrompt(params);

    const { content } = await provider.complete(prompt, {
      systemPrompt,
      maxTokens: 800,
      temperature: 0.8,
    });

    const raw = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Could not parse the AI scene response as JSON. Try again.');
    }

    return this._createScene(data, params.size);
  }

  static async _createScene(data, sizeCategory) {
    const { width, height } = SCENE_SIZES[sizeCategory] ?? SCENE_SIZES.medium;
    const gridSize     = 100;
    const gridDistance = 5;

    const scene = await Scene.create({
      name:            data.name ?? 'Generated Scene',
      width,
      height,
      grid: {
        type:     CONST.GRID_TYPES?.SQUARE ?? 1,
        size:     gridSize,
        distance: gridDistance,
        units:    'ft',
      },
      backgroundColor: this._safeColor(data.backgroundColor, '#111111'),
      darkness:        Math.min(1, Math.max(0, data.darkness ?? 0.5)),
      padding:         0.1,
    });

    // Perimeter walls — solid stone around the whole scene
    await scene.createEmbeddedDocuments('Wall', [
      { c: [0, 0, width, 0] },
      { c: [width, 0, width, height] },
      { c: [width, height, 0, height] },
      { c: [0, height, 0, 0] },
    ]);

    // Light sources placed at named positions
    if (data.lights?.length) {
      const lightDocs = (data.lights ?? []).map(l => {
        const frac  = LIGHT_POSITIONS[l.position?.toLowerCase()] ?? LIGHT_POSITIONS.center;
        const color = this._safeColor(l.color, '#ff6600');
        return {
          x: Math.round(width  * frac[0]),
          y: Math.round(height * frac[1]),
          config: {
            bright:    Number(l.brightRadius) || 20,
            dim:       Number(l.dimRadius)    || 40,
            color,
            alpha:     0.5,
            animation: { type: 'flame', speed: 5, intensity: 5 },
          },
          label: l.label ?? '',
        };
      });
      await scene.createEmbeddedDocuments('AmbientLight', lightDocs);
    }

    return { scene, data };
  }

  static _safeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback;
  }
}
