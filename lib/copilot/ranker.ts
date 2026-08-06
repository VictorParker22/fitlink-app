// lib/copilot/ranker.ts
// Global ranking + deduplication + category-variety enforcement.
// Input: flat array of all actions from all clients.
// Output: top 5, deduplicated, varied by category.

import type { CopilotAction } from './types';

export const rankAndDeduplicate = (allActions: CopilotAction[]): CopilotAction[] => {
  // 1. Sort by priority score descending
  const sorted = [...allActions].sort((a, b) => b.priorityScore - a.priorityScore);

  // 2. Deduplicate: one action per client, keep the highest score
  const seenClients = new Set<string>();
  const deduped = sorted.filter(action => {
    if (seenClients.has(action.clientId)) return false;
    seenClients.add(action.clientId);
    return true;
  });

  // 3. Enforce category variety: max 2 of same category in top 5
  const categoryCounts: Record<string, number> = {};
  const varied: CopilotAction[] = [];

  for (const action of deduped) {
    const count = categoryCounts[action.category] ?? 0;
    if (count >= 2) continue; // skip this one, look for variety
    categoryCounts[action.category] = count + 1;
    varied.push(action);
    if (varied.length >= 5) break;
  }

  // 4. Fill remaining slots with next-best (category cap relaxed)
  if (varied.length < 5) {
    for (const action of deduped) {
      if (!varied.find(v => v.id === action.id)) {
        varied.push(action);
        if (varied.length >= 5) break;
      }
    }
  }

  return varied.slice(0, 5);
};
