// Compressed distribution: E at ~7%, L/S/P/C/D boosted
const LETTER_WEIGHTS: Record<string, number> = {
  A: 17, B: 10, C: 9,  D: 14, E: 17, F: 5,
  G: 10, H: 11, I: 13, J: 10, K: 9,  L: 9,
  M: 11, N: 13, O: 15, P: 12, Q: 9,  R: 11,
  S: 12, T: 13, U: 8,  V: 9,  W: 10, X: 9,
  Y: 6,  Z: 9,
};

const cumulativeWeights: { letter: string; cumWeight: number }[] = [];

let total = 0;
for (const [letter, weight] of Object.entries(LETTER_WEIGHTS)) {
  total += weight;
  cumulativeWeights.push({ letter, cumWeight: total });
}

export function getRandomLetter(): string {
  const rand = Math.random() * total;
  for (const { letter, cumWeight } of cumulativeWeights) {
    if (rand < cumWeight) return letter;
  }
  return "E";
}
