import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub, BOSS_HP, BOSS_RESPAWN_MS, BOSS_IDLE_RESET_MS } from './hub.mjs';

function setup() {
  let t = 1000;
  const hub = createHub({ now: () => t });
  const join = (name, extra = {}) => {
    const inbox = [], c = hub.connect(m => inbox.push(JSON.parse(m)));
    c.receive({ type: 'hello', name, world: 'isle', cls: 'hex', key: name, ...extra });
    return { c, inbox, last: type => inbox.filter(m => m.type === type).at(-1) };
  };
  return { hub, join, advance: ms => { t += ms; } };
}

test('players in a world see each other join, move and leave', () => {
  const { hub, join } = setup();
  const a = join('Agnes'), b = join('Bryony', { coven: 'Thorns' });
  assert.equal(a.last('welcome').players.length, 0);
  assert.deepEqual(b.last('welcome').players.map(p => p.name), ['Agnes']);
  assert.equal(a.last('join').player.coven, 'Thorns');
  b.c.receive({ type: 'state', x: 10, y: 5, z: -3, yaw: 1, hp: 50, maxHp: 90, moving: true });
  hub.tick();
  assert.deepEqual(a.last('snap').players.filter(p => p.id !== a.c.id).map(p => [p.name, p.x, p.moving]), [['Bryony', 10, true]]);
  b.c.close();
  assert.equal(a.last('leave').id, b.c.id);
});

test('worlds are separate and names are cleaned', () => {
  const { join } = setup();
  join('A');
  const other = join('B', { world: 'Secret Grove!' });
  assert.equal(other.last('welcome').world, 'secretgrove');
  assert.equal(other.last('welcome').players.length, 0);
  const odd = join('\u0000<b>x</b>' + 'y'.repeat(50));
  assert.equal(odd.last('welcome').players.length, 1);
  assert.ok(!odd.c.receive({ type: 'nonsense' }));
});

test('harvested nodes are shared, including with late joiners, until they regrow', () => {
  const { join, advance } = setup();
  const a = join('A'), b = join('B');
  a.c.receive({ type: 'harvest', node: '3,4,17', seconds: 600 });
  assert.equal(b.last('harvest').node, '3,4,17');
  advance(100 * 1000);
  assert.deepEqual(join('C').last('welcome').harvested, [['3,4,17', 500]]);
  advance(600 * 1000);
  assert.deepEqual(join('D').last('welcome').harvested, []);
});

test('villages are shared and validated', () => {
  const { join } = setup();
  const a = join('A', { buildings: [{ id: 1, type: 'heart', x: 5, y: 2, z: 5, rot: 0 }, { id: 2, type: 'castle', x: 0, y: 0, z: 0 }] });
  const b = join('B');
  assert.deepEqual(b.last('welcome').villages, [{ owner: 'A', name: 'A', list: [{ id: '1', type: 'heart', x: 5, y: 2, z: 5, rot: 0 }] }]);
  a.c.receive({ type: 'village', list: [{ id: 'w', type: 'well', x: 1, y: 1, z: 1, rot: 0 }] });
  assert.equal(b.last('village').list[0].type, 'well');
});

test('the Unwitch is shared: warded hits deal 10%, the rite breaks the ward, the kill is announced', () => {
  const { join, advance, hub } = setup();
  const a = join('A'), b = join('B');
  a.c.receive({ type: 'bossHit', amount: 100 });
  assert.equal(b.last('boss').boss.hp, BOSS_HP - 10);
  b.c.receive({ type: 'ward', seconds: 25 });
  assert.equal(a.last('boss').boss.warded, false);
  a.c.receive({ type: 'bossHit', amount: 1e9 });
  assert.equal(b.last('boss').boss.hp, BOSS_HP - 10 - 1500, 'single hits are capped');
  for (let i = 0; i < 4; i++) a.c.receive({ type: 'bossHit', amount: 1500 });
  assert.equal(b.last('bossDown').by, 'A');
  assert.equal(b.last('bossDown').boss.down, true);
  a.c.receive({ type: 'bossHit', amount: 100 });
  const before = b.inbox.length;
  a.c.receive({ type: 'bossHit', amount: 100 });
  assert.equal(b.inbox.length, before, 'no hits while she is down');
  advance(BOSS_RESPAWN_MS + 1); hub.tick();
  assert.equal(b.last('boss').boss.hp, BOSS_HP);
  assert.equal(b.last('boss').boss.down, false);
});

test('an abandoned fight resets the Unwitch', () => {
  const { join, advance, hub } = setup();
  const a = join('A');
  a.c.receive({ type: 'bossHit', amount: 500 });
  advance(BOSS_IDLE_RESET_MS + 1); hub.tick();
  assert.equal(a.last('boss').boss.hp, BOSS_HP);
});

