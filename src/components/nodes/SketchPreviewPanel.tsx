import { useMemo } from 'react';
import { AlertCircle, Code2 } from 'lucide-react';
import { buildGenClawSvgPreviewDocument } from '../../genclaw/preview';

interface SketchPreviewPanelProps {
  code: string;
  title?: string;
  className?: string;
}

export default function SketchPreviewPanel({
  code,
  title = 'SVG 预览',
  className = '',
}: SketchPreviewPanelProps) {
  const preview = useMemo(() => buildGenClawSvgPreviewDocument(code), [code]);

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-current/15 bg-black/20 ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-current/10 px-2 py-1.5 text-[10px] font-black opacity-80">
        <Code2 size={12} />
        <span>{title}</span>
      </div>
      {preview.html ? (
        <iframe
          title={title}
          sandbox=""
          srcDoc={preview.html}
          className="h-full min-h-0 w-full flex-1 border-0 bg-[#0b0f14]"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-1.5 p-3 text-center text-[11px] opacity-60">
          <AlertCircle size={13} />
          <span>{preview.error || 'SVG 预览不可用'}</span>
        </div>
      )}
    </div>
  );
}

