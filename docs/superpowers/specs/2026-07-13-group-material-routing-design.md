# Group Material Routing Design

## Status

Approved direction. This specification defines the implementation contract for turning `groupBox` from a visual container with aggregate output into a bidirectional material-routing boundary.

## Goals

- Let image, video, audio, text, upload, material-set, and other material-producing nodes connect into a group.
- Broadcast group inputs only to compatible entry nodes inside that group.
- Keep group input virtual: do not create hidden edges and do not copy values into member-local upload fields.
- Expose a group output containing incoming group materials, member-local uploads, and member outputs.
- Support node-to-group, group-to-node, and group-to-group routing with the same material semantics.
- Preserve source order and provenance while preventing duplicate media and feedback loops.
- Keep group execution dependency-aware and separate from material propagation.

## Non-Goals

- Physical nesting of one `groupBox` inside another.
- Automatically running an upstream group when a downstream group runs.
- Persisting transient group inputs into `localRefImages`, `localRefVideos`, or other member-local fields.
- Creating or displaying one edge per group member.
- Adding per-model routing rules to the group component.

## Existing Behavior

- Membership is derived live from node centers inside the group rectangle and mirrored to `data.memberIds`.
- A group already has a `group-out` source handle.
- `GroupBoxNode` aggregates selected member data fields into its own data for ordinary downstream nodes.
- Ordinary nodes use `useUpstreamMaterials(nodeId)` to read direct incoming edges.
- Groups have no target handle, and member nodes cannot see edges targeting their group.
- Group execution already creates dependency stages from internal member-to-member edges.

## Chosen Approach

Use virtual route expansion in the shared material resolver.

The visible graph contains one edge from a producer to the group. A pure routing module expands that edge at read time for the group's entry members. No synthetic React Flow edges are persisted. Disconnecting the visible edge immediately removes the virtual inputs.

Rejected alternatives:

1. Hidden fan-out edges require continuous maintenance when nodes enter, leave, move, copy, or delete groups.
2. Copying group input into member data turns transient input into permanent local uploads and makes disconnect semantics unreliable.

## Data Model

Introduce a canonical material bundle used by group routing:

```ts
type GroupMaterialKind = 'text' | 'image' | 'video' | 'audio';

interface GroupMaterialItem {
  id: string;
  kind: GroupMaterialKind;
  value: string;
  sourceNodeId: string;
  sourceGroupPath: string[];
  sourceField?: string;
  label?: string;
  order: number;
  origin: 'upstream' | 'local';
  mentionKey?: string;
  mentionToken?: string;
  rhNodeId?: string;
  sourceNodeSerialId?: number;
  originEdgeId?: string;
  sourceHandle?: string | null;
  portType?: GroupMaterialKind | 'any';
}

interface GroupMaterialBundle {
  texts: GroupMaterialItem[];
  images: GroupMaterialItem[];
  videos: GroupMaterialItem[];
  audios: GroupMaterialItem[];
}
```

The bundle is a runtime representation and must losslessly map the existing `Material` contract. Persisted group data remains compatible with existing nodes through `prompt`, `text`, `reply`, `imageUrl`, `imageUrls`, `urls`, `videoUrl`, `videoUrls`, `audioUrl`, and `audioUrls`.

For ordinary items, deduplication uses `kind + normalized value`, where normalization is trim-only: text and URLs keep original case, query strings, fragments, and encoding. Intentional slots use `kind + sourceNodeId + sourceField/slot` so equal values in separate slots survive. The first occurrence wins. Incoming edge order is persisted React Flow edge-array order, with edge id as deterministic fallback when an imported graph lacks stable array order; member order is persisted node-array order.

This deduplication applies at group merge boundaries, not to existing direct node-to-node material collection. Intentional duplicate slots from one material set remain distinct by retaining their material-set slot identity. The same media value arriving through independent group paths is collapsed once.

## Membership And Entry Nodes

The routing module uses the same rectangle-center membership rule as `GroupBoxNode` and Canvas group operations. This logic must be extracted into a shared pure utility so rendering, execution, deletion, clipboard behavior, and routing cannot disagree.

Runtime membership is geometry-only. `data.memberIds` becomes a derived persistence/cache field and never grants membership to a node whose center is outside the current group rectangle. Bounds are inclusive. Shared size resolution uses measured width/height, then explicit node width/height, then the existing group/non-group fallback dimensions.

For a group, an entry node is a live member with no statically material-carrying edge from another live member of the same group.

- Edges entering the group itself do not disqualify an entry node.
- Edges from outside directly into a member do not disqualify it; direct and group input are both available and deduplicated.
- A member with an internal material upstream receives materials through that internal path and does not receive the group broadcast directly.
- Material-carrying topology is determined from edge `data.portType`, source output capabilities, and target input capabilities, never from whether source data is currently populated. Control-only edges do not remove entry status.
- Non-material/executable helper nodes may be entry nodes, but each consumer only receives the kinds it already supports.

