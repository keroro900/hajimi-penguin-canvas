# Design Planning

## Trigger

Use this module when the task needs visual direction, design critique, layout planning, generation strategy, prompt architecture, or a reusable creative brief before running image/video models.

## Planning Workflow

1. Identify the audience, product category, visual channel, and success metric.
2. Turn the request into a deliverable manifest: hero image, detail image, model shot, banner, poster, storyboard, or review board.
3. Separate design intent from technical generation constraints.
4. Route each deliverable to the best available node type and model parameters.
5. Create 3-5 variant axes, changing one major variable per variant.
6. Define rejection criteria before generation.
7. Place the brief and variant plan on the canvas before running expensive generation.
8. After generation, compare results against the same criteria and mark next actions.

## Brief Fields

- Product or scene.
- Audience and channel.
- Deliverable role and canvas node type.
- Required references.
- Style direction.
- Composition and camera.
- Color/material constraints.
- Negative constraints.
- Model and output size.
- Review criteria.

## Model Routing

- Typography/logo/vector-heavy deliverables: prefer models or nodes known to preserve text and clean edges, and add a typography verification note.
- Photoreal product/model deliverables: prioritize reference fidelity, camera, lens, lighting, material, and pose constraints.
- Fashion/editorial deliverables: preserve wardrobe, body-safe pose, fabric behavior, styling hierarchy, and brand tone.
- Motion deliverables: create storyboard or video nodes first; do not hide the motion prompt in a plain text reply.
- If the user names a model, treat it as a soft preference unless they say "must use". A hard requirement must be checked against the canvas registry before running.

## Design Kit Pattern

For broad design requests, create a compact kit rather than a single image:

1. Strategy note: audience, channel, concept, constraints.
2. Reference board: uploaded or @ mentioned assets, source URLs, anti-targets.
3. Runnable image/video nodes: one asset role per node.
4. Review node: compare results against the same criteria.
5. Handoff node: next edits, selected result, and reusable prompt fragments.

## Accuracy Rules

- Avoid vague aesthetic labels without visual evidence.
- Prefer concrete, inspectable constraints: placement, scale, color, material, camera, background, lighting.
- For design variants, preserve the same baseline where possible so differences can be compared fairly.
- If a prompt is meant to be reusable, keep it in `data.prompt` on the runnable node and mirror it only when needed for display.
- Do not auto-copy a reference image. Use reference boards for composition/material inspiration and write original prompt constraints unless the user owns/authorizes the exact edit.
