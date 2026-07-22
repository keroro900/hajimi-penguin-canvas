import { Position } from '@xyflow/react';

// React Flow anchors horizontal edges at the Handle's outer edge. The largest
// 16px handle sits 19px outside the node, so the path must travel 19 + 8px back.
export const CARD_EDGE_HANDLE_OFFSET = 27;

export function attachEdgeEndpointToCard(
  coordinate: number,
  position: Position,
  nodeType?: string | null,
): number {
  if (nodeType === 'groupBox') return coordinate;
  if (position === Position.Left) return coordinate + CARD_EDGE_HANDLE_OFFSET;
  if (position === Position.Right) return coordinate - CARD_EDGE_HANDLE_OFFSET;
  return coordinate;
}
