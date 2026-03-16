import type { Grid, Tile } from "@/types/game";
import { GRID_ROWS, GRID_COLS } from "@/lib/constants";
import { getRandomLetter } from "./letterDistribution";
import { findMatches } from "./matcher";

let tileCounter = 0;

function createTile(row: number, col: number, isNew = false): Tile {
  return {
    id: `tile-${++tileCounter}`,
    letter: getRandomLetter(),
    row,
    col,
    isMatched: false,
    isNew,
  };
}

export function createGrid(): Grid {
  let grid: Grid;
  let attempts = 0;

  do {
    grid = Array.from({ length: GRID_ROWS }, (_, r) =>
      Array.from({ length: GRID_COLS }, (_, c) => createTile(r, c))
    );
    attempts++;
    // Re-generate if there are pre-existing matches
  } while (findMatches(grid).length > 0 && attempts < 100);

  // If we couldn't avoid matches after 100 attempts, fix them manually
  if (findMatches(grid).length > 0) {
    grid = fixPreExistingMatches(grid);
  }

  // 35% adjacent pairs (2-in-a-row) to make matches easier to find
  grid = seedAdjacentPairs(grid);

  // Remove any matches accidentally created (e.g. 2x2 from overlapping pairs)
  if (findMatches(grid).length > 0) {
    grid = fixPreExistingMatches(grid);
  }

  return grid;
}

const ADJACENT_PAIRS_TARGET = 448; // 35% of 2560 tiles

function seedAdjacentPairs(grid: Grid): Grid {
  let placed = 0;

  for (let attempt = 0; attempt < ADJACENT_PAIRS_TARGET * 4 && placed < ADJACENT_PAIRS_TARGET; attempt++) {
    const horizontal = Math.random() < 0.5;
    let r: number, c: number;

    if (horizontal) {
      r = Math.floor(Math.random() * GRID_ROWS);
      c = Math.floor(Math.random() * (GRID_COLS - 1));
    } else {
      r = Math.floor(Math.random() * (GRID_ROWS - 1));
      c = Math.floor(Math.random() * GRID_COLS);
    }

    const letter = getRandomLetter();

    // Ensure placing this pair won't create a 3-in-a-row match
    if (horizontal) {
      const left = c > 0 ? grid[r]![c - 1]?.letter : null;
      const right = c + 2 < GRID_COLS ? grid[r]![c + 2]?.letter : null;
      if (left === letter || right === letter) continue;
    } else {
      const above = r > 0 ? grid[r - 1]![c]?.letter : null;
      const below = r + 2 < GRID_ROWS ? grid[r + 2]![c]?.letter : null;
      if (above === letter || below === letter) continue;
    }

    if (horizontal) {
      grid[r]![c] = { ...grid[r]![c]!, letter };
      grid[r]![c + 1] = { ...grid[r]![c + 1]!, letter };
    } else {
      grid[r]![c] = { ...grid[r]![c]!, letter };
      grid[r + 1]![c] = { ...grid[r + 1]![c]!, letter };
    }
    placed++;
  }

  return grid;
}

function fixPreExistingMatches(grid: Grid): Grid {
  let matches = findMatches(grid);
  let iterations = 0;
  while (matches.length > 0 && iterations < 1000) {
    for (const match of matches) {
      // Replace the last tile in each match with a different letter
      const lastPos = match.tiles[match.tiles.length - 1];
      const tile = grid[lastPos.row]![lastPos.col]!;
      let newLetter: string;
      do {
        newLetter = getRandomLetter();
      } while (newLetter === tile.letter);
      grid[lastPos.row]![lastPos.col] = { ...tile, letter: newLetter };
    }
    matches = findMatches(grid);
    iterations++;
  }
  return grid;
}

export function applyGravity(grid: Grid): Grid {
  const newGrid: Grid = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(null)
  );

  for (let c = 0; c < GRID_COLS; c++) {
    let writeRow = GRID_ROWS - 1;
    // Pull non-null tiles down
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      if (grid[r]![c] !== null) {
        const tile = { ...grid[r]![c]! };
        tile.row = writeRow;
        tile.col = c;
        newGrid[writeRow]![c] = tile;
        writeRow--;
      }
    }
  }

  return newGrid;
}

export function fillEmpty(grid: Grid): Grid {
  const newGrid = grid.map(row => [...row]);

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (newGrid[r]![c] === null) {
        newGrid[r]![c] = createTile(r, c, true);
      }
    }
  }

  return newGrid;
}

