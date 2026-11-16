'use strict';
// Layered stereo effects, smooth engine bed, room reflections and a master limiter.
class ShipAudio {
 constructor(){this.enabled=false;this.hidden=false;this.buffers={};this.loading=null;}
 init(){
  if(this.ctx)return;
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  const c=this.ctx=new C();this.master=c.createGain();this.master.gain.value=0;
  const compressor=c.createDynamicsCompressor();compressor.threshold.value=-16;compressor.knee.value=14;compressor.ratio.value=5;compressor.attack.value=.008;compressor.release.value=.24;
  this.master.connect(compressor);compressor.connect(c.destination);
  this.room=c.createConvolver();const impulse=c.createBuffer(2,c.sampleRate*1.1,c.sampleRate);
  for(let ch=0;ch<2;ch++){const a=impulse.getChannelData(ch);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*.19))*.28;}
  this.room.buffer=impulse;const wet=c.createGain();wet.gain.value=.12;this.room.connect(wet);wet.connect(this.master);
  this.loading=Promise.all(['engine','startup','launch','impact','charge','transit','arrival','reload','switch','scan'].map(async name=>{
   try{const response=await fetch('sfx-'+name+'.wav');if(!response.ok)throw Error('Audio unavailable');this.buffers[name]=await c.decodeAudioData(await response.arrayBuffer());}catch(_){/* Sound never blocks flight controls. */}
  })).then(()=>{
   if(this.buffers.engine){const bed=this.bed=c.createBufferSource();bed.buffer=this.buffers.engine;bed.loop=true;
    this.engineFilter=c.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=600;
    this.engineGain=c.createGain();this.engineGain.gain.value=0;bed.connect(this.engineFilter);this.engineFilter.connect(this.engineGain);this.engineGain.connect(this.master);bed.start();
   }
   const button=document.getElementById('sound');if(button)button.dataset.audioState=this.buffers.engine?'ready':'unavailable';
  });
 }
 enable(on){
  this.enabled=on;if(on){this.init();if(this.ctx)this.ctx.resume().catch(()=>{});}this.applyVolume();
 }
 applyVolume(){if(this.ctx)this.master.gain.setTargetAtTime(this.enabled&&!this.hidden?.55:0,this.ctx.currentTime,.15);}
 setHidden(hidden){this.hidden=hidden;this.applyVolume();}
 play(name,volume=1){
  if(!this.enabled||this.hidden)return;this.init();if(!this.ctx)return;
  if(!this.buffers[name]){this.loading?.then(()=>{if(this.buffers[name])this.play(name,volume);});return;}
  const c=this.ctx,source=c.createBufferSource(),gain=c.createGain();source.buffer=this.buffers[name];gain.gain.value=volume;
  source.connect(gain);gain.connect(this.master);if(name!=='engine'&&name!=='switch')gain.connect(this.room);
  source.onended=()=>{source.disconnect();gain.disconnect();};source.start();
 }
 update(speed,thrust,jumping,stealth){
  if(!this.ctx||!this.engineGain)return;const t=this.ctx.currentTime,velocity=Math.min(1.8,Math.max(0,speed/28400));
  this.engineGain.gain.setTargetAtTime(jumping?.07:(thrust===0?Math.min(velocity*.07,.05):(.15+velocity*.24)*(stealth?.4:1)),t,.35);
  this.engineFilter.frequency.setTargetAtTime(260+velocity*650+thrust*3,t,.4);
  this.bed.playbackRate.setTargetAtTime(.7+Math.min(1.8,velocity)*.4,t,.5);
 }
}
