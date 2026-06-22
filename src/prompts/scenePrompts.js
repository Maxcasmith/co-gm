/** Prompt for generating a Foundry scene from a GM description. */
export function buildSceneGenPrompt({ name, description, size, lighting, sceneType, lightCount }) {
  const sizeHints = {
    small:  '1200 × 900 ft map — one room, tight encounter',
    medium: '2000 × 1500 ft map — multi-room area or courtyard',
    large:  '3000 × 2000 ft map — dungeon wing or village district',
    huge:   '4000 × 3000 ft map — sprawling location or outdoor region',
  };
  const darknessHints = {
    bright:    '0.0 — fully lit, daytime or magical lighting',
    dim:       '0.3 — soft torchlight, overcast exterior',
    dark:      '0.7 — deep dungeon, candlelit cellar',
    pitchblack: '1.0 — complete darkness, only light sources penetrate',
  };

  return `You are generating atmosphere and lighting data for a Foundry VTT scene in an ongoing TTRPG campaign.

Scene name: ${name}
GM description: ${description}
Type: ${sceneType}
Size: ${size} (${sizeHints[size] ?? sizeHints.medium})
Lighting: ${lighting} (darkness ${darknessHints[lighting] ?? darknessHints.dim})
Number of light sources to place: ${lightCount}

Return a single JSON object with NO markdown fences and NO extra keys beyond those listed:
{
  "name": "Final scene name (may refine the GM's suggestion)",
  "description": "2-3 sentences of atmospheric scene description for the GM's screen",
  "backgroundColor": "#hexcolor (choose an evocative dark background — dungeons earthy black/brown, forests dark green, underwater deep blue)",
  "darkness": 0.0 to 1.0,
  "lights": [
    {
      "position": "one of: northwest, north, northeast, west, center, east, southwest, south, southeast",
      "brightRadius": feet (number),
      "dimRadius": feet (number, must be >= brightRadius),
      "color": "#hexcolor",
      "label": "short label e.g. Brazier, Torch, Campfire, Crystal"
    }
  ],
  "mood": "One evocative line describing the scene's feeling — shown to the GM as flavour text",
  "suggestedEncounter": "Brief suggestion for what might be encountered here"
}

Include exactly ${lightCount} entries in the lights array.
Light colour guide: fire/torch #ff6600, cold/ice #88ccff, magic/arcane #9933ff, bioluminescent #33ff99, lava #ff2200, holy #ffffaa`;
}

/**
 * Prompt for generating a D&D 5e NPC stat block.
 * The system prompt (campaign world context) is injected by the caller.
 */
export function buildNPCGenPrompt({ concept, cr, role }) {
  const roleHints = {
    soldier:     'frontline fighter — high STR/CON, melee attacks, moderate INT',
    spellcaster: 'dangerous at range — high INT/WIS/CHA, multiple spell-like actions',
    supporter:   'healer or buffer — high WIS, healing abilities, stays back',
    boss:        'legendary threat — multiattack, 3+ actions, legendary actions, high all-round stats',
    minion:      'weak but numerous — below CR 1, low HP, simple single attack',
  };

  return `You are generating a D&D 5th Edition NPC stat block for a Foundry VTT campaign. Honour the campaign world context in the system prompt when naming and describing this creature.

Concept: ${concept}
Challenge Rating: ${cr}
Role: ${role} — ${roleHints[role] ?? ''}

Return a single JSON object with NO markdown fences. Use exactly these keys:
{
  "name": "Full NPC name",
  "type": "humanoid|undead|beast|fiend|celestial|construct|dragon|elemental|fey|giant|monstrosity|ooze|plant|aberration",
  "subtype": "optional subtype string or empty string",
  "alignment": "e.g. chaotic evil, neutral, lawful good",
  "cr": ${cr},
  "hp": number,
  "hpFormula": "XdY+Z dice formula",
  "ac": number,
  "speed": number (walk speed in ft),
  "str": 1-30,
  "dex": 1-30,
  "con": 1-30,
  "int": 1-30,
  "wis": 1-30,
  "cha": 1-30,
  "resistances": ["fire", "cold", ...] (lowercase dnd5e damage type IDs, empty array if none),
  "immunities": [],
  "vulnerabilities": [],
  "conditionImmunities": ["charmed", "frightened", ...] (empty array if none),
  "senses": "darkvision 60 ft., passive Perception 12 — full senses string",
  "languages": "Common, Elvish — comma-separated or empty string",
  "traits": [{ "name": "Trait Name", "description": "Full trait description." }],
  "actions": [{ "name": "Action Name", "description": "Full action description including attack bonus, range, damage." }],
  "reactions": [{ "name": "Reaction Name", "description": "Description." }],
  "legendaryActions": [{ "name": "Action Name", "description": "Legendary action description." }],
  "biography": "2-3 paragraph narrative: who this creature is, its personality, its role in the world."
}

CR-appropriate guidance:
- CR ${cr} creature should feel genuinely threatening at that tier
- HP should roughly match the CR table (check: CR 1 ≈ 78hp isn't right; CR 5 ≈ 90-110hp is)
- Damage output should match the CR's expected DPR`;
}
