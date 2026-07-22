export const APPAREL_PACK_NODE_TYPE = 'apparel-pack' as const;
export const APPAREL_PACK_OUTPUT_NODE_TYPE = 'apparel-pack-output' as const;

export type ApparelPackMode = 'suite' | 'garment-reference' | 'inspiration';

export const APPAREL_PACK_MODE_OPTIONS: Array<{
  id: ApparelPackMode;
  label: string;
  description: string;
}> = [
  {
    id: 'suite',
    label: '套图生成',
    description: '参考模特图和服装图，生成同模特同服装的多张套图。',
  },
  {
    id: 'garment-reference',
    label: '服装参考生成',
    description: '只用服装参考生成模特图、平铺图和细节图。',
  },
  {
    id: 'inspiration',
    label: '灵感模式',
    description: '由 LLM 规划商品设定，再生成服装套图锚点。',
  },
];

export const MAX_APPAREL_PACK_SHOTS = 12;

export type ApparelPackPresetItem = {
  id: string;
  label: string;
  value: string;
  prompt: string;
  promptZh: string;
  promptEn: string;
};

export type ApparelPackImageQuality = 'auto' | 'low' | 'medium' | 'high';
export type ApparelPackImageSubmitMode = 'async' | 'sync';
export type ApparelPackRunScope = 'full' | 'anchors';

type ApparelPackPresetDraft = Omit<ApparelPackPresetItem, 'promptZh' | 'promptEn'> & {
  promptZh?: string;
  promptEn?: string;
};

const APPAREL_PACK_PRESET_PROMPT_ZH: Record<string, string> = {
  garment: '通用服装真值：严格保留参考图里的版型、结构、面料、颜色、辅料和印花位置。',
  set: '套装真值：每一件单品都要出现，上衣/下装关系、正背面、配色、腰口、领口、袖口和印花位置都不能漂移。',
  dress: '连衣裙真值：保留领口、腰线、裙摆体量、下摆长度、面料垂感、印花比例和装饰细节。',
  tee: 'T 恤真值：保留领口罗纹、肩线、袖口、胸前印花位置、下摆和面料克重。',
  hoodie: '卫衣真值：保留帽型、抽绳、袋鼠兜、袖口、下摆罗纹、绒感和印花位置。',
  shirt: '衬衫真值：保留领座、门襟、袖克夫、后过肩、面料纹理和干净挺括结构。',
  pants: '裤装真值：保留裆深、腰头、裤腿宽度、口袋位置、下摆、缝线、面料重量和穿着版型。',
  skirt: '半裙真值：保留腰部结构、裙摆体量、褶裥或分片、下摆长度、垂感和印花连续性。',
  jacket: '外套真值：保留领型、翻领或帽子、拉链/纽扣、口袋、袖口、下摆和外套结构。',
  custom: '自定义：把用户填写的中文/英文描述当作最高优先级服装真值，不凭空增加结构。',
  women: '女装方向：自然比例、优雅但清楚的动作，以商品可读性为先。',
  men: '男装方向：放松自信的姿态，干净展示合身度，造型克制。',
  kidswear: '童装方向：儿童安全、年龄合适、表情明快，动作由服装用途决定，不能成人化，服装清晰优先。',
  teen: '青少年服装方向：休闲年轻，动作由服装用途决定，避免成人化，商品和合身度清楚。',
  plus: '大码方向：包容真实的身体比例，诚实展示服装合身度，不扭曲身体。',
  marketplace: '通用电商：背景干净、商品居中、缩略图可读、干扰少。',
  temu: 'TEMU 风格：明亮干净的平台主图感，商品尺度明确，背景简单，缩略图强可读。',
  shein: 'SHEIN 风格：干净时髦的模特图，合身度清楚，造型受控，服装仍是主体。',
  amazon: 'Amazon 风格：合规干净的商品呈现，中性背景，颜色准确，不出现假字。',
  tiktok: 'TikTok Shop：画面有轻微活力但不杂乱，竖屏信息抓眼，商品在信息流里清楚。',
  lookbook: '品牌画册：摄影更精致、有氛围，但服装真值、印花位置和电商可用性仍优先。',
  auto: '自动判断服装用途：睡衣/家居走明亮卧室或温和居家；运动休闲走公园草地、学校操场或动作棚拍；外套走干净街景或校门；纯商品图走浅色平铺台面。',
  sleepwear: '睡衣/家居场景：明亮卧室、白色地毯、护墙板、柔软床品、1-2 个软玩具道具、干净温暖空气感；模特图不要默认纯色棚拍。',
  activewear: '运动休闲场景：公园草地、学校操场、干净户外日光、运动鞋、自然轻动作；商品不能被遮挡。',
  outerwear: '外套/户外场景：秋季公园、校门、干净街景，必要时用简单背包或户外道具；廓形和门襟细节要清楚。',
  occasion: '礼服/正装场景：精致中性棚拍，少量节日或聚会语境，面料和廓形清楚，不要拥挤装饰。',
  'euro-white-cute': '欧美白人可爱儿童模特：真实可爱、圆润脸型、明亮眼睛、自然小笑容、健康白皙肤色、暖棕或深金色柔顺发型；保持正常儿童下巴和柔和下颌线，避免屁股下巴/裂下巴/突出下巴/下巴凹点/下巴竖线；避免手叉腰和选美式站姿；后续图保持同一脸型、发型、身材比例和表情家族。',
  'east-asian-natural': '东亚泛化模特：柔和自然脸型、明亮眼睛、干净发型、友好日常表情、真实肤质；童装时保持年龄合适。',
  'mixed-natural': '混血泛化模特：自然脸部结构、健康真实肤色、放松笑容、干净发型和日常商业气质，不像任何名人。',
  'garment-led': '动作由服装决定：根据服装用途、面料行为、合身度和卖点选择动作；睡衣放松居家，运动可走路或玩耍，外套可站立或户外轻动；不能用遮挡服装的固定动作。',
  'homewear-relaxed': '居家放松动作：轻微转身、手自然、温和笑容，服装正面清楚，适合睡衣、家居服、浴袍、软针织和卧室场景。',
  'outdoor-candid': '户外自然动作：自然走动、轻微玩耍或休闲迈步，由服装用途决定；保持全套服装可读，避免运动模糊印花或遮挡辅料。',
  'commerce-clean': '干净电商动作：正面或轻微三分之四，手臂放松，全身廓形清楚，适合商品保真优先时使用。',
  'iphone-natural': 'iPhone 日常摄影：24-28mm 等效，自然透视，轻微手持日常感，同时保持电商清晰，不要过度棚拍渲染。',
  'ccd-snapshot': 'CCD 小相机快照：适合时可有轻微直闪或小相机真实感，略带怀旧色彩，但仍足够清楚检查商品。',
  'dslr-commerce': '单反/微单电商摄影：35-50mm 自然镜头，景深干净，纺织细节准确，商业但真实。',
  studio: '受控棚拍：透视平衡、服装细节锐利、光线干净，不要塑料皮肤或 CGI 面料。',
  'daily-real': '日常真实摄影：背景可以有少量生活感但保持整洁，皮肤、布料褶皱、家庭或户外道具都要符合服装用途；除非用户要求，不用纯色空背景。',
  'clean-commerce': '干净真实电商摄影：商品优先、面料纹理和颜色准确，修图克制，背景简单但不死板。',
  ugc: 'UGC 自然商品照：日常随拍、手持构图可信，但仍要适合平台销售。',
  'lookbook-real': '真实画册摄影：造型和氛围更精致，但服装真值、印花位置和电商可读性仍占主导。',
  'model-front': '正面模特图：全身正面，服装居中，廓形和合身度一眼可读。',
  'model-back': '背面模特图：同一个模特和同一件服装，背部结构和面料行为清楚。',
  'model-half': '半身细节：领口、胸前、袖子、辅料、印花比例和面料行为清楚。',
  flatlay: '平铺图：俯拍干净布局，不用模特也能看清廓形和结构。',
  hanger: '挂拍图：正面挂拍，自然垂坠，领口、袖子、下摆和印花都可见。',
  detail: '商品细节：近距离展示面料纹理、缝线、辅料、印花、领口或袖口结构。',
  'model-side': '侧身或三分之四模特图：同一个模特和服装，侧面廓形和体量清楚。',
  'model-lifestyle': '场景模特图：同服装同模特，简单语境场景，商品可读性第一。',
  'fabric-macro': '面料微距：织法、针脚、印花边缘、纹理和材料厚薄清楚，不改变服装。',
  'label-detail': '领标/辅料：领标、领口、纽扣、拉链、抽绳或辅料细节，避免假字，保留真实结构。',
  'size-reference': '尺码参考：商品比例、长度、袖长或下摆比例清楚，不加图文覆盖。',
  'color-texture': '颜色质感：准确展示配色、材质表面和印花颜色。',
  quick: '快速质检：只标出明显服装漂移、人体错误、构图差和不可用图。',
  normal: '标准质检：评估服装保真、模特一致、构图、技术瑕疵和平台适配。',
  strict: '严格质检：强要求商品保真、模特稳定、人体干净、提示词遵循；任何漂移都给重试补丁。',
};

function withBilingualPresetPrompts<T extends Record<string, readonly ApparelPackPresetDraft[]>>(groups: T): {
  [K in keyof T]: ApparelPackPresetItem[];
} {
  const out: Record<string, ApparelPackPresetItem[]> = {};
  for (const [groupKey, items] of Object.entries(groups)) {
    out[groupKey] = items.map((item) => {
      const promptEn = item.promptEn || item.prompt;
      const promptZh = item.promptZh || APPAREL_PACK_PRESET_PROMPT_ZH[item.id] || `${item.label}：${promptEn}`;
      return {
        ...item,
        prompt: promptEn,
        promptEn,
        promptZh,
      };
    });
  }
  return out as { [K in keyof T]: ApparelPackPresetItem[] };
}

export const APPAREL_PACK_PRESETS = withBilingualPresetPrompts({
  garmentTypes: [
    {
      id: 'garment',
      label: '通用服装',
      value: 'apparel product',
      prompt: 'generic apparel product; preserve silhouette, construction, fabric, color, trims, and print placement from references',
    },
    {
      id: 'set',
      label: '套装',
      value: 'matching apparel set',
      prompt: 'matching apparel set truth; preserve every set piece, top and bottom relationship, front/back views, print placement, color pairing, trims, hem, waistband, neckline and sleeve construction',
    },
    {
      id: 'dress',
      label: '连衣裙',
      value: 'dress',
      prompt: 'dress product truth; preserve neckline, waist shape, skirt volume, hem length, fabric drape, print scale, and trim details',
    },
    {
      id: 'tee',
      label: 'T 恤',
      value: 't-shirt',
      prompt: 't-shirt product truth; preserve collar rib, shoulder slope, sleeve opening, chest print placement, hem and fabric weight',
    },
    {
      id: 'hoodie',
      label: '卫衣',
      value: 'hoodie',
      prompt: 'hoodie product truth; preserve hood shape, drawcords, kangaroo pocket, cuffs, hem rib, fleece weight, and print placement',
    },
    {
      id: 'shirt',
      label: '衬衫',
      value: 'shirt',
      prompt: 'shirt product truth; preserve collar stand, button placket, sleeve cuffs, yoke, fabric texture, and clean pressed construction',
    },
    {
      id: 'pants',
      label: '裤装',
      value: 'pants',
      prompt: 'pants product truth; preserve rise, waistband, leg width, pocket placement, hem, seam line, fabric weight, and fit',
    },
    {
      id: 'skirt',
      label: '半裙',
      value: 'skirt',
      prompt: 'skirt product truth; preserve waist construction, skirt volume, pleats or panels, hem length, drape, and print continuity',
    },
    {
      id: 'jacket',
      label: '外套',
      value: 'jacket',
      prompt: 'jacket product truth; preserve collar, lapel or hood, zipper/button closure, pocket placement, cuff, hem and outerwear structure',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom apparel',
      prompt: 'use the user custom garment description as the primary product truth; do not invent unsupported garment construction',
    },
  ],
  audiences: [
    {
      id: 'women',
      label: '女装',
      value: 'women ecommerce customer',
      prompt: 'womenwear commercial model direction; natural proportions, elegant readable pose, product-led styling',
    },
    {
      id: 'men',
      label: '男装',
      value: 'men ecommerce customer',
      prompt: 'menswear commercial model direction; relaxed confident posture, clean fit readability, restrained styling',
    },
    {
      id: 'kidswear',
      label: '童装',
      value: 'kidswear marketplace customer',
      prompt: 'child-safe kidswear direction; age-appropriate styling, cheerful garment-led pose chosen from the garment use, no mature styling, garment readability first',
    },
    {
      id: 'teen',
      label: '青少年',
      value: 'teen apparel customer',
      prompt: 'teen apparel direction; casual youthful styling, pose chosen from the garment use, avoid adultized styling, keep product and fit clear',
    },
    {
      id: 'plus-size',
      label: '大码',
      value: 'plus-size apparel customer',
      prompt: 'plus-size ecommerce direction; inclusive realistic body proportions, flattering but honest garment fit, no body distortion',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom audience',
      prompt: 'use the user custom audience and model policy; keep identity generic unless authorized references are supplied',
    },
  ],
  channels: [
    {
      id: 'marketplace',
      label: '通用电商',
      value: 'marketplace ecommerce',
      prompt: 'marketplace-ready ecommerce output; clean background, product-centered crop, high readability, minimal distractions',
    },
    {
      id: 'temu',
      label: 'TEMU',
      value: 'TEMU marketplace listing',
      prompt: 'TEMU listing style; bright clean marketplace image, clear product scale, simple background, strong thumbnail readability',
    },
    {
      id: 'shein',
      label: 'SHEIN',
      value: 'SHEIN fashion listing',
      prompt: 'SHEIN fashion listing style; clean trendy model image, clear fit, controlled styling, garment remains dominant',
    },
    {
      id: 'amazon',
      label: 'Amazon',
      value: 'Amazon ecommerce listing',
      prompt: 'Amazon ecommerce style; compliant clean product presentation, neutral background, accurate color and no fake text',
    },
    {
      id: 'tiktok-shop',
      label: 'TikTok Shop',
      value: 'TikTok Shop product content',
      prompt: 'TikTok Shop commerce style; lively but uncluttered visual, strong hook crop, product readable in vertical feed',
    },
    {
      id: 'brand-lookbook',
      label: '品牌画册',
      value: 'brand lookbook',
      prompt: 'brand lookbook style; refined fashion photography, stronger mood while preserving garment truth and ecommerce usability',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom sales channel',
      prompt: 'use the user custom channel requirements; keep platform constraints explicit and avoid unsupported text or labels',
    },
  ],
  useCases: [
    {
      id: 'auto',
      label: '自动场景',
      value: 'auto scene routing',
      prompt: 'auto-classify garment use before prompting: sleepwear/homewear uses a bright bedroom or soft home scene; activewear uses park grass, school playground or studio action; outerwear uses clean outdoor street or school entrance; product-only shots use light flat lay surfaces',
    },
    {
      id: 'sleepwear',
      label: '睡衣家居',
      value: 'sleepwear homewear',
      prompt: 'sleepwear/homewear scene routing: bright bedroom, white rug, paneled wall, soft bedding, 1-2 soft toy props, clean airy warm light; avoid plain studio for model shots unless the user explicitly asks',
    },
    {
      id: 'activewear',
      label: '运动休闲',
      value: 'activewear casual',
      prompt: 'activewear/casual scene routing: park grass, school playground, clean outdoor daylight, sneakers, natural movement; product remains readable and not blocked',
    },
    {
      id: 'outerwear',
      label: '外套户外',
      value: 'outerwear outdoor',
      prompt: 'outerwear/outdoor scene routing: autumn park, school entrance, clean street, simple backpack or outdoor prop only if useful; silhouette and closure details readable',
    },
    {
      id: 'occasion',
      label: '礼服正装',
      value: 'occasionwear',
      prompt: 'occasionwear scene routing: refined studio neutral, simple holiday or party context, fabric and silhouette readable, no crowded decor',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom garment use',
      prompt: 'use the user custom scene and garment-use direction; map the background to garment function instead of defaulting to a plain studio',
    },
  ],
  modelLooks: [
    {
      id: 'auto',
      label: '自动外观',
      value: 'auto garment-led generic model look',
      prompt: 'modelAppearanceLock: infer age, ethnicity, face, hair, and styling from audience, channel, garment use, and authorized model references; keep one stable generic model appearance for downstream shots',
    },
    {
      id: 'euro-white-cute',
      label: '欧美白人可爱',
      value: 'European/Caucasian white child model, cute natural commercial look',
      prompt: 'modelAppearanceLock: European/Caucasian white child model, cute but realistic, soft round face, bright eyes, small natural smile, fair healthy skin, warm brown or dark-blonde softly styled hair, age-appropriate daily styling, normal child chin and soft jawline; avoid cleft chin, butt chin, protruding chin, chin dimple, vertical chin crease, lower-face crease, overly pointed V-jaw, pageant makeup, pageant stance, hand-on-hip pose, or adultized face; keep the same face, hair, body proportion, and expression family for downstream shots',
    },
    {
      id: 'east-asian-cute',
      label: '东亚可爱',
      value: 'East Asian cute commercial model',
      prompt: 'modelAppearanceLock: East Asian generic model, soft natural face, bright eyes, clean hair styling, friendly daily-life expression, realistic skin texture, age-appropriate styling when used for kidswear',
    },
    {
      id: 'mixed-natural',
      label: '混血自然',
      value: 'mixed-ethnicity natural commercial model',
      prompt: 'modelAppearanceLock: mixed-ethnicity generic model with natural face structure, healthy realistic skin, relaxed smile, clean hair styling, everyday commercial presence, no celebrity likeness',
    },
    {
      id: 'custom',
      label: '自定义外观',
      value: 'custom model appearance',
      prompt: 'modelAppearanceLock: use the user custom model appearance as a generic model target; keep identity safe, stable, realistic, and age-appropriate',
    },
  ],
  poseStyles: [
    {
      id: 'garment-led',
      label: '服装决定动作',
      value: 'garment-led natural pose',
      prompt: 'poseLock: choose the pose from garment use, fabric behavior, fit, and selling point; sleepwear should feel relaxed and homey, activewear can walk or play, outerwear can stand or move outdoors; never use a fixed pose that hides the garment',
    },
    {
      id: 'relaxed-homewear',
      label: '家居松弛',
      value: 'relaxed homewear pose',
      prompt: 'poseLock: relaxed daily homewear pose, light body turn, hands natural, gentle smile, garment front readable, suitable for pajamas, loungewear, robes, soft knitwear, and bedroom scenes',
    },
    {
      id: 'playful-walk',
      label: '自然走动',
      value: 'natural walking or playful motion pose',
      prompt: 'poseLock: natural walking, light playful motion, or casual outdoor step chosen from garment use; preserve full outfit readability and avoid motion that blurs print or hides trims',
    },
    {
      id: 'studio-readable',
      label: '棚拍可读',
      value: 'studio readable ecommerce pose',
      prompt: 'poseLock: clean ecommerce pose, front-facing or slight three-quarter, arms relaxed, full garment silhouette readable, suitable when product fidelity matters more than lifestyle energy',
    },
    {
      id: 'custom',
      label: '自定义动作',
      value: 'custom pose direction',
      prompt: 'poseLock: use the user custom pose direction while keeping garment readability, age-appropriate posture, and downstream consistency',
    },
  ],
  cameraStyles: [
    {
      id: 'iphone-natural',
      label: 'iPhone 日常',
      value: 'natural iPhone lifestyle camera',
      prompt: 'cameraLookLock: realistic iPhone photography, 24-28mm equivalent, natural perspective, mild handheld daily-life feeling, crisp ecommerce clarity, no over-polished studio render',
    },
    {
      id: 'ccd-snapshot',
      label: 'CCD 快照',
      value: 'CCD snapshot camera look',
      prompt: 'cameraLookLock: CCD compact camera snapshot feeling, gentle direct-flash or small-camera realism when appropriate, slightly nostalgic color response, still sharp enough for product inspection',
    },
    {
      id: 'dslr-ecommerce',
      label: '相机电商',
      value: 'DSLR ecommerce camera',
      prompt: 'cameraLookLock: DSLR or mirrorless ecommerce photography, 35-50mm natural lens, clean depth, accurate textile detail, commercial but realistic color',
    },
    {
      id: 'studio-camera',
      label: '棚拍相机',
      value: 'studio camera product photography',
      prompt: 'cameraLookLock: controlled studio camera look, balanced perspective, crisp garment detail, clean lighting, no artificial plastic skin or CGI texture',
    },
    {
      id: 'custom',
      label: '自定义镜头',
      value: 'custom camera look',
      prompt: 'cameraLookLock: use the user custom camera or device look while preserving garment color, proportion, and commercial readability',
    },
  ],
  realismStyles: [
    {
      id: 'daily-real',
      label: '日常真实',
      value: 'daily-life realistic photography',
      prompt: 'realismStyleLock: daily-life realistic photography, natural background mess kept tidy, believable skin, fabric folds, household or outdoor props matched to garment use, no pure-color empty backdrop unless explicitly requested',
    },
    {
      id: 'clean-commerce-real',
      label: '干净电商真实',
      value: 'clean realistic ecommerce photography',
      prompt: 'realismStyleLock: clean realistic ecommerce photography, product-first, accurate fabric texture and color, restrained retouching, simple but not sterile background',
    },
    {
      id: 'ugc-natural',
      label: 'UGC 自然',
      value: 'UGC natural product photo',
      prompt: 'realismStyleLock: user-generated natural product photo feeling, candid daily-life setup, believable handheld framing, still clean enough for marketplace use',
    },
    {
      id: 'lookbook-real',
      label: '画册真实',
      value: 'realistic lookbook photography',
      prompt: 'realismStyleLock: realistic lookbook photography, refined styling and richer mood, but garment truth, print placement, and ecommerce readability remain dominant',
    },
    {
      id: 'custom',
      label: '自定义真实感',
      value: 'custom realism direction',
      prompt: 'realismStyleLock: use the user custom realism direction; avoid generic CGI, plastic skin, over-smoothed fabric, or unsupported art style drift',
    },
  ],
  suiteScenes: [
    { id: 'model-front', label: '正面模特', value: 'front model shot', prompt: 'front view ecommerce model image; full-body, garment centered, silhouette and fit immediately readable' },
    { id: 'model-back', label: '背面模特', value: 'back model shot', prompt: 'back view ecommerce model image; same model and garment, back construction and fabric behavior readable' },
    { id: 'model-half', label: '半身细节', value: 'half-body model detail', prompt: 'half-body model crop; neckline, chest area, sleeve, trims, print scale and fabric behavior visible' },
    { id: 'flatlay', label: '平铺图', value: 'flat lay product shot', prompt: 'flat lay product shot; top-down clean garment layout, silhouette and construction readable without a model' },
    { id: 'hanger', label: '挂拍图', value: 'hanger product shot', prompt: 'hanger product shot; front-facing hanging garment, natural drape, collar, sleeve, hem and print visible' },
    { id: 'detail', label: '商品细节', value: 'garment detail shot', prompt: 'close-up garment detail; fabric texture, seam, trim, print, collar or sleeve construction clearly shown' },
    { id: 'model-side', label: '侧身模特', value: 'side model shot', prompt: 'side or three-quarter model shot; same model and garment, side silhouette and fit volume readable' },
    { id: 'model-lifestyle', label: '场景模特', value: 'lifestyle model shot', prompt: 'commerce lifestyle model shot; same garment and model, simple contextual scene with product readability first' },
    { id: 'fabric-macro', label: '面料微距', value: 'fabric macro shot', prompt: 'fabric macro detail; weave, stitch, print edge, texture and material weight visible without changing the garment' },
    { id: 'label-detail', label: '领标/辅料', value: 'label and trim detail', prompt: 'label, collar, button, zipper, drawcord or trim detail; avoid fake text and preserve construction truth' },
    { id: 'size-reference', label: '尺码参考', value: 'size reference shot', prompt: 'size and fit reference shot; product scale, length, sleeve or hem proportion readable without graphic text overlays' },
    { id: 'color-texture', label: '颜色质感', value: 'color and texture shot', prompt: 'color and texture product shot; accurate colorway, material finish and print color fidelity under clean light' },
  ],
  qualityThresholds: [
    { id: 'quick', label: '快速', value: 'quick', prompt: 'quick QA; flag only obvious garment drift, anatomy errors, bad composition, and unusable outputs' },
    { id: 'normal', label: '标准', value: 'normal', prompt: 'normal QA; score garment fidelity, model consistency, composition, technical artifacts, and channel fit' },
    { id: 'strict', label: '严格', value: 'strict', prompt: 'strict QA; require strong product fidelity, stable model identity, clean anatomy, exact prompt adherence, and retry patches for any drift' },
  ],
});

export type ApparelPackReferenceSet = {
  model?: string[];
  garment?: string[];
  garmentFront?: string[];
  garmentBack?: string[];
  garmentLeft?: string[];
  garmentRight?: string[];
  garmentDetail?: string[];
  style?: string[];
  existing?: string[];
};

