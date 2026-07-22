import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  BASE_FARM_DAILY_WATER,
  FARM_ANIMAL_DEFINITIONS,
  FARM_ANIMAL_PRODUCT_DEFINITIONS,
  FARM_BUILDING_DEFINITIONS,
  FARM_CROP_DEFINITIONS,
  FARM_DEFAULT_DECOR_ID,
  FARM_DECOR_DEFINITIONS,
  FARM_FESTIVAL_ORDER_GOLD_MULTIPLIER,
  FARM_FESTIVAL_TASK_ORDER_TARGET,
  FARM_GRID_SIZE,
  FARM_RARE_EVENT_DEFINITIONS,
  FARM_SCARECROW_RADIUS_CELLS,
  FARM_SEASON_DAYS,
  FARM_SEASON_DEFINITIONS,
  FARM_STARTER_DECOR_IDS,
  FARM_STORAGE_BONUS_PER_BUILDING,
  FARM_WATER_PER_WELL,
  MAX_FARM_ANIMALS,
  MAX_FARM_EVENT_LOG,
  MAX_FARM_OBJECTS,
  advanceFarmDay,
  applyFarmTool,
  buildFarmActivityDigest,
  buildFarmActivityFeed,
  buildFarmBeautyRewards,
  buildFarmBeautyScore,
  buildFarmLongTermGoals,
  buildFarmMiniMapMarkers,
  farmMiniMapMarkerMatchesRouteTarget,
  countFarmScarecrowUnprotectedDryCrops,
  buildFarmFocusGoals,
  canCompleteFarmNpcVisit,
  canCompleteFarmOrder,
  completeFarmNpcVisit,
  completeFarmOrder,
  createFarmNpcVisitForDay,
  createFarmRareHarvestEvent,
  createFarmState,
  farmDecorIdForResourceObjectType,
  farmBuildingActivationHint,
  farmDecorActivationHint,
  farmSeasonForDay,
  farmSeasonLabel,
  farmSeasonProgress,
  farmSeasonShortLabel,
  farmToolActionGridKey,
  farmToolSupportsContinuousAction,
  farmWeatherForDay,
  farmWeatherLabel,
  farmWeatherShortLabel,
  formatAnimalProductTotals,
  getActiveFarmFestivalTask,
  getActiveFarmNpcVisit,
  getFarmBuildingEffects,
  getFarmObjectsInViewport,
  isFarmDecorUnlocked,
  placeFarmObject,
  previewFarmPlacement,
  sanitizeFarmCanvasState,
  snapFarmPoint,
} from '../src/utils/farmCanvas.ts';

const require = createRequire(import.meta.url);

function assertIncludesInOrder(source, parts, message = 'expected source fragments to appear in order') {
  let cursor = 0;
  for (const part of parts) {
    const index = source.indexOf(part, cursor);
    assert.notEqual(index, -1, `${message}: missing "${part}"`);
    cursor = index + part.length;
  }
}

function growTurnips(count = 3) {
  let state = createFarmState();
  for (let i = 0; i < count; i += 1) {
    state = applyFarmTool(state, { tool: 'hoe', x: i * FARM_GRID_SIZE, y: 0, id: `plot-${i}` }).state;
    state = applyFarmTool(state, { tool: 'seed', x: i * FARM_GRID_SIZE, y: 0, cropId: 'turnip' }).state;
    state = applyFarmTool(state, { tool: 'water', x: i * FARM_GRID_SIZE, y: 0 }).state;
  }
  state = advanceFarmDay(state);
  for (let i = 0; i < count; i += 1) {
    state = applyFarmTool(state, { tool: 'water', x: i * FARM_GRID_SIZE, y: 0 }).state;
  }
  state = advanceFarmDay(state);
  for (let i = 0; i < count; i += 1) {
    state = applyFarmTool(state, { tool: 'harvest', x: i * FARM_GRID_SIZE, y: 0 }).state;
  }
  return state;
}

test('farm canvas state starts as a sparse flow-coordinate pasture', () => {
  const state = createFarmState();

  assert.equal(state.version, 1);
  assert.equal(state.coordinateMode, 'flow');
  assert.equal(state.gridSize, FARM_GRID_SIZE);
  assert.equal(state.day, 1);
  assert.equal(state.weather, 'sunny');
  assert.equal(state.season, 'spring');
  assert.equal(state.festivalId, undefined);
  assert.equal(state.festivalTasks.length, 0);
  assert.equal(state.npcVisits.length, 1);
  assert.equal(state.npcVisits[0].id, 'npc-visit-1-mira');
  assert.equal(getActiveFarmNpcVisit(state)?.visitorName, '米拉');
  assert.equal(farmWeatherForDay(5), 'rainy');
  assert.equal(farmWeatherForDay(7), 'festival');
  assert.equal(farmWeatherLabel('festival'), '节庆');
  assert.equal(farmWeatherShortLabel('rainy'), '雨');
  assert.equal(FARM_SEASON_DAYS, 28);
  assert.equal(FARM_SEASON_DEFINITIONS.spring.themeLabel, '春日播种');
  assert.equal(farmSeasonForDay(1), 'spring');
  assert.equal(farmSeasonForDay(29), 'summer');
  assert.equal(farmSeasonForDay(57), 'autumn');
  assert.equal(farmSeasonForDay(85), 'winter');
  assert.equal(farmSeasonForDay(113), 'spring');
  assert.equal(farmSeasonLabel('winter'), '冬季');
  assert.equal(farmSeasonShortLabel('summer'), '夏');
  assert.deepEqual(farmSeasonProgress(29), {
    season: 'summer',
    dayInSeason: 1,
    daysTotal: 28,
    nextSeason: 'autumn',
    percent: 4,
  });
  assert.equal(FARM_FESTIVAL_TASK_ORDER_TARGET, 1);
  assert.equal(state.resources.gold, 300);
  assert.equal(state.resources.seeds.turnip, 12);
  assert.equal(state.objects.length, 0);
  assert.equal(state.animals.length, 1);
  assert.equal(state.animals[0].kind, 'chicken');
  assert.equal(state.inventory.animalProducts.egg, undefined);
  assert.equal(FARM_ANIMAL_DEFINITIONS.chicken.productLabel, '鸡蛋');
  assert.equal(FARM_ANIMAL_PRODUCT_DEFINITIONS.milk.label, '牛奶');
  assert.equal(state.orders[0].id, 'tutorial-turnip-order');
  assert.equal(state.rareEvents.length, 0);
  assert.equal(state.eventLog.length, 0);
  assert.equal(state.lastDailySummary, undefined);
  assert.equal(state.stats.rareEventsFound, 0);
  assert.equal(state.stats.buildingsPlaced, 0);
  assert.equal(state.stats.decorPlaced, 0);
  assert.equal(state.selectedBuildingId, 'hut');
  assert.equal(state.selectedDecorId, FARM_DEFAULT_DECOR_ID);
  assert.equal(state.selectedObjectId, undefined);
  assert.ok(FARM_STARTER_DECOR_IDS.includes(FARM_DEFAULT_DECOR_ID));
  assert.deepEqual(snapFarmPoint({ x: 95, y: -95 }), { x: 64, y: -128 });
  assert.deepEqual(snapFarmPoint({ x: 127, y: 127 }), { x: 64, y: 64 });
});

test('farm tools support tilling, planting, watering, advancing days, harvesting, and completing an order', () => {
  let state = growTurnips(3);

  assert.equal(state.day, 3);
  assert.equal(state.inventory.crops.turnip, 3);
  assert.equal(state.stats.plotsTilled, 3);
  assert.equal(state.stats.cropsPlanted, 3);
  assert.equal(state.stats.cropsWatered, 6);
  assert.equal(state.stats.cropsHarvested, 3);
  assert.equal(state.npcVisits.some((visit) => visit.day === 3 && visit.visitorId === 'taro'), true);
  assert.ok(state.discoveredCropIds.includes('turnip'));
  assert.equal(state.eventLog[0].kind, 'crop_harvested');
  assert.ok(state.eventLog.some((event) => event.kind === 'plot_tilled'));
  assert.ok(state.eventLog.some((event) => event.kind === 'day_advanced'));
  assert.ok(state.eventLog.every((event) => !Object.prototype.hasOwnProperty.call(event, 'x')));
  assert.equal(state.lastDailySummary?.fromDay, 2);
  assert.equal(state.lastDailySummary?.toDay, 3);
  assert.equal(state.lastDailySummary?.newMatureCrops, 3);
  assert.equal(state.lastDailySummary?.matureCrops, 3);
  assert.match(state.lastDailySummary?.message || '', /成熟/);

  const result = completeFarmOrder(state, 'tutorial-turnip-order');
  state = result.state;

  assert.equal(result.changed, true);
  assert.equal(result.error, undefined);
  assert.equal(state.inventory.crops.turnip || 0, 0);
  assert.equal(state.resources.gold, 420);
  assert.equal(state.resources.wood, 12);
  assert.equal(state.resources.experience, 30);
  assert.equal(state.stats.ordersCompleted, 1);
  assert.ok(state.unlockedDecorIds.includes('wood-fence'));
  assert.equal(isFarmDecorUnlocked(state, 'wood-fence'), true);
  assert.equal(state.eventLog[0].kind, 'order_completed');
  assert.equal(state.eventLog[0].orderId, 'tutorial-turnip-order');
  assert.equal(state.eventLog[0].amount, 120);
});

test('farm weather waters crops on rainy days and festivals add order gold bonuses', () => {
  let rainyState = createFarmState({ day: 5, weather: 'rainy' });
  rainyState = applyFarmTool(rainyState, { tool: 'hoe', x: 0, y: 0, id: 'rain-plot' }).state;
  rainyState = applyFarmTool(rainyState, { tool: 'seed', x: 0, y: 0, cropId: 'turnip' }).state;

  const rainyNext = advanceFarmDay(rainyState);
  const rainPlot = rainyNext.objects.find((object) => object.id === 'rain-plot');
  assert.equal(rainPlot?.crop?.daysGrown, 1);
  assert.equal(rainPlot?.crop?.dryDays, 0);
  assert.equal(rainyNext.day, 6);
  assert.equal(rainyNext.weather, farmWeatherForDay(6));
  assert.equal(rainyNext.festivalId, undefined);
  assert.equal(rainyNext.lastDailySummary?.weather, 'rainy');
  assert.equal(rainyNext.lastDailySummary?.rainWateredCrops, 1);
  assert.match(rainyNext.lastDailySummary?.message || '', /雨水/);

  const baseGold = 120;
  const festivalBonus = Math.round(baseGold * (FARM_FESTIVAL_ORDER_GOLD_MULTIPLIER - 1));
  let festivalState = sanitizeFarmCanvasState({
    ...growTurnips(3),
    day: 7,
    weather: 'festival',
    festivalId: 'spring-sowing-7',
  });
  const activeTask = getActiveFarmFestivalTask(festivalState);
  assert.equal(activeTask?.title, '春播祭委托');
  assert.equal(activeTask?.kind, 'complete-orders');
  assert.equal(activeTask?.progress, 0);
  assert.equal(activeTask?.target, FARM_FESTIVAL_TASK_ORDER_TARGET);

  const result = completeFarmOrder(festivalState, 'tutorial-turnip-order');
  festivalState = result.state;
  const completedTask = getActiveFarmFestivalTask(festivalState);

  assert.equal(result.changed, true);
  assert.match(result.feedback, /节庆/);
  assert.match(result.feedback, /委托完成/);
  assert.equal(festivalState.resources.gold, 300 + baseGold + festivalBonus);
  assert.equal(festivalState.resources.wood, 15);
  assert.equal(festivalState.resources.experience, 54);
  assert.equal(festivalState.resources.seeds.sunflower, 2);
  assert.equal(completedTask?.completed, true);
  assert.equal(completedTask?.progress, FARM_FESTIVAL_TASK_ORDER_TARGET);
  assert.equal(completedTask?.completedDay, 7);
  assert.equal(festivalState.eventLog[0].amount, baseGold + festivalBonus);
  assert.equal(festivalState.eventLog[0].kind, 'order_completed');

  const festivalNext = advanceFarmDay(festivalState);
  assert.equal(festivalNext.lastDailySummary?.weather, 'festival');
  assert.equal(festivalNext.lastDailySummary?.festivalId, 'spring-sowing-7');
  assert.equal(festivalNext.lastDailySummary?.goldEarned, baseGold + festivalBonus);
  assert.equal(festivalNext.lastDailySummary?.festivalBonusGold, festivalBonus);
  assert.ok(festivalNext.lastDailySummary?.highlights.some((item) => item.includes('节庆订单加成')));
  assert.ok(festivalNext.lastDailySummary?.highlights.some((item) => item.includes('节庆委托完成')));
});

test('farm season kit rotates every 28 days and adds seasonal feedback', () => {
  const day29State = createFarmState({ day: 29 });
  assert.equal(day29State.season, 'summer');
  assert.equal(day29State.weather, farmWeatherForDay(29, 'summer'));

  let state = createFarmState({ day: 28, season: 'spring', weather: farmWeatherForDay(28, 'spring') });
  state = advanceFarmDay(state);

  assert.equal(state.day, 29);
  assert.equal(state.season, 'summer');
  assert.equal(state.weather, farmWeatherForDay(29, 'summer'));
  assert.equal(state.lastDailySummary?.fromDay, 28);
  assert.equal(state.lastDailySummary?.toDay, 29);
  assert.match(state.lastDailySummary?.message || '', /夏季开始了/);
  assert.ok(state.lastDailySummary?.highlights.some((item) => item.includes('换季到夏季')));

  assert.equal(advanceFarmDay(createFarmState({ day: 56, season: 'summer' })).season, 'autumn');
  assert.equal(advanceFarmDay(createFarmState({ day: 84, season: 'autumn' })).season, 'winter');
  assert.equal(advanceFarmDay(createFarmState({ day: 112, season: 'winter' })).season, 'spring');
});

