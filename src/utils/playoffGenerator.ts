import type { Alliance, PlayoffMatch, PlayoffPrediction, TeamRanked } from '../types';

interface AllianceDraft {
  number: number;
  team1: string;
  team2: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTeamCode(teamName: string): string | undefined {
  const matched = teamName.match(/^\d+/);
  return matched?.[0];
}

function formatAllianceName(number: number): string {
  return `联盟 ${number}`;
}

function formatOutlook(powerScore: number): string {
  if (powerScore >= 210) return '冠军核心';
  if (powerScore >= 185) return '强势上半区';
  if (powerScore >= 165) return '有机会冲奖牌';
  return '需要爆冷发挥';
}

function getAlliancePowerScore(
  totalEPA: number,
  totalScore: number,
  totalNetScore: number,
  totalWinLossScore: number,
  seedSum: number,
): number {
  const seedBonus = Math.max(0, 18 - seedSum) * 1.2;

  return Number(
    (
      totalEPA * 0.8
      + totalScore / 30
      + totalNetScore / 90
      + totalWinLossScore * 1.8
      + seedBonus
    ).toFixed(2),
  );
}

function buildAlliance(
  draft: AllianceDraft,
  rankedTeams: TeamRanked[],
): Alliance {
  const team1 = rankedTeams.find((team) => team.team === draft.team1);
  const team2 = rankedTeams.find((team) => team.team === draft.team2);

  if (!team1 || !team2) {
    throw new Error(`联盟 ${draft.number} 的队伍不在当前晋级队伍范围内。`);
  }

  const team1Seed = rankedTeams.findIndex((team) => team.team === team1.team) + 1;
  const team2Seed = rankedTeams.findIndex((team) => team.team === team2.team) + 1;
  const team1EPA = parseFloat(team1.epa) || 0;
  const team2EPA = parseFloat(team2.epa) || 0;
  const totalEPA = team1EPA + team2EPA;
  const totalNetScore = team1.netScore + team2.netScore;
  const totalWinLossScore = team1.totalWinLossScore + team2.totalWinLossScore;
  const totalScore = team1.totalScore + team2.totalScore;
  const powerScore = getAlliancePowerScore(
    totalEPA,
    totalScore,
    totalNetScore,
    totalWinLossScore,
    team1Seed + team2Seed,
  );

  return {
    number: draft.number,
    name: formatAllianceName(draft.number),
    team1: team1.team,
    team2: team2.team,
    team1Code: getTeamCode(team1.team),
    team2Code: getTeamCode(team2.team),
    team1Seed,
    team2Seed,
    team1EPA: team1EPA.toFixed(2),
    team2EPA: team2EPA.toFixed(2),
    totalEPA: totalEPA.toFixed(2),
    totalNetScore,
    totalWinLossScore,
    totalScore,
    powerScore,
    outlook: formatOutlook(powerScore),
  };
}

function buildReason(alliance1: Alliance, alliance2: Alliance): string {
  const reasons: string[] = [];
  const epaDiff = parseFloat(alliance1.totalEPA) - parseFloat(alliance2.totalEPA);
  const scoreDiff = alliance1.totalScore - alliance2.totalScore;
  const netDiff = alliance1.totalNetScore - alliance2.totalNetScore;

  if (Math.abs(epaDiff) >= 8) {
    reasons.push(`${epaDiff > 0 ? alliance1.name : alliance2.name} 的联盟总 EPA 更高`);
  }

  if (Math.abs(scoreDiff) >= 180) {
    reasons.push(`${scoreDiff > 0 ? alliance1.name : alliance2.name} 的排位赛总分上限更强`);
  }

  if (Math.abs(netDiff) >= 120) {
    reasons.push(`${netDiff > 0 ? alliance1.name : alliance2.name} 的净胜分稳定性更好`);
  }

  if (reasons.length === 0) {
    reasons.push('两边纸面实力接近，更看临场状态和联盟默契');
  }

  return reasons.join('，');
}

function predictMatch(alliance1: Alliance, alliance2: Alliance, roundName: string): PlayoffMatch {
  const strengthDiff = Number((alliance1.powerScore - alliance2.powerScore).toFixed(2));
  const rawRate = 50 + strengthDiff * 1.4;
  const alliance1WinRate = Number(clamp(rawRate, 18, 82).toFixed(1));
  const alliance2WinRate = Number((100 - alliance1WinRate).toFixed(1));
  const winner =
    alliance1WinRate > alliance2WinRate
      ? alliance1
      : alliance1WinRate < alliance2WinRate
        ? alliance2
        : parseFloat(alliance1.totalEPA) >= parseFloat(alliance2.totalEPA)
          ? alliance1
          : alliance2;
  const loser = winner.number === alliance1.number ? alliance2 : alliance1;

  return {
    roundName,
    alliance1,
    alliance2,
    winner,
    loser,
    alliance1WinRate,
    alliance2WinRate,
    strengthDiff: Math.abs(strengthDiff),
    reason: buildReason(alliance1, alliance2),
  };
}

function getSeedOrder(bracketSize: number): number[] {
  let seeds = [1, 2];

  while (seeds.length < bracketSize) {
    const nextSize = seeds.length * 2;
    seeds = seeds.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }

  return seeds;
}

function getRoundName(slotCount: number, roundIndex: number): string {
  if (slotCount === 2) return '决赛';
  if (slotCount === 4) return '四强赛';
  if (slotCount === 8) return '16进8';
  if (slotCount === 16) return '32进16';
  if (slotCount === 32) return '64进32';
  return `第 ${roundIndex + 1} 轮淘汰赛`;
}

export function createEmptyAllianceDrafts(allianceCount: number): AllianceDraft[] {
  return Array.from({ length: allianceCount }, (_, index) => ({
    number: index + 1,
    team1: '',
    team2: '',
  }));
}

export function createSuggestedAllianceDrafts(
  rankedTeams: TeamRanked[],
  allianceCount = Math.floor(rankedTeams.length / 2),
): AllianceDraft[] {
  const teamPool = rankedTeams.slice(0, allianceCount * 2);

  return Array.from({ length: allianceCount }, (_, index) => ({
    number: index + 1,
    team1: teamPool[index]?.team ?? '',
    team2: teamPool[teamPool.length - 1 - index]?.team ?? '',
  }));
}

function parseAllianceNumber(value: string): number {
  const matched = value.match(/\d+/);
  return matched ? Number(matched[0]) : Number.NaN;
}

export function parseAllianceData(text: string, rankedTeams: TeamRanked[]): Alliance[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const drafts: AllianceDraft[] = [];
  const eligibleNames = new Set(rankedTeams.map((team) => team.team));

  for (const line of lines) {
    const parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 4) {
      continue;
    }

    const allianceNumber = parseAllianceNumber(parts[0]);
    if (!Number.isFinite(allianceNumber)) {
      continue;
    }

    const teams = parts.filter((part) => eligibleNames.has(part));
    const uniqueTeams = [...new Set(teams)];
    if (uniqueTeams.length < 2) {
      continue;
    }

    drafts.push({
      number: allianceNumber,
      team1: uniqueTeams[0],
      team2: uniqueTeams[1],
    });
  }

