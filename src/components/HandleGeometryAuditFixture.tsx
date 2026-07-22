import { useEffect } from 'react';
import {
  Handle,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BUILT_IN_THEME_TEMPLATES } from '../theme/defaultTemplates';
import { installFocusVisibleAudit } from '../utils/focusVisibleAudit';
import { installHandleGeometryAudit } from '../utils/handleGeometryAudit';

type AuditNodeData = { label: string; variant: 'regular' | 'smart' | 'groupBox' | 'phantom' | 'overlap' | 'obstruction' };

function AuditPort({
  id,
  type,
  position,
  variant,
  edgeId,
  edgeEnd,
}: {
  id: string;
  type: 'source' | 'target';
  position: Position;
  variant: AuditNodeData['variant'];
  edgeId: string;
  edgeEnd: 'source' | 'target';
}) {
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      className={`${variant === 'smart' ? 't8-smart-node-port' : ''} ${variant === 'groupBox' ? 't8-group-box__handle' : ''} ${variant === 'phantom' ? 't8-bulk-phantom-handle' : ''}`}
      data-handle-audit="true"
      data-handle-id={id}
      data-variant={variant}
      data-side={position === Position.Left ? 'left' : 'right'}
      data-edge-id={edgeId}
      data-edge-end={edgeEnd}
    />
  );
}

function RegularAuditNode({ data }: NodeProps<Node<AuditNodeData>>) {
  return (
    <div className="contents">
      <div className="t8-node overflow-hidden" data-audit-handle-owner="regular" style={{ width: 180, height: 110, position: 'relative' }}>
        {data.label}
        <AuditPort id="regular-out" type="source" position={Position.Right} variant="regular" edgeId="regular-smart" edgeEnd="source" />
        <div data-audit-inner-clip className="overflow-hidden" style={{ width: 32, height: 18 }}>clip</div>
      </div>
    </div>
  );
}

function SmartAuditNode({ data }: NodeProps<Node<AuditNodeData>>) {
  return (
    <div className="t8-smart-node-shell" style={{ position: 'relative' }}>
      <div className="t8-node t8-smart-node-card t8-smart-node-card--regenerating overflow-hidden" data-audit-handle-owner="smart" style={{ width: 190, height: 110 }}>
        <AuditPort id="smart-in" type="target" position={Position.Left} variant="smart" edgeId="regular-smart" edgeEnd="target" />
        <div className="t8-smart-node-card__header">{data.label} header</div>
        <div className="t8-smart-node-preview overflow-hidden" style={{ width: 52, height: 24 }}>preview</div>
      </div>
    </div>
  );
}

function GroupAuditNode({ data }: NodeProps<Node<AuditNodeData>>) {
  return (
    <div className="t8-group-box" data-audit-handle-owner="groupBox" style={{ width: 200, height: 125, position: 'relative', overflow: 'visible' }}>
      {data.label}
      <AuditPort id="group-out" type="source" position={Position.Right} variant="groupBox" edgeId="group-overlap" edgeEnd="source" />
    </div>
  );
}

function OverlapAuditNode({ data }: NodeProps<Node<AuditNodeData>>) {
  return (
    <div className="t8-node overflow-hidden" data-audit-handle-owner="overlap" style={{ width: 190, height: 125, position: 'relative' }}>
      {data.label}
      <AuditPort id="overlap-in" type="target" position={Position.Left} variant="overlap" edgeId="group-overlap" edgeEnd="target" />
    </div>
  );
}

function ObstructionAuditNode() {
  return (
    <div aria-label="overlap obstruction" style={{ width: 38, height: 38, background: '#d946ef' }}>hit</div>
  );
}

function PhantomAuditNode() {
  return (
    <div data-audit-handle-owner="phantom" style={{ width: 1, height: 1, position: 'relative', overflow: 'visible' }}>
      <AuditPort id="phantom-out" type="source" position={Position.Right} variant="phantom" edgeId="phantom-overlap" edgeEnd="source" />
    </div>
  );
}

const AUDIT_NODE_TYPES: NodeTypes = {
  auditRegular: RegularAuditNode,
  auditSmart: SmartAuditNode,
  auditGroup: GroupAuditNode,
  auditOverlap: OverlapAuditNode,
  auditObstruction: ObstructionAuditNode,
  auditPhantom: PhantomAuditNode,
};

const AUDIT_NODES: Node<AuditNodeData>[] = [
  { id: 'regular-node', type: 'auditRegular', position: { x: 70, y: 80 }, data: { label: 'regular', variant: 'regular' } },
  { id: 'smart-node', type: 'auditSmart', position: { x: 470, y: 80 }, data: { label: 'smart', variant: 'smart' } },
  { id: 'group-node', type: 'auditGroup', position: { x: 70, y: 300 }, data: { label: 'GroupBox', variant: 'groupBox' } },
  { id: 'overlap-node', type: 'auditOverlap', position: { x: 470, y: 300 }, selected: true, data: { label: 'overlap', variant: 'overlap' } },
  { id: 'obstruction-node', type: 'auditObstruction', position: { x: 445, y: 343.5 }, data: { label: 'obstruction', variant: 'obstruction' } },
  { id: 'phantom-node', type: 'auditPhantom', position: { x: 270, y: 480 }, data: { label: 'phantom', variant: 'phantom' } },
];

const AUDIT_EDGES: Edge[] = [
  { id: 'regular-smart', source: 'regular-node', sourceHandle: 'regular-out', target: 'smart-node', targetHandle: 'smart-in' },
  { id: 'group-overlap', source: 'group-node', sourceHandle: 'group-out', target: 'overlap-node', targetHandle: 'overlap-in' },
  { id: 'phantom-overlap', source: 'phantom-node', sourceHandle: 'phantom-out', target: 'overlap-node', targetHandle: 'overlap-in' },
];

function AuditRuntimeBridge() {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    const uninstallHandleAudit = installHandleGeometryAudit();
    const uninstallFocusAudit = installFocusVisibleAudit();
    window.__t8RefreshHandleGeometry = () => new Promise<void>((resolve) => {
      updateNodeInternals(AUDIT_NODES.map(({ id }) => id));
      requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });
    return () => {
      delete window.__t8RefreshHandleGeometry;
      uninstallFocusAudit();
      uninstallHandleAudit();
    };
  }, [updateNodeInternals]);
  return null;
}

export default function HandleGeometryAuditFixture() {
  return (
    <main className="t8-canvas-shell t8-handle-audit-fixture" data-template-count={BUILT_IN_THEME_TEMPLATES.length} style={{ width: 900, height: 650, margin: 20, overflow: 'visible' }}>
      <div className="t8-control-rail" style={{ position: 'absolute', left: 16, top: 16, zIndex: 20 }}>
        <button type="button" className="t8-control-rail-help" data-focus-audit="canvas-action" aria-label="Canvas help">?</button>
      </div>
      <div className="t8-smart-node-composer" style={{ position: 'absolute', right: 16, top: 16, zIndex: 20 }}>
        <button type="button" className="t8-btn t8-btn-primary t8-smart-run-btn" data-focus-audit="composer-action">Generate</button>
      </div>
      <ReactFlow
        nodes={AUDIT_NODES}
        edges={AUDIT_EDGES}
        nodeTypes={AUDIT_NODE_TYPES}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={1}
        maxZoom={1}
        nodesDraggable={false}
        nodesConnectable
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
      >
        <AuditRuntimeBridge />
      </ReactFlow>
    </main>
  );
}