test('farm focus goals recommend the next playable action', () => {
  let state = createFarmState();
  let goals = buildFarmFocusGoals(state, { maxGoals: 3 });

  assert.equal(goals[0].id, 'starter-till');
  assert.equal(goals[0].kind, 'growth');
  assert.deepEqual(goals[0].action, { kind: 'select-tool', tool: 'hoe' });
  assert.equal(goals.some((goal) => goal.id === 'build-board'), true);

  state = applyFarmTool(state, { tool: 'hoe', x: 0, y: 0, id: 'focus-plot' }).state;
  goals = buildFarmFocusGoals(state, { maxGoals: 2 });
  assert.equal(goals[0].id, 'seed-empty-plots');
  assert.deepEqual(goals[0].action, { kind: 'select-tool', tool: 'seed' });

  state = applyFarmTool(state, { tool: 'seed', x: 0, y: 0, cropId: 'turnip' }).state;
  goals = buildFarmFocusGoals(state, { maxGoals: 2 });
  assert.equal(goals[0].id, 'water-today');
  assert.equal(goals[0].kind, 'urgent');
  assert.deepEqual(goals[0].action, { kind: 'select-tool', tool: 'water' });

  let matureState = createFarmState();
  for (let i = 0; i < 3; i += 1) {
    matureState = applyFarmTool(matureState, { tool: 'hoe', x: i * FARM_GRID_SIZE, y: 0, id: `focus-mature-${i}` }).state;
    matureState = applyFarmTool(matureState, { tool: 'seed', x: i * FARM_GRID_SIZE, y: 0, cropId: 'turnip' }).state;
    matureState = applyFarmTool(matureState, { tool: 'water', x: i * FARM_GRID_SIZE, y: 0 }).state;
  }
  matureState = advanceFarmDay(matureState);
  for (let i = 0; i < 3; i += 1) {
    matureState = applyFarmTool(matureState, { tool: 'water', x: i * FARM_GRID_SIZE, y: 0 }).state;
  }
  matureState = advanceFarmDay(matureState);
  goals = buildFarmFocusGoals(matureState, { maxGoals: 2 });
  assert.equal(goals[0].id, 'harvest-ready');
  assert.deepEqual(goals[0].action, { kind: 'jump-mature' });
  assert.equal(goals[0].ready, true);

  const orderGoals = buildFarmFocusGoals(growTurnips(3), { maxGoals: 2 });
  assert.equal(orderGoals[0].id, 'order-tutorial-turnip-order');
  assert.deepEqual(orderGoals[0].action, { kind: 'complete-order', orderId: 'tutorial-turnip-order' });

  const npcState = createFarmState({ inventory: { crops: { turnip: 1 }, animalProducts: {}, decorIds: [] } });
  const npcGoals = buildFarmFocusGoals(npcState, { maxGoals: 2 });
  assert.equal(npcGoals[0].id, 'npc-npc-visit-1-mira');
  assert.equal(npcGoals[0].kind, 'social');
  assert.deepEqual(npcGoals[0].action, { kind: 'complete-npc', visitId: 'npc-visit-1-mira' });

  const scarecrowRiskState = createFarmState({
    resources: { gold: 90, wood: 8, stone: 6, water: 0, seeds: { turnip: 0 } },
    stats: { plotsTilled: 3, cropsPlanted: 1, cropsWatered: 0, cropsHarvested: 0, ordersCompleted: 0, npcVisitsCompleted: 0, rareEventsFound: 0, objectsPlaced: 0, buildingsPlaced: 0, decorPlaced: 0, daysAdvanced: 0 },
    objects: [
      {
        id: 'focus-dry-risk',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 1, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'focus-dry-risk-watered',
        kind: 'plot',
        x: FARM_GRID_SIZE,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: true, dryDays: 1, stage: 'seed' },
        createdDay: 1,
      },
    ],
  });
  const scarecrowGoals = buildFarmFocusGoals(scarecrowRiskState, { maxGoals: 4 });
  const scarecrowGoal = scarecrowGoals.find((goal) => goal.id === 'build-scarecrow-protection');
  assert.ok(scarecrowGoal);
  assert.equal(scarecrowGoal.kind, 'build');
  assert.match(scarecrowGoal.title, /稻草人/);
  assert.match(scarecrowGoal.detail, /1 块缺水作物/);
  assert.deepEqual(scarecrowGoal.action, { kind: 'select-building', buildingId: 'scarecrow' });
});

test('farm animals produce daily goods and report them in summaries', () => {
  const state = createFarmState({
    animals: [
      { id: 'hen-1', kind: 'chicken', name: '小啾', mood: 'calm', placedDay: 1, productCount: 0 },
      { id: 'cow-1', kind: 'cow', name: '奶泡', mood: 'calm', placedDay: 1, productCount: 0 },
      { id: 'sheep-1', kind: 'sheep', name: '云朵', mood: 'calm', placedDay: 1, productCount: 0 },
    ],
    inventory: {
      crops: {},
      animalProducts: { egg: 2 },
      decorIds: [],
    },
  });

  const next = advanceFarmDay(state);
  assert.equal(next.inventory.animalProducts.egg, 3);
  assert.equal(next.inventory.animalProducts.milk, 1);
  assert.equal(next.inventory.animalProducts.wool, 1);
  assert.equal(formatAnimalProductTotals(next.inventory.animalProducts), '鸡蛋 x3 / 牛奶 x1 / 羊毛 x1');
  assert.equal(next.animals[0].lastProducedDay, 1);
  assert.equal(next.animals[1].lastProducedDay, 1);
  assert.equal(next.animals[2].productCount, 1);
  assert.equal(next.animals.every((animal) => animal.mood === 'happy'), true);
  assert.equal(next.lastDailySummary?.animalProductsProduced, 3);
  assert.equal(next.lastDailySummary?.animalProductSummary, '鸡蛋 x1 / 牛奶 x1 / 羊毛 x1');
  assert.ok(next.lastDailySummary?.highlights.some((item) => item.includes('动物产出')));
  assert.match(next.lastDailySummary?.message || '', /动物小屋|第 2 天/);
});

test('farm npc visits rotate daily, consume requested goods, and report completion', () => {
  let cropState = createFarmState({
    inventory: {
      crops: { turnip: 1 },
      animalProducts: {},
      decorIds: [],
    },
  });
  const cropVisit = getActiveFarmNpcVisit(cropState);
  assert.equal(cropVisit?.id, createFarmNpcVisitForDay(1).id);
  assert.equal(cropVisit?.visitorId, 'mira');
  assert.equal(cropVisit?.requestKind, 'crop');
  assert.equal(cropVisit?.cropId, 'turnip');
  assert.equal(canCompleteFarmNpcVisit(cropState, cropVisit?.id || ''), true);

  const cropResult = completeFarmNpcVisit(cropState, cropVisit?.id || '');
  cropState = cropResult.state;
  assert.equal(cropResult.changed, true);
  assert.equal(cropResult.error, undefined);
  assert.equal(cropState.inventory.crops.turnip || 0, 0);
  assert.equal(cropState.resources.gold, 336);
  assert.equal(cropState.resources.experience, 8);
  assert.equal(cropState.resources.seeds.potato, 1);
  assert.equal(cropState.stats.npcVisitsCompleted, 1);
  assert.equal(cropState.npcVisits[0].completed, true);
  assert.equal(cropState.npcVisits[0].completedDay, 1);
  assert.equal(cropState.eventLog[0].kind, 'npc_request_completed');
  assert.equal(cropState.eventLog[0].npcVisitId, cropVisit?.id);
  assert.equal(canCompleteFarmNpcVisit(cropState, cropVisit?.id || ''), false);

  const summarized = advanceFarmDay(cropState);
  assert.equal(summarized.lastDailySummary?.npcVisitsCompleted, 1);
  assert.ok(summarized.lastDailySummary?.highlights.some((item) => item.includes('来访委托')));
  assert.match(summarized.lastDailySummary?.message || '', /村民来访/);
  assert.equal(getActiveFarmNpcVisit(summarized)?.day, 2);

  const animalVisit = createFarmNpcVisitForDay(3);
  let animalState = createFarmState({
    day: 3,
    inventory: {
      crops: {},
      animalProducts: { egg: 1 },
      decorIds: [],
    },
  });
  assert.equal(animalVisit.visitorId, 'taro');
  assert.equal(getActiveFarmNpcVisit(animalState)?.animalProductId, 'egg');
  const animalResult = completeFarmNpcVisit(animalState, animalVisit.id);
  animalState = animalResult.state;
  assert.equal(animalResult.changed, true);
  assert.equal(animalState.inventory.animalProducts.egg || 0, 0);
  assert.equal(animalState.resources.gold, 348);
  assert.equal(animalState.resources.wood, 10);
  assert.equal(animalState.resources.experience, 10);
  assert.equal(animalState.eventLog[0].npcVisitId, animalVisit.id);
});

