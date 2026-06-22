import { VaultManager } from './VaultManager.js';

/**
 * Top-level entry point — takes parsed world gen JSON and writes it to vault entries.
 * @param {object} worldData
 */
export async function writeWorldToVault(worldData) {
  await Promise.all([
    VaultManager.writeEntry('world', formatWorldAndGeography(worldData.world, worldData.geography)),
    VaultManager.writeEntry('factions', formatFactions(worldData.factions ?? [])),
    VaultManager.writeEntry('plots', formatPlots(worldData.plot)),
  ]);

  for (const npc of worldData.npcs ?? []) {
    await VaultManager.writeNPCEntry({ name: npc.name, html: formatNPC(npc) });
  }
}

// ---------------------------------------------------------------------------
// Formatters — convert parsed JSON into vault HTML
// ---------------------------------------------------------------------------

function formatWorldAndGeography(world, geography) {
  const regions = (geography.regions ?? []).map(r => {
    const locations = (r.keyLocations ?? [])
      .map(l => `<li><strong>${l.name}</strong> — ${l.description}</li>`)
      .join('');
    return `
      <h3>${r.name}</h3>
      <p>${r.description}</p>
      ${locations ? `<ul>${locations}</ul>` : ''}
    `;
  }).join('');

  return `
    <h1>${world.name}</h1>

    <h2>Overview</h2>
    <p>${world.overview}</p>

    <h2>History</h2>
    <p>${world.history}</p>

    <h2>Current State</h2>
    <p>${world.currentState}</p>

    <h2>Starting Location — ${geography.startingLocation?.name ?? 'Unknown'}</h2>
    <p>${geography.startingLocation?.description ?? ''}</p>

    <h2>Regions</h2>
    ${regions}
  `.trim();
}

function formatFactions(factions) {
  return factions.map(f => {
    const rel = f.relationships ?? {};
    const allied = (rel.allied ?? []).join(', ');
    const hostile = (rel.hostile ?? []).join(', ');
    const neutral = (rel.neutral ?? []).join(', ');

    return `
      <h2>${f.name}</h2>
      <p>${f.description}</p>
      <p><strong>Goals:</strong> ${f.goals}</p>
      <p><strong>Methods:</strong> ${f.methods}</p>
      ${allied ? `<p><strong>Allied with:</strong> ${allied}</p>` : ''}
      ${hostile ? `<p><strong>Hostile to:</strong> ${hostile}</p>` : ''}
      ${neutral ? `<p><strong>Neutral toward:</strong> ${neutral}</p>` : ''}
      <hr />
    `;
  }).join('');
}

function formatPlots(plot) {
  const hooks = (plot.sessionZeroHooks ?? []).map(h => `<li>${h}</li>`).join('');
  const questions = (plot.openQuestions ?? []).map(q => `<li>${q}</li>`).join('');

  return `
    <h1>Campaign Plot</h1>

    <h2>Inciting Incident</h2>
    <p>${plot.incitingIncident}</p>

    <h2>Central Conflict</h2>
    <p>${plot.centralConflict}</p>

    <h2>Act 1 — Discovery</h2>
    <p>${plot.act1}</p>

    <h2>Act 2 — Escalation</h2>
    <p>${plot.act2}</p>

    <h2>Act 3 — Climax</h2>
    <p>${plot.act3}</p>

    <h2>Session Zero Hooks</h2>
    <ul>${hooks}</ul>

    <h2>Open Questions</h2>
    <ul>${questions}</ul>
  `.trim();
}

function formatNPC(npc) {
  const relationships = (npc.relationships ?? [])
    .map(r => `<li><strong>${r.name}</strong> — ${r.nature}</li>`)
    .join('');

  const stub = npc.statStub ?? {};

  return `
    <h1>${npc.name}</h1>
    <p><em>${npc.race} ${npc.occupation}${npc.factionAffiliation ? ` · ${npc.factionAffiliation}` : ''}</em></p>
    <p><strong>Role:</strong> ${npc.role}</p>

    <h2>Personality</h2>
    <p>${npc.personality}</p>

    <h2>Motivation</h2>
    <p>${npc.motivation}</p>

    <h2>Secret</h2>
    <p>${npc.secret}</p>

    <h2>Knowledge</h2>
    <p>${npc.knowledge}</p>

    ${relationships ? `<h2>Relationships</h2><ul>${relationships}</ul>` : ''}

    <h2>Stat Stub</h2>
    <p>
      <strong>CR:</strong> ${stub.cr ?? '—'} &nbsp;|&nbsp;
      <strong>HP:</strong> ${stub.hp ?? '—'} &nbsp;|&nbsp;
      <strong>AC:</strong> ${stub.ac ?? '—'}
    </p>
    <p><strong>Notable:</strong> ${stub.notable ?? '—'}</p>
  `.trim();
}
