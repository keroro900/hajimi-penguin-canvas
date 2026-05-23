import { useMemo } from 'react';
import { useNodeConnections, useNodesData } from '@xyflow/react';

/**
 * useUpstreamMaterials - 通用「上游素材聚合」hook
 *
 * 职责: 订阅当前节点 target 侧所有上游连接的 data 变化, 派生出
 *       { texts, images, videos, audios } 四类素材列表, 每项带:
 *         - id           : 唯一 key (供 dnd-kit / React key 使用)
 *         - kind         : 'text' | 'image' | 'video' | 'audio'
 *         - url          : 资源 URL (text 类型时是文本内容)
 *         - sourceNodeId : 来源节点 id (用于跳到来源 / 显示标签)
 *         - origin       : 'upstream' (本 hook 永远是 upstream, local 由调用方追加)
 *         - label        : 显示用的简短标签 (文件名 / 文本前缀)
 *
 * 渲染联动:
 *   - useNodeConnections({ handleType: 'target' }) 订阅连入连接, 任何连/断连触发重渲染
 *   - useNodesData(upstreamIds) 订阅上游节点 data, 任何上游 data 变化触发重渲染
 *   - useMemo deps 仅依赖 upstreamNodes (xyflow 内部已稳定化), 不会循环
 *
 * 兜底:
 *   - 若 imageUrl 字段实为视频/音频扩展名, 按扩展名纠正到对应 kind
 *   - 跨上游同 url 去重 (避免同一图被两个节点都暴露时重复显示)
 */

export type MaterialKind = 'text' | 'image' | 'video' | 'audio';

export interface Material {
  id: string;
  kind: MaterialKind;
  url: string;
  sourceNodeId: string;
  origin: 'upstream' | 'local';
  label?: string;
}

export interface UpstreamMaterials {
  texts: Material[];
  images: Material[];
  videos: Material[];
  audios: Material[];
}

const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i;

export function useUpstreamMaterials(nodeId: string): UpstreamMaterials {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const upstreamIds = useMemo(
    () => Array.from(new Set(conns.map((c) => c.source))),
    [conns]
  );
  const upstreamNodes = useNodesData(upstreamIds);

  return useMemo<UpstreamMaterials>(() => {
    const texts: Material[] = [];
    const images: Material[] = [];
    const videos: Material[] = [];
    const audios: Material[] = [];
    const seen = new Set<string>();

    const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];

    // === 「被 LLM 消化」文本跳过集 ===
    // 场景: TextNode “原始 prompt” 同时连到 LLMNode 和下游生成节点 (Image/Video/Audio/Seedance/SD2.0/Output 等)。
    //   下游期望只看到 LLM 优化后的 reply, 不要再看到原始 prompt。
    //
    // 实现: LLMNode 生成成功时会 update({ consumedTexts: [上游文本数组] }) 记录被消化的文本。
    //   这里扫描所有上游, 取并集加入 skipSet, 下面 pushText 时跳过。
    //
    // 边界:
    //   - 仅当该上游同时有 reply (已生成) 才启用 skip, 避免未生成时误屏蔽。
    //   - skipSet 包含空串也不会误伤 (pushText 原本就忽略空串)。
    const skipTextSet = new Set<string>();
    for (const n of list) {
      const ud: any = n?.data || {};
      const hasReply = typeof ud.reply === 'string' && ud.reply.trim().length > 0;
      if (!hasReply) continue;
      if (Array.isArray(ud.consumedTexts)) {
        for (const t of ud.consumedTexts) {
          if (typeof t === 'string') {
            const s = t.trim();
            if (s) skipTextSet.add(s);
          }
        }
      }
    }

    const pushText = (sourceId: string, v: any) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      if (skipTextSet.has(s)) return; // 已被 LLM 消化
      const dedupeKey = `text:${s}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      texts.push({
        id: `${sourceId}::${dedupeKey}`,
        kind: 'text',
        url: s,
        sourceNodeId: sourceId,
        origin: 'upstream',
        label: s.length > 24 ? s.slice(0, 22) + '…' : s,
      });
    };

    const pushUrl = (
      sourceId: string,
      kind: MaterialKind,
      v: any,
      arr: Material[],
    ) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      const dedupeKey = `${kind}:${s}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      arr.push({
        id: `${sourceId}::${dedupeKey}`,
        kind,
        url: s,
        sourceNodeId: sourceId,
        origin: 'upstream',
        label: (s.split('/').pop() || s).slice(0, 28),
      });
    };

    for (const n of list) {
      if (!n) continue;
      const sid = n.id;
      const ud: any = n.data || {};

      // 文本: outputText (用户编辑覆盖) > reply > prompt > text
      pushText(sid, ud.outputText);
      pushText(sid, ud.reply);
      pushText(sid, ud.prompt);
      pushText(sid, ud.text);

      // 图像: 单 + 多
      pushUrl(sid, 'image', ud.imageUrl, images);
      const arrFields = ['imageUrls', 'urls', 'generatedImages'];
      for (const f of arrFields) {
        const v = ud[f];
        if (Array.isArray(v)) {
          for (const u of v) pushUrl(sid, 'image', u, images);
        }
      }

      // 视频
      pushUrl(sid, 'video', ud.videoUrl, videos);

      // 音频 (audioUrl 主轨, audioUrl_1 副轨——AudioNode 双输出口)
      pushUrl(sid, 'audio', ud.audioUrl, audios);
      pushUrl(sid, 'audio', ud.audioUrl_1, audios);
    }

    // 兜底: 一些节点把视频/音频塞在 imageUrl, 通过扩展名识别再纠正
    const fixedImages: Material[] = [];
    for (const m of images) {
      if (VIDEO_RE.test(m.url)) {
        videos.push({ ...m, kind: 'video' });
        continue;
      }
      if (AUDIO_RE.test(m.url)) {
        audios.push({ ...m, kind: 'audio' });
        continue;
      }
      fixedImages.push(m);
    }

    return { texts, images: fixedImages, videos, audios };
  }, [upstreamNodes]);
}