test('farm minimap markers summarize mature crops, dry crops, buildings, paths, and ready orders', () => {
  const state = createFarmState({
    resources: { gold: 999, wood: 999, stone: 999, water: 12, experience: 0, seeds: { turnip: 12 } },
    inventory: { crops: { turnip: 3 }, decorIds: [] },
    objects: [
      {
        id: 'plot-mature',
        kind: 'plot',
        x: -FARM_GRID_SIZE,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 2, wateredToday: false, dryDays: 0, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'plot-dry',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 1, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'plot-withered',
        kind: 'plot',
        x: FARM_GRID_SIZE,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 3, stage: 'withered' },
        createdDay: 1,
      },
      { id: 'board', kind: 'building', buildingId: 'board', x: FARM_GRID_SIZE * 2, y: 0, widthCells: 2, heightCells: 1, createdDay: 1 },
      { id: 'hut', kind: 'building', buildingId: 'hut', x: FARM_GRID_SIZE * 5, y: 0, widthCells: 3, heightCells: 3, createdDay: 1 },
      { id: 'path', kind: 'decor', decorId: 'stone-path', x: FARM_GRID_SIZE * 9, y: 0, widthCells: 1, heightCells: 1, createdDay: 1 },
      { id: 'tile', kind: 'decor', decorId: 'resource-tile', objectType: 'tile', x: FARM_GRID_SIZE * 10, y: 0, widthCells: 1, heightCells: 1, createdDay: 1 },
    ],
  });

  assert.equal(canCompleteFarmOrder(state, 'tutorial-turnip-order'), true);

  const markers = buildFarmMiniMapMarkers(state);
  const kinds = markers.map((marker) => marker.kind);
  assert.deepEqual(kinds.slice(0, 3), ['order', 'npc', 'mature']);
  assert.ok(kinds.includes('building'));
  assert.ok(kinds.includes('animal'));
  assert.ok(kinds.includes('path'));
  assert.ok(kinds.includes('withered'));
  assert.equal(markers.find((marker) => marker.kind === 'order')?.objectId, 'board');
  assert.equal(markers.find((marker) => marker.kind === 'npc')?.npcVisitId, 'npc-visit-1-mira');
  assert.equal(markers.find((marker) => marker.kind === 'npc')?.visitorId, 'mira');
  assert.equal(markers.find((marker) => marker.kind === 'animal')?.animalId, 'starter-chicken');
  assert.equal(markers.find((marker) => marker.kind === 'order')?.orderId, 'tutorial-turnip-order');
  assert.match(markers.find((marker) => marker.kind === 'mature')?.label || '', /成熟/);
  assert.match(markers.find((marker) => marker.kind === 'dry')?.label || '', /待浇水/);
  assert.match(markers.find((marker) => marker.kind === 'withered')?.label || '', /枯萎/);
  assert.equal(markers.find((marker) => marker.kind === 'mature')?.routeTargets?.includes('mature-crop'), true);
  assert.equal(markers.find((marker) => marker.kind === 'dry')?.routeTargets?.includes('water'), true);
  assert.equal(markers.find((marker) => marker.kind === 'withered')?.routeTargets?.includes('withered-crop'), true);
  assert.equal(markers.find((marker) => marker.kind === 'order')?.routeTargets?.includes('ready-order'), true);
  assert.equal(markers.find((marker) => marker.kind === 'npc')?.routeTargets?.includes('ready-npc'), true);
  assert.equal(markers.find((marker) => marker.objectId === 'hut')?.routeTargets?.includes('day'), true);
  assert.equal(markers.find((marker) => marker.objectId === 'path')?.routeTargets?.includes('beauty'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(markers.find((marker) => marker.kind === 'mature'), 'mature-crop'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(markers.find((marker) => marker.kind === 'dry'), 'water'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(markers.find((marker) => marker.kind === 'withered'), 'withered-crop'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(markers.find((marker) => marker.kind === 'order'), 'ready-order'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(markers.find((marker) => marker.kind === 'npc'), 'ready-npc'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(markers.find((marker) => marker.objectId === 'hut'), 'day'), true);

  const limited = buildFarmMiniMapMarkers(state, { maxMarkers: 3 });
  assert.deepEqual(limited.map((marker) => marker.kind), ['order', 'npc', 'mature']);

  const denseObjects = [
    {
      id: 'dense-mature',
      kind: 'plot',
      x: -FARM_GRID_SIZE * 2,
      y: 0,
      widthCells: 1,
      heightCells: 1,
      crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 2, wateredToday: false, dryDays: 0, stage: 'seed' },
      createdDay: 1,
    },
    ...Array.from({ length: 620 }, (_, index) => ({
      id: `dense-path-${index}`,
      kind: 'decor',
      decorId: 'stone-path',
      x: (index % 40) * FARM_GRID_SIZE,
      y: Math.floor(index / 40) * FARM_GRID_SIZE,
      widthCells: 1,
      heightCells: 1,
      createdDay: 1,
    })),
  ];
  const denseState = createFarmState({ objects: denseObjects, animals: [] });
  const denseMarkers = buildFarmMiniMapMarkers(denseState, { maxMarkers: 24 });
  const clusterMarker = denseMarkers.find((marker) => marker.kind === 'cluster');
  assert.ok(denseMarkers.length <= 24);
  assert.ok(denseMarkers.some((marker) => marker.kind === 'mature'));
  assert.ok(clusterMarker);
  assert.ok((clusterMarker.clusterCount || 0) > 1);
  assert.ok(clusterMarker.clusterKinds?.includes('path'));
  assert.ok(clusterMarker.routeTargets?.includes('beauty'));
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(clusterMarker, 'beauty'), true);
  assert.match(clusterMarker.label, /道路标记 x/);

  const completedState = completeFarmOrder(state, 'tutorial-turnip-order').state;
  assert.equal(canCompleteFarmOrder(completedState, 'tutorial-turnip-order'), false);
  assert.equal(buildFarmMiniMapMarkers(completedState).some((marker) => marker.kind === 'order'), false);
});

test('farm rare harvest events reward overgrown crops and surface star markers', () => {
  const state = createFarmState({
    resources: { gold: 300, wood: 8, stone: 6, water: 12, experience: 0, seeds: { turnip: 12 } },
    objects: [
      {
        id: 'giant-plot',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 4, wateredToday: false, dryDays: 0, stage: 'mature' },
        createdDay: 1,
      },
      { id: 'board', kind: 'building', buildingId: 'board', x: FARM_GRID_SIZE * 2, y: 0, widthCells: 2, heightCells: 1, createdDay: 1 },
    ],
  });
  const rarePreview = createFarmRareHarvestEvent(state, state.objects[0], state.objects[0].crop);
  assert.equal(rarePreview?.eventId, 'giant-turnip');

  const result = applyFarmTool(state, { tool: 'harvest', x: 0, y: 0 });
  assert.equal(result.changed, true);
  assert.match(result.feedback || '', /巨大萝卜/);
  assert.equal(result.state.inventory.crops.turnip, 1);
  assert.equal(result.state.resources.gold, 300 + FARM_RARE_EVENT_DEFINITIONS['giant-turnip'].rewards.gold);
  assert.equal(result.state.resources.experience, FARM_RARE_EVENT_DEFINITIONS['giant-turnip'].rewards.experience);
  assert.equal(result.state.resources.seeds.turnip, 14);
  assert.equal(result.state.stats.cropsHarvested, 1);
  assert.equal(result.state.stats.rareEventsFound, 1);
  assert.equal(result.state.rareEvents.length, 1);
  assert.equal(result.state.rareEvents[0].eventId, 'giant-turnip');
  assert.equal(result.state.eventLog[0].kind, 'rare_event');
  assert.equal(result.state.eventLog[0].rareEventId, result.state.rareEvents[0].id);
  assert.equal(result.state.eventLog[1].kind, 'crop_harvested');

  const markers = buildFarmMiniMapMarkers(result.state);
  const rareMarker = markers.find((marker) => marker.kind === 'rare');
  assert.equal(rareMarker?.rareEventId, result.state.rareEvents[0].id);
  assert.match(rareMarker?.label || '', /巨大萝卜/);
  assert.equal(rareMarker?.routeTargets?.includes('rare-event'), true);
  assert.equal(farmMiniMapMarkerMatchesRouteTarget(rareMarker, 'rare-event'), true);

  const next = advanceFarmDay(result.state);
  assert.equal(next.lastDailySummary?.rareEventsFound, 1);
  assert.match(next.lastDailySummary?.rareEventSummary || '', /巨大萝卜/);
  assert.ok(next.lastDailySummary?.highlights.some((item) => item.includes('惊喜')));
});

test('farm day advance produces a compact daily summary without storing coordinates', () => {
  let state = createFarmState();
  state = applyFarmTool(state, { tool: 'hoe', x: 0, y: 0, id: 'summary-plot' }).state;
  state = applyFarmTool(state, { tool: 'seed', x: 0, y: 0, cropId: 'turnip' }).state;
  state = applyFarmTool(state, { tool: 'water', x: 0, y: 0 }).state;

  state = advanceFarmDay(state);
  assert.equal(state.lastDailySummary?.fromDay, 1);
  assert.equal(state.lastDailySummary?.toDay, 2);
  assert.equal(state.lastDailySummary?.wateredCrops, 1);
  assert.equal(state.lastDailySummary?.newMatureCrops, 0);
  assert.equal(state.lastDailySummary?.nextMatureCrops, 1);
  assert.equal(state.lastDailySummary?.readyOrders, 0);
  assert.equal(state.lastDailySummary?.readyNpcVisits, 0);
  assert.equal(state.lastDailySummary?.dailyWaterCapacity, BASE_FARM_DAILY_WATER);
  assert.ok(state.lastDailySummary?.highlights.some((item) => item.includes('预计明天 1 块作物可成熟')));
  assert.equal(Object.prototype.hasOwnProperty.call(state.lastDailySummary, 'x'), false);
  assert.equal(state.eventLog[0].message, state.lastDailySummary?.message);

  state = applyFarmTool(state, { tool: 'water', x: 0, y: 0 }).state;
  state = advanceFarmDay(state);
  assert.equal(state.lastDailySummary?.fromDay, 2);
  assert.equal(state.lastDailySummary?.toDay, 3);
  assert.equal(state.lastDailySummary?.newMatureCrops, 1);
  assert.equal(state.lastDailySummary?.matureCrops, 1);
  assert.ok(state.lastDailySummary?.highlights.some((item) => item.includes('成熟')));

  const readyOrderState = advanceFarmDay(createFarmState({
    inventory: { crops: { turnip: 3 } },
    objects: [
      {
        id: 'dry-summary-plot',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'potato', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 1, stage: 'seed' },
        createdDay: 1,
      },
      { id: 'summary-board', kind: 'building', buildingId: 'board', x: FARM_GRID_SIZE * 2, y: 0, widthCells: 2, heightCells: 1, createdDay: 1 },
      { id: 'summary-well', kind: 'building', buildingId: 'well', x: FARM_GRID_SIZE * 5, y: 0, widthCells: 2, heightCells: 2, createdDay: 1 },
    ],
  }));
  assert.equal(readyOrderState.lastDailySummary?.readyOrders, 1);
  assert.equal(readyOrderState.lastDailySummary?.dryCrops, 1);
  assert.equal(readyOrderState.lastDailySummary?.dailyWaterCapacity, BASE_FARM_DAILY_WATER + FARM_WATER_PER_WELL);
  assert.ok(readyOrderState.lastDailySummary?.highlights.some((item) => item.includes('今日还有 1 块地缺水')));
  assert.ok(readyOrderState.lastDailySummary?.highlights.some((item) => item.includes('可交付订单 1 个')));
  assert.ok(readyOrderState.lastDailySummary?.highlights.some((item) => item.includes('水井补水')));

  const witheredSummaryState = advanceFarmDay(createFarmState({
    objects: [
      {
        id: 'withered-summary-plot',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 4, wateredToday: false, dryDays: 3, stage: 'withered' },
        createdDay: 1,
      },
    ],
  }));
  assert.equal(witheredSummaryState.lastDailySummary?.witheredCrops, 1);
  assert.match(witheredSummaryState.lastDailySummary?.message || '', /枯萎/);
  assert.ok(witheredSummaryState.lastDailySummary?.highlights.some((item) => item.includes('枯萎')));

  const scarecrowSummaryState = advanceFarmDay(createFarmState({
    objects: [
      {
        id: 'scarecrow-protected-plot',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 2, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'scarecrow-far-plot',
        kind: 'plot',
        x: FARM_GRID_SIZE * (FARM_SCARECROW_RADIUS_CELLS + 4),
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 2, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'summary-scarecrow',
        kind: 'building',
        buildingId: 'scarecrow',
        x: FARM_GRID_SIZE,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        createdDay: 1,
      },
    ],
  }));
  const protectedPlot = scarecrowSummaryState.objects.find((object) => object.id === 'scarecrow-protected-plot');
  const farPlot = scarecrowSummaryState.objects.find((object) => object.id === 'scarecrow-far-plot');
  assert.equal(protectedPlot?.crop?.dryDays, 2);
  assert.notEqual(protectedPlot?.crop?.stage, 'withered');
  assert.equal(farPlot?.crop?.dryDays, 3);
  assert.equal(farPlot?.crop?.stage, 'withered');
  assert.equal(scarecrowSummaryState.lastDailySummary?.scarecrowProtectedCrops, 1);
  assert.ok(scarecrowSummaryState.lastDailySummary?.highlights.some((item) => item.includes('稻草人守护 1 块地')));
});

test('farm scarecrow risk count only includes unprotected dry crops', () => {
  const state = createFarmState({
    weather: 'sunny',
    objects: [
      {
        id: 'plot-protected',
        kind: 'plot',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 1, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'plot-risk',
        kind: 'plot',
        x: FARM_GRID_SIZE * 12,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 2, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'plot-watered',
        kind: 'plot',
        x: FARM_GRID_SIZE * 13,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: true, dryDays: 2, stage: 'seed' },
        createdDay: 1,
      },
      {
        id: 'plot-withered',
        kind: 'plot',
        x: FARM_GRID_SIZE * 14,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        crop: { cropId: 'turnip', plantedDay: 1, daysGrown: 1, wateredToday: false, dryDays: 4, stage: 'withered' },
        createdDay: 1,
      },
      {
        id: 'scarecrow',
        kind: 'building',
        buildingId: 'scarecrow',
        x: FARM_GRID_SIZE * 2,
        y: 0,
        widthCells: 1,
        heightCells: 2,
        createdDay: 1,
      },
    ],
  });

  assert.equal(countFarmScarecrowUnprotectedDryCrops(state), 1);
  assert.equal(countFarmScarecrowUnprotectedDryCrops({ ...state, weather: 'rainy' }), 0);
});

