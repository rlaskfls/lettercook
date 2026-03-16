import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useGameState } from "@/hooks/useGameState";
import { useTimer } from "@/hooks/useTimer";
import { findMatches, getAllMatchedPositions, getMatchedLetters } from "@/engine/matcher";
import { isValidSwap, executeSwap, isAdjacent } from "@/engine/swap";
import { removeMatched, hasValidMoves, shuffleGrid, applyGravityWithInfo, fillEmptyWithInfo } from "@/engine/grid";
import { scoreMatches } from "@/engine/scoring";
import type { Position } from "@/types/game";
import { HIGHLIGHT_DURATION, FLOAT_DURATION, FLOAT_STAGGER, GRAVITY_DURATION } from "@/lib/constants";
import GameBoard from "./GameBoard";
import CollectionBins from "./CollectionBins";
import Timer from "./Timer";
import ScoreDisplay from "./ScoreDisplay";
import WordBuilder from "../wordbuilder/WordBuilder";
import Tutorial from "./Tutorial";

export default function Game() {
  const { state, dispatch } = useGameState();
  const [matchedPositions, setMatchedPositions] = useState<Set<string>>(new Set());
  const [matchedLetters, setMatchedLetters] = useState<Set<string>>(new Set());
  const [fallingTiles, setFallingTiles] = useState<Map<string, { dist: number; delay: number }>>(new Map());
  const [binPositions, setBinPositions] = useState<Record<string, DOMRect>>({});
  const [showTutorial, setShowTutorial] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [shufflesLeft, setShufflesLeft] = useState(1);
  const comboRef = useRef(1);
  const processingRef = useRef(false);

  const handleTick = useCallback(() => {
    dispatch({ type: "TICK_TIMER" });
  }, [dispatch]);

  const handleTimeEnd = useCallback(() => {
    dispatch({ type: "END_MATCHING_PHASE" });
  }, [dispatch]);

  useTimer(
    state.timeRemaining,
    state.phase === "matching" && !showTutorial,
    handleTick,
    handleTimeEnd
  );

  const handleBinMeasure = useCallback((letter: string, rect: DOMRect) => {
    setBinPositions((prev) => {
      if (
        prev[letter] &&
        Math.abs(prev[letter].left - rect.left) < 1 &&
        Math.abs(prev[letter].top - rect.top) < 1
      )
        return prev;
      return { ...prev, [letter]: rect };
    });
  }, []);

  const processMatches = useCallback(
    async (currentGrid: typeof state.grid, combo: number) => {
      const matches = findMatches(currentGrid);
      if (matches.length === 0) {
        comboRef.current = 1;
        processingRef.current = false;
        dispatch({ type: "SET_PROCESSING", value: false });

        if (!hasValidMoves(currentGrid)) {
          const shuffled = shuffleGrid(currentGrid);
          dispatch({ type: "SET_GRID", grid: shuffled });
        }
        return;
      }

      const points = scoreMatches(matches, combo);
      dispatch({ type: "ADD_SCORE", points });

      const positions = getAllMatchedPositions(matches);
      setMatchedPositions(positions);

      const letters = getMatchedLetters(matches);
      setMatchedLetters(new Set(letters));
      dispatch({ type: "COLLECT_LETTERS", letters });

      const floatTime = HIGHLIGHT_DURATION + FLOAT_DURATION + positions.size * FLOAT_STAGGER;
      await new Promise((r) => setTimeout(r, floatTime));

      setMatchedPositions(new Set());
      setMatchedLetters(new Set());
      const removed = removeMatched(currentGrid, positions);
      const { grid: gravityGrid, fallMap: gravFall } = applyGravityWithInfo(removed);
      const { grid: nextGrid, fallMap: fillFall } = fillEmptyWithInfo(gravityGrid);

      const combined = new Map([...gravFall, ...fillFall]);

      // Group by column, sort bottom-first, assign stagger delays
      const byCol = new Map<number, { key: string; row: number; dist: number }[]>();
      combined.forEach((dist, key) => {
        const [r, c] = key.split(",").map(Number);
        if (!byCol.has(c!)) byCol.set(c!, []);
        byCol.get(c!)!.push({ key, row: r!, dist });
      });

      const FALL_STAGGER = 0.05;
      const staggered = new Map<string, { dist: number; delay: number }>();
      byCol.forEach((tiles) => {
        tiles.sort((a, b) => b.row - a.row);
        tiles.forEach((t, i) => {
          staggered.set(t.key, { dist: t.dist, delay: i * FALL_STAGGER });
        });
      });

      setFallingTiles(staggered);
      dispatch({ type: "SET_GRID", grid: nextGrid });

      await new Promise((r) => setTimeout(r, GRAVITY_DURATION));
      setFallingTiles(new Map());

      comboRef.current = combo + 1;
      await processMatches(nextGrid, combo + 1);
    },
    [dispatch]
  );

  const handleSwap = useCallback(
    (from: Position, to: Position) => {
      if (state.phase !== "matching" || processingRef.current) return;
      if (!isAdjacent(from, to)) return;
      if (!isValidSwap(state.grid, from, to)) return;

      processingRef.current = true;
      dispatch({ type: "SWAP_TILES", from, to });
      const swapped = executeSwap(state.grid, from, to);
      dispatch({ type: "SET_GRID", grid: swapped });

      setTimeout(() => {
        processMatches(swapped, 1);
      }, 200);
    },
    [state.phase, state.grid, dispatch, processMatches]
  );

  const handleShuffle = useCallback(() => {
    if (state.phase !== "matching" || processingRef.current || isShuffling || shufflesLeft <= 0) return;
    setIsShuffling(true);
    setShufflesLeft((n) => n - 1);
    const shuffled = shuffleGrid(state.grid);
    dispatch({ type: "SET_GRID", grid: shuffled });

    const matches = findMatches(shuffled);
    if (matches.length > 0) {
      processingRef.current = true;
      dispatch({ type: "SET_PROCESSING", value: true });
      processMatches(shuffled, 1);
    }

    setTimeout(() => setIsShuffling(false), 600);
  }, [state.phase, state.grid, dispatch, isShuffling, shufflesLeft, processMatches]);

  const letterCount = Object.values(state.collectedLetters).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <>
      <AnimatePresence mode="wait">
        {state.phase === "ready" && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-6 py-12 px-6 max-w-lg w-full mx-auto"
          >
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Word Kitchen
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Match letters, cook words
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                Match 3 or more identical letters to collect them.
                <br />
                Use your collected letters to spell food words.
              </p>
            </div>
            <button
              onClick={() => {
                dispatch({ type: "START_GAME" });
                setShowTutorial(true);
              }}
              className="px-8 py-3 bg-[var(--accent)] text-white rounded-[336px] font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Start Cooking
            </button>
          </motion.div>
        )}

        {state.phase === "matching" && (
          <motion.div
            key="matching"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            style={{ background: "var(--canvas-bg)", overscrollBehavior: "none" }}
          >
            {/* Infinite canvas */}
            <GameBoard
              grid={state.grid}
              matchedPositions={matchedPositions}
              fallingTiles={fallingTiles}
              isProcessing={state.isProcessing || processingRef.current}
              onSwap={handleSwap}
              binPositions={binPositions}
            />

            {/* Floating header */}
            <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
              <div
                className="flex items-center gap-5 px-6 py-3 rounded-2xl border shadow-sm"
                style={{
                  background: "var(--header-bg)",
                  borderColor: "var(--header-border)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                }}
              >
                <span className="text-[var(--text-primary)] font-semibold text-sm tracking-tight whitespace-nowrap">
                  Word Kitchen
                </span>
                <div className="w-px h-6 bg-[var(--border-color)]" />
                <ScoreDisplay score={state.score} />
                <div className="w-px h-6 bg-[var(--border-color)]" />
                <Timer timeRemaining={state.timeRemaining} />
                <div className="w-px h-6 bg-[var(--border-color)]" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Letters
                  </span>
                  <span className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
                    {letterCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Shuffle button — aligned vertically with nav bar */}
            <motion.button
              onPointerDown={(e) => {
                e.stopPropagation();
                handleShuffle();
              }}
              onPointerUp={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              disabled={shufflesLeft <= 0}
              className="fixed z-[60] w-10 h-10 rounded-full border flex items-center justify-center shadow-sm"
              style={{
                top: 20,
                right: 20,
                pointerEvents: "auto",
                cursor: shufflesLeft > 0 ? "pointer" : "default",
                opacity: shufflesLeft > 0 ? 1 : 0.35,
                background: "var(--header-bg)",
                borderColor: "var(--header-border)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
              animate={
                isShuffling
                  ? { scale: [1, 0.85, 1.1, 1], rotate: [0, 360] }
                  : { scale: 1, rotate: 0 }
              }
              transition={
                isShuffling
                  ? { duration: 0.5, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
              whileHover={shufflesLeft > 0 ? { scale: 1.08 } : {}}
              whileTap={shufflesLeft > 0 ? { scale: 0.92 } : {}}
              title={shufflesLeft > 0 ? "Shuffle board" : "No shuffles left"}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--text-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 7.5 A7 7 0 0 1 13.5 3.5" />
                <path d="M13.5 1 L13.5 4 L10.5 4" />
                <path d="M17 10.5 A7 7 0 0 1 4.5 14.5" />
                <path d="M4.5 17 L4.5 14 L7.5 14" />
              </svg>
              {shufflesLeft > 0 && (
                <span
                  className="absolute flex items-center justify-center rounded-full font-bold"
                  style={{
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    fontSize: 10,
                    lineHeight: 1,
                    color: "#fff",
                    background: "var(--text-primary)",
                  }}
                >
                  {shufflesLeft}
                </span>
              )}
            </motion.button>

            {/* Floating bottom bins - cooking pot */}
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
              <CollectionBins
                collected={state.collectedLetters}
                onMeasureBin={handleBinMeasure}
                matchedLetters={matchedLetters}
              />
            </div>

            {/* Tutorial overlay — pauses timer until dismissed */}
            <AnimatePresence>
              {showTutorial && (
                <Tutorial onComplete={() => setShowTutorial(false)} />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {state.phase === "wordbuilding" && (
          <motion.div
            key="wordbuilding"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-lg mx-auto px-6 py-6"
          >
            <WordBuilder
              collectedLetters={state.collectedLetters}
              score={state.score}
              submittedWords={state.submittedWords}
              onSubmitWord={(word, points) =>
                dispatch({ type: "SUBMIT_WORD", word, points })
              }
              onFinish={() => dispatch({ type: "FINISH_GAME" })}
            />
          </motion.div>
        )}

        {state.phase === "gameover" && (
          <motion.div
            key="gameover"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 py-8 px-6 max-w-lg w-full mx-auto"
          >
            <h2 className="text-xl font-semibold">Enjoy Your Meal!</h2>
            <div className="flex flex-col items-center gap-2 bg-white border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm">
              <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                Final Score
              </span>
              <span className="font-mono text-4xl font-bold">
                {state.score.toLocaleString()}
              </span>
              {state.submittedWords.length > 0 && (
                <div className="mt-4 w-full">
                  <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                    Words Found ({state.submittedWords.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {state.submittedWords.map((w, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-[var(--accent-light)] rounded-[var(--radius-sm)] text-xs font-mono"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setMatchedPositions(new Set());
                setMatchedLetters(new Set());
                setShufflesLeft(1);
                comboRef.current = 1;
                processingRef.current = false;
                dispatch({ type: "RESET_GAME" });
              }}
              className="px-8 py-3 bg-[var(--accent)] text-white rounded-[336px] font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Play Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
