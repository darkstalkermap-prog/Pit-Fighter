// The same views of any build, for before-and-after comparisons of the graphics: the inventory portrait of each
// path's witch, the hero in play by day and by night, the quest givers, and a wide view of the hills.
// Usage: node Scripts/beauty_shots.mjs <page.html> <out folder> [quality] [view,view…]
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const [file,outDir,quality='high',only]=process.argv.slice(2);
const html=await readFile(file);
await mkdir(outDir,{recursive:true});
const server=createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const hideHud=()=>{for(const id of ['#spells','footer','#quest','#toast','#chatLog'])document.querySelector(id)?.style&&(document.querySelector(id).style.visibility='hidden');};
// Each view: class, where to stand relative to its hearth (or absolutely), where to look, time of day.
const views=[
 {name:'day-bloom',cls:'bloom',at:'elder',time:.42,turn:Math.PI*.75,pitch:.08},
 {name:'day-hex',cls:'hex',at:'elder',time:.4,turn:Math.PI*.75,pitch:.08},
 {name:'behind-wild',cls:'wild',at:'hill',time:.36,turn:0,pitch:.25},
 {name:'vista-gloamwood',cls:'hex',at:[-1050,-600],time:.33,look:[0,0],pitch:.14},
 {name:'night-bog',cls:'bog',at:'elder',time:.95,turn:Math.PI*.75,pitch:.1},
];
try{
 for(const v of views.filter(v=>!only||only.split(',').includes(v.name))){
  const page=await(await browser.newContext({viewport:{width:1280,height:800}})).newPage();
  page.on('pageerror',e=>console.log('ERR',v.name,e.message));
  await page.addInitScript(q=>{try{localStorage.setItem('coven-gfx',q);localStorage.setItem('coven-music','0');}catch{}},quality);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>!!window.__coven);
  await page.click('#play');await page.click(`[data-class="${v.cls}"]`);
  await page.waitForFunction(()=>__coven.mode==='playing');
  await page.evaluate(([v,hide])=>{
   const C=__coven,s=C.state,p=s.player,h=C.world.hearthOf(C.world.region(p.x,p.z)),ex=h.x+3,ez=h.z+3;
   let yaw;
   if(v.at==='elder'){yaw=v.turn+Math.PI;p.x=ex-Math.sin(yaw)*2.2-Math.cos(yaw)*.5;p.z=ez+Math.cos(yaw)*2.2-Math.sin(yaw)*.5;p.yaw=yaw+Math.PI;}
   else if(v.at==='hill'){p.x=h.x+60;p.z=h.z+40;yaw=Math.atan2(-p.z,-p.x)+v.turn;p.yaw=yaw;}
   else{[p.x,p.z]=v.at;yaw=Math.atan2(v.look[1]-p.z,v.look[0]-p.x);p.yaw=yaw;}
   p.y=C.world.ground(p.x,p.z);s.dayTime=v.time;C.aim(yaw,v.pitch);
   new Function(hide)();
  },[v,`(${hideHud})()`]);
  await page.waitForTimeout(9000);
  await page.screenshot({path:`${outDir}/${v.name}.png`});
  if(v.at==='elder'){
   // The turning inventory portrait, caught facing front.
   await page.keyboard.press('Tab');await page.waitForTimeout(2500);
   await page.locator('#heroCanvas').screenshot({path:`${outDir}/portrait-${v.cls}.png`});
  }
  await page.context().close();
 }
}finally{await browser.close();server.close();}