  return drafts
    .sort((left, right) => left.number - right.number)
    .map((draft) => buildAlliance(draft, rankedTeams));
}

export function buildAlliancesFromDrafts(
  drafts: AllianceDraft[],
  rankedTeams: TeamRanked[],
): Alliance[] {
  return drafts
    .filter((draft) => draft.team1 && draft.team2)
    .sort((left, right) => left.number - right.number)
    .map((draft) => buildAlliance(draft, rankedTeams));
}

export function generatePlayoffPrediction(alliances: Alliance[]): PlayoffPrediction {
  const seededAlliances = [...alliances].sort((left, right) => left.number - right.number);
  const supportedAllianceCounts = new Set([4, 8, 16, 32]);

  if (!supportedAllianceCounts.has(seededAlliances.length)) {
    throw new Error('淘汰赛只支持 8、16、32、64 支晋级队伍。');
  }

  const bracketSize = seededAlliances.length;
  const allianceBySeed = new Map(seededAlliances.map((alliance) => [alliance.number, alliance]));
  let bracketSlots = getSeedOrder(bracketSize).map((seed) => {
    const alliance = allianceBySeed.get(seed);
    if (!alliance) {
      throw new Error(`缺少联盟 ${seed}，请检查联盟选择结果。`);
    }

    return alliance;
  });
  const rounds: PlayoffPrediction['rounds'] = [];
  let semifinalMatches: PlayoffMatch[] = [];
  let final: PlayoffMatch | null = null;
  let bronze: PlayoffMatch | null = null;
  let roundIndex = 0;

  while (bracketSlots.length > 1) {
    const slotCount = bracketSlots.length;
    const roundName = getRoundName(slotCount, roundIndex);
    const nextSlots: Alliance[] = [];
    const matches: PlayoffMatch[] = [];

    for (let index = 0; index < bracketSlots.length; index += 2) {
      const alliance1 = bracketSlots[index];
      const alliance2 = bracketSlots[index + 1];

      const match = predictMatch(alliance1, alliance2, `${roundName} ${matches.length + 1}`);
      matches.push(match);
      nextSlots.push(match.winner);
    }

    rounds.push({ name: roundName, matches });

    if (slotCount === 4) {
      semifinalMatches = matches;
    }

    if (slotCount === 2 && matches.length > 0) {
      final = matches[0];
    }

    bracketSlots = nextSlots;
    roundIndex += 1;
  }

  if (!final) {
    throw new Error('没有生成冠军争夺战，请检查联盟数量。');
  }

  if (semifinalMatches.length === 2) {
    bronze = predictMatch(semifinalMatches[0].loser, semifinalMatches[1].loser, '季军争夺战');
  }

  return {
    rounds,
    semifinals: semifinalMatches,
    final,
    bronze,
    champion: final.winner,
    runnerUp: final.loser,
    thirdPlace: bronze?.winner ?? null,
  };
}