export type ApparelPackSuiteConfig = {
  shotCount?: number;
  lockLevel?: 'pose' | 'pose-background' | 'authorized-identity-pose' | 'free-commercial';
  modelConsistency?: 'normal' | 'strict';
  garmentConsistency?: 'normal' | 'strict';
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  useCasePresetId?: string;
  modelLookPresetId?: string;
  posePresetId?: string;
  cameraPresetId?: string;
  realismPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customUseCase?: string;
  customModelLook?: string;
  customPose?: string;
  customCamera?: string;
  customRealism?: string;
  customPrompt?: string;
  imageModelId?: string;
  imageApiModel?: string;
  llmModel?: string;
  llmApiModel?: string;
  imageQuality?: ApparelPackImageQuality;
  imageSubmitMode?: ApparelPackImageSubmitMode;
  scenePresetIds?: string[];
  outputRatio?: string;
  sizeLevel?: string;
};

type ApparelPromptAgentSpec = {
  systemPrompt: string;
  systemPromptZh: string;
  userPrompt: string;
  userPromptZh: string;
  finalPrompt: string;
  finalPromptZh: string;
};

type ResolvedApparelPromptAgentSpec = ApparelPromptAgentSpec & {
  defaultSystemPrompt: string;
  defaultUserPrompt: string;
  defaultFinalPrompt: string;
  defaultSystemPromptZh: string;
  defaultUserPromptZh: string;
  defaultFinalPromptZh: string;
  promptOverridden?: boolean;
};

export type ApparelPackPromptOverride = {
  systemPrompt?: string;
  userPrompt?: string;
  finalPrompt?: string;
};

export type ApparelPackPromptOverrides = Record<string, ApparelPackPromptOverride | undefined>;

export type ApparelPackSkillProfileSourceType = 'user' | 'manual' | 'skill' | 'default';

export type ApparelPackSkillSource = {
  name: string;
  label?: string;
  description?: string;
  body?: string;
  scope?: string;
  directions?: Array<{ id?: string; label?: string; hint?: string }>;
  questions?: Array<{ id?: string; label?: string; options?: string[]; recommended?: string }>;
  templates?: Array<{ id?: string; label?: string; flow?: string }>;
  verification?: Array<{ id?: string; label?: string; hint?: string }>;
};

export type ApparelPackSkillProfilePreset = {
  label: string;
  value: string;
  sourceType: ApparelPackSkillProfileSourceType;
  sourceName: string;
  reason: string;
};

export type ApparelPackSkillProfileStep = {
  id: string;
  label: string;
  goal: string;
  systemPrompt: string;
  userPrompt: string;
  sourceRefs: Array<{ skillName: string; reason: string }>;
  qualityGate?: string[];
};

export type ApparelPackSkillProfileTraceItem = {
  field: string;
  value: string;
  sourceType: ApparelPackSkillProfileSourceType;
  sourceName: string;
  reason: string;
};

export type ApparelPackSkillProfile = {
  id: string;
  version: 'apparel-skill-profile-v1';
  domain: 'skills-agent-apparel-workbench';
  title: string;
  readableSummary: string;
  userIntent: string;
  sourceSkills: Array<{
    name: string;
    label: string;
    role: string;
    weight: 'primary' | 'support';
    contributions: string[];
  }>;
  presets: Record<string, ApparelPackSkillProfilePreset>;
  referenceSlots: Array<{
    id: string;
    label: string;
    purpose: string;
    firstAnchorOnly?: boolean;
    downstreamOnly?: boolean;
    sourceType: ApparelPackSkillProfileSourceType;
  }>;
  steps: ApparelPackSkillProfileStep[];
  qualityGates: Array<{
    id: string;
    label: string;
    mustPass: string[];
    retryPatch: string;
    sourceRefs: Array<{ skillName: string; reason: string }>;
  }>;
  conflicts: Array<{
    field: string;
    candidates: Array<{ value: string; sourceType: ApparelPackSkillProfileSourceType; sourceName: string }>;
    chosen: string;
    reason: string;
  }>;
  trace: ApparelPackSkillProfileTraceItem[];
  json: string;
};

export type ApparelPackSkillProfileInput = {
  mode: ApparelPackMode;
  userPrompt?: string;
  currentConfig?: Record<string, unknown>;
  skills?: ApparelPackSkillSource[];
};

export type ApparelPackSkillProfileAgentPrompt = {
  systemPrompt: string;
  userPrompt: string;
  fallbackProfile: ApparelPackSkillProfile;
};

export type ApparelPackTranslationKeywordPair = {
  zh: string;
  en: string;
  status: 'covered' | 'missing' | 'not-required';
};

export type ApparelPackTranslationDiff = {
  zhText: string;
  enText: string;
  coverageScore: number;
  keywordPairs: ApparelPackTranslationKeywordPair[];
  missingKeywords: string[];
  summary: string;
};

export type ApparelPackPromptStep = {
  key: string;
  nodeId: string;
  label: string;
  type: string;
  systemPrompt: string;
  systemPromptZh: string;
  systemPromptEn: string;
  userPrompt: string;
  userPromptZh: string;
  userPromptEn: string;
  finalPrompt: string;
  finalPromptZh: string;
  finalPromptEn: string;
  defaultSystemPrompt: string;
  defaultSystemPromptZh: string;
  defaultSystemPromptEn: string;
  defaultUserPrompt: string;
  defaultUserPromptZh: string;
  defaultUserPromptEn: string;
  defaultFinalPrompt: string;
  defaultFinalPromptZh: string;
  defaultFinalPromptEn: string;
  translationDiff: ApparelPackTranslationDiff;
};

export type ApparelPackOutputScene = {
  id: string;
  index: number;
  label: string;
  role: string;
  sourceNodeId: string;
  description: string;
  promptSummary: string;
};

export type ApparelPackOutputManifest = {
  packId: string;
  mode: ApparelPackMode;
  title: string;
  imageNodeIds: string[];
  qaNodeId?: string;
  scenes: ApparelPackOutputScene[];
};

export type ApparelPackGarmentReferenceConfig = {
  audience?: string;
  garmentType?: string;
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  useCasePresetId?: string;
  modelLookPresetId?: string;
  posePresetId?: string;
  cameraPresetId?: string;
  realismPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customUseCase?: string;
  customModelLook?: string;
  customPose?: string;
  customCamera?: string;
  customRealism?: string;
  customPrompt?: string;
  imageModelId?: string;
  imageApiModel?: string;
  llmModel?: string;
  llmApiModel?: string;
  imageQuality?: ApparelPackImageQuality;
  imageSubmitMode?: ApparelPackImageSubmitMode;
  modelPolicy?: 'generic' | 'no-face' | 'body-crop';
  shotCount?: number;
  includeFlatlay?: boolean;
  includeDetail?: boolean;
  outputRatio?: string;
  sizeLevel?: string;
};

export type ApparelPackInspirationConfig = {
  direction?: string;
  audience?: string;
  channel?: string;
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  useCasePresetId?: string;
  modelLookPresetId?: string;
  posePresetId?: string;
  cameraPresetId?: string;
  realismPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customUseCase?: string;
  customModelLook?: string;
  customPose?: string;
  customCamera?: string;
  customRealism?: string;
  customPrompt?: string;
  imageModelId?: string;
  imageApiModel?: string;
  llmModel?: string;
  llmApiModel?: string;
  imageQuality?: ApparelPackImageQuality;
  imageSubmitMode?: ApparelPackImageSubmitMode;
  planningStrength?: 'light' | 'balanced' | 'strict';
  shotCount?: number;
  outputRatio?: string;
  sizeLevel?: string;
};

export type ApparelPackQualityConfig = {
  enabled?: boolean;
  passThreshold?: 'quick' | 'normal' | 'strict';
  customPrompt?: string;
};

export type ApparelPackPlanInput = {
  packId: string;
  mode: ApparelPackMode;
  position?: { x: number; y: number };
  sourceNodeId?: string;
  references?: ApparelPackReferenceSet;
  suite?: ApparelPackSuiteConfig;
  garmentReference?: ApparelPackGarmentReferenceConfig;
  inspiration?: ApparelPackInspirationConfig;
  qualityQa?: ApparelPackQualityConfig;
  promptOverrides?: ApparelPackPromptOverrides;
  skillProfile?: ApparelPackSkillProfile;
  autoRun?: boolean;
  runScope?: ApparelPackRunScope;
};

export type ApparelPackPlanNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
};

export type ApparelPackPlanEdge = {
  id: string;
  source: string;
  target: string;
  data?: Record<string, any>;
};

export type ApparelPackPlan = {
  title: string;
  goal: string;
  summary: {
    mode: ApparelPackMode;
    imageCount: number;
    anchorCount: number;
  };
  nodes: ApparelPackPlanNode[];
  edges: ApparelPackPlanEdge[];
  runNodeIds: string[];
  runStages: string[][];
  focusViewport: { x: number; y: number; zoom: number };
};

export type ApparelPackQualityGateKind = 'model-anchor' | 'product-anchor' | 'derived-shot' | 'detail-shot' | 'generic-shot';

export type ApparelPackRetryPatchTemplate = {
  keep: string[];
  strengthen: string[];
  remove: string[];
  finalPromptPatch: string;
};

export type ApparelPackQualityGate = {
  kind: ApparelPackQualityGateKind;
  role: string;
  mustPass: string[];
  failIf: string[];
  retryPatchTemplate: ApparelPackRetryPatchTemplate;
};

const DEFAULT_POSITION = { x: 0, y: 0 };
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_API_MODEL = 'gpt-image-2';
const DEFAULT_RATIO = '3:4';
const DEFAULT_SIZE = '4K';
const DEFAULT_IMAGE_QUALITY: ApparelPackImageQuality = 'auto';
const DEFAULT_IMAGE_SUBMIT_MODE: ApparelPackImageSubmitMode = 'async';
const DEFAULT_LLM_MODEL = '';
const DEFAULT_LLM_API_MODEL = '';
const PROMPT_AGENT_NAME = 'apparel-pack-prompt-agent';
const QUALITY_AGENT_NAME = 'apparel-pack-quality-agent';

export const DEFAULT_APPAREL_PACK_CONFIG = {
  suite: {
    shotCount: 6,
    lockLevel: 'pose' as const,
    modelConsistency: 'strict' as const,
    garmentConsistency: 'strict' as const,
    garmentPresetId: 'garment',
    audiencePresetId: 'women',
    channelPresetId: 'marketplace',
    useCasePresetId: 'auto',
    modelLookPresetId: 'auto',
    posePresetId: 'garment-led',
    cameraPresetId: 'iphone-natural',
    realismPresetId: 'daily-real',
    customPrompt: '',
    imageModelId: DEFAULT_MODEL,
    imageApiModel: DEFAULT_API_MODEL,
    llmModel: DEFAULT_LLM_MODEL,
    llmApiModel: DEFAULT_LLM_API_MODEL,
    imageQuality: DEFAULT_IMAGE_QUALITY,
    imageSubmitMode: DEFAULT_IMAGE_SUBMIT_MODE,
    outputRatio: DEFAULT_RATIO,
    sizeLevel: DEFAULT_SIZE,
  },
  garmentReference: {
    audience: 'women',
    garmentType: 'garment',
    garmentPresetId: 'garment',
    audiencePresetId: 'women',
    channelPresetId: 'marketplace',
    useCasePresetId: 'auto',
    modelLookPresetId: 'auto',
    posePresetId: 'garment-led',
    cameraPresetId: 'iphone-natural',
    realismPresetId: 'daily-real',
    customPrompt: '',
    imageModelId: DEFAULT_MODEL,
    imageApiModel: DEFAULT_API_MODEL,
    llmModel: DEFAULT_LLM_MODEL,
    llmApiModel: DEFAULT_LLM_API_MODEL,
    imageQuality: DEFAULT_IMAGE_QUALITY,
    imageSubmitMode: DEFAULT_IMAGE_SUBMIT_MODE,
    modelPolicy: 'generic' as const,
    shotCount: 5,
    includeFlatlay: true,
    includeDetail: true,
    outputRatio: DEFAULT_RATIO,
    sizeLevel: DEFAULT_SIZE,
  },
  inspiration: {
    direction: '',
    audience: 'marketplace customer',
    channel: 'e-commerce',
    garmentPresetId: 'garment',
    audiencePresetId: 'women',
    channelPresetId: 'marketplace',
    useCasePresetId: 'auto',
    modelLookPresetId: 'auto',
    posePresetId: 'garment-led',
    cameraPresetId: 'iphone-natural',
    realismPresetId: 'daily-real',
    customPrompt: '',
    imageModelId: DEFAULT_MODEL,
    imageApiModel: DEFAULT_API_MODEL,
    llmModel: DEFAULT_LLM_MODEL,
    llmApiModel: DEFAULT_LLM_API_MODEL,
    imageQuality: DEFAULT_IMAGE_QUALITY,
    imageSubmitMode: DEFAULT_IMAGE_SUBMIT_MODE,
    planningStrength: 'balanced' as const,
    shotCount: 4,
    outputRatio: DEFAULT_RATIO,
    sizeLevel: DEFAULT_SIZE,
  },
  qualityQa: {
    enabled: false,
    passThreshold: 'normal' as const,
    customPrompt: '',
  },
};

