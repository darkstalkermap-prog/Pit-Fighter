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
