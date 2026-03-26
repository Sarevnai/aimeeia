import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface TemplatePreviewProps {
  name: string;
  body: string;
  components?: any[];
}

export function TemplatePreview({ name, body, components }: TemplatePreviewProps) {
  // Extract header text from components if available
  const header = components?.find((c: any) => c.type === "HEADER");
  const footer = components?.find((c: any) => c.type === "FOOTER");
  const buttons = components?.filter((c: any) => c.type === "BUTTONS");

  return (
    <div className="max-w-[320px]">
      <div className="bg-[#d9fdd3] rounded-lg p-3 shadow-sm border border-green-200/50">
        {/* Template badge */}
        <div className="flex items-center gap-1 mb-2">
          <FileText className="w-3 h-3 text-green-700" />
          <Badge
            variant="secondary"
            className="text-[9px] px-1.5 py-0 bg-green-100 text-green-800 hover:bg-green-100"
          >
            Template
          </Badge>
        </div>

        {/* Header */}
        {header?.text && (
          <p className="text-[13px] font-semibold text-gray-900 mb-1">
            {header.text}
          </p>
        )}

        {/* Body */}
        <p className="text-[13px] text-gray-800 leading-snug whitespace-pre-wrap">
          {body}
        </p>

        {/* Footer */}
        {footer?.text && (
          <p className="text-[11px] text-gray-500 mt-2">{footer.text}</p>
        )}

        {/* Buttons */}
        {buttons && buttons.length > 0 && (
          <div className="mt-2 border-t border-green-200 pt-2 space-y-1">
            {buttons.flatMap((btnGroup: any) =>
              (btnGroup.buttons || []).map((btn: any, idx: number) => (
                <div
                  key={idx}
                  className="text-center text-[12px] text-blue-600 py-1 border border-green-200 rounded"
                >
                  {btn.text}
                </div>
              ))
            )}
          </div>
        )}

        {/* Template name */}
        <p className="text-[9px] text-gray-400 mt-2 text-right italic">
          {name}
        </p>
      </div>
    </div>
  );
}