function cleanId(value: string): string {
  return String(value || 'apparel-pack')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'apparel-pack';
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function skillText(skill: ApparelPackSkillSource): string {
  return [
    skill.name,
    skill.label,
    skill.description,
    skill.body,
    ...(skill.directions || []).map((item) => `${item.id || ''} ${item.label || ''} ${item.hint || ''}`),
    ...(skill.questions || []).map((item) => `${item.id || ''} ${item.label || ''} ${(item.options || []).join(' ')}`),
    ...(skill.templates || []).map((item) => `${item.id || ''} ${item.label || ''} ${item.flow || ''}`),
    ...(skill.verification || []).map((item) => `${item.id || ''} ${item.label || ''} ${item.hint || ''}`),
  ].filter(Boolean).join('\n');
}

function skillRole(skill: ApparelPackSkillSource): string {
  const text = skillText(skill).toLowerCase();
  if (/qa|quality|consistency|retry|质检|一致/.test(text)) return '质检与重试策略';
  if (/prompt|提示词|skeleton|architecture/.test(text)) return '提示词结构化';
  if (/children|kids|童装|child-safe|model/.test(text)) return '童装/模特安全与商品保真';
  if (/detail|ecommerce|commerce|listing|详情/.test(text)) return '电商交付策略';
  return '项目风格与约束';
}

function skillContributions(skill: ApparelPackSkillSource): string[] {
  const text = skillText(skill);
  const lower = text.toLowerCase();
  const contributions: string[] = [];
  if (/child|kids|童装|age-appropriate|儿童安全/.test(lower)) contributions.push('儿童安全、年龄合适、模特身份泛化');
  if (/product fidelity|garment fidelity|服装保真|product-faithful/.test(lower)) contributions.push('服装保真优先于场景和造型');
  if (/flatlay|hanger|平铺|挂拍|wrinkle|褶皱|background contrast/.test(lower)) contributions.push('平铺/挂拍背景对比、自然褶皱和商品排版');
  if (/prompt|skeleton|architecture|提示词/.test(lower)) contributions.push('系统提示词/用户提示词结构化');
  if (/qa|quality|retry|score|质检|重试/.test(lower)) contributions.push('分项质检、失败维度和聚焦重试补丁');
  if (/camera|lens|镜头|lighting|光线/.test(lower)) contributions.push('镜头、光线和真实感描述');
  return contributions.length ? unique(contributions) : ['作为项目约束参与 profile 合并'];
}

function sourceSkillRefs(skills: ApparelPackSkillSource[], patterns: RegExp[], fallbackReason: string) {
  return skills
    .filter((skill) => hasAny(skillText(skill).toLowerCase(), patterns))
    .map((skill) => ({ skillName: skill.name, reason: fallbackReason }));
}

function addPresetTrace(
  presets: Record<string, ApparelPackSkillProfilePreset>,
  trace: ApparelPackSkillProfileTraceItem[],
  field: string,
  label: string,
  value: string,
  sourceType: ApparelPackSkillProfileSourceType,
  sourceName: string,
  reason: string,
) {
  presets[field] = { label, value, sourceType, sourceName, reason };
  trace.push({ field: `presets.${field}`, value, sourceType, sourceName, reason });
}

function noteConflict(
  conflicts: ApparelPackSkillProfile['conflicts'],
  field: string,
  currentValue: unknown,
  chosen: string,
  sourceType: ApparelPackSkillProfileSourceType,
  sourceName: string,
  reason: string,
) {
  const current = String(currentValue || '').trim();
  if (!current || current === chosen) return;
  conflicts.push({
    field,
    candidates: [
      { value: current, sourceType: 'manual', sourceName: '当前节点配置' },
      { value: chosen, sourceType, sourceName },
    ],
    chosen,
    reason,
  });
}

function profileSkillLine(profile?: ApparelPackSkillProfile): string {
  if (!profile) return '';
  const sourceNames = profile.sourceSkills.map((skill) => skill.name).join(', ') || 'none';
  const presetLine = Object.entries(profile.presets)
    .map(([field, preset]) => `${field}=${preset.value}(${preset.sourceType}:${preset.sourceName})`)
    .join('; ');
  return [
    `Skill profile: ${profile.title}; version ${profile.version}; profileId ${profile.id}.`,
    `User intent: ${profile.userIntent || 'none'}.`,
    `Merged skills: ${sourceNames}.`,
    `Resolved presets: ${presetLine || 'none'}.`,
    `Trace summary: ${profile.trace.slice(0, 8).map((item) => `${item.field}=${item.value} from ${item.sourceType}`).join('; ')}`,
  ].join(' ');
}

function skillProfilePromptLines(profile?: ApparelPackSkillProfile): string[] {
  if (!profile) return [];
  const qa = profile.qualityGates
    .map((gate) => `${gate.label}: must pass ${gate.mustPass.join(', ')}; retry ${gate.retryPatch}`)
    .join(' | ');
  return [
    profileSkillLine(profile),
    profile.readableSummary,
    ...profile.steps.map((step) => `Skill profile step ${step.id}: ${step.goal}; ${step.userPrompt}`),
    qa ? `Skill profile QA gates: ${qa}` : '',
  ].filter(Boolean);
}

export function compileApparelPackSkillProfile(input: ApparelPackSkillProfileInput): ApparelPackSkillProfile {
  const skills = input.skills || [];
  const userIntent = nonEmptyText(input.userPrompt);
  const current = input.currentConfig || {};
  const intentText = `${userIntent}\n${skills.map(skillText).join('\n')}`.toLowerCase();
  const userText = userIntent.toLowerCase();
  const presets: Record<string, ApparelPackSkillProfilePreset> = {};
  const trace: ApparelPackSkillProfileTraceItem[] = [];
  const conflicts: ApparelPackSkillProfile['conflicts'] = [];

  const choose = (
    field: string,
    label: string,
    fallback: string,
    options: Array<{ value: string; patterns: RegExp[]; reason: string }>,
    defaultReason: string,
  ) => {
    let chosen = String(current[field] || fallback);
    let sourceType: ApparelPackSkillProfileSourceType = current[field] ? 'manual' : 'default';
    let sourceName = current[field] ? '当前节点配置' : '服装封包默认预设';
    let reason = current[field] ? '沿用用户已调过的节点配置' : defaultReason;
    for (const option of options) {
      if (hasAny(userText, option.patterns)) {
        noteConflict(conflicts, field, current[field], option.value, 'user', '用户提示词', option.reason);
        chosen = option.value;
        sourceType = 'user';
        sourceName = '用户提示词';
        reason = option.reason;
        break;
      }
      if (hasAny(intentText, option.patterns) && !current[field]) {
        chosen = option.value;
        sourceType = 'skill';
        sourceName = 'Skill 分析';
        reason = option.reason;
      }
    }
    addPresetTrace(presets, trace, field, label, chosen, sourceType, sourceName, reason);
    return chosen;
  };

  const garmentPresetId = choose('garmentPresetId', '品类', 'garment', [
    { value: 'set', patterns: [/套装|set|top and bottom|上衣.*裤|上衣.*短裤|matching/], reason: '识别到上下装/套装，需要锁定多件单品完整性' },
    { value: 'dress', patterns: [/连衣裙|dress/], reason: '识别到连衣裙品类' },
    { value: 'pants', patterns: [/裤|pants|shorts/], reason: '识别到裤装，但仍会防止只生成下装' },
    { value: 'hoodie', patterns: [/卫衣|hoodie/], reason: '识别到卫衣结构' },
  ], '默认通用服装');
  const audiencePresetId = choose('audiencePresetId', '受众', 'women', [
    { value: 'kidswear', patterns: [/童装|女童|男童|儿童|child|kids|kid|girl|boy/], reason: '识别到儿童/童装语境，启用儿童安全和年龄合适约束' },
    { value: 'men', patterns: [/男装|menswear|men\b/], reason: '识别到男装语境' },
    { value: 'women', patterns: [/女装|womenswear|women\b/], reason: '识别到女装语境' },
  ], '默认女装方向');
  const channelPresetId = choose('channelPresetId', '渠道', 'marketplace', [
    { value: 'temu', patterns: [/temu|拼多多跨境/], reason: '识别到 TEMU 平台主图/套图需求' },
    { value: 'shein', patterns: [/shein/], reason: '识别到 SHEIN 风格渠道' },
    { value: 'amazon', patterns: [/amazon|亚马逊/], reason: '识别到 Amazon 合规商品图需求' },
    { value: 'tiktok-shop', patterns: [/tiktok|抖音|短视频|信息流/], reason: '识别到信息流电商渠道' },
  ], '默认通用电商渠道');
  const useCasePresetId = choose('useCasePresetId', '场景', 'auto', [
    { value: 'sleepwear', patterns: [/睡衣|家居|homewear|pajama|pyjama|loungewear|bedroom/], reason: '服装用途是睡衣/家居，背景要回到居家日常元素' },
    { value: 'activewear', patterns: [/运动|active|playground|户外运动|休闲运动/], reason: '识别到运动休闲用途' },
    { value: 'outerwear', patterns: [/外套|户外|jacket|coat|outerwear/], reason: '识别到外套/户外用途' },
  ], '默认由服装用途自动路由');
  const modelLookPresetId = choose('modelLookPresetId', '模特外观', 'auto', [
    { value: 'euro-white-cute', patterns: [/欧美|白人|caucasian|european|white|金发|棕发/], reason: '用户指定欧美白人可爱模特外观，优先覆盖当前外观预设' },
    { value: 'east-asian-cute', patterns: [/东亚|亚洲|asian|黑发/], reason: '用户指定东亚模特外观' },
    { value: 'mixed-natural', patterns: [/混血|mixed/], reason: '用户指定混血自然外观' },
  ], '默认由受众和服装用途自动推断');
  const posePresetId = choose('posePresetId', '动作', 'garment-led', [
    { value: 'relaxed-homewear', patterns: [/松弛|居家|relaxed|homewear/], reason: '居家服装需要更日常放松的动作' },
    { value: 'playful-walk', patterns: [/走动|玩耍|playful|walk|户外/], reason: '识别到自然走动或玩耍动作诉求' },
    { value: 'garment-led', patterns: [/服装.*动作|以服装|garment-led|动作.*服装/], reason: '用户要求动作跟随服装用途和卖点' },
  ], '默认动作由服装用途决定');
  const cameraPresetId = choose('cameraPresetId', '镜头', 'iphone-natural', [
    { value: 'iphone-natural', patterns: [/iphone|手机|日常感|随拍/], reason: '用户要求 iPhone/手机日常真实感' },
    { value: 'ccd-snapshot', patterns: [/ccd|小相机|快照|flash/], reason: '用户要求 CCD 快照质感' },
    { value: 'dslr-commerce', patterns: [/dslr|单反|微单|相机|35mm|50mm/], reason: '用户要求相机/电商摄影质感' },
  ], '默认 iPhone 日常摄影');
  const realismPresetId = choose('realismPresetId', '真实感', 'daily-real', [
    { value: 'daily-real', patterns: [/日常|真实|real|natural|生活感/], reason: '用户要求日常真实感' },
    { value: 'ugc', patterns: [/ugc|买家秀|随手拍/], reason: '用户要求 UGC 商品照' },
    { value: 'lookbook-real', patterns: [/lookbook|画册|品牌感/], reason: '用户要求画册真实感' },
  ], '默认日常真实摄影');
  let qualityThreshold = choose('qualityThreshold', '质检标准', 'normal', [
    { value: 'strict', patterns: [/严格|不过关|质量|qa|retry|focused retry|重试|consistency|一致|保真/], reason: 'skills 或用户意图强调 QA/重试/一致性，默认升级严格质检' },
  ], '默认标准质检');
  if (
    qualityThreshold !== 'strict'
    && String(current.qualityThreshold || '').trim() === 'normal'
    && hasAny(intentText, [/qa|retry|focused retry|重试|consistency|一致|保真|quality|质检/])
  ) {
    noteConflict(
      conflicts,
      'qualityThreshold',
      current.qualityThreshold,
      'strict',
      'skill',
      'Skill 分析',
      '导入的 skills 明确要求 QA、保真或聚焦重试，normal 视作可被升级的默认质检强度',
    );
    qualityThreshold = 'strict';
    addPresetTrace(
      presets,
      trace,
      'qualityThreshold',
      '质检标准',
      qualityThreshold,
      'skill',
      'Skill 分析',
      '导入的 skills 明确要求 QA、保真或聚焦重试，自动升级到严格质检',
    );
  }

  const sourceSkills = skills.map((skill, index) => ({
    name: skill.name,
    label: skill.label || skill.name,
    role: skillRole(skill),
    weight: index === 0 ? 'primary' as const : 'support' as const,
    contributions: skillContributions(skill),
  }));

  const promptRefs = sourceSkillRefs(skills, [/prompt|提示词|skeleton|architecture/], '提供提示词结构和可检查字段');
  const modelRefs = sourceSkillRefs(skills, [/child|kids|童装|model|try-on|试穿|fidelity|保真/], '提供模特安全和服装保真规则');
  const qaRefs = sourceSkillRefs(skills, [/qa|quality|retry|质检|重试|consistency|一致/], '提供质检维度和聚焦重试规则');
  const allSkillRefs = sourceSkills.map((skill) => ({ skillName: skill.name, reason: skill.role }));
  const steps: ApparelPackSkillProfileStep[] = [
    {
      id: 'skill-profile-compile',
      label: 'Skill 分析与合并',
      goal: '读取多 skills、当前节点配置和用户提示词，形成可读且可追溯的生成 profile。',
      systemPrompt: 'You are a profile compiler for a canvas apparel generation workbench. Merge skills, user intent and current node settings into an inspectable JSON contract.',
      userPrompt: `Merge ${sourceSkills.length} skills for ${input.mode}; user intent: ${userIntent || 'none'}.`,
      sourceRefs: allSkillRefs,
    },
    {
      id: 'anchor-brief',
      label: '首图定稿 brief',
      goal: '先定稿服装真值、模特外观、动作、镜头、背景元素和不可变锚点规则。',
      systemPrompt: 'Finalize anchor facts before image generation. Product fidelity and source references outrank mood and styling.',
      userPrompt: [
        `Use garmentPreset=${garmentPresetId}, audience=${audiencePresetId}, channel=${channelPresetId}, useCase=${useCasePresetId}.`,
        `Model look=${modelLookPresetId}, pose=${posePresetId}, camera=${cameraPresetId}, realism=${realismPresetId}.`,
        userIntent ? `User intent: ${userIntent}` : '',
      ].filter(Boolean).join(' '),
      sourceRefs: unique([...promptRefs, ...modelRefs].map((ref) => `${ref.skillName}::${ref.reason}`))
        .map((item) => {
          const [skillName, reason] = item.split('::');
          return { skillName, reason };
        }),
      qualityGate: ['garment truth locked', 'model appearance locked', 'scene routed by garment'],
    },
    {
      id: 'anchor-generation',
      label: '首图锚点生成',
      goal: '生成正面模特、正面平铺、正面挂拍；正面锚点只吃正面服装参考，后续再追加背面/侧面/细节参考。',
      systemPrompt: 'Generate only anchor images first and keep references role-based.',
      userPrompt: 'Front anchors use garmentFront references first; back/left/right/detail refs are downstream constraints for derived shots.',
      sourceRefs: modelRefs.length ? modelRefs : allSkillRefs,
      qualityGate: ['front garment complete', 'flatlay contrast', 'hanger natural drape'],
    },
    {
      id: 'derived-shots',
      label: '派生图生成',
      goal: '锚点通过后，只改变背面、侧面、半身、动作、场景、细节等单一变量。',
      systemPrompt: 'Use approved anchors as immutable facts for derived shots.',
      userPrompt: 'Back/detail shots may use garmentBack/garmentLeft/garmentRight/garmentDetail references, but must not redesign the front anchor garment or model.',
      sourceRefs: allSkillRefs,
      qualityGate: ['allowed change only', 'same garment', 'same model family'],
    },
    {
      id: 'anchor-qa',
      label: '锚点质检与重试',
      goal: '先验收首图锚点，不通过就输出聚焦 retry patch，暂停后续派生。',
      systemPrompt: 'Inspect anchor outputs and return focused retry patches without rewriting successful variables.',
      userPrompt: 'Focused retry patch must separate product fidelity, model face/anatomy, flatlay/hanger layout, background contrast and channel fit.',
      sourceRefs: qaRefs.length ? qaRefs : allSkillRefs,
      qualityGate: ['focused retry', 'stop derived shots when anchor fails'],
    },
  ];

  const qualityGates = [
    {
      id: 'anchor-fidelity',
      label: '首图锚点保真',
      mustPass: [
        '完整套装/品类不丢件',
        '服装颜色、版型、印花、辅料不漂移',
        '模特脸型和儿童比例正常',
        '平铺/挂拍背景和服装有清晰对比',
      ],
      retryPatch: '只加强失败维度：服装真值、模特脸型、平铺/挂拍排版或背景对比。',
      sourceRefs: unique([...modelRefs, ...qaRefs].map((ref) => `${ref.skillName}::${ref.reason}`))
        .map((item) => {
          const [skillName, reason] = item.split('::');
          return { skillName, reason };
        }),
    },
    {
      id: 'derived-consistency',
      label: '派生图一致性',
      mustPass: [
        '只改变声明变量',
        '沿用首图服装和模特',
        '细节图不编造文字/logo',
        '符合平台缩略图可读性',
      ],
      retryPatch: '保留锚点成功变量，只修复漂移、裁切、人体或材质失败点。',
      sourceRefs: qaRefs.length ? qaRefs : allSkillRefs,
    },
  ];

  const readableSummary = [
    `任务理解：${userIntent || '按当前节点配置生成服装封包'}`,
    `合并 ${sourceSkills.length} 个 skill，模式 ${input.mode}。`,
    `预设：${garmentPresetId} / ${audiencePresetId} / ${channelPresetId} / ${useCasePresetId} / ${modelLookPresetId} / ${cameraPresetId}。`,
    '执行策略：先生成正面模特、正面平铺、正面挂拍并做锚点 QA，再派生背面、细节、动作和场景图。',
  ].join('\n');
  const profile: ApparelPackSkillProfile = {
    id: cleanId(`skill-profile-${input.mode}-${userIntent || sourceSkills.map((skill) => skill.name).join('-') || 'default'}`).slice(0, 96),
    version: 'apparel-skill-profile-v1',
    domain: 'skills-agent-apparel-workbench',
    title: sourceSkills.length
      ? `${sourceSkills[0].label} 驱动服装封包`
      : '服装封包默认工作台 profile',
    readableSummary,
    userIntent,
    sourceSkills,
    presets,
    referenceSlots: [
      { id: 'garmentFront', label: '服装正面', purpose: '首图模特/平铺/挂拍锚点主参考', firstAnchorOnly: true, sourceType: 'default' },
      { id: 'garmentBack', label: '服装背面', purpose: '背面模特/背面商品图派生参考', downstreamOnly: true, sourceType: 'default' },
      { id: 'garmentLeft', label: '服装左侧', purpose: '侧身/结构派生参考', downstreamOnly: true, sourceType: 'default' },
      { id: 'garmentRight', label: '服装右侧', purpose: '侧身/结构派生参考', downstreamOnly: true, sourceType: 'default' },
      { id: 'garmentDetail', label: '细节/面料', purpose: '面料、辅料、印花和细节图参考', downstreamOnly: true, sourceType: 'default' },
      { id: 'model', label: '模特参考', purpose: '套图模式中用于模特身份/姿势授权参考', sourceType: 'default' },
      { id: 'style', label: '风格参考', purpose: '只作为光线、场景和构图参考，不能覆盖服装真值', sourceType: 'default' },
    ],
    steps,
    qualityGates,
    conflicts,
    trace,
    json: '',
  };
  profile.json = JSON.stringify({
    ...profile,
    json: undefined,
  }, null, 2);
  return profile;
}

function profileWithoutJson(profile: ApparelPackSkillProfile): Omit<ApparelPackSkillProfile, 'json'> {
  const { json: _json, ...rest } = profile;
  return rest;
}

export function buildApparelPackSkillProfileAgentPrompt(
  input: ApparelPackSkillProfileInput,
  fallbackProfile = compileApparelPackSkillProfile(input),
): ApparelPackSkillProfileAgentPrompt {
  const selectedSkills = (input.skills || []).map((skill) => ({
    name: skill.name,
    label: skill.label || skill.name,
    description: skill.description || '',
    directions: skill.directions || [],
    questions: skill.questions || [],
    templates: skill.templates || [],
    verification: skill.verification || [],
    body: String(skill.body || '').slice(0, 12000),
  }));
  const schemaTemplate = profileWithoutJson(fallbackProfile);
  const systemPrompt = [
    'You are the LLM profile compiler for a canvas apparel generation workbench.',
    'Return JSON only. Do not use markdown, comments, prose, or code fences.',
    'The JSON must follow version apparel-skill-profile-v1 and domain skills-agent-apparel-workbench.',
    'Merge multiple skills, current node settings, and user intent into an inspectable profile for an apparel-pack node.',
    'Precedence: 用户提示词优先 > 用户手动改过的节点配置 > skill profile > 当前服装默认 preset.',
    'Keep traceability explicit: every changed preset, step, quality gate, and conflict must explain sourceType, sourceName, and reason.',
    'Keep the workflow anchor-first: front model, front flatlay, front hanger, anchor QA, then derived shots and final QA.',
    'Reference slots must stay directional: garmentFront for first anchors; garmentBack/garmentLeft/garmentRight/garmentDetail for downstream derived shots.',
  ].join('\n');
  const userPrompt = JSON.stringify({
    task: 'Compile or refine one apparel skill profile JSON for the current apparel-pack node.',
    precedence: '用户提示词优先 > 用户手动改过的节点配置 > skill profile > 当前服装默认 preset',
    outputContract: {
      version: 'apparel-skill-profile-v1',
      domain: 'skills-agent-apparel-workbench',
      requiredTopLevelKeys: [
        'id',
        'version',
        'domain',
        'title',
        'readableSummary',
        'userIntent',
        'sourceSkills',
        'presets',
        'referenceSlots',
        'steps',
        'qualityGates',
        'conflicts',
        'trace',
      ],
      allowedSourceTypes: ['user', 'manual', 'skill', 'default'],
      notes: [
        'Use readable Chinese labels and reasons for the UI.',
        'Presets should use existing apparel-pack preset ids when possible.',
        'Steps must include systemPrompt and userPrompt for each agent stage.',
        'Quality gates must include mustPass and retryPatch.',
        'Conflicts should explain why one candidate wins.',
        'Do not include the json field; the app will fill it after validation.',
      ],
    },
    mode: input.mode,
    userPrompt: input.userPrompt || '',
    currentConfig: input.currentConfig || {},
    selectedSkills,
    fallbackProfile: schemaTemplate,
  }, null, 2);
  return { systemPrompt, userPrompt, fallbackProfile };
}

function extractJsonCandidate(text: string): string {
  const raw = String(text || '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) return fenced[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return raw;
}

function normalizeProfileSourceType(value: unknown, fallback: ApparelPackSkillProfileSourceType): ApparelPackSkillProfileSourceType {
  const text = String(value || '').trim();
  return text === 'user' || text === 'manual' || text === 'skill' || text === 'default' ? text : fallback;
}

function normalizeProfilePresets(
  value: unknown,
  fallback: ApparelPackSkillProfile['presets'],
): ApparelPackSkillProfile['presets'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const out: ApparelPackSkillProfile['presets'] = { ...fallback };
  for (const [field, presetValue] of Object.entries(value as Record<string, any>)) {
    const fallbackPreset = fallback[field] || {
      label: field,
      value: '',
      sourceType: 'skill' as const,
      sourceName: 'LLM 草案',
      reason: 'LLM profile draft',
    };
    if (!presetValue || typeof presetValue !== 'object' || Array.isArray(presetValue)) continue;
    out[field] = {
      label: String(presetValue.label || fallbackPreset.label || field),
      value: String(presetValue.value || fallbackPreset.value || ''),
      sourceType: normalizeProfileSourceType(presetValue.sourceType, fallbackPreset.sourceType),
      sourceName: String(presetValue.sourceName || fallbackPreset.sourceName || 'LLM 草案'),
      reason: String(presetValue.reason || fallbackPreset.reason || 'LLM profile draft'),
    };
  }
  return out;
}

function normalizeProfileTrace(
  value: unknown,
  fallback: ApparelPackSkillProfileTraceItem[],
): ApparelPackSkillProfileTraceItem[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item: any) => ({
      field: String(item.field || '').trim(),
      value: String(item.value || '').trim(),
      sourceType: normalizeProfileSourceType(item.sourceType, 'skill'),
      sourceName: String(item.sourceName || 'LLM 草案'),
      reason: String(item.reason || 'LLM profile draft'),
    }))
    .filter((item) => item.field && item.value);
  return out.length ? out : fallback;
}

function normalizeProfileSteps(
  value: unknown,
  fallback: ApparelPackSkillProfileStep[],
): ApparelPackSkillProfileStep[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item: any, index) => ({
      id: cleanId(String(item.id || `llm-step-${index + 1}`)),
      label: String(item.label || `LLM 步骤 ${index + 1}`),
      goal: String(item.goal || item.description || ''),
      systemPrompt: String(item.systemPrompt || ''),
      userPrompt: String(item.userPrompt || ''),
      sourceRefs: Array.isArray(item.sourceRefs)
        ? item.sourceRefs
          .filter((ref: any) => ref && typeof ref === 'object' && !Array.isArray(ref))
          .map((ref: any) => ({ skillName: String(ref.skillName || 'LLM 草案'), reason: String(ref.reason || 'LLM profile draft') }))
        : [],
      qualityGate: Array.isArray(item.qualityGate) ? item.qualityGate.map((entry: unknown) => String(entry || '')).filter(Boolean) : undefined,
    }))
    .filter((item) => item.id && item.label && item.goal);
  return out.length ? out : fallback;
}

function normalizeProfileQualityGates(
  value: unknown,
  fallback: ApparelPackSkillProfile['qualityGates'],
): ApparelPackSkillProfile['qualityGates'] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item: any, index) => ({
      id: cleanId(String(item.id || `llm-quality-gate-${index + 1}`)),
      label: String(item.label || `LLM 质量门槛 ${index + 1}`),
      mustPass: Array.isArray(item.mustPass) ? item.mustPass.map((entry: unknown) => String(entry || '')).filter(Boolean) : [],
      retryPatch: String(item.retryPatch || ''),
      sourceRefs: Array.isArray(item.sourceRefs)
        ? item.sourceRefs
          .filter((ref: any) => ref && typeof ref === 'object' && !Array.isArray(ref))
          .map((ref: any) => ({ skillName: String(ref.skillName || 'LLM 草案'), reason: String(ref.reason || 'LLM profile draft') }))
        : [],
    }))
    .filter((item) => item.id && item.label && item.mustPass.length > 0);
  return out.length ? out : fallback;
}

function normalizeProfileConflicts(
  value: unknown,
  fallback: ApparelPackSkillProfile['conflicts'],
): ApparelPackSkillProfile['conflicts'] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item: any) => ({
      field: String(item.field || '').trim(),
      candidates: Array.isArray(item.candidates)
        ? item.candidates
          .filter((candidate: any) => candidate && typeof candidate === 'object' && !Array.isArray(candidate))
          .map((candidate: any) => ({
            value: String(candidate.value || ''),
            sourceType: normalizeProfileSourceType(candidate.sourceType, 'skill'),
            sourceName: String(candidate.sourceName || 'LLM 草案'),
          }))
        : [],
      chosen: String(item.chosen || '').trim(),
      reason: String(item.reason || 'LLM profile conflict resolution'),
    }))
    .filter((item) => item.field && item.chosen);
  return out.length ? out : fallback;
}

export function parseApparelPackSkillProfileAgentJson(
  text: string,
  fallbackProfile: ApparelPackSkillProfile,
): ApparelPackSkillProfile | null {
  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonCandidate(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const profile: ApparelPackSkillProfile = {
    ...fallbackProfile,
    id: cleanId(String(parsed.id || fallbackProfile.id || 'skill-profile-llm-draft')),
    version: 'apparel-skill-profile-v1',
    domain: 'skills-agent-apparel-workbench',
    title: String(parsed.title || fallbackProfile.title || 'LLM Profile 草案'),
    readableSummary: String(parsed.readableSummary || fallbackProfile.readableSummary || ''),
    userIntent: String(parsed.userIntent || fallbackProfile.userIntent || ''),
    sourceSkills: Array.isArray(parsed.sourceSkills) && parsed.sourceSkills.length
      ? parsed.sourceSkills
        .filter((skill: any) => skill && typeof skill === 'object' && !Array.isArray(skill))
        .map((skill: any, index: number) => ({
          name: String(skill.name || `skill-${index + 1}`),
          label: String(skill.label || skill.name || `Skill ${index + 1}`),
          role: String(skill.role || 'LLM 合并约束'),
          weight: skill.weight === 'primary' ? 'primary' : 'support',
          contributions: Array.isArray(skill.contributions) ? skill.contributions.map((entry: unknown) => String(entry || '')).filter(Boolean) : [],
        }))
      : fallbackProfile.sourceSkills,
    presets: normalizeProfilePresets(parsed.presets, fallbackProfile.presets),
    referenceSlots: Array.isArray(parsed.referenceSlots) && parsed.referenceSlots.length ? parsed.referenceSlots : fallbackProfile.referenceSlots,
    steps: normalizeProfileSteps(parsed.steps, fallbackProfile.steps),
    qualityGates: normalizeProfileQualityGates(parsed.qualityGates, fallbackProfile.qualityGates),
    conflicts: normalizeProfileConflicts(parsed.conflicts, fallbackProfile.conflicts),
    trace: normalizeProfileTrace(parsed.trace, fallbackProfile.trace),
    json: '',
  };
  profile.json = JSON.stringify(profileWithoutJson(profile), null, 2);
  return profile;
}

function presetFrom(list: readonly ApparelPackPresetItem[], id: unknown, fallbackId: string): ApparelPackPresetItem {
  return list.find((item) => item.id === String(id || '')) || list.find((item) => item.id === fallbackId) || list[0];
}

function presetValue(preset: ApparelPackPresetItem, custom: unknown): string {
  const text = String(custom || '').trim();
  if (preset.id === 'custom' && text) return text;
  return text || preset.value;
}

function compactLines(values: Array<string | undefined>): string[] {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function nonEmptyText(value: unknown): string {
  return String(value || '').trim();
}

const TRANSLATION_KEYWORD_PAIRS: Array<{ zh: string; en: string; aliases?: string[] }> = [
  { zh: '服装', en: 'garment', aliases: ['apparel', 'outfit', 'product'] },
  { zh: '套装', en: 'set', aliases: ['top and bottom', 'matching'] },
  { zh: '模特', en: 'model' },
  { zh: '正面', en: 'front', aliases: ['front-view'] },
  { zh: '背面', en: 'back', aliases: ['back-view'] },
  { zh: '平铺', en: 'flat lay', aliases: ['flatlay', 'top-down'] },
  { zh: '挂拍', en: 'hanger', aliases: ['hanging'] },
  { zh: '细节', en: 'detail', aliases: ['close-up', 'macro'] },
  { zh: '镜头', en: 'camera', aliases: ['lens', 'iPhone', 'CCD', 'DSLR'] },
  { zh: '背景', en: 'background', aliases: ['scene', 'backdrop'] },
  { zh: '光线', en: 'lighting', aliases: ['light'] },
  { zh: '面料', en: 'fabric', aliases: ['material', 'texture'] },
  { zh: '印花', en: 'print', aliases: ['motif', 'graphic'] },
  { zh: '不要', en: 'negative', aliases: ['no ', 'avoid', 'do not'] },
];

function buildTranslationDiff(zhText: string, enText: string): ApparelPackTranslationDiff {
  const zh = nonEmptyText(zhText);
  const en = nonEmptyText(enText);
  const lower = en.toLowerCase();
  const keywordPairs = TRANSLATION_KEYWORD_PAIRS.map((item) => {
    const required = zh.includes(item.zh);
    const candidates = [item.en, ...(item.aliases || [])].map((value) => value.toLowerCase());
    const covered = candidates.some((candidate) => lower.includes(candidate));
    return {
      zh: item.zh,
      en: item.en,
      status: required ? (covered ? 'covered' as const : 'missing' as const) : 'not-required' as const,
    };
  });
  const requiredPairs = keywordPairs.filter((item) => item.status !== 'not-required');
  const coveredCount = requiredPairs.filter((item) => item.status === 'covered').length;
  const coverageScore = requiredPairs.length ? Math.round((coveredCount / requiredPairs.length) * 100) : 100;
  const missingKeywords = requiredPairs.filter((item) => item.status === 'missing').map((item) => `${item.zh}/${item.en}`);
  return {
    zhText: zh,
    enText: en,
    coverageScore,
    keywordPairs,
    missingKeywords,
    summary: missingKeywords.length
      ? `缺少 ${missingKeywords.join('、')}`
      : '中英关键约束已覆盖',
  };
}

function resolveImageModelSettings(params: {
  imageModelId?: string;
  imageApiModel?: string;
  imageQuality?: string;
  imageSubmitMode?: string;
}) {
  const quality = String(params.imageQuality || DEFAULT_IMAGE_QUALITY).trim();
  const submitMode = String(params.imageSubmitMode || DEFAULT_IMAGE_SUBMIT_MODE).trim();
  return {
    model: nonEmptyText(params.imageModelId) || DEFAULT_MODEL,
    apiModel: nonEmptyText(params.imageApiModel) || DEFAULT_API_MODEL,
    imageQuality: (['auto', 'low', 'medium', 'high'].includes(quality) ? quality : DEFAULT_IMAGE_QUALITY) as ApparelPackImageQuality,
    imageSubmitMode: (submitMode === 'sync' ? 'sync' : DEFAULT_IMAGE_SUBMIT_MODE) as ApparelPackImageSubmitMode,
  };
}

function resolveLlmModelSettings(params: {
  llmModel?: string;
  llmApiModel?: string;
}) {
  const model = nonEmptyText(params.llmModel) || DEFAULT_LLM_MODEL;
  return {
    model,
    apiModel: nonEmptyText(params.llmApiModel) || model || DEFAULT_LLM_API_MODEL,
  };
}

function promptOverrideFor(
  overrides: ApparelPackPromptOverrides | undefined,
  keys: Array<string | undefined>,
): ApparelPackPromptOverride | undefined {
  if (!overrides) return undefined;
  for (const key of keys) {
    const clean = nonEmptyText(key);
    if (!clean) continue;
    const override = overrides[clean];
    if (!override) continue;
    if (nonEmptyText(override.systemPrompt) || nonEmptyText(override.userPrompt) || nonEmptyText(override.finalPrompt)) {
      return override;
    }
  }
  return undefined;
}

function applyPromptOverride(
  spec: ApparelPromptAgentSpec,
  override?: ApparelPackPromptOverride,
): ResolvedApparelPromptAgentSpec {
  const systemPrompt = nonEmptyText(override?.systemPrompt) || spec.systemPrompt;
  const userPrompt = nonEmptyText(override?.userPrompt) || spec.userPrompt;
  const systemPromptZh = spec.systemPromptZh;
  const userPromptZh = spec.userPromptZh;
  const hasSystemOverride = Boolean(nonEmptyText(override?.systemPrompt));
  const hasUserOverride = Boolean(nonEmptyText(override?.userPrompt));
  const finalPrompt = nonEmptyText(override?.finalPrompt)
    || (hasSystemOverride || hasUserOverride
      ? [
        'System prompt:',
        systemPrompt,
        '',
        'User prompt:',
        userPrompt,
      ].join('\n')
      : spec.finalPrompt);
  const finalPromptZh = hasSystemOverride || hasUserOverride || Boolean(nonEmptyText(override?.finalPrompt))
    ? [
      '系统提示词：',
      systemPromptZh,
      '',
      '用户提示词：',
      userPromptZh,
    ].join('\n')
    : spec.finalPromptZh;
  return {
    systemPrompt,
    systemPromptZh,
    userPrompt,
    userPromptZh,
    finalPrompt,
    finalPromptZh,
    defaultSystemPrompt: spec.systemPrompt,
    defaultSystemPromptZh: spec.systemPromptZh,
    defaultUserPrompt: spec.userPrompt,
    defaultUserPromptZh: spec.userPromptZh,
    defaultFinalPrompt: spec.finalPrompt,
    defaultFinalPromptZh: spec.finalPromptZh,
    promptOverridden: hasSystemOverride || hasUserOverride || Boolean(nonEmptyText(override?.finalPrompt)),
  };
}

function promptStepLabel(key: string, fallback: string): string {
  const labels: Record<string, string> = {
    brief: '流程规划',
    'quality-qa': '质量测试与调优',
    'model-front-anchor': '正面模特',
    'model-back-derived': '背面模特',
    'model-half-detail-derived': '半身细节',
    'model-side-derived': '侧身模特',
    'model-lifestyle-derived': '场景模特',
    'flatlay-anchor': '平铺锚点',
    'flatlay-derived': '平铺图',
    'hanger-product-anchor': '挂拍锚点',
    'hanger-product-derived': '挂拍图',
    'garment-detail-derived': '商品细节',
    'fabric-macro-derived': '面料微距',
    'label-detail-derived': '领标/辅料',
    'size-reference-derived': '尺码参考',
    'color-texture-derived': '颜色质感',
  };
  return labels[key] || fallback || key;
}

const PROMPT_REFERENCE_HIERARCHY = 'source reference images and user custom prompt > LLM finalized brief > anchor image nodes > presets and style references';
const PROMPT_CONSISTENCY_LOCK = 'Do not change garment silhouette, colorway, print placement, model identity, lighting family, or channel fit';

function referenceImageMapPolicy(role: string): string {
  const derived = role.includes('-derived');
  return [
    'Reference image map: address attached references by order as Image 1, Image 2, Image 3, etc.',
    'garmentSetLock: before prompting, inventory every visible garment piece and preserve the complete set, not just the most salient garment.',
    'If the first four garment references form a matching outfit set, use this default product map unless visual evidence contradicts it: Image 1: top front, Image 2: bottom front, Image 3: top back, Image 4: bottom back.',
    'For outfit sets, model shots must wear the complete matching set and product-only shots must show all set pieces; do not generate only shorts, only a top, or a single extracted garment unless the user explicitly asks for one piece.',
    derived
      ? 'Generated anchor image becomes Image 1 for this derived shot; use source garment references after it only to verify construction, fabric, color, trims, and print placement.'
      : 'For source-reference anchor shots, Image 1 is the primary garment truth; Image 2 is the secondary garment or construction/detail reference; later garment images only confirm details.',
    'Model reference images define authorized/generic pose, body proportion, and styling only; any model or style reference must never override garmentTruthLock.',
    'Style references define lighting, background family, and channel mood only; if references conflict, preserve Image 1 and the user custom prompt.',
    'Use Image 1 as the primary garment truth. Use Image 2 only for secondary construction/detail confirmation.',
  ].join(' ');
}

function finalReferenceImageMapPolicy(role: string): string {
  const derived = role.includes('-derived');
  return [
    'Use attached references by order as Image 1, Image 2, Image 3, etc.',
    'garmentSetLock: inventory every visible garment piece first; preserve the complete matching set, not just one piece.',
    'For outfit sets, model shots must wear the complete matching set; do not generate only shorts, only a top, or a single extracted garment unless explicitly requested.',
    derived
      ? 'Generated anchor image becomes Image 1 for this derived shot; source garment references are verification for construction, color, trims, and print placement.'
      : 'Immutable anchor lock: for source-reference anchor shots, use Image 1 as the primary garment truth. Use Image 2 only for secondary construction/detail confirmation.',
    'If Image 1 and Image 2 are top-front and bottom-front references, the model must wear both pieces and product-only shots must show both pieces.',
    'Model or style reference must never override garmentTruthLock.',
  ].join(' ');
}

function finalPromptExtraLines(extra: string[]): string[] {
  return compactLines(extra)
    .filter((item) => !/^Preset prompt context:/i.test(item))
    .filter((item) => !/^(themeMotifLock|modelAppearanceLock|poseLock|cameraLookLock|realismStyleLock):/i.test(item))
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 8);
}

function promptRolePolicy(role: string): {
  phase: string;
  contract: string;
  allowedChange: string;
} {
  if (role === 'model-front-anchor') {
    return {
      phase: 'Anchor finalization',
      contract: 'Immutable anchor lock: garmentTruthLock, modelIdentityLock, fitLock, lightingLock, and backgroundFamilyLock are established from the brief and references.',
      allowedChange: 'establish the front model anchor, exact garment fit, readable pose, and reusable lighting/background family',
    };
  }
  if (role === 'flatlay-anchor') {
    return {
      phase: 'Anchor finalization',
      contract: 'Immutable anchor lock: product-only anchor, garmentTruthLock, constructionLock, colorLock, and materialLock are established without a model.',
      allowedChange: 'establish a product-only anchor as a clean flat lay front view; no model',
    };
  }
  if (role === 'hanger-product-anchor') {
    return {
      phase: 'Anchor finalization',
      contract: 'Immutable anchor lock: product-only anchor, garmentTruthLock, drapeLock, frontConstructionLock, colorLock, and materialLock are established on a hanger.',
      allowedChange: 'establish a product-only anchor as a front-facing hanger view; no model',
    };
  }
  if (role === 'model-back-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve all anchor locks and derive only the viewpoint.',
      allowedChange: 'change only viewpoint to back view',
    };
  }
  if (role === 'model-half-detail-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve model and garment anchors and derive only crop distance.',
      allowedChange: 'change only crop to half-body product detail',
    };
  }
  if (role === 'model-side-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve model and garment anchors and derive only body angle.',
      allowedChange: 'change only viewpoint to side or three-quarter view',
    };
  }
  if (role === 'model-lifestyle-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve product and model anchors while changing only context energy.',
      allowedChange: 'change only simple lifestyle context and pose energy while keeping the garment dominant',
    };
  }
  if (role === 'garment-detail-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve product anchors and derive only close-up detail focus.',
      allowedChange: 'change only crop to fabric, seam, trim, collar, sleeve, hem, or print detail',
    };
  }
  if (role === 'fabric-macro-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve product anchors and derive only macro material focus.',
      allowedChange: 'change only macro crop to fabric weave, stitch, print edge, or texture',
    };
  }
  if (role === 'label-detail-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve product anchors and derive only trim or label-area focus.',
      allowedChange: 'change only crop to label area, collar, trim, button, zipper, drawcord, or hem detail',
    };
  }
  if (role === 'color-texture-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve product anchors and derive only color/material presentation.',
      allowedChange: 'change only crop and lighting emphasis for accurate color and texture',
    };
  }
  if (role === 'size-reference-derived') {
    return {
      phase: 'Derived-shot rule',
      contract: 'Derived-shot rule: preserve product/model anchors and derive only scale readability.',
      allowedChange: 'change only pose/crop needed to show scale and fit proportion',
    };
  }
  return {
    phase: role.includes('anchor') ? 'Anchor finalization' : 'Derived-shot rule',
    contract: role.includes('anchor')
      ? 'Immutable anchor lock: finalize reusable garment, model or product-display facts for downstream shots.'
      : 'Derived-shot rule: preserve anchor locks and change only the declared scene variable.',
    allowedChange: 'change only the declared shot variable',
  };
}

