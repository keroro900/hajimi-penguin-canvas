import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Type } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';

/**
 * 文本节点 - 提示词输入
 * 输出 data.prompt 给下游(图像/LLM 节点通过连接读取)
 */
const TextNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const text = ((data as any)?.prompt as string) || '';

  return (
    <div
      className={`relative rounded-xl border-2 transition-all w-[260px] ${
        selected ? 'border-sky-400 shadow-2xl shadow-sky-500/20' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(20,20,22,.92)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!bg-sky-400 !border-0" />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: 'rgba(14,165,233,.18)', color: '#7dd3fc', boxShadow: 'inset 0 0 0 1px rgba(14,165,233,.4)' }}
        >
          <Type size={13} />
        </div>
        <div className="flex-1 text-sm font-semibold text-white">文本</div>
        <span className="text-[10px] text-white/30">prompt</span>
      </div>

      <div className="p-2.5">
        <textarea
          value={text}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="输入提示词..."
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="w-full h-24 resize-none rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30 placeholder:text-white/30"
          // 阻止 reactflow 拖拽冒泡
          onMouseDown={(e) => e.stopPropagation()}
        />
        <div className="text-[10px] text-white/30 mt-1 flex justify-between">
          <span>{text.length} 字符</span>
          <span>→ 输出到下游节点</span>
        </div>
      </div>
    </div>
  );
};

export default memo(TextNode);
