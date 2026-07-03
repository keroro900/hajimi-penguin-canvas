# Apparel Design

## Trigger

Use this module for clothing second development, prints, garments, children's apparel, e-commerce product images, mockups, colorways, fabric notes, and print-to-garment visual prompts.

## Workflow

1. Read the canvas and identify the print image, target garment, audience, season, and commerce channel.
2. Build a lane for apparel second development: print analysis, garment direction, placement map, image node prompt variants, generated mockups, review notes.
3. If a model/try-on shot is requested, separate garment design, model description, pose, camera, background, and safety constraints.
4. Keep print fidelity explicit: motif scale, repeat direction, crop area, color preservation, and garment placement.
5. Generate variants through the Hakimi image workflow, preferably changing one garment/color/layout variable at a time.
6. Add comparison notes for sellability, brand fit, production feasibility, and print accuracy.
7. Read back the canvas and verify that every generated mockup links to the source print and exact prompt.

## Canvas Node Rules

- Put the production prompt on the image node as `data.prompt`; avoid extra prompt-only text nodes unless the prompt itself is a reusable deliverable.
- Generated apparel mockups should be visible image result nodes: use `type: "image"` with `data.prompt`, `data.imageUrl`, and `data.imageUrls` so the same node shows the garment and remains runnable/editable.
- Use `type: "upload"` for static reference prints or imported assets.
- A `type: "image"` node without `data.imageUrl` is only a generator/config card and will show a placeholder until generation completes.
- Keep generated result nodes linked with `sourcePrintNodeId`, `sourceGenerationNodeId`, `model`, `apiModel`, `sizeLevel`, and the exact prompt used.
- For model generation, store `modelShotType`, `pose`, `camera`, `garmentFit`, `identityPolicy`, and `referenceImages` on the image node data when available.

## Accuracy Rules

- Do not invent missing production facts; mark them as assumptions on a note or text node.
- Separate product prompt, print prompt, and background prompt.
- For children apparel, avoid unsafe styling, adult posing, and ambiguous age presentation.
- For adult model generation, keep identity generic unless the user provides an authorized reference. Do not imply celebrity likeness or unlicensed brand logos.
- Preserve garment truth: silhouette, seam logic, print placement, sleeve length, neckline, and fabric weight should not drift between variants.
- Keep final prompt text reusable for other models or providers.
