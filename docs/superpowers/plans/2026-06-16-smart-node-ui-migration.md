# Smart Node UI Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate core canvas nodes toward the clean smart-card interaction pattern proven in `ImageNode`.

**Architecture:** Extract only the reusable geometry and interaction shell first, then migrate one low-risk node as a second sample. Business forms remain inside each node; the shared layer owns card measurement, external composer placement, outside-close behavior, and ReactFlow handle synchronization.

**Tech Stack:** React 19, TypeScript, @xyflow/react, existing `t8-*` theme CSS tokens.

---

## Migration Status 2026-06-20

### Shared foundation

- [x] `useNodeGeometrySync.ts`: shared multi-frame ReactFlow handle / geometry sync after resizing, variant switching, media load, and panel open/close.
- [x] `useOutsideClose.ts`: shared capture-phase outside-close guard, now ignores floating canvas UI such as prompt expand portals.
- [x] `useSmartNodePanelToggle.ts`: shared click-to-toggle / drag-to-close behavior, with movement threshold and interactive-element ignore rules.
- [x] `SmartNodeShell.tsx`: shared smart-card wrapper for card/composer ownership and geometry refs.
- [x] `SmartNodeComposer.tsx`: shared external composer panel container using global `t8-*` panel styles.

### Nodes already migrated or materially updated

- [x] `ImageNode.tsx`
  - Smart card keeps the node clean in normal state and moves dense prompt/model/options into the composer.
  - Generated image renders inside the node instead of automatically creating a separate output node in card mode.
  - Result preview supports single-click large preview, zoom controls, real original image size display, and edit / quick actions.
  - Regeneration uses a slower full-card progress overlay and darkens the old image instead of using a distracting flashing state.
  - Dragging and generated-image interaction regressions were fixed through the smart shell / pointer handling path.

- [x] `TextNode.tsx`
  - Smart card is simplified to direct text input with compact text metadata.
  - The old expanded bottom status/composer was removed for this node because text editing is the node's primary surface.
  - Style switching remains available from the compact card control.

- [x] `VideoNode.tsx`
  - Smart card supports compact video result display and external composer configuration.
  - Card size/aspect adapts to the generated or uploaded video ratio.
  - Classic node keeps a style-switch affordance so users can return to the card version.

- [x] `SeedanceNode.tsx`
  - SD2.0 video generation uses the shared smart-card video layout.
  - Dense model, ratio, reference material, and prompt controls move into the external composer.
  - Supports the SD2 model variants while keeping the normal card focused on generated video / status.

- [x] `AudioNode.tsx`
  - Smart audio card uses a cleaner audio-first result layout.
  - Generation controls and upstream material details live in the composer instead of crowding the card.
  - Result card layout was tightened so controls do not fight the waveform / audio preview.

- [x] `UploadNode.tsx`
  - Smart upload card supports cleaner empty and filled states.
  - Image cards adapt to source image aspect ratio where possible.
  - Permanent image info / edit bars were removed from the normal card surface and moved behind contextual interaction.
  - Empty-state dragging regression was fixed so upload cards remain movable even without material.

- [x] `OutputNode.tsx`
  - Result-card treatment exists for output media.
  - Image preview supports click-to-preview, zoom in/out with minimum at natural display size, and original size information.
  - Output card remains the reference for result-focused preview and downstream quick actions.

- [x] `MaterialSetNode.tsx`
  - Smart card normal state is now summary-first: type, count, and collection cover only.
  - Image sets render as a compact collage cover; text/video/audio sets use type-appropriate compact covers.
  - Full management controls live in the external composer: type switching, add/upload text, collect upstream, sort, import/export, split, clear, and thumbnail deletion.
  - Classic node is preserved and can be restored from the card switch.

- [x] `RunningHubNode.tsx`
  - Added the shared smart-card shell / composer path while preserving the classic dynamic parameter form.
  - Card normal state now shows only workflow identity, Webapp ID/status, parameter count, upstream count, and output count.
  - Webapp lookup, upstream preview/order, dynamic RH fields, instance type, run/stop, and output previews live in the composer.
  - Classic/card switching is available both ways and uses the shared geometry sync path.

