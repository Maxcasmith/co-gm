/**
 * Prompt builder for in-combat LLM narration.
 * The AI is NOT in the decision loop — it only flavours the already-decided action.
 */
export function buildCombatNarrationPrompt(creatureName, action, result) {
  const actionName = action.name.split(' →')[0].trim();
  let outcomeStr;
  if (result.damage < 0)       outcomeStr = `restores ${-result.damage} HP`;
  else if (!result.hit)        outcomeStr = 'misses';
  else if (result.damage === 0) outcomeStr = 'hits but deals no damage';
  else                          outcomeStr = `hits for ${result.damage} damage`;

  return `Write 1–2 sentences of dramatic in-world narration for this combat action. No dice numbers. No mechanical language. Match the established tone of the campaign.

Creature: ${creatureName}
Action: ${actionName}
Outcome: ${creatureName} ${outcomeStr}
Context: ${result.narrative}

Narration:`;
}
