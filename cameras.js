'use strict';
class BaseCameras {
 constructor(){
  this.channel=0;this.assets={};this.last=0;
  for(const name of ['base','rover','patrol']){const image=new Image();image.src='camera-'+name+'.png';this.assets[name]=image;}
 }
 mount(container,onSound){
  this.onSound=onSound;
  container.innerHTML=`<div class="camera-toolbar"><div><small>SIRIUS 6B / OUTPOST BLACKRIDGE</small><h3>НАБЛЮДЕНИЕ ЗА БАЗОЙ</h3></div><div class="camera-toolbar-actions"><button id="camera-expand" aria-label="Развернуть камеру" aria-pressed="false">⛶</button><button id="camera-close" aria-label="Закрыть камеры">×</button></div></div><div class="camera-screen"><canvas id="base-feed" aria-label="Анимированная камера базы на Sirius 6B"></canvas><div class="camera-osd"><span><i class="record-light"></i> <b id="camera-name">CAM 01 / ПЕРИМЕТР</b></span><span id="camera-clock"></span></div><div class="camera-bottom"><span id="camera-description">ПАТРУЛЬ ПЕРИМЕТРА / СЕКТОР B</span><span>SIM / SIRIUS 6B</span></div></div><div class="camera-buttons"><button class="active" data-camera="0">01 · ПЕРИМЕТР</button><button data-camera="1">02 · РОВЕР</button></div>`;
  this.canvas=document.getElementById('base-feed');this.ctx=this.canvas.getContext('2d');
  container.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{this.channel=+b.dataset.camera;this.refresh();onSound();}));
  container.querySelector('#camera-expand').addEventListener('click',()=>{const expanded=document.getElementById('console').classList.toggle('cameras-expanded');document.getElementById('camera-expand').setAttribute('aria-pressed',String(expanded));onSound();});
  this.refresh();
 }

 refresh(){
  if(!this.canvas?.isConnected)return;
  const titles=['CAM 01 / ПЕРИМЕТР','CAM 02 / МАРШРУТ ROVER-06'];
  const descriptions=['ПАТРУЛЬ ПЕРИМЕТРА / СЕКТОР B','НАЗЕМНЫЙ РОВЕР / ВОСТОЧНЫЙ МАРШРУТ'];
  document.getElementById('camera-name').textContent=titles[this.channel];document.getElementById('camera-description').textContent=descriptions[this.channel];
  document.querySelectorAll('[data-camera]').forEach(b=>{b.classList.toggle('active',+b.dataset.camera===this.channel);b.setAttribute('aria-pressed',String(+b.dataset.camera===this.channel));});
 }

 cover(image,w,h,zoom=1){if(!image.complete||!image.naturalWidth)return;const scale=Math.max(w/image.width,h/image.height)*zoom;this.ctx.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);}
 draw(t,reducedMotion){
  if(!this.canvas?.isConnected||t-this.last<50)return;this.last=t;
  const c=this.ctx,rect=this.canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),dpr=Math.min(devicePixelRatio||1,2);
  if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
  c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#09101a';c.fillRect(0,0,w,h);
   this.cover(this.assets.base,w,h,this.channel===1?1.12:1);
   const clock=reducedMotion?0:t/1000,patrol=this.assets.patrol;
   // Separate patrol paths and four genuine walking frames; scaled to the camera's perspective.
   if(patrol.complete&&patrol.naturalWidth){
    const frame=reducedMotion?0:Math.floor(t/190)%4,cell=patrol.width/4;
    for(let i=0;i<4;i++){
     const right=i%2===0,progress=(clock*(.016+i*.002)+i*.24)%1,x=w*(-.08+progress*1.15),y=h*(.71+(i%2)*.12),height=h*(.14+(i%2)*.02),width=height*cell/patrol.height;
     c.save();c.translate(right?x:w-x,y);if(!right)c.scale(-1,1);c.globalAlpha=.25;c.fillStyle='#000';c.beginPath();c.ellipse(0,2,width*.4,2,0,0,Math.PI*2);c.fill();c.globalAlpha=1;c.drawImage(patrol,cell*frame,0,cell,patrol.height,-width/2,-height,width,height);c.restore();
    }
   }
   const rover=this.assets.rover;
   if(rover.complete&&rover.naturalWidth){
    const progress=(clock*.012+.12)%1,x=w*(-.25+progress*1.5),width=w*(this.channel===1?.35:.26),height=width*rover.height/rover.width,y=h*.9+(reducedMotion?0:Math.sin(t*.013)*.4);
    c.save();c.translate(x,y);c.globalAlpha=.22;c.fillStyle='#060a0e';c.beginPath();c.ellipse(width*.5,0,width*.45,height*.09,0,0,Math.PI*2);c.fill();c.globalAlpha=1;c.drawImage(rover,0,-height,width,height);c.restore();
   }
   if(!reducedMotion){c.fillStyle='#d4dce42a';for(let i=0;i<38;i++){const x=(i*37+t*.023)%w,y=(i*43+t*.008)%h;c.fillRect(x,y,1.2,1.2);}}
  c.fillStyle='#80caff08';c.fillRect(0,0,w,h);c.fillStyle='#00000015';for(let y=0;y<h;y+=3)c.fillRect(0,y,w,1);
  this.canvas.dataset.frame=String(Math.floor(t/50));
  document.getElementById('camera-clock').textContent=new Date().toLocaleTimeString('ru-RU');
 }
}
