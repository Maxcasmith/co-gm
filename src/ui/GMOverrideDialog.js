/**
 * Presents the GM with the AI's chosen action before it executes.
 * Returns 'approve' to proceed or 'skip' to pass the turn.
 *
 * Uses Foundry v13 DialogV2. Falls back to auto-approve if the dialog API
 * is unavailable or throws (so combat is never silently blocked).
 */
export class GMOverrideDialog {
  /**
   * @param {object} combatantSnap  BattleState combatant snapshot
   * @param {object} chosen         Chosen ScoredAction (with refinedScore)
   * @param {number} threshold      INT gate threshold used this turn
   * @returns {Promise<'approve' | 'skip'>}
   */
  static async prompt(combatantSnap, chosen, threshold) {
    const actionName = chosen.name.split(' →')[0].trim();
    const targetPart = chosen.name.includes('→') ? chosen.name.split('→').pop().trim() : null;
    const score      = chosen.refinedScore ?? chosen.baseScore;

    const content = `
      <div class="aidm-override-dialog" style="padding: 4px 0;">
        <p style="margin:0 0 8px">
          <strong>${combatantSnap.name}</strong> is about to take their turn.
        </p>
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <tr>
            <td style="padding:2px 6px; color:var(--color-text-dark-secondary)">Action</td>
            <td style="padding:2px 6px;"><strong>${actionName}</strong></td>
          </tr>
          ${targetPart ? `<tr>
            <td style="padding:2px 6px; color:var(--color-text-dark-secondary)">Target</td>
            <td style="padding:2px 6px;">${targetPart}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:2px 6px; color:var(--color-text-dark-secondary)">AI Score</td>
            <td style="padding:2px 6px;">${score} / ${threshold} (threshold)</td>
          </tr>
          <tr>
            <td style="padding:2px 6px; color:var(--color-text-dark-secondary)">Type</td>
            <td style="padding:2px 6px;">${chosen.type}</td>
          </tr>
        </table>
        <p style="margin:8px 0 0; font-size:11px; color:var(--color-text-dark-secondary);">
          Approve to execute. Skip to pass the turn without acting.
        </p>
      </div>
    `;

    try {
      const DialogV2 = foundry.applications.api?.DialogV2;
      if (!DialogV2) return 'approve'; // API not available — auto-approve

      const result = await DialogV2.wait({
        window:      { title: `AI Turn — ${combatantSnap.name}` },
        content,
        rejectClose: false,
        buttons: [
          {
            action:  'approve',
            label:   game.i18n.localize('AIDM.Override.Approve'),
            icon:    'fa-solid fa-check',
            default: true,
          },
          {
            action: 'skip',
            label:  game.i18n.localize('AIDM.Override.Skip'),
            icon:   'fa-solid fa-forward',
          },
        ],
      });
      return result ?? 'skip';
    } catch {
      // Dialog error — auto-approve so combat never silently stalls
      return 'approve';
    }
  }
}