function resolvePresetContext(params: {
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  useCasePresetId?: string;
  modelLookPresetId?: string;
  posePresetId?: string;
  cameraPresetId?: string;
  realismPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customUseCase?: string;
  customModelLook?: string;
  customPose?: string;
  customCamera?: string;
  customRealism?: string;
  customPrompt?: string;
  fallbackGarment?: string;
  fallbackAudience?: string;
  fallbackChannel?: string;
  fallbackUseCase?: string;
}) {
  const garmentPreset = presetFrom(APPAREL_PACK_PRESETS.garmentTypes, params.garmentPresetId, 'garment');
  const audiencePreset = presetFrom(APPAREL_PACK_PRESETS.audiences, params.audiencePresetId, 'women');
  const channelPreset = presetFrom(APPAREL_PACK_PRESETS.channels, params.channelPresetId, 'marketplace');
  const useCasePreset = presetFrom(APPAREL_PACK_PRESETS.useCases, params.useCasePresetId, 'auto');
  const modelLookPreset = presetFrom(APPAREL_PACK_PRESETS.modelLooks, params.modelLookPresetId, 'auto');
  const posePreset = presetFrom(APPAREL_PACK_PRESETS.poseStyles, params.posePresetId, 'garment-led');
  const cameraPreset = presetFrom(APPAREL_PACK_PRESETS.cameraStyles, params.cameraPresetId, 'iphone-natural');
  const realismPreset = presetFrom(APPAREL_PACK_PRESETS.realismStyles, params.realismPresetId, 'daily-real');
  const presetAwareValue = (
    customValue: string | undefined,
    fallbackValue: string | undefined,
    presetId: string | undefined,
    defaultPresetId: string,
    preset: ApparelPackPresetItem,
  ) => {
    const custom = String(customValue || '').trim();
    if (custom) return custom;
    const selectedPresetId = String(presetId || '').trim();
    if (selectedPresetId && selectedPresetId !== defaultPresetId && selectedPresetId !== 'custom') {
      return presetValue(preset, '');
    }
    return String(fallbackValue || '').trim() || presetValue(preset, '');
  };
  const garmentType = presetAwareValue(params.customGarmentType, params.fallbackGarment, params.garmentPresetId, 'garment', garmentPreset);
  const audience = presetAwareValue(params.customAudience, params.fallbackAudience, params.audiencePresetId, 'women', audiencePreset);
  const channel = presetAwareValue(params.customChannel, params.fallbackChannel, params.channelPresetId, 'marketplace', channelPreset);
  const useCase = presetAwareValue(params.customUseCase, params.fallbackUseCase, params.useCasePresetId, 'auto', useCasePreset);
  const modelLook = presetValue(modelLookPreset, params.customModelLook);
  const poseStyle = presetValue(posePreset, params.customPose);
  const cameraStyle = presetValue(cameraPreset, params.customCamera);
  const realismStyle = presetValue(realismPreset, params.customRealism);
  const customPrompt = String(params.customPrompt || '').trim();
  const lines = compactLines([
    `Garment preset (${garmentPreset.label}) EN: ${garmentPreset.promptEn}`,
    `Audience preset (${audiencePreset.label}) EN: ${audiencePreset.promptEn}`,
    `Channel preset (${channelPreset.label}) EN: ${channelPreset.promptEn}`,
    `Use-case scene preset (${useCasePreset.label}) EN: ${useCasePreset.promptEn}`,
    `Model look preset (${modelLookPreset.label}) EN: ${modelLookPreset.promptEn}`,
    `Pose preset (${posePreset.label}) EN: ${posePreset.promptEn}`,
    `Camera preset (${cameraPreset.label}) EN: ${cameraPreset.promptEn}`,
    `Realism preset (${realismPreset.label}) EN: ${realismPreset.promptEn}`,
    customPrompt ? `User custom prompt: ${customPrompt}` : undefined,
  ]);
  const linesZh = compactLines([
    `品类预设（${garmentPreset.label}）中文：${garmentPreset.promptZh}`,
    `人群预设（${audiencePreset.label}）中文：${audiencePreset.promptZh}`,
    `平台预设（${channelPreset.label}）中文：${channelPreset.promptZh}`,
    `场景预设（${useCasePreset.label}）中文：${useCasePreset.promptZh}`,
    `模特外观（${modelLookPreset.label}）中文：${modelLookPreset.promptZh}`,
    `动作风格（${posePreset.label}）中文：${posePreset.promptZh}`,
    `镜头质感（${cameraPreset.label}）中文：${cameraPreset.promptZh}`,
    `真实感（${realismPreset.label}）中文：${realismPreset.promptZh}`,
    customPrompt ? `用户补充：${customPrompt}` : undefined,
  ]);
  return {
    garmentPreset,
    audiencePreset,
    channelPreset,
    useCasePreset,
    modelLookPreset,
    posePreset,
    cameraPreset,
    realismPreset,
    garmentType,
    audience,
    channel,
    useCase,
    modelLook,
    poseStyle,
    cameraStyle,
    realismStyle,
    customPrompt,
    promptLines: lines,
    promptLinesZh: linesZh,
    promptText: lines.join(' | '),
    promptTextZh: linesZh.join(' | '),
  };
}

function collectReferences(refs: ApparelPackReferenceSet | undefined, keys: Array<keyof ApparelPackReferenceSet>): string[] {
  return unique(keys.flatMap((key) => refs?.[key] || []));
}

function resolveGarmentReferenceSlots(refs: ApparelPackReferenceSet | undefined): {
  front: string[];
  back: string[];
  side: string[];
  detail: string[];
  all: string[];
} {
  const legacy = unique(refs?.garment || []);
  const explicitFront = unique(refs?.garmentFront || []);
  const explicitBack = unique(refs?.garmentBack || []);
  const explicitLeft = unique(refs?.garmentLeft || []);
  const explicitRight = unique(refs?.garmentRight || []);
  const explicitDetail = unique(refs?.garmentDetail || []);
  const hasDirectional = [
    explicitFront,
    explicitBack,
    explicitLeft,
    explicitRight,
    explicitDetail,
  ].some((items) => items.length > 0);

  if (hasDirectional) {
    const front = explicitFront.length ? explicitFront : legacy;
    const back = explicitBack;
    const side = unique([...explicitLeft, ...explicitRight]);
    const detail = explicitDetail;
    return {
      front,
      back,
      side,
      detail,
      all: unique([...front, ...back, ...side, ...detail, ...legacy]),
    };
  }

  if (legacy.length >= 4) {
    return {
      front: legacy.slice(0, 2),
      back: legacy.slice(2, 4),
      side: [],
      detail: legacy.slice(4),
      all: legacy,
    };
  }

  if (legacy.length === 3) {
    return {
      front: legacy.slice(0, 2),
      back: legacy.slice(2),
      side: [],
      detail: [],
      all: legacy,
    };
  }

  return {
    front: legacy,
    back: [],
    side: [],
    detail: [],
    all: legacy,
  };
}

function buildThemeMotifLock(presetContext: ReturnType<typeof resolvePresetContext>): string {
  const promptText = `${presetContext.customPrompt} ${presetContext.promptText}`.trim();
  if (/peppa\s*pig|小猪佩奇/i.test(promptText)) {
    return 'themeMotifLock: Peppa Pig is the dominant garment theme; preserve the Peppa Pig print feeling on the outfit and echo Peppa Pig in background props such as a Peppa Pig poster, plush toy, bedding detail, or folded themed sleepwear, while keeping the garment as the hero and avoiding fake logo text.';
  }
  return 'themeMotifLock: identify the dominant print, IP character, animal, cartoon, rainbow, flower, slogan, or color motif from the garment references and user prompt; echo that theme in 1-3 subtle garment-context background elements without overpowering the product.';
}

function isKidswearPresetContext(presetContext: ReturnType<typeof resolvePresetContext>): boolean {
  const text = [
    presetContext.audience,
    presetContext.audiencePreset.id,
    presetContext.audiencePreset.prompt,
    presetContext.customPrompt,
    presetContext.modelLook,
    presetContext.modelLookPreset.prompt,
  ].join(' ').toLowerCase();
  return /kid|child|children|童装|young|girl|boy/.test(text);
}

function buildModelFaceQualityLock(presetContext: ReturnType<typeof resolvePresetContext>): string {
  if (isKidswearPresetContext(presetContext)) {
    return 'modelFaceQualityLock: cute realistic child face with normal child chin, soft jawline, natural cheek volume, bright eyes, small relaxed smile, age-appropriate body proportion and head-to-body proportion; no chin dimple, no vertical chin crease, no lower-face crease; avoid cleft chin, butt chin, protruding chin, overly pointed V-jaw, heavy makeup, adultized face, adult body proportion, distorted hands, and pageant styling.';
  }
  return 'modelFaceQualityLock: natural commercial face structure with normal chin and jawline, realistic skin texture and relaxed expression; no chin dimple, no vertical chin crease, no lower-face crease; avoid cleft chin, butt chin, protruding chin, plastic skin, distorted hands, and over-retouched face.';
}

function buildProductDisplayLayoutLock(kind: 'flatlay' | 'hanger', presetContext: ReturnType<typeof resolvePresetContext>): string {
  const promptText = `${presetContext.customPrompt} ${presetContext.promptText}`.toLowerCase();
  const pinkGuard = /pink|粉|peppa|小猪佩奇/.test(promptText)
    ? 'For light pink or Peppa Pig sleepwear, avoid pink-on-pink backgrounds; no dominant white rug, no dominant cream background, avoid white fur rug, avoid high-key white and no dominant white wall. Prefer cool pastel contrast surfaces: pale mint, light blue, soft sage, cool pastel wall, or light oak with a cool blue/green mat; keep prop colors separated from the garment.'
    : 'Choose a surface color by looking at the garment first, then pick a different value and hue so the outline reads immediately.';
  const base = [
    `${kind}ProductDisplayLock: use clear background contrast against the garment; background must not match the garment color; avoid tone-on-tone washout and same-color props.`,
    pinkGuard,
    'Create a single product hero focal point, keep complete margins, no crop, breathing room around every garment piece, clear top/bottom hierarchy, and no props covering collars, straps, waistband, hems, prints, seams, or trims.',
    'Use a slightly zoomed-out composition: the full garment set should occupy about 72-78% frame height, around 75% if possible, with 8-12% negative space and a continuous background border on all four sides; garment pieces must not touch the image edges, and the crop must show the complete outline.',
    'Remove obvious wrinkles by pressing or steaming the garment; only natural fabric wrinkles remain, with believable fabric weight and clean ecommerce readability.',
  ];
  if (kind === 'flatlay') {
    return [
      ...base,
      'Flatlay layout: top-down camera, all set pieces visible, straps and waistband aligned, shorts squared cleanly, print facing camera, props placed outside the garment silhouette.',
    ].join(' ');
  }
  return [
    ...base,
    'Hanger layout: front-facing hanger or clean hanging setup, natural drape without sagging distortion, all set pieces visible when the product is a set, hanger and wall must not distract from the garment.',
  ].join(' ');
}

function buildGarmentSetDriftNegativeLock(): string {
  return 'garmentSetDriftNegativeLock: when references show a camisole top and shorts or any top-and-bottom set, no long sleeves, no long pants, no dress, no romper, no skirt, no one-piece conversion, and no missing top or missing bottom.';
}

function buildModelAppearanceLock(presetContext: ReturnType<typeof resolvePresetContext>): string {
  const faceQualityLine = buildModelFaceQualityLock(presetContext);
  if (presetContext.modelLookPreset.id !== 'auto') {
    return `modelAppearanceLock: ${presetContext.modelLook}; ${presetContext.modelLookPreset.prompt}; ${faceQualityLine}`;
  }
  const audienceText = `${presetContext.audience} ${presetContext.audiencePreset.prompt}`.toLowerCase();
  if (/kid|child|children|童装|young/.test(audienceText)) {
    return `modelAppearanceLock: generic child model around 5-7 years old, soft round face, bright eyes, natural smile, warm brown shoulder-length hair, healthy natural skin tone, age-appropriate expression and posture; keep this appearance stable for downstream model shots. ${faceQualityLine}`;
  }
  if (/teen|青少年/.test(audienceText)) {
    return `modelAppearanceLock: generic teen model, natural youthful face, clear eyes, relaxed smile, clean hair styling, age-appropriate posture; keep this appearance stable for downstream model shots. ${faceQualityLine}`;
  }
  return `modelAppearanceLock: generic fashion model, clear face structure, natural expression, clean hair styling, realistic body proportions, product-led posture; keep this appearance stable for downstream model shots. ${faceQualityLine}`;
}

function buildPoseLock(presetContext: ReturnType<typeof resolvePresetContext>): string {
  const childPoseGuard = isKidswearPresetContext(presetContext)
    ? ' For kidswear, avoid hand-on-hip fashion posing, no hand-on-hip, no pageant stance, no pageant pose, no stiff catalog posture; choose a relaxed garment-led pose with arms natural, hands not covering the print, and body proportion kept childlike.'
    : '';
  return `poseLock: ${presetContext.poseStyle}; ${presetContext.posePreset.prompt}; keep the selected pose family consistent with garment use, audience safety, and product readability.${childPoseGuard}`;
}

function buildCameraLookLock(presetContext: ReturnType<typeof resolvePresetContext>): string {
  return `cameraLookLock: ${presetContext.cameraStyle}; ${presetContext.cameraPreset.prompt}; keep the camera medium, perspective, and realism family stable across derived shots unless a shot explicitly changes crop.`;
}

function buildRealismStyleLock(presetContext: ReturnType<typeof resolvePresetContext>): string {
  return `realismStyleLock: ${presetContext.realismStyle}; ${presetContext.realismPreset.prompt}; make the scene believable and garment-led rather than a fixed generic style.`;
}

function buildSuiteReferenceAdaptationLock(): string {
  return 'suiteReferenceAdaptationLock: use existing model reference as the pose, body-proportion, composition, and scene-energy anchor; replace the outfit with the referenced garment set while preserving garmentTruthLock; adapt props and background to the garment use, print motif, and sales channel. If an existing flatlay or style reference is supplied, use existing flatlay reference layout as the product-layout anchor; replace its garment with the referenced garment set and adapt props to the current theme motif.';
}

function buildApparelPackQualityGate(role: string): ApparelPackQualityGate {
  const roleText = role.toLowerCase();
  if (/flatlay|hanger/.test(roleText)) {
    return {
      kind: 'product-anchor',
      role,
      mustPass: [
        'completeSetDisplay',
        'contrastBackground',
        'edgeMargin',
        'wrinkleControl',
        'productHeroFocalPoint',
      ],
      failIf: [
        'tone-on-tone background or same-color props make the garment outline weak',
        'dominant white rug, cream background, white fur rug, high-key white, or white wall washes out a light pink garment',
        'garment pieces touch image edge, crop is too tight, or the complete outline is missing',
        'obvious wrinkles remain instead of only natural fabric wrinkles',
        'top or bottom is missing when references show a matching set',
      ],
      retryPatchTemplate: {
        keep: [
          'exact garment silhouette, colorway, print placement, trims, and complete set pieces',
          'successful camera angle and product-only role',
        ],
        strengthen: [
          'cool pastel contrast surface or wall separated from the garment color',
          'slightly zoomed-out crop with complete margins and visible hierarchy',
          'pressed/steamed fabric with only natural fabric wrinkles',
        ],
        remove: [
          'tone-on-tone background',
          'dominant white rug or cream/high-key white setup',
          'edge-touching crop and obvious wrinkles',
        ],
        finalPromptPatch: 'Use a cool pastel contrast background, keep the full garment set at about 72-78% frame height with 8-12% negative space and a continuous border on all sides, keep props outside the garment silhouette, remove obvious wrinkles and leave only natural fabric wrinkles.',
      },
    };
  }
  if (/model-front/.test(roleText)) {
    return {
      kind: 'model-anchor',
      role,
      mustPass: [
        'garmentSetComplete',
        'modelFaceQuality',
        'garmentLedPose',
        'backgroundMotifMatchesGarment',
        'commercialCropReadable',
      ],
      failIf: [
        'missing top or bottom in a matching set',
        'butt chin, cleft chin, protruding chin, chin dimple, vertical chin crease, lower-face crease, adultized face, or wrong child body proportion',
        'hand-on-hip, pageant stance, stiff catalog pose, or pose hiding the garment print and silhouette',
        'background ignores visible garment motif such as Peppa Pig, rainbow, cartoon pig, or sleepwear bedroom context',
        'garment drifts into long sleeves, long pants, dress, romper, skirt, only top, or only shorts when references show a camisole-and-shorts set',
      ],
      retryPatchTemplate: {
        keep: [
          'complete referenced garment set, exact colorway, print placement, and fabric behavior',
          'successful camera family, lighting family, and scene family',
        ],
        strengthen: [
          'normal child chin, soft jawline, bright eyes, natural small smile, and child-safe proportions',
          'garment-led relaxed pose selected from the clothing use',
          'background props that echo the garment motif without covering the product',
        ],
        remove: [
          'butt chin, cleft chin, protruding chin, lower-face crease, adultized face',
          'hand-on-hip or pageant pose',
          'garment category drift or missing set piece',
        ],
        finalPromptPatch: 'Keep the exact complete outfit set, use a cute realistic child face with normal child chin and soft jawline, choose a garment-led relaxed pose with hands not covering the print, and echo the garment motif in the background without overpowering the clothing.',
      },
    };
  }
  if (/detail|macro|label|color/.test(roleText)) {
    return {
      kind: 'detail-shot',
      role,
      mustPass: ['anchorConsistency', 'materialTruth', 'detailReadable', 'noFakeText'],
      failIf: [
        'material, print scale, trims, seams, or colorway drift from product anchors',
        'detail is blurry, warped, over-smoothed, or not useful for ecommerce inspection',
        'fake readable label text or invented logo appears',
      ],
      retryPatchTemplate: {
        keep: ['same garment anchor facts and successful lighting family'],
        strengthen: ['macro clarity, fabric texture, stitching, print edge, and material weight'],
        remove: ['fake text, warped trim, material drift, and unreadable texture'],
        finalPromptPatch: 'Use the established product anchors only as material truth, show a crisp ecommerce close-up of fabric, seam, trim, or print edge, avoid fake readable text, and do not change colorway or construction.',
      },
    };
  }
  if (/derived|model-back|model-half|model-side|model-lifestyle/.test(roleText)) {
    return {
      kind: 'derived-shot',
      role,
      mustPass: ['anchorConsistency', 'allowedChangeOnly', 'modelConsistency', 'garmentSetComplete'],
      failIf: [
        'derived shot changes garment silhouette, colorway, print placement, model identity, lighting family, or background family',
        'back/side/crop/lifestyle request changes more than the declared variable',
        'set piece disappears or garment category drifts',
      ],
      retryPatchTemplate: {
        keep: ['front anchor garment facts, model identity, lighting family, and successful background family'],
        strengthen: ['only the declared viewpoint, crop, detail, pose energy, or context variable'],
        remove: ['identity drift, garment redesign, color shift, and unrequested scene change'],
        finalPromptPatch: 'Use the approved anchor as the immutable source; change only the declared shot variable and keep garment silhouette, colorway, print placement, model identity, lighting family, and channel fit unchanged.',
      },
    };
  }
  return {
    kind: 'generic-shot',
    role,
    mustPass: ['garmentFidelity', 'compositionReadable', 'channelFit'],
    failIf: ['garment redesign, unreadable crop, fake text, or unsupported construction appears'],
    retryPatchTemplate: {
      keep: ['successful garment facts and channel fit'],
      strengthen: ['failed quality dimension only'],
      remove: ['unsupported garment detail, fake text, or unreadable composition'],
      finalPromptPatch: 'Preserve successful variables and strengthen only the failed quality dimension without inventing new garment details.',
    },
  };
}

