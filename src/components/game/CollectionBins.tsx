import { motion } from "motion/react";
import type { LetterCollection } from "@/types/game";
import Bin from "./Bin";

interface CollectionBinsProps {
  collected: LetterCollection;
  dark?: boolean;
  onMeasureBin?: (letter: string, rect: DOMRect) => void;
  isCollecting?: boolean;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const SW = 4;
const POT_STROKE = "#37352f";

export default function CollectionBins({
  collected,
  dark = false,
  onMeasureBin,
  isCollecting = false,
}: CollectionBinsProps) {
  const activeBins = ALPHABET.filter((l) => (collected[l] || 0) > 0);

  return (
    <div className="relative" style={{ padding: "26px 18px 0", width: "300px" }}>
      {/* Lid — separate SVG, pivots from left bottom like the reference */}
      <motion.svg
        viewBox="0 0 260 38"
        className="absolute pointer-events-none"
        style={{
          top: -3,
          left: 4,
          right: 4,
          width: "calc(100% - 8px)",
          transformOrigin: "6% 92%",
          zIndex: 20,
          overflow: "visible",
        }}
        animate={{ rotate: isCollecting ? -16 : 0 }}
        transition={
          isCollecting
            ? { type: "spring", stiffness: 280, damping: 18 }
            : { type: "spring", stiffness: 90, damping: 18, mass: 1.8 }
        }
      >
        {/* Dome */}
        <path
          d="M12 34 Q12 22 36 17 Q130 2 224 17 Q248 22 248 34 Z"
          fill="#fdfdfd"
          stroke={POT_STROKE}
          strokeWidth={SW}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Knob */}
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
        className="relative w-full min-h-[72px]"
        style={{
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
        <div className="relative z-10 px-4 py-3 flex items-center justify-center min-h-[56px]">
          {activeBins.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-tertiary)]" style={{ marginTop: 7 }}>
              Match letters to collect
            </div>
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