export function removeMatched(grid: Grid, matchedPositions: Set<string>): Grid {
  return grid.map((row, r) =>
    row.map((tile, c) => {
      if (matchedPositions.has(`${r},${c}`)) return null;
      return tile;
    })
  );
}

export function hasValidMoves(grid: Grid): boolean {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      // Try swap right
      if (c < GRID_COLS - 1) {
        const swapped = swapInGrid(grid, r, c, r, c + 1);
        if (findMatches(swapped).length > 0) return true;
      }
      // Try swap down
      if (r < GRID_ROWS - 1) {
        const swapped = swapInGrid(grid, r, c, r + 1, c);
        if (findMatches(swapped).length > 0) return true;
      }
    }
  }
  return false;
}

function swapInGrid(grid: Grid, r1: number, c1: number, r2: number, c2: number): Grid {
  const newGrid = grid.map(row => [...row]);
  const temp = newGrid[r1]![c1];
  newGrid[r1]![c1] = newGrid[r2]![c2];
  newGrid[r2]![c2] = temp;
  return newGrid;
}

export function applyGravityWithInfo(grid: Grid): { grid: Grid; fallMap: Map<string, number> } {
  const newGrid: Grid = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(null)
  );
  const fallMap = new Map<string, number>();

  for (let c = 0; c < GRID_COLS; c++) {
    let writeRow = GRID_ROWS - 1;
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      if (grid[r]![c] !== null) {
        const tile = { ...grid[r]![c]! };
        const dist = writeRow - r;
        tile.row = writeRow;
        tile.col = c;
        newGrid[writeRow]![c] = tile;
        if (dist > 0) {
          fallMap.set(`${writeRow},${c}`, dist);
        }
        writeRow--;
      }
    }
  }

  return { grid: newGrid, fallMap };
}

export function fillEmptyWithInfo(grid: Grid): { grid: Grid; fallMap: Map<string, number> } {
  const newGrid = grid.map(row => [...row]);
  const fallMap = new Map<string, number>();

  for (let c = 0; c < GRID_COLS; c++) {
    let nullCount = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      if (newGrid[r]![c] === null) nullCount++;
      else break;
    }
    for (let r = 0; r < GRID_ROWS; r++) {
      if (newGrid[r]![c] === null) {
        newGrid[r]![c] = createTile(r, c, true);
        fallMap.set(`${r},${c}`, nullCount);
      }
    }
  }

  return { grid: newGrid, fallMap };
}

export function shuffleGrid(grid: Grid): Grid {
  const letters: string[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r]![c]) letters.push(grid[r]![c]!.letter);
    }
  }

  // Fisher-Yates shuffle
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j]!, letters[i]!];
  }

  // Place letters left-to-right, top-to-bottom, swapping forward when
  // the current letter would create a match with already-placed neighbors.
  const placed: string[][] = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill("")
  );

  const wouldMatch = (r: number, c: number, letter: string): boolean => {
    // Horizontal run of 3
    if (c >= 2 && placed[r]![c - 1] === letter && placed[r]![c - 2] === letter) return true;
    // Vertical run of 3
    if (r >= 2 && placed[r - 1]![c] === letter && placed[r - 2]![c] === letter) return true;
    // 2x2 square (current tile is bottom-right of a 2x2)
    if (r >= 1 && c >= 1 &&
        placed[r]![c - 1] === letter &&
        placed[r - 1]![c] === letter &&
        placed[r - 1]![c - 1] === letter) return true;
    return false;
  };

  let idx = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!wouldMatch(r, c, letters[idx]!)) {
        placed[r]![c] = letters[idx]!;
        idx++;
      } else {
        let swapped = false;
        for (let k = idx + 1; k < letters.length; k++) {
          if (!wouldMatch(r, c, letters[k]!)) {
            [letters[idx], letters[k]] = [letters[k]!, letters[idx]!];
            placed[r]![c] = letters[idx]!;
            idx++;
            swapped = true;
            break;
          }
        }
        if (!swapped) {
          placed[r]![c] = letters[idx]!;
          idx++;
        }
      }
    }
  }

  const newGrid: Grid = Array.from({ length: GRID_ROWS }, (_, r) =>
    Array.from({ length: GRID_COLS }, (_, c) => ({
      id: `tile-${++tileCounter}`,
      letter: placed[r]![c]!,
      row: r,
      col: c,
      isMatched: false,
      isNew: false,
    }))
  );

  return newGrid;
}
