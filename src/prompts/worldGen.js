/**
 * Builds the world generation prompt from GM-supplied parameters.
 * The LLM is instructed to return strict JSON — no prose wrapper.
 *
 * @param {{
 *   campaignName: string,
 *   theme: string,
 *   tone: string,
 *   gameSystem: string,
 *   playerCount: number,
 *   sessionZeroNotes?: string
 * }} params
 * @returns {string}
 */
export function buildWorldGenPrompt({ campaignName, theme, tone, gameSystem, playerCount, sessionZeroNotes }) {
  const npcCount = Math.max(5, playerCount + 3);
  const factionCount = Math.max(3, Math.ceil(playerCount * 0.75));
  const notesBlock = sessionZeroNotes?.trim()
    ? `\nSession Zero Notes from the GM:\n${sessionZeroNotes.trim()}`
    : '';

  return `You are a master Dungeon Master and world builder. Create a rich, morally complex campaign world.

PARAMETERS
- Campaign Name: ${campaignName}
- Theme / Setting: ${theme}
- Tone: ${tone}
- Game System: ${gameSystem}
- Number of Players: ${playerCount}${notesBlock}

Return ONLY a single valid JSON object — no markdown fences, no explanation, no text before or after. Match this schema exactly:

{
  "world": {
    "name": "string — name of the campaign world",
    "overview": "string — 2–3 paragraph world overview",
    "history": "string — key historical events shaping the present",
    "currentState": "string — what is happening in the world right now"
  },
  "geography": {
    "regions": [
      {
        "name": "string",
        "description": "string",
        "keyLocations": [
          { "name": "string", "description": "string" }
        ]
      }
    ],
    "startingLocation": {
      "name": "string",
      "description": "string — detailed enough to run the first session"
    }
  },
  "factions": [
    {
      "name": "string",
      "description": "string",
      "goals": "string",
      "methods": "string",
      "relationships": {
        "allied": ["faction names"],
        "hostile": ["faction names"],
        "neutral": ["faction names"]
      }
    }
  ],
  "npcs": [
    {
      "name": "string",
      "role": "string — their role in the world",
      "race": "string",
      "occupation": "string",
      "personality": "string — 2–3 defining traits",
      "motivation": "string — what drives them",
      "secret": "string — something they are hiding",
      "knowledge": "string — useful information they possess",
      "factionAffiliation": "string or null",
      "relationships": [
        { "name": "string — another NPC name", "nature": "string" }
      ],
      "statStub": {
        "cr": "string",
        "hp": "string",
        "ac": "string",
        "notable": "string — one or two notable abilities"
      }
    }
  ],
  "plot": {
    "incitingIncident": "string — the event that pulls all ${playerCount} players into the story",
    "centralConflict": "string — the core tension or threat",
    "act1": "string — discovery and setup",
    "act2": "string — complications and rising stakes",
    "act3": "string — climax and resolution possibilities",
    "sessionZeroHooks": ["string — a hook tying a player's backstory to the world"],
    "openQuestions": ["string — an unresolved mystery to discover in play"]
  }
}

Requirements:
- Generate exactly ${factionCount} factions and ${npcCount} key NPCs.
- Every NPC must have a factionAffiliation or a stated reason for operating independently.
- The inciting incident must give all ${playerCount} players a personal reason to engage.
- At least ${playerCount} sessionZeroHooks — one per player.
- At least 3 openQuestions.
- Make the world feel lived-in: conflicting factions, morally ambiguous NPCs, history that bleeds into the present.`;
}
