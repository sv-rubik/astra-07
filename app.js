/* АСТРА • 07 — browser-local spacecraft simulator. No dependencies. */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const destinations = [
 {name:'ЭЛИЗИЙ',x:326,y:112,z:44,map:[71,27],color:'#6ad4e9',hue:194,description:'Океанический мир. Бирюзовая атмосфера, островные архипелаги. На высокой орбите работает исследовательская станция.'},
 {name:'КЕПЛЕР',x:-148,y:275,z:-63,map:[39,20],color:'#ffbf76',hue:29,description:'Двойная звёздная система. Золотистый газовый гигант с тонкими кольцами. Сектор открыт для свободного полёта.'},
 {name:'АНТАРЕС',x:512,y:-243,z:98,map:[80,66],color:'#ff9a96',hue:5,description:'Красная звезда и пустынная планета. В поясе астероидов расположены учебные мишени для испытания вооружения.'},
 {name:'НОВА',x:-305,y:-182,z:216,map:[49,53],color:'#c0a8ff',hue:270,description:'Фиолетовая туманность на краю изученного пространства. Слабый сигнал маяка. Прекрасное место для нового маршрута.'},
 {name:'ВЕГА',x:89,y:402,z:-125,map:[17,37],color:'#a0edff',hue:211,description:'Холодный голубой гигант. Ледяная луна и тихая орбита. Сигнал дальней связи устойчивый.'}
];
const targets = [
 {name:'ДРОН T-04',x:.62,y:.43,rx:.28,ry:-.25,kind:'drone'},
 {name:'МАЯК B-12',x:.42,y:.31,rx:-.32,ry:-.42,kind:'beacon'},
 {name:'ДРОН T-09',x:.73,y:.55,rx:.52,ry:.24,kind:'drone'},
 {name:'АСТЕРОИД A-3',x:.35,y:.52,rx:-.18,ry:.43,kind:'asteroid'}
];
const S = {
 thrust:71, speed:28400, mode:'cruise', heading:312.6, pitch:2, roll:-1,
 energy:[35,25,20,20], charge:87, shield:100, target:0, view:'flight',
 toggles:{autopilot:true,shields:true,stabilizer:true,stealth:false},
 ammo:[true,true,true], slot:0, fireMode:'single', cover:false, firing:false,
 destination:null, mapSelected:destinations[0], current:{name:'ПРОКСИМА / 04',x:128,y:-57,z:9,hue:211},
 jump:null, scan:0, range:200000, sound:false, messages:[], emergency:false,
 burst:[], destroyedUntil:0, frame:0
};
let audio, lastFrame=performance.now(), renderTimer=0, readoutTimer=0, radarAngle=0, lastPing=0;
let stars = [], planetsTexture;

function formatNumber(n){return Math.round(n).toLocaleString('ru-RU');}
function signed(n){return (n>=0?'+':'−')+Math.abs(n);}
function coordText(d){return `X ${signed(d.x)} · Y ${signed(d.y)} · Z ${signed(d.z)}`;}
function time(){return new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function toast(message,warning=false){
 const el=document.createElement('div');el.className='toast'+(warning?' warning':'');el.textContent=message;
 $('toasts').append(el);setTimeout(()=>el.remove(),3800);
 while($('toasts').children.length>3)$('toasts').firstChild.remove();
}
function log(message,notify=false){
 S.messages.unshift({time:time(),text:message});S.messages=S.messages.slice(0,70);
 $('latest-event').textContent=message;$('event-time').textContent=time().slice(0,5);
 if(notify)toast(message);
 if(S.view==='journal')renderOverlay();
}
function beep(freq=680,duration=.08,type='sine',volume=.05,endFreq){
 if(!S.sound)return;
 try{
  if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();
  if(audio.state==='suspended')audio.resume().catch(()=>{});
  const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,t);
  if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),t+duration);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
  osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+duration+.02);
 }catch(_){/* Audio is optional. */}
}
function clickSound(){beep(900,.04,'sine',.025,650);}
function soundToggle(){
 S.sound=!S.sound;$('sound').setAttribute('aria-pressed',String(S.sound));
 $('sound').setAttribute('aria-label',S.sound?'Выключить звук':'Включить звук');
 $('sound').title=S.sound?'Выключить звук':'Включить звук';$('sound').innerHTML=`♫<span>ЗВУК ${S.sound?'ВКЛ':'ВЫКЛ'}</span>`;
 if(S.sound){beep(440,.12,'sine',.06);setTimeout(()=>beep(880,.12),110);}
}

