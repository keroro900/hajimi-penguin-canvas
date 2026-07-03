# 画布食谱

这些食谱用于内容更新包 v2.1.8，目标是让用户直接按节点组合复用，而不是改动核心画布结构。每个方案都只依赖现有节点、manifest 或提示词模板库。

## 图生视频

- 节点组合：Upload -> Video / Seedance -> Output。
- 适用模型：Seedance 2.0、Grok Video 1.5、Sora2 FAL。
- 输入输出：输入一张主体图和一段 Seedance 结构化视频提示词，输出 5-15 秒短视频。
- 排障：主体漂移时降低时长，减少动作数量；FAL 失败时先查 TASKID，再切换默认分组或 FAL 兜底。

## 角色一致性九宫格

- 节点组合：Upload 多参考图 -> Prompt 模板 -> Image -> Grid Editor。
- 适用模型：GPT Image 2、Nano Banana Pro、Grok Image。
- 输入输出：输入角色正脸、侧脸、服装和道具参考，输出 3x3 姿态/表情/场景一致性图。
- 排障：脸不稳时把“脸部、发型、服装、配饰保持一致”写进正向和负向约束；参考图过多时保留最关键 3-5 张。

## 产品图精修

- 节点组合：Upload -> Image Edit -> Image Compare -> Output。
- 适用模型：GPT Image 2 Edit、FAL GPT Image 2 Edit、ComfyUI 图像编辑 workflow。
- 输入输出：输入产品原图和修图 brief，输出干净背景、统一光线和可比对版本。
- 排障：文字或 logo 被改坏时把品牌字样放入禁止项；材质变形时降低编辑范围并增加“保留原始轮廓”。

## 短链解析到素材库

- 节点组合：Aggregate Parser -> Material Set -> Resource Library。
- 适用模型：不依赖生成模型。
- 输入输出：输入平台短链或分享码，合规确认后把解析到的图片、视频、文本统一保存为素材集。
- 排障：平台临时 CDN 403 时改用下载后的本地文件；解析失败时确认链接没有过期并查看后端日志。

## 全景转视频

- 节点组合：Image 720 全景 -> Panorama3D -> 当前视角导出 -> Video。
- 适用模型：全景图像模型 + Seedance 2.0 / Veo / Sora2。
- 输入输出：先生成左右无缝 720 全景，再导出 1-3 个取景点生成推进、摇移或环绕视频。
- 排障：地平线漂移时回到全景图重生成；视频破坏空间结构时限制“只加入轻微环境动态”。

## ComfyUI 应用制作

- 节点组合：ComfyUI App Maker -> ComfyUI Store -> Image。
- 适用模型：本机 ComfyUI 已安装的 checkpoint、LoRA、ControlNet 或自定义节点。
- 输入输出：导入 API Workflow，检查字段映射，保存为超市应用后在图像节点调用。
- 排障：缺模型时替换本机模型名；缺节点时先安装 custom node；字段不该暴露时加入排除规则。

## RunningHub 工具箱模板

- 节点组合：RH Config -> RH Toolbox -> Output。
- 适用模型：维护者配置过 WebApp ID 的 RunningHub 应用。
- 输入输出：把图片、视频、音频或文本映射到 RunningHub nodeInfoList，返回对应素材。
- 排障：未配置 WebApp ID 的模板保持禁用；节点序号不匹配时先在 RH 应用参数页确认 rhNodeId。

## FAL 内容工具箱

- 节点组合：Fal Toolbox -> Output / Model3DPreview。
- 适用模型：FAL 图像、视频、音频、TTS、3D 生成端点。
- 输入输出：按 manifest 的 inputSchema 和 userParams 组装 payload，输出图片、视频、音频或 3D 模型。
- 排障：预扣后失败先查 request_id；多图输入顺序错时检查 sourceIndex；模型超时时提高 maxPolls。

## LLM 扩写

- 节点组合：Text -> LLM -> Text Split -> Image / Video。
- 适用模型：Gemini / GPT / OpenAI 兼容 LLM。
- 输入输出：把一句需求扩写为产品图 brief、分镜脚本、全景取景点或视频运镜提示。
- 排障：输出太散时要求固定字段；输出过长时让 LLM 只返回可复制 prompt，不要解释。

## 音频与 SFX 画面

- 节点组合：Audio -> Video / Seedance -> Output。
- 适用模型：Suno V5.5、Seedance 2.0、FAL TTS / speech。
- 输入输出：先生成或导入音乐/音效，再用视频提示词把节奏映射到产品点击、环境循环或口播画面。
- 排障：版权歌曲翻唱失败时先换非版权素材；视频节奏乱切时改成固定机位和轻微动作。
