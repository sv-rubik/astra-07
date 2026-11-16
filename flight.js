'use strict';
// One forward-moving reference frame shared by contacts, the reticle and radar.
class FlightScene {
 constructor(){
  this.travel=0;this.elapsed=0;this.body=null;this.orbitImage=null;this.lastPlanetPaint=-1;
  this.hole=new Image();this.hole.src='gargantua.png';
  let seed=704;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  this.stars=Array.from({length:340},()=>({x:(rand()-.5)*2,y:(rand()-.5)*2,z:.15+rand()*2,r:.35+rand()*.9}));
 }
 resetTargets(targets,distance){
  targets.forEach((o,i)=>{const z=550+i*230;o.initialX??=o.x;o.initialY??=o.y;o.x=o.initialX;o.y=o.initialY;o.depth=z;o.worldX=(o.x-.5)*z*1.5;o.worldY=(o.y-.45)*z*1.4;o.worldZ=distance+z;o.vx=o.kind==='drone'?(i%2?-.4:.55):.025;o.vy=o.kind==='drone'?.08:0;o.size=o.kind==='asteroid'?13:9;o.destroyed=false;o.destroyedUntil=0;o.visible=true;});
 }
 arrive(body,targets,distance){
  this.body=body;this.resetTargets(targets,distance);this.surface=null;this.lastPlanetPaint=-1;
  if(!body.blackHole)this.makeSurface(body);
 }
 update(dt,t,state,targets,reduced){
  const step=reduced?0:Math.max(0,state.speed)/3600*dt;this.travel+=step;this.elapsed+=dt;
  const orbit=!!state.orbit;
  for(const star of this.stars){
   if(orbit){star.x-=step/(state.orbit.radius+state.orbit.altitude)*1.8;if(star.x< -1.6)star.x+=3.2;}
   else{star.z-=step*.012;if(star.z<.08){star.z+=2;star.x=(Math.random()-.5)*2;star.y=(Math.random()-.5)*2;}}
  }
  targets.forEach((o,i)=>{
   if(!reduced){o.worldX+=o.vx*dt;o.worldY+=o.vy*dt;}
   // A stationary external object passes behind a forward-moving ship; it never follows the HUD.
   const z=o.worldZ-state.distance;
   o.range=Math.hypot(o.worldX,o.worldY,z);
   const side=orbit?(state.orbit.angle*350):0;
   o.x=.5+(o.worldX-side)/Math.max(20,z)*.8;o.y=.45+o.worldY/Math.max(20,z)*.8;
   o.visible=z>25&&o.x>-.08&&o.x<1.08&&o.y>-.08&&o.y<1.08&&!o.destroyed&&t>o.destroyedUntil;
   o.depth=z;o.rx=Math.max(-.9,Math.min(.9,(o.worldX-side)/1000));o.ry=Math.max(-.9,Math.min(.9,-z/2200+o.worldY/900));
   // Recycle only far behind the camera, outside the viewing frustum.
   if(z< -350){o.worldZ=state.distance+2200+i*140;o.worldX=(i%2?1:-1)*(500+i*90);o.destroyed=false;o.destroyedUntil=0;}
  });
 }
 makeSurface(body){
  const s=this.surface=document.createElement('canvas');s.width=1024;s.height=512;const c=s.getContext('2d'),img=c.createImageData(1024,512),data=img.data;
  const name=body.name,seed=body.hue||211;
  // Periodic layered noise keeps the longitude seam invisible during orbital flight.
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7+seed*17.13)*43758.5453;return n-Math.floor(n);};
  const noise=(u,v,n)=>{const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);const a=hash((ix+n)%n,iy),b=hash((ix+1+n)%n,iy),d=hash((ix+n)%n,iy+1),e=hash((ix+1+n)%n,iy+1);return(a+(b-a)*sx)*(1-sy)+(d+(e-d)*sx)*sy;};
  const mix=(a,b,f)=>a.map((x,i)=>x+(b[i]-x)*Math.max(0,Math.min(1,f)));
  for(let y=0;y<512;y++)for(let x=0;x<1024;x++){
   const u=x/1024,v=y/512,n=noise(u,v,8)*.5+noise(u,v,20)*.28+noise(u,v,53)*.15+noise(u,v,137)*.07;
   let color;
   if(name==='LV-426'){
    color=n>.51?mix([44,79,59],[111,132,82],(n-.51)*5):mix([7,32,59],[24,107,136],n*1.4);
    const cloud=Math.max(0,noise(u+Math.sin(v*12)*.035,v,27)-.57)*2.5;color=mix(color,[208,227,231],cloud);
   }else if(name==='LV-223'){
    const band=.5+.25*Math.sin(v*110+noise(u,v,9)*4)+.16*Math.sin(v*37+noise(u,v,21)*3);
    color=mix([93,55,32],[218,177,113],band);const storm=Math.exp(-((u-.64)**2/.009+(v-.58)**2/.001));color=mix(color,[140,62,34],storm*.8);
   }else if(name==='SIRIUS 6B'){
    color=mix([39,47,50],[167,183,192],Math.max(0,(n-.39)*2.7));if(n>.61)color=mix(color,[221,229,229],(n-.61)*7);
   }else if(name==='ACHERON'){
    color=mix([63,28,20],[194,107,57],n);const ridges=Math.pow(Math.abs(Math.sin(n*34+v*8)),8);color=mix(color,[221,146,89],ridges*.36);
   }else if(name==='ORIGA'){
    color=mix([29,60,86],[176,211,223],n);const cracks=Math.pow(Math.max(0,Math.sin(n*70+u*14)),20);color=mix(color,[17,48,68],cracks*.6);
   }else if(name==='ZETA RETICULI'){
    color=mix([40,22,65],[147,99,153],n);color=mix(color,[189,166,205],Math.max(0,noise(u,v,31)-.56)*1.7);
   }else color=mix([20,44,64],[107,139,142],n);
   const i=(y*1024+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
  }
  c.putImageData(img,0,0);this.surfaceData=data;
  this.orbitImage=document.createElement('canvas');this.orbitImage.width=640;this.orbitImage.height=320;
 }
 drawHorizon(c,w,h,t,state){
  if(!this.surface)return;
  // Ray/sphere intersection maps rotating terrain onto a curved limb, not a stationary planet icon.
  if(t-this.lastPlanetPaint>90){
   this.lastPlanetPaint=t;const ctx=this.orbitImage.getContext('2d'),img=ctx.createImageData(640,320),out=img.data,src=this.surfaceData;
   const cx=320,cy=1000,r=830,phase=state.orbit.angle*7;
   for(let y=0;y<320;y++)for(let x=0;x<640;x++){
    const nx=(x-cx)/r,ny=(y-cy)/r,q=1-nx*nx-ny*ny;if(q<=0)continue;
    const nz=Math.sqrt(q),u=((Math.atan2(nx,nz)+phase)/(Math.PI*2)+1)%1,v=Math.acos(Math.max(-1,Math.min(1,ny)))/Math.PI;
    const si=(Math.min(511,Math.floor(v*512))*1024+Math.floor(u*1024))*4,di=(y*640+x)*4;
    const light=.28+.72*Math.max(0,-nx*.25-ny*.45+nz*.8);
    out[di]=src[si]*light;out[di+1]=src[si+1]*light;out[di+2]=src[si+2]*light;out[di+3]=255;
   }ctx.putImageData(img,0,0);
  }
  c.drawImage(this.orbitImage,0,0,w,h);
  c.save();c.scale(w/640,h/320);c.strokeStyle=`hsla(${state.current.hue||210},85%,80%,.75)`;c.lineWidth=1.8;c.shadowBlur=12;c.shadowColor='#8dcfff';c.beginPath();c.arc(320,1000,831,Math.PI*1.36,Math.PI*1.64);c.stroke();c.restore();
 }
 drawBlackHole(c,w,h,state,t){
  if(!this.hole.complete||!this.hole.naturalWidth)return;
  const a=state.orbit.angle*600,scale=Math.max(w/this.hole.width,h/this.hole.height)*1.08;
  const iw=this.hole.width*scale,ih=this.hole.height*scale;
  c.save();c.translate(w/2,h/2);c.rotate(Math.sin(a*8)*.035);c.drawImage(this.hole,-iw/2-Math.sin(a*5)*w*.035,-ih/2,iw,ih);c.restore();
  // Subtle moving plasma glints; the dark event horizon remains dark.
  c.save();c.globalCompositeOperation='screen';
  for(let i=0;i<9;i++){const phase=t*.000035+i/9*Math.PI*2,px=w*(.53+Math.cos(phase)*.4),py=h*(.53+Math.sin(phase)*.055),r=w*.008;
   const g=c.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'#ffdd9915');g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(px-r,py-r,r*2,r*2);}
  c.restore();
 }
 draw(c,w,h,t,state,targets,reduced){
  if(state.current.blackHole&&state.orbit)this.drawBlackHole(c,w,h,state,t);
  else{
   c.save();c.translate(w*.5,h*.45);c.rotate(state.roll*Math.PI/180*.25);
   for(const star of this.stars){const z=state.orbit?1:star.z,sx=star.x*w*.55/z,sy=star.y*h*.55/z;
    c.fillStyle=`rgba(193,224,245,${.35+Math.min(1,1/z)*.55})`;c.beginPath();c.arc(sx,sy,star.r,0,Math.PI*2);c.fill();
    if(!state.orbit&&!reduced&&state.speed>100){const tail=Math.min(.035,state.speed/40000*.009);c.strokeStyle='#91cbec66';c.lineWidth=.55;c.beginPath();c.moveTo(sx/(1+tail/z),sy/(1+tail/z));c.lineTo(sx,sy);c.stroke();}
   }c.restore();if(state.orbit)this.drawHorizon(c,w,h,t,state);
  }
  targets.forEach((o,i)=>{
   if(!o.visible||o.destroyed||t<o.destroyedUntil)return;
   const size=Math.max(2,Math.min(18,o.size*650/Math.max(40,o.depth)));
   c.save();c.translate(o.x*w,o.y*h);c.rotate(o.kind==='asteroid'?this.elapsed*.06:0);c.scale(size/10,size/10);c.strokeStyle=i===state.target?'#b8e4f4':'#70899b';c.lineWidth=.8;c.fillStyle='#152431';
   if(o.kind==='asteroid'){c.beginPath();for(let j=0;j<7;j++){const a=j/7*Math.PI*2,r=7+j%3;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();c.stroke();}
   else if(o.kind==='beacon'){c.strokeRect(-2,-6,4,12);c.strokeRect(-10,-4,7,8);c.strokeRect(3,-4,7,8);}
   else{c.beginPath();c.moveTo(0,-3);c.lineTo(9,2);c.lineTo(3,4);c.lineTo(-3,4);c.lineTo(-9,2);c.closePath();c.fill();c.stroke();c.fillStyle='#9ec5da';c.fillRect(-2,3,4,1);}
   c.restore();
  });
 }
}
if(typeof module!=='undefined')module.exports=FlightScene;
