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
  return `联盟${number}`;
}

function formatOutlook(powerScore: number): string {
  if (powerScore >= 210) return '争冠核心';
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
    throw new Error(`联盟${draft.number} 的队伍没有在当前排位赛前八中找到。`);
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

  return reasons.join('；');
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

export function createSuggestedAllianceDrafts(rankedTeams: TeamRanked[]): AllianceDraft[] {
  const topEight = rankedTeams.slice(0, 8);
  const pairs = [
    [0, 7],
    [1, 6],
    [2, 5],
    [3, 4],
  ];

  return pairs.map(([firstIndex, secondIndex], index) => ({
    number: index + 1,
    team1: topEight[firstIndex]?.team ?? '',
    team2: topEight[secondIndex]?.team ?? '',
  }));
}

export function parseAllianceData(text: string, rankedTeams: TeamRanked[]): Alliance[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const drafts: AllianceDraft[] = [];
  const topEightNames = new Set(rankedTeams.slice(0, 8).map((team) => team.team));

  for (const line of lines) {
    const parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 7) {
      continue;
    }

    const allianceNumber = Number(parts[0]);
    if (!Number.isFinite(allianceNumber)) {
      continue;
    }

    const candidatePairs: Array<[number, number]> = [
      [3, 6],
      [4, 7],
    ];

    let team1 = '';
    let team2 = '';

    for (const [firstIndex, secondIndex] of candidatePairs) {
      const first = parts[firstIndex];
      const second = parts[secondIndex];
      if (topEightNames.has(first) && topEightNames.has(second)) {
        team1 = first;
        team2 = second;
        break;
      }
    }

    if (!team1 || !team2) {
      continue;
    }

    drafts.push({
      number: allianceNumber,
      team1,
      team2,
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
  if (seededAlliances.length < 4) {
    throw new Error('至少需要 4 个联盟才能生成四强赛预测。');
  }

  const semifinals = [
    predictMatch(seededAlliances[0], seededAlliances[3], '半决赛 A'),
    predictMatch(seededAlliances[1], seededAlliances[2], '半决赛 B'),
  ];

  const final = predictMatch(semifinals[0].winner, semifinals[1].winner, '冠军争夺战');
  const bronze = predictMatch(semifinals[0].loser, semifinals[1].loser, '季军争夺战');

  return {
    semifinals,
    final,
    bronze,
    champion: final.winner,
    runnerUp: final.loser,
    thirdPlace: bronze.winner,
  };
}
