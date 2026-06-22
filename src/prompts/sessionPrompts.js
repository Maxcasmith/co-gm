/**
 * Prompt builders for in-session AI DM interactions.
 * All functions return plain strings ready to pass to the active provider.
 */

export function buildSceneFramingPrompt(sceneDescription) {
  return `Frame this scene for the players. Write a short, atmospheric opening narration in second person ("You see…", "The air carries…"). Focus exclusively on the senses, What you see, what you hear, what you smell etc. don't make it too long or wordy, keep it short and simple.

Scene: ${sceneDescription}`;
}

export function buildNPCDialoguePrompt(npcName, playerSpeech, additionalContext = '') {
  return `A player says to ${npcName}: "${playerSpeech}"
${additionalContext ? `\nAdditional context: ${additionalContext}` : ''}

Respond in character as ${npcName}. Stay true to their personality, motivation, and what they would and wouldn't reveal. 1–3 sentences of dialogue, optionally followed by a brief action or expression.`;
}

export function buildNoteTakingPrompt(conversationText) {
  return `Summarize the following DM session exchange. Return ONLY valid JSON — no markdown fences, no other text.

{
  "sessionLog": "string — 2–4 sentence summary of what happened narratively",
  "plotUpdates": [
    { "thread": "string — plot thread name", "update": "string — what changed" }
  ],
  "npcUpdates": [
    { "name": "string — NPC name", "update": "string — what was revealed or changed about them" }
  ],
  "newFacts": ["string — any new world fact established in this exchange"]
}

Conversation:
${conversationText}`;
}