// A common power bus: every control redistributes exactly 100 units.
function allocate(index,value){
 const old=S.energy.slice();value=Math.round(clamp(value,0,85));
 const others=old.reduce((a,v,i)=>a+(i===index?0:v),0),remainder=100-value;
 const next=old.map((v,i)=>i===index?value:others>0?Math.floor(v/others*remainder):Math.floor(remainder/3));
 let delta=100-next.reduce((a,b)=>a+b,0);
 for(let k=1;delta>0;k=(k%3)+1){next[(index+k)%4]++;delta--;}
 S.energy=next;updateEnergy();
}
function updateEnergy(){
 all('.energy-item').forEach((el,i)=>{
  const value=S.energy[i],dial=el.querySelector('.dial');
  el.querySelector('strong').innerHTML=`${value}<small>%</small>`;
  dial.style.setProperty('--angle',`${-135+value/85*270}deg`);
  dial.setAttribute('aria-valuenow',String(value));dial.setAttribute('aria-valuetext',`${value} процентов`);
 });
 $('energy-total').textContent=S.energy.reduce((a,b)=>a+b,0);
}
function initDials(){
 const labels=['ДВИГАТЕЛИ','ЩИТЫ','ОРУЖИЕ','ГИПЕРДВИГ.'];
 $('energy-bank').innerHTML=labels.map((label,i)=>`<div class="energy-item"><small>${label}</small><div class="dial-wrap"><div class="dial" role="slider" tabindex="0" aria-label="Энергия: ${label}" aria-valuemin="0" aria-valuemax="85" aria-valuenow="${S.energy[i]}" data-energy="${i}"></div></div><strong>${S.energy[i]}<small>%</small></strong></div>`).join('');
 all('.dial').forEach((dial,i)=>{
  let drag=null;
  dial.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;drag={y:e.clientY,x:e.clientX,value:S.energy[i]};
   dial.setPointerCapture(e.pointerId);dial.focus();clickSound();e.preventDefault();
  });
  dial.addEventListener('pointermove',e=>{if(drag){const change=(drag.y-e.clientY)*.5+(e.clientX-drag.x)*.25;allocate(i,drag.value+change);}});
  const end=()=>{if(drag){drag=null;log(`Энергия: ${labels[i].toLowerCase()} — ${S.energy[i]}%.`);}};
  dial.addEventListener('pointerup',end);dial.addEventListener('pointercancel',end);dial.addEventListener('lostpointercapture',end);
  dial.addEventListener('keydown',e=>{
   let value=S.energy[i];if(['ArrowUp','ArrowRight'].includes(e.key))value+=e.shiftKey?10:2;
   else if(['ArrowDown','ArrowLeft'].includes(e.key))value-=e.shiftKey?10:2;
   else if(e.key==='Home')value=0;else if(e.key==='End')value=85;else return;
   e.preventDefault();allocate(i,value);clickSound();
  });
  dial.addEventListener('wheel',e=>{e.preventDefault();allocate(i,S.energy[i]+(e.deltaY<0?2:-2));},{passive:false});
 });updateEnergy();
}

function selectTarget(index,notify=false){
 S.target=index%targets.length;const target=targets[S.target];
 $('radar-target').textContent=target.name;$('weapon-target').textContent=target.name;
 $('target-readout').textContent=`ЦЕЛЬ: ${target.name}`;$('reticle-label').textContent=`${target.name} · ЗАХВАТ`;
 $('reticle').style.left=target.x*100+'%';$('reticle').style.top=target.y*100+'%';
 $('lock-status').innerHTML='<i class="led"></i> РЕШЕНИЕ ПОЛУЧЕНО';
 beep(1200,.08);if(notify)log(`Захват: ${target.name}. Учебная цель.`,true);
}
function renderAmmo(){
 $('weapon-list').innerHTML=S.ammo.map((loaded,i)=>`<button class="missile-slot ${S.slot===i?'selected ':''}${loaded?'':'spent'}" data-slot="${i}" aria-label="Ракета ${i+1}: ${loaded?'готова':'израсходована'}" aria-pressed="${S.slot===i}"><span>${i+1}</span><svg aria-hidden="true"><use href="#missile"/></svg><div>РАКЕТА М-7<small>${loaded?'● ГОТОВА':'○ ПУСТО'}</small></div></button>`).join('');
 all('[data-slot]').forEach(b=>b.addEventListener('click',()=>{
  S.slot=+b.dataset.slot;renderAmmo();clickSound();toast(S.ammo[S.slot]?`Ракета ${S.slot+1} выбрана.`:'Слот пуст. Пополните боезапас.',!S.ammo[S.slot]);
 }));
}
function toggleCover(force){
 S.cover=force===undefined?!S.cover:force;$('cover').classList.toggle('open',S.cover);
 $('cover').setAttribute('aria-expanded',String(S.cover));$('cover').setAttribute('aria-label',S.cover?'Закрыть защитную крышку':'Открыть защитную крышку');
 $('launch-hint').textContent=S.cover?'ОРУЖИЕ РАЗБЛОКИРОВАНО · ГОТОВО К ПУСКУ':'ПОДНИМИТЕ ЗАЩИТНУЮ КРЫШКУ';
 $('launch-hint').style.color=S.cover?'#e3b895':'';beep(S.cover?550:380,.12,'triangle');
}
function launch(){
 if(S.jump)return toast('Во время гиперперехода оружие недоступно.',true);
 if(!S.cover)return toast('Сначала поднимите защитную крышку.',true);
 if(S.toggles.stealth)return toast('Отключите маскировку, чтобы открыть огонь.',true);
 if(S.energy[2]<5)return toast('Для пуска нужно хотя бы 5% энергии оружия.',true);
 if(S.firing)return toast('Пусковая установка занята.',true);
 const slots=S.fireMode==='salvo'?S.ammo.flatMap((v,i)=>v?[i]:[]):S.ammo[S.slot]?[S.slot]:[];
 if(!slots.length)return toast('Нет готовых ракет. Выберите другой слот или пополните боезапас.',true);
 setView('flight');S.firing=true;const target={...targets[S.target]},start=performance.now();
 slots.forEach((slot,i)=>{
  S.ammo[slot]=false;
  S.burst.push({type:'missile',start:start+i*300,duration:1900,x:target.x,y:target.y,side:slot-1,hit:false,target:target.name});
 });
 beep(80,.6,'sawtooth',.08,620);log(`${slots.length>1?'Залп':'Пуск'}: ${slots.length} × М-7. Цель: ${target.name}.`,true);renderAmmo();
 setTimeout(()=>{S.firing=false;toggleCover(false);const next=S.ammo.findIndex(Boolean);if(next>=0)S.slot=next;renderAmmo();},slots.length*300+2100);
}

