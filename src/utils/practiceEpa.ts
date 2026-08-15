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
  const observedValues: number[] = [];
  const adjacency = Array.from({ length: size }, () => new Set<number>());
  const observationIndexes: number[][] = [];
  observations.forEach((observation) => {
    const indexes = observation.teamIds
      .map((id) => indexByTeam.get(id))
      .filter((index): index is number => index != null);
    if (!indexes.length) return;
    const value = getValue(observation);
    observedValues.push(value);
    observationIndexes.push(indexes);
    indexes.forEach((row) => {
      indexes.forEach((column) => { matrix[row][column] += 1; });
      matrix[row][size] += value;
    });
    indexes.forEach((row) => indexes.forEach((column) => {
      if (row !== column) adjacency[row].add(column);
    }));
  });

  // A partially scored schedule often cannot uniquely separate alliance partners.
  // Stabilize every connected alliance network around one shared contribution
  // baseline. A per-team baseline would leak that team's partner-assisted score
  // into its EPA; one global baseline would mix completely disconnected groups.
  // Even a full-rank card has very few matches per team and can be highly noisy.
  // Keep a modest regularization weight for every card instead of switching to
  // unregularized OLS, which can assign implausibly large positive/negative EPA
  // values when two teams' partner patterns are almost collinear.
  const ridgeWeight = 1;
  const globalPriorContribution = observedValues.length
    ? observedValues.reduce((sum, value) => sum + value, 0) / observedValues.length / 2
    : 0;
  const componentByTeam = Array(size).fill(-1) as number[];
  let componentCount = 0;
  for (let start = 0; start < size; start += 1) {
    if (componentByTeam[start] !== -1) continue;
    const queue = [start];
    componentByTeam[start] = componentCount;
    while (queue.length) {
      const current = queue.shift()!;
      adjacency[current].forEach((next) => {
        if (componentByTeam[next] !== -1) return;
        componentByTeam[next] = componentCount;
        queue.push(next);
      });
    }
    componentCount += 1;
  }
  const componentValues = Array.from({ length: componentCount }, () => [] as number[]);
  observationIndexes.forEach((indexes, observationIndex) => {
    const component = componentByTeam[indexes[0]];
    if (component >= 0) componentValues[component].push(observedValues[observationIndex]);
  });
  const componentPriors = componentValues.map((values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length / 2
    : globalPriorContribution);
  for (let index = 0; index < size; index += 1) {
    const priorContribution = componentPriors[componentByTeam[index]] ?? globalPriorContribution;
    matrix[index][index] += ridgeWeight;
    matrix[index][size] += ridgeWeight * priorContribution;
  }
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