test('farm activity feed summarizes recent safe feedback for the HUD', () => {
  const state = createFarmState({
    day: 3,
    inventory: { crops: { turnip: 3 } },
    eventLog: [
      {
        id: 'unsafe-rare',
        kind: 'rare_event',
        day: 3,
        message: 'prompt: hidden https://example.com/rare.png data:image/png;base64,abc C:\\Users\\Secret\\rare.png 巨大萝卜',
        amount: 40,
        cropId: 'turnip',
        rareEventId: 'rare-event-3-giant-turnip-plot',
        createdAt: 300004,
      },
      {
        id: 'order',
        kind: 'order_completed',
        day: 3,
        message: '订单完成 +120金',
        amount: 120,
        orderId: 'tutorial-turnip-order',
        createdAt: 300003,
      },
      {
        id: 'water',
        kind: 'crop_watered',
        day: 3,
        message: '已浇水',
        amount: 1,
        cropId: 'turnip',
        createdAt: 300002,
      },
      {
        id: 'old',
        kind: 'plot_tilled',
        day: 2,
        message: '+1 已开垦',
        amount: 1,
        objectKind: 'plot',
        createdAt: 200001,
      },
    ],
  });

  const feed = buildFarmActivityFeed(state, { maxItems: 3 });
  assert.equal(feed.items.length, 3);
  assert.equal(feed.todayTotal, 3);
  assert.equal(feed.todayRewardTotal, 2);
  assert.match(feed.summary, /今日 3 条记录/);
  assert.equal(feed.items[0].kind, 'rare_event');
  assert.equal(feed.items[0].title, '发现惊喜');
  assert.equal(feed.items[0].tagLabel, '星');
  assert.equal(feed.items[0].tone, 'rare');
  assert.equal(feed.items[0].amountLabel, '+40');
  assert.equal(feed.items[0].rewardLabel, '惊喜奖励');
  assert.equal(feed.items[0].detail.includes('example.com'), false);
  assert.equal(feed.items[0].detail.includes('data:image'), false);
  assert.equal(feed.items[0].detail.includes('Secret'), false);
  assert.equal(feed.items[0].detail.includes('prompt:'), false);
  assert.equal(feed.items[1].tone, 'quest');
  assert.equal(feed.items[1].rewardLabel, '订单奖励');
  assert.equal(feed.items[2].tone, 'water');
  assert.equal(feed.items[2].rewardLabel, undefined);

  const digest = buildFarmActivityDigest(state);
  assert.equal(digest.todayTotal, 3);
  assert.equal(digest.todayRewardTotal, 2);
  assert.equal(digest.target, 6);
  assert.equal(digest.percent, 50);
  assert.equal(digest.tone, 'reward');
  assert.match(digest.badgeLabel, /丰收 \+2/);
  assert.equal(digest.rewardStreak, 2);
  assert.equal(digest.rewardStreakLabel, '连击 x2');
  assert.match(digest.rewardStreakHint || '', /连续正反馈 2 次/);
  assert.equal(digest.rewardStreakTier, 'sprout');
  assert.match(digest.rewardStreakMilestoneLabel || '', /再来 1 次正反馈/);
  assert.equal(digest.rewardStreakMilestoneTarget, 3);
  assert.equal(digest.rewardStreakMilestonePercent, 67);
  assert.equal(digest.rewardStreakMilestoneProgressLabel, '2/3');
  assert.equal(digest.rewardStreakMilestoneCompletionLabel, undefined);
  assert.equal(digest.rewardStreakMilestoneRewardLabel, undefined);
  assert.equal(digest.rewardStreakMilestoneRewardItems, undefined);
  assert.equal(digest.rewardStreakActionKind, 'order');
  assert.equal(digest.rewardStreakActionShortLabel, '去交单');
  assert.match(digest.rewardStreakActionLabel || '', /交付订单/);
  assert.deepEqual(digest.rewardStreakAction, { kind: 'complete-order', orderId: 'tutorial-turnip-order' });
  assert.equal(digest.rewardStreakChestState, 'warming');
  assert.equal(digest.rewardStreakChestTier, 'sprout');
  assert.match(digest.rewardStreakChestLabel || '', /丰收宝箱预热/);
  assert.equal(digest.rewardStreakChestShortLabel, '宝箱热');
  assert.equal(digest.rewardStreakChestProgressLabel, '2/3');
  assert.match(digest.rewardStreakChestRewardLabel || '', /丰收连击徽章/);
  assert.equal(digest.rewardStreakChestPercent, 67);
  assert.equal(digest.rewardStreakChestMeterLabel, '宝箱蓄能 2/3');
  assert.equal(digest.rewardStreakChestChargeLabel, '给宝箱蓄能');
  assert.match(digest.rewardStreakChestChargeHint || '', /执行连击建议/);
  assert.match(digest.headline, /今天已有 3 条农活，2 次正反馈/);
  assert.match(digest.nextHint, /再完成 3 次农活/);
  assert.ok(digest.chips.some((chip) => chip.id === 'rare_event' && chip.label === '发现惊喜' && chip.tone === 'rare'));
  assert.ok(digest.chips.some((chip) => chip.id === 'order_completed' && chip.label === '订单完成' && chip.tone === 'quest'));

  const firstRewardDigest = buildFarmActivityDigest(createFarmState({
    day: 4,
    inventory: { crops: {}, animalProducts: {}, decorIds: [] },
    orders: [],
    npcVisits: [],
    eventLog: [
      {
        id: 'first-harvest',
        kind: 'crop_harvested',
        day: 4,
        message: '收获萝卜 +1',
        amount: 1,
        cropId: 'turnip',
        createdAt: 400001,
      },
    ],
  }));
  assert.equal(firstRewardDigest.rewardStreak, 1);
  assert.equal(firstRewardDigest.rewardStreakLabel, '连击苗头');
  assert.match(firstRewardDigest.rewardStreakHint || '', /再来一次/);
  assert.equal(firstRewardDigest.rewardStreakTier, 'sprout');
  assert.equal(firstRewardDigest.rewardStreakMilestoneLabel, '再来 1 次正反馈，开启今日连击。');
  assert.equal(firstRewardDigest.rewardStreakMilestoneTarget, 2);
  assert.equal(firstRewardDigest.rewardStreakMilestonePercent, 50);
  assert.equal(firstRewardDigest.rewardStreakMilestoneProgressLabel, '1/2');
  assert.equal(firstRewardDigest.rewardStreakActionKind, 'harvest');
  assert.equal(firstRewardDigest.rewardStreakActionShortLabel, '再来一次');
  assert.match(firstRewardDigest.rewardStreakActionLabel || '', /开启今日连击/);
  assert.deepEqual(firstRewardDigest.rewardStreakAction, { kind: 'select-decor', decorId: FARM_DEFAULT_DECOR_ID });
  assert.equal(firstRewardDigest.rewardStreakChestState, 'warming');
  assert.equal(firstRewardDigest.rewardStreakChestTier, 'sprout');
  assert.match(firstRewardDigest.rewardStreakChestLabel || '', /连击宝箱萌芽/);
  assert.equal(firstRewardDigest.rewardStreakChestShortLabel, '宝箱芽');
  assert.equal(firstRewardDigest.rewardStreakChestProgressLabel, '1/2');
  assert.match(firstRewardDigest.rewardStreakChestRewardLabel || '', /下一步行动/);
  assert.equal(firstRewardDigest.rewardStreakChestPercent, 50);
  assert.equal(firstRewardDigest.rewardStreakChestMeterLabel, '宝箱蓄能 1/2');
  assert.equal(firstRewardDigest.rewardStreakChestRemaining, 1);
  assert.equal(firstRewardDigest.rewardStreakChestRemainingLabel, '还差 1 次点亮宝箱');
  assert.equal(firstRewardDigest.rewardStreakChestTrailLabel, '宝箱路线：宝箱萌芽 1/2 · 丰收预热 2/3 · 节庆点亮 5/5');
  assert.equal(firstRewardDigest.rewardStreakChestTrailRewardLabel, '路线奖励：连击提示 -> 丰收徽章 -> 节庆三件套');
  assert.deepEqual(firstRewardDigest.rewardStreakChestTrailItems, [
    { tier: 'sprout', label: '宝箱萌芽', progressLabel: '1/2', state: 'active', rewardLabel: '奖励：今日连击提示和下一步行动。', shortRewardLabel: '连击提示' },
    { tier: 'harvest', label: '丰收预热', progressLabel: '2/3', state: 'next', rewardLabel: '奖励：丰收连击徽章和奖励印章苗头。', shortRewardLabel: '丰收徽章' },
    { tier: 'festival', label: '节庆点亮', progressLabel: '5/5', state: 'next', rewardLabel: '奖励：高光手账、订单气氛、美化收益。', shortRewardLabel: '节庆三件套' },
  ]);
  assert.equal(firstRewardDigest.rewardStreakChestActiveTrailLabel, '当前阶段：宝箱萌芽 1/2');
  assert.equal(firstRewardDigest.rewardStreakChestActiveRewardLabel, '当前奖励：连击提示');
  assert.equal(firstRewardDigest.rewardStreakChestActiveHint, '当前冲刺：连击提示，还差 1 次点亮宝箱。');
  assert.equal(firstRewardDigest.rewardStreakChestNextRewardLabel, '下一段：丰收徽章');
  assert.equal(firstRewardDigest.rewardStreakChestChargeLabel, '给宝箱蓄能');
  assert.equal(firstRewardDigest.rewardStreakChestChargeShortLabel, '蓄能');

  const harvestDigest = buildFarmActivityDigest(createFarmState({
    day: 5,
    eventLog: [
      { id: 'reward-2', kind: 'npc_request_completed', day: 5, message: '完成来访', createdAt: 500002 },
      { id: 'reward-1', kind: 'crop_harvested', day: 5, message: '收获萝卜', createdAt: 500001 },
    ],
  }));
  assert.equal(harvestDigest.rewardStreak, 2);
  assert.equal(harvestDigest.rewardStreakChestActiveTrailLabel, '当前阶段：丰收预热 2/3');
  assert.equal(harvestDigest.rewardStreakChestActiveRewardLabel, '当前奖励：丰收徽章');
  assert.equal(harvestDigest.rewardStreakChestActiveHint, '当前冲刺：丰收徽章，还差 1 次点亮宝箱。');
  assert.equal(harvestDigest.rewardStreakChestNextRewardLabel, '下一段：节庆三件套');

  const emptyDigest = buildFarmActivityDigest(createFarmState({ day: 8, eventLog: [] }));
  assert.equal(emptyDigest.todayTotal, 0);
  assert.equal(emptyDigest.percent, 0);
  assert.equal(emptyDigest.rewardStreak, 0);
  assert.equal(emptyDigest.rewardStreakLabel, undefined);
  assert.equal(emptyDigest.rewardStreakHint, undefined);
  assert.equal(emptyDigest.rewardStreakTier, undefined);
  assert.equal(emptyDigest.rewardStreakMilestoneLabel, undefined);
  assert.equal(emptyDigest.rewardStreakMilestoneTarget, undefined);
  assert.equal(emptyDigest.rewardStreakMilestonePercent, undefined);
  assert.equal(emptyDigest.rewardStreakMilestoneProgressLabel, undefined);
  assert.equal(emptyDigest.rewardStreakMilestoneCompletionLabel, undefined);
  assert.equal(emptyDigest.rewardStreakMilestoneRewardLabel, undefined);
  assert.equal(emptyDigest.rewardStreakMilestoneRewardItems, undefined);
  assert.equal(emptyDigest.rewardStreakActionKind, undefined);
  assert.equal(emptyDigest.rewardStreakActionShortLabel, undefined);
  assert.equal(emptyDigest.rewardStreakActionLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestState, undefined);
  assert.equal(emptyDigest.rewardStreakChestTier, undefined);
  assert.equal(emptyDigest.rewardStreakChestLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestShortLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestProgressLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestRewardLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestCtaLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestClaimLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestNextLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestRewardItems, undefined);
  assert.equal(emptyDigest.rewardStreakChestBurstLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestOpenedSummaryLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestPercent, undefined);
  assert.equal(emptyDigest.rewardStreakChestMeterLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestRemaining, undefined);
  assert.equal(emptyDigest.rewardStreakChestRemainingLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestTrailLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestTrailRewardLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestTrailItems, undefined);
  assert.equal(emptyDigest.rewardStreakChestActiveTrailLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestActiveRewardLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestActiveHint, undefined);
  assert.equal(emptyDigest.rewardStreakChestNextRewardLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestChargeLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestChargeShortLabel, undefined);
  assert.equal(emptyDigest.rewardStreakChestChargeHint, undefined);
  assert.equal(emptyDigest.tone, 'quiet');
  assert.match(emptyDigest.nextHint, /成果条会马上点亮/);

  const festivalDigest = buildFarmActivityDigest(createFarmState({
    day: 9,
    eventLog: [
      { id: 'rare-5', kind: 'rare_event', day: 9, message: '发现惊喜', createdAt: 900005 },
      { id: 'npc-4', kind: 'npc_request_completed', day: 9, message: '完成来访委托', createdAt: 900004 },
      { id: 'decor-3', kind: 'decor_placed', day: 9, message: '放置装饰', createdAt: 900003 },
      { id: 'build-2', kind: 'building_placed', day: 9, message: '盖好小屋', createdAt: 900002 },
      { id: 'order-1', kind: 'order_completed', day: 9, message: '订单完成', createdAt: 900001 },
    ],
  }));
  assert.equal(festivalDigest.rewardStreak, 5);
  assert.equal(festivalDigest.rewardStreakTier, 'festival');
  assert.match(festivalDigest.rewardStreakMilestoneLabel || '', /节庆连击已点亮/);
  assert.equal(festivalDigest.rewardStreakMilestoneTarget, 5);
  assert.equal(festivalDigest.rewardStreakMilestonePercent, 100);
  assert.equal(festivalDigest.rewardStreakMilestoneProgressLabel, '5/5');
  assert.match(festivalDigest.rewardStreakMilestoneCompletionLabel || '', /节庆连击奖励已点亮/);
  assert.match(festivalDigest.rewardStreakMilestoneRewardLabel || '', /节庆奖励/);
  assert.match(festivalDigest.rewardStreakMilestoneRewardLabel || '', /高光/);
  assert.deepEqual(festivalDigest.rewardStreakMilestoneRewardItems, ['高光手账', '订单气氛', '美化收益']);
  assert.equal(festivalDigest.rewardStreakActionKind, 'festival');
  assert.equal(festivalDigest.rewardStreakActionShortLabel, '守连击');
  assert.match(festivalDigest.rewardStreakActionLabel || '', /守住节庆连击/);
  assert.deepEqual(festivalDigest.rewardStreakAction, { kind: 'select-decor', decorId: FARM_DEFAULT_DECOR_ID });
  assert.equal(festivalDigest.rewardStreakChestState, 'ready');
  assert.equal(festivalDigest.rewardStreakChestTier, 'festival');
  assert.match(festivalDigest.rewardStreakChestLabel || '', /节庆宝箱已点亮/);
  assert.equal(festivalDigest.rewardStreakChestShortLabel, '宝箱亮');
  assert.equal(festivalDigest.rewardStreakChestProgressLabel, '5/5');
  assert.match(festivalDigest.rewardStreakChestRewardLabel || '', /高光手账/);
  assert.equal(festivalDigest.rewardStreakChestCtaLabel, '开宝箱');
  assert.match(festivalDigest.rewardStreakChestClaimLabel || '', /开箱奖励已入袋/);
  assert.match(festivalDigest.rewardStreakChestClaimLabel || '', /订单气氛/);
  assert.match(festivalDigest.rewardStreakChestNextLabel || '', /下一轮/);
  assert.match(festivalDigest.rewardStreakChestNextLabel || '', /2 次正反馈/);
  assert.deepEqual(festivalDigest.rewardStreakChestRewardItems, ['高光手账', '订单气氛', '美化收益']);
  assert.equal(festivalDigest.rewardStreakChestBurstLabel, '宝箱奖励 +3');
  assert.match(festivalDigest.rewardStreakChestOpenedSummaryLabel || '', /宝箱奖励 \+3/);
  assert.match(festivalDigest.rewardStreakChestOpenedSummaryLabel || '', /美化收益/);
  assert.equal(festivalDigest.rewardStreakChestPercent, 100);
  assert.equal(festivalDigest.rewardStreakChestMeterLabel, '宝箱蓄能 5/5');
  assert.equal(festivalDigest.rewardStreakChestRemaining, 0);
  assert.equal(festivalDigest.rewardStreakChestRemainingLabel, '已可开箱');
  assert.equal(festivalDigest.rewardStreakChestTrailLabel, '宝箱路线：宝箱萌芽 1/2 · 丰收预热 2/3 · 节庆点亮 5/5');
  assert.equal(festivalDigest.rewardStreakChestTrailRewardLabel, '路线奖励：连击提示 -> 丰收徽章 -> 节庆三件套');
  assert.deepEqual(festivalDigest.rewardStreakChestTrailItems, [
    { tier: 'sprout', label: '宝箱萌芽', progressLabel: '1/2', state: 'done', rewardLabel: '奖励：今日连击提示和下一步行动。', shortRewardLabel: '连击提示' },
    { tier: 'harvest', label: '丰收预热', progressLabel: '2/3', state: 'done', rewardLabel: '奖励：丰收连击徽章和奖励印章苗头。', shortRewardLabel: '丰收徽章' },
    { tier: 'festival', label: '节庆点亮', progressLabel: '5/5', state: 'done', rewardLabel: '奖励：高光手账、订单气氛、美化收益。', shortRewardLabel: '节庆三件套' },
  ]);
  assert.equal(festivalDigest.rewardStreakChestActiveTrailLabel, '当前阶段：节庆点亮 5/5');
  assert.equal(festivalDigest.rewardStreakChestActiveRewardLabel, '当前奖励：节庆三件套');
  assert.equal(festivalDigest.rewardStreakChestActiveHint, '当前冲刺：节庆三件套，已可开箱。');
  assert.equal(festivalDigest.rewardStreakChestNextRewardLabel, '下一轮：连击提示');
  assert.equal(festivalDigest.rewardStreakChestChargeLabel, undefined);
  assert.equal(festivalDigest.rewardStreakChestChargeShortLabel, undefined);
});

test('farm tools reject blocked cells, missing seeds, missing water, and early harvests', () => {
  let state = createFarmState({ resources: { gold: 300, wood: 8, stone: 6, water: 0, experience: 0, seeds: { turnip: 0 } } });

  const seedEmpty = applyFarmTool(state, { tool: 'seed', x: 0, y: 0, cropId: 'turnip' });
  assert.equal(seedEmpty.error, 'missing-plot');

  state = applyFarmTool(state, { tool: 'hoe', x: 0, y: 0, id: 'plot-a' }).state;
  assert.equal(applyFarmTool(state, { tool: 'hoe', x: 0, y: 0 }).error, 'already-tilled');
  assert.equal(applyFarmTool(state, { tool: 'seed', x: 0, y: 0, cropId: 'turnip' }).error, 'missing-seed');

  state = createFarmState();
  state = applyFarmTool(state, { tool: 'hoe', x: 0, y: 0, id: 'plot-b' }).state;
  state = applyFarmTool(state, { tool: 'seed', x: 0, y: 0, cropId: 'turnip' }).state;
  assert.equal(applyFarmTool({ ...state, resources: { ...state.resources, water: 0 } }, { tool: 'water', x: 0, y: 0 }).error, 'missing-water');
  assert.equal(applyFarmTool(state, { tool: 'harvest', x: 0, y: 0 }).error, 'not-ready');
});

