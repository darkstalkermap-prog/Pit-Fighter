import * as THREE from 'three';
import {pillars,RADIUS} from './combat.mjs';

// Combat uses centimeters; convert only at the rendering boundary.
const S=1/50;
export class ArenaView {
 constructor(canvas){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#9bacad');this.scene.fog=new THREE.Fog('#9bacad',32,90);
  this.camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,120);
  this.ray=new THREE.Raycaster();this.obstacles=[];this.knights=new Map();this.effects=[];
  this.materials={};this.geometries={};
  this.scene.add(new THREE.HemisphereLight(0xc5dce8,0x75654b,2.1));
  const sun=new THREE.DirectionalLight(0xffdfac,3.5);sun.position.set(-12,22,-8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.normalBias=.04;this.scene.add(sun);
  this.buildArena();this.resize();
 }
 mat(color,metalness=0){const key=color+':'+metalness;return this.materials[key]??=new THREE.MeshStandardMaterial({color,roughness:metalness?.45:.95,metalness,flatShading:true});}
 box(parent,x,y,z,sx,sy,sz,color,metal=0){const g=this.geometries.box??=new THREE.BoxGeometry(1,1,1);const m=new THREE.Mesh(g,this.mat(color,metal));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 cylinder(parent,x,y,z,rt,rb,height,color,segments=12){const key=[rt,rb,height,segments].join(':');const g=this.geometries[key]??=new THREE.CylinderGeometry(rt,rb,height,segments);const m=new THREE.Mesh(g,this.mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 buildArena(){
  this.cylinder(this.scene,0,-.18,0,11.35,11.35,.35,'#ba9d6b',64);
  this.cylinder(this.scene,0,-.5,0,18,18,.4,'#686e57',64);
  // Radial masonry, spectator terraces and crenellations.
  for(let i=0;i<40;i++){
   const a=i*Math.PI*2/40,g=new THREE.Group();g.position.set(Math.cos(a)*11.65,0,Math.sin(a)*11.65);g.rotation.y=-a;this.scene.add(g);
   const wall=this.box(g,0,1.75,0,.9,3.5,1.85,i%3?'#7b7968':'#8c8874');this.obstacles.push(wall);
   this.box(g,0,3.6,0,1.1,.25,1.87,'#b1a68b');
   this.box(g,.05,4.05,0,1, .7,.85,'#8c8874');
   for(let row=0;row<3;row++)this.box(g,1.05+row*.8,2+row*.65,0,.9,.5,2.3+row*.12,'#63695e');
   if(i%5===0){
    const banner=this.box(g,-.52,2.6,0,.035,1.25,.65,i%10?'#3e6661':'#803d30');
    this.box(g,-.55,3.24,0,.08,.08,.85,'#b59c63',.5);
    this.box(g,-.55,2.6,0,.04,.6,.08,'#c9b47f');
   }
  }
  for(const p of pillars){
   const x=p.x*S,z=p.y*S;
   this.cylinder(this.scene,x,.16,z,.94,.98,.32,'#8f8b76');
   const column=this.cylinder(this.scene,x,1.7,z,p.r*S,p.r*S,3,'#a09a80');this.obstacles.push(column);
   this.cylinder(this.scene,x,3.27,z,.95,.95,.28,'#b5aa8c');
   this.cylinder(this.scene,x,3.52,z,.62,.85,.25,'#777764');
  }
  // Arena markings and pebbles have no separate collision; all blockers match combat.mjs.
  const ring=new THREE.Mesh(new THREE.RingGeometry(3.44,3.48,64),this.mat('#cdbb91'));ring.rotation.x=-Math.PI/2;ring.position.y=.006;this.scene.add(ring);
  for(let i=0;i<110;i++){const a=i*2.39996,r=Math.sqrt((i+.5)/110)*10.8;this.box(this.scene,Math.cos(a)*r,.015,Math.sin(a)*r,.05+(i%3)*.025,.03,.06,i%2?'#a28c68':'#c3aa7b');}
  this.flames=[];
  for(let i=0;i<8;i++){
   const a=(i+.5)*Math.PI/4,x=Math.cos(a)*10.9,z=Math.sin(a)*10.9;
   this.cylinder(this.scene,x,1.1,z,.07,.09,2.2,'#493c2c',8);
   this.cylinder(this.scene,x,2.15,z,.28,.12,.3,'#323630',8);
   const flame=new THREE.Mesh(new THREE.ConeGeometry(.2,.65,6),new THREE.MeshBasicMaterial({color:0xffb557}));flame.position.set(x,2.6,z);this.scene.add(flame);this.flames.push(flame);
  }
 }
 makeKnight(f){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);this.scene.add(root);
  const armor=f.player?'#a2b5b5':'#8e9390',cloth=f.player?'#285e62':'#773b32';
  this.box(body,0,1.09,0,.5,.65,.65,armor,.65);
  this.box(body,-.28,1.02,0,.05,.7,.46,cloth);
  this.box(body,.27,1.13,0,.05,.47,.38,cloth);
  this.box(body,.31,1.13,0,.035,.32,.05,'#cbb47b',.5);
  this.box(body,0,.78,0,.54,.09,.68,'#514636');
  this.cylinder(body,0,1.67,0,.25,.3,.4,armor,8);
  this.box(body,.24,1.7,0,.09,.055,.37,'#252e30');
  this.box(body,.29,1.58,0,.045,.16,.055,'#c6c7bb',.6);
  this.box(body,-.1,1.94,0,.25,.18,.1,cloth);
  const legs=[];
  for(const z of [-.2,.2]){const leg=new THREE.Group();leg.position.set(0,.77,z);body.add(leg);this.box(leg,0,-.22,0,.23,.48,.23,'#575f5e',.3);this.box(leg,.05,-.56,0,.36,.2,.26,'#3a3932');legs.push(leg);}
  const sword=new THREE.Group();sword.position.set(0,1.17,.37);body.add(sword);
  this.box(sword,.23,0,0,.45,.18,.2,armor,.6);this.box(sword,.55,0,0,.24,.09,.09,'#59412b');
  this.box(sword,.64,0,0,.07,.08,.4,'#c7ad70',.7);
  this.box(sword,1.18,0,0,1.04,.045,.11,'#d4dce0',.85);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.075,.22,4),this.mat('#d4dce0',.85));tip.rotation.z=-Math.PI/2;tip.position.set(1.8,0,0);sword.add(tip);
  const shield=new THREE.Group();body.add(shield);this.box(shield,0,0,0,.14,.79,.55,'#bfa474',.5);this.box(shield,.09,0,0,.045,.65,.43,cloth);this.box(shield,.13,0,0,.055,.5,.055,'#bfa474',.5);
  const health=new THREE.Group();root.add(health);health.position.y=2.25;
  this.box(health,0,0,0,.85,.065,.02,'#262f2a');const fill=this.box(health,0,0,.02,.85,.065,.02,f.player?'#7ac4a1':'#d2775a');
  if(f.player){const ring=new THREE.Mesh(new THREE.RingGeometry(.48,.51,32),new THREE.MeshBasicMaterial({color:0xd8bf7b,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;root.add(ring);}
  const model={root,body,legs,sword,shield,health,fill,lastX:f.x,lastY:f.y,walk:0};this.knights.set(f,model);return model;
 }
 reset(){for(const m of this.knights.values())this.scene.remove(m.root);this.knights.clear();for(const p of this.effects)this.scene.remove(p.mesh);this.effects=[];}
 impact(f,blocked){for(let i=0;i<8;i++){const mesh=new THREE.Mesh(this.geometries.spark??=new THREE.BoxGeometry(.06,.06,.06),this.mat(blocked?'#ffe2a0':'#bb694b'));mesh.position.set(f.x*S,1.2,f.y*S);this.scene.add(mesh);this.effects.push({mesh,v:new THREE.Vector3((Math.random()-.5)*4,Math.random()*3,(Math.random()-.5)*4),life:.4});}}
 resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
 render(all,player,yaw,pitch,mode,dt,now){
  for(const f of all){const m=this.knights.get(f)??this.makeKnight(f);m.root.position.set(f.x*S,0,f.y*S);m.body.rotation.y=-f.angle;
   const traveled=Math.hypot(f.x-m.lastX,f.y-m.lastY);m.walk+=traveled*.1;m.lastX=f.x;m.lastY=f.y;
   m.body.rotation.z=f.hp<=0?Math.PI/2:0;m.body.position.y=f.hp<=0?.3:0;
   m.legs.forEach((leg,i)=>leg.rotation.z=traveled>.02?Math.sin(m.walk+i*Math.PI)*.48:0);
   const a=f.attack;let angle=.45;if(a)angle=a.t<a.windup?-1.05:a.t<a.windup+a.release?-1.05+(a.t-a.windup)/a.release*2.1:1.05;
   m.sword.rotation.y=-angle;m.sword.rotation.z=a?.1: -.3;
   m.shield.position.set(f.block?.45:.05,1.13,f.block?-.08:-.45);m.shield.rotation.y=f.block?0:.4;
   m.health.visible=f.hp>0&&!f.player;m.health.quaternion.copy(this.camera.quaternion);m.fill.scale.x=.85*f.hp/150;m.fill.position.x=-(.85-.85*f.hp/150)/2;
  }
  if(mode==='menu'){
   this.camera.position.set(Math.cos(now*.04)*15,8,Math.sin(now*.04)*15);this.camera.lookAt(0,1,0);
  }else{
   const target=new THREE.Vector3(player.x*S,1.55,player.y*S),forward=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw));
   const desired=target.clone().addScaledVector(forward,-4.4*Math.cos(pitch));desired.y+=1.1+Math.sin(pitch)*4.4;
   desired.add(new THREE.Vector3(-Math.sin(yaw),0,Math.cos(yaw)).multiplyScalar(.55));
   // Shorten the boom when masonry intersects it; do not put the camera outside the arena.
   const direction=desired.clone().sub(target),length=direction.length();this.ray.set(target,direction.normalize());this.ray.far=length;
   const hit=this.ray.intersectObjects(this.obstacles,false)[0];if(hit)desired.copy(target).addScaledVector(direction,Math.max(.4,hit.distance-.22));
   this.camera.position.copy(desired);this.camera.lookAt(target.clone().addScaledVector(forward,3.4).add(new THREE.Vector3(0,-Math.sin(pitch)*1.8,0)));
  }
  for(const flame of this.flames)flame.scale.y=1+Math.sin(now*8+flame.position.x)*.12;
  for(const p of this.effects){p.life-=dt;p.v.y-=9*dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.scale.setScalar(Math.max(0,p.life/.4));if(p.life<=0)this.scene.remove(p.mesh);}this.effects=this.effects.filter(p=>p.life>0);
  this.renderer.render(this.scene,this.camera);
 }
}
