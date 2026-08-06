export interface PracticeTeam {
  id: string;
  eventItem: string;
  teamNo: string;
  teamName: string;
  members: Array<{ id: string; name: string }>;
}

export interface PracticeMatch {
  id: string;
  slot: number;
  field: number;
  red1: PracticeTeam;
  red2: PracticeTeam;
  blue1: PracticeTeam;
  blue2: PracticeTeam;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function generateExplorerSchedule(
  teams: PracticeTeam[],
  roundsPerTeam: number,
  fieldCount: number,
): PracticeMatch[] | null {
  if (teams.length < 4 || (teams.length * roundsPerTeam) % 4 !== 0) return null;
  const matchCount = (teams.length * roundsPerTeam) / 4;
  let best: { matches: PracticeMatch[]; score: number } | null = null;

  for (let attempt = 0; attempt < 700; attempt += 1) {
    const remaining = new Map(teams.map((team) => [team.id, roundsPerTeam]));
    const lastPlayed = new Map<string, number>();
    const partners = new Map<string, number>();
    const opponents = new Map<string, number>();
    const matches: PracticeMatch[] = [];
    let score = 0;
    let currentSlotTeams = new Set<string>();

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const slot = Math.floor(matchIndex / fieldCount);
      const field = (matchIndex % fieldCount) + 1;
      if (field === 1) currentSlotTeams = new Set<string>();
      const available = shuffled(teams).filter((team) => (remaining.get(team.id) ?? 0) > 0 && !currentSlotTeams.has(team.id));
      const chosen: PracticeTeam[] = [];
      while (chosen.length < 4) {
        const candidates = available.filter((team) => !chosen.some((item) => item.id === team.id));
        if (!candidates.length) break;
        candidates.sort((a, b) => {
          const restA = lastPlayed.get(a.id) === slot - 1 ? 100 : 0;
          const restB = lastPlayed.get(b.id) === slot - 1 ? 100 : 0;
          return restA - restB || (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0) || Math.random() - 0.5;
        });
        chosen.push(candidates[0]);
      }
      if (chosen.length < 4) break;

      let bestOrder = chosen;
      let bestOrderScore = Number.POSITIVE_INFINITY;
      for (let orderAttempt = 0; orderAttempt < 24; orderAttempt += 1) {
        const order = shuffled(chosen);
        const partnerPairs = [[order[0], order[1]], [order[2], order[3]]];
        const opponentPairs = [[order[0], order[2]], [order[0], order[3]], [order[1], order[2]], [order[1], order[3]]];
        const orderScore = partnerPairs.reduce((total, pair) => total + (partners.get(pair.map((team) => team.id).sort().join('|')) ?? 0) * 12, 0)
          + opponentPairs.reduce((total, pair) => total + (opponents.get(pair.map((team) => team.id).sort().join('|')) ?? 0) * 3, 0);
        if (orderScore < bestOrderScore) { bestOrder = order; bestOrderScore = orderScore; }
      }

      const [red1, red2, blue1, blue2] = bestOrder;
      [[red1, red2], [blue1, blue2]].forEach((pair) => {
        const key = pair.map((team) => team.id).sort().join('|');
        partners.set(key, (partners.get(key) ?? 0) + 1);
      });
      [[red1, blue1], [red1, blue2], [red2, blue1], [red2, blue2]].forEach((pair) => {
        const key = pair.map((team) => team.id).sort().join('|');
        opponents.set(key, (opponents.get(key) ?? 0) + 1);
      });
      bestOrder.forEach((team) => {
        if (lastPlayed.get(team.id) === slot - 1) score += 100;
        remaining.set(team.id, (remaining.get(team.id) ?? 0) - 1);
        lastPlayed.set(team.id, slot);
        currentSlotTeams.add(team.id);
      });
      score += bestOrderScore;
      matches.push({ id: `match-${matchIndex + 1}`, slot: slot + 1, field, red1, red2, blue1, blue2 });
    }

    if (matches.length === matchCount && Array.from(remaining.values()).every((count) => count === 0)) {
      if (!best || score < best.score) best = { matches, score };
      if (score === 0) break;
    }
  }
  return best?.matches ?? null;
}