test('farm continuous actions are limited to drag-safe tools and dedupe by snapped grid cell', () => {
  assert.equal(farmToolSupportsContinuousAction('hoe'), true);
  assert.equal(farmToolSupportsContinuousAction('seed'), true);
  assert.equal(farmToolSupportsContinuousAction('water'), true);
  assert.equal(farmToolSupportsContinuousAction('harvest'), true);
  assert.equal(farmToolSupportsContinuousAction('shovel'), true);
  assert.equal(farmToolSupportsContinuousAction('delete'), true);
  assert.equal(farmToolSupportsContinuousAction('decor'), true);
  assert.equal(farmToolSupportsContinuousAction('build'), false);
  assert.equal(farmToolSupportsContinuousAction('move'), false);
  assert.equal(farmToolSupportsContinuousAction('select'), false);

  const keyA = farmToolActionGridKey({ tool: 'hoe', x: 8, y: 9 }, FARM_GRID_SIZE);
  const keyB = farmToolActionGridKey({ tool: 'hoe', x: 23, y: 27 }, FARM_GRID_SIZE);
  const keyC = farmToolActionGridKey({ tool: 'hoe', x: FARM_GRID_SIZE + 2, y: 27 }, FARM_GRID_SIZE);
  const keyD = farmToolActionGridKey({ tool: 'water', x: 23, y: 27 }, FARM_GRID_SIZE);
  assert.equal(keyA, 'hoe:0:0');
  assert.equal(keyA, keyB);
  assert.notEqual(keyA, keyC);
  assert.notEqual(keyA, keyD);

  let state = createFarmState();
  const seen = new Set<string>();
  [
    { tool: 'hoe' as const, x: 8, y: 9 },
    { tool: 'hoe' as const, x: 23, y: 27 },
    { tool: 'hoe' as const, x: FARM_GRID_SIZE + 2, y: 27 },
  ].forEach((action) => {
    const key = farmToolActionGridKey(action, state.gridSize);
    if (seen.has(key)) return;
    seen.add(key);
    state = applyFarmTool(state, action).state;
  });
  assert.equal(state.objects.length, 2);
  assert.equal(state.stats.plotsTilled, 2);
  assert.deepEqual(state.objects.map((object) => `${object.x}:${object.y}`), ['0:0', '64:0']);
});

test('farm buildings and decorations use grid occupancy and resource costs', () => {
  let state = createFarmState();
  const hut = placeFarmObject(state, { kind: 'building', buildingId: 'hut', x: 12, y: 14, id: 'hut-1' });

  assert.equal(hut.changed, true);
  assert.equal(hut.feedback, '已建造 小屋 · 每日结算已就绪');
  state = hut.state;
  assert.equal(state.objects[0].x, 0);
  assert.equal(state.objects[0].buildingId, 'hut');
  assert.equal(state.objects[0].widthCells, 3);
  assert.equal(state.resources.gold, 120);
  assert.equal(state.resources.wood, 0);
  assert.equal(state.resources.stone, 2);
  assert.equal(state.selectedBuildingId, 'hut');
  assert.equal(state.stats.objectsPlaced, 1);
  assert.equal(state.stats.buildingsPlaced, 1);
  assert.equal(state.stats.decorPlaced, 0);
  assert.equal(state.eventLog[0].kind, 'building_placed');
  assert.equal(state.eventLog[0].objectKind, 'building');
  assert.equal(state.eventLog[0].message, hut.feedback);

  assert.equal(placeFarmObject(state, { kind: 'building', buildingId: 'well', x: FARM_GRID_SIZE, y: FARM_GRID_SIZE }).error, 'insufficient-resources');
  const richBlockedState = {
    ...state,
    resources: { ...state.resources, gold: 999, wood: 999, stone: 999 },
  };
  assert.equal(placeFarmObject(richBlockedState, { kind: 'building', buildingId: 'well', x: FARM_GRID_SIZE, y: FARM_GRID_SIZE }).error, 'blocked');

  const decor = placeFarmObject(createFarmState(), {
    kind: 'decor',
    decorId: 'sign',
    resourceId: 'resource-123',
    skinId: 'poster',
    x: 192,
    y: 0,
  });
  assert.equal(decor.changed, true);
  assert.match(decor.feedback, /已放置 木牌 · 区域标记已立好/);
  assert.equal(decor.state.objects[0].resourceId, 'resource-123');
  assert.equal(decor.state.objects[0].decorId, 'sign');
  assert.equal(decor.state.selectedDecorId, 'sign');
  assert.equal(decor.state.stats.objectsPlaced, 1);
  assert.equal(decor.state.stats.buildingsPlaced, 0);
  assert.equal(decor.state.stats.decorPlaced, 1);
  assert.equal(decor.state.eventLog[0].kind, 'decor_placed');
  assert.equal(decor.state.eventLog[0].objectKind, 'decor');

  const resourceDecorId = farmDecorIdForResourceObjectType('poster-wall');
  const resourceDecor = placeFarmObject(createFarmState(), {
    kind: 'decor',
    decorId: resourceDecorId,
    resourceId: 'resource_abc-123',
    skinId: 'resource-poster-wall',
    objectType: 'poster-wall',
    x: 256,
    y: 128,
  });
  assert.equal(resourceDecor.changed, true);
  assert.match(resourceDecor.feedback, /已放置 资源海报墙 · 资源海报墙已上墙/);
  assert.equal(resourceDecor.state.objects[0].decorId, resourceDecorId);
  assert.equal(resourceDecor.state.objects[0].resourceId, 'resource_abc-123');
  assert.equal(resourceDecor.state.objects[0].skinId, 'resource-poster-wall');
  assert.equal(resourceDecor.state.objects[0].objectType, 'poster-wall');
  assert.equal((resourceDecor.state.objects[0] as any).fileUrl, undefined);
  assert.equal((resourceDecor.state.objects[0] as any).thumbUrl, undefined);
  assert.equal(isFarmDecorUnlocked(createFarmState(), resourceDecorId), true);

  const selectedResourceDecorState = createFarmState({
    selectedTool: 'decor',
    selectedDecorId: farmDecorIdForResourceObjectType('banner'),
    selectedResourceDecor: {
      resourceId: 'resource-banner-1',
      skinId: 'resource-banner',
      objectType: 'banner',
    },
  });
  const selectedResourceDecor = applyFarmTool(selectedResourceDecorState, { tool: 'decor', x: 384, y: 128 });
  assert.equal(selectedResourceDecor.changed, true);
  assert.equal(selectedResourceDecor.state.objects[0].decorId, farmDecorIdForResourceObjectType('banner'));
  assert.equal(selectedResourceDecor.state.objects[0].resourceId, 'resource-banner-1');
  assert.equal(selectedResourceDecor.state.objects[0].objectType, 'banner');

  const selectedState = createFarmState({
    selectedBuildingId: 'storage',
    selectedDecorId: 'lantern',
    resources: { gold: 999, wood: 999, stone: 999, water: 20, experience: 0, seeds: { turnip: 12 } },
  });
  const selectedBuild = applyFarmTool(selectedState, { tool: 'build', x: 320, y: 0 });
  assert.equal(selectedBuild.changed, true);
  assert.match(selectedBuild.feedback, /已建造 仓库 · 库存容量 \+20/);
  assert.equal(FARM_BUILDING_DEFINITIONS.storage.description, '库存容量 +20');
  assert.equal(FARM_BUILDING_DEFINITIONS.well.description, '每日补水 +12');
  assert.equal(farmBuildingActivationHint('well'), `每日补水 +${FARM_WATER_PER_WELL}`);
  assert.equal(farmBuildingActivationHint('scarecrow'), '守护半径 6 格');
  assert.equal(selectedBuild.state.objects[0].buildingId, 'storage');
  assert.equal(selectedBuild.state.objects[0].widthCells, FARM_BUILDING_DEFINITIONS.storage.widthCells);
  assert.equal(selectedBuild.state.selectedBuildingId, 'storage');

  const readyPreview = previewFarmPlacement(selectedState, { tool: 'build', x: 320, y: 0, buildingId: 'storage' });
  assert.equal(readyPreview.canPlace, true);
  assert.equal(readyPreview.status, 'ready');
  assert.equal(readyPreview.reason, undefined);
  assert.equal(readyPreview.widthCells, FARM_BUILDING_DEFINITIONS.storage.widthCells);
  assert.match(readyPreview.feedback, /可建造/);
  assert.equal(readyPreview.effectPreview, farmBuildingActivationHint('storage'));

  const blockedPreview = previewFarmPlacement(selectedBuild.state, { tool: 'decor', x: 320, y: 0, decorId: 'lantern' });
  assert.equal(blockedPreview.canPlace, false);
  assert.equal(blockedPreview.status, 'blocked');
  assert.equal(blockedPreview.reason, 'blocked');
  assert.match(blockedPreview.feedback, /挡住建筑/);
  assert.equal(blockedPreview.effectPreview, farmDecorActivationHint('lantern'));

  const poorPreview = previewFarmPlacement(createFarmState({
    resources: { gold: 0, wood: 0, stone: 0, water: 20, experience: 0, seeds: { turnip: 12 } },
  }), { tool: 'build', x: 0, y: 0, buildingId: 'well' });
  assert.equal(poorPreview.canPlace, false);
  assert.equal(poorPreview.status, 'insufficient-resources');
  assert.equal(poorPreview.reason, 'insufficient-resources');
  assert.equal(poorPreview.missingResources?.gold, FARM_BUILDING_DEFINITIONS.well.cost.gold);
  assert.equal(poorPreview.missingResources?.wood, FARM_BUILDING_DEFINITIONS.well.cost.wood);
  assert.equal(poorPreview.missingResources?.stone, FARM_BUILDING_DEFINITIONS.well.cost.stone);
  assert.match(poorPreview.feedback, /资源不足/);
  assert.equal(poorPreview.effectPreview, farmBuildingActivationHint('well'));

  const selectedDecor = applyFarmTool(selectedBuild.state, { tool: 'decor', x: 640, y: 0 });
  assert.equal(selectedDecor.changed, true);
  assert.match(selectedDecor.feedback, /已放置 路灯 · 夜间地块更醒目/);
  assert.equal(selectedDecor.state.objects[1].decorId, 'lantern');
  assert.equal(selectedDecor.state.selectedDecorId, 'lantern');
  assert.equal(selectedDecor.state.stats.buildingsPlaced, 1);
  assert.equal(selectedDecor.state.stats.decorPlaced, 1);
  assert.equal(FARM_DECOR_DEFINITIONS.lantern.label, '路灯');
  assert.equal(FARM_DECOR_DEFINITIONS.lantern.description, '夜晚高亮地块');
  assert.equal(farmDecorActivationHint('stone-path'), '道路会连成路线');
  assert.equal(farmDecorActivationHint('resource-banner', 'banner'), '资源旗帜已挂起');

  const lockedFencePreview = previewFarmPlacement(createFarmState(), { tool: 'decor', x: 0, y: 320, decorId: 'wood-fence' });
  assert.equal(isFarmDecorUnlocked(createFarmState(), 'wood-fence'), false);
  assert.equal(lockedFencePreview.canPlace, false);
  assert.equal(lockedFencePreview.reason, 'decor-locked');
  assert.match(lockedFencePreview.feedback, /新手萝卜订单/);
  assert.equal(placeFarmObject(createFarmState(), { kind: 'decor', decorId: 'wood-fence', x: 0, y: 320 }).error, 'decor-locked');

  let effectState = createFarmState({
    resources: { gold: 999, wood: 999, stone: 999, water: 2, experience: 0, seeds: { turnip: 12 } },
  });
  const wellPlaced = placeFarmObject(effectState, { kind: 'building', buildingId: 'well', x: 0, y: 256 });
  assert.match(wellPlaced.feedback, /已建造 水井 · 每日补水 \+12/);
  effectState = wellPlaced.state;
  effectState = placeFarmObject(effectState, { kind: 'building', buildingId: 'storage', x: 192, y: 256 }).state;
  const boardPlaced = placeFarmObject(effectState, { kind: 'building', buildingId: 'board', x: 448, y: 256 });
  assert.match(boardPlaced.feedback, /已建造 公告板 · 可交付订单优先显示/);
  effectState = boardPlaced.state;
  effectState = placeFarmObject(effectState, { kind: 'building', buildingId: 'scarecrow', x: 640, y: 256 }).state;
  const effects = getFarmBuildingEffects(effectState);
  assert.equal(effects.wells, 1);
  assert.equal(effects.storages, 1);
  assert.equal(effects.boards, 1);
  assert.equal(effects.scarecrows, 1);
  assert.equal(effects.hasOrderBoard, true);
  assert.equal(effects.dailyWaterCapacity, BASE_FARM_DAILY_WATER + FARM_WATER_PER_WELL);
  assert.equal(effects.storageCapacityBonus, FARM_STORAGE_BONUS_PER_BUILDING);

  const nextDay = advanceFarmDay({
    ...effectState,
    resources: { ...effectState.resources, water: 0 },
  });
  assert.equal(nextDay.resources.water, BASE_FARM_DAILY_WATER + FARM_WATER_PER_WELL);
  assert.ok(nextDay.lastDailySummary?.highlights.some((item) => item.includes('水井补水')));

  const moveSelect = applyFarmTool(selectedDecor.state, { tool: 'move', x: 320, y: 0 });
  assert.equal(moveSelect.changed, true);
  assert.equal(moveSelect.state.selectedTool, 'move');
  assert.equal(moveSelect.state.selectedObjectId, selectedDecor.state.objects[0].id);
  const moved = applyFarmTool(moveSelect.state, { tool: 'move', x: 896, y: 0 });
  assert.equal(moved.changed, true);
  assert.equal(moved.state.selectedObjectId, undefined);
  assert.equal(moved.state.objects[0].x, 896);

  const blockedMoveSelect = applyFarmTool(moved.state, { tool: 'move', x: 896, y: 0 });
  const blockedMove = applyFarmTool(blockedMoveSelect.state, { tool: 'move', x: 640, y: 0 });
  assert.equal(blockedMove.changed, false);
  assert.equal(blockedMove.error, 'blocked');
});

test('farm long-term goals track real farm progress metrics', () => {
  const initialGoals = buildFarmLongTermGoals(createFarmState());
  assert.deepEqual(initialGoals.map((goal) => goal.id), [
    'starter-route',
    'crop-catalog',
    'farmstead-buildings',
    'orders-10',
    'decor-30',
    'days-7',
  ]);
  assert.equal(initialGoals.length, 6);
  assert.equal(initialGoals.every((goal) => goal.percent >= 0 && goal.percent <= 100), true);
  assert.equal(initialGoals.find((goal) => goal.id === 'days-7')?.current, 1);

  const completeState = createFarmState({
    day: 7,
    discoveredCropIds: Object.keys(FARM_CROP_DEFINITIONS) as Array<keyof typeof FARM_CROP_DEFINITIONS>,
    objects: [
      { id: 'hut', kind: 'building', buildingId: 'hut', x: 0, y: 0, widthCells: 3, heightCells: 3, createdDay: 1 },
      { id: 'well', kind: 'building', buildingId: 'well', x: 256, y: 0, widthCells: 2, heightCells: 2, createdDay: 1 },
      { id: 'storage', kind: 'building', buildingId: 'storage', x: 448, y: 0, widthCells: 3, heightCells: 2, createdDay: 1 },
      { id: 'board', kind: 'building', buildingId: 'board', x: 704, y: 0, widthCells: 2, heightCells: 1, createdDay: 1 },
      { id: 'scarecrow', kind: 'building', buildingId: 'scarecrow', x: 896, y: 0, widthCells: 1, heightCells: 1, createdDay: 1 },
      { id: 'decor-a', kind: 'decor', decorId: 'stone-path', x: 0, y: 256, widthCells: 1, heightCells: 1, createdDay: 1 },
    ],
    stats: {
      plotsTilled: 3,
      cropsPlanted: 3,
      cropsWatered: 3,
      cropsHarvested: 3,
      ordersCompleted: 10,
      npcVisitsCompleted: 0,
      rareEventsFound: 0,
      objectsPlaced: 35,
      buildingsPlaced: 5,
      decorPlaced: 30,
      daysAdvanced: 6,
    },
  });
  const completeGoals = buildFarmLongTermGoals(completeState);
  assert.equal(completeGoals.every((goal) => goal.done), true);
  assert.equal(completeGoals.find((goal) => goal.id === 'starter-route')?.current, 5);
  assert.equal(completeGoals.find((goal) => goal.id === 'crop-catalog')?.target, Object.keys(FARM_CROP_DEFINITIONS).length);
  assert.equal(completeGoals.find((goal) => goal.id === 'farmstead-buildings')?.current, 5);
  assert.equal(completeGoals.find((goal) => goal.id === 'orders-10')?.current, 10);
  assert.equal(completeGoals.find((goal) => goal.id === 'decor-30')?.current, 30);
  assert.equal(completeGoals.find((goal) => goal.id === 'days-7')?.current, 7);
});