function setMode(mode){
 S.mode=mode;const values={eco:28,cruise:71,boost:100};S.thrust=values[mode];$('thrust').value=S.thrust;
 all('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 S.emergency=false;$('console').classList.remove('emergency');
 log(`Двигатели: ${ {eco:'экономичный режим',cruise:'крейсерский режим',boost:'форсаж'}[mode]}.`);clickSound();updateReadouts();
}
function toggleSystem(key){
 S.toggles[key]=!S.toggles[key];const on=S.toggles[key],b=document.querySelector(`[data-toggle="${key}"]`);
 b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));b.querySelector('b').textContent=on?'ВКЛ':'ВЫКЛ';
 const names={autopilot:'Автопилот',shields:'Щиты',stabilizer:'Стабилизатор',stealth:'Маскировка'};
 $('console').classList.toggle('stealth',S.toggles.stealth);
 if(key==='autopilot'&&on){S.pitch=2;$('pitch').value=2;}
 if(key==='stabilizer'&&on){S.roll=0;$('roll').value=0;}
 if(key==='stealth'&&on)toggleCover(false);
 log(`${names[key]}: ${on?'включено':'выключено'}.`,true);beep(on?700:400,.1,'triangle');updateReadouts();
 if(S.view==='systems')renderOverlay();
}

function openNav(){
 if(S.jump)return toast('Карта будет доступна после выхода из гиперпространства.',true);
 S.mapSelected=S.destination||destinations[0];if(!$('nav-dialog').open)$('nav-dialog').showModal();renderMap();clickSound();
}
function renderMap(){
 all('.map-star').forEach(el=>el.remove());
 destinations.forEach(d=>{
  const b=document.createElement('button');b.className='map-star'+(S.mapSelected===d?' selected':'');
  b.style.left=d.map[0]+'%';b.style.top=d.map[1]+'%';b.style.setProperty('--star-color',d.color);
  b.setAttribute('aria-label',`Выбрать ${d.name}`);b.innerHTML=`<i></i><span>${d.name}</span>`;
  b.addEventListener('click',()=>{S.mapSelected=d;clickSound();renderMap();});$('star-map').append(b);
 });
 const d=S.mapSelected;$('map-name').textContent=d.name;$('map-description').textContent=d.description;
 $('map-coords').textContent=coordText(d);['x','y','z'].forEach(k=>$('coord-'+k).value=d[k]);
 const map=$('star-map'),a=d.map||[60,40],dx=(a[0]-25)*map.clientWidth/100,dy=(a[1]-77)*map.clientHeight/100;
 $('map-route').style.width=Math.hypot(dx,dy)+'px';$('map-route').style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
}
function setCourse(destination){
 if(S.jump)return;
 if(destination.x===S.current.x&&destination.y===S.current.y&&destination.z===S.current.z){toast('Корабль уже находится в этих координатах.',true);return;}
 S.destination={...destination};$('destination-name').textContent=destination.name;
 $('nav-dialog').close();log(`Курс проложен: ${destination.name}. ${coordText(destination)}.`,true);
 beep(600,.12);setTimeout(()=>beep(900,.15),120);updateReadouts();if(S.view==='navigation')renderOverlay();
}
function jump(){
 if(S.jump)return;
 if(!S.destination)return openNav();
 if(S.charge<99.95)return toast(`Заряд ${Math.floor(S.charge)}%. Увеличьте энергию гипердвигателя для быстрой зарядки.`,true);
 if(S.energy[3]<5)return toast('Направьте хотя бы 5% энергии на гипердвигатель.',true);
 if(S.firing)return toast('Дождитесь завершения пуска ракет.',true);
 toggleCover(false);setView('flight');
 S.jump={start:performance.now(),destination:{...S.destination},duration:reducedMotion?5000:9500};
 S.charge=0;$('console').classList.add('jumping');$('jump-message').hidden=false;$('jump').disabled=true;$('coordinates').disabled=true;
 log(`Начат гиперпереход. Цель: ${S.destination.name}.`,true);beep(65,2.4,'sawtooth',.07,740);updateReadouts();
}
function finishJump(){
 const destination=S.jump.destination;S.current=destination;S.destination=null;S.jump=null;S.destroyedUntil=0;S.burst=[];
 $('console').classList.remove('jumping');$('jump-message').hidden=true;$('jump').disabled=false;$('coordinates').disabled=false;
 $('sector').textContent=destination.name;$('view-sector').textContent=destination.name+' / ОРБИТА';$('position').textContent=coordText(destination);
 $('footer-destination').textContent='ГАЛАКТИЧЕСКАЯ СЕТЬ / '+destination.name;$('destination-name').textContent='КУРС ЗАВЕРШЁН';
 createPlanet(destination.hue);selectTarget((S.target+1)%targets.length);log(`Выход из гиперпространства. Сектор ${destination.name}. ${coordText(destination)}.`,true);
 beep(840,.4,'sine',.06,420);updateReadouts();
}

