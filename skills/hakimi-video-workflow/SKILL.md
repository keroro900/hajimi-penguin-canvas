---
name: hakimi-video-workflow
description: Build Hakimi 画布 video generation workflows. Use when an agent needs to create storyboard nodes, submit video generation jobs, connect image/video references, place returned video assets, or track async video status.
---

# Hakimi Video Workflow

## Workflow

1. Read the canvas and identify source image, motion brief, duration, aspect ratio, and output target.
2. Preview the storyboard lane before generation: source, motion prompt, camera move, video generation node, status/result node.
3. Submit jobs through `hakimi_canvas_generate_video` or the backend video proxy.
4. Store job ids, provider, model, prompt, source URLs, and expected duration in node data.
5. Add visible status notes while polling or waiting.
6. When a result arrives, place the video node, connect it to its source, and read back the canvas to verify lineage.

## Accuracy Rules

- Keep async job state explicit; never imply completion until the provider returns a playable URL.
- Use short motion prompts with concrete camera/action verbs.
- Preserve frame/reference links so another agent can resume the job.
- For retries, create a new variant node and connect it to the failed attempt.

## Sidebar Directions

- `storyboard` | 分镜规划 | 读取源图、目标时长、比例和输出位置，规划镜头队列。
- `motion-prompt` | 运镜提示 | 写短而具体的动作、镜头运动和节奏 prompt。
- `video-job` | 视频任务 | 创建或提交视频节点，保存模型、job id、来源和时长。
- `polling-status` | 状态追踪 | 用状态节点或事件展示排队、生成、失败和完成。
- `result-placement` | 结果回写 | 放置可播放视频节点并连接到源图或分镜节点。

## Sidebar Questions

- `video-source` | 视频任务的主要输入是什么？ | 当前图片节点 / 上传参考图 / 已有视频 / 文本分镜 | 当前图片节点
- `duration` | 目标视频时长是多少？ | 5 秒 / 8 秒 / 10 秒 / 用户自定 | 5 秒
- `run-policy` | 视频节点创建后怎么执行？ | 立即提交 / 只建分镜 / 先预览确认 | 先预览确认

## Sidebar Canvas Templates

- `storyboard-video` | 分镜到视频流程 | source image -> storyboard text -> video node -> polling status -> playable result
- `image-to-video` | 图生视频流程 | reference image -> motion prompt -> video run_node -> result videoUrl -> readback

## Sidebar Verification

- `video-node-data` | 视频节点参数完整 | 检查 prompt/model/duration/aspectRatio/sourceUrls/status/jobId
- `async-status` | 异步状态清楚 | 检查排队、运行、失败或完成状态有可见记录
- `playable-url` | 视频结果可播放 | 检查 videoUrl/videoUrls 回写并保留来源连线
