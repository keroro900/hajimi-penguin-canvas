import { useMemo, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Camera, Clapperboard, Image as ImageIcon, Loader2, Video } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { uploadDataUrl, uploadFileBlob } from '../../services/imageOps';
import {
  buildDirectorPromptText,
  createDefaultDirectorProject,
  sanitizeDirectorProject,
  type DirectorProject,
} from '../../utils/directorProject';
import DirectorStudio from '../director/DirectorStudio';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

const handleStyle = { width: 12, height: 12 };

function collectModelUrls(data: any): string[] {
  const fields = ['modelUrl', 'directModelUrl'];
  const arrays = ['modelUrls', 'directModelUrls', 'urls'];
  const out: string[] = [];
  fields.forEach((field) => {
    const value = data?.[field];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  });
  arrays.forEach((field) => {
    const value = data?.[field];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string' && /\.(glb|gltf|obj|stl|fbx|usdz|zip)(\?|$)/i.test(item)) out.push(item.trim());
      });
    }
  });
  return Array.from(new Set(out));
}

function useUpstreamModelUrls(nodeId: string) {
  const connections = useNodeConnections({ id: nodeId, handleType: 'target' });
  const upstreamIds = useMemo(() => Array.from(new Set(connections.map((connection) => connection.source))), [connections]);
  const upstreamNodes = useNodesData(upstreamIds);
  return useMemo(() => {
    const urls: string[] = [];
    (Array.isArray(upstreamNodes) ? upstreamNodes : []).forEach((node: any) => {
      collectModelUrls(node?.data || {}).forEach((url) => urls.push(url));
    });
    return Array.from(new Set(urls));
  }, [upstreamNodes]);
}

const DirectorStudioNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const upstream = useUpstreamMaterials(id);
  const upstreamModels = useUpstreamModelUrls(id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = (data || {}) as any;
  const project = useMemo<DirectorProject>(() => {
    const base = d.directorProject || createDefaultDirectorProject();
    return sanitizeDirectorProject({
      ...base,
      assets: {
        images: upstream.images.map((item) => item.url),
        models: upstreamModels,
      },
    });
  }, [d.directorProject, upstream.images, upstreamModels]);
  const outputImage = typeof d.imageUrl === 'string' ? d.imageUrl : '';
  const outputVideo = typeof d.videoUrl === 'string' ? d.videoUrl : '';
  const status = typeof d.status === 'string' ? d.status : 'idle';

  const saveProject = (next: DirectorProject) => {
    update({
      directorMode: next.mode,
      directorProject: next,
      directorActorModelUrl: next.actor.modelUrl,
      directorActorSource: next.actor.source,
      outputText: buildDirectorPromptText(next),
      error: '',
    });
  };

  const handleCaptureImage = async (dataUrl: string) => {
    setBusy(true);
    update({ status: 'running', error: '' });
    try {
      const imageUrl = await uploadDataUrl(dataUrl, `director-studio-${Date.now()}`);
      update({
        imageUrl,
        imageUrls: [imageUrl],
        urls: [imageUrl],
        outputText: buildDirectorPromptText(project),
        status: 'success',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '导演台截屏上传失败' });
    } finally {
      setBusy(false);
    }
  };

  const handleCaptureVideo = async (blob: Blob) => {
    setBusy(true);
    update({ status: 'running', error: '' });
    try {
      const videoUrl = await uploadFileBlob(blob, `director-recording-${Date.now()}.webm`);
      update({
        videoUrl,
        videoUrls: [videoUrl],
        urls: [videoUrl],
        outputText: buildDirectorPromptText(project),
        status: 'success',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '导演台录制上传失败' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`t8-node relative flex h-[360px] w-[420px] flex-col overflow-hidden rounded-xl text-slate-100 ${selected ? 'is-selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.any || PORT_COLOR.text, left: -6 }} />
      <Handle type="source" id="text" position={Position.Right} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.text, right: -6, top: '42%' }} />
      <Handle type="source" id="image" position={Position.Right} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.image, right: -6, top: '54%' }} />
      <Handle type="source" id="video" position={Position.Right} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.video, right: -6, top: '66%' }} />

      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0b111c] px-3 py-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-cyan-300/30 bg-cyan-400/15 text-cyan-200">
          <Clapperboard size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">导演台</div>
          <div className="truncate text-[11px] text-slate-400">{project.mode === '3d' ? '3D 动作预演与机位录制' : '2D 分镜模式'}</div>
        </div>
        {busy || status === 'running' ? <Loader2 size={15} className="animate-spin text-sky-300" /> : null}
      </div>

      <div
        className="nodrag nopan flex flex-1 flex-col gap-3 p-3"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-[#05080d]">
          <div className="absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.12)_1px,transparent_1px)] bg-[size:24px_24px] [transform:perspective(360px)_rotateX(58deg)] [transform-origin:50%_100%]" />
          <div className="absolute left-1/2 top-[42%] h-20 w-10 -translate-x-1/2 -translate-y-1/2">
            <div className="mx-auto h-5 w-5 rounded-full bg-[#f8d8bd] shadow-[0_0_18px_rgba(248,216,189,0.35)]" />
            <div className="mx-auto mt-1 h-9 w-6 rounded-full bg-cyan-400/85 shadow-[0_14px_30px_rgba(34,211,238,0.22)]" />
            <div className="mx-auto mt-1 h-6 w-8 border-x-4 border-cyan-100/70" />
          </div>
          <div className="absolute left-3 top-3 rounded border border-white/10 bg-black/28 px-2 py-1 text-[10px] text-slate-300">
            全屏导演台
          </div>
        </div>

        <button
          type="button"
          className="nodrag nopan flex h-11 items-center justify-center gap-2 rounded-md border border-cyan-300/45 bg-cyan-400/18 text-sm font-semibold text-cyan-50 hover:bg-cyan-400/25"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <Clapperboard size={16} />
          打开导演台
        </button>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded border border-white/10 bg-white/6 p-2">
            <div className="text-slate-400">角色</div>
            <div className="mt-1 text-base font-semibold">{project.avatars.length}</div>
          </div>
          <div className="rounded border border-white/10 bg-white/6 p-2">
            <div className="text-slate-400">图片</div>
            <div className="mt-1 text-base font-semibold">{upstream.images.length}</div>
          </div>
          <div className="rounded border border-white/10 bg-white/6 p-2">
            <div className="text-slate-400">模型</div>
            <div className="mt-1 text-base font-semibold">{upstreamModels.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded border border-white/10 bg-white/6 px-2 py-1.5 text-slate-300">
            <ImageIcon size={13} />
            {outputImage ? '已有截图' : '未截屏'}
          </div>
          <div className="flex items-center gap-1.5 rounded border border-white/10 bg-white/6 px-2 py-1.5 text-slate-300">
            <Video size={13} />
            {outputVideo ? '已有视频' : '未录制'}
          </div>
        </div>

        {d.error ? <div className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">{d.error}</div> : null}
      </div>

      <DirectorStudio
        open={open}
        project={project}
        upstreamImages={upstream.images.map((item) => item.url)}
        upstreamModels={upstreamModels}
        onClose={() => setOpen(false)}
        onProjectChange={saveProject}
        onCaptureImage={handleCaptureImage}
        onCaptureVideo={handleCaptureVideo}
      />
    </div>
  );
};

export default DirectorStudioNode;