function setView(view){
 if(S.jump&&view!=='flight')return toast('Переключение экранов доступно после гиперперехода.',true);
 S.view=view;all('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const names={flight:'⌖ НАВИГАЦИЯ / ОБЗОРНЫЙ МОНИТОР',navigation:'◎ АСТРОНАВИГАЦИЯ / МАРШРУТ',systems:'⚙ ДИАГНОСТИКА / СИСТЕМЫ',comms:'≋ ДАЛЬНЯЯ СВЯЗЬ',journal:'≡ БОРТОВОЙ ЖУРНАЛ'};
 $('monitor-title').textContent=names[view];$('screen-overlay').hidden=view==='flight';$('monitor-tag').textContent=view==='flight'?'LIVE FEED':'A07 / '+view.toUpperCase();
 renderOverlay();clickSound();
}
function escapeHTML(str){return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderOverlay(){
 const el=$('screen-overlay');if(S.view==='flight')return;
 let html='<div class="overlay-header"><small>A07 / ТЕРМИНАЛ КОМАНДИРА</small><button id="overlay-close" aria-label="Вернуться к полёту">×</button></div>';
 if(S.view==='navigation'){
  const d=S.destination;
  html+=`<h3>ПОЛЁТНЫЙ ПЛАН</h3><div class="nav-summary"><div class="nav-card"><small>ТЕКУЩИЙ СЕКТОР</small><b>${escapeHTML(S.current.name)}</b></div><div class="nav-card"><small>ПУНКТ НАЗНАЧЕНИЯ</small><b>${d?escapeHTML(d.name):'НЕ ВЫБРАН'}</b></div><div class="nav-card"><small>ТЕКУЩИЕ КООРДИНАТЫ</small><b style="font-size:10px">${coordText(S.current)}</b></div><div class="nav-card"><small>ЗАРЯД ГИПЕРДВИГАТЕЛЯ</small><b id="overlay-charge">${Math.floor(S.charge)}%</b></div></div><p>${d?escapeHTML(d.description):'Выберите звезду в каталоге или введите координаты. После полной зарядки гипердвигателя можно начать переход.'}</p><br><button id="overlay-map" class="primary-button">ОТКРЫТЬ ЗВЁЗДНУЮ КАРТУ ↗</button>`;
 }else if(S.view==='systems'){
  const rows=[['ЦЕЛОСТНОСТЬ КОРПУСА',100],['ЖИЗНЕОБЕСПЕЧЕНИЕ',100],['ЗАЩИТНЫЕ ЭКРАНЫ',Math.round(S.shield)],['МОЩНОСТЬ ДВИГАТЕЛЕЙ',S.energy[0]],['ЭНЕРГИЯ ВООРУЖЕНИЯ',S.energy[2]],['ЗАРЯД ГИПЕРДВИГАТЕЛЯ',Math.floor(S.charge)]];
  html+='<h3>ДИАГНОСТИКА КОРАБЛЯ</h3>'+rows.map(([name,value],i)=>`<div class="system-row"><span>${name}</span><i><em style="width:${value}%" data-sysbar="${i}"></em></i><b data-sysvalue="${i}">${value}%</b></div>`).join('');
 }else if(S.view==='comms'){
  html+='<h3>ДАЛЬНЯЯ СВЯЗЬ</h3><p>КАНАЛ 07.12 / ЗАЩИЩЁННЫЙ ДИАПАЗОН<br>Доступны станция, навигационный маяк и общий канал.</p><div class="comms-buttons"><button data-comms="station">ВЫЗВАТЬ СТАНЦИЮ</button><button data-comms="beacon">ЗАПРОСИТЬ МАЯК</button><button data-comms="distress">ТЕСТ SOS</button></div><div class="comms-message" id="comms-message">Ожидание передачи. Выберите канал связи.</div>';
 }else if(S.view==='journal'){
  html+='<h3>БОРТОВОЙ ЖУРНАЛ</h3>'+S.messages.map(m=>`<div class="journal-row"><time>${m.time.slice(0,5)}</time><span>${escapeHTML(m.text)}</span></div>`).join('');
 }
 el.innerHTML=html;$('overlay-close').addEventListener('click',()=>setView('flight'));
 if($('overlay-map'))$('overlay-map').addEventListener('click',openNav);
 all('[data-comms]').forEach(b=>b.addEventListener('click',()=>{
  const kind=b.dataset.comms,answers={station:`«Астра-07», это орбитальная станция. Видим вас в секторе ${S.current.name}. Системы работают штатно. Свободный полёт разрешён.`,beacon:`Маяк активен. Ваши координаты: ${coordText(S.current)}. Каталог маршрутов синхронизирован. Счастливого пути, «Астра».`,distress:'Учебный сигнал SOS принят. Проверка аварийного канала завершена. Настоящий сигнал бедствия не передавался.'};
  $('comms-message').textContent='УСТАНОВКА СОЕДИНЕНИЯ…';all('[data-comms]').forEach(x=>x.disabled=true);beep(1200,.1,'triangle');
  setTimeout(()=>{if($('comms-message')){$('comms-message').textContent=answers[kind];all('[data-comms]').forEach(x=>x.disabled=false);}log('Принят ответ: '+{station:'орбитальная станция',beacon:'навигационный маяк',distress:'проверка SOS'}[kind]+'.');beep(700,.1);},1100);
 }));
}

function emergencyStop(){
 if(S.jump){toast('Аварийная остановка будет выполнена на выходе из гиперпространства.',true);S.emergency=true;return;}
 S.thrust=0;$('thrust').value=0;S.mode='eco';S.emergency=true;S.pitch=0;S.roll=0;$('pitch').value=0;$('roll').value=0;
 S.energy=[15,55,10,20];updateEnergy();
 ['shields','stabilizer','autopilot'].forEach(k=>{if(!S.toggles[k])toggleSystem(k);});if(S.toggles.stealth)toggleSystem('stealth');
 toggleCover(false);all('[data-mode]').forEach(b=>b.classList.remove('active'));$('console').classList.add('emergency');
 log('Аварийный стоп. Тяга снята, энергия направлена на щиты. Для продолжения выберите режим двигателя.',true);beep(220,.4,'triangle',.07);updateReadouts();
}

function updateReadouts(){
 $('speed').textContent=S.jump?'ГИПЕР':formatNumber(S.speed);
 $('thrust-value').textContent=S.thrust+'%';$('heading').textContent=S.heading.toFixed(1)+'°';
 $('pitch-display').textContent=signed(S.pitch)+'.0°';$('roll-display').textContent=signed(S.roll)+'.0°';
 $('engine-temp').textContent=formatNumber(380+S.thrust*12.2)+' °C';$('reactor-temp').textContent=Math.round(420+S.energy[0]*5+S.thrust*1.3)+' °C';
 $('acceleration').textContent=(S.thrust/100*S.energy[0]/35*1.04).toFixed(2)+' G';
 const gauges=[S.thrust,Math.round(S.thrust*.9),S.toggles.stabilizer?88:Math.abs(S.roll)*2];
 ['main','maneuver','stable'].forEach((key,i)=>{$(key+'-value').textContent=gauges[i];$('gauge-'+key).style.setProperty('--gauge',gauges[i]*.75+'%');});
 $('engine-state').textContent=S.emergency?'ОСТАНОВЛЕН':S.mode==='boost'?'ФОРСАЖ':S.mode==='eco'?'ЭКОНОМИЧНЫЙ ХОД':'КРЕЙСЕРСКИЙ ХОД';
 $('shield-percent').textContent=Math.round(S.shield)+'%';$('shield-small').textContent=Math.round(S.shield)+'%';
 $('charge').textContent=Math.floor(S.charge);$('charge-bar').style.width=S.charge+'%';
 $('hyper-state').textContent=S.jump?'ПЕРЕХОД':S.charge>=99.95?'ГОТОВ':S.energy[3]===0?'НЕТ ЭНЕРГИИ':'ЗАРЯДКА';
 $('jump-hint').textContent=S.jump?'ПЕРЕХОД В ГИПЕРПРОСТРАНСТВЕ':!S.destination?'ВЫБЕРИТЕ КООРДИНАТЫ НА КАРТЕ':S.charge<99.95?`${S.destination.name} · ЗАРЯДКА ${Math.floor(S.charge)}%`:`${S.destination.name} · ПРЫЖОК РАЗРЕШЁН`;
 $('global-status').textContent=S.jump?'ГИПЕРПРОСТРАНСТВО':S.emergency?'АВАРИЙНЫЙ СТОП':S.toggles.stealth?'РЕЖИМ МАСКИРОВКИ':'СИСТЕМЫ В НОРМЕ';
 $('lock-status').style.opacity=S.toggles.stealth?.4:1;
 if($('overlay-charge'))$('overlay-charge').textContent=Math.floor(S.charge)+'%';
 if(S.view==='systems'){
  const vals=[100,100,Math.round(S.shield),S.energy[0],S.energy[2],Math.floor(S.charge)];
  all('[data-sysvalue]').forEach((el,i)=>el.textContent=vals[i]+'%');all('[data-sysbar]').forEach((el,i)=>el.style.width=vals[i]+'%');
 }
}

// Canvas displays remain crisp at tablet and desktop pixel densities.
const canvases={};
function sizeCanvases(){
 ['space','radar','spectrum','wave'].forEach(id=>{
  const el=$(id),rect=el.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  if(rect.width<1||rect.height<1)return;
  el.width=Math.round(rect.width*dpr);el.height=Math.round(rect.height*dpr);
  const ctx=el.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);canvases[id]={ctx,w:rect.width,h:rect.height};
 });
}
new ResizeObserver(sizeCanvases).observe($('console'));
function initStars(){
 // A deterministic sky makes restoring a sector feel coherent.
 let seed=704;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 stars=Array.from({length:440},()=>({x:rand(),y:rand(),z:rand(),r:rand()*1.2+.3,phase:rand()*TAU}));
}
function createPlanet(hue){
 planetsTexture=document.createElement('canvas');planetsTexture.width=480;planetsTexture.height=480;
 const c=planetsTexture.getContext('2d');c.save();c.beginPath();c.arc(240,240,229,0,TAU);c.clip();
 c.fillStyle=`hsl(${hue},36%,17%)`;c.fillRect(0,0,480,480);
 let seed=+hue+1;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 for(let i=0;i<80;i++){
  const x=rand()*480,y=rand()*480,w=rand()*130+10,h=rand()*22+4;
  c.fillStyle=`hsla(${hue+rand()*25-12},${20+rand()*30}%,${25+rand()*30}%,${rand()*.2+.08})`;
  c.beginPath();c.ellipse(x,y,w,h,-.3,0,TAU);c.fill();
 }
 for(let i=0;i<24;i++){
  c.beginPath();c.moveTo(-20,rand()*480);for(let x=-20;x<520;x+=20)c.lineTo(x,200+Math.sin(x*.012+i)*130+i*4);
  c.strokeStyle=`hsla(${hue+12},25%,80%,.04)`;c.lineWidth=5+rand()*16;c.stroke();
 }
 const shadow=c.createRadialGradient(130,120,30,280,270,260);shadow.addColorStop(0,'#e4faff16');shadow.addColorStop(.45,'#06102622');shadow.addColorStop(1,'#000e');c.fillStyle=shadow;c.fillRect(0,0,480,480);c.restore();
}
function drawSpace(t,dt){
 const v=canvases.space;if(!v)return;const{ctx:c,w,h}=v;c.clearRect(0,0,w,h);
 const hue=S.current.hue||211;
 c.fillStyle='#020711';c.fillRect(0,0,w,h);
 const neb=c.createRadialGradient(w*.68,h*.28,0,w*.68,h*.28,w*.7);neb.addColorStop(0,`hsla(${hue},55%,35%,.16)`);neb.addColorStop(.45,`hsla(${hue+15},50%,16%,.09)`);neb.addColorStop(1,'transparent');c.fillStyle=neb;c.fillRect(0,0,w,h);
 if(S.jump){drawJump(c,w,h,t);return;}
 const drift=S.thrust*.00002*(S.toggles.stealth?.35:1),cx=w*.5,cy=h*.45;
 c.save();c.translate(cx,cy);c.rotate(S.roll*Math.PI/180*.3);c.translate(-cx,-cy+S.pitch*.3);
 for(const star of stars){
  if(!reducedMotion){star.x-=dt*drift*(star.z+.25);if(star.x<0)star.x=1;}
  const alpha=(.35+star.z*.6)*(reducedMotion?1:.8+Math.sin(t*.0007+star.phase)*.2);
  c.fillStyle=`rgba(${160+Math.round(star.z*70)},${200+Math.round(star.z*40)},255,${alpha})`;
  c.beginPath();c.arc(star.x*w,star.y*h,star.r*(star.z+.4),0,TAU);c.fill();
  if(star.z>.94){c.fillStyle='#b9e8ff10';c.fillRect(star.x*w-4,star.y*h-.3,8,.6);}
 }
 if(planetsTexture){
  const size=w*.66,x=-size*.31,y=h*.66;
  const atm=c.createRadialGradient(x+size/2,y+size/2,size*.465,x+size/2,y+size/2,size*.5);atm.addColorStop(0,'transparent');atm.addColorStop(.65,`hsla(${hue},70%,63%,.18)`);atm.addColorStop(1,'transparent');c.fillStyle=atm;c.fillRect(x,y,size,size);
  c.drawImage(planetsTexture,x,y,size,size);
 }
 // Distant orbital body and a navigation arc.
 c.strokeStyle='#8adfff15';c.lineWidth=.7;c.beginPath();c.ellipse(w*.55,h*.6,w*.52,h*.36,-.28,Math.PI,TAU);c.stroke();
 const moon=c.createRadialGradient(w*.79-3,h*.21-3,0,w*.79,h*.21,11);moon.addColorStop(0,'#a1b6c7');moon.addColorStop(.5,'#42516a');moon.addColorStop(1,'#040914');c.fillStyle=moon;c.beginPath();c.arc(w*.79,h*.21,11,0,TAU);c.fill();
 // Training targets: model silhouettes are visible before and after firing.
 if(t>S.destroyedUntil){targets.forEach((target,i)=>{
  const x=w*target.x,y=h*target.y,selected=i===S.target;
  c.save();c.translate(x,y);c.strokeStyle=selected?'#b3dfed':'#668aa5';c.fillStyle='#102b3e';c.lineWidth=1;
  if(target.kind==='asteroid'){
   c.beginPath();for(let k=0;k<7;k++){const a=k/7*TAU,r=9+(k%3)*2;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();c.stroke();
  }else if(target.kind==='beacon'){
   c.strokeRect(-3,-9,6,18);c.beginPath();c.moveTo(-14,-5);c.lineTo(14,-5);c.moveTo(-14,5);c.lineTo(14,5);c.stroke();
  }else{
   c.beginPath();c.moveTo(0,-7);c.lineTo(13,3);c.lineTo(5,6);c.lineTo(-5,6);c.lineTo(-13,3);c.closePath();c.fill();c.stroke();c.fillStyle='#7ce8ff';c.fillRect(-3,4,6,2);
  }c.restore();
 });}
 c.restore();
 // Missile trails and impact effects, in monitor coordinates.
 const live=[];
 S.burst.forEach(effect=>{
  const age=t-effect.start;if(age<0){live.push(effect);return;}
  if(effect.type==='missile'){
   const p=clamp(age/effect.duration,0,1),ease=1-Math.pow(1-p,1.5);
   const sx=w*(.5+effect.side*.25),sy=h*1.08,tx=w*effect.x,ty=h*effect.y;
   const x=sx+(tx-sx)*ease,y=sy+(ty-sy)*ease;
   c.save();c.strokeStyle='#93e9ff';c.lineWidth=(1-p)*2+.5;c.shadowColor='#6dd7ff';c.shadowBlur=12;
   c.beginPath();const back=Math.max(0,ease-.12*(1-p)-.025);c.moveTo(sx+(tx-sx)*back,sy+(ty-sy)*back);c.lineTo(x,y);c.stroke();
   c.fillStyle='#fff1cc';c.beginPath();c.arc(x,y,Math.max(1,3*(1-p)),0,TAU);c.fill();c.restore();
   if(p>=1){
    effect.type='explosion';effect.start=t;effect.duration=1400;S.destroyedUntil=t+5000;
    log(`Попадание: ${effect.target}. Учебная цель поражена.`,true);beep(100,.5,'sawtooth',.07,30);
   }live.push(effect);
  }else{
   const p=age/effect.duration;if(p<1){
    const x=w*effect.x,y=h*effect.y,r=8+p*60;const g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(235,249,255,${(1-p)*.8})`);g.addColorStop(.2,`rgba(255,200,112,${(1-p)*.7})`);g.addColorStop(.6,`rgba(70,177,255,${(1-p)*.3})`);g.addColorStop(1,'transparent');
    c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.strokeStyle=`rgba(148,220,255,${(1-p)*.6})`;c.lineWidth=1;c.beginPath();c.arc(x,y,r*.8,0,TAU);c.stroke();live.push(effect);
   }
  }
 });S.burst=live;
 $('reticle').style.visibility=t<S.destroyedUntil?'hidden':'visible';
}
function drawJump(c,w,h,t){
 const age=t-S.jump.start,p=age/S.jump.duration,cx=w*.5,cy=h*.46;
 if(p>=1){const stop=S.emergency;finishJump();if(stop)emergencyStop();return;}
 const stage=p<.21?'СИНХРОНИЗАЦИЯ':p<.38?'ВХОД В ГИПЕРПРОСТРАНСТВО':p<.88?'ГИПЕРПРОСТРАНСТВО':'ВЫХОД ИЗ ПЕРЕХОДА';
 $('jump-caption').textContent=stage;$('jump-detail').textContent=S.jump.destination.name+' / '+coordText(S.jump.destination);
 const strength=p<.2?p/.2*.15:p>.87?(1-p)/.13:Math.min(1,(p-.2)/.15);
 const g=c.createRadialGradient(cx,cy,0,cx,cy,w*.7);g.addColorStop(0,'#d5faff');g.addColorStop(.015,'#6fd9ff');g.addColorStop(.09,'#0b365e');g.addColorStop(.5,'#05172c');g.addColorStop(1,'#02050d');
 c.globalAlpha=strength;c.fillStyle=g;c.fillRect(0,0,w,h);c.globalAlpha=1;
 if(reducedMotion){
  c.fillStyle=`rgba(138,220,255,${.12+Math.sin(p*Math.PI)*.35})`;c.fillRect(0,0,w,h);
 }else{
  stars.forEach((star,i)=>{
   const angle=star.phase+t*.000025*(p>.35?1:0),travel=((t-S.jump.start)*(.0001+strength*.0006)+star.z)%1;
   const radius=Math.pow(travel,1.6)*w*.85+4,x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius*.75;
   const tail=radius*(.01+strength*.65),alpha=clamp(travel*1.7,0,1);
   c.strokeStyle=i%4===0?`rgba(106,184,255,${alpha})`:`rgba(189,234,255,${alpha})`;c.lineWidth=.5+travel*1.6;
   c.beginPath();c.moveTo(x,y);c.lineTo(cx+Math.cos(angle)*(radius-tail),cy+Math.sin(angle)*(radius-tail)*.75);c.stroke();
  });
  if(p>.35){for(let i=0;i<6;i++){
   const radius=((age*.16+i*100)%650);c.strokeStyle=`rgba(68,169,255,${.12*(1-radius/650)})`;c.lineWidth=6;
   c.beginPath();c.ellipse(cx,cy,radius,radius*.7,Math.sin(age*.0005)*.2,0,TAU);c.stroke();
  }}
 }
 if(p>.2&&p<.25||p>.9){const flash=p>.9?(p-.9)*5:Math.sin((p-.2)/.05*Math.PI)*.6;c.fillStyle=`rgba(205,239,255,${flash})`;c.fillRect(0,0,w,h);}
 if(p>.37&&!S.jump.sounded){S.jump.sounded=true;beep(650,1.4,'sine',.07,65);}
}
function drawRadar(t,dt){
 const v=canvases.radar;if(!v)return;const{ctx:c,w,h}=v,cx=w*.5,cy=h*.5,r=Math.min(w*.43,h*.45);
 c.clearRect(0,0,w,h);const grid='#5db8da33';
 c.save();c.translate(cx,cy);c.strokeStyle=grid;c.lineWidth=.6;
 for(let i=1;i<=4;i++){c.beginPath();c.arc(0,0,r*i/4,0,TAU);c.stroke();}
 for(let i=0;i<12;i++){const a=i/12*TAU;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}
 c.strokeStyle='#8bd8ef66';c.beginPath();c.arc(0,0,r+4,0,TAU);c.stroke();
 for(let i=0;i<60;i++){const a=i/60*TAU,rr=r+4;c.beginPath();c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);c.lineTo(Math.cos(a)*(rr+(i%5===0?4:2)),Math.sin(a)*(rr+(i%5===0?4:2)));c.stroke();}
 if(!S.jump){
  if(!reducedMotion)radarAngle=(radarAngle+dt*(S.scan>t?2.8:.55))%TAU;
  for(let i=0;i<45;i++){
   const a=radarAngle-i*.018;c.beginPath();c.moveTo(0,0);c.arc(0,0,r,a-.019,a);c.closePath();c.fillStyle=`rgba(98,220,255,${(1-i/45)*.08})`;c.fill();
  }
  c.strokeStyle='#a6edff99';c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(radarAngle)*r,Math.sin(radarAngle)*r);c.stroke();
  targets.forEach((target,i)=>{
   const scale=200000/S.range,x=target.rx*r*scale,y=target.ry*r*scale;
   if(Math.hypot(x,y)>r)return;
   const a=Math.atan2(y,x),since=(radarAngle-a+TAU)%TAU,alpha=clamp(1-since/TAU,.25,1);
   c.globalAlpha=alpha;c.fillStyle=i===S.target?'#defbff':'#69cbe7';c.shadowBlur=8;c.shadowColor='#91eaff';
   c.beginPath();c.arc(x,y,i===S.target?3:2,0,TAU);c.fill();c.shadowBlur=0;
   if(i===S.target){c.strokeStyle='#b4eeff';c.lineWidth=1;c.strokeRect(x-7,y-7,14,14);}
   if(since<.06&&t-lastPing>1200){beep(1050,.045,'sine',.018);lastPing=t;}
  });
 }
 c.globalAlpha=1;c.fillStyle='#bcf0ff';c.beginPath();c.moveTo(0,-5);c.lineTo(3,4);c.lineTo(0,2);c.lineTo(-3,4);c.closePath();c.fill();
 c.restore();
 if(S.scan>t){const p=1-(S.scan-t)/2500;c.strokeStyle=`rgba(165,232,255,${1-p})`;c.lineWidth=2;c.beginPath();c.arc(cx,cy,p*r,0,TAU);c.stroke();}
}
function drawTelemetry(t){
 const v=canvases.spectrum;if(v){const{ctx:c,w,h}=v;c.clearRect(0,0,w,h);const bars=38;
  for(let i=0;i<bars;i++){const level=(Math.sin(i*1.7+t*.003)+Math.cos(i*.48-t*.002)+2)/4;c.fillStyle=i%5===0?'#c5edfa':'#5894af';const hh=(.1+level*.9)*h;c.fillRect(i*w/bars,h-hh,w/bars-1.5,hh);}
 }
}
function tick(t){
 const dt=Math.min((t-lastFrame)/1000,1);lastFrame=t;S.frame++;
 if(!S.jump){
  const targetSpeed=S.thrust/71*28400*(.55+S.energy[0]/35*.45)*(S.toggles.stealth?.5:1);
  S.speed+=(targetSpeed-S.speed)*Math.min(1,dt*.65);
  if(S.charge<100&&S.energy[3]>0)S.charge=Math.min(100,S.charge+dt*S.energy[3]/20*(S.toggles.shields?.55:1.05));
  if(!S.toggles.autopilot)S.heading=(S.heading+S.roll*dt*.02+360)%360;
 }
 const shieldTarget=S.toggles.shields?clamp(S.energy[1]*4,0,100):0;S.shield+=(shieldTarget-S.shield)*dt*.8;
 // Limit painting to 30 fps without changing simulation speed.
 renderTimer+=dt;if(renderTimer>1/30){renderTimer=0;drawSpace(t,dt*2);drawRadar(t,dt*2);drawTelemetry(t);}
 readoutTimer+=dt;if(readoutTimer>=.2){readoutTimer=0;updateReadouts();$('clock').textContent=new Date().toLocaleTimeString('ru-RU',{timeZone:'UTC'});}
 requestAnimationFrame(tick);
}

// Bind every visible control to a deliberate action.
all('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
all('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
all('[data-fire]').forEach(b=>b.addEventListener('click',()=>{S.fireMode=b.dataset.fire;all('[data-fire]').forEach(x=>x.classList.toggle('active',x===b));log('Режим огня: '+(S.fireMode==='salvo'?'залп.':'одиночный.'));clickSound();}));
all('[data-toggle]').forEach(b=>b.addEventListener('click',()=>toggleSystem(b.dataset.toggle)));
$('thrust').addEventListener('input',e=>{S.thrust=+e.target.value;S.emergency=false;$('console').classList.remove('emergency');all('[data-mode]').forEach(b=>b.classList.remove('active'));updateReadouts();});
$('thrust').addEventListener('change',()=>log(`Тяга установлена: ${S.thrust}%.`));
['pitch','roll'].forEach(key=>$(key).addEventListener('input',e=>{
 if(key==='pitch'&&S.toggles.autopilot)toggleSystem('autopilot');
 if(key==='roll'&&S.toggles.stabilizer)toggleSystem('stabilizer');S[key]=+e.target.value;updateReadouts();
}));
$('next-target').addEventListener('click',()=>selectTarget(S.target+1,true));
$('radar').addEventListener('click',e=>{
 if(S.jump)return;
 const r=$('radar').getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,rr=Math.min(r.width*.43,r.height*.45)*200000/S.range;
 let index=0,distance=Infinity;targets.forEach((target,i)=>{const d=Math.hypot(x-target.rx*rr,y-target.ry*rr);if(d<distance){index=i;distance=d;}});selectTarget(index,true);
});
$('scan').addEventListener('click',()=>{
 if(S.jump)return toast('Радар недоступен в гиперпространстве.',true);
 S.scan=performance.now()+2500;$('scan').textContent='СКАНИРОВАНИЕ…';$('scan').disabled=true;beep(450,.3,'sine',.04,1400);
 log('Сканирование сектора начато.');setTimeout(()=>{$('scan').textContent='СКАНИРОВАТЬ';$('scan').disabled=false;$('scan-id').textContent=String(Number($('scan-id').textContent)+1).padStart(2,'0');log('Сканирование завершено. Обнаружены 4 учебных объекта.',true);},2500);
});
function changeRange(direction){S.range=clamp(S.range*(direction>0?2:.5),50000,800000);$('radar-range').textContent=formatNumber(S.range)+' КМ';clickSound();toast('Дальность радара: '+formatNumber(S.range)+' км.');}
$('range-down').addEventListener('click',()=>changeRange(-1));$('range-up').addEventListener('click',()=>changeRange(1));
$('cover').addEventListener('click',()=>toggleCover());$('launch').addEventListener('click',launch);
$('reload').addEventListener('click',()=>{
 if(S.jump||S.firing)return toast('Дождитесь завершения текущего манёвра.',true);
 if(S.ammo.every(Boolean))return toast('Все три ракеты уже готовы.');
 S.ammo=[true,true,true];S.slot=0;renderAmmo();toggleCover(false);log('Боезапас пополнен: 3 × М-7.',true);beep(500,.15,'triangle');
});
$('balance').addEventListener('click',()=>{S.energy=[25,25,25,25];updateEnergy();log('Энергия распределена поровну: 25% на систему.',true);clickSound();});
$('coordinates').addEventListener('click',openNav);$('close-nav').addEventListener('click',()=>$('nav-dialog').close());
$('set-course').addEventListener('click',()=>setCourse(S.mapSelected));
$('coord-form').addEventListener('submit',e=>{
 e.preventDefault();const values=['x','y','z'].map(k=>Number($('coord-'+k).value));
 if(values.some(v=>!Number.isFinite(v)||v<-999||v>999||!Number.isInteger(v)))return toast('Введите целые координаты от −999 до +999.',true);
 const[x,y,z]=values;const known=destinations.find(d=>d.x===x&&d.y===y&&d.z===z);
 setCourse(known||{name:`СЕКТОР ${Math.abs(x)}-${Math.abs(y)}`,x,y,z,hue:Math.abs(x+y+z)%360,description:'Неизученный сектор. Маршрут рассчитан по заданным координатам.'});
});
$('jump').addEventListener('click',jump);$('emergency').addEventListener('click',emergencyStop);$('sound').addEventListener('click',soundToggle);
$('fullscreen').addEventListener('click',async()=>{
 try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(_){toast('Полноэкранный режим недоступен в этом окне.',true);}
});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
all('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea,[role=slider]')||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Escape'){if(S.view!=='flight')setView('flight');return;}
 if($('help-dialog').open||$('nav-dialog').open)return;
 if(e.key.toLowerCase()==='n')openNav();if(e.key.toLowerCase()==='j')jump();if(e.key.toLowerCase()==='m')soundToggle();
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();});
initStars();createPlanet(211);initDials();renderAmmo();selectTarget(0);sizeCanvases();updateReadouts();$('clock').textContent=time();
log('Мостик готов. Командование передано вам.');log('Учебный сектор: оружие разрешено. Выберите координаты для гиперперехода.');
requestAnimationFrame(tick);
})();
