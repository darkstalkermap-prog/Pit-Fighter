import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const html=await readFile(new URL('../_site/index.html',import.meta.url));
const server=createServer((req,res)=>{if(req.url==='/Coven/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const shot=async(page,name)=>page.screenshot({path:new URL(`../test-results/${name}.png`,import.meta.url).pathname});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon'))errors.push(msg.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/Coven/`);
 await page.waitForTimeout(1500);
 assert.equal(await page.locator('#play').isEnabled(),true,'WebGL initializes');
 assert.ok(await page.evaluate(()=>!!document.querySelector('canvas').getContext('webgl2')),'Uses WebGL 2');
 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 await shot(page,'menu');

 await page.click('#play');
 assert.equal(await page.locator('#classCards .card').count(),4,'Four witch classes offered');
 await shot(page,'classes');
 await page.click('[data-class="bog"]');
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>__coven.mode),'playing');
 assert.equal(await page.evaluate(()=>__coven.state.player.class),'bog');
 assert.equal(await page.evaluate(()=>__coven.world.region(__coven.state.player.x,__coven.state.player.z)),'swamp','Bog Witch starts in the Mirefen');

 const before=await page.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z}));
 await page.keyboard.down('KeyW');await page.waitForTimeout(800);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z}));
 assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>1,'Player walks');
 assert.equal(await page.locator('#spells .spell').count(),7,'Spell bar shows class and coven spells');
 assert.match(await page.locator('#prompt').textContent()+await page.locator('#questTitle').textContent(),/Elder/,'Elder quest is shown');

 // Found a village and brew at the cauldron through the real UI.
 await page.evaluate(()=>{const p=__coven.state.player;Object.assign(p.inv,{wood:30,stone:30,sunpetal:2,honeyclover:1});});
 await page.keyboard.press('KeyB');
 await page.locator('[data-build="heart"]').click();
 await page.keyboard.press('KeyB');
 await page.evaluate(()=>{__coven.state.player.yaw+=Math.PI/2;});
 await page.locator('[data-build="cauldron"]').click();
 assert.deepEqual(await page.evaluate(()=>__coven.state.buildings.map(b=>b.type)),['heart','cauldron']);
 await page.evaluate(()=>{const p=__coven.state.player,c=__coven.state.buildings[1];p.x=c.x+2;p.z=c.z;});
 await page.keyboard.press('Tab');
 await page.locator('[data-tab="alchemy"]').click();
 await page.locator('[data-craft="healing"]').click();
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.healing>=1),true,'Brewed a Healing Draught');
 for(const t of ['skills','coven','craft','items'])await page.locator(`[data-tab="${t}"]`).click();
 await shot(page,'pack');
 await page.keyboard.press('Escape');

 // A two-witch rite is refused alone and works once a sister stands with you.
 await page.evaluate(()=>{const p=__coven.state.player;p.skills.spellcraft=1000;p.inv.covenInk=2;p.mana=p.maxMana;__coven.cast(3);});
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.covenInk),2,'Coven spell needs a coven');
 await page.evaluate(()=>{const p=__coven.state.player;p.coven.push('hex');__coven.allies.push({id:999,ally:'witch',cls:'hex',x:p.x+2,z:p.z,y:p.y,yaw:0,life:Infinity,cooldown:0,walk:0});__coven.cast(3);});
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.covenInk),1,'Binding Circle cast with two witches');

 // Hunt: a wolf in front of you falls to Leech Bolts and drops loot.
 await page.evaluate(()=>{const p=__coven.state.player;p.mana=p.maxMana=999;p.hp=p.maxHp=999;__coven.spawn('wolf',p.x+Math.cos(p.yaw)*10,p.z+Math.sin(p.yaw)*10);});
 for(let i=0;i<15&&!(await page.evaluate(()=>__coven.state.player.stats.kills));i++){await page.keyboard.press('Digit1');await page.waitForTimeout(1300);}
 assert.equal(await page.evaluate(()=>__coven.state.player.stats.kills),1,'Wolf slain by spells');
 assert.ok(await page.evaluate(()=>__coven.state.player.inv.hide>=2),'Wolf dropped hide');

 await page.keyboard.press('KeyM');await page.waitForTimeout(300);
 assert.equal(await page.locator('#map').isVisible(),true);
 await shot(page,'map');
 await page.keyboard.press('KeyM');

 // Visit the Crown and see the warded boss.
 await page.evaluate(()=>{const p=__coven.state.player;p.x=60;p.z=60;p.y=__coven.world.ground(60,60);p.hp=p.maxHp=5000;});
 await page.waitForTimeout(1500);
 assert.equal(await page.evaluate(()=>__coven.boss?.warded),true,'Unwitch appears warded');
 await page.evaluate(()=>{const p=__coven.state.player;p.x=12;p.z=0;for(const cls of ['bloom','wild'])if(!p.coven.includes(cls)){p.coven.push(cls);__coven.allies.push({id:990+p.coven.length,ally:'witch',cls,x:p.x,z:p.z+2,y:p.y,yaw:0,life:Infinity,cooldown:0,walk:0});}for(const a of __coven.allies){a.x=p.x+1;a.z=p.z+1;}p.inv.heartSigil=1;p.mana=p.maxMana;__coven.cast(6);});
 assert.equal(await page.evaluate(()=>__coven.boss?.warded),false,'Grand Rite of four witches breaks the ward');
 assert.ok(await page.evaluate(()=>__coven.boss.hp<=5600),'Grand Rite deals full damage once the ward breaks');
 await shot(page,'crown');
 assert.deepEqual(errors,[],'No browser errors');
 console.log('PASS: WebGL 2, Pages subpath, class choice, homeland start, walking, spell bar, village building, alchemy, coven gating, hunting and loot, map, boss ward and Grand Rite, no browser errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
