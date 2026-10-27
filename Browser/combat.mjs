export const RADIUS=560;
export const pillars=[{x:-240,y:-170,r:38},{x:240,y:-170,r:38},{x:-240,y:170,r:38},{x:240,y:170,r:38}];
export function fighter(x,y,player=false){return {x,y,player,r:20,angle:0,hp:150,stamina:100,block:false,attack:null,regenDelay:0,flash:0,dead:0,cooldown:0};}
export const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function attack(f,heavy=false){
 if(f.hp<=0||f.attack||f.block||f.stamina<(heavy?32:18))return false;
 f.stamina-=heavy?32:18;f.regenDelay=1;
 f.attack={heavy,t:0,windup:heavy?.42:.18,release:.2,recovery:heavy?.52:.32,hit:new Set()};return true;
}
export function move(f,dx,dy,dt){
 if(f.hp<=0)return;
 const length=Math.hypot(dx,dy);if(length>1){dx/=length;dy/=length;}
 const speed=f.block?95:f.attack?130:210;
 f.x+=dx*speed*dt;f.y+=dy*speed*dt;
 for(const p of pillars){const d=Math.hypot(f.x-p.x,f.y-p.y),min=p.r+f.r;if(d<min){f.x=p.x+(d?(f.x-p.x)/d:1)*min;f.y=p.y+(d?(f.y-p.y)/d:0)*min;}}
 const d=Math.hypot(f.x,f.y);if(d>RADIUS-f.r){f.x*= (RADIUS-f.r)/d;f.y*=(RADIUS-f.r)/d;}
}
function occluded(a,b){return pillars.some(p=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(a.x+t*dx-p.x,a.y+t*dy-p.y)<p.r;});}
export function tickCombat(f,all,dt,onHit=()=>{}){
 if(f.hp<=0){f.dead+=dt;return;}
 f.flash=Math.max(0,f.flash-dt);f.regenDelay=Math.max(0,f.regenDelay-dt);
 if(f.block){f.stamina=Math.max(0,f.stamina-8*dt);f.regenDelay=.75;if(!f.stamina)f.block=false;}
 else if(!f.attack&&!f.regenDelay)f.stamina=Math.min(100,f.stamina+22*dt);
 const a=f.attack;if(!a)return;
 const prev=a.t;a.t+=dt;
 if(a.t>=a.windup&&prev<=a.windup+a.release){
  const from=Math.max(0,Math.min(1,(prev-a.windup)/a.release));
  const to=Math.max(0,Math.min(1,(a.t-a.windup)/a.release));
  for(const v of all){
   if(v===f||v.hp<=0||a.hit.has(v))continue;
   const distance=Math.hypot(v.x-f.x,v.y-f.y),direction=Math.atan2(v.y-f.y,v.x-f.x);
   const offset=angleDiff(direction,f.angle),lo=-1.05+from*2.1,hi=-1.05+to*2.1;
   if(distance>112+v.r||offset<lo-.28||offset>hi+.28||occluded(f,v))continue;
   a.hit.add(v);
   const facing=Math.abs(angleDiff(v.angle,direction+Math.PI))<=Math.PI/3;
   const blocked=v.block&&facing&&v.stamina>=25;
   if(blocked){v.stamina-=25;v.regenDelay=1;}
   else{if(v.block&&facing){v.stamina=0;v.block=false;}v.hp=Math.max(0,v.hp-(a.heavy?36:20));v.flash=.15;if(!v.hp){v.attack=null;v.block=false;}}
   onHit(f,v,blocked,a.heavy);
  }
 }
 if(a.t>=a.windup+a.release+a.recovery)f.attack=null;
}
