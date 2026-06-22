import { MODULE_ID } from '../constants.js';
import { DMBrain } from '../ai/DMBrain.js';
import { NoteTaker } from '../ai/NoteTaker.js';
import { ContextBuilder } from '../ai/ContextBuilder.js';
import { VaultManager } from '../vault/VaultManager.js';
import { buildSceneFramingPrompt } from '../prompts/sessionPrompts.js';
import { CombatAI } from '../combat/CombatAI.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DMPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {DMPanel | null} */
  static instance = null;

  static open() {
    if (!game.user.isGM) return null;
    if (!DMPanel.instance) DMPanel.instance = new DMPanel();
    DMPanel.instance.render({ force: true });
    return DMPanel.instance;
  }

  // ---------------------------------------------------------------------------
  // Static action handlers
  // Note: 'this' is the DMPanel instance when called by ApplicationV2
  // ---------------------------------------------------------------------------

  static async onSend(event, target) {
    const input = this.element.querySelector('#aidm-input');
    const text = input?.value.trim();
    if (!text || this._sending) return;
    input.value = '';
    await this._dispatch(text);
  }

  static async onFrameScene(event, target) {
    const input = this.element.querySelector('#aidm-input');
    const description = input?.value.trim();
    if (!description) {
      ui.notifications.warn(game.i18n.localize('AIDM.Panel.FrameScene.EmptyHint'));
      return;
    }
    input.value = '';
    await this._dispatch(buildSceneFramingPrompt(description), { userLabel: 'Scene' });
  }

  static async onSetMode(event, target) {
    this._mode = target.dataset.mode ?? 'narrative';
    await this.render();
  }

  static async onRefreshContext(event, target) {
    await this.brain.refreshSystemPrompt();
    ui.notifications.info(game.i18n.localize('AIDM.Panel.ContextRefreshed'));
  }

  static async onTakeNotes(event, target) {
    if (!this.brain.history.length) {
      ui.notifications.warn(game.i18n.localize('AIDM.Panel.Notes.EmptyHint'));
      return;
    }
    this._push('system', 'Scribe', game.i18n.localize('AIDM.Panel.Notes.Taking'));
    await this.render();

    try {
      const notes = await NoteTaker.takeNotes(this.brain);
      this._pop();
      const summary = notes?.sessionLog ?? game.i18n.localize('AIDM.Panel.Notes.NoContent');
      this._push('system', 'Scribe', `Notes saved: ${summary}`);
    } catch (err) {
      this._pop();
      this._push('system', 'Error', err.message);
    }

    await this.render();
  }

  static async onSendToChat(event, target) {
    const id = parseInt(target.dataset.msgId, 10);
    const msg = this._history.find(m => m.id === id);
    if (!msg) return;
    await ChatMessage.create({
      content: `<div class="aidm-narration">${msg.content.replace(/\n/g, '<br>')}</div>`,
      speaker: { alias: game.i18n.localize('AIDM.Panel.ChatAlias') },
      flags: { [MODULE_ID]: { isDMNarration: true } },
    });
  }

  static async onClearHistory(event, target) {
    this.brain.clearHistory();
    this._history = [];
    this._nextId = 0;
    await this.render();
  }

  /**
   * Manually trigger an AI turn for the current combatant.
   * Useful when AI auto-run is off and the GM wants to drive NPC turns one-by-one.
   */
  static async onRunAITurn(event, target) {
    const combat = game.combat;
    if (!combat) {
      ui.notifications.warn(game.i18n.localize('AIDM.Combat.NoCombat'));
      return;
    }
    const combatant = combat.combatant;
    if (!combatant) {
      ui.notifications.warn(game.i18n.localize('AIDM.Combat.NoActiveCombatant'));
      return;
    }
    if (combatant.actor?.hasPlayerOwner) {
      ui.notifications.warn(game.i18n.localize('AIDM.Combat.PlayerTurn'));
      return;
    }

    target.disabled = true;
    const originalHTML = target.innerHTML;
    target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      const outcome = await CombatAI.getInstance().executeTurn(combatant, combat);
      if (outcome) {
        const narration = outcome.narration ?? outcome.result.narrative;
        this._push('assistant', combatant.name, narration, { canSend: true });
        await this.render();
      }
    } catch (err) {
      ui.notifications.error(`AI Combat Error: ${err.message}`);
    } finally {
      target.disabled = false;
      target.innerHTML = originalHTML;
    }
  }

  // ---------------------------------------------------------------------------

  static DEFAULT_OPTIONS = {
    id: 'aidm-dm-panel',
    classes: ['aidm-dm-panel'],
    window: {
      title: 'AIDM.Panel.Title',
      icon: 'fa-solid fa-dragon',
      resizable: true,
    },
    position: { width: 440, height: 620 },
    actions: {
      send:           DMPanel.onSend,
      frameScene:     DMPanel.onFrameScene,
      setMode:        DMPanel.onSetMode,
      refreshContext:  DMPanel.onRefreshContext,
      takeNotes:      DMPanel.onTakeNotes,
      sendToChat:     DMPanel.onSendToChat,
      clearHistory:   DMPanel.onClearHistory,
      runAITurn:      DMPanel.onRunAITurn,
    },
  };

  static PARTS = {
    panel: { template: 'modules/ai-vtt/templates/dm-panel.hbs' },
  };

  // ---------------------------------------------------------------------------

  constructor(options = {}) {
    super(options);
    this.brain = new DMBrain();
    this._mode = 'narrative';
    this._selectedNPC = null;
    this._history = [];
    this._nextId = 0;
    this._sending = false;
  }

  async _prepareContext(_options) {
    const npcs = VaultManager.getAllNPCEntries().map(e => ({
      name: e.getFlag(MODULE_ID, 'npcName'),
      selected: e.getFlag(MODULE_ID, 'npcName') === this._selectedNPC,
    }));

    const isNPCMode = this._mode === 'npc';
    // Default selected NPC to first in list when switching into NPC mode
    if (isNPCMode && !this._selectedNPC && npcs.length) {
      this._selectedNPC = npcs[0].name;
      npcs[0].selected = true;
    }

    return {
      history: this._history,
      isNarrativeMode: this._mode === 'narrative',
      isNPCMode,
      npcs,
      placeholder: isNPCMode
        ? game.i18n.localize('AIDM.Panel.Input.NPCPlaceholder')
        : game.i18n.localize('AIDM.Panel.Input.NarrativePlaceholder'),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Enter sends, Shift+Enter inserts newline
    this.element.querySelector('#aidm-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.element.querySelector('[data-action="send"]')?.click();
      }
    });

    // Keep NPC selection in sync with the select element
    this.element.querySelector('#aidm-npc-select')?.addEventListener('change', (e) => {
      this._selectedNPC = e.target.value || null;
    });

    this._scrollHistory();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  async _dispatch(text, opts = {}) {
    if (this._sending) return;
    this._sending = true;

    const userLabel = opts.userLabel
      ?? (this._mode === 'npc' && this._selectedNPC ? `→ ${this._selectedNPC}` : 'GM');

    this._push('user', userLabel, text);
    this._push('assistant', 'DM', '…');
    await this.render();

    try {
      let systemPromptOverride;
      if (this._mode === 'npc' && this._selectedNPC) {
        systemPromptOverride = await ContextBuilder.buildNPCSystemPrompt(this._selectedNPC);
      }

      const response = await this.brain.chat(text, { systemPromptOverride });
      this._pop();
      const label = this._mode === 'npc' && this._selectedNPC ? this._selectedNPC : 'DM';
      this._push('assistant', label, response, { canSend: true });
    } catch (err) {
      this._pop();
      this._push('system', 'Error', err.message);
    } finally {
      this._sending = false;
      if (this.rendered) await this.render();
    }
  }

  _push(role, label, content, opts = {}) {
    this._history.push({
      id: this._nextId++,
      role,
      label,
      content,
      canSend: opts.canSend ?? false,
    });
  }

  _pop() {
    this._history.pop();
  }

  _scrollHistory() {
    const el = this.element?.querySelector('#aidm-history');
    if (el) el.scrollTop = el.scrollHeight;
  }
}
