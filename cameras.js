'use strict';
class BaseCameras {
 constructor(){
  this.channel=0;this.assets={};this.last=0;this.clock=0;this.previous=0;
  for(const name of ['base','rover','interior','patrol-v2']){const image=new Image();image.src='camera-'+name+'.png';this.assets[name]=image;}
 }
 mount(container,onSound){
  container.innerHTML=`<div class="camera-toolbar"><div><small>SIRIUS 6B / OUTPOST BLACKRIDGE</small><h3>НАБЛЮДЕНИЕ ЗА БАЗОЙ</h3></div><div class="camera-toolbar-actions"><button id="camera-expand" aria-label="Развернуть камеру" aria-pressed="false">⛶</button><button id="camera-close" aria-label="Закрыть камеры">×</button></div></div><div class="camera-screen"><canvas id="base-feed" aria-label="Анимированная камера базы на Sirius 6B"></canvas><div class="camera-osd"><span><i class="record-light"></i> <b id="camera-name">CAM 01 / ПЕРИМЕТР</b></span><span id="camera-clock"></span></div><div class="camera-bottom"><span id="camera-description">ПАТРУЛЬ ПЕРИМЕТРА / СЕКТОР B</span><span>SIM / SIRIUS 6B</span></div></div><div class="camera-buttons"><button class="active" data-camera="0">01 · ПЕРИМЕТР</button><button data-camera="1">02 · ВНУТРИ БАЗЫ</button></div>`;
  this.canvas=document.getElementById('base-feed');this.ctx=this.canvas.getContext('2d');this.previous=0;
  container.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{this.channel=+b.dataset.camera;this.refresh();onSound();}));
  container.querySelector('#camera-expand').addEventListener('click',()=>{const expanded=document.getElementById('console').classList.toggle('cameras-expanded');document.getElementById('camera-expand').setAttribute('aria-pressed',String(expanded));onSound();});
  this.refresh();
 }
 refresh(){
  if(!this.canvas?.isConnected)return;
  document.getElementById('camera-name').textContent=['CAM 01 / ПЕРИМЕТР','CAM 02 / ВНУТРЕННЯЯ ГАЛЕРЕЯ'][this.channel];
  document.getElementById('camera-description').textContent=['ПАТРУЛЬ / ПОДЪЕЗД К ШЛЮЗУ','ГАЛЕРЕЯ B-02 / ВНУТРЕННИЙ ПОСТ'][this.channel];
  this.canvas.dataset.channel=this.channel===0?'perimeter':'interior';
  document.querySelectorAll('[data-camera]').forEach(b=>{b.classList.toggle('active',+b.dataset.camera===this.channel);b.setAttribute('aria-pressed',String(+b.dataset.camera===this.channel));});
 }
 cover(image,w,h){if(!image.complete||!image.naturalWidth)return;const scale=Math.max(w/image.width,h/image.height);this.ctx.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);}
 drawPatrol(w,h,index,inside){
  const sheet=this.assets['patrol-v2'];if(!sheet.complete||!sheet.naturalWidth)return;
  const c=this.ctx,clock=this.clock+index*17.3,cellW=sheet.width/4,cellH=sheet.height/2;
  // Ground speed is tied to stride length; feet no longer race while the body slides.
  const baseHeight=h*(inside?.185:.115),cycle=1.24+index*.09,speed=baseHeight*.74/cycle;
  const route=w+baseHeight*1.5,distance=clock*speed,progress=(distance%route)/route,right=index%2===0;
  const x=right? -baseHeight*.75+progress*route:w+baseHeight*.75-progress*route;
  const depth=inside? .88-.1*progress:.76+.035*progress;
  const height=baseHeight*(1-(inside?.22:.08)*progress),width=height*cellW/cellH;
  const phase=(clock/cycle)%1,frame=Math.floor(phase*8)%8;
  const y=h*depth;
  c.save();c.translate(x,y);if(!right)c.scale(-1,1);
  c.fillStyle='#02060945';c.beginPath();c.ellipse(0,0,height*.15,height*.018,0,0,Math.PI*2);c.fill();
  // Cell baseline is shared; frame changes do not pull characters above the ground.
  c.drawImage(sheet,(frame%4)*cellW,Math.floor(frame/4)*cellH,cellW,cellH,-width/2,-height,width,height);
  c.restore();
 }
 drawRover(w,h){
  const image=this.assets.rover;if(!image.complete||!image.naturalWidth)return;
  const c=this.ctx,width=w*.23,scale=width/image.width,height=image.height*scale;
  const speed=h*.042,travel=(this.clock*speed)%(w+width*2),x=-width*1.2+travel,y=h*.91-travel/(w+width*2)*h*.04;
  c.save();c.translate(x,y);c.fillStyle='#02050850';c.beginPath();c.ellipse(width*.51,-height*.04,width*.43,height*.07,0,0,Math.PI*2);c.fill();
  c.scale(scale,scale);c.drawImage(image,0,-image.height);
  // Wheel patches rotate by actual distance/radius; the chassis travels along the road.
  const ratio=image.width/1773;
  for(const [wx,wy,radius] of [[270,660,149],[625,660,147],[997,659,141],[1275,675,119]]){
   const px=wx*ratio,py=(wy-891)*ratio,rr=radius*ratio;
   c.save();c.translate(px,py);c.beginPath();c.ellipse(0,0,rr,rr*.99,0,0,Math.PI*2);c.clip();c.rotate(travel/(scale*rr));c.drawImage(image,-px,-image.height-py);c.restore();
  }
  c.restore();
 }
 draw(t,reducedMotion){
  if(!this.canvas?.isConnected||t-this.last<33)return;
  const dt=this.previous?Math.min(.1,(t-this.previous)/1000):0;this.previous=t;this.last=t;if(!reducedMotion)this.clock+=dt;
  const c=this.ctx,rect=this.canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),dpr=Math.min(devicePixelRatio||1,2);
  if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
  c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#09101a';c.fillRect(0,0,w,h);
  const inside=this.channel===1;this.cover(inside?this.assets.interior:this.assets.base,w,h);
  this.drawPatrol(w,h,0,inside);this.drawPatrol(w,h,1,inside);
  if(!inside){this.drawRover(w,h);if(!reducedMotion){c.fillStyle='#d4dce426';for(let i=0;i<32;i++){const x=(i*37+this.clock*23)%w,y=(i*43+this.clock*8)%h;c.fillRect(x,y,1,1);}}}
  c.fillStyle='#80caff05';c.fillRect(0,0,w,h);c.fillStyle='#00000013';for(let y=0;y<h;y+=3)c.fillRect(0,y,w,1);
  this.canvas.dataset.frame=String(Math.floor(t/33));this.canvas.dataset.simulationTime=this.clock.toFixed(2);
  document.getElementById('camera-clock').textContent=new Date().toLocaleTimeString('ru-RU');
 }
}
