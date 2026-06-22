import { MODULE_ID } from '../constants.js';
import { VaultManager } from '../vault/VaultManager.js';

// How much of the session log to include before truncating oldest entries
const SESSION_LOG_MAX_CHARS = 3000;

export class ContextBuilder {
  /**
   * Build the full AI DM system prompt from vault state and current party.
   * Safe to call when vault is empty — each section is conditional.
   * @returns {Promise<string>}
   */
  static async buildSystemPrompt() {
    const [worldHtml, factionsHtml, plotsHtml, sessionLogHtml] = [
      VaultManager.getEntryContent('world'),
      VaultManager.getEntryContent('factions'),
      VaultManager.getEntryContent('plots'),
      VaultManager.getEntryContent('sessionLog'),
    ];

    const sections = [
      `You are the Dungeon Master for this campaign. Drive the narrative, play all NPCs authentically, and create a compelling collaborative story.`,
      worldHtml   ? `## World\n${stripHtml(worldHtml)}` : null,
      factionsHtml ? `## Factions\n${stripHtml(factionsHtml)}` : null,
      plotsHtml   ? `## Active Plots\n${stripHtml(plotsHtml)}` : null,
      sessionLogHtml ? `## Recent Session Notes\n${trimLog(stripHtml(sessionLogHtml))}` : null,
      buildPartyBlock(),
      `## Guidelines
- Write scene descriptions in vivid second-person ("You see…", "The air smells of…").
- Play NPCs true to their personality, motivation, and secrets — never break character or reveal a secret unless dramatically earned.
- Escalate tension naturally; reward clever and roleplay-driven solutions.
- Maintain strict consistency with established world facts.
- When the GM asks you to take notes, return structured JSON as specified.`,
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  /**
   * Build a system prompt scoped to a specific NPC.
   * Appends the NPC's full vault entry and instructs the AI to embody them.
   * @param {string} npcName
   * @returns {Promise<string>}
   */
  static async buildNPCSystemPrompt(npcName) {
    const base = await ContextBuilder.buildSystemPrompt();
    const npcEntry = VaultManager.getAllNPCEntries().find(
      e => e.getFlag(MODULE_ID, 'npcName') === npcName
    );
    const npcHtml = npcEntry?.pages.contents[0]?.text?.content;
    if (!npcHtml) return base;

    return `${base}\n\n## You Are ${npcName}\n${stripHtml(npcHtml)}\n\nRespond ONLY as ${npcName}. Do not break character or refer to yourself as an AI. Reveal secrets only if dramatically warranted.`;
  }
}

// ---------------------------------------------------------------------------

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function trimLog(log) {
  if (log.length <= SESSION_LOG_MAX_CHARS) return log;
  return `[…earlier entries omitted…]\n${log.slice(-SESSION_LOG_MAX_CHARS)}`;
}

function buildPartyBlock() {
  const characters = game.actors?.filter(a => a.hasPlayerOwner && a.type === 'character') ?? [];
  if (!characters.length) return null;

  const lines = characters.map(a => {
    const hp = a.system?.attributes?.hp;
    const hpStr = hp ? ` (HP ${hp.value}/${hp.max})` : '';
    return `- ${a.name}${hpStr}`;
  });

  return `## Party\n${lines.join('\n')}`;
}