- [x] `FalToolboxNode.tsx`
  - Added the shared smart-card shell / composer path while preserving the existing supermarket launcher and runner.
  - Card normal state now summarizes the selected FAL tool, capability/category status, upstream count, output count, and favorites.
  - Search, category filters, tool list, tool parameters, upstream inputs, run/stop, and output previews live in the composer.
  - Classic/card switching is available both ways and uses the shared geometry sync path.

### Prompt editing fixes that support smart nodes

- [x] `PromptExpandModal.tsx`: prompt expansion is marked as floating canvas UI and no longer closes the node composer when clicked.
- [x] `PromptExpandModal.tsx`: `Enter` saves, `Shift+Enter` inserts a newline, `Esc` cancels.
- [x] `MentionPromptInput.tsx` / `imeComposition.ts`: IME composition guard prevents first-letter leakage and broken Chinese/Japanese input while typing prompt text.
- [x] `PromptTextarea.tsx`: expanded prompt editing is shared across image, video, SD2, audio, LLM, 3D panorama, RH, ComfyUI, and settings JSON/list editors.

### Current recommended next targets

1. `RHToolsNode.tsx`: high-value and similar to RunningHub, but should be adapted per tool capability rather than copied blindly.
2. `ComfyUIStoreNode.tsx`: similar "app runner" class; should reuse the RunningHub/Fal shell lessons.
3. `PickFromSetNode.tsx` / `LoopNode.tsx`: utility companions for material sets; good candidates for compact operational cards.
4. Large workspace nodes such as `ClipStudioNode.tsx`, `DrawingBoardNode.tsx`, `Panorama3DNode.tsx`, and `DirectorStudioNode.tsx` should use an entry-card plus dedicated workspace pattern instead of being compressed into the same small smart card.

---

## Files

- Created: `src/components/nodes/shared/useNodeGeometrySync.ts`
- Created: `src/components/nodes/shared/useOutsideClose.ts`
- Created: `src/components/nodes/shared/useSmartNodePanelToggle.ts`
- Created: `src/components/nodes/shared/SmartNodeComposer.tsx`
- Created: `src/components/nodes/shared/SmartNodeShell.tsx`
- Modify: `src/components/nodes/ImageNode.tsx`
- Modify: `src/components/nodes/TextNode.tsx`
- Modify: `src/components/nodes/VideoNode.tsx`
- Modify: `src/components/nodes/SeedanceNode.tsx`
- Modify: `src/components/nodes/AudioNode.tsx`
- Modify: `src/components/nodes/UploadNode.tsx`
- Modify: `src/components/nodes/OutputNode.tsx`
- Modify: `src/components/nodes/MaterialSetNode.tsx`
- Modify: `src/components/nodes/RunningHubNode.tsx`
- Modify: `src/components/nodes/FalToolboxNode.tsx`
- Modify: `src/styles/theme-core.css`
- Modify: `src/styles/index.css`

## Chunk 1: Shared Hooks

### Task 1: Extract ReactFlow geometry sync hook

- [x] Create `useNodeGeometrySync.ts`.
- [x] Move the multi-frame `updateNodeInternals(id)` pattern out of `ImageNode`.
- [x] Keep call sites explicit: nodes call `syncGeometry()` after resize, variant switch, media natural size load, and composer open/close.
- [x] Run `npm run type-check`.

### Task 2: Extract outside close hook

- [x] Create `useOutsideClose.ts`.
- [x] Support enabled flag, capture-phase pointerdown, and one or more refs.
- [x] Preserve behavior: clicking inside card or composer does not close; clicking canvas/other node closes.
- [x] Run `npm run type-check`.

### Task 3: Extract smart panel toggle hook

- [x] Create `useSmartNodePanelToggle.ts`.
- [x] Own pointer movement threshold, drag-to-close, click-to-toggle, and input/button/nodrag ignore rules.
- [x] Keep the composer state local, not persisted in node data.
- [x] Run `npm run type-check`.

## Chunk 2: Keep ImageNode As Reference

### Task 4: Refactor ImageNode to shared hooks

