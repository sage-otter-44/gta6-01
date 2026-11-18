// Node tests for Solmar Bay's rules: the world is pure logic with no DOM in
// it, so the whole simulation runs here. Run with `node test.mjs`.
import { MISSIONS, PLAYER, TOTAL_PAY } from './game/src/config.js';
import { createRandom } from './game/src/random.js';
import { createWorld, EVENT_ENTER, EVENT_OVER } from './game/src/world.js';

let pass = 0;
let fail = 0;

function check(name, ok) {
  if (ok) { pass += 1; console.log(`✓ ${name}`); }
  else { fail += 1; console.log(`✗ FAIL: ${name}`); }
}

function fresh(seed) {
  return createWorld(createRandom(seed ?? 7));
}

const STEP = 1 / 60;
const idle = { x: 0, y: 0, shoot: false };

// The seeded RNG repeats itself.
{
  const a = createRandom(42);
  const b = createRandom(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  check('seeded random repeats', seqA[0] === seqB[0] && seqA[1] === seqB[1] && seqA[2] === seqB[2] && seqA[0] !== seqA[1]);
}

// The city is built and the first mission is armed.
{
  const w = fresh();
  check('city has buildings', w.state.buildings.length > 10);
  check('traffic fills the roads', w.state.cars.length === 14);
  check('pedestrians walk the city', w.state.peds.length === 22);
  check('first mission is The Drop', w.state.mission === 0 && w.state.objective === 'Reach the pier');
  check('four missions pay $5,000 in all', TOTAL_PAY === 5000);
}

// Walking moves Mara and the city walls stop her.
{
  const w = fresh();
  const { x, y } = w.state.player;
  w.step(STEP, { x: 1, y: 0, shoot: false }, 0);
  check('walking east moves Mara east', w.state.player.x > x);
  check('walking keeps Mara on land', w.state.player.y < 1760);
  void y;
}

// The pier stage completes when Mara walks onto it (teleport-free: drive the
// world forward with a direct steer toward the objective).
{
  const w = fresh();
  const stage = MISSIONS[0].stages[0];
  w.state.player.x = stage.x - 30;
  w.state.player.y = stage.y;
  w.step(STEP, { x: 1, y: 0, shoot: false }, 0);
  check('reaching the pier advances the mission', w.state.stage === 1);
}

// Entering a parked car works; stealing a traffic car raises the heat.
{
  const w = fresh();
  const car = w.state.cars[0];
  car.driver = 'parked';
  car.x = w.state.player.x + 20;
  car.y = w.state.player.y;
  const events = w.step(STEP, idle, 1);
  check('E near a car gets Mara in', w.state.player.inCar === car);
  check('entering a car reports the event', (events & EVENT_ENTER) !== 0);
  check('stealing a car raises wanted to 1', w.state.wanted === 1);
}

// Driving accelerates, steers and stops at the water.
{
  const w = fresh();
  const car = w.state.cars[1];
  car.driver = 'parked';
  car.x = 1280; car.y = 700; car.angle = 0; car.speed = 0;
  w.state.player.x = car.x + 20; w.state.player.y = car.y;
  w.step(STEP, idle, 1);
  for (let i = 0; i < 120; i += 1) w.step(STEP, { x: 0, y: -1, shoot: false }, 0);
  check('driving builds speed', car.speed > 200);
  check('the car stays out of the bay', car.y < 1760);
}

// Shooting spends a cooldown, raises the heat, and can drop a gang member.
{
  const w2 = fresh();
  // Jump straight to mission 3: the guards spawn with it.
  w2.loadProgress(2, 0);
  check('gang members spawn for Dockside Debt', w2.state.gang.length === 4);
  const guard = w2.state.gang[0];
  w2.state.player.x = guard.x - 100;
  w2.state.player.y = guard.y;
  w2.state.player.angle = 0;
  w2.state.player.shootCd = 0;
  const before = guard.health;
  w2.step(STEP, { x: 0, y: 0, shoot: true }, 0);
  check('a shot in the cone hurts the guard', guard.health < before);
  check('shooting raises wanted', w2.state.wanted >= 1);
  check('a shot is counted', w2.state.stats.shots === 1);
}

// Wanted decays once the heat is off and no unit is near.
{
  const w = fresh();
  w.state.wanted = 2;
  w.state.wantedTimer = 0.01;
  for (let i = 0; i < 5; i += 1) w.step(STEP, idle, 0);
  check('wanted decays with no police near', w.state.wanted === 1);
}

// Police spawn while wanted and give up once it clears. Mara drives away
// from the chase: on foot and idle she would rightly get busted instead.
{
  const w = fresh();
  const car = w.state.cars[1];
  car.driver = 'parked';
  car.x = 1280; car.y = 700; car.angle = 0; car.speed = 0;
  w.state.player.x = car.x + 20; w.state.player.y = car.y;
  w.step(STEP, idle, 1);
  w.state.wanted = 3;
  for (let i = 0; i < 400; i += 1) w.step(STEP, { x: 0, y: -1, shoot: false }, 0);
  check('police spawn while wanted', w.state.police.length > 0);
  check('the chase does not wreck the car at once', w.state.player.inCar && w.state.player.inCar.health > 0);
  w.state.wanted = 0;
  // Foot off the gas: a car still ploughing through pedestrians would
  // rightly keep the heat on. Parked, the units leave within seconds.
  for (let i = 0; i < 60 * 60; i += 1) w.step(STEP, idle, 0);
  check('police leave once wanted clears', w.state.police.length === 0);
}

// Busted: a unit catches Mara on foot and stands over her.
{
  const w = fresh();
  w.state.wanted = 1;
  const unit = w.spawnPoliceCar();
  w.state.police.push(unit);
  unit.x = w.state.player.x + 10;
  unit.y = w.state.player.y;
  unit.speed = 0;
  let over = 0;
  for (let i = 0; i < 120; i += 1) {
    over = w.step(STEP, idle, 0);
    if (over & EVENT_OVER) break;
  }
  check('standing next to a unit gets Mara busted', w.state.over === 'busted');
}

// The heist ends the story: vault car home, $5,000 banked.
{
  const w = fresh();
  w.stageScene('end');
  check('the heist banks all $5,000', w.state.cash === 5000);
  check('the story ends complete', w.state.over === 'complete');
}

// The staged scenes are deterministic: same seed, same frame inputs.
{
  const a = fresh();
  const b = fresh();
  a.stageScene('drive');
  b.stageScene('drive');
  check('drive scene stages identically',
    !!a.state.player.inCar && !!b.state.player.inCar
    && a.state.cars[0].x === b.state.cars[0].x
    && a.state.cash === b.state.cash
    && a.state.wanted === b.state.wanted);
}

// Cash pickups pay out on touch.
{
  const w = fresh();
  const pk = w.state.pickups[0];
  w.state.player.x = pk.x;
  w.state.player.y = pk.y;
  w.step(STEP, idle, 0);
  check('a cash pickup pays $50', w.state.cash === 50 && pk.active === false);
}

// Health regenerates after a quiet spell.
{
  const w = fresh();
  w.state.player.health = 60;
  w.state.player.hurtTimer = 0;
  for (let i = 0; i < 120; i += 1) w.step(STEP, idle, 0);
  check('health regenerates when quiet', w.state.player.health > 60);
}

// The player cannot walk into the bay.
{
  const w = fresh();
  w.state.player.y = 1750;
  for (let i = 0; i < 60; i += 1) w.step(STEP, { x: 0, y: 1, shoot: false }, 0);
  check('Mara stays out of the water', w.state.player.y < 1760);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