If overlapping groups both contain the same entry node, inputs from both groups are merged and deduplicated. This preserves current geometric group behavior without inventing hidden ownership.

## Input Routing

Add one target handle to the left side of `GroupBoxNode`:

- Handle id: `group-in`
- Type: target
- Port type: any material
- Multiple incoming edges are allowed.

For an ordinary member node, `useUpstreamMaterials(nodeId)` resolves:

1. Materials from its direct incoming edges.
2. For every containing group where the node is an entry, materials from edges targeting that group.
3. A stable merge in visible edge order, followed by existing kind-aware filtering and deduplication.

Each virtual route descriptor retains its originating edge id, `sourceHandle`, and `portType`. Allowed virtual kinds are the intersection of the group-input edge kinds and the member node's declared input kinds from the port registry. `any` means all material kinds. For nodes with multiple target handles, virtual group input feeds the node's general material collector and uses the union of declared material input kinds; it does not impersonate a specialized target handle.

The input bundle can contain uploaded/local materials and generated outputs because extraction uses the same canonical node-data material collector as direct edges.

No member data is mutated when group input changes.

## Output Routing

The `group-out` handle exposes a merged bundle containing:

1. Materials arriving at `group-in` (pass-through input).
2. Member-local uploaded/reference materials.
3. Member generated/output materials.
4. Member text outputs and compatible legacy text fields.

The output merge order is incoming group edges first, then live members in canvas/node order, then each member's stable field order. Duplicate values are emitted once.

The group writes compatibility fields to its own data only when the bundle signature changes. It must include plural video and audio fields, not only the current singular values.

Group-to-group connections use recursive runtime bundle resolution. Original items retain their `sourceNodeId` and append each traversed group to `sourceGroupPath`; they are not reconstructed from flattened compatibility fields. Compatibility fields remain a fallback for ordinary downstream nodes and legacy saved canvases, not the canonical group-to-group path.

## Port Filtering

Existing edge `data.portType` behavior remains authoritative:

- `image` carries only images.
- `video` carries only videos.
- `audio` carries only audio.
- `text` carries only text.
- Missing or `any` carries all four kinds.

The group handles are visually single handles. Future typed handles can reuse the same bundle without changing routing architecture.

## Connection Safety

Reject these connections before adding an edge:

- A group connected to itself.
- A member connected into a group that currently contains that member.
- A group connected to one of its own members.
- Any group-to-group or group/member connection that creates a directed cycle after virtual group expansion.

One pure `validateMaterialConnection(nodes, edges, candidate, replacedEdgeId?)` function is authoritative for single-edge operations. Batch operations use `validateMaterialConnections(nodes, edges, candidates, replacedEdgeIds?)`, which validates candidates sequentially in deterministic input order against the graph accumulated from previously accepted candidates. Invalid candidates are skipped with diagnostics; valid siblings remain. This contract applies to `onConnect`, `onReconnect`, bulk reconnect/move, linked paste, and any other path that inserts or replaces edges.

Cycle detection operates on an expanded dependency graph with separate input/output vertices for each group:

- Incoming visible edges terminate at `groupIn`, including for an empty group.
- `groupIn` has arcs to entry members.
- `groupIn -> groupOut` represents pass-through input.
- Members aggregate into `groupOut`.
- Outgoing visible group edges originate at `groupOut`.
- There is no implicit `groupOut -> groupIn` arc.

Runtime resolution also keeps a visited group/source path as a defensive guard for old canvases that already contain invalid cycles. A cyclic branch contributes no materials and reports a development diagnostic; acyclic sibling branches continue.

## Execution Semantics

Material propagation is reactive and does not run nodes.

Clicking Run on a group continues to execute only that group's executable members. The existing topological execution plan remains the base, with these clarifications:

- Group inputs are available before stage one starts.
- Entry nodes form stage one unless internal dependencies require otherwise.
- Internal edges determine later stages.
- Running a downstream group does not automatically run an upstream group.
- Multi-select Run may explicitly include both groups, but this feature does not add cross-group execution ordering. Data follows the current completed state of the source group; users run upstream first when fresh upstream generation is required.

## UI Behavior

- Add a left input handle matching the existing right output handle.
- Input handle tooltip shows incoming counts by kind.
- Output handle tooltip shows merged outgoing counts by kind.
- The group header shows a compact input/output summary when either side contains materials, for example `IN 2图 1视频 · OUT 8图`.
- Dropping a connection on the group body resolves directly to `group-in` instead of opening the node picker, subject to the same cycle validator.
- Existing resize, drag, rename, color, Run, and delete interactions remain unchanged.
- No instructional card or permanent explanatory text is added inside the group.

## Components And Boundaries

### `src/utils/groupMembership.ts`

Pure geometry and membership helpers shared by Canvas, `GroupBoxNode`, clipboard code where practical, execution planning, and routing.

### `src/utils/groupMaterialRouting.ts`