function formatQualityGatePrompt(gate: ApparelPackQualityGate): string {
  return [
    `Quality gate (${gate.kind}): must pass ${gate.mustPass.join(', ')}.`,
    `Fail if: ${gate.failIf.join('; ')}.`,
    `Focused retry patch template: keep ${gate.retryPatchTemplate.keep.join(', ')}; strengthen ${gate.retryPatchTemplate.strengthen.join(', ')}; remove ${gate.retryPatchTemplate.remove.join(', ')}; finalPromptPatch: ${gate.retryPatchTemplate.finalPromptPatch}`,
  ].join('\n');
}

function formatQualityGatePromptZh(gate: ApparelPackQualityGate): string {
  return [
    `质量门槛（${gate.kind}）：必须通过 ${gate.mustPass.join('、')}。`,
    `失败条件：${gate.failIf.join('；')}。`,
    `重试补丁模板：保留 ${gate.retryPatchTemplate.keep.join('、')}；加强 ${gate.retryPatchTemplate.strengthen.join('、')}；移除 ${gate.retryPatchTemplate.remove.join('、')}；最终补丁：${gate.retryPatchTemplate.finalPromptPatch}`,
  ].join('\n');
}

function appendQualityGatePrompt(prompt: string, gate: ApparelPackQualityGate): string {
  return [prompt, formatQualityGatePrompt(gate)].filter(Boolean).join('\n');
}

function appendQualityGatePromptZh(prompt: string, gate: ApparelPackQualityGate): string {
  return [prompt, formatQualityGatePromptZh(gate)].filter(Boolean).join('\n');
}

function edge(source: string, target: string, portType = 'any'): ApparelPackPlanEdge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    data: { portType },
  };
}

function buildPromptAgentSpec(params: {
  mode: ApparelPackMode;
  role: string;
  scene: string;
  referencePolicy: string;
  garmentTruth: string;
  modelPolicy: string;
  composition: string;
  lighting: string;
  background: string;
  negatives: string;
  extra?: string[];
  ratio?: string;
  size?: string;
}): ApparelPromptAgentSpec {
  const rolePolicy = promptRolePolicy(params.role);
  const referenceImageMap = referenceImageMapPolicy(params.role);
  const finalReferenceImageMap = finalReferenceImageMapPolicy(params.role);
  const finalExtra = finalPromptExtraLines(params.extra || []);
  const roleLabel = promptStepLabel(params.role, params.role);
  const systemPrompt = [
    'You are the internal prompt agent for an apparel ecommerce canvas workflow.',
    'Write compact, executable image prompts for product-faithful apparel generation.',
    'Prompt skeleton: output role, garment truth, complete set truth, themeMotifLock, reference constraints by image index, modelAppearanceLock, modelFaceQualityLock, poseLock, cameraLookLock, realismStyleLock, productDisplayLayoutLock, composition/camera, lighting/material, background/channel fit, negative constraints.',
    `Reference hierarchy: ${PROMPT_REFERENCE_HIERARCHY}; never let style references override garmentTruthLock.`,
    referenceImageMap,
    'Allowed-change boundary: anchor shots finalize immutable facts; derived shots may change only the declared viewpoint, crop, detail, pose energy, or context variable.',
    'Output contract: produce inspectable systemPrompt, userPrompt, and one executable finalPrompt for gpt-image-2; write direct visual instructions, no markdown, keep negative constraints at the end.',
    'Keep garment, theme motif, model appearance, model face quality, product-display layout, camera family, and background family consistency explicit. Do not invent logos, prints, labels, celebrity likeness, or unsupported construction.',
  ].join('\n');
  const systemPromptZh = [
    '你是服装电商画布工作流里的内部提示词 agent。',
    '目标是把中文/业务意图转成 gpt-image-2 能执行、能检查的英文生图提示词。',
    '结构必须包含：输出角色、服装真值、套装完整性、主题图案、参考图索引、模特外观锁、脸型质量锁、动作锁、镜头锁、真实感锁、商品展示/排版锁、构图/镜头、光线/材质、背景/平台适配、负面约束。',
    '首图负责定稿不可变事实；后续派生图只改变声明的视角、裁切、细节、动作能量或场景变量。',
    '不得凭空添加品牌、印花、标签文字、名人脸或参考图没有的服装结构。',
  ].join('\n');
  const userPrompt = [
    `Mode: ${params.mode}`,
    `Shot role: ${params.role}`,
    `Shot label: ${roleLabel}`,
    `Lineage role: ${params.role}`,
    `Prompt phase: ${rolePolicy.phase}`,
    `Scene: ${params.scene}`,
    `Reference hierarchy: ${PROMPT_REFERENCE_HIERARCHY}`,
    referenceImageMap,
    `Reference policy: ${params.referencePolicy}`,
    `${rolePolicy.phase}: ${rolePolicy.contract}`,
    `Allowed change: ${rolePolicy.allowedChange}`,
    `Lock contract: garmentTruthLock, garmentSetLock, themeMotifLock, modelIdentityLock, modelAppearanceLock, modelFaceQualityLock, poseLock, cameraLookLock, realismStyleLock, productDisplayLayoutLock, lightingLock, backgroundFamilyLock. ${PROMPT_CONSISTENCY_LOCK}.`,
    `Garment truth: ${params.garmentTruth}`,
    `Model/product policy: ${params.modelPolicy}`,
    `Composition and camera: ${params.composition}`,
    `Lighting and material: ${params.lighting}`,
    `Background/channel fit: ${params.background}`,
    `Negative constraints: ${params.negatives}`,
    `Canvas params: aspect ratio ${params.ratio || DEFAULT_RATIO}, size ${params.size || DEFAULT_SIZE}`,
    ...(params.extra || []),
  ].join('\n');
  const userPromptZh = [
    `模式：${params.mode}`,
    `镜头角色：${roleLabel}（${params.role}）`,
    `流程阶段：${rolePolicy.phase}`,
    `场景：${params.scene}`,
    `参考图规则：按 Image 1 / Image 2 / Image 3 等索引理解参考图，服装真值优先于风格参考。`,
    `允许改变：${rolePolicy.allowedChange}`,
    `服装真值：${params.garmentTruth}`,
    `模特/商品策略：${params.modelPolicy}`,
    `构图与镜头：${params.composition}`,
    `光线与面料：${params.lighting}`,
    `背景与平台适配：${params.background}`,
    `负面约束：${params.negatives}`,
    `画布参数：比例 ${params.ratio || DEFAULT_RATIO}，尺寸 ${params.size || DEFAULT_SIZE}`,
    ...(params.extra || []),
  ].join('\n');
  const finalPrompt = [
    `Shot: ${roleLabel} (${params.role}); ${rolePolicy.phase}.`,
    `Output: ${params.scene}.`,
    `References: ${finalReferenceImageMap} Reference policy: ${params.referencePolicy}.`,
    `Garment truth: ${params.garmentTruth}.`,
    `Model/product: ${params.modelPolicy}.`,
    `Pose and camera: ${params.composition}.`,
    `Lighting/material: ${params.lighting}.`,
    `Background/channel: ${params.background}.`,
    ...finalExtra.map((item) => `${item}.`),
    `Consistency: ${PROMPT_CONSISTENCY_LOCK}. Allowed change: ${rolePolicy.allowedChange}.`,
    `Negative constraints: ${params.negatives}.`,
  ].join('\n');
  const finalPromptZh = [
    `镜头角色：${roleLabel}。`,
    `提示词阶段：${rolePolicy.phase}。`,
    `服装真值锁：${params.garmentTruth}。`,
    `参考图层级：${PROMPT_REFERENCE_HIERARCHY}。`,
    `允许改变：${rolePolicy.allowedChange}。`,
    `模特/商品策略：${params.modelPolicy}。`,
    `构图与镜头：${params.composition}。`,
    `光线与面料：${params.lighting}。`,
    `背景与平台适配：${params.background}。`,
    ...finalExtra.map((item) => `${item}。`),
    `负面约束：${params.negatives}。`,
  ].join(' ');
  return { systemPrompt, systemPromptZh, userPrompt, userPromptZh, finalPrompt, finalPromptZh };
}

function baseImageData(params: {
  prompt: string | ApparelPromptAgentSpec;
  refs: string[];
  sourceNodeIds: string[];
  sourceUrls?: string[];
  role: string;
  promptKey?: string;
  promptOverrides?: ApparelPackPromptOverrides;
  skillProfile?: ApparelPackSkillProfile;
  anchorPolicy: Record<string, string>;
  model?: string;
  apiModel?: string;
  imageQuality?: ApparelPackImageQuality;
  imageSubmitMode?: ApparelPackImageSubmitMode;
  ratio?: string;
  size?: string;
}) {
  const size = params.size || DEFAULT_SIZE;
  const promptKey = params.promptKey || params.role;
  const resolvedPrompt = typeof params.prompt === 'string'
    ? undefined
    : applyPromptOverride(
      params.prompt,
      promptOverrideFor(params.promptOverrides, [promptKey, params.role]),
    );
  const promptAgent = resolvedPrompt ? {
    name: PROMPT_AGENT_NAME,
    systemPrompt: resolvedPrompt.systemPrompt,
    systemPromptZh: resolvedPrompt.systemPromptZh,
    userPrompt: resolvedPrompt.userPrompt,
    userPromptZh: resolvedPrompt.userPromptZh,
  } : undefined;
  const qualityGate = buildApparelPackQualityGate(params.role);
  const promptBase = typeof params.prompt === 'string' ? params.prompt : resolvedPrompt!.finalPrompt;
  const skillProfileLine = profileSkillLine(params.skillProfile);
  const prompt = appendQualityGatePrompt([promptBase, skillProfileLine].filter(Boolean).join('\n'), qualityGate);
  const promptZhBase = typeof params.prompt === 'string' ? '' : resolvedPrompt!.finalPromptZh;
  const promptZh = promptZhBase ? appendQualityGatePromptZh(promptZhBase, qualityGate) : '';
  return {
    model: params.model || DEFAULT_MODEL,
    apiModel: params.apiModel || DEFAULT_API_MODEL,
    aspectRatio: params.ratio || DEFAULT_RATIO,
    size,
    sizeLevel: size,
    imageQuality: params.imageQuality || DEFAULT_IMAGE_QUALITY,
    imageSubmitMode: params.imageSubmitMode || DEFAULT_IMAGE_SUBMIT_MODE,
    status: 'idle',
    prompt,
    ...(promptZh ? { promptZh } : {}),
    ...(promptAgent ? { promptAgent: { ...promptAgent, qualityGate } } : {}),
    ...(resolvedPrompt ? {
      defaultPromptAgent: {
        systemPrompt: resolvedPrompt.defaultSystemPrompt,
        systemPromptZh: resolvedPrompt.defaultSystemPromptZh,
        userPrompt: resolvedPrompt.defaultUserPrompt,
        userPromptZh: resolvedPrompt.defaultUserPromptZh,
      },
      defaultPrompt: appendQualityGatePrompt(resolvedPrompt.defaultFinalPrompt, qualityGate),
      defaultPromptZh: appendQualityGatePromptZh(resolvedPrompt.defaultFinalPromptZh, qualityGate),
      promptOverridden: resolvedPrompt.promptOverridden === true,
    } : {}),
    promptKey,
    referenceImages: unique(params.refs),
    sourceUrls: unique(params.sourceUrls || params.refs),
    sourceNodeIds: unique(params.sourceNodeIds),
    lineageRole: params.role,
    anchorPolicy: params.anchorPolicy,
    apparelPackQualityGate: qualityGate,
    ...(params.skillProfile ? {
      skillProfileId: params.skillProfile.id,
      skillProfileVersion: params.skillProfile.version,
      skillProfileTitle: params.skillProfile.title,
      skillProfileTrace: params.skillProfile.trace,
      skillProfileSummary: params.skillProfile.readableSummary,
      skillProfileSourceSkills: params.skillProfile.sourceSkills.map((skill) => skill.name),
    } : {}),
    uiVariant: 'smart-card',
  };
}

function makeImageNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  data: Record<string, any>,
): ApparelPackPlanNode {
  return {
    id,
    type: 'image',
    position: { x: base.x + col * 430, y: base.y + row * 560 },
    data,
  };
}

function makeTextNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  text: string,
): ApparelPackPlanNode {
  return {
    id,
    type: 'text',
    position: { x: base.x + col * 430, y: base.y + row * 260 },
    data: { text, prompt: text, outputText: text },
  };
}

function makeLlmNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  data: Record<string, any>,
): ApparelPackPlanNode {
  return {
    id,
    type: 'llm',
    position: { x: base.x + col * 430, y: base.y + row * 320 },
    data: {
      model: DEFAULT_LLM_MODEL,
      apiModel: DEFAULT_LLM_API_MODEL,
      ...data,
    },
  };
}

function makePromptAgentNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  text: string,
  promptOverrides?: ApparelPackPromptOverrides,
  llmModelSettings?: ReturnType<typeof resolveLlmModelSettings>,
): ApparelPackPlanNode {
  const defaultSystemPrompt = [
    'You are the internal prompt agent and prompt engineer for apparel package generation.',
    'Return JSON-like prompt planning sections that are short enough to inspect and strict enough to execute.',
    'Required keys: garmentTruthLock, garmentSetLock, themeMotifLock, modelIdentityLock, modelAppearanceLock, modelFaceQualityLock, poseLock, cameraLookLock, realismStyleLock, productDisplayLayoutLock, sceneRouting, anchorShotBriefs, derivedShotRules, negativePrompt, retryHints.',
    'For suite and garment-reference modes, the first anchorShotBriefs must cover front model, flat lay front, hanger front.',
    'If four clean product refs are present, infer top-front, bottom-front, top-back, bottom-back and preserve the complete outfit set.',
    `Reference hierarchy: ${PROMPT_REFERENCE_HIERARCHY}.`,
    'Never let style, props, or channel taste override garmentTruthLock.',
  ].join(' ');
  const defaultSystemPromptZh = [
    '你是服装封包生成的内部提示词工程 agent。',
    '请返回短、可检查、能执行的 JSON-like 规划段落。',
    '必须包含：服装真值锁、套装完整性、主题图案锁、模特身份/外观锁、脸型质量锁、动作锁、镜头锁、真实感锁、商品展示排版锁、场景路由、首图锚点、派生图规则、负面约束和重试建议。',
    '套图模式和服装参考模式的首批锚点必须覆盖：正面模特、正面平铺、正面挂拍。',
    '如果有四张清晰商品参考图，按上衣正面、下装正面、上衣背面、下装背面建立套装锁。',
    '服装真值永远高于风格、道具和平台口味。',
  ].join('\n');
  const defaultUserPrompt = [
    text,
    '',
    'Return these sections:',
    'garmentTruthLock: exact garment type, silhouette, colorway, fabric, construction, trims, print placement, and details that must not drift',
    'garmentSetLock: list every garment piece; for sets, require complete outfit wearing/display, top and bottom together, front/back consistency',
    'themeMotifLock: identify the garment print/IP/story motif such as Peppa Pig, cartoon pig, rainbow, unicorn, flower or slogan; echo it in background props only when visible in references or named by the user',
    'sceneRouting: choose bedroom/home scene for sleepwear, park/playground/outdoor scene for activewear or outerwear, and light product surface for flat lay/detail',
    'modelIdentityLock: model identity policy, body proportion, pose language, face policy, and reuse rules',
    'modelAppearanceLock: stable generic model appearance for the first anchor, including age range, face shape, eyes, hair, expression and child-safe styling when relevant',
    'modelFaceQualityLock: explicitly avoid cleft chin, butt chin, protruding chin, adultized face, adult body proportion, distorted hands and over-retouched skin; keep normal child chin and age-appropriate proportions for kidswear',
    'poseLock: pose family chosen from garment use, fabric behavior, selling point, audience safety, and reference model pose when provided',
    'cameraLookLock: camera/device look such as iPhone, CCD, DSLR, or studio camera, including perspective and realism family',
    'realismStyleLock: daily-life, clean commerce, UGC, or lookbook realism level, with props and background matched to garment use',
    'productDisplayLayoutLock: for flatlay and hanger shots, require background contrast, no tone-on-tone washout, a clear product hero focal point, complete margins, no crop, remove obvious wrinkles, only natural fabric wrinkles, and props outside the garment silhouette; for light pink garments, avoid dominant white rug, cream background, white fur rug, high-key white, and dominant white wall',
    'anchorShotBriefs: front model, flat lay front, hanger front; each anchor must define immutable product/model/product-display facts',
    'derivedShotRules: for back view, half-body, side/action, lifestyle, flat lay/detail/macro/color shots, change only the declared shot variable',
    'negativePrompt: no redesign, no logo/text invention, no changed print, no anatomy errors, no fake label text, no identity drift',
    'retryHints: if output fails, strengthen only the failed dimension and keep successful variables unchanged',
    '',
    'For every downstream image node, return:',
    'systemPrompt: role and constraints for the image model',
    'userPrompt: shot role, references, anchors, scene, camera, lighting, background, reference hierarchy, allowed-change boundary',
    'finalPrompt: compact executable gpt-image-2 prompt with negative constraints at the end',
  ].join('\n');
  const defaultUserPromptZh = [
    text,
    '',
    '请返回以下中文可读、英文可执行的规划段落：',
    '服装真值锁：服装类型、廓形、配色、面料、结构、辅料、印花位置和不能漂移的细节。',
    '套装完整性：列出每一件单品；套装必须上衣和下装一起穿着/展示，正背面一致。',
    '主题图案锁：识别 Peppa Pig、卡通猪、彩虹、独角兽、花朵、标语等服装图案；只有参考图或用户说明中出现时才把它呼应到背景道具。',
    '场景路由：睡衣/家居走卧室或居家，运动休闲走公园/操场/动作棚拍，外套走干净户外，平铺/细节走浅色商品台面。',
    '模特外观锁：首图确定稳定泛化模特，包括年龄段、脸型、眼睛、头发、表情和童装安全造型。',
    '脸型质量锁：童装必须正常儿童下巴和年龄合适比例，避免屁股下巴/裂下巴/突出下巴、成人化脸、成人身材比例、手部变形和过度磨皮。',
    '动作锁：从服装用途、面料行为、卖点和安全性选择动作，不能固定死动作。',
    '镜头锁：iPhone、CCD、单反或棚拍相机质感及透视。',
    '真实感锁：日常、干净电商、UGC 或画册真实感，背景道具匹配服装用途。',
    '商品展示排版锁：平铺/挂拍必须背景和服装有对比，不能同色糊成一片；要有商品视觉焦点、完整边距、不裁切；去明显褶皱，只保留自然褶皱；道具不遮挡服装。',
    '锚点图：正面模特、正面平铺、正面挂拍；每个锚点定义不可变商品/模特/展示事实。',
    '派生图规则：背面、半身、侧身/动作、场景、平铺/细节/微距/颜色图只改变声明变量。',
    '负面约束：不重设计、不新造 logo/文字、不改印花、不人体错误、不假标签、不身份漂移。',
    '重试建议：只加强失败维度，保留成功变量。',
  ].join('\n');
  const resolved = applyPromptOverride(
    {
      systemPrompt: defaultSystemPrompt,
      systemPromptZh: defaultSystemPromptZh,
      userPrompt: defaultUserPrompt,
      userPromptZh: defaultUserPromptZh,
      finalPrompt: defaultUserPrompt,
      finalPromptZh: defaultUserPromptZh,
    },
    promptOverrideFor(promptOverrides, ['brief', id]),
  );
  return makeLlmNode(id, row, col, base, {
    ...llmModelSettings,
    agentRole: PROMPT_AGENT_NAME,
    promptKey: 'brief',
    systemPrompt: resolved.systemPrompt,
    systemPromptZh: resolved.systemPromptZh,
    prompt: resolved.userPrompt,
    promptZh: resolved.userPromptZh,
    text,
    outputText: resolved.userPrompt,
    defaultSystemPrompt: resolved.defaultSystemPrompt,
    defaultSystemPromptZh: resolved.defaultSystemPromptZh,
    defaultPrompt: resolved.defaultUserPrompt,
    defaultPromptZh: resolved.defaultUserPromptZh,
    promptOverridden: resolved.promptOverridden === true,
    status: 'idle',
  });
}

function makeQualityQaNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  params: {
    mode: ApparelPackMode;
    imageIds: string[];
    references: string[];
    presetContext: ReturnType<typeof resolvePresetContext>;
    threshold?: string;
    customPrompt?: string;
    promptOverrides?: ApparelPackPromptOverrides;
    llmModelSettings?: ReturnType<typeof resolveLlmModelSettings>;
    skillProfile?: ApparelPackSkillProfile;
    anchorOnly?: boolean;
  },
): ApparelPackPlanNode {
  const thresholdPreset = presetFrom(APPAREL_PACK_PRESETS.qualityThresholds, params.threshold, 'normal');
  const promptKey = params.anchorOnly ? 'anchor-quality-qa' : 'quality-qa';
  const scopeTitle = params.anchorOnly ? '服装封包首图锚点质量门槛' : '服装封包质量测试与提示词调优';
  const scopeInstruction = params.anchorOnly
    ? 'Anchor gate QA: inspect only the first anchor shots: front model, front flatlay, and front hanger. If any anchor fails, stop derived shots and return focused retryPromptPatch blocks before continuing.'
    : 'Full package QA: inspect all generated package images after the anchor gate and derived shots.';
  const text = [
    scopeTitle,
    `Mode: ${params.mode}`,
    `Generated image node ids: ${params.imageIds.join(', ')}`,
    `Reference images: ${params.references.join(', ') || 'none'}`,
    `Pass threshold: ${thresholdPreset.value}`,
    `Threshold prompt: ${thresholdPreset.prompt}`,
    `Preset prompt context: ${params.presetContext.promptText}`,
    ...skillProfilePromptLines(params.skillProfile),
    params.customPrompt ? `User QA focus: ${params.customPrompt}` : '',
    '',
    scopeInstruction,
    'Read every generated result URL, node prompt, promptAgent metadata, referenceImages, sourceNodeIds and lineageRole before judging.',
    'Read each image node apparelPackQualityGate metadata. If a front model, flatlay, or hanger anchor quality gate fails, stop derived shots and do not continue to derived shots until a focused retry patch passes.',
    'Score each image from 1-10 for: garment fidelity, model consistency, anatomy/pose, composition/crop, technical artifacts, text/logo risk, and channel fit.',
    'Fail product-only flatlay/hanger shots if flatlay background too close to garment color, background contrast is weak, dominant white rug, cream background, white fur rug, high-key white, or dominant white wall makes the garment outline weak, there is no visual focal point, props cover the garment, complete margins are missing, garment pieces touch image edges, output is cropped, or obvious wrinkles remain instead of only natural fabric wrinkles.',
    'Fail model shots for chin artifact, cleft chin, butt chin, chin dimple, vertical chin crease, lower-face crease, protruding chin, adultized face, wrong child body proportion, hand-on-hip pose, pageant stance, stiff pose unrelated to garment use, garment hidden by pose, or top/bottom set pieces drifting into another garment category.',
    'Return JSON-like sections: overallDecision, perImageScores, failedDimensions, evidence, retryPromptPatch.',
    'retryPromptPatch fields: targetNodeId, keep, strengthen, remove, finalPromptPatch.',
    'Prompt patch rules: do not rewrite successful variables; preserve successful variables, only strengthen failed dimensions, keep gpt-image-2 compatible, do not add unsupported garment details.',
  ].filter(Boolean).join('\n');
  const textZh = [
    scopeTitle,
    `模式：${params.mode}`,
    `生成图片节点：${params.imageIds.join(', ')}`,
    `参考图片：${params.references.join(', ') || '无'}`,
    `通过标准：${thresholdPreset.value}`,
    `标准中文：${thresholdPreset.promptZh}`,
    `预设上下文：${params.presetContext.promptTextZh}`,
    params.customPrompt ? `用户重点：${params.customPrompt}` : '',
    '',
    params.anchorOnly
      ? '首图验收/锚点门槛：只检查正面模特、正面平铺、正面挂拍。任何锚点不通过时，先停止派生图，输出聚焦 retryPromptPatch 后再继续。'
      : '完整封包质检：在锚点和派生图生成后检查全部图片。',
    '评分前必须读取每张生成图结果、节点提示词、promptAgent 元数据、参考图、来源节点和 lineageRole。',
    '必须读取每个图片节点的 apparelPackQualityGate 元数据。正面模特、平铺或挂拍锚点没有通过时，先停止派生图，不继续生成背面/细节/场景图，直到聚焦重试补丁通过。',
    '逐图按 1-10 分评估：服装保真、模特一致、人体/动作、构图/裁切、技术瑕疵、文字/logo 风险和平台适配。',
    '平铺/挂拍如果背景和服装颜色太接近、背景对比弱、白色地毯/奶油色背景/白色绒毯/高调白/白墙让服装边界不清、没有商品视觉焦点、道具遮挡、边距不完整、服装贴到画面边缘、裁切或明显褶皱未去掉，只保留自然褶皱失败，就判失败。',
    '模特图如果有下巴伪影、屁股下巴/裂下巴/下巴凹点/下巴竖线/突出下巴、成人化脸、儿童身体比例错误、手叉腰、选美式站姿、动作僵硬且不符合服装用途、动作遮挡服装或套装漂移成其他品类，就判失败。',
    '返回 JSON-like 段落：overallDecision、perImageScores、failedDimensions、evidence、retryPromptPatch。',
    'retryPromptPatch 包含：targetNodeId、keep、strengthen、remove、finalPromptPatch。',
    '补丁规则：不重写成功变量，只加强失败维度，保持 gpt-image-2 可执行，不添加参考图没有的服装细节。',
  ].filter(Boolean).join('\n');
  const defaultSystemPrompt = [
    'You are the quality QA and prompt tuning agent for apparel ecommerce image generation.',
    params.anchorOnly ? 'This is an anchor gate check before derived shots, not a final batch review.' : 'This is a final package quality review after derived shots.',
    'Be evidence-based. Inspect outputs, references, prompts, lineage and model params before scoring.',
    'Use apparelPackQualityGate metadata as the pass/fail contract for each image node, and stop derived-shot continuation when an anchor fails.',
    'Separate product fidelity, model consistency, anatomy, composition, artifacts, text risk and channel fit.',
    'Do not regenerate. Produce focused retryPromptPatch blocks and retry recommendations.',
    'retryPromptPatch must include keep, strengthen, remove, and finalPromptPatch fields, and must not rewrite successful variables.',
  ].join(' ');
  const defaultSystemPromptZh = [
    '你是服装电商图片生成的质量质检和提示词调优 agent。',
    params.anchorOnly ? '这是派生图之前的首图/锚点验收，不是最终整批复核。' : '这是派生图之后的最终封包复核。',
    '必须基于证据评分，先检查输出图、参考图、提示词、lineage 和模型参数。',
    '把 apparelPackQualityGate 元数据作为每个图片节点的通过/失败契约；锚点没过就先停止派生图。',
    '分开评估商品保真、模特一致、人体、构图、瑕疵、文字风险和平台适配。',
    '不要直接重生图，只输出聚焦的 retryPromptPatch 和重试建议。',
  ].join('\n');
  const resolved = applyPromptOverride(
    {
      systemPrompt: defaultSystemPrompt,
      systemPromptZh: defaultSystemPromptZh,
      userPrompt: text,
      userPromptZh: textZh,
      finalPrompt: text,
      finalPromptZh: textZh,
    },
    promptOverrideFor(params.promptOverrides, [promptKey, id, 'quality-qa']),
  );
  return makeLlmNode(id, row, col, base, {
    ...params.llmModelSettings,
    agentRole: QUALITY_AGENT_NAME,
    promptKey,
    systemPrompt: resolved.systemPrompt,
    systemPromptZh: resolved.systemPromptZh,
    prompt: resolved.userPrompt,
    promptZh: resolved.userPromptZh,
    text,
    outputText: resolved.userPrompt,
    defaultSystemPrompt: resolved.defaultSystemPrompt,
    defaultSystemPromptZh: resolved.defaultSystemPromptZh,
    defaultPrompt: resolved.defaultUserPrompt,
    defaultPromptZh: resolved.defaultUserPromptZh,
    promptOverridden: resolved.promptOverridden === true,
    status: 'idle',
    qaScope: 'apparel-pack-generated-images',
    passThreshold: thresholdPreset.value,
    inspectedNodeIds: params.imageIds,
    referenceImages: params.references,
    ...(params.skillProfile ? {
      skillProfileId: params.skillProfile.id,
      skillProfileVersion: params.skillProfile.version,
      skillProfileTitle: params.skillProfile.title,
      skillProfileTrace: params.skillProfile.trace,
      skillProfileSummary: params.skillProfile.readableSummary,
      skillProfileSourceSkills: params.skillProfile.sourceSkills.map((skill) => skill.name),
    } : {}),
    qualityGatePolicy: {
      inspectMetadata: true,
      stopDerivedShotsWhenAnchorFails: true,
      anchorOnly: params.anchorOnly === true,
      retryPatchTemplateFields: ['keep', 'strengthen', 'remove', 'finalPromptPatch'],
    },
  });
}

function clampShotCount(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return max;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function filterStages(stages: string[][], selectedIds: string[]): string[][] {
  const selected = new Set(selectedIds);
  return stages
    .map((stage) => stage.filter((id) => selected.has(id)))
    .filter((stage) => stage.length > 0);
}

function selectRunStagesForScope(
  input: ApparelPackPlanInput,
  fullStageOrder: string[][],
  anchorStageOrder: string[][],
): string[][] {
  if (!input.autoRun) return [];
  return input.runScope === 'anchors' ? anchorStageOrder : fullStageOrder;
}

function selectPlanImages(nodes: ApparelPackPlanNode[], selectedIds: string[]): ApparelPackPlanNode[] {
  const selected = new Set(selectedIds);
  const imageById = new Map(nodes.filter((node) => node.type === 'image').map((node) => [node.id, node]));
  const orderedImages = selectedIds
    .map((id) => imageById.get(id))
    .filter((node): node is ApparelPackPlanNode => Boolean(node));
  return [
    ...nodes.filter((node) => node.type !== 'image'),
    ...orderedImages.filter((node) => selected.has(node.id)),
  ];
}

function outputSceneLabel(key: string, fallback: string): string {
  const labels: Record<string, string> = {
    'flatlay-anchor': '平铺图',
    'hanger-product-anchor': '挂拍图',
  };
  return labels[key] || promptStepLabel(key, fallback);
}

function outputSceneFromImageNode(node: ApparelPackPlanNode, index: number): ApparelPackOutputScene {
  const data = node.data || {};
  const role = String(data.lineageRole || data.promptKey || node.id);
  const label = outputSceneLabel(String(data.promptKey || role), role);
  const prompt = String(data.prompt || data.defaultPrompt || '').replace(/\s+/g, ' ').trim();
  const description = [
    `${label}用于服装封包第 ${index + 1} 张图。`,
    role.includes('model')
      ? '保持同一模特、同一服装和电商可读构图。'
      : '保持同一服装款式、颜色、版型和材质细节。',
  ].join('');
  return {
    id: `${node.id}-scene`,
    index,
    label,
    role,
    sourceNodeId: node.id,
    description,
    promptSummary: prompt.slice(0, 220),
  };
}

function makeApparelPackOutputNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  params: {
    packId: string;
    mode: ApparelPackMode;
    title: string;
    imageNodes: ApparelPackPlanNode[];
    qaNodeId?: string;
  },
): ApparelPackPlanNode {
  const scenes = params.imageNodes.map(outputSceneFromImageNode);
  const imageNodeIds = params.imageNodes.map((node) => node.id);
  const manifest: ApparelPackOutputManifest = {
    packId: params.packId,
    mode: params.mode,
    title: params.title,
    imageNodeIds,
    qaNodeId: params.qaNodeId,
    scenes,
  };
  return {
    id,
    type: APPAREL_PACK_OUTPUT_NODE_TYPE,
    position: { x: base.x + col * 430, y: base.y + row * 560 },
    data: {
      label: '服装封包输出',
      status: 'idle',
      text: params.title,
      prompt: params.title,
      apparelPackOutput: manifest,
      imageUrls: [],
      imageNodeIds,
      uiVariant: 'smart-card',
    },
  };
}

function appendOutputNode(params: {
  packId: string;
  mode: ApparelPackMode;
  title: string;
  base: { x: number; y: number };
  nodes: ApparelPackPlanNode[];
  edges: ApparelPackPlanEdge[];
  selectedImageIds: string[];
  qaNodeId?: string;
  row?: number;
  col?: number;
}): { nodes: ApparelPackPlanNode[]; edges: ApparelPackPlanEdge[] } {
  const imageById = new Map(params.nodes.filter((node) => node.type === 'image').map((node) => [node.id, node]));
  const imageNodes = params.selectedImageIds
    .map((imageId) => imageById.get(imageId))
    .filter((node): node is ApparelPackPlanNode => Boolean(node));
  const outputId = `${params.packId}-output`;
  const outputNode = makeApparelPackOutputNode(
    outputId,
    params.row ?? 0,
    params.col ?? 4,
    params.base,
    {
      packId: params.packId,
      mode: params.mode,
      title: params.title,
      imageNodes,
      qaNodeId: params.qaNodeId,
    },
  );
  const outputEdges = [
    ...params.selectedImageIds.map((imageId) => edge(imageId, outputId, 'image')),
    ...(params.qaNodeId ? [edge(params.qaNodeId, outputId, 'text')] : []),
  ];
  return {
    nodes: [...params.nodes, outputNode],
    edges: [...params.edges, ...outputEdges],
  };
}

export function collectApparelPackPromptSteps(plan: ApparelPackPlan): ApparelPackPromptStep[] {
  const out: ApparelPackPromptStep[] = [];
  for (const node of plan.nodes) {
    if (node.type !== 'image' && node.type !== 'llm') continue;
    const data = node.data || {};
    const key = String(data.promptKey || data.lineageRole || node.id);
    const currentSystem = String(data.promptAgent?.systemPrompt || data.systemPrompt || '');
    const currentSystemZh = String(data.promptAgent?.systemPromptZh || data.systemPromptZh || '');
    const currentUser = String(data.promptAgent?.userPrompt || data.prompt || data.outputText || data.text || '');
    const currentUserZh = String(data.promptAgent?.userPromptZh || data.promptZh || '');
    const finalPrompt = String(data.prompt || data.outputText || data.text || currentUser);
    const finalPromptZh = String(data.promptZh || currentUserZh);
    const defaultSystem = String(data.defaultPromptAgent?.systemPrompt || data.defaultSystemPrompt || currentSystem);
    const defaultSystemZh = String(data.defaultPromptAgent?.systemPromptZh || data.defaultSystemPromptZh || currentSystemZh);
    const defaultUser = String(data.defaultPromptAgent?.userPrompt || data.defaultPrompt || currentUser);
    const defaultUserZh = String(data.defaultPromptAgent?.userPromptZh || data.defaultPromptZh || currentUserZh);
    const defaultFinal = String(data.defaultPrompt || finalPrompt);
    const defaultFinalZh = String(data.defaultPromptZh || finalPromptZh || defaultUserZh);
    const zhForDiff = defaultUserZh || currentUserZh || defaultFinalZh || finalPromptZh;
    const enForDiff = defaultUser || currentUser || defaultFinal || finalPrompt;
    out.push({
      key,
      nodeId: node.id,
      label: promptStepLabel(key, node.id),
      type: node.type,
      systemPrompt: currentSystem,
      systemPromptZh: currentSystemZh || defaultSystemZh,
      systemPromptEn: currentSystem,
      userPrompt: currentUser,
      userPromptZh: currentUserZh || defaultUserZh,
      userPromptEn: currentUser,
      finalPrompt,
      finalPromptZh: finalPromptZh || defaultFinalZh,
      finalPromptEn: finalPrompt,
      defaultSystemPrompt: defaultSystem,
      defaultSystemPromptZh: defaultSystemZh,
      defaultSystemPromptEn: defaultSystem,
      defaultUserPrompt: defaultUser,
      defaultUserPromptZh: defaultUserZh,
      defaultUserPromptEn: defaultUser,
      defaultFinalPrompt: defaultFinal,
      defaultFinalPromptZh: defaultFinalZh,
      defaultFinalPromptEn: defaultFinal,
      translationDiff: buildTranslationDiff(zhForDiff, enForDiff),
    });
  }
  return out;
}

function buildSuitePlan(input: ApparelPackPlanInput, packId: string, base: { x: number; y: number }): ApparelPackPlan {
  const cfg = { ...DEFAULT_APPAREL_PACK_CONFIG.suite, ...input.suite };
  const qualityCfg = { ...DEFAULT_APPAREL_PACK_CONFIG.qualityQa, ...input.qualityQa };
  const presetContext = resolvePresetContext({
    garmentPresetId: cfg.garmentPresetId,
    audiencePresetId: cfg.audiencePresetId,
    channelPresetId: cfg.channelPresetId,
    useCasePresetId: cfg.useCasePresetId,
    modelLookPresetId: cfg.modelLookPresetId,
    posePresetId: cfg.posePresetId,
    cameraPresetId: cfg.cameraPresetId,
    realismPresetId: cfg.realismPresetId,
    customGarmentType: cfg.customGarmentType,
    customAudience: cfg.customAudience,
    customChannel: cfg.customChannel,
    customUseCase: cfg.customUseCase,
    customModelLook: cfg.customModelLook,
    customPose: cfg.customPose,
    customCamera: cfg.customCamera,
    customRealism: cfg.customRealism,
    customPrompt: cfg.customPrompt,
  });
  const refs = input.references || {};
  const imageModelSettings = resolveImageModelSettings(cfg);
  const llmModelSettings = resolveLlmModelSettings(cfg);
  const garmentSlots = resolveGarmentReferenceSlots(refs);
  const modelRefs = collectReferences(refs, ['model', 'existing']);
  const styleRefs = collectReferences(refs, ['style']);
  const productFrontRefs = unique([...garmentSlots.front, ...styleRefs]);
  const productBackRefs = unique([...(garmentSlots.back.length ? garmentSlots.back : garmentSlots.front), ...styleRefs]);
  const productSideRefs = unique([...(garmentSlots.side.length ? garmentSlots.side : garmentSlots.front), ...styleRefs]);
  const productDetailRefs = unique([...garmentSlots.front, ...garmentSlots.detail, ...styleRefs]);
  const allRefs = unique([...modelRefs, ...garmentSlots.all, ...styleRefs]);
  const sourceNodeIds = unique([input.sourceNodeId]);
  const identityLine = cfg.lockLevel === 'authorized-identity-pose'
    ? 'Preserve the authorized model identity, face structure, body proportion, and commercial pose language.'
    : 'Use the reference model pose language without implying unauthorized celebrity or real-person imitation.';
  const garmentLine = `Keep exact garment fidelity and matching-set fidelity for ${presetContext.garmentType}: preserve every referenced piece, top/bottom relationship, silhouette, collar, sleeve, waistband, hem, seams, fabric weight, color, trims, and print placement.`;
  const themeMotifLine = buildThemeMotifLock(presetContext);
  const modelAppearanceLine = buildModelAppearanceLock(presetContext);
  const poseLine = buildPoseLock(presetContext);
  const cameraLookLine = buildCameraLookLock(presetContext);
  const realismStyleLine = buildRealismStyleLock(presetContext);
  const flatlayDisplayLine = buildProductDisplayLayoutLock('flatlay', presetContext);
  const hangerDisplayLine = buildProductDisplayLayoutLock('hanger', presetContext);
  const suiteReferenceAdaptationLine = buildSuiteReferenceAdaptationLock();
  const negativeLine = `no garment redesign, no new logos, no changed print, no fake label text, no distorted body, no extra limbs, no identity drift, ${buildGarmentSetDriftNegativeLock()}`;
  const promptContextExtra = [
    `Preset prompt context: ${presetContext.promptText}`,
    ...(presetContext.customPrompt ? [`User custom prompt: ${presetContext.customPrompt}`] : []),
    ...skillProfilePromptLines(input.skillProfile),
    themeMotifLine,
    modelAppearanceLine,
    poseLine,
    cameraLookLine,
    realismStyleLine,
    suiteReferenceAdaptationLine,
    `Target audience: ${presetContext.audience}`,
    `Sales channel: ${presetContext.channel}`,
    `Use-case scene routing: ${presetContext.useCasePreset.prompt}`,
  ];
  const sceneById = new Map(APPAREL_PACK_PRESETS.suiteScenes.map((scene) => [scene.id, scene]));
  const requestedScenes = unique(cfg.scenePresetIds || []);
  const orderedScenes = unique([
    'model-front',
    ...requestedScenes,
    ...APPAREL_PACK_PRESETS.suiteScenes.map((scene) => scene.id),
  ])
    .map((id) => sceneById.get(id))
    .filter(Boolean) as ApparelPackPresetItem[];
  const selectedScenes = orderedScenes.slice(0, clampShotCount(cfg.shotCount, 3, MAX_APPAREL_PACK_SHOTS));
  const selectedIds = new Set(selectedScenes.map((scene) => `${packId}-${scene.id}`));
  const frontId = `${packId}-model-front`;
  const flatlayId = `${packId}-flatlay`;
  const hangerId = `${packId}-hanger`;

  const sceneLayout: Record<string, { row: number; col: number }> = {
    'model-front': { row: 0, col: 1 },
    'model-back': { row: 0, col: 2 },
    'model-half': { row: 1, col: 1 },
    flatlay: { row: 1, col: 2 },
    hanger: { row: 1, col: 3 },
    detail: { row: 2, col: 1 },
    'model-side': { row: 2, col: 2 },
    'model-lifestyle': { row: 2, col: 3 },
    'fabric-macro': { row: 3, col: 1 },
    'label-detail': { row: 3, col: 2 },
    'size-reference': { row: 3, col: 3 },
    'color-texture': { row: 4, col: 1 },
  };

  const productAnchorIds = unique([
    input.sourceNodeId,
    selectedIds.has(flatlayId) ? flatlayId : undefined,
    selectedIds.has(hangerId) ? hangerId : undefined,
    frontId,
  ]);

  const sceneNode = (scene: ApparelPackPresetItem): ApparelPackPlanNode => {
    const id = `${packId}-${scene.id}`;
    const layout = sceneLayout[scene.id] || { row: 2 + Math.floor(selectedScenes.indexOf(scene) / 3), col: 1 + (selectedScenes.indexOf(scene) % 3) };
    const modelScene = scene.id === 'model-side' || scene.id === 'model-lifestyle' || scene.id === 'size-reference';
    const productRefs = scene.id === 'model-front'
      ? unique([...garmentSlots.front, ...modelRefs, ...styleRefs])
      : scene.id === 'model-back'
        ? unique([...productBackRefs, ...modelRefs])
        : scene.id === 'flatlay' || scene.id === 'hanger'
          ? productFrontRefs
          : modelScene
            ? productSideRefs
            : productDetailRefs;
    const sourceForAnchors = unique([input.sourceNodeId, `${packId}-brief`]);
    const sourceFromFront = unique([input.sourceNodeId, frontId]);
    const sourceFromProduct = productAnchorIds;
    const common = {
      refs: productRefs,
      ...imageModelSettings,
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      promptOverrides: input.promptOverrides,
      skillProfile: input.skillProfile,
    };
    if (scene.id === 'model-front') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'model-front-anchor',
        sourceNodeIds: sourceForAnchors,
        anchorPolicy: { model: 'reference-model', garment: 'source-garment', brief: 'llm-finalized-anchor-brief', style: refs.style?.length ? 'style-reference' : 'clean-commerce' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'model-front-anchor',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use the LLM finalized apparel brief plus garment references as product truth and the model reference as the first model anchor',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: `${identityLine} ${modelAppearanceLine} ${presetContext.audiencePreset.prompt}`,
          composition: `full-body front view; ${poseLine}; garment centered and unobstructed, natural body language that fits the clothing category. ${cameraLookLine}`,
          lighting: `soft commercial lighting, accurate textile color, visible fabric behavior. ${realismStyleLine}`,
          background: `${presetContext.useCasePreset.prompt}; ${themeMotifLine}; garment-context background elements matched to the clothing category, product-first composition with scene context matched to garment use; ${presetContext.channelPreset.prompt}`,
          negatives: negativeLine,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'model-back') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'model-back-derived',
        sourceNodeIds: sourceFromFront,
        anchorPolicy: { model: 'front-anchor', garment: 'source-garment', view: 'back' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'model-back-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'derive from the front anchor while using back-view garment references for product truth',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'same model identity, body proportion, crop, styling, and lighting family as the front anchor',
          composition: 'turn the body to show the garment back view clearly, full-body commercial crop',
          lighting: 'consistent studio lighting and fabric rendering from the front anchor',
          background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
          negatives: negativeLine,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'model-half') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'model-half-detail-derived',
        sourceNodeIds: sourceFromFront,
        anchorPolicy: { model: 'front-anchor', garment: 'source-garment', crop: 'half-body' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'model-half-detail-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'derive model and garment from the front anchor and original garment references',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'same model as the front anchor, face and hands simple, no styling that blocks the garment',
          composition: 'half-body crop showing neckline, chest area, sleeve, trims, fabric behavior, and print scale',
          lighting: 'soft studio lighting with crisp textile texture',
          background: `same use-case scene family as the front anchor, no distracting props; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no messy hands, no jewelry blocking product`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'flatlay') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'flatlay-anchor',
        sourceNodeIds: sourceForAnchors,
        anchorPolicy: { garment: 'source-garment', layout: 'flatlay', model: 'none', brief: 'llm-finalized-anchor-brief' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'flatlay-anchor',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use the LLM finalized apparel brief and source garment references to lock product identity, no model in output',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'no model, no body, product-only presentation',
          composition: `front product set anchor; ${flatlayDisplayLine}; top-down flat lay, show all set pieces, top and bottom, garment neatly arranged, silhouette and construction readable. ${cameraLookLine}`,
          lighting: `even soft light, accurate textile color and print clarity. ${realismStyleLine}`,
          background: `${flatlayDisplayLine}; light product surface matched to garment use; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no hanger distortion, no body`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'hanger') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'hanger-product-anchor',
        sourceNodeIds: sourceForAnchors,
        anchorPolicy: { garment: 'source-garment', layout: 'hanger', model: 'none', brief: 'llm-finalized-anchor-brief' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'hanger-product-anchor',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use the LLM finalized apparel brief and source garment references as product truth for the hanging front anchor',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'no model, product displayed on a simple hanger or clean hanging setup',
          composition: `${hangerDisplayLine}; front-facing hanging product set anchor when applicable, natural drape, collar, sleeve, hem, seams and print visible; preserve top and bottom as a set if both are referenced`,
          lighting: 'soft studio lighting, accurate fabric weight and folds',
          background: `${hangerDisplayLine}; clean wall or use-case product setting; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no mannequin body, no distorted hanger, no changed silhouette`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'detail') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'garment-detail-derived',
        sourceNodeIds: sourceFromProduct,
        anchorPolicy: { garment: 'source-garment', detail: 'fabric-trim-print' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'garment-detail-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use flatlay and hanger/product anchors plus source garment references for exact material truth',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'no model unless the crop naturally contains a tiny garment-on-body area; product detail is primary',
          composition: 'close-up of fabric texture, trim, seam, print detail, collar or sleeve construction',
          lighting: 'macro-friendly soft light with visible weave, stitch, and material texture',
          background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no warped stitching, no fake labels, no unreadable texture`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    return makeImageNode(id, layout.row, layout.col, base, baseImageData({
      ...common,
      role: `${scene.id}-derived`,
      sourceNodeIds: modelScene ? sourceFromFront : sourceFromProduct,
      anchorPolicy: modelScene
        ? { model: 'front-anchor', garment: 'source-garment', scene: scene.id }
        : { garment: 'product-anchor', detail: scene.id, model: 'none' },
      prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: `${scene.id}-derived`,
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: modelScene
          ? 'derive from the front model anchor and preserve the same model and garment; use side garment references or front references only for construction truth'
          : 'derive from product anchors and source garment references; no model identity is needed',
        garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
        modelPolicy: modelScene
          ? `same model identity, body proportion and styling as the front anchor; ${presetContext.audiencePreset.prompt}`
          : 'product-only detail or product-reference shot, no face and no body emphasis',
        composition: scene.prompt,
        lighting: modelScene
          ? 'lighting consistent with the front anchor, color and fabric rendering stable'
          : 'clean product lighting, macro or product-detail clarity, accurate material texture',
        background: `${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}; keep the output commercially usable and uncluttered`,
        negatives: `${negativeLine}, no unsupported props, no inaccurate text overlay`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    }));
  };

  const imageNodesForScenes = selectedScenes.map(sceneNode);
  const selectedImageIds = imageNodesForScenes.map((node) => node.id);
  const selected = new Set(selectedImageIds);
  const qaEnabled = qualityCfg.enabled === true;
  const anchorImageIds = [`${packId}-model-front`, `${packId}-flatlay`, `${packId}-hanger`]
    .filter((imageId) => selected.has(imageId));
  const anchorQaId = `${packId}-anchor-quality-qa`;
  const anchorQaNode = qaEnabled && anchorImageIds.length > 0
    ? makeQualityQaNode(anchorQaId, 1, 4, base, {
      mode: 'suite',
      imageIds: anchorImageIds,
      references: allRefs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
      promptOverrides: input.promptOverrides,
      llmModelSettings,
      skillProfile: input.skillProfile,
      anchorOnly: true,
    })
    : null;
  const qaId = `${packId}-quality-qa`;
  const qaNode = qaEnabled
    ? makeQualityQaNode(qaId, 4, 2, base, {
      mode: 'suite',
      imageIds: selectedImageIds,
      references: allRefs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
      promptOverrides: input.promptOverrides,
      llmModelSettings,
      skillProfile: input.skillProfile,
    })
    : null;
  const nodes: ApparelPackPlanNode[] = [
    makePromptAgentNode(
      `${packId}-brief`,
      0,
      0,
      base,
      [
        '服装套图生成规划',
        `锁定级别: ${cfg.lockLevel}`,
        `模特一致性: ${cfg.modelConsistency}`,
        `服装一致性: ${cfg.garmentConsistency}`,
        `品类预设: ${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `人群预设: ${presetContext.audiencePreset.label} / ${presetContext.audience}`,
        `平台预设: ${presetContext.channelPreset.label} / ${presetContext.channel}`,
        `用途场景: ${presetContext.useCasePreset.label} / ${presetContext.useCase}`,
        `模特外观: ${presetContext.modelLookPreset.label} / ${presetContext.modelLook}`,
        `动作风格: ${presetContext.posePreset.label} / ${presetContext.poseStyle}`,
        `镜头质感: ${presetContext.cameraPreset.label} / ${presetContext.cameraStyle}`,
        `真实感: ${presetContext.realismPreset.label} / ${presetContext.realismStyle}`,
        `预设提示词: ${presetContext.promptText}`,
        suiteReferenceAdaptationLine,
        '先由 LLM 定稿服装事实、套装清单、用途场景、正面模特锚点、平铺正面锚点和挂拍正面锚点，再派生背面、动作与细节图。',
        '若前四张服装参考是套装，默认按上衣正面、裤子正面、上衣背面、裤子背面建立 garmentSetLock。',
      ].join('\n'),
      input.promptOverrides,
      llmModelSettings,
    ),
    ...imageNodesForScenes,
    ...(anchorQaNode ? [anchorQaNode] : []),
    ...(qaNode ? [qaNode] : []),
  ];
  const edges = [
    ...(input.sourceNodeId ? nodes.filter((node) => node.type === 'image').map((node) => edge(input.sourceNodeId!, node.id, 'any')) : []),
    edge(`${packId}-brief`, `${packId}-model-front`, 'text'),
    selected.has(`${packId}-flatlay`) ? edge(`${packId}-brief`, `${packId}-flatlay`, 'text') : null,
    selected.has(`${packId}-hanger`) ? edge(`${packId}-brief`, `${packId}-hanger`, 'text') : null,
    selected.has(`${packId}-model-back`) ? edge(`${packId}-model-front`, `${packId}-model-back`, 'image') : null,
    selected.has(`${packId}-model-half`) ? edge(`${packId}-model-front`, `${packId}-model-half`, 'image') : null,
    selected.has(`${packId}-detail`) && selected.has(`${packId}-flatlay`) ? edge(`${packId}-flatlay`, `${packId}-detail`, 'image') : null,
    selected.has(`${packId}-detail`) && selected.has(`${packId}-hanger`) ? edge(`${packId}-hanger`, `${packId}-detail`, 'image') : null,
    selected.has(`${packId}-model-side`) ? edge(`${packId}-model-front`, `${packId}-model-side`, 'image') : null,
    selected.has(`${packId}-model-lifestyle`) ? edge(`${packId}-model-front`, `${packId}-model-lifestyle`, 'image') : null,
    selected.has(`${packId}-fabric-macro`) ? edge(selected.has(`${packId}-flatlay`) ? `${packId}-flatlay` : `${packId}-model-front`, `${packId}-fabric-macro`, 'image') : null,
    selected.has(`${packId}-label-detail`) ? edge(selected.has(`${packId}-hanger`) ? `${packId}-hanger` : `${packId}-model-front`, `${packId}-label-detail`, 'image') : null,
    selected.has(`${packId}-size-reference`) ? edge(`${packId}-model-front`, `${packId}-size-reference`, 'image') : null,
    selected.has(`${packId}-color-texture`) ? edge(selected.has(`${packId}-flatlay`) ? `${packId}-flatlay` : `${packId}-model-front`, `${packId}-color-texture`, 'image') : null,
    ...(anchorQaNode ? anchorImageIds.map((imageId) => edge(imageId, anchorQaId, 'image')) : []),
    ...(qaNode ? selectedImageIds.map((imageId) => edge(imageId, qaId, 'image')) : []),
  ].filter(Boolean) as ApparelPackPlanEdge[];
  const selectedRunIds = [`${packId}-brief`, ...selectedImageIds, ...(anchorQaNode ? [anchorQaId] : []), ...(qaNode ? [qaId] : [])];
  const stageOrder = filterStages([
    [`${packId}-brief`],
    [`${packId}-model-front`, `${packId}-flatlay`, `${packId}-hanger`],
    ...(anchorQaNode ? [[anchorQaId]] : []),
    [`${packId}-model-back`, `${packId}-model-half`, `${packId}-model-side`, `${packId}-model-lifestyle`],
    [`${packId}-detail`, `${packId}-fabric-macro`, `${packId}-label-detail`, `${packId}-size-reference`, `${packId}-color-texture`],
    ...(qaNode ? [[qaId]] : []),
  ], selectedRunIds);
  const anchorStageOrder = filterStages([
    [`${packId}-brief`],
    [`${packId}-model-front`, `${packId}-flatlay`, `${packId}-hanger`],
    ...(anchorQaNode ? [[anchorQaId]] : []),
  ], selectedRunIds);
  const runStages = selectRunStagesForScope(input, stageOrder, anchorStageOrder);
  const runNodeIds = runStages.flat();
  const withOutput = appendOutputNode({
    packId,
    mode: 'suite',
    title: '服装套图封包输出',
    base,
    nodes,
    edges,
    selectedImageIds,
    qaNodeId: qaNode ? qaId : undefined,
    row: 0,
    col: 4,
  });
  return {
    title: '服装套图封包',
    goal: 'Generate a consistent apparel listing package from model and garment references.',
    summary: {
      mode: 'suite',
      imageCount: selectedImageIds.length,
      anchorCount: 1 + (selected.has(`${packId}-flatlay`) ? 1 : 0) + (selected.has(`${packId}-hanger`) ? 1 : 0),
    },
    nodes: withOutput.nodes,
    edges: withOutput.edges,
    runNodeIds,
    runStages,
    focusViewport: { x: base.x - 120, y: base.y - 80, zoom: 0.75 },
  };
}