test('chat is relayed, trimmed and rate limited', () => {
  const { join, advance } = setup();
  const a = join('A'), b = join('B');
  a.c.receive({ type: 'chat', text: '  hello sisters  ' });
  a.c.receive({ type: 'chat', text: 'spam' });
  assert.deepEqual(b.inbox.filter(m => m.type === 'chat').map(m => m.text), ['hello sisters']);
  advance(600);
  a.c.receive({ type: 'chat', text: 'x'.repeat(500) });
  assert.equal(b.last('chat').text.length, 200);
});

test('nothing is accepted before hello', () => {
  const { hub } = setup();
  const inbox = [], c = hub.connect(m => inbox.push(JSON.parse(m)));
  c.receive({ type: 'chat', text: 'hi' });
  c.receive({ type: 'harvest', node: 'x' });
  assert.equal(hub.worlds.size, 0);
  assert.equal(inbox.length, 0);
});

test('creatures are relayed to nearby players, and only their owner may report them', () => {
  const { hub, join } = setup();
  const a = join('A'), b = join('B'), far = join('Far');
  for (const [p, x] of [[a, 0], [b, 20], [far, 3000]]) p.c.receive({ type: 'state', x, y: 0, z: 0 });
  const id = a.c.id * 1e6 + 1;
  a.c.receive({ type: 'creatures', list: [{ id, kind: 'wolf', x: 10, y: 0, z: 0, hp: 40, maxHp: 40, state: 'chase' }] });
  b.c.receive({ type: 'creatures', list: [{ id, kind: 'wolf', x: 999, y: 0, z: 0, hp: 1, maxHp: 40 }] });
  b.c.receive({ type: 'creatures', list: [{ id: 5, kind: 'wolf', x: 0, y: 0, z: 0 }, { id: b.c.id * 1e6 + 1, kind: 'dragon', x: 0, z: 0 }] });
  hub.tick();
  assert.deepEqual(b.last('snap').creatures.map(c => [c.id, c.x, c.state]), [[id, 10, 'chase']], 'only the owner moves it; bad ids and kinds are ignored');
  assert.deepEqual(a.last('snap').creatures, [], 'owners are not sent their own creatures');
  assert.deepEqual(far.last('snap').creatures, [], 'out of range');
});

test('hits go to the owner, bites to the bitten, deaths to everyone', () => {
  const { join } = setup();
  const a = join('A'), b = join('B');
  const id = a.c.id * 1e6 + 7;
  a.c.receive({ type: 'creatures', list: [{ id, kind: 'boar', x: 0, y: 0, z: 0, hp: 50, maxHp: 50 }] });
  b.c.receive({ type: 'hit', id, amount: 30, poison: 4 });
  assert.deepEqual([a.last('hit').id, a.last('hit').amount, a.last('hit').from], [id, 30, b.c.id]);
  a.c.receive({ type: 'bite', to: b.c.id, damage: 9, poison: true, kind: 'boar' });
  assert.deepEqual([b.last('bite').damage, b.last('bite').poison], [9, true]);
  b.c.receive({ type: 'died', id, by: b.c.id });
  assert.equal(b.last('died'), undefined, 'only the owner can report a death');
  a.c.receive({ type: 'died', id, by: b.c.id });
  assert.deepEqual([b.last('died').id, b.last('died').by, b.last('died').kind], [id, b.c.id, 'boar']);
});

test('creatures pass to the nearest player when their owner leaves or lets them go', () => {
  const { hub, join } = setup();
  const a = join('A'), b = join('B'), c = join('C');
  for (const [p, x] of [[a, 0], [b, 30], [c, 2000]]) p.c.receive({ type: 'state', x, y: 0, z: 0 });
  const wolf = a.c.id * 1e6 + 1, deer = a.c.id * 1e6 + 2;
  a.c.receive({ type: 'creatures', list: [{ id: wolf, kind: 'wolf', x: 20, z: 0, hp: 40, maxHp: 40 }, { id: deer, kind: 'forestdeer', x: 1500, z: 0, hp: 30, maxHp: 30 }] });
  a.c.receive({ type: 'creatures', gone: [deer] });
  assert.equal(hub.worlds.get('isle').creatures.has(deer), false, 'no one near: it is let go');
  a.c.close();
  assert.equal(b.last('adopt').creature.id, wolf, 'B is nearest and adopts the wolf');
  assert.equal(c.last('adopt'), undefined);
  b.c.receive({ type: 'creatures', list: [{ id: wolf, kind: 'wolf', x: 25, z: 0, hp: 40, maxHp: 40 }] });
  hub.tick();
  assert.equal(hub.worlds.get('isle').creatures.get(wolf).x, 25, 'the new owner now runs it');
});
