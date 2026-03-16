import { useState, useEffect } from "react";
import { motion } from "motion/react";
import type { LetterCollection } from "@/types/game";
import Bin from "./Bin";

const MOBILE_BREAKPOINT = 640;

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

interface CollectionBinsProps {
  collected: LetterCollection;
  dark?: boolean;
  onMeasureBin?: (letter: string, rect: DOMRect) => void;
  matchedLetters?: Set<string>;
}

const SW = 4;
const POT_STROKE = "#37352f";

type LidDirection = "left" | "center" | "right";

const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const POT_RANGES: { letters: string[]; showPlaceholder: boolean; lidDir: LidDirection }[] = [
  { letters: "ABCDEFGHI".split(""), showPlaceholder: false, lidDir: "left" },
  { letters: "JKLMNOPQR".split(""), showPlaceholder: true, lidDir: "center" },
  { letters: "STUVWXYZ".split(""), showPlaceholder: false, lidDir: "right" },
];

interface SinglePotProps {
  letters: string[];
  collected: LetterCollection;
  dark: boolean;
  onMeasureBin?: (letter: string, rect: DOMRect) => void;
  isCollecting: boolean;
  showPlaceholder: boolean;
  lidDir: LidDirection;
  flexHeight?: boolean;
}

function SinglePot({
  letters,
  collected,
  dark,
  onMeasureBin,
  isCollecting,
  showPlaceholder,
  lidDir,
  flexHeight = false,
}: SinglePotProps) {
  const activeBins = letters.filter((l) => (collected[l] || 0) > 0);

  const lidOrigin =
    lidDir === "right"
      ? "94% 92%"
      : lidDir === "center"
      ? "50% 92%"
      : "6% 92%";

  const lidAnimate =
    lidDir === "center"
      ? { y: isCollecting ? -20 : 0, scaleX: 1 }
      : lidDir === "right"
      ? { rotate: isCollecting ? 16 : 0, scaleX: 1 }
      : { rotate: isCollecting ? -16 : 0, scaleX: 1 };

  return (
    <div className="relative" style={{ padding: "26px 18px 0", width: "344px" }}>
      {/* Lid */}
      <motion.svg
        viewBox="0 0 260 38"
        className="absolute pointer-events-none"
        style={{
          top: -13,
          left: 4,
          right: 4,
          width: "calc(100% - 8px)",
          transformOrigin: lidOrigin,
          zIndex: 20,
          overflow: "visible",
        }}
        animate={lidAnimate}
        transition={
          isCollecting
            ? { type: "spring", stiffness: 280, damping: 18 }
            : { type: "spring", stiffness: 90, damping: 18, mass: 1.8 }
        }
      >
        <path
          d="M12 34 Q12 22 36 17 Q130 2 224 17 Q248 22 248 34 Z"
          fill="#fdfdfd"
          stroke={POT_STROKE}
          strokeWidth={SW}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M112 10 Q112 -1 130 -1 Q148 -1 148 10"
          fill="none"
          stroke={POT_STROKE}
          strokeWidth={SW}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </motion.svg>

      {/* Pot body */}
      <div
        className="relative w-full"
        style={{
          ...(flexHeight ? { minHeight: 56, paddingTop: 8, paddingBottom: 8 } : { height: 80 }),
          background: "#fdfdfd",
          border: `${SW}px solid ${POT_STROKE}`,
          borderRadius: "0 0 22px 22px",
          boxSizing: "border-box",
        }}
      >
        {/* Left handle */}
        <svg
          className="absolute pointer-events-none"
          style={{ left: -18, top: "10%", width: 18, height: "45%" }}
          viewBox="0 0 18 40"
          fill="none"
          overflow="visible"
        >
          <path
            d="M16 2 Q0 2 0 20 Q0 38 16 38"
            stroke={POT_STROKE}
            strokeWidth={SW}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Right handle */}
        <svg
          className="absolute pointer-events-none"
          style={{ right: -18, top: "10%", width: 18, height: "45%" }}
          viewBox="0 0 18 40"
          fill="none"
          overflow="visible"
        >
          <path
            d="M2 2 Q18 2 18 20 Q18 38 2 38"
            stroke={POT_STROKE}
            strokeWidth={SW}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Letter bins */}
        <div className="relative z-10 px-4 flex items-center justify-center h-full">
          {activeBins.length === 0 ? (
            showPlaceholder ? (
              <div
                className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-tertiary)]"
                style={{ marginTop: 7 }}
              >
                Match letters to collect
              </div>
            ) : null
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-0.5">
              {activeBins.map((letter) => (
                <Bin
                  key={letter}
                  letter={letter}
                  count={collected[letter] || 0}
                  dark={dark}
                  onMeasure={onMeasureBin}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CollectionBins({
  collected,
  dark = false,
  onMeasureBin,
  matchedLetters = new Set(),
}: CollectionBinsProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    const isCollecting = ALL_LETTERS.some((l) => matchedLetters.has(l));
    return (
      <div className="flex items-end justify-center">
        <SinglePot
          letters={ALL_LETTERS}
          collected={collected}
          dark={dark}
          onMeasureBin={onMeasureBin}
          isCollecting={isCollecting}
          showPlaceholder={true}
          lidDir="center"
          flexHeight
        />
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1">
      {POT_RANGES.map((range, i) => {
        const isCollecting = range.letters.some((l) => matchedLetters.has(l));

        return (
          <SinglePot
            key={i}
            letters={range.letters}
            collected={collected}
            dark={dark}
            onMeasureBin={onMeasureBin}
            isCollecting={isCollecting}
            showPlaceholder={range.showPlaceholder}
            lidDir={range.lidDir}
          />
        );
      })}
    </div>
  );
}