function buildGarmentReferencePlan(input: ApparelPackPlanInput, packId: string, base: { x: number; y: number }): ApparelPackPlan {
  const cfg = { ...DEFAULT_APPAREL_PACK_CONFIG.garmentReference, ...input.garmentReference };
  const qualityCfg = { ...DEFAULT_APPAREL_PACK_CONFIG.qualityQa, ...input.qualityQa };
  const presetContext = resolvePresetContext({
    garmentPresetId: cfg.garmentPresetId,
    audiencePresetId: cfg.audiencePresetId,
    channelPresetId: cfg.channelPresetId,
    useCasePresetId: cfg.useCasePresetId,
    modelLookPresetId: cfg.modelLookPresetId,
    posePresetId: cfg.posePresetId,
    cameraPresetId: cfg.cameraPresetId,
    realismPresetId: cfg.realismPresetId,
    customGarmentType: cfg.customGarmentType,
    customAudience: cfg.customAudience,
    customChannel: cfg.customChannel,
    customUseCase: cfg.customUseCase,
    customModelLook: cfg.customModelLook,
    customPose: cfg.customPose,
    customCamera: cfg.customCamera,
    customRealism: cfg.customRealism,
    customPrompt: cfg.customPrompt,
    fallbackGarment: cfg.garmentType,
    fallbackAudience: cfg.audience,
  });
  const refs = input.references || {};
  const imageModelSettings = resolveImageModelSettings(cfg);
  const llmModelSettings = resolveLlmModelSettings(cfg);
  const garmentSlots = resolveGarmentReferenceSlots(refs);
  const styleRefs = collectReferences(refs, ['style']);
  const garmentFrontRefs = unique([...garmentSlots.front, ...styleRefs]);
  const garmentBackRefs = unique([...(garmentSlots.back.length ? garmentSlots.back : garmentSlots.front), ...styleRefs]);
  const garmentSideRefs = unique([...(garmentSlots.side.length ? garmentSlots.side : garmentSlots.front), ...styleRefs]);
  const garmentDetailRefs = unique([...garmentSlots.front, ...garmentSlots.detail, ...styleRefs]);
  const garmentRefs = unique([...garmentSlots.all, ...styleRefs]);
  const sourceNodeIds = unique([input.sourceNodeId]);
  const sourceAnchorIds = unique([input.sourceNodeId, `${packId}-brief`]);
  const garmentType = presetContext.garmentType || cfg.garmentType || 'garment';
  const audience = presetContext.audience || cfg.audience || 'marketplace customer';
  const modelPhrase = cfg.modelPolicy === 'no-face'
    ? 'no-face fashion body crop'
    : cfg.modelPolicy === 'body-crop'
      ? 'body-crop fashion model'
      : 'generic fashion model';
  const garmentTruth = `Exact ${garmentType} fidelity: preserve every referenced garment piece and matching-set relationship, including top and bottom when present; preserve silhouette, collar, sleeve, waistband, hem, seams, fabric weight, color, trims, and print placement from the garment references. ${presetContext.garmentPreset.prompt}`;
  const themeMotifLine = buildThemeMotifLock(presetContext);
  const modelAppearanceLine = buildModelAppearanceLock(presetContext);
  const poseLine = buildPoseLock(presetContext);
  const cameraLookLine = buildCameraLookLock(presetContext);
  const realismStyleLine = buildRealismStyleLock(presetContext);
  const flatlayDisplayLine = buildProductDisplayLayoutLock('flatlay', presetContext);
  const hangerDisplayLine = buildProductDisplayLayoutLock('hanger', presetContext);
  const negativeLine = `no celebrity likeness, no new logos, no garment redesign, no changed print, no distorted body, no fake label text, ${buildGarmentSetDriftNegativeLock()}`;
  const frontId = `${packId}-model-front`;
  const flatlayId = `${packId}-flatlay-anchor`;
  const backId = `${packId}-model-back`;
  const detailId = `${packId}-detail`;
  const hangerId = `${packId}-hanger`;
  const halfId = `${packId}-model-half`;
  const sideId = `${packId}-model-side`;
  const lifestyleId = `${packId}-model-lifestyle`;
  const fabricId = `${packId}-fabric-macro`;
  const colorId = `${packId}-color-texture`;
  const promptContextExtra = [
    `Preset prompt context: ${presetContext.promptText}`,
    ...(presetContext.customPrompt ? [`User custom prompt: ${presetContext.customPrompt}`] : []),
    ...skillProfilePromptLines(input.skillProfile),
    themeMotifLine,
    modelAppearanceLine,
    poseLine,
    cameraLookLine,
    realismStyleLine,
    `Target audience: ${audience}`,
    `Sales channel: ${presetContext.channel}`,
    `Use-case scene routing: ${presetContext.useCasePreset.prompt}`,
  ];
  const baseImageDefaults = { promptOverrides: input.promptOverrides, skillProfile: input.skillProfile, ...imageModelSettings };
  const allNodes: ApparelPackPlanNode[] = [
    makePromptAgentNode(
      `${packId}-brief`,
      0,
      0,
      base,
      [
        '服装参考生成规划',
        `品类: ${garmentType}`,
        `人群: ${audience}`,
        `平台: ${presetContext.channel}`,
        `用途场景: ${presetContext.useCasePreset.label} / ${presetContext.useCase}`,
        `预设提示词: ${presetContext.promptText}`,
        `模特策略: ${cfg.modelPolicy}`,
        themeMotifLine,
        modelAppearanceLine,
        poseLine,
        cameraLookLine,
        realismStyleLine,
        '先由 LLM 定稿服装事实、套装清单、用途场景、正面模特锚点、平铺正面锚点和挂拍正面锚点，再派生背面、动作与细节图。',
        '若前四张服装参考是套装，默认按上衣正面、裤子正面、上衣背面、裤子背面建立 garmentSetLock。',
      ].join('\n'),
      input.promptOverrides,
      llmModelSettings,
    ),
    makeImageNode(frontId, 0, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-front-anchor',
      refs: garmentFrontRefs,
      sourceNodeIds: sourceAnchorIds,
      anchorPolicy: { model: 'generated-generic', garment: 'source-garment', brief: 'llm-finalized-anchor-brief', style: refs.style?.length ? 'style-reference' : 'clean-commerce' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-front-anchor',
        scene: 'front-view garment-to-model ecommerce image',
        referencePolicy: 'use the LLM finalized apparel brief and garment references as the only product truth, then create a generic commercial model',
        garmentTruth,
        modelPolicy: `${modelPhrase} for ${audience}; safe generic identity, product readability first; ${modelAppearanceLine}; ${presetContext.audiencePreset.prompt}`,
        composition: `full-body front view; ${poseLine}; garment centered and unobstructed, natural body language that fits the clothing category. ${cameraLookLine}`,
        lighting: `clean commercial lighting, accurate textile color and fabric behavior. ${realismStyleLine}`,
        background: `${presetContext.useCasePreset.prompt}; ${themeMotifLine}; garment-context background elements matched to the clothing category, product-first model scene matched to garment use; ${presetContext.channelPreset.prompt}`,
        negatives: negativeLine,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(flatlayId, 0, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'flatlay-anchor',
      refs: garmentFrontRefs,
      sourceNodeIds: sourceAnchorIds,
      anchorPolicy: { garment: 'source-garment', layout: 'flatlay', model: 'none', brief: 'llm-finalized-anchor-brief' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'flatlay-anchor',
        scene: 'front product set anchor / flat lay product anchor',
        referencePolicy: 'use the LLM finalized apparel brief and garment references as exact product truth; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product-only flat lay',
        composition: `front product set anchor; ${flatlayDisplayLine}; top-down clean commerce composition, show all set pieces, top and bottom, garment neatly arranged and fully readable. ${cameraLookLine}`,
        lighting: `even soft light, accurate material and print scale. ${realismStyleLine}`,
        background: `${flatlayDisplayLine}; light product surface matched to garment use; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no body, no hanger`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(backId, 1, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-back-derived',
      refs: garmentBackRefs,
      sourceNodeIds: unique([input.sourceNodeId, `${packId}-model-front`]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', view: 'back' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-back-derived',
        scene: 'back-view model image derived from front anchor',
        referencePolicy: 'use front model anchor for body/crop consistency and back-view garment references for product truth',
        garmentTruth,
        modelPolicy: 'same generic model styling, body proportion, lighting, crop, and pose language as front anchor',
        composition: 'back view showing garment back construction and fabric behavior',
        lighting: 'consistent studio lighting from front anchor',
        background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no identity drift, no anatomy errors`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(detailId, 1, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'garment-detail-derived',
      refs: garmentDetailRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', detail: 'fabric-trim-print' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'garment-detail-derived',
        scene: 'close-up product detail image',
        referencePolicy: cfg.includeFlatlay === false
          ? 'use source garment references and front model anchor as garment truth'
          : 'use flatlay anchor as garment truth',
        garmentTruth,
        modelPolicy: 'product detail only; no face or model identity emphasis',
        composition: 'close-up of fabric texture, trim, seam, collar, sleeve, hem, and print scale',
        lighting: 'macro-friendly soft light with visible stitching and textile texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no fabric change, no print drift, no warped stitching`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(hangerId, 1, 3, base, baseImageData({
      ...baseImageDefaults,
      role: 'hanger-product-anchor',
      refs: garmentFrontRefs,
      sourceNodeIds: sourceAnchorIds,
      anchorPolicy: { garment: 'source-garment', layout: 'hanger', model: 'none', brief: 'llm-finalized-anchor-brief' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'hanger-product-anchor',
        scene: 'hanger product front anchor from garment reference',
        referencePolicy: 'use the LLM finalized apparel brief and garment references for exact hanging product truth; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product displayed on a simple hanger or clean hanging setup',
        composition: `${hangerDisplayLine}; front-facing hanging garment, natural drape, collar, sleeve, hem, seams and print visible. ${cameraLookLine}`,
        lighting: `soft product lighting, accurate fabric weight and folds. ${realismStyleLine}`,
        background: `${hangerDisplayLine}; clean wall or use-case product setting; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no mannequin body, no distorted hanger, no changed silhouette`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(halfId, 2, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-half-detail-derived',
      refs: garmentFrontRefs,
      sourceNodeIds: unique([input.sourceNodeId, frontId]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', crop: 'half-body' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-half-detail-derived',
        scene: 'half-body model detail image',
        referencePolicy: 'use front model anchor for model consistency and garment references for product truth',
        garmentTruth,
        modelPolicy: `same generic model styling and body proportion as front anchor; ${presetContext.audiencePreset.prompt}`,
        composition: 'half-body crop showing neckline, sleeve, chest print, trims, fabric behavior, and fit',
        lighting: 'consistent soft studio lighting from front anchor',
        background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no jewelry blocking product, no messy hands`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(sideId, 2, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-side-derived',
      refs: garmentSideRefs,
      sourceNodeIds: unique([input.sourceNodeId, frontId]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', view: 'side' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-side-derived',
        scene: 'side or three-quarter model image',
        referencePolicy: 'derive from front model anchor; use side garment references or left/right garment references only for side construction truth',
        garmentTruth,
        modelPolicy: `same generic model identity and styling as front anchor; ${presetContext.audiencePreset.prompt}`,
        composition: 'side or three-quarter view showing garment fit volume and side silhouette',
        lighting: 'consistent studio lighting and fabric rendering',
        background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no identity drift, no anatomy errors`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(lifestyleId, 2, 3, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-lifestyle-derived',
      refs: garmentFrontRefs,
      sourceNodeIds: unique([input.sourceNodeId, frontId]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', context: 'commerce-lifestyle' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-lifestyle-derived',
        scene: 'commerce lifestyle model image',
        referencePolicy: 'derive from front model anchor; only change context while keeping garment and model stable',
        garmentTruth,
        modelPolicy: `same generic model identity, body proportion and garment; ${presetContext.audiencePreset.prompt}`,
        composition: 'simple lifestyle composition with garment dominant and readable',
        lighting: 'commercial lifestyle lighting with stable product color',
        background: `${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}; uncluttered simple context scene`,
        negatives: `${negativeLine}, no crowded scene, no product blocked by props`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(fabricId, 3, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'fabric-macro-derived',
      refs: garmentDetailRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', detail: 'fabric-macro' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'fabric-macro-derived',
        scene: 'fabric macro detail image',
        referencePolicy: 'use garment references and product anchors for material truth',
        garmentTruth,
        modelPolicy: 'product detail only, no model',
        composition: 'macro fabric texture, weave, stitch, print edge, and material weight',
        lighting: 'macro-friendly soft light with clear texture and accurate color',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no material drift, no fake label text`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(colorId, 3, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'color-texture-derived',
      refs: garmentDetailRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', detail: 'color-texture' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'color-texture-derived',
        scene: 'color and texture product image',
        referencePolicy: 'use garment references and product anchors for exact colorway and material truth',
        garmentTruth,
        modelPolicy: 'product-only color and texture presentation',
        composition: 'product crop showing accurate colorway, fabric finish, print color and scale',
        lighting: 'clean color-accurate lighting, no color cast',
        background: `neutral ecommerce surface; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no color shift, no over-saturated fabric`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
  ];
  const candidateImageIds = [
    frontId,
    ...(cfg.includeFlatlay === false ? [] : [flatlayId]),
    hangerId,
    backId,
    ...(cfg.includeDetail === false ? [] : [detailId]),
    halfId,
    sideId,
    lifestyleId,
    fabricId,
    colorId,
  ];
  const selectedImageIds = candidateImageIds.slice(0, clampShotCount(cfg.shotCount, 1, MAX_APPAREL_PACK_SHOTS));
  const selected = new Set(selectedImageIds);
  const qaEnabled = qualityCfg.enabled === true;
  const anchorImageIds = [frontId, flatlayId, hangerId].filter((imageId) => selected.has(imageId));
  const anchorQaId = `${packId}-anchor-quality-qa`;
  const anchorQaNode = qaEnabled && anchorImageIds.length > 0
    ? makeQualityQaNode(anchorQaId, 1, 4, base, {
      mode: 'garment-reference',
      imageIds: anchorImageIds,
      references: garmentRefs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
      promptOverrides: input.promptOverrides,
      llmModelSettings,
      skillProfile: input.skillProfile,
      anchorOnly: true,
    })
    : null;
  const qaId = `${packId}-quality-qa`;
  const qaNode = qaEnabled
    ? makeQualityQaNode(qaId, 4, 1, base, {
      mode: 'garment-reference',
      imageIds: selectedImageIds,
      references: garmentRefs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
      promptOverrides: input.promptOverrides,
      llmModelSettings,
      skillProfile: input.skillProfile,
    })
    : null;
  const nodes = [
    ...selectPlanImages(allNodes, selectedImageIds),
    ...(anchorQaNode ? [anchorQaNode] : []),
    ...(qaNode ? [qaNode] : []),
  ];
  const edges = [
    ...(input.sourceNodeId ? nodes.filter((node) => node.type === 'image').map((node) => edge(input.sourceNodeId!, node.id, 'any')) : []),
    selected.has(frontId) ? edge(`${packId}-brief`, frontId, 'text') : null,
    selected.has(flatlayId) ? edge(`${packId}-brief`, flatlayId, 'text') : null,
    selected.has(hangerId) ? edge(`${packId}-brief`, hangerId, 'text') : null,
    selected.has(backId) ? edge(frontId, backId, 'image') : null,
    selected.has(detailId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, detailId, 'image') : null,
    selected.has(halfId) ? edge(frontId, halfId, 'image') : null,
    selected.has(sideId) ? edge(frontId, sideId, 'image') : null,
    selected.has(lifestyleId) ? edge(frontId, lifestyleId, 'image') : null,
    selected.has(fabricId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, fabricId, 'image') : null,
    selected.has(colorId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, colorId, 'image') : null,
    ...(anchorQaNode ? anchorImageIds.map((imageId) => edge(imageId, anchorQaId, 'image')) : []),
    ...(qaNode ? selectedImageIds.map((imageId) => edge(imageId, qaId, 'image')) : []),
  ].filter(Boolean) as ApparelPackPlanEdge[];
  const selectedRunIds = [`${packId}-brief`, ...selectedImageIds, ...(anchorQaNode ? [anchorQaId] : []), ...(qaNode ? [qaId] : [])];
  const stageOrder = filterStages([
    [`${packId}-brief`],
    [frontId, flatlayId, hangerId],
    ...(anchorQaNode ? [[anchorQaId]] : []),
    [backId, detailId, halfId, sideId, lifestyleId],
    [fabricId, colorId],
    ...(qaNode ? [[qaId]] : []),
  ], selectedRunIds);
  const anchorStageOrder = filterStages([
    [`${packId}-brief`],
    [frontId, flatlayId, hangerId],
    ...(anchorQaNode ? [[anchorQaId]] : []),
  ], selectedRunIds);
  const runStages = selectRunStagesForScope(input, stageOrder, anchorStageOrder);
  const runNodeIds = runStages.flat();
  const withOutput = appendOutputNode({
    packId,
    mode: 'garment-reference',
    title: '服装参考封包输出',
    base,
    nodes,
    edges,
    selectedImageIds,
    qaNodeId: qaNode ? qaId : undefined,
    row: 0,
    col: 4,
  });
  return {
    title: '服装参考封包',
    goal: 'Generate a model and product image package from garment references only.',
    summary: {
      mode: 'garment-reference',
      imageCount: selectedImageIds.length,
      anchorCount: 1 + (selected.has(flatlayId) ? 1 : 0) + (selected.has(hangerId) ? 1 : 0),
    },
    nodes: withOutput.nodes,
    edges: withOutput.edges,
    runNodeIds,
    runStages,
    focusViewport: { x: base.x - 120, y: base.y - 80, zoom: 0.75 },
  };
}

function buildInspirationPlan(input: ApparelPackPlanInput, packId: string, base: { x: number; y: number }): ApparelPackPlan {
  const cfg = { ...DEFAULT_APPAREL_PACK_CONFIG.inspiration, ...input.inspiration };
  const qualityCfg = { ...DEFAULT_APPAREL_PACK_CONFIG.qualityQa, ...input.qualityQa };
  const presetContext = resolvePresetContext({
    garmentPresetId: cfg.garmentPresetId,
    audiencePresetId: cfg.audiencePresetId,
    channelPresetId: cfg.channelPresetId,
    useCasePresetId: cfg.useCasePresetId,
    modelLookPresetId: cfg.modelLookPresetId,
    posePresetId: cfg.posePresetId,
    cameraPresetId: cfg.cameraPresetId,
    realismPresetId: cfg.realismPresetId,
    customGarmentType: cfg.customGarmentType,
    customAudience: cfg.customAudience,
    customChannel: cfg.customChannel,
    customUseCase: cfg.customUseCase,
    customModelLook: cfg.customModelLook,
    customPose: cfg.customPose,
    customCamera: cfg.customCamera,
    customRealism: cfg.customRealism,
    customPrompt: cfg.customPrompt,
    fallbackAudience: cfg.audience,
    fallbackChannel: cfg.channel,
  });
  const sourceNodeIds = unique([input.sourceNodeId]);
  const imageModelSettings = resolveImageModelSettings(cfg);
  const llmModelSettings = resolveLlmModelSettings(cfg);
  const refs = collectReferences(input.references, ['garment', 'model', 'style']);
  const direction = cfg.direction || 'commercial apparel listing concept';
  const garmentTruth = `Follow the structured apparel brief garmentTruth exactly: garment type, all referenced set pieces when present, silhouette, colorway, fabric, trims, construction, print or placement, and platform constraints. ${presetContext.garmentPreset.prompt}`;
  const themeMotifLine = buildThemeMotifLock(presetContext);
  const modelAppearanceLine = buildModelAppearanceLock(presetContext);
  const poseLine = buildPoseLock(presetContext);
  const cameraLookLine = buildCameraLookLock(presetContext);
  const realismStyleLine = buildRealismStyleLock(presetContext);
  const flatlayDisplayLine = buildProductDisplayLayoutLock('flatlay', presetContext);
  const hangerDisplayLine = buildProductDisplayLayoutLock('hanger', presetContext);
  const negativeLine = `no random redesign, no changed colorway, no identity drift, no anatomy errors, no fake label text, no extra logo, ${buildGarmentSetDriftNegativeLock()}`;
  const frontId = `${packId}-model-front`;
  const backId = `${packId}-model-back`;
  const flatlayId = `${packId}-flatlay`;
  const detailId = `${packId}-detail`;
  const hangerId = `${packId}-hanger`;
  const halfId = `${packId}-model-half`;
  const sideId = `${packId}-model-side`;
  const lifestyleId = `${packId}-model-lifestyle`;
  const fabricId = `${packId}-fabric-macro`;
  const colorId = `${packId}-color-texture`;
  const labelId = `${packId}-label-detail`;
  const promptContextExtra = [
    `Preset prompt context: ${presetContext.promptText}`,
    ...(presetContext.customPrompt ? [`User custom prompt: ${presetContext.customPrompt}`] : []),
    ...skillProfilePromptLines(input.skillProfile),
    themeMotifLine,
    modelAppearanceLine,
    poseLine,
    cameraLookLine,
    realismStyleLine,
    `Target audience: ${presetContext.audience}`,
    `Sales channel: ${presetContext.channel}`,
    `Use-case scene routing: ${presetContext.useCasePreset.prompt}`,
    direction,
  ];
  const baseImageDefaults = { promptOverrides: input.promptOverrides, skillProfile: input.skillProfile, ...imageModelSettings };
  const inspirationBriefPrompt = applyPromptOverride(
    {
      systemPrompt: [
        'You are a structured apparel generation brief planner and prompt engineer.',
        'Return concise JSON-like sections only; keep product facts inspectable and executable by gpt-image-2 image nodes.',
        'Required keys: garmentTruthLock, garmentSetLock, themeMotifLock, modelIdentityLock, modelAppearanceLock, modelFaceQualityLock, poseLock, cameraLookLock, realismStyleLock, productDisplayLayoutLock, sceneRouting, anchorShotBriefs, derivedShotRules, negativePrompt, retryHints.',
        'anchorShotBriefs must cover front model, flat lay front, hanger front before any derived shots.',
        `Reference hierarchy: ${PROMPT_REFERENCE_HIERARCHY}.`,
      ].join(' '),
      systemPromptZh: [
        '你是服装图片封包的结构化 brief 规划 agent 和提示词工程 agent。',
        '只返回简洁、可检查、能直接服务 gpt-image-2 图片节点的 JSON-like 段落。',
        '必须输出 garmentTruthLock、garmentSetLock、themeMotifLock、modelIdentityLock、modelAppearanceLock、modelFaceQualityLock、poseLock、cameraLookLock、realismStyleLock、productDisplayLayoutLock、sceneRouting、anchorShotBriefs、derivedShotRules、negativePrompt、retryHints。',
        'anchorShotBriefs 必须先覆盖正面模特、正面平铺、正面挂拍，再规划派生图。',
        `参考图优先级：${PROMPT_REFERENCE_HIERARCHY}。`,
      ].join('\n'),
      userPrompt: [
        `Direction: ${direction}`,
        `Garment preset: ${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `Audience: ${presetContext.audience}`,
        `Channel: ${presetContext.channel}`,
        `Preset prompt context: ${presetContext.promptText}`,
        themeMotifLine,
        modelAppearanceLine,
        poseLine,
        cameraLookLine,
        realismStyleLine,
        `Use-case scene routing: ${presetContext.useCasePreset.prompt}`,
        `Planning strength: ${cfg.planningStrength}`,
        'Output required fields: garmentTruthLock, garmentSetLock, themeMotifLock, modelIdentityLock, modelAppearanceLock, modelFaceQualityLock, poseLock, cameraLookLock, realismStyleLock, productDisplayLayoutLock, sceneRouting, anchorShotBriefs, derivedShotRules, negativePrompt, retryHints.',
        'productDisplayLayoutLock: flatlay and hanger shots need background contrast, no tone-on-tone washout, product hero focal point, complete margins, no crop, remove obvious wrinkles, only natural fabric wrinkles, props outside the garment silhouette, and for light pink garments no dominant white rug, cream background, white fur rug, high-key white, or dominant white wall.',
        'anchorShotBriefs: front model, flat lay front, hanger front; establish immutable product/model/product-display facts.',
        'derivedShotRules: every later image changes only one variable: viewpoint, crop, material detail, color/texture, or simple lifestyle context.',
        'Make every shot commercially usable and consistent with the same garment and model.',
      ].join('\n'),
      userPromptZh: [
        `方向：${direction}`,
        `服装预设：${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `人群：${presetContext.audience}`,
        `渠道：${presetContext.channel}`,
        `预设上下文：${presetContext.promptTextZh}`,
        themeMotifLine,
        modelAppearanceLine,
        poseLine,
        cameraLookLine,
        realismStyleLine,
        `用途场景路由：${presetContext.useCasePreset.promptZh}`,
        `规划强度：${cfg.planningStrength}`,
        '必须输出字段：garmentTruthLock、garmentSetLock、themeMotifLock、modelIdentityLock、modelAppearanceLock、modelFaceQualityLock、poseLock、cameraLookLock、realismStyleLock、productDisplayLayoutLock、sceneRouting、anchorShotBriefs、derivedShotRules、negativePrompt、retryHints。',
        'productDisplayLayoutLock：平铺和挂拍必须背景对比、不许同色糊成一片、有商品视觉焦点、完整边距、不裁切、去明显褶皱、只保留自然褶皱，道具不遮挡服装；浅粉服装不能用大面积白色地毯、奶油色背景、白色绒毯、高调白或白墙做主背景。',
        'anchorShotBriefs：正面模特、正面平铺、正面挂拍；先确定不可变商品、模特和商品展示事实。',
        'derivedShotRules：后续每张图只改变一个变量：视角、裁切、材质细节、颜色/质感或简单生活场景。',
        '所有镜头都必须电商可用，并保持同一件服装和同一个模特的一致性。',
      ].join('\n'),
      finalPrompt: [
        `Direction: ${direction}`,
        `Garment preset: ${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `Audience: ${presetContext.audience}`,
        `Channel: ${presetContext.channel}`,
        `Preset prompt context: ${presetContext.promptText}`,
        themeMotifLine,
        modelAppearanceLine,
        poseLine,
        cameraLookLine,
        realismStyleLine,
        `Use-case scene routing: ${presetContext.useCasePreset.prompt}`,
        `Planning strength: ${cfg.planningStrength}`,
        'Output required fields: garmentTruthLock, garmentSetLock, themeMotifLock, modelIdentityLock, modelAppearanceLock, modelFaceQualityLock, poseLock, cameraLookLock, realismStyleLock, productDisplayLayoutLock, sceneRouting, anchorShotBriefs, derivedShotRules, negativePrompt, retryHints.',
        'productDisplayLayoutLock: flatlay and hanger shots need background contrast, no tone-on-tone washout, product hero focal point, complete margins, no crop, remove obvious wrinkles, only natural fabric wrinkles, props outside the garment silhouette, and for light pink garments no dominant white rug, cream background, white fur rug, high-key white, or dominant white wall.',
        'anchorShotBriefs: front model, flat lay front, hanger front.',
        'derivedShotRules: later shots change only one declared variable.',
        'Make every shot commercially usable and consistent with the same garment and model.',
      ].join('\n'),
      finalPromptZh: [
        `方向：${direction}`,
        `服装预设：${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `人群：${presetContext.audience}`,
        `渠道：${presetContext.channel}`,
        `预设上下文：${presetContext.promptTextZh}`,
        themeMotifLine,
        modelAppearanceLine,
        poseLine,
        cameraLookLine,
        realismStyleLine,
        `用途场景路由：${presetContext.useCasePreset.promptZh}`,
        `规划强度：${cfg.planningStrength}`,
        '必须输出字段：garmentTruthLock、garmentSetLock、themeMotifLock、modelIdentityLock、modelAppearanceLock、modelFaceQualityLock、poseLock、cameraLookLock、realismStyleLock、productDisplayLayoutLock、sceneRouting、anchorShotBriefs、derivedShotRules、negativePrompt、retryHints。',
        'productDisplayLayoutLock：平铺和挂拍必须背景对比、不许同色糊成一片、有商品视觉焦点、完整边距、不裁切、去明显褶皱、只保留自然褶皱，道具不遮挡服装；浅粉服装不能用大面积白色地毯、奶油色背景、白色绒毯、高调白或白墙做主背景。',
        'anchorShotBriefs：正面模特、正面平铺、正面挂拍。',
        'derivedShotRules：后续图只改变一个声明变量。',
        '所有镜头都必须电商可用，并保持同一件服装和同一个模特的一致性。',
      ].join('\n'),
    },
    promptOverrideFor(input.promptOverrides, ['brief', `${packId}-llm-brief`]),
  );
  const allNodes: ApparelPackPlanNode[] = [
    makeLlmNode(`${packId}-llm-brief`, 0, 0, base, {
      ...llmModelSettings,
      promptKey: 'brief',
      systemPrompt: inspirationBriefPrompt.systemPrompt,
      systemPromptZh: inspirationBriefPrompt.systemPromptZh,
      prompt: inspirationBriefPrompt.userPrompt,
      promptZh: inspirationBriefPrompt.userPromptZh,
      outputText: inspirationBriefPrompt.userPrompt,
      defaultSystemPrompt: inspirationBriefPrompt.defaultSystemPrompt,
      defaultSystemPromptZh: inspirationBriefPrompt.defaultSystemPromptZh,
      defaultPrompt: inspirationBriefPrompt.defaultUserPrompt,
      defaultPromptZh: inspirationBriefPrompt.defaultUserPromptZh,
      promptOverridden: inspirationBriefPrompt.promptOverridden === true,
      status: 'idle',
    }),
    makeImageNode(frontId, 0, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-front-anchor',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'generated-generic', garment: 'brief-garment' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-front-anchor',
        scene: 'front-view ecommerce model anchor from structured brief',
        referencePolicy: 'follow the llm structured brief as the primary constraint and use optional references only as style/product constraints',
        garmentTruth,
        modelPolicy: `generic model for ${presetContext.audience}; keep one stable model identity for later derived shots; ${modelAppearanceLine}; ${presetContext.audiencePreset.prompt}`,
        composition: `front view ecommerce model anchor for ${presetContext.channel}; ${poseLine}; product-readable and not rigid. ${cameraLookLine}`,
        lighting: `clean commercial lighting suitable for all later derived shots. ${realismStyleLine}`,
        background: `${presetContext.useCasePreset.prompt}; ${themeMotifLine}; garment-context background elements matched to the clothing category; ${presetContext.channelPreset.prompt}; marketplace-ready background matched to garment use, not over-styled`,
        negatives: negativeLine,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(backId, 0, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-back-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, `${packId}-model-front`]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-back-derived',
        scene: 'back-view model image from front anchor',
        referencePolicy: 'follow structured brief and front model anchor; derive only viewpoint',
        garmentTruth,
        modelPolicy: 'same generated model identity, body proportion, crop, lighting, and styling as front anchor',
        composition: 'back view showing garment back construction, same commercial crop',
        lighting: 'consistent lighting from front anchor',
        background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: negativeLine,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(flatlayId, 1, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'flatlay-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, `${packId}-model-front`]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'front-anchor', layout: 'flatlay' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'flatlay-derived',
        scene: 'flat lay product image from brief and front anchor',
        referencePolicy: 'use structured brief and front anchor to preserve the same garment; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product-only flat lay',
        composition: `${flatlayDisplayLine}; top-down clean flat lay, show all set pieces if the brief describes a set, silhouette, collar, sleeve, hem, print placement and trims readable`,
        lighting: 'even soft light, accurate material and color',
        background: `${flatlayDisplayLine}; light product surface matched to garment use; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no body`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(detailId, 1, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'garment-detail-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, `${packId}-model-front`, `${packId}-flatlay`]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'fabric-trim-print' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'garment-detail-derived',
        scene: 'close-up product detail image',
        referencePolicy: 'use structured brief, front anchor and flatlay anchor as garment truth',
        garmentTruth,
        modelPolicy: 'product detail only',
        composition: 'close-up detail shot showing fabric, trim, seam, print scale, and construction',
        lighting: 'macro-friendly soft light, clear texture',
        background: `minimal product-detail surface matched to garment use; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no material drift, no unreadable texture`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(hangerId, 1, 3, base, baseImageData({
      ...baseImageDefaults,
      role: 'hanger-product-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', layout: 'hanger' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'hanger-product-derived',
        scene: 'hanger product image from structured brief and product anchors',
        referencePolicy: 'follow structured brief and product anchors; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product displayed on a simple hanger or clean hanging setup',
        composition: `${hangerDisplayLine}; front-facing hanging garment, natural drape, collar, sleeve, hem, seams and print readable`,
        lighting: 'soft product lighting, accurate textile folds and color',
        background: `${hangerDisplayLine}; clean wall or use-case product setting; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no mannequin body, no changed silhouette`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(halfId, 2, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-half-detail-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor', crop: 'half-body' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-half-detail-derived',
        scene: 'half-body model detail from structured brief',
        referencePolicy: 'follow structured brief and front anchor; only change crop',
        garmentTruth,
        modelPolicy: `same generated model identity and garment as front anchor; ${presetContext.audiencePreset.prompt}`,
        composition: 'half-body crop showing neckline, chest print, sleeve, trims and fabric behavior',
        lighting: 'consistent commercial lighting from front anchor',
        background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no messy hands, no product-blocking accessories`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(sideId, 2, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-side-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor', view: 'side' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-side-derived',
        scene: 'side model image from front anchor',
        referencePolicy: 'follow structured brief and front model anchor; derive only viewpoint',
        garmentTruth,
        modelPolicy: `same generated model identity and garment; ${presetContext.audiencePreset.prompt}`,
        composition: 'side or three-quarter view showing garment fit volume and side silhouette',
        lighting: 'consistent lighting from front anchor',
        background: `same use-case scene family as the front anchor; ${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no identity drift, no anatomy errors`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(lifestyleId, 1, 3, base, baseImageData({
      ...baseImageDefaults,
      role: 'model-lifestyle-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor', context: 'commerce-lifestyle' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-lifestyle-derived',
        scene: 'commerce lifestyle model image',
        referencePolicy: 'follow structured brief and front anchor; only change context and pose energy',
        garmentTruth,
        modelPolicy: `same generated model identity and garment, safe commercial pose, product readability first; ${presetContext.audiencePreset.prompt}`,
        composition: 'marketplace lifestyle shot with the garment still clear and dominant',
        lighting: 'commercial lifestyle lighting consistent with front anchor color family',
        background: `${presetContext.useCasePreset.prompt}; ${presetContext.channelPreset.prompt}; simple context scene, not crowded, channel fit for ecommerce`,
        negatives: `${negativeLine}, no crowded scene`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(fabricId, 3, 1, base, baseImageData({
      ...baseImageDefaults,
      role: 'fabric-macro-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'fabric-macro' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'fabric-macro-derived',
        scene: 'fabric macro detail from structured brief',
        referencePolicy: 'follow structured brief and flatlay/product anchors as material truth',
        garmentTruth,
        modelPolicy: 'product detail only',
        composition: 'macro fabric texture, weave, stitching, print edge and material weight',
        lighting: 'macro-friendly soft light, accurate color and clear texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no material drift, no fake label text`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(colorId, 3, 2, base, baseImageData({
      ...baseImageDefaults,
      role: 'color-texture-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'color-texture' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'color-texture-derived',
        scene: 'color and texture product shot from structured brief',
        referencePolicy: 'follow structured brief and product anchors for exact colorway and material truth',
        garmentTruth,
        modelPolicy: 'product-only color and texture presentation',
        composition: 'product crop showing accurate colorway, fabric finish, print color and scale',
        lighting: 'clean color-accurate lighting, no color cast',
        background: `neutral ecommerce surface; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no color shift, no over-saturated fabric`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(labelId, 3, 3, base, baseImageData({
      ...baseImageDefaults,
      role: 'label-detail-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'label-trim' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'label-detail-derived',
        scene: 'label and trim detail from structured brief',
        referencePolicy: 'follow structured brief and product anchors; show construction detail without inventing readable text',
        garmentTruth,
        modelPolicy: 'product detail only',
        composition: 'collar, trim, button, zipper, drawcord, hem or label area detail; construction readable',
        lighting: 'clean close-up product lighting, accurate material texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no fake readable label text, no warped trim`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
  ];
  const selectedImageIds = [frontId, backId, flatlayId, detailId, lifestyleId, hangerId, halfId, sideId, fabricId, colorId, labelId]
    .slice(0, clampShotCount(cfg.shotCount, 3, MAX_APPAREL_PACK_SHOTS));
  const selected = new Set(selectedImageIds);
  const qaEnabled = qualityCfg.enabled === true;
  const anchorImageIds = [frontId, flatlayId, hangerId].filter((imageId) => selected.has(imageId));
  const anchorQaId = `${packId}-anchor-quality-qa`;
  const anchorQaNode = qaEnabled && anchorImageIds.length > 0
    ? makeQualityQaNode(anchorQaId, 2, 4, base, {
      mode: 'inspiration',
      imageIds: anchorImageIds,
      references: refs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
      promptOverrides: input.promptOverrides,
      llmModelSettings,
      skillProfile: input.skillProfile,
      anchorOnly: true,
    })
    : null;
  const qaId = `${packId}-quality-qa`;
  const qaNode = qaEnabled
    ? makeQualityQaNode(qaId, 4, 1, base, {
      mode: 'inspiration',
      imageIds: selectedImageIds,
      references: refs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
      promptOverrides: input.promptOverrides,
      llmModelSettings,
      skillProfile: input.skillProfile,
    })
    : null;
  const nodes = [
    allNodes[0],
    ...selectPlanImages(allNodes.slice(1), selectedImageIds),
    ...(anchorQaNode ? [anchorQaNode] : []),
    ...(qaNode ? [qaNode] : []),
  ];
  const edges = [
    ...(input.sourceNodeId ? nodes.map((node) => edge(input.sourceNodeId!, node.id, 'any')) : []),
    edge(`${packId}-llm-brief`, `${packId}-model-front`, 'text'),
    selected.has(backId) ? edge(`${packId}-llm-brief`, backId, 'text') : null,
    selected.has(flatlayId) ? edge(`${packId}-llm-brief`, flatlayId, 'text') : null,
    selected.has(detailId) ? edge(`${packId}-llm-brief`, detailId, 'text') : null,
    selected.has(lifestyleId) ? edge(`${packId}-llm-brief`, lifestyleId, 'text') : null,
    selected.has(hangerId) ? edge(`${packId}-llm-brief`, hangerId, 'text') : null,
    selected.has(halfId) ? edge(`${packId}-llm-brief`, halfId, 'text') : null,
    selected.has(sideId) ? edge(`${packId}-llm-brief`, sideId, 'text') : null,
    selected.has(fabricId) ? edge(`${packId}-llm-brief`, fabricId, 'text') : null,
    selected.has(colorId) ? edge(`${packId}-llm-brief`, colorId, 'text') : null,
    selected.has(labelId) ? edge(`${packId}-llm-brief`, labelId, 'text') : null,
    selected.has(backId) ? edge(frontId, backId, 'image') : null,
    selected.has(flatlayId) ? edge(frontId, flatlayId, 'image') : null,
    selected.has(lifestyleId) ? edge(frontId, lifestyleId, 'image') : null,
    selected.has(hangerId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, hangerId, 'image') : null,
    selected.has(halfId) ? edge(frontId, halfId, 'image') : null,
    selected.has(sideId) ? edge(frontId, sideId, 'image') : null,
    selected.has(fabricId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, fabricId, 'image') : null,
    selected.has(colorId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, colorId, 'image') : null,
    selected.has(labelId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, labelId, 'image') : null,
    selected.has(detailId) ? edge(flatlayId, detailId, 'image') : null,
    ...(anchorQaNode ? anchorImageIds.map((imageId) => edge(imageId, anchorQaId, 'image')) : []),
    ...(qaNode ? selectedImageIds.map((imageId) => edge(imageId, qaId, 'image')) : []),
  ].filter(Boolean) as ApparelPackPlanEdge[];
  const selectedRunIds = [`${packId}-llm-brief`, ...selectedImageIds, ...(anchorQaNode ? [anchorQaId] : []), ...(qaNode ? [qaId] : [])];
  const stageOrder = filterStages([
    [`${packId}-llm-brief`],
    [frontId],
    [flatlayId, hangerId],
    ...(anchorQaNode ? [[anchorQaId]] : []),
    [backId, lifestyleId, halfId, sideId],
    [detailId, fabricId, colorId, labelId],
    ...(qaNode ? [[qaId]] : []),
  ], selectedRunIds);
  const anchorStageOrder = filterStages([
    [`${packId}-llm-brief`],
    [frontId],
    [flatlayId, hangerId],
    ...(anchorQaNode ? [[anchorQaId]] : []),
  ], selectedRunIds);
  const runStages = selectRunStagesForScope(input, stageOrder, anchorStageOrder);
  const withOutput = appendOutputNode({
    packId,
    mode: 'inspiration',
    title: '服装灵感封包输出',
    base,
    nodes,
    edges,
    selectedImageIds,
    qaNodeId: qaNode ? qaId : undefined,
    row: 0,
    col: 4,
  });
  return {
    title: '服装灵感封包',
    goal: 'Plan and generate a consistent apparel package from an LLM brief.',
    summary: {
      mode: 'inspiration',
      imageCount: selectedImageIds.length,
      anchorCount: 1 + (selected.has(flatlayId) ? 1 : 0),
    },
    nodes: withOutput.nodes,
    edges: withOutput.edges,
    runNodeIds: runStages.flat(),
    runStages,
    focusViewport: { x: base.x - 120, y: base.y - 80, zoom: 0.75 },
  };
}

export function buildApparelPackPlan(input: ApparelPackPlanInput): ApparelPackPlan {
  const packId = cleanId(input.packId);
  const base = input.position || DEFAULT_POSITION;
  if (input.mode === 'suite') return buildSuitePlan(input, packId, base);
  if (input.mode === 'garment-reference') return buildGarmentReferencePlan(input, packId, base);
  return buildInspirationPlan(input, packId, base);
}
