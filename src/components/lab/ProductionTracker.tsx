import { Check, X, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Run {
  score: number;
  isPerfect: boolean;
  timestamp: Date;
}

interface ProductionTrackerProps {
  runs: Run[];
  consecutivePerfect: number;
  targetPerfect: number;
}

export function ProductionTracker({
  runs,
  consecutivePerfect,
  targetPerfect,
}: ProductionTrackerProps) {
  const isReady = consecutivePerfect >= targetPerfect;

  // Show last `targetPerfect` slots
  const slots = Array.from({ length: targetPerfect }, (_, i) => {
    const runIdx = runs.length - targetPerfect + i;
    return runIdx >= 0 ? runs[runIdx] : null;
  });

  const progressPct = Math.min((consecutivePerfect / targetPerfect) * 100, 100);

  return (
    <div className="space-y-3">
      {/* Title */}
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
        Producao
      </p>

      {/* Circles row */}
      <div className="flex items-center justify-center gap-2">
        {slots.map((run, idx) => (
          <div
            key={idx}
            title={
              run
                ? `${Number.isInteger(run.score) ? run.score : run.score.toFixed(1)}/${10} - ${run.timestamp.toLocaleString("pt-BR")}`
                : "Sem dados"
            }
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
              !run
                ? "border-gray-200 bg-gray-50"
                : run.isPerfect
                ? "border-green-500 bg-green-50"
                : "border-red-400 bg-red-50"
            }`}
          >
            {!run ? (
              <span className="text-[10px] text-gray-300">-</span>
            ) : run.isPerfect ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <div className="flex flex-col items-center">
                <X className="w-3 h-3 text-red-500" />
                <span className="text-[8px] text-red-500 font-bold leading-none">
                  {Number.isInteger(run.score) ? run.score : run.score.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">
            {consecutivePerfect}/{targetPerfect} consecutivos
          </span>
          <span className="text-[10px] text-gray-400">
            {Math.round(progressPct)}%
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isReady
                ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                : "bg-green-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Ready badge */}
      {isReady && (
        <div className="flex justify-center">
          <Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-0 gap-1 px-3 py-1 text-xs font-semibold shadow-md hover:from-yellow-500 hover:to-amber-600">
            <Trophy className="w-3.5 h-3.5" />
            Pronto para Producao
          </Badge>
        </div>
      )}
    </div>
  );
}
