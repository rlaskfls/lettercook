import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { LetterCollection } from "@/types/game";
import { isValidFoodWord, canFormWord } from "@/lib/wordValidator";
import { scoreWord } from "@/engine/scoring";
import ScoreDisplay from "../game/ScoreDisplay";
import LetterPool from "./LetterPool";
import WordInput from "./WordInput";
import SubmittedWords from "./SubmittedWords";

interface WordBuilderProps {
  collectedLetters: LetterCollection;
  score: number;
  submittedWords: string[];
  onSubmitWord: (word: string, points: number) => void;
  onFinish: () => void;
}

export default function WordBuilder({
  collectedLetters,
  score,
  submittedWords,
  onSubmitWord,
  onFinish,
}: WordBuilderProps) {
  const [currentWord, setCurrentWord] = useState<string[]>([]);
  const [tempUsed, setTempUsed] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Available letters = collected minus submitted minus temp used
  const available: LetterCollection = {};
  for (const [letter, count] of Object.entries(collectedLetters)) {
    const used = tempUsed[letter] || 0;
    if (count - used > 0) {
      available[letter] = count - used;
    }
  }

  const handleLetterClick = useCallback(
    (letter: string) => {
      setError(null);
      const avail = available[letter] || 0;
      if (avail <= 0) return;
      setCurrentWord((prev) => [...prev, letter]);
      setTempUsed((prev) => ({ ...prev, [letter]: (prev[letter] || 0) + 1 }));
    },
    [available]
  );

  const handleRemoveLetter = useCallback(
    (index: number) => {
      setError(null);
      const letter = currentWord[index];
      if (!letter) return;
      setCurrentWord((prev) => prev.filter((_, i) => i !== index));
      setTempUsed((prev) => {
        const next = { ...prev };
        next[letter] = (next[letter] || 1) - 1;
        if (next[letter] <= 0) delete next[letter];
        return next;
      });
    },
    [currentWord]
  );

  const handleClear = useCallback(() => {
    setCurrentWord([]);
    setTempUsed({});
    setError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    const word = currentWord.join("").toLowerCase();

    if (word.length < 3) {
      setError("Words must be at least 3 letters");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    if (submittedWords.includes(word)) {
      setError("Already submitted!");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    if (!isValidFoodWord(word)) {
      setError("Not in our cookbook!");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    const points = scoreWord(word);
    onSubmitWord(word, points);
    setCurrentWord([]);
    setTempUsed({});
    setError(null);
  }, [currentWord, submittedWords, onSubmitWord]);

  const totalLetters = Object.values(collectedLetters).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="flex items-center justify-between w-full">
        <ScoreDisplay score={score} />
        <div className="flex flex-col items-center">
          <span className="text-[10px] leading-[15px] uppercase tracking-wider text-[var(--text-secondary)]">
            Letters Left
          </span>
          <span className="font-mono text-xl font-bold tabular-nums">
            {Object.values(available).reduce((a, b) => a + b, 0)}/{totalLetters}
          </span>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold">Your Mise en Place!</h2>
        <p className="text-xs h-fit text-[var(--text-secondary)]">
          Use your collected letters to form food-related words
        </p>
      </div>

      <WordInput
        letters={currentWord}
        onRemove={handleRemoveLetter}
        onClear={handleClear}
        onSubmit={handleSubmit}
        shake={shake}
        error={error}
      />

      <LetterPool available={available} onLetterClick={handleLetterClick} />

      <SubmittedWords words={submittedWords} />

      <button
        onClick={onFinish}
        className="mt-2 px-6 py-2.5 border border-[var(--border-color)] rounded-[336px] text-sm text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors"
      >
        Finish Cooking
      </button>
    </div>
  );
}