Pure functions for entry-node discovery, virtual source resolution, bundle merge/deduplication, expanded-cycle checks, and compatibility-data conversion.

It builds a shared snapshot-level route index. A module-level bounded cache owns the index so all hook consumers reuse the same build. It uses two explicit keys:

- Geometry key: node ids/types/positions plus resolved dimensions, including group width/height fields.
- Topology key: edge ids/endpoints/source handles/target handles/port types plus node port-capability types.

Source data is not part of either key and is subscribed to separately through resolved source ids. The cache contains group membership, entry maps, group input route descriptors, per-member virtual source ids, and split `groupIn`/`groupOut` dependency arcs.

### `src/components/nodes/useUpstreamMaterials.ts`

Consumes virtual sources in addition to direct sources. Existing node call sites remain unchanged.

### `src/components/nodes/GroupBoxNode.tsx`

Renders the target handle, computes incoming and outgoing bundles through shared helpers, and mirrors the output compatibility fields to group data.

### `src/components/Canvas.tsx`

Uses shared membership and the single material connection validator for connect, reconnect, bulk edge changes, and linked-paste insertion. It does not create synthetic fan-out edges.

### `src/config/portTypes.ts`

Declares `groupBox` as accepting and producing any material: `groupBox: { inputs: ['any'], outputs: ['any'] }`. This is required before Canvas connection validation will accept `group-in`.

## Performance

- All routing primitives are pure and signature-based.
- Store selectors return stable route/member signatures and rerender only when membership, relevant edges, or source data change.
- Group data is updated only when the outgoing bundle signature changes.
- Do not scan and serialize the complete canvas in each member component when unrelated node data changes.
- Build group membership, entry maps, and virtual source ids once per geometry/topology signature and reuse the index across consumers.
- A node movement invalidates membership-dependent signatures, but unrelated source-data updates do not rebuild geometry indexes.

## Error And Edge Cases

- Empty group: accepts input and passes it through its output, but has no broadcast recipients.
- No group input: output still aggregates member uploads and outputs as today.
- Failed member: successful member outputs and pass-through inputs remain available; failure state is not converted into material.
- Member moved into a group: it begins receiving group input only if it is an entry node.
- Member moved out: virtual input disappears immediately; local uploads remain untouched.
- Disconnected group input: virtual materials disappear from entry nodes and group pass-through output.
- Deleted source/group: stale routes are ignored.
- Duplicate media from input and member output: emitted once, preserving the first source.

## Clipboard And Duplication

- Plain paste and quick duplicate preserve edges only when both edge endpoints are part of the copied fragment, matching existing behavior.
- Linked paste may preserve external group input/output edges and must run every restored edge through `validateMaterialConnection`.
- Copying only a group copies the group and its geometry-derived members, but no external edges in plain mode.
- Copying two connected groups preserves their inter-group edge because both endpoints are copied.
- Pasted `memberIds` is recomputed/derived from remapped geometry and cannot restore stale membership.
- Multi-edge paste/reconnect skips only invalid cyclic edges, keeps accepted siblings, and emits one consolidated diagnostic listing skipped edge ids.

## Testing

### Pure routing tests

- Live membership matches rectangle-center behavior.
- Entry nodes exclude members with internal upstream edges.
- Direct external edges do not remove entry status.
- One group input expands to every entry node and no non-entry node.
- Multiple inputs and overlapping groups merge deterministically.
- Group output includes pass-through input, local uploads, and generated outputs.
- Text/image/video/audio deduplication preserves order.
- Group-to-group routing reaches the second group's entry nodes.
- Self/member/group and expanded cycles are rejected.

### Hook/component tests

- Existing nodes receive virtual group materials without component-specific changes.
- Disconnect and move-in/move-out update materials reactively.
- Group compatibility data includes singular and plural fields.
- Group data updates do not loop when the bundle is unchanged.
- Both handles render with stable dimensions and correct connectability.

### Canvas integration tests

- Node-to-group, group-to-node, and group-to-group edges persist through save/load and clipboard operations.
- Group Run uses internal dependency stages while inputs are already visible.
- Deleting a group removes its visible edges but does not mutate member uploads.
- Large groups do not cause unrelated node rerender regressions.
- Instrumented render/selector tests verify that an unrelated node-data update does not recompute every group/member route, while moving a member invalidates the affected route signature.

## Acceptance Criteria

1. Connecting an upload/image/video/material-set node to a group makes its materials visible in every compatible entry member.
2. Non-entry members receive those materials through internal edges only.
3. A group output contains group inputs, member uploads, and member results with stable deduplication.
4. Connecting group A to group B gives B's entry members A's complete output bundle.
5. Disconnecting or moving nodes changes virtual routing immediately without altering local reference fields.
6. Invalid feedback connections are blocked.
7. Existing direct node connections and existing group aggregate output behavior remain compatible.
8. Targeted routing, component, type-check, and canvas regression tests pass.
9. All edge insertion and replacement paths use the common material connection validator.
