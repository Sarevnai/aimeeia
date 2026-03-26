import { Check, Circle, ArrowRightLeft, Bot, UserCheck } from "lucide-react";

interface PipelineTimelineProps {
  triageStage: string | null;
  activeModule: { slug: string; name: string } | null;
  moduleHistory: Array<{ slug: string; name: string }>;
  handoffDetected: boolean;
  agentType: string;
}

const TRIAGE_STAGES = [
  { key: "greeting", label: "Saudacao" },
  { key: "awaiting_name", label: "Nome" },
  { key: "awaiting_triage", label: "Triagem" },
  { key: "completed", label: "Concluida" },
] as const;

function getTriageIndex(stage: string | null): number {
  if (!stage) return -1;
  return TRIAGE_STAGES.findIndex((s) => s.key === stage);
}

function StepDot({
  status,
}: {
  status: "completed" | "active" | "pending";
}) {
  if (status === "completed") {
    return (
      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <Check className="w-2.5 h-2.5 text-white" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="relative w-4 h-4 flex items-center justify-center flex-shrink-0">
        <div className="absolute w-4 h-4 rounded-full bg-green-400 animate-ping opacity-40" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
      </div>
    );
  }
  return (
    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
  );
}

export function PipelineTimeline({
  triageStage,
  activeModule,
  moduleHistory,
  handoffDetected,
  agentType,
}: PipelineTimelineProps) {
  const currentTriageIdx = getTriageIndex(triageStage);
  const triageCompleted = triageStage === "completed";

  // Unique modules for display (history + active)
  const allModules = [...moduleHistory];
  if (
    activeModule &&
    !allModules.find((m) => m.slug === activeModule.slug)
  ) {
    allModules.push(activeModule);
  }

  return (
    <div className="space-y-1">
      {/* Agent type label */}
      <div className="flex items-center gap-1 mb-2">
        <Bot className="w-3 h-3 text-gray-500" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
          {agentType}
        </span>
      </div>

      {/* Triage section */}
      <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
        Triagem
      </p>
      <div className="relative pl-2">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />

        {TRIAGE_STAGES.map((stage, idx) => {
          let status: "completed" | "active" | "pending" = "pending";
          if (idx < currentTriageIdx) status = "completed";
          else if (idx === currentTriageIdx) status = triageCompleted && idx === TRIAGE_STAGES.length - 1 ? "completed" : "active";

          return (
            <div key={stage.key} className="flex items-center gap-2 py-1 relative">
              <StepDot status={status} />
              <span
                className={`text-[10px] ${
                  status === "active"
                    ? "text-green-700 font-medium"
                    : status === "completed"
                    ? "text-gray-600"
                    : "text-gray-400"
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Module section */}
      {allModules.length > 0 && (
        <>
          <div className="flex items-center gap-1 mt-3 mb-1">
            <ArrowRightLeft className="w-3 h-3 text-gray-500" />
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              Modulos
            </p>
          </div>
          <div className="relative pl-2">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />
            {allModules.map((mod) => {
              const isActive = activeModule?.slug === mod.slug;
              const isHistory = moduleHistory.some((m) => m.slug === mod.slug) && !isActive;

              return (
                <div key={mod.slug} className="flex items-center gap-2 py-1 relative">
                  <StepDot
                    status={isActive ? "active" : isHistory ? "completed" : "pending"}
                  />
                  <span
                    className={`text-[10px] ${
                      isActive
                        ? "text-green-700 font-medium"
                        : "text-gray-600"
                    }`}
                  >
                    {mod.name}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Handoff section */}
      {handoffDetected && (
        <div className="flex items-center gap-2 mt-3 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded">
          <UserCheck className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span className="text-[10px] text-amber-800 font-medium">
            Handoff detectado
          </span>
        </div>
      )}
    </div>
  );
}
