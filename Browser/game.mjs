import {fighter,move,attack,tickCombat,pillars} from './combat.mjs';
import {ArenaView} from './view3d.mjs';
const $=s=>document.querySelector(s),canvas=$('#arena');
let view;
try { view=new ArenaView(canvas); }
catch(error){
 $('#description').textContent='3D graphics could not start. Enable hardware acceleration and use a browser with WebGL 2 support.';
 $('#notice').textContent='Try a current version of Chrome, Edge, Firefox, or Safari.';
 $('#play').disabled=true;
 throw error;
}
let player,bots,all,keys=new Set(),held=null,right=false,mode='menu',time=180,kills=0,deaths=0,last=0,feed=[],audio,yaw=-Math.PI/2,pitch=.13,accumulator=0;
addEventListener('resize',()=>view.resize());
function reset(){view.reset();player=fighter(0,220,true);bots=[fighter(-280,-170),fighter(250,-200),fighter(0,-340)];all=[player,...bots];kills=0;deaths=0;time=180;feed=[];held=null;right=false;keys.clear();yaw=-Math.PI/2;pitch=.13;}
reset();
function captureMouse(){
 if(document.pointerLockElement===canvas)return;
 try { const request=canvas.requestPointerLock?.();request?.catch(()=>{$('#lookHint').textContent='Mouse capture unavailable · Use ← → to turn';}); } catch { $('#lookHint').textContent='Use ← → to turn'; }
}
function start(){if(mode!=='paused')reset();mode='playing';accumulator=0;$('#overlay').classList.add('hidden');captureMouse();if(!audio){try{audio=new (window.AudioContext||window.webkitAudioContext)();}catch{}}audio?.resume();}
$('#play').onclick=start;
function pause(){if(mode==='playing'){mode='paused';held=null;right=false;keys.clear();document.exitPointerLock?.();$('#overlay').classList.remove('hidden');$('#play').textContent='RESUME THE FIGHT →';$('#description').textContent='The arena waits. Your match is paused.';}else if(mode==='paused')start();}
$('#pause').onclick=pause;
addEventListener('blur',()=>{if(mode==='playing')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&mode==='playing')pause();$('#lookHint').textContent=document.pointerLockElement===canvas?'MOUSE LOOK · ESC TO RELEASE':'CLICK ARENA TO CAPTURE MOUSE · ← → ALSO TURN';});
addEventListener('keydown',e=>{if(['Space','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&!e.repeat)pause();keys.add(e.code);});
addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('mousemove',e=>{if(mode!=='playing'||document.pointerLockElement!==canvas)return;yaw+=e.movementX*.0025;pitch=Math.max(-.2,Math.min(.85,pitch+e.movementY*.002));});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{if(mode!=='playing')return;if(document.pointerLockElement!==canvas)captureMouse();if(e.button===0)held=performance.now();if(e.button===2)right=true;});
addEventListener('mouseup',e=>{if(e.button===0&&held!==null){if(mode==='playing')attack(player,performance.now()-held>=350);held=null;}if(e.button===2)right=false;});
function sound(blocked,heavy){if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=blocked?'triangle':'sawtooth';osc.frequency.setValueAtTime(blocked?650:heavy?95:150,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(45,audio.currentTime+.1);gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+.13);}
function hit(a,b,blocked,heavy){view.impact(b,blocked);sound(blocked,heavy);if(b.hp===0){if(a.player){kills++;feed.unshift('You defeated a rival knight');}else if(b.player){deaths++;feed.unshift('You fell. Returning in 3 seconds…');}feed=feed.slice(0,3);}}
function respawn(f){let best={x:0,y:0},score=-1;for(let i=0;i<12;i++){const a=i*Math.PI/6,p={x:Math.cos(a)*440,y:Math.sin(a)*440};const d=Math.min(...all.filter(x=>x!==f&&x.hp>0).map(x=>Math.hypot(x.x-p.x,x.y-p.y)));if(d>score){score=d;best=p;}}Object.assign(f,fighter(best.x,best.y,f.player));}
function update(dt){time=Math.max(0,time-dt);
 if(player.hp>0){yaw+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*1.7;player.angle=yaw;player.block=right&&!player.attack&&player.stamina>0;const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);move(player,Math.cos(yaw)*forward-Math.sin(yaw)*side,Math.sin(yaw)*forward+Math.cos(yaw)*side,dt);}
 for(const b of bots){if(b.hp<=0)continue;const t=all.filter(x=>x!==b&&x.hp>0).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];if(!t)continue;const dx=t.x-b.x,dy=t.y-b.y,d=Math.hypot(dx,dy);b.angle=Math.atan2(dy,dx);b.cooldown-=dt;b.block=!b.attack&&b.stamina>30&&!!t.attack&&d<150&&t.attack.t<t.attack.windup+.1;
 if(d>95){let mx=dx/Math.max(1,d),my=dy/Math.max(1,d);for(const p of pillars){const px=p.x-b.x,py=p.y-b.y,along=px*mx+py*my,cross=px*my-py*mx;if(along>0&&along<140&&Math.abs(cross)<p.r+b.r+15){const turn=cross>=0?1:-1;const ox=mx;mx=-my*turn;my=ox*turn;break;}}move(b,mx,my,dt);}else if(d<65)move(b,-dx/Math.max(1,d),-dy/Math.max(1,d),dt);
 if(d<120&&b.cooldown<=0&&!b.block){attack(b,Math.random()<.25);b.cooldown=1+Math.random()*.8;}}
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];if(a.hp<=0||b.hp<=0)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<40){const nx=d?dx/d:1,ny=d?dy/d:0,p=(40-d)/2;a.x-=nx*p;a.y-=ny*p;b.x+=nx*p;b.y+=ny*p;}}
 for(const f of all){move(f,0,0,0);tickCombat(f,all,dt,hit);if(f.hp<=0&&f.dead>=3)respawn(f);}

 if(kills>=8||time<=0){mode='ended';document.exitPointerLock?.();$('#overlay').classList.remove('hidden');$('#description').textContent=`${kills>=8?'Victory. You own the pit.':'The horn sounds. The match is over.'} ${kills} eliminations · ${deaths} deaths.`;$('#play').textContent='FIGHT AGAIN →';held=null;right=false;}}

function render(dt,now){
 view.render(all,player,yaw,pitch,mode,dt,now);
 const t=Math.ceil(time);$('#timer').textContent=`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`;
 $('#score').textContent=`${kills} / 8 ELIMINATIONS`;
 $('#health').style.width=`${player.hp/1.5}%`;$('#stamina').style.width=`${player.stamina}%`;
 $('#healthText').textContent=`${player.hp} / 150`;$('#staminaText').textContent=Math.ceil(player.stamina);
 $('#status').textContent=player.hp<=0?'RESPAWNING…':player.block?'GUARDING':player.attack?(player.attack.heavy?'HEAVY STRIKE':'SLASH'):held!==null?(performance.now()-held>=350?'HEAVY READY':'CHARGING'):'READY';
 $('#feed').textContent=feed.join(' · ');
}
function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;if(mode==='playing'){accumulator+=dt;while(accumulator>=1/60&&mode==='playing'){update(1/60);accumulator-=1/60;}}else accumulator=0;render(dt,now/1000);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
