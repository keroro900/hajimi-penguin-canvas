# Video Workflow

## Trigger

Use this module for storyboard nodes, image-to-video, text-to-video, video generation jobs, async polling, status notes, and returned video asset placement.

## Workflow

1. Read the canvas and identify source image, motion brief, duration, aspect ratio, and output target.
2. Preview the storyboard lane before generation: source, motion prompt, camera move, video generation node, status/result node.
3. Submit jobs through `hakimi_canvas_generate_video` or the backend video proxy.
4. Store job ids, provider, model, prompt, source URLs, expected duration, and aspect ratio in node data.
5. Add visible status notes while polling or waiting.
6. When a result arrives, place the video node, connect it to its source, and read back the canvas to verify lineage.

## Accuracy Rules

- Keep async job state explicit; never imply completion until the provider returns a playable URL.
- Use short motion prompts with concrete camera/action verbs.
- Preserve frame/reference links so another agent can resume the job.
- For retries, create a new variant node and connect it to the failed attempt.
