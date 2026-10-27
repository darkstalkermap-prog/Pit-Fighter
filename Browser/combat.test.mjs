import test from 'node:test';import assert from 'node:assert/strict';
import {fighter,attack,tickCombat,move,RADIUS} from './combat.mjs';
function swing(a,b,heavy=false){assert.ok(attack(a,heavy));for(let i=0;i<120;i++)tickCombat(a,[a,b],.01);}
test('light/heavy damage applies once per swing',()=>{const a=fighter(0,0),b=fighter(90,0);swing(a,b);assert.equal(b.hp,130);swing(a,b,true);assert.equal(b.hp,94);});
test('front guard costs stamina; rear attack bypasses guard',()=>{const a=fighter(0,0),b=fighter(90,0);b.block=true;b.angle=Math.PI;swing(a,b);assert.equal(b.hp,150);assert.equal(b.stamina,75);b.angle=0;swing(a,b);assert.equal(b.hp,130);});
test('insufficient guard stamina breaks block',()=>{const a=fighter(0,0),b=fighter(90,0);b.block=true;b.angle=Math.PI;b.stamina=10;swing(a,b);assert.equal(b.hp,130);assert.equal(b.stamina,0);assert.equal(b.block,false);});
test('range and pillars prevent damage',()=>{let a=fighter(0,0),b=fighter(160,0);swing(a,b);assert.equal(b.hp,150);a=fighter(180,170);b=fighter(300,170);swing(a,b);assert.equal(b.hp,150);});
test('rejects dead, blocking, exhausted, or busy attacks',()=>{for(const values of [{hp:0},{block:true},{stamina:10},{attack:{}}])assert.equal(attack(Object.assign(fighter(0,0),values)),false);});
test('death cancels attacks and movement',()=>{const a=fighter(0,0),b=fighter(90,0);b.hp=10;b.attack={t:0};swing(a,b);assert.equal(b.hp,0);assert.equal(b.attack,null);move(b,1,0,1);assert.equal(b.x,90);});
test('stamina waits for delay and caps at 100',()=>{const a=fighter(0,0);a.stamina=40;a.regenDelay=1;tickCombat(a,[a],.5);assert.equal(a.stamina,40);tickCombat(a,[a],.5);assert.equal(a.stamina,51);tickCombat(a,[a],10);assert.equal(a.stamina,100);});
test('movement respects walls and pillars',()=>{const a=fighter(530,0);move(a,1,0,1);assert.ok(Math.hypot(a.x,a.y)<=RADIUS-a.r+.001);a.x=200;a.y=170;move(a,1,0,.1);assert.ok(Math.hypot(a.x-240,a.y-170)>=58-.001);});