test('farm beauty score turns building and decoration layout into soft progression', () => {
  const initial = buildFarmBeautyScore(createFarmState());
  assert.equal(initial.score, 0);
  assert.equal(initial.level, 1);
  assert.equal(initial.title, '朴素空地');
  assert.match(initial.nextHint, /道路连通/);
  assert.equal(initial.factors.length, 6);
  const initialRewards = buildFarmBeautyRewards(createFarmState());
  assert.equal(initialRewards.length, 5);
  assert.equal(initialRewards.filter((reward) => reward.unlocked).length, 1);
  assert.equal(initialRewards[0].id, 'wooden-nameplate');
  assert.equal(initialRewards[0].remainingScore, 0);
  assert.equal(initialRewards.find((reward) => reward.id === 'flower-sticker')?.remainingScore, 25);

  const makeDecor = (index: number, decorId: string, objectType?: 'sign' | 'banner' | 'poster-wall' | 'tile') => ({
    id: `beauty-decor-${index}`,
    kind: 'decor' as const,
    x: index * FARM_GRID_SIZE,
    y: FARM_GRID_SIZE * 8,
    widthCells: 1,
    heightCells: 1,
    decorId,
    objectType,
    resourceId: objectType ? `resource-${index}` : undefined,
    createdDay: 1,
  });
  const makeBuilding = (index: number, buildingId: string) => ({
    id: `beauty-building-${index}`,
    kind: 'building' as const,
    x: index * FARM_GRID_SIZE * 3,
    y: FARM_GRID_SIZE * 11,
    widthCells: FARM_BUILDING_DEFINITIONS[buildingId].widthCells,
    heightCells: FARM_BUILDING_DEFINITIONS[buildingId].heightCells,
    buildingId,
    createdDay: 1,
  });
  const objects = [
    ...Array.from({ length: 6 }, (_, index) => makeDecor(index, 'stone-path')),
    ...Array.from({ length: 4 }, (_, index) => makeDecor(index + 10, 'flower-bed')),
    ...Array.from({ length: 6 }, (_, index) => makeDecor(index + 20, 'wood-fence')),
    ...Array.from({ length: 3 }, (_, index) => makeDecor(index + 30, 'lantern')),
    makeDecor(40, 'resource-sign', 'sign'),
    makeDecor(41, 'resource-banner', 'banner'),
    makeDecor(42, 'resource-poster-wall', 'poster-wall'),
    makeBuilding(0, 'hut'),
    makeBuilding(1, 'well'),
    makeBuilding(2, 'board'),
    makeBuilding(3, 'storage'),
  ];
  const complete = buildFarmBeautyScore(createFarmState({ objects }));
  const factorById = new Map(complete.factors.map((factor) => [factor.id, factor]));

  assert.equal(complete.score, 100);
  assert.equal(complete.level, 5);
  assert.equal(complete.title, '四季名场');
  assert.match(complete.summary, /6\/6/);
  const completeRewards = buildFarmBeautyRewards(createFarmState({ objects }));
  assert.equal(completeRewards.every((reward) => reward.unlocked), true);
  assert.equal(completeRewards.find((reward) => reward.id === 'festival-arch')?.remainingScore, 0);
  assert.equal(factorById.get('paths')?.done, true);
  assert.equal(factorById.get('flowers')?.done, true);
  assert.equal(factorById.get('fences')?.done, true);
  assert.equal(factorById.get('lights')?.done, true);
  assert.equal(factorById.get('buildings')?.done, true);
  assert.equal(factorById.get('resourceDecor')?.done, true);

  const focusGoals = buildFarmFocusGoals(createFarmState({
    objects: [makeDecor(1, 'stone-path')],
    stats: { plotsTilled: 3, cropsPlanted: 3, cropsWatered: 3, cropsHarvested: 3, ordersCompleted: 1 },
  }), { maxGoals: 8 });
  const decorateGoal = focusGoals.find((goal) => goal.id === 'decorate-farm');
  assert.equal(decorateGoal?.kind, 'decorate');
  assert.match(decorateGoal?.detail || '', /漂亮度/);
  assert.match(decorateGoal?.detail || '', /下一档奖励/);
});

test('farm state sanitizer clamps unsafe payloads and viewport queries stay sparse', () => {
  const noisyObjects = Array.from({ length: MAX_FARM_OBJECTS + 5 }, (_, index) => ({
    id: `plot-${index}`,
    kind: 'plot',
    x: index * FARM_GRID_SIZE + 17,
    y: 0,
    widthCells: 1,
    heightCells: 1,
    createdDay: 1,
  }));
  const state = sanitizeFarmCanvasState({
    version: 99,
    coordinateMode: 'viewport',
    gridSize: 0,
    day: -12,
    season: 'bad',
    weather: 'bad-weather',
    festivalId: 'bad id',
    resources: { gold: -5, wood: 2, stone: 1, water: 99999, experience: 7, seeds: { turnip: 2, bad: 100 } },
    inventory: { crops: { turnip: 4, bad: 9 }, animalProducts: { egg: 2, milk: 1, bad: 9 }, decorIds: ['wood-fence', 'wood-fence'] },
    objects: [
      ...noisyObjects,
      { id: 'bad-url', kind: 'decor', x: 0, y: 0, widthCells: 1, heightCells: 1, resourceId: 'data:image/png;base64,abc', createdDay: 1 },
    ],
    animals: [
      { id: 'bad animal id', kind: 'dragon', name: 'bad', mood: 'wild', placedDay: -3, productCount: 999999999 },
      {
        id: 'cow-1',
        kind: 'cow',
        name: '奶牛 https://example.com C:\\Users\\Secret\\cow.png',
        mood: 'happy',
        placedDay: 1,
        lastProducedDay: 99,
        productCount: 3,
      },
      ...Array.from({ length: MAX_FARM_ANIMALS + 2 }, (_, index) => ({
        id: `hen-${index}`,
        kind: 'chicken',
        name: `小鸡${index}`,
        mood: 'calm',
        placedDay: 1,
        productCount: index,
      })),
    ],
    eventLog: Array.from({ length: MAX_FARM_EVENT_LOG + 5 }, (_, index) => ({
      id: `event-${index}`,
      kind: index === 0 ? 'bad-kind' : 'crop_harvested',
      day: -index,
      message: index === 0
        ? 'prompt: secret https://example.com/a.png data:image/png;base64,abc C:\\Users\\Secret\\file.png'
        : `收获记录 ${index}`,
      amount: index,
      cropId: index === 1 ? 'turnip' : 'bad',
      objectKind: index === 2 ? 'decor' : 'bad-kind',
      orderId: 'tutorial-turnip-order',
      npcVisitId: index === 1 ? 'npc-visit-1-mira' : 'bad npc visit id',
      rareEventId: index === 1 ? 'rare-event-1-giant-turnip-plot' : 'bad rare event id',
      createdAt: index,
    })),
    lastDailySummary: {
      id: 'summary-unsafe',
      fromDay: -5,
      toDay: -1,
      message: 'prompt: secret https://example.com/summary data:image/png;base64,abc C:\\Users\\Secret\\summary.png',
      harvestedCrops: -4,
      ordersCompleted: 2,
      goldEarned: 999999999,
      weather: 'bad-weather',
      rainWateredCrops: -1,
      festivalBonusGold: 999999999,
      animalProductsProduced: 999999,
      animalProductSummary: '鸡蛋 x1 https://example.com C:\\Users\\Secret\\egg.png prompt: bad',
      npcVisitsCompleted: 999999,
      rareEventsFound: 999999,
      rareEventSummary: '巨大萝卜 https://example.com C:\\Users\\Secret\\rare.png prompt: bad',
      readyOrders: 999999,
      readyNpcVisits: 999999,
      dailyWaterCapacity: 999999,
      scarecrowProtectedCrops: 999999,
      wateredCrops: 3,
      dryCrops: 4,
      witheredCrops: 5,
      newMatureCrops: 6,
      matureCrops: 7,
      nextMatureCrops: 8,
      highlights: [
        'https://example.com/highlight prompt: hidden',
        'C:\\Users\\Secret\\file.png',
        '正常摘要',
        '4',
        '5',
        '6',
      ],
      createdAt: 0,
    },
    festivalTasks: [
      {
        id: 'bad task id',
        festivalId: 'bad festival id',
        title: '节庆'.repeat(80),
        description: 'prompt: hidden https://example.com/task.png data:image/png;base64,abc C:\\Users\\Secret\\task.png',
        kind: 'bad-kind',
        target: 99,
        progress: 99,
        rewards: {
          gold: 999999999,
          wood: 3,
          seeds: { sunflower: 2, bad: 9 },
          decorIds: ['wood-fence', 'bad id'],
        },
        completed: true,
        completedDay: -2,
      },
    ],
    npcVisits: [
      {
        id: 'bad visit id',
        visitorId: 'bad',
        visitorName: '米拉 https://example.com C:\\Users\\Secret\\npc.png',
        day: -4,
        title: '来访'.repeat(80),
        message: 'prompt: hidden https://example.com/npc.png data:image/png;base64,abc C:\\Users\\Secret\\npc.png',
        requestKind: 'bad-kind',
        cropId: 'bad',
        animalProductId: 'bad',
        amount: 999,
        rewards: {
          gold: 999999999,
          experience: 5,
          seeds: { potato: 2, bad: 9 },
          decorIds: ['wood-fence', 'bad id'],
        },
        completed: true,
        completedDay: 999,
      },
    ],
    rareEvents: [
      {
        id: 'rare-event-1-giant-turnip-plot',
        eventId: 'giant-turnip',
        title: '巨大萝卜 https://example.com C:\\Users\\Secret\\rare.png',
        message: 'prompt: hidden https://example.com/rare.png data:image/png;base64,abc C:\\Users\\Secret\\rare.png',
        day: 99,
        cropId: 'turnip',
        rewards: {
          gold: 999999999,
          experience: 5,
          seeds: { turnip: 2, bad: 9 },
          decorIds: ['wood-fence', 'bad id'],
        },
      },
    ],
    orders: [],
    stats: {
      plotsTilled: -1,
      npcVisitsCompleted: 999999999,
      rareEventsFound: 999999999,
      buildingsPlaced: 999999999,
      decorPlaced: 999999999,
    },
    selectedBuildingId: 'unsafe building',
    selectedDecorId: 'missing-decor',
    selectedObjectId: 'bad id',
  });

  assert.equal(state.version, 1);
  assert.equal(state.coordinateMode, 'flow');
  assert.equal(state.gridSize, FARM_GRID_SIZE);
  assert.equal(state.day, 1);
  assert.equal(state.season, 'spring');
  assert.equal(state.weather, 'sunny');
  assert.equal(state.festivalId, undefined);
  assert.equal(state.resources.gold, 0);
  assert.equal(state.resources.water, 999);
  assert.equal(state.resources.seeds.turnip, 2);
  assert.equal((state.resources.seeds as any).bad, undefined);
  assert.equal(state.inventory.crops.turnip, 4);
  assert.equal(state.inventory.animalProducts.egg, 2);
  assert.equal(state.inventory.animalProducts.milk, 1);
  assert.equal((state.inventory.animalProducts as any).bad, undefined);
  assert.equal(state.inventory.decorIds.length, 1);
  assert.ok(state.animals.length <= MAX_FARM_ANIMALS);
  assert.equal(state.animals[0].id, 'cow-1');
  assert.equal(state.animals[0].kind, 'cow');
  assert.equal(state.animals[0].mood, 'happy');
  assert.equal(state.animals[0].placedDay, 1);
  assert.equal(state.animals[0].lastProducedDay, 1);
  assert.equal(state.animals[0].name.includes('example.com'), false);
  assert.equal(state.animals[0].name.includes('Secret'), false);
  assert.equal(state.objects.length, MAX_FARM_OBJECTS);
  assert.equal(state.objects[0].x, 0);
  assert.equal(state.eventLog.length, MAX_FARM_EVENT_LOG);
  assert.equal(state.selectedBuildingId, 'hut');
  assert.equal(state.selectedDecorId, FARM_DEFAULT_DECOR_ID);
  assert.equal(state.selectedObjectId, undefined);
  assert.equal(state.eventLog[0].kind, 'tool_feedback');
  assert.equal(state.eventLog[0].day, 1);
  assert.equal(state.eventLog[0].message.includes('https://example.com'), false);
  assert.equal(state.eventLog[0].message.includes('data:image'), false);
  assert.equal(state.eventLog[0].message.includes('Secret'), false);
  assert.equal(state.eventLog[0].message.includes('prompt:'), false);
  assert.equal(state.eventLog[1].cropId, 'turnip');
  assert.equal(state.eventLog[1].npcVisitId, 'npc-visit-1-mira');
  assert.equal(state.eventLog[1].rareEventId, 'rare-event-1-giant-turnip-plot');
  assert.equal(state.eventLog[2].objectKind, 'decor');
  assert.equal(state.lastDailySummary?.fromDay, 1);
  assert.equal(state.lastDailySummary?.toDay, 1);
  assert.equal(state.lastDailySummary?.message.includes('example.com'), false);
  assert.equal(state.lastDailySummary?.message.includes('data:image'), false);
  assert.equal(state.lastDailySummary?.message.includes('Secret'), false);
  assert.equal(state.lastDailySummary?.harvestedCrops, 0);
  assert.equal(state.lastDailySummary?.goldEarned, 9999999);
  assert.equal(state.lastDailySummary?.weather, 'sunny');
  assert.equal(state.lastDailySummary?.rainWateredCrops, 0);
  assert.equal(state.lastDailySummary?.festivalBonusGold, 9999999);
  assert.equal(state.lastDailySummary?.animalProductsProduced, 9999);
  assert.equal(state.lastDailySummary?.animalProductSummary?.includes('example.com'), false);
  assert.equal(state.lastDailySummary?.animalProductSummary?.includes('Secret'), false);
  assert.equal(state.lastDailySummary?.npcVisitsCompleted, 9999);
  assert.equal(state.lastDailySummary?.rareEventsFound, 9999);
  assert.equal(state.lastDailySummary?.rareEventSummary?.includes('example.com'), false);
  assert.equal(state.lastDailySummary?.rareEventSummary?.includes('Secret'), false);
  assert.equal(state.lastDailySummary?.readyOrders, 9999);
  assert.equal(state.lastDailySummary?.readyNpcVisits, 9999);
  assert.equal(state.lastDailySummary?.dailyWaterCapacity, 9999);
  assert.equal(state.lastDailySummary?.scarecrowProtectedCrops, 9999);
  assert.equal(state.lastDailySummary?.witheredCrops, 5);
  assert.equal(state.lastDailySummary?.highlights.length, 5);
  assert.equal(state.lastDailySummary?.highlights[0].includes('example.com'), false);
  assert.equal(state.festivalTasks.length, 1);
  assert.equal(state.festivalTasks[0].festivalId, 'festival-1');
  assert.equal(state.festivalTasks[0].kind, 'complete-orders');
  assert.equal(state.festivalTasks[0].target, 9);
  assert.equal(state.festivalTasks[0].progress, 9);
  assert.equal(state.festivalTasks[0].completed, true);
  assert.equal(state.festivalTasks[0].completedDay, 1);
  assert.equal(state.festivalTasks[0].description.includes('example.com'), false);
  assert.equal(state.festivalTasks[0].description.includes('Secret'), false);
  assert.equal(state.festivalTasks[0].rewards.gold, 999999);
  assert.equal(state.festivalTasks[0].rewards.wood, 3);
  assert.equal(state.festivalTasks[0].rewards.seeds?.sunflower, 2);
  assert.equal((state.festivalTasks[0].rewards.seeds as any).bad, undefined);
  assert.deepEqual(state.festivalTasks[0].rewards.decorIds, ['wood-fence']);
  assert.equal(state.npcVisits.length, 1);
  assert.equal(state.npcVisits[0].id, 'npc-visit-1-mira-0');
  assert.equal(state.npcVisits[0].visitorId, 'mira');
  assert.equal(state.npcVisits[0].requestKind, 'crop');
  assert.equal(state.npcVisits[0].cropId, 'turnip');
  assert.equal(state.npcVisits[0].amount, 99);
  assert.equal(state.npcVisits[0].completed, true);
  assert.equal(state.npcVisits[0].completedDay, 1);
  assert.equal(state.npcVisits[0].message.includes('example.com'), false);
  assert.equal(state.npcVisits[0].rewards.gold, 999999);
  assert.equal(state.npcVisits[0].rewards.seeds?.potato, 2);
  assert.equal((state.npcVisits[0].rewards.seeds as any).bad, undefined);
  assert.equal(state.stats.npcVisitsCompleted, 999999);
  assert.equal(state.rareEvents.length, 1);
  assert.equal(state.rareEvents[0].id, 'rare-event-1-giant-turnip-plot');
  assert.equal(state.rareEvents[0].message.includes('example.com'), false);
  assert.equal(state.rareEvents[0].message.includes('Secret'), false);
  assert.equal(state.rareEvents[0].rewards.gold, 999999);
  assert.equal(state.rareEvents[0].rewards.seeds?.turnip, 2);
  assert.equal((state.rareEvents[0].rewards.seeds as any).bad, undefined);
  assert.equal(state.stats.rareEventsFound, 999999);
  assert.equal(state.stats.buildingsPlaced, 999999);
  assert.equal(state.stats.decorPlaced, 999999);

  const resourceState = sanitizeFarmCanvasState({
    objects: [
      {
        id: 'resource-decor-1',
        kind: 'decor',
        decorId: farmDecorIdForResourceObjectType('tile'),
        resourceId: 'resource_tile-1',
        skinId: 'resource-tile',
        objectType: 'tile',
        fileUrl: 'https://example.com/should-not-persist.png',
        thumbUrl: 'https://example.com/thumb.png',
        x: 0,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        createdDay: 1,
      },
      {
        id: 'bad-resource-decor',
        kind: 'decor',
        decorId: farmDecorIdForResourceObjectType('sign'),
        resourceId: 'data:image/png;base64,abc',
        objectType: 'sign',
        x: FARM_GRID_SIZE,
        y: 0,
        widthCells: 1,
        heightCells: 1,
        createdDay: 1,
      },
    ],
    selectedResourceDecor: {
      resourceId: 'resource-poster-1',
      skinId: 'resource-poster-wall',
      objectType: 'poster-wall',
    },
  });
  assert.equal(resourceState.objects[0].resourceId, 'resource_tile-1');
  assert.equal(resourceState.objects[0].objectType, 'tile');
  assert.equal((resourceState.objects[0] as any).fileUrl, undefined);
  assert.equal((resourceState.objects[0] as any).thumbUrl, undefined);
  assert.equal(resourceState.objects[1].resourceId, undefined);
  assert.equal(resourceState.selectedResourceDecor?.resourceId, 'resource-poster-1');
  assert.equal(resourceState.selectedResourceDecor?.objectType, 'poster-wall');

  const unsafeSelectedResource = sanitizeFarmCanvasState({
    selectedResourceDecor: {
      resourceId: 'data:image/png;base64,abc',
      skinId: 'resource-tile',
      objectType: 'tile',
    },
  });
  assert.equal(unsafeSelectedResource.selectedResourceDecor, undefined);

  const visible = getFarmObjectsInViewport(state, { x: -10, y: -10, width: FARM_GRID_SIZE * 2, height: FARM_GRID_SIZE });
  assert.ok(visible.length > 0);
  assert.ok(visible.length < state.objects.length);
});

