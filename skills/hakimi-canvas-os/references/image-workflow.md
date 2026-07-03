# Image Workflow

## Trigger

Use this module for image generation workflows, prompt planning, reference images, gpt-image-2 requests, generated bitmap placement, comparison lanes, and refinement loops on Hakimi canvas.

## Workflow

1. Read the canvas and locate reference images, prompt nodes, model nodes, and output nodes.
2. Add or preview a compact workflow lane: reference asset, displayable image generation node, review notes.
3. Put the full prompt directly on the image node as `data.prompt`.
4. Use explicit model settings: `model`, `apiModel`, `sizeLevel`, `quality`, `referenceImages`, `negativePrompt`, and prompt text.
5. For canvas-first generation, submit a `run_node` action for the prepared image node. This triggers the real frontend image node generation path and uses the node's selected model, ratio, size, references, and provider settings.
6. Only call `hakimi_canvas_generate_image` or the backend image proxy when a non-interactive agent has no active canvas frontend; if you do, copy the exact request settings from the image node data and write returned URLs back to that node.
7. Place the returned bitmap on the same `type: "image"` node when it is the runnable generation card, or create a new named variant image node when preserving the previous output.
8. Read back the canvas and verify generated URL, prompt lineage, reference URLs, model metadata, and placement.

## Display Rules

- Generated bitmap results should normally stay on the same `type: "image"` node: set `data.imageUrl` and `data.imageUrls` so the node displays the result while keeping RUN, prompt, model, and reference controls.
- Treat the same image node as the generation config record: keep `data.model`, `data.apiModel`, `data.sizeLevel`, `data.referenceImages`, `data.prompt`, and `data.negativePrompt` on it.
- Do not use Codex CLI `image_generation`, `imagen`, or `imagegen` for canvas image tasks. The canvas image node is the generation surface.
- A `type: "image"` node without `data.imageUrl` is a generator/config placeholder until generation finishes.
- Use `type: "upload"` mainly for static imported/reference assets, not as the primary generation result card.
- Do not create separate prompt text nodes unless the prompt needs to be edited or reused independently.

## Accuracy Rules

- Preserve every reference image URL and label it on the canvas.
- Split creative intent from technical constraints in node data.
- Prefer one change per variant: colorway, layout, garment type, background, print scale, lighting, or camera angle.
- For image edits, include the source image node id and source URL in the result node data.
- Do not overwrite a previous result node unless the user asked to update that named target.
