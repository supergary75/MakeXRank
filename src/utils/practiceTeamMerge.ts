import type { PracticeTeam } from './practiceScheduleGenerator';

function normalizeEventItem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeTeamIdentity(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

export function mergePracticeTeams(...teamSets: PracticeTeam[][]): PracticeTeam[] {
  const merged: PracticeTeam[] = [];
  teamSets.flat().forEach((team) => {
    const eventKey = normalizeEventItem(team.eventItem);
    const nameKey = normalizeTeamIdentity(team.teamName);
    const current = merged.find((candidate) => normalizeEventItem(candidate.eventItem) === eventKey
      && nameKey
      && normalizeTeamIdentity(candidate.teamName) === nameKey);
    if (!current) {
      const key = `${eventKey}::${nameKey || `unnamed-${merged.length + 1}`}`;
      merged.push({ ...team, id: key, members: [...team.members] });
      return;
    }
    current.isKClub = Boolean(current.isKClub || team.isKClub);
    team.members.forEach((member) => {
      if (!current.members.some((item) => item.name.trim().toLowerCase() === member.name.trim().toLowerCase())) {
        current.members.push(member);
      }
    });
    if ((!current.teamName || current.teamName === current.teamNo) && team.teamName) current.teamName = team.teamName;
  });
  return merged;
}
