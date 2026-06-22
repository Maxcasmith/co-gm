import { MODULE_ID } from '../constants.js';

const VAULT_FOLDER_NAME = 'AIDM Vault';

const ENTRY_NAMES = {
  world: 'World & Geography',
  factions: 'Factions',
  plots: 'Active Plots',
  sessionLog: 'Session Log',
  learnedState: 'Learned Enemy State',
};

export class VaultManager {
  static async getOrCreateFolder() {
    let folder = game.folders.find(
      f => f.type === 'JournalEntry' && f.getFlag(MODULE_ID, 'isVault') === true
    );
    if (!folder) {
      folder = await Folder.create({
        name: VAULT_FOLDER_NAME,
        type: 'JournalEntry',
        flags: { [MODULE_ID]: { isVault: true } },
      });
    }
    return folder;
  }

  /**
   * Find a vault entry by its type flag.
   * @param {string} vaultType
   * @returns {JournalEntry | null}
   */
  static getEntryByType(vaultType) {
    return game.journal.find(e => e.getFlag(MODULE_ID, 'vaultType') === vaultType) ?? null;
  }

  /**
   * Write HTML content to a named vault entry, creating it if it doesn't exist.
   * Idempotent — safe to call on re-generation.
   *
   * @param {string} vaultType
   * @param {string} html
   * @returns {Promise<JournalEntry>}
   */
  static async writeEntry(vaultType, html) {
    const folder = await VaultManager.getOrCreateFolder();
    const name = ENTRY_NAMES[vaultType] ?? vaultType;
    const existing = VaultManager.getEntryByType(vaultType);

    if (existing) {
      const page = existing.pages.contents[0];
      if (page) await page.update({ 'text.content': html });
      return existing;
    }

    return JournalEntry.create({
      name,
      folder: folder.id,
      flags: { [MODULE_ID]: { vaultType } },
      pages: [{
        name,
        type: 'text',
        text: {
          content: html,
          format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
        },
      }],
    });
  }

  /**
   * @param {string} vaultType
   * @returns {string | null} Raw HTML content of the first page, or null if not found.
   */
  static getEntryContent(vaultType) {
    return VaultManager.getEntryByType(vaultType)?.pages.contents[0]?.text?.content ?? null;
  }

  /**
   * Write or update a single NPC journal entry.
   * Matched by npcName flag so re-generating updates rather than duplicates.
   *
   * @param {{ name: string, html: string }} npc
   * @returns {Promise<JournalEntry>}
   */
  static async writeNPCEntry({ name, html }) {
    const folder = await VaultManager.getOrCreateFolder();
    const existing = game.journal.find(
      e => e.getFlag(MODULE_ID, 'vaultType') === 'npc'
        && e.getFlag(MODULE_ID, 'npcName') === name
    );

    if (existing) {
      const page = existing.pages.contents[0];
      if (page) await page.update({ 'text.content': html });
      return existing;
    }

    return JournalEntry.create({
      name: `NPC: ${name}`,
      folder: folder.id,
      flags: { [MODULE_ID]: { vaultType: 'npc', npcName: name } },
      pages: [{
        name,
        type: 'text',
        text: {
          content: html,
          format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
        },
      }],
    });
  }

  /** @returns {JournalEntry[]} All NPC vault entries. */
  static getAllNPCEntries() {
    return game.journal.filter(e => e.getFlag(MODULE_ID, 'vaultType') === 'npc');
  }
}