test('farm canvas types are wired into CanvasData, Canvas persistence, import, and export', () => {
  const types = readFileSync(new URL('../src/types/canvas.ts', import.meta.url), 'utf8');
  const utils = readFileSync(new URL('../src/utils/farmCanvas.ts', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../backend/src/routes/canvas.js', import.meta.url), 'utf8');
  const roadmapUrl = new URL('../roadmap.md', import.meta.url);
  const farmRoadmap = fs.existsSync(roadmapUrl)
    ? readFileSync(roadmapUrl, 'utf8')
    : readFileSync(new URL('../features.json', import.meta.url), 'utf8');

  assert.match(types, /export interface FarmCanvasState/);
  assert.match(utils, /export const FARM_SEASON_DAYS = 28/);
  assert.match(utils, /export const FARM_SEASON_DEFINITIONS/);
  assert.match(utils, /export function farmSeasonForDay/);
  assert.match(utils, /effectPreview\?: string/);
  assert.match(utils, /objectType\?: FarmDecorObjectType/);
  assert.match(utils, /const effectPreview = kind === 'building'[\s\S]*farmBuildingActivationHint\(building\?\.id\)[\s\S]*farmDecorActivationHint\(rawDecorId, input\.objectType\)/);
  assert.match(utils, /const nextSeason = farmSeasonForDay\(nextDay\)/);
  assert.match(route, /const FARM_SEASON_DAYS = 28/);
  assert.match(route, /function farmSeasonForDay\(dayInput\)/);
  assert.match(route, /FARM_SEASONS\.includes\(input\.season\) \? input\.season : farmSeasonForDay\(day\)/);
  assert.match(types, /coordinateMode:\s*'flow'/);
  assert.match(types, /eventLog: FarmEventLogItem\[\]/);
  assert.match(types, /lastDailySummary\?: FarmDailySummary/);
  assert.match(types, /readyOrders: number/);
  assert.match(types, /readyNpcVisits: number/);
  assert.match(types, /dailyWaterCapacity: number/);
  assert.match(types, /scarecrowProtectedCrops: number/);
  assert.match(utils, /readyOrders = next\.orders\.filter/);
  assert.match(utils, /scarecrowProtectedCrops = previous\.objects\.filter/);
  assert.match(route, /readyOrders: Math\.round\(clampNumber\(source\.readyOrders/);
  assert.match(route, /scarecrowProtectedCrops: Math\.round\(clampNumber\(source\.scarecrowProtectedCrops/);
  assert.match(types, /export interface FarmFestivalTask/);
  assert.match(types, /festivalTasks: FarmFestivalTask\[\]/);
  assert.match(types, /export interface FarmNpcVisitState/);
  assert.match(types, /npcVisits: FarmNpcVisitState\[\]/);
  assert.match(types, /npc_request_completed/);
  assert.match(types, /export interface FarmRareEventState/);
  assert.match(types, /rareEvents: FarmRareEventState\[\]/);
  assert.match(types, /rare_event/);
  assert.match(types, /export interface FarmLongTermGoal/);
  assert.match(types, /buildingsPlaced: number/);
  assert.match(types, /decorPlaced: number/);
  assert.match(utils, /export interface FarmActivityFeedItem/);
  assert.match(utils, /rewardLabel\?: string/);
  assert.match(utils, /function farmActivityRewardLabel\(kind: FarmEventKind\)/);
  assert.match(utils, /kind === 'rare_event'[\s\S]*return '惊喜奖励'/);
  assert.match(utils, /export function buildFarmActivityFeed/);
  assert.match(utils, /rewardStreak: number/);
  assert.match(utils, /rewardStreakLabel\?: string/);
  assert.match(utils, /rewardStreakHint\?: string/);
  assert.match(utils, /rewardStreakTier\?: FarmActivityRewardStreakTier/);
  assert.match(utils, /rewardStreakMilestoneLabel\?: string/);
  assert.match(utils, /rewardStreakMilestoneTarget\?: number/);
  assert.match(utils, /rewardStreakMilestonePercent\?: number/);
  assert.match(utils, /rewardStreakMilestoneProgressLabel\?: string/);
  assert.match(utils, /rewardStreakMilestoneCompletionLabel\?: string/);
  assert.match(utils, /rewardStreakMilestoneRewardLabel\?: string/);
  assert.match(utils, /rewardStreakMilestoneRewardItems\?: string\[\]/);
  assert.match(utils, /rewardStreakActionKind\?: FarmActivityRewardStreakActionKind/);
  assert.match(utils, /rewardStreakActionShortLabel\?: string/);
  assert.match(utils, /rewardStreakActionLabel\?: string/);
  assert.match(utils, /rewardStreakAction\?: FarmFocusGoalAction/);
  assert.match(utils, /export type FarmActivityRewardStreakChestState = 'warming' \| 'ready'/);
  assert.match(utils, /rewardStreakChestState\?: FarmActivityRewardStreakChestState/);
  assert.match(utils, /rewardStreakChestTier\?: FarmActivityRewardStreakTier/);
  assert.match(utils, /rewardStreakChestLabel\?: string/);
  assert.match(utils, /rewardStreakChestShortLabel\?: string/);
  assert.match(utils, /rewardStreakChestProgressLabel\?: string/);
  assert.match(utils, /rewardStreakChestRewardLabel\?: string/);
  assert.match(utils, /rewardStreakChestCtaLabel\?: string/);
  assert.match(utils, /rewardStreakChestClaimLabel\?: string/);
  assert.match(utils, /rewardStreakChestNextLabel\?: string/);
  assert.match(utils, /rewardStreakChestRewardItems\?: string\[\]/);
  assert.match(utils, /rewardStreakChestBurstLabel\?: string/);
  assert.match(utils, /rewardStreakChestOpenedSummaryLabel\?: string/);
  assert.match(utils, /rewardStreakChestPercent\?: number/);
  assert.match(utils, /rewardStreakChestMeterLabel\?: string/);
  assert.match(utils, /rewardStreakChestRemaining\?: number/);
  assert.match(utils, /rewardStreakChestRemainingLabel\?: string/);
  assert.match(utils, /export type FarmActivityRewardStreakChestTrailState = 'done' \| 'active' \| 'next'/);
  assert.match(utils, /interface FarmActivityRewardStreakChestTrailItem/);
  assert.match(utils, /rewardLabel: string/);
  assert.match(utils, /shortRewardLabel: string/);
  assert.match(utils, /rewardStreakChestTrailLabel\?: string/);
  assert.match(utils, /rewardStreakChestTrailRewardLabel\?: string/);
  assert.match(utils, /rewardStreakChestTrailItems\?: FarmActivityRewardStreakChestTrailItem\[\]/);
  assert.match(utils, /rewardStreakChestActiveTrailLabel\?: string/);
  assert.match(utils, /rewardStreakChestActiveRewardLabel\?: string/);
  assert.match(utils, /rewardStreakChestActiveHint\?: string/);
  assert.match(utils, /rewardStreakChestNextRewardLabel\?: string/);
  assert.match(utils, /rewardStreakChestChargeLabel\?: string/);
  assert.match(utils, /rewardStreakChestChargeShortLabel\?: string/);
  assert.match(utils, /rewardStreakChestChargeHint\?: string/);
  assert.match(utils, /function farmActivityRewardStreakChestActiveTrailItem\(items: FarmActivityRewardStreakChestTrailItem\[\] \| undefined\)/);
  assert.match(utils, /function farmActivityRewardStreakChestActiveHint/);
  assert.match(utils, /function farmActivityRewardStreakMilestoneCompletionLabel\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakMilestoneRewardLabel\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakMilestoneRewardItems\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakChestPreview\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreak\(events: FarmEventLogItem\[\]\)/);
  assert.match(utils, /function farmActivityRewardStreakHint\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakTier\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakMilestoneLabel\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakMilestoneProgress\(streak: number\)/);
  assert.match(utils, /function farmActivityRewardStreakAction\(state: FarmCanvasState, streak: number\)/);
  assert.match(utils, /export interface FarmBeautyScore/);
  assert.match(utils, /export interface FarmBeautyReward/);
  assert.match(utils, /FARM_BEAUTY_REWARD_DEFINITIONS/);
  assert.match(utils, /export function buildFarmBeautyScore/);
  assert.match(utils, /export function buildFarmBeautyRewards/);
  assert.match(types, /export interface FarmAnimalState/);
  assert.match(types, /animalProducts: Partial<Record<FarmAnimalProductId, number>>/);
  assert.match(types, /animals: FarmAnimalState\[\]/);
  assert.match(types, /selectedBuildingId\?: string/);
  assert.match(types, /selectedDecorId\?: string/);
  assert.match(types, /selectedObjectId\?: string/);
  assert.match(types, /farmCanvas\?: FarmCanvasState/);
  assert.match(canvas, /import \{[\s\S]*FARM_BUILDING_DEFINITIONS[\s\S]*FARM_DECOR_DEFINITIONS[\s\S]*createFarmState[\s\S]*sanitizeFarmCanvasState[\s\S]*type FarmToolAction[\s\S]*\} from '\.\.\/utils\/farmCanvas'/);
  assert.match(canvas, /farmCanvas,\s*setFarmCanvas/);
  assert.match(canvas, /const nextFarmCanvas = pendingSave\?\.farmCanvas \|\| sanitizeFarmCanvasState\(data\.farmCanvas\)/);
  assert.match(canvas, /snapshot = JSON\.stringify\(\{ nodes: persistNodes, edges: persistEdges, creativeDesk, nextNodeSerialId, farmCanvas \}\)/);
  assert.match(canvas, new RegExp('pay' + 'load = \\{ nodes: persistNodes, edges: persistEdges, viewport: getViewport\\(\\), nextNodeSerialId, creativeDesk, farmCanvas \\}'));
  assert.match(canvas, /farmCanvas: sanitizeFarmCanvasState\(data\.farmCanvas\)/);
  assert.match(canvas, /setFarmCanvas\(sanitizeFarmCanvasState\(source\.farmCanvas\)\)/);
  assert.match(canvas, /const message = next\.lastDailySummary\?\.message \|\| '新的一天开始了，已浇水的作物继续成长。'/);
  assert.match(canvas, /setFarmCanvasFeedback\(message\)/);
  assert.match(farmRoadmap, /Phase 3：全画布牧场对象层|全画布种植\/建造\/装饰养成层/);
});

test('canvas route persists sanitized farm canvas state and mirrors it in auto-save', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-farm-canvas-route-'));
  const dataDir = path.join(tmpDir, 'data');
  const autoRoot = path.join(tmpDir, 'auto');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ canvasAutoSavePath: autoRoot }), 'utf8');

  const config = require('../backend/src/config.js');
  const oldConfig = {
    DATA_DIR: config.DATA_DIR,
    CANVAS_FILE: config.CANVAS_FILE,
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  config.DATA_DIR = dataDir;
  config.CANVAS_FILE = path.join(dataDir, 'canvas_list.json');
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = autoRoot;
  fs.writeFileSync(
    config.CANVAS_FILE,
    JSON.stringify([{ id: 'canvas-farm-test', name: '牧场画布', nodeCount: 1, createdAt: 1, updatedAt: 1 }]),
    'utf8',
  );

  const express = require('express');
  const canvasRouter = require('../backend/src/routes/canvas.js');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/canvas', canvasRouter);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const body = {
    nodes: [{ id: 'text-1', type: 'text', position: { x: 0, y: 0 }, data: { nodeSerialId: 1 } }],
    edges: [],
    viewport: { x: -80, y: 40, zoom: 0.75 },
    nextNodeSerialId: 2,
    farmCanvas: {
      version: 99,
      coordinateMode: 'viewport',
      gridSize: 0,
      day: -8,
      season: 'bad-season',
      weather: 'bad-weather',
      festivalId: 'bad id',
      resources: { gold: -10, wood: 2, stone: 1, water: 9999, experience: 5, seeds: { turnip: 2, bad: 99 } },
      inventory: { crops: { turnip: 1, bad: 3 }, animalProducts: { egg: 2, wool: 1, bad: 9 }, decorIds: ['wood-fence', 'wood-fence'] },
      objects: [
        { id: 'decor-1', kind: 'decor', x: 95, y: -95, widthCells: 1, heightCells: 1, decorId: 'sign', resourceId: 'data:image/png;base64,abc', createdDay: 1 },
        { id: 'plot-1', kind: 'plot', x: 128, y: 0, widthCells: 1, heightCells: 1, crop: { cropId: 'turnip', dryDays: 4, stage: 'mature' }, createdDay: 1 },
      ],
      animals: [
        { id: 'bad animal id', kind: 'dragon', name: 'bad', mood: 'wild', placedDay: -1, productCount: -1 },
        {
          id: 'cow-1',
          kind: 'cow',
          name: '奶牛 prompt: hidden https://example.com/cow.png C:\\Users\\Secret\\cow.png',
          mood: 'happy',
          placedDay: 1,
          lastProducedDay: 99,
          productCount: 5,
        },
      ],
      orders: [],
      eventLog: [
        {
          id: 'unsafe-event',
          kind: 'bad-kind',
          day: -1,
          message: 'prompt: hidden https://example.com/out.png data:image/png;base64,abc C:\\Users\\Secret\\out.png',
          cropId: 'bad',
          objectKind: 'bad',
          rareEventId: 'rare-event-1-giant-turnip-plot',
          createdAt: 0,
        },
      ],
      lastDailySummary: {
        id: 'unsafe-summary',
        fromDay: -2,
        toDay: -1,
        message: 'prompt: hidden https://example.com/summary.png data:image/png;base64,abc C:\\Users\\Secret\\summary.png',
        harvestedCrops: -1,
        ordersCompleted: 1,
        goldEarned: 999999999,
        weather: 'festival',
        festivalId: 'spring-sowing-7',
        rainWateredCrops: 2,
        festivalBonusGold: 999999999,
        animalProductsProduced: 999999,
        animalProductSummary: '牛奶 x1 https://example.com C:\\Users\\Secret\\milk.png prompt: hidden',
        npcVisitsCompleted: 999999,
        rareEventsFound: 999999,
        rareEventSummary: '巨大萝卜 https://example.com C:\\Users\\Secret\\rare.png prompt: hidden',
        readyOrders: 999999,
        readyNpcVisits: 999999,
        dailyWaterCapacity: 999999,
        scarecrowProtectedCrops: 999999,
        wateredCrops: 2,
        dryCrops: 3,
        witheredCrops: 4,
        newMatureCrops: 5,
        matureCrops: 6,
        nextMatureCrops: 7,
        highlights: ['https://example.com/a', 'prompt: bad', '安全摘要'],
        createdAt: 0,
      },
      festivalTasks: [
        {
          id: 'bad task id',
          festivalId: 'bad festival id',
          title: '节庆委托',
          description: 'prompt: hidden https://example.com/task.png data:image/png;base64,abc C:\\Users\\Secret\\task.png',
          kind: 'bad-kind',
          target: 99,
          progress: 99,
          rewards: { gold: 999999999, wood: 3, seeds: { sunflower: 2, bad: 9 }, decorIds: ['wood-fence', 'bad id'] },
          completed: true,
          completedDay: -2,
        },
      ],
      rareEvents: [
        {
          id: 'bad rare event id',
          eventId: 'giant-turnip',
          title: '巨大萝卜 https://example.com C:\\Users\\Secret\\rare.png',
          message: 'prompt: hidden https://example.com/rare.png data:image/png;base64,abc C:\\Users\\Secret\\rare.png',
          day: 99,
          cropId: 'turnip',
          rewards: { gold: 999999999, seeds: { turnip: 2, bad: 9 }, decorIds: ['wood-fence', 'bad id'] },
        },
      ],
      stats: { plotsTilled: -5, rareEventsFound: 999999999, buildingsPlaced: 999999999, decorPlaced: 999999999 },
      selectedTool: 'hoe',
    },
  };

  const saved = await fetch(`${base}/api/canvas/canvas-farm-test`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json());
  assert.equal(saved.success, true);

  const loaded = await fetch(`${base}/api/canvas/canvas-farm-test`).then((res) => res.json());
  assert.equal(loaded.success, true);
  assert.equal(loaded.data.farmCanvas.version, 1);
  assert.equal(loaded.data.farmCanvas.coordinateMode, 'flow');
  assert.equal(loaded.data.farmCanvas.gridSize, FARM_GRID_SIZE);
  assert.equal(loaded.data.farmCanvas.day, 1);
  assert.equal(loaded.data.farmCanvas.weather, 'sunny');
  assert.equal(loaded.data.farmCanvas.festivalId, undefined);
  assert.equal(loaded.data.farmCanvas.resources.gold, 0);
  assert.equal(loaded.data.farmCanvas.resources.water, 999);
  assert.equal(loaded.data.farmCanvas.resources.seeds.turnip, 2);
  assert.equal(loaded.data.farmCanvas.resources.seeds.bad, undefined);
  assert.equal(loaded.data.farmCanvas.inventory.animalProducts.egg, 2);
  assert.equal(loaded.data.farmCanvas.inventory.animalProducts.wool, 1);
  assert.equal(loaded.data.farmCanvas.inventory.animalProducts.bad, undefined);
  assert.equal(loaded.data.farmCanvas.objects[0].x, 64);
  assert.equal(loaded.data.farmCanvas.objects[0].y, -128);
  assert.equal(loaded.data.farmCanvas.objects[0].resourceId, undefined);
  assert.equal(loaded.data.farmCanvas.objects[1].crop.stage, 'withered');
  assert.equal(loaded.data.farmCanvas.animals.length, 1);
  assert.equal(loaded.data.farmCanvas.animals[0].kind, 'cow');
  assert.equal(loaded.data.farmCanvas.animals[0].lastProducedDay, 1);
  assert.equal(loaded.data.farmCanvas.animals[0].name.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.animals[0].name.includes('Secret'), false);
  assert.equal(loaded.data.farmCanvas.orders.length, 3);
  assert.equal(loaded.data.farmCanvas.eventLog.length, 1);
  assert.equal(loaded.data.farmCanvas.eventLog[0].kind, 'tool_feedback');
  assert.equal(loaded.data.farmCanvas.eventLog[0].message.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.eventLog[0].message.includes('Secret'), false);
  assert.equal(loaded.data.farmCanvas.eventLog[0].message.includes('prompt:'), false);
  assert.equal(loaded.data.farmCanvas.eventLog[0].rareEventId, 'rare-event-1-giant-turnip-plot');
  assert.equal(loaded.data.farmCanvas.lastDailySummary.fromDay, 1);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.message.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.message.includes('Secret'), false);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.harvestedCrops, 0);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.goldEarned, 9999999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.weather, 'festival');
  assert.equal(loaded.data.farmCanvas.lastDailySummary.festivalId, 'spring-sowing-7');
  assert.equal(loaded.data.farmCanvas.lastDailySummary.rainWateredCrops, 2);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.festivalBonusGold, 9999999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.animalProductsProduced, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.animalProductSummary.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.animalProductSummary.includes('Secret'), false);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.npcVisitsCompleted, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.rareEventsFound, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.rareEventSummary.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.rareEventSummary.includes('Secret'), false);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.readyOrders, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.readyNpcVisits, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.dailyWaterCapacity, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.scarecrowProtectedCrops, 9999);
  assert.equal(loaded.data.farmCanvas.lastDailySummary.witheredCrops, 4);
  assert.equal(loaded.data.farmCanvas.festivalTasks.length, 1);
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].festivalId, 'festival-1');
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].kind, 'complete-orders');
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].target, 9);
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].progress, 9);
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].description.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].rewards.seeds.sunflower, 2);
  assert.equal(loaded.data.farmCanvas.festivalTasks[0].rewards.seeds.bad, undefined);
  assert.equal(loaded.data.farmCanvas.rareEvents.length, 1);
  assert.equal(loaded.data.farmCanvas.rareEvents[0].id, 'rare-event-1-giant-turnip-0');
  assert.equal(loaded.data.farmCanvas.rareEvents[0].eventId, 'giant-turnip');
  assert.equal(loaded.data.farmCanvas.rareEvents[0].message.includes('example.com'), false);
  assert.equal(loaded.data.farmCanvas.rareEvents[0].message.includes('Secret'), false);
  assert.equal(loaded.data.farmCanvas.rareEvents[0].rewards.seeds.turnip, 2);
  assert.equal(loaded.data.farmCanvas.rareEvents[0].rewards.seeds.bad, undefined);
  assert.equal(loaded.data.farmCanvas.stats.rareEventsFound, 999999);
  assert.equal(loaded.data.farmCanvas.stats.buildingsPlaced, 999999);
  assert.equal(loaded.data.farmCanvas.stats.decorPlaced, 999999);

  const mirrored = await fetch(`${base}/api/canvas/canvas-farm-test/auto-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json());
  assert.equal(mirrored.success, true);
  const mirrorPayload = JSON.parse(fs.readFileSync(mirrored.data.path, 'utf8'));
  assert.equal(mirrorPayload.farmCanvas.coordinateMode, 'flow');
  assert.equal(mirrorPayload.farmCanvas.weather, 'sunny');
  assert.equal(mirrorPayload.farmCanvas.animals.length, 1);
  assert.equal(mirrorPayload.farmCanvas.inventory.animalProducts.egg, 2);
  assert.equal(mirrorPayload.farmCanvas.orders.length, 3);
  assert.equal(mirrorPayload.farmCanvas.festivalTasks.length, 1);
  assert.equal(mirrorPayload.farmCanvas.rareEvents.length, 1);
  assert.equal(mirrorPayload.farmCanvas.eventLog[0].kind, 'tool_feedback');
  assert.equal(mirrorPayload.farmCanvas.lastDailySummary.message.includes('example.com'), false);

  const created = await fetch(`${base}/api/canvas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '新牧场' }),
  }).then((res) => res.json());
  assert.equal(created.success, true);
  const createdCanvas = await fetch(`${base}/api/canvas/${created.data.id}`).then((res) => res.json());
  assert.equal(createdCanvas.data.farmCanvas.coordinateMode, 'flow');
  assert.equal(createdCanvas.data.farmCanvas.weather, 'sunny');
  assert.equal(createdCanvas.data.farmCanvas.animals.length, 1);
  assert.equal(createdCanvas.data.farmCanvas.animals[0].kind, 'chicken');
  assert.equal(createdCanvas.data.farmCanvas.orders.length, 3);
  assert.equal(createdCanvas.data.farmCanvas.festivalTasks.length, 0);
  assert.equal(createdCanvas.data.farmCanvas.rareEvents.length, 0);
  assert.equal(createdCanvas.data.farmCanvas.eventLog.length, 0);
  assert.equal(createdCanvas.data.farmCanvas.lastDailySummary, undefined);
});
