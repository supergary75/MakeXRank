export interface AllianceScoreObservation {
  teamIds: [string, string];
  total: number;
  breakdown: Record<string, number>;
}

export function solveRidgeEpa(
  teamIds: string[],
  observations: AllianceScoreObservation[],
  getValue: (observation: AllianceScoreObservation) => number,
): Map<string, number> {
  if (!teamIds.length || !observations.length) return new Map();
  const indexByTeam = new Map(teamIds.map((id, index) => [id, index]));
  const size = teamIds.length;
  const matrix = Array.from({ length: size }, () => Array(size + 1).fill(0) as number[]);
  observations.forEach((observation) => {
    const indexes = observation.teamIds
      .map((id) => indexByTeam.get(id))
      .filter((index): index is number => index != null);
    indexes.forEach((row) => {
      indexes.forEach((column) => { matrix[row][column] += 1; });
      matrix[row][size] += getValue(observation);
    });
  });

  // This is only a numerical stabilizer. A larger ridge penalty visibly
  // shrinks sparse results: a 30-point two-team alliance must start at 15/15.
  for (let index = 0; index < size; index += 1) matrix[index][index] += 1e-6;
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    }
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    const divisor = matrix[pivot][pivot];
    if (Math.abs(divisor) < 1e-9) continue;
    for (let column = pivot; column <= size; column += 1) matrix[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let column = pivot; column <= size; column += 1) matrix[row][column] -= factor * matrix[pivot][column];
    }
  }
  return new Map(teamIds.map((id, index) => [id, matrix[index][size]]));
}
