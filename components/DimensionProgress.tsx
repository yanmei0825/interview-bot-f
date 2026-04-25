"use client";

import React from "react";
import { DimensionKey, DIMENSION_MAX_TURNS } from "../lib/api";

const DIMS: { key: DimensionKey; label: string }[] = [
  { key: "D1", label: "Success" },
  { key: "D2", label: "Security" },
  { key: "D3", label: "Relationships" },
  { key: "D4", label: "Autonomy" },
  { key: "D5", label: "Engagement" },
  { key: "D6", label: "Recognition" },
  { key: "D7", label: "Learning" },
  { key: "D8", label: "Purpose" },
  { key: "D9", label: "Obstacles" },
  { key: "D10", label: "Voice" },
];

interface Props {
  current: DimensionKey | null;
  coverage: Record<DimensionKey, { covered: boolean; turnCount: number }>;
}

export default function DimensionProgress({ current, coverage }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {DIMS.map(({ key, label }) => {
        const cov = coverage[key];
        const covered = cov?.covered ?? false;
        const active = key === current;
        const turns = cov?.turnCount ?? 0;
        const maxTurns = DIMENSION_MAX_TURNS[key];
        const pct = Math.min((turns / maxTurns) * 100, 100);

        return (
          <div
            key={key}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-sm
              ${active ? "bg-[#222] text-white" : covered ? "text-white/40" : "text-white/25"}`}
          >
            {/* Status dot */}
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 text-[9px] font-bold
              ${covered ? "bg-green-500 border-green-500 text-white" : active ? "border-white/70" : "border-white/15"}`}>
              {covered ? "✓" : ""}
            </span>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate leading-tight">{label}</span>
                <span className="font-mono text-[10px] opacity-40 shrink-0">{key}</span>
              </div>
              {/* Progress bar — only show when active or partially done */}
              {(active || (turns > 0 && !covered)) && (
                <div className="mt-1 h-0.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/40 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
