import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Info,
  FileCode,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Criterion {
  name: string;
  score: number;
  comment: string;
  severity?: string;
}

interface AnalysisError {
  type: string;
  severity: string;
  description: string;
  suggestion: string;
  affected_file?: string;
}

interface AnalysisPanelProps {
  score: number | null;
  maxScore: number;
  criteria: Criterion[];
  errors: AnalysisError[];
  summary: string | null;
  loading: boolean;
}

function ScoreCircle({ score, maxScore }: { score: number; maxScore: number }) {
  const ratio = score / maxScore;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - ratio * circumference;

  let color = "text-red-500";
  let strokeColor = "#ef4444";
  if (score >= 9) {
    color = "text-green-500";
    strokeColor = "#22c55e";
  } else if (score >= 7) {
    color = "text-yellow-500";
    strokeColor = "#eab308";
  } else if (score >= 5) {
    color = "text-orange-500";
    strokeColor = "#f97316";
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="6"
          />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>
            {Number.isInteger(score) ? score : score.toFixed(1)}
          </span>
          <span className="text-xs text-gray-400 mt-1">/{maxScore}</span>
        </div>
      </div>
    </div>
  );
}

function getCriterionColor(score: number) {
  if (score >= 9) return { bar: "bg-green-500", text: "text-green-600" };
  if (score >= 7) return { bar: "bg-yellow-500", text: "text-yellow-600" };
  if (score >= 5) return { bar: "bg-orange-500", text: "text-orange-600" };
  return { bar: "bg-red-400", text: "text-red-500" };
}

function CriterionBar({ criterion }: { criterion: Criterion }) {
  const { bar, text } = getCriterionColor(criterion.score);
  return (
    <div className="flex items-center gap-2" title={criterion.comment}>
      <span className="text-[10px] text-gray-600 w-28 truncate">
        {criterion.name}
      </span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${Math.max((criterion.score / 10) * 100, 5)}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${text}`}>
        {criterion.score}
      </span>
    </div>
  );
}

function severityIcon(severity: string) {
  switch (severity) {
    case "high":
      return <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />;
    case "medium":
      return <AlertTriangle className="w-3 h-3 text-yellow-500 flex-shrink-0" />;
    default:
      return <Info className="w-3 h-3 text-blue-500 flex-shrink-0" />;
  }
}

function severityBadgeClass(severity: string) {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-700 hover:bg-red-100";
    case "medium":
      return "bg-yellow-100 text-yellow-700 hover:bg-yellow-100";
    default:
      return "bg-blue-100 text-blue-700 hover:bg-blue-100";
  }
}

function ErrorItem({ error }: { error: AnalysisError }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded p-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-1.5 w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
        )}
        {severityIcon(error.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className={`text-[9px] px-1 py-0 ${severityBadgeClass(error.severity)}`}>
              {error.severity}
            </Badge>
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {error.type}
            </Badge>
          </div>
          <p className="text-[11px] text-gray-700 mt-0.5 leading-tight">
            {error.description}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="ml-5 mt-1.5 space-y-1">
          <p className="text-[10px] text-gray-600">
            <span className="font-medium">Sugestao:</span> {error.suggestion}
          </p>
          {error.affected_file && (
            <div className="flex items-center gap-1">
              <FileCode className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] text-gray-500 font-mono">
                {error.affected_file}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AnalysisPanel({
  score,
  maxScore,
  criteria,
  errors,
  summary,
  loading,
}: AnalysisPanelProps) {
  const [errorsExpanded, setErrorsExpanded] = useState(true);

  if (loading) {
    return (
      <Card className="p-4 space-y-4">
        <div className="flex justify-center">
          <Skeleton className="w-24 h-24 rounded-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      {/* Score circle */}
      {score != null && <ScoreCircle score={score} maxScore={maxScore} />}

      {/* Criteria bars */}
      {criteria.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Criterios
          </p>
          {criteria.map((c) => (
            <CriterionBar key={c.name} criterion={c} />
          ))}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <button
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            className="flex items-center gap-1 mb-1.5"
          >
            {errorsExpanded ? (
              <ChevronDown className="w-3 h-3 text-gray-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-400" />
            )}
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Erros ({errors.length})
            </p>
          </button>
          {errorsExpanded && (
            <div className="space-y-1.5">
              {errors.map((err, idx) => (
                <ErrorItem key={idx} error={err} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="border-t pt-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Resumo
          </p>
          <p className="text-[11px] text-gray-700 leading-relaxed">{summary}</p>
        </div>
      )}
    </Card>
  );
}