- [x] Replace local geometry sync with `useNodeGeometrySync`.
- [x] Replace local outside close with `useOutsideClose`.
- [x] Replace pointer toggle logic with `useSmartNodePanelToggle`.
- [x] Do not change visual behavior in this chunk.
- [x] Browser verify: click opens, second click closes, outside click closes, drag does not open, style switch does not break edge positions.

## Chunk 3: TextNode Smart Card Sample

### Task 5: Add smart/classic variant to TextNode

- [x] Keep classic TextNode as fallback.
- [x] Add smart card default if consistent with ImageNode defaults.
- [x] Card normal state: direct text input plus compact text summary.
- [x] Remove composer/status panel for TextNode; text editing remains inline by design.
- [x] Keep existing resize and handle behavior stable.
- [x] Run `npm run type-check`.
- [x] Browser verify text node with an outgoing edge before/after resizing and variant switching.

## Chunk 4: Next Parallel Batch

### Task 6: Audio and Seedance in parallel after Chunk 3

- [x] `AudioNode.tsx` migrated to shared smart card / composer pattern.
- [x] `SeedanceNode.tsx` migrated to shared smart video card / composer pattern.
- [x] Shared CSS/hooks remain owned by the coordinator path.
- [x] Handles, composer close behavior, and generation button placement were verified during interactive iteration.

## Chunk 5: Additional Completed Nodes

### Task 7: VideoNode smart video card

- [x] Add smart/classic variant support.
- [x] Keep generated video in-card in smart mode.
- [x] Adapt card dimensions to video aspect ratio.
- [x] Keep style switching available from classic mode.

### Task 8: UploadNode smart material card

- [x] Add cleaner smart upload card for empty and filled states.
- [x] Preserve drag/drop and canvas dragging behavior.
- [x] Adapt image material card ratio to source image ratio where possible.
- [x] Move image info/edit affordances out of the permanent normal card surface.

### Task 9: OutputNode result card polish

- [x] Preserve result-card behavior for image/video/audio/text outputs.
- [x] Add click image preview with zoom controls.
- [x] Show original image dimensions in image info.
- [x] Keep edit and result actions available without permanently blocking media.

### Task 10: MaterialSetNode smart collection card

- [x] Add smart/classic variant support.
- [x] Keep the card normal state clean: type, count, and compact collection cover.
- [x] Move type selection, importing/exporting, sorting, collecting upstream, splitting, clearing, and thumbnail management into the external composer.
- [x] Preserve current material-set data model and legacy synchronization through `materialSetItemsToData`.
- [x] Keep drag sorting inside the composer from being stolen by ReactFlow node dragging.
- [x] Auto-collect same-kind upstream materials after connection changes in both smart-card and classic variants.
- [x] Use the shared `uiVariant` contract and global theme CSS classes so classic/card switching works both ways without reselecting the canvas.
- [x] Apply compact global-token styling to the card and classic surfaces; keep the normal card visually clean.

### Task 11: RunningHub and Fal smart app-runner cards

- [x] Add smart/classic variant support to `RunningHubNode.tsx`.
- [x] Move RunningHub Webapp ID lookup, dynamic parameters, upstream material ordering, and run/stop controls into the smart composer.
- [x] Add smart/classic variant support to `FalToolboxNode.tsx`.
- [x] Move Fal supermarket search/filter/list/runner surfaces into the smart composer instead of keeping the large panel as the normal node.
- [x] Use global `theme-core.css` classes for the new compact app-runner card styling.
- [x] Preserve classic mode and ensure both nodes can switch back to card mode immediately.

## Verification Checklist

- [x] `npm run type-check`
- [x] `npm run test -- tests/rhFalSmartNodeUi.test.ts tests/falToolbox.test.ts tests/rhToolbox.test.ts tests/rhTextBinding.test.ts`
- [x] `npm run test -- tests/materialSetSmartNode.test.ts`
- [x] ImageNode current behavior unchanged.
- [x] TextNode uses the simplified direct-input smart card.
- [x] Composer is absolute and does not affect ReactFlow node measurement.
- [x] Edges stay attached after variant switching and resizing.
- [x] Theme token styles apply in current visual themes.
- [x] `npm run test -- tests/promptEditor.test.ts tests/imeComposition.test.ts`
- [x] `npm run build`
