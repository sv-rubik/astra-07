/* USCSS EREBUS • 07 — browser-local spacecraft simulator. No dependencies. */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const destinations = [
 {name:'SIRIUS 6B',x:-624,y:86,z:156,map:[16,76],color:'#b9d0d6',hue:205,description:'Домашняя база BLACKRIDGE. Каменистая поверхность, снег и пепел. На базе находятся гарнизон, ROVER-06 и центр дальней связи.'},
 {name:'LV-426',x:326,y:112,z:44,map:[71,27],color:'#6ad4e9',hue:194,description:'Океанический мир. Бирюзовая атмосфера, островные архипелаги. На высокой орбите работает исследовательская станция.'},
 {name:'LV-223',x:-148,y:275,z:-63,map:[39,20],color:'#ffbf76',hue:29,description:'Двойная звёздная система. Золотистый газовый гигант с тонкими кольцами. Сектор открыт для свободного полёта.'},
 {name:'ACHERON',x:512,y:-243,z:98,map:[80,66],color:'#ff9a96',hue:5,description:'Красная звезда и пустынная планета. В поясе астероидов расположены учебные мишени для испытания вооружения.'},
 {name:'ZETA RETICULI',x:-305,y:-182,z:216,map:[49,53],color:'#c0a8ff',hue:270,description:'Фиолетовая туманность на краю изученного пространства. Слабый сигнал дальней связи. Прекрасное место для нового маршрута.'},
 {name:'GARGANTUA',x:-810,y:640,z:299,map:[90,43],color:'#ffd6a0',hue:35,blackHole:true,description:'Сверхмассивная чёрная дыра. Аккреционный диск, гравитационное линзирование и дальняя наблюдательная орбита. Автопилот удерживает безопасную дистанцию.'},
 {name:'ORIGA',x:89,y:402,z:-125,map:[17,37],color:'#a0edff',hue:211,description:'Ледяной мир. Голубая поверхность, тёмные разломы и тихая орбита. Сигнал дальней связи устойчивый.'}
];
const targets = [
 {name:'DRN-04',x:.62,y:.43,rx:.28,ry:-.25,kind:'drone'},
 {name:'RELAY-12',x:.42,y:.31,rx:-.32,ry:-.42,kind:'beacon'},
 {name:'DRN-09',x:.73,y:.55,rx:.52,ry:.24,kind:'drone'},
 {name:'AST-03',x:.35,y:.52,rx:-.18,ry:.43,kind:'asteroid'}
];
const S = {
 thrust:71, speed:28400, mode:'cruise', heading:312.6, pitch:2, roll:-1,
 energy:[35,15,10,20,15,5], charge:87, shield:100, target:0, view:'flight',
 toggles:{autopilot:true,shields:true,stabilizer:true,stealth:false},
 ammo:[true,true,true], reloadAt:[0,0,0], slot:0, fireMode:'single', cover:false, firing:false,
 destination:null, mapSelected:destinations[0], current:{name:'SOL / OUTER RIM',x:128,y:-57,z:9,hue:211},
 jump:null, scan:0, range:200000, sound:false, messages:[], emergency:false,
 burst:[], destroyedUntil:0, frame:0, distance:0, orbit:null, scanDuration:2500
};
let lastFrame=performance.now(), renderTimer=0, readoutTimer=0, radarAngle=0, lastPing=0;
let stars = [];
const flightScene = new FlightScene();
const sound = new ShipAudio();
const baseCameras = new BaseCameras();

function formatNumber(n){return Math.round(n).toLocaleString('ru-RU');}
function signed(n){return (n>=0?'+':'−')+Math.abs(n);}
function coordText(d){return `X ${signed(d.x)} · Y ${signed(d.y)} · Z ${signed(d.z)}`;}
function time(){return new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function toast(message,warning=false){log(message,false,warning);}
function log(message,notify=false,warning=false){
 S.messages.unshift({time:time(),text:message});S.messages=S.messages.slice(0,70);
 $('latest-event').textContent=message;$('event-time').textContent=time();
 $('ship-log').classList.toggle('warning',warning);$('message-kind').textContent=warning?'ВНИМАНИЕ':'БОРТОВОЙ КАНАЛ';
 if(S.view==='journal')renderOverlay();
}
function beep(freq=680,duration=.08,type='sine',volume=.05,endFreq){
 // Only explicit control actions produce a click. Radar sweep is silent.
 if(S.sound)sound.play(freq<300?'impact':'switch',Math.min(.3,volume*4));
}
function clickSound(){if(S.sound)sound.play('switch',.55);}
function soundToggle(){
 S.sound=!S.sound;$('sound').setAttribute('aria-pressed',String(S.sound));
 $('sound').setAttribute('aria-label',S.sound?'Выключить звук':'Включить звук');
 $('sound').title=S.sound?'Выключить звук':'Включить звук';$('sound').innerHTML=`♫<span>ЗВУК ${S.sound?'ВКЛ':'ВЫКЛ'}</span>`;
 sound.enable(S.sound);if(S.sound)sound.play('startup',.7);
}

// A common power bus: every control redistributes exactly 100 units.
function allocate(index,value){
 const old=S.energy.slice();value=Math.round(clamp(value,0,85));
 const others=old.reduce((a,v,i)=>a+(i===index?0:v),0),remainder=100-value;
 const next=old.map((v,i)=>i===index?value:others>0?Math.floor(v/others*remainder):Math.floor(remainder/(old.length-1)));
 let delta=100-next.reduce((a,b)=>a+b,0);
 for(let k=1;delta>0;k=(k%(old.length-1))+1){next[(index+k)%old.length]++;delta--;}
 S.energy=next;updateEnergy();
}
function updateEnergy(){
 all('.energy-item').forEach(el=>{
  const i=+el.dataset.energyIndex,value=S.energy[i],dial=el.querySelector('.dial');
  el.querySelector('strong').innerHTML=`${value}<small>%</small>`;
  dial.style.setProperty('--angle',`${-135+value/85*270}deg`);
  dial.setAttribute('aria-valuenow',String(value));dial.setAttribute('aria-valuetext',`${value} процентов`);
 });
 $('energy-total').textContent=S.energy.reduce((a,b)=>a+b,0);
}
function initDials(){
 const labels=['ДВИГАТЕЛИ','ЩИТЫ','ВООРУЖЕН.','СИСТЕМЫ','НАУКА','СВЯЗЬ'];
 const order=[0,3,1,2,4,5];
 $('energy-bank').innerHTML=order.map(i=>{const label=labels[i];return `<div class="energy-item" data-energy-index="${i}"><small>${label}</small><div class="dial-wrap"><div class="dial" role="slider" tabindex="0" aria-label="Энергия: ${label}" aria-valuemin="0" aria-valuemax="85" aria-valuenow="${S.energy[i]}" data-energy="${i}"></div></div><strong>${S.energy[i]}<small>%</small></strong></div>`;}).join('');
 all('.dial').forEach(dial=>{
  const i=+dial.dataset.energy;let drag=null;
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
 S.target=index%targets.length;for(let attempt=0;attempt<targets.length-1&&targets[S.target].destroyed;attempt++)S.target=(S.target+1)%targets.length;const target=targets[S.target];
 $('radar-target').textContent=target.name;$('weapon-target').textContent=target.name;
 $('target-readout').textContent=`ЦЕЛЬ: ${target.name}`;$('reticle-label').textContent=`${target.name} · ЗАХВАТ`;
 $('reticle').style.left=target.x*100+'%';$('reticle').style.top=target.y*100+'%';
 $('lock-status').innerHTML='<i class="led"></i> РЕШЕНИЕ ПОЛУЧЕНО';
 beep(1200,.08);if(notify)log(`Захват: ${target.name}. Учебная цель.`,true);
}
function renderAmmo(){
 const now=performance.now();
 $('weapon-list').innerHTML=S.ammo.map((loaded,i)=>{const secs=Math.max(0,Math.ceil((S.reloadAt[i]-now)/1000)),loading=!loaded&&secs>0;
 return `<button class="missile-slot ${S.slot===i?'selected ':''}${loaded?'':loading?'reloading':'spent'}" data-slot="${i}" aria-label="Ракета ${i+1}: ${loaded?'готова':loading?'перезарядка '+secs+' секунд':'израсходована'}" aria-pressed="${S.slot===i}"><span>${i+1}</span><svg aria-hidden="true"><use href="#missile"/></svg><div>РАКЕТА М-7<small>${loaded?'● ГОТОВА':loading?'↻ '+secs+' СЕК':'○ ПУСТО'}</small></div></button>`;}).join('');
 all('[data-slot]').forEach(b=>b.addEventListener('click',()=>{
  S.slot=+b.dataset.slot;renderAmmo();clickSound();toast(S.ammo[S.slot]?`Ракета ${S.slot+1} выбрана.`:'Идёт автоматическая перезарядка. Можно ускорить кнопкой «Перезарядить».',!S.ammo[S.slot]);
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
 if(!targets[S.target].visible||performance.now()<targets[S.target].destroyedUntil)return toast('Цель вне поля обзора или уже поражена. Выберите другую цель на радаре.',true);
 const slots=S.fireMode==='salvo'?S.ammo.flatMap((v,i)=>v?[i]:[]):S.ammo[S.slot]?[S.slot]:[];
 if(!slots.length)return toast('Нет готовых ракет. Выберите другой слот или пополните боезапас.',true);
 setView('flight');S.firing=true;const target={...targets[S.target]},start=performance.now();
 slots.forEach((slot,i)=>{
  S.ammo[slot]=false;S.reloadAt[slot]=start+6500+i*350;
  S.burst.push({targetIndex:S.target,type:'missile',start:start+i*300,duration:1900,x:target.x,y:target.y,side:slot-1,hit:false,target:target.name});
 });
 if(S.sound)slots.forEach((_,i)=>setTimeout(()=>sound.play('launch',.85),i*300));log(`${slots.length>1?'Залп':'Пуск'}: ${slots.length} × М-7. Цель: ${target.name}.`,true);renderAmmo();
 setTimeout(()=>{S.firing=false;toggleCover(false);const next=S.ammo.findIndex(Boolean);if(next>=0)S.slot=next;renderAmmo();},slots.length*300+2100);
}

function reloadMissiles(){
 if(S.jump||S.firing)return toast('Дождитесь завершения пуска или гиперперехода.',true);
 if(S.ammo.every(Boolean))return toast('Все три ракеты уже готовы.');
 const now=performance.now();S.ammo.forEach((loaded,i)=>{if(!loaded)S.reloadAt[i]=Math.min(S.reloadAt[i]||Infinity,now+2200+i*200);});
 toggleCover(false);renderAmmo();if(S.sound)sound.play('reload',.8);log('Механизм подачи запущен. Ракеты возвращаются в пусковые ячейки.',true);
}
function updateReloads(now){
 let changed=false;
 S.reloadAt.forEach((deadline,i)=>{if(deadline&&now>=deadline){S.ammo[i]=true;S.reloadAt[i]=0;changed=true;log(`Ячейка ${i+1}: перезарядка завершена, ракета готова.`);}});
 if(changed){if(!S.ammo[S.slot])S.slot=S.ammo.findIndex(Boolean);if(S.sound)sound.play('reload',.3);}
 // Stable nodes between whole-second countdown changes preserve touch input.
 const stamp=S.reloadAt.map((d,i)=>S.ammo[i]?'ready':Math.ceil(Math.max(0,d-now)/1000)).join('|');
 if(changed||stamp!==updateReloads.stamp){updateReloads.stamp=stamp;renderAmmo();}
 $('reload').textContent=S.ammo.every(Boolean)?'↻ ВСЕ РАКЕТЫ ГОТОВЫ':'↻ ПЕРЕЗАРЯДИТЬ';
}

function setMode(mode){
 S.mode=mode;const values={eco:28,cruise:71,boost:100};S.thrust=values[mode];$('thrust').value=S.thrust;
 all('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 S.emergency=false;$('console').classList.remove('emergency');
 log(`Двигатели: ${ {eco:'экономичный режим',cruise:'крейсерский режим',boost:'форсаж'}[mode]}.`);if(S.sound)sound.play('startup',mode==='boost'?.9:.55);updateReadouts();
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
 if(!$('star-map').querySelector('.map-star'))destinations.forEach(d=>{
  const b=document.createElement('button');b.type='button';b.className='map-star';
  b.style.left=d.map[0]+'%';b.style.top=d.map[1]+'%';b.style.setProperty('--star-color',d.color);
  b.setAttribute('aria-label',`Выбрать ${d.name}`);b.innerHTML=`<i></i><span>${d.name}</span>`;
  b.dataset.planet=d.name;b.addEventListener('click',()=>{S.mapSelected=d;clickSound();renderMap();});$('star-map').append(b);
 });
 all('.map-star').forEach(b=>{const selected=b.dataset.planet===S.mapSelected.name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 const select=$('planet-select');if(!select.options.length)destinations.forEach(d=>select.add(new Option(d.name,d.name)));select.value=S.mapSelected.name;
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
 if(S.charge<99.95)return toast(`Заряд ${Math.floor(S.charge)}%. Увеличьте мощность «Системы» для быстрой зарядки.`,true);
 if(S.energy[3]<5)return toast('Направьте хотя бы 5% энергии на системы.',true);
 if(S.firing)return toast('Дождитесь завершения пуска ракет.',true);
 toggleCover(false);setView('flight');
 S.jump={start:performance.now(),destination:{...S.destination},duration:reducedMotion?5000:9500};
 S.charge=0;$('console').classList.add('jumping');$('jump-message').hidden=false;$('jump').disabled=true;$('coordinates').disabled=true;
 log(`Начат гиперпереход. Цель: ${S.destination.name}.`,true);if(S.sound)sound.play('charge',.85);updateReadouts();
}
function finishJump(){
 const destination=S.jump.destination;S.current=destination;S.destination=null;S.jump=null;S.destroyedUntil=0;S.burst=[];
 $('console').classList.remove('jumping');$('jump-message').hidden=true;$('jump').disabled=false;$('coordinates').disabled=false;
 $('sector').textContent=destination.name;$('view-sector').textContent=destination.name+' / ОРБИТА';$('position').textContent=coordText(destination);
 $('footer-destination').textContent='ГАЛАКТИЧЕСКАЯ СЕТЬ / '+destination.name;$('destination-name').textContent='ОРБИТА · '+destination.name;
 S.orbit={angle:0,altitude:destination.blackHole?1200000:350,radius:destination.blackHole?1800000:6370,body:destination.name};
 flightScene.arrive(destination,targets,S.distance);selectTarget((S.target+1)%targets.length);log(`Выход из гиперпространства. ${destination.blackHole?'Наблюдательная орбита':'Орбита'} ${destination.name} установлена.`,true);
 if(S.sound)sound.play('arrival',.85);updateReadouts();
}

function setView(view){
 if(S.jump&&view!=='flight')return toast('Переключение экранов доступно после гиперперехода.',true);
 if(view!=='cameras')$('console').classList.remove('cameras-expanded');
 S.view=view;all('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const names={flight:'⌖ НАВИГАЦИЯ / ПОЛЁТНЫЙ ПЛАН',navigation:'◎ АСТРОНАВИГАЦИЯ / МАРШРУТ',engines:'ϟ ДВИГАТЕЛИ / УПРАВЛЕНИЕ',energy:'ϟ ЭНЕРГЕТИЧЕСКАЯ ШИНА',science:'⚗ НАУЧНЫЙ МОДУЛЬ / СКАНИРОВАНИЕ',systems:'⚙ ДИАГНОСТИКА / СИСТЕМЫ',comms:'≋ ДАЛЬНЯЯ СВЯЗЬ',cameras:'▣ SIRIUS 6B / КАМЕРЫ БАЗЫ',journal:'≡ БОРТОВОЙ ЖУРНАЛ'};
 $('monitor-title').textContent=names[view];$('screen-overlay').hidden=view==='flight';$('monitor-tag').textContent=view==='flight'?'LIVE FEED':'E07 / '+view.toUpperCase();
 renderOverlay();clickSound();
}
function escapeHTML(str){return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderOverlay(){
 const el=$('screen-overlay');el.classList.toggle('camera-mode',S.view==='cameras');if(S.view==='flight')return;
 if(S.view==='cameras'){baseCameras.mount(el,clickSound);$('camera-close').addEventListener('click',()=>setView('flight'));return;}
 let html='<div class="overlay-header"><small>E07 / ТЕРМИНАЛ КОМАНДИРА</small><button id="overlay-close" aria-label="Вернуться к полёту">×</button></div>';
 if(S.view==='navigation'){
  const d=S.destination;
  html+=`<h3>ПОЛЁТНЫЙ ПЛАН</h3><div class="nav-summary"><div class="nav-card"><small>ТЕКУЩИЙ СЕКТОР</small><b>${escapeHTML(S.current.name)}</b></div><div class="nav-card"><small>ПУНКТ НАЗНАЧЕНИЯ</small><b>${d?escapeHTML(d.name):'НЕ ВЫБРАН'}</b></div><div class="nav-card"><small>ТЕКУЩИЕ КООРДИНАТЫ</small><b style="font-size:10px">${coordText(S.current)}</b></div><div class="nav-card"><small>ЗАРЯД ГИПЕРДВИГАТЕЛЯ</small><b id="overlay-charge">${Math.floor(S.charge)}%</b></div></div><p>${d?escapeHTML(d.description):'Выберите звезду в каталоге или введите координаты. После полной зарядки гипердвигателя можно начать переход.'}</p><br><button id="overlay-map" class="primary-button">ОТКРЫТЬ ЗВЁЗДНУЮ КАРТУ ↗</button>`;
 }else if(S.view==='engines'){
  html+=`<h3>ДВИГАТЕЛЬНЫЙ КОНТУР</h3><p>Мощность: ${S.energy[0]}%. Текущая скорость: ${formatNumber(S.speed)} км/ч.<br>Изменение тяги видно на обзорном мониторе и слышно по работе турбин.</p><label class="engine-overlay-label">ТЯГА <input id="overlay-thrust" type="range" min="0" max="100" value="${S.thrust}" aria-label="Тяга на экране двигателей"></label><div class="comms-buttons"><button data-engine-mode="eco">ЭКО</button><button data-engine-mode="cruise">КРЕЙСЕР</button><button data-engine-mode="boost">ФОРСАЖ</button><button id="return-flight">ВЕРНУТЬСЯ К ПОЛЁТУ →</button></div>`;
 }else if(S.view==='energy'){
  html+='<h3>РАСПРЕДЕЛЕНИЕ ЭНЕРГИИ</h3>'+S.energy.map((v,i)=>`<div class="system-row"><span>${['ДВИГАТЕЛИ','ЩИТЫ','ОРУЖИЕ','СИСТЕМЫ / ГИПЕРДВИГ.','НАУКА','СВЯЗЬ'][i]}</span><i><em style="width:${v}%"></em></i><b>${v}%</b></div>`).join('')+'<p style="margin-top:18px">Общая мощность — 100%. Поверните регуляторы под экраном. Контур «Системы» питает гипердвигатель. «Наука» влияет на сканирование, «Связь» — на скорость ответа базы.</p><br><button id="overlay-balance" class="primary-button">СБАЛАНСИРОВАТЬ ШИНУ</button>';
 }else if(S.view==='science'){
  html+=`<h3>АНАЛИЗ СЕКТОРА</h3><div class="nav-summary"><div class="nav-card"><small>СИСТЕМА</small><b>${escapeHTML(S.current.name)}</b></div><div class="nav-card"><small>ОБЪЕКТЫ</small><b>${targets.filter(x=>!x.destroyed).length} КОНТАКТА</b></div></div><p>Датчики отслеживают учебные дроны, ретранслятор и обломки. Сканирование обновляет номер прохода на радаре.</p><br><button id="science-scan" class="primary-button">ЗАПУСТИТЬ СКАНИРОВАНИЕ</button>`;
 }else if(S.view==='systems'){
  const rows=[['ЦЕЛОСТНОСТЬ КОРПУСА',100],['ЖИЗНЕОБЕСПЕЧЕНИЕ',100],['ЗАЩИТНЫЕ ЭКРАНЫ',Math.round(S.shield)],['МОЩНОСТЬ ДВИГАТЕЛЕЙ',S.energy[0]],['ЭНЕРГИЯ ВООРУЖЕНИЯ',S.energy[2]],['ЗАРЯД ГИПЕРДВИГАТЕЛЯ',Math.floor(S.charge)]];
  html+='<h3>ДИАГНОСТИКА КОРАБЛЯ</h3>'+rows.map(([name,value],i)=>`<div class="system-row"><span>${name}</span><i><em style="width:${value}%" data-sysbar="${i}"></em></i><b data-sysvalue="${i}">${value}%</b></div>`).join('');
 }else if(S.view==='comms'){
  html+='<h3>ДАЛЬНЯЯ СВЯЗЬ</h3><p>КАНАЛ 07.12 / ЗАЩИЩЁННЫЙ ДИАПАЗОН<br>Доступны станция, дальний ретранслятор и общий канал.</p><div class="comms-buttons"><button data-comms="station">ВЫЗВАТЬ СТАНЦИЮ</button><button data-comms="beacon">ЗАПРОСИТЬ РЕТРАНСЛЯТОР</button><button data-comms="distress">ТЕСТ SOS</button></div><div class="comms-message" id="comms-message">Ожидание передачи. Выберите канал связи.</div>';
 }else if(S.view==='journal'){
  html+='<h3>БОРТОВОЙ ЖУРНАЛ</h3>'+S.messages.map(m=>`<div class="journal-row"><time>${m.time.slice(0,5)}</time><span>${escapeHTML(m.text)}</span></div>`).join('');
 }
 el.innerHTML=html;$('overlay-close').addEventListener('click',()=>setView('flight'));
 if($('overlay-map'))$('overlay-map').addEventListener('click',openNav);
 if($('overlay-thrust'))$('overlay-thrust').addEventListener('input',e=>{S.thrust=+e.target.value;$('thrust').value=S.thrust;S.emergency=false;$('console').classList.remove('emergency');updateReadouts();});
 all('[data-engine-mode]').forEach(b=>b.addEventListener('click',()=>{setMode(b.dataset.engineMode);renderOverlay();}));
 if($('return-flight'))$('return-flight').addEventListener('click',()=>setView('flight'));
 if($('overlay-balance'))$('overlay-balance').addEventListener('click',()=>{$('balance').click();renderOverlay();});
 if($('science-scan'))$('science-scan').addEventListener('click',()=>{$('scan').click();setView('flight');});
 all('[data-comms]').forEach(b=>b.addEventListener('click',()=>{
  if(S.energy[5]<1)return toast('Направьте энергию на связь.',true);
  const kind=b.dataset.comms,answers={station:`«Erebus-07», это орбитальная станция. Видим вас в секторе ${S.current.name}. Системы работают штатно. Свободный полёт разрешён.`,beacon:`Ретранслятор активен. Ваши координаты: ${coordText(S.current)}. Каталог маршрутов синхронизирован. Счастливого пути, «Erebus».`,distress:'Учебный сигнал SOS принят. Проверка аварийного канала завершена. Настоящий сигнал бедствия не передавался.'};
  $('comms-message').textContent='УСТАНОВКА СОЕДИНЕНИЯ…';all('[data-comms]').forEach(x=>x.disabled=true);beep(1200,.1,'triangle');
  setTimeout(()=>{if($('comms-message')){$('comms-message').textContent=answers[kind];all('[data-comms]').forEach(x=>x.disabled=false);}log('Принят ответ: '+{station:'орбитальная станция',beacon:'дальний ретранслятор',distress:'проверка SOS'}[kind]+'.');beep(700,.1);},clamp(1100*5/S.energy[5],450,5500));
 }));
}

function emergencyStop(){
 if(S.jump){toast('Аварийная остановка будет выполнена на выходе из гиперпространства.',true);S.emergency=true;return;}
 S.thrust=0;$('thrust').value=0;S.mode='eco';S.emergency=true;S.pitch=0;S.roll=0;$('pitch').value=0;$('roll').value=0;
 S.energy=[10,45,5,25,10,5];updateEnergy();
 ['shields','stabilizer','autopilot'].forEach(k=>{if(!S.toggles[k])toggleSystem(k);});if(S.toggles.stealth)toggleSystem('stealth');
 toggleCover(false);all('[data-mode]').forEach(b=>b.classList.remove('active'));$('console').classList.add('emergency');
 log('Аварийный стоп. Тяга снята, энергия направлена на щиты. Для продолжения выберите режим двигателя.',true);beep(220,.4,'triangle',.07);updateReadouts();
}

function updateReadouts(){
 $('distance-flown').textContent=S.distance.toFixed(1)+' КМ';
 $('viewport').dataset.motionSpeed=S.speed.toFixed(1);
 $('viewport').dataset.flightMode=S.jump?'hyperspace':S.orbit?(S.current.blackHole?'black-hole-orbit':'orbit'):'cruise';
 $('viewport').dataset.orbitAngle=String(S.orbit?.angle||0);
 $('viewport').dataset.forwardDistance=S.distance.toFixed(3);
 $('radar').setAttribute('aria-label','Радар: активных контактов '+targets.filter(x=>!x.destroyed).length);
 $('viewport').dataset.activeTargets=targets.filter(x=>!x.destroyed).map(x=>x.name).join(',');
 $('viewport').dataset.targetPosition=targets.map(x=>`${x.x.toFixed(4)},${x.y.toFixed(4)}`).join(';');
 if(S.orbit){$('view-sector').textContent=S.current.name+' / ОРБИТАЛЬНЫЙ ПОЛЁТ';$('orbit-status').textContent=`${S.current.blackHole?'НАБЛЮДАТЕЛЬНАЯ ОРБИТА':'ВЫСОТА '+formatNumber(S.orbit.altitude)+' КМ'} · ${((S.orbit.angle*180/TAU*2)%360).toFixed(2)}°`;}else $('orbit-status').textContent='ПРЯМОЙ ХОД / ВИД ИЗ КАБИНЫ';
 $('console').style.setProperty('--engine-force',String(clamp(S.speed/40000,0,1.5)));
 $('speed').textContent=S.jump?'ГИПЕР':formatNumber(S.speed);
 $('thrust-value').textContent=S.thrust+'%';$('heading').textContent=S.heading.toFixed(1)+'°';
 $('pitch-display').textContent=signed(S.pitch)+'.0°';$('roll-display').textContent=signed(S.roll)+'.0°';
 $('engine-temp').textContent=formatNumber(380+S.thrust*12.2)+' °C';$('reactor-temp').textContent=Math.round(420+S.energy[0]*5+S.thrust*1.3)+' °C';
 $('acceleration').textContent=(S.thrust/100*S.energy[0]/35*1.04).toFixed(2)+' G';
 const gauges=[S.thrust,Math.round(S.thrust*.9),S.toggles.stabilizer?88:Math.abs(S.roll)*2];
 ['main','maneuver','stable'].forEach((key,i)=>{$(key+'-value').textContent=gauges[i];$('gauge-'+key).style.setProperty('--gauge',gauges[i]*.75+'%');});
 $('engine-state').textContent=S.emergency?'ОСТАНОВЛЕН':S.mode==='boost'?'ФОРСАЖ':S.mode==='eco'?'ЭКОНОМИЧНЫЙ ХОД':'КРЕЙСЕРСКИЙ ХОД';
 $('shield-percent').textContent=Math.round(S.shield)+'%';$('shield-small').textContent=Math.round(S.shield)+'%';
 $('shield-bars').style.opacity=String(.2+S.shield/125);
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
function drawSpace(t,dt){
 const v=canvases.space;if(!v)return;const{ctx:c,w,h}=v;c.clearRect(0,0,w,h);
 const hue=S.current.hue||211;
 c.fillStyle='#020711';c.fillRect(0,0,w,h);
 const neb=c.createRadialGradient(w*.68,h*.28,0,w*.68,h*.28,w*.7);neb.addColorStop(0,`hsla(${hue},55%,35%,.16)`);neb.addColorStop(.45,`hsla(${hue+15},50%,16%,.09)`);neb.addColorStop(1,'transparent');c.fillStyle=neb;c.fillRect(0,0,w,h);
 if(S.jump){drawJump(c,w,h,t);return;}
 flightScene.draw(c,w,h,t,S,targets,reducedMotion);
 // Missile trails and impact effects, in monitor coordinates.
 const live=[];
 S.burst.forEach(effect=>{
  const age=t-effect.start;if(age<0){live.push(effect);return;}
  if(effect.type==='missile'){
   const p=clamp(age/effect.duration,0,1),ease=1-Math.pow(1-p,1.5);
   const movingTarget=targets[effect.targetIndex];if(movingTarget?.visible){effect.x=movingTarget.x;effect.y=movingTarget.y;}
   const sx=w*(.5+effect.side*.25),sy=h*1.08,tx=w*effect.x,ty=h*effect.y;
   const x=sx+(tx-sx)*ease,y=sy+(ty-sy)*ease;
   c.save();c.strokeStyle='#93e9ff';c.lineWidth=(1-p)*2+.5;c.shadowColor='#6dd7ff';c.shadowBlur=12;
   c.beginPath();const back=Math.max(0,ease-.12*(1-p)-.025);c.moveTo(sx+(tx-sx)*back,sy+(ty-sy)*back);c.lineTo(x,y);c.stroke();
   c.fillStyle='#fff1cc';c.beginPath();c.arc(x,y,Math.max(1,3*(1-p)),0,TAU);c.fill();c.restore();
   if(p>=1){
    effect.type='explosion';effect.start=t;effect.duration=1400;if(movingTarget){movingTarget.destroyed=true;movingTarget.visible=false;movingTarget.destroyedUntil=Infinity;}
    log(`Попадание: ${effect.target}. Учебная цель поражена.`,true);if(S.sound)sound.play('impact',.75);
   }live.push(effect);
  }else{
   const p=age/effect.duration;if(p<1){
    const x=w*effect.x,y=h*effect.y,r=8+p*60;const g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(235,249,255,${(1-p)*.8})`);g.addColorStop(.2,`rgba(255,200,112,${(1-p)*.7})`);g.addColorStop(.6,`rgba(70,177,255,${(1-p)*.3})`);g.addColorStop(1,'transparent');
    c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.strokeStyle=`rgba(148,220,255,${(1-p)*.6})`;c.lineWidth=1;c.beginPath();c.arc(x,y,r*.8,0,TAU);c.stroke();live.push(effect);
   }
  }
 });S.burst=live;
 const locked=targets[S.target];$('reticle').style.visibility=locked.visible&&t>(locked.destroyedUntil||0)?'visible':'hidden';
 $('reticle').style.left=(locked.x*100)+'%';$('reticle').style.top=(locked.y*100)+'%';
 $('reticle-label').textContent=locked.name+' · '+formatNumber(locked.range||0)+' КМ';
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
 if(p>.37&&!S.jump.sounded){S.jump.sounded=true;if(S.sound)sound.play('transit',.9);}
}
function drawRadar(t,dt){
 const v=canvases.radar;if(!v)return;const{ctx:c,w,h}=v,cx=w*.5,cy=h*.5,r=Math.min(w*.43,h*.45);
 c.clearRect(0,0,w,h);const grid='#70cce877';
 c.save();c.translate(cx,cy);c.strokeStyle=grid;c.lineWidth=.6;
 for(let i=1;i<=4;i++){c.beginPath();c.arc(0,0,r*i/4,0,TAU);c.stroke();}
 for(let i=0;i<12;i++){const a=i/12*TAU;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}
 c.strokeStyle='#b4ecffaa';c.beginPath();c.arc(0,0,r+4,0,TAU);c.stroke();
 for(let i=0;i<60;i++){const a=i/60*TAU,rr=r+4;c.beginPath();c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);c.lineTo(Math.cos(a)*(rr+(i%5===0?4:2)),Math.sin(a)*(rr+(i%5===0?4:2)));c.stroke();}
 if(!S.jump){
  if(!reducedMotion)radarAngle=(radarAngle+dt*(S.scan>t?2.8:.55))%TAU;
  for(let i=0;i<45;i++){
   const a=radarAngle-i*.018;c.beginPath();c.moveTo(0,0);c.arc(0,0,r,a-.019,a);c.closePath();c.fillStyle=`rgba(98,220,255,${(1-i/45)*.17})`;c.fill();
  }
  c.strokeStyle='#a6edff99';c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(radarAngle)*r,Math.sin(radarAngle)*r);c.stroke();
  targets.forEach((target,i)=>{
   if(target.destroyed||t<(target.destroyedUntil||0))return;
   const scale=200000/S.range,x=target.rx*r*scale,y=target.ry*r*scale;
   if(Math.hypot(x,y)>r)return;
   const a=Math.atan2(y,x),since=(radarAngle-a+TAU)%TAU,alpha=clamp(1-since/TAU,.25,1);
   c.globalAlpha=alpha;c.fillStyle=i===S.target?'#defbff':'#69cbe7';c.shadowBlur=8;c.shadowColor='#91eaff';
   c.beginPath();c.arc(x,y,i===S.target?3:2,0,TAU);c.fill();c.shadowBlur=0;
   if(i===S.target){c.strokeStyle='#b4eeff';c.lineWidth=1;c.strokeRect(x-7,y-7,14,14);}
   // Passive radar never emits UI clicks. Active scans have dedicated sonar pulses.
  });
 }
 c.globalAlpha=1;c.fillStyle='#bcf0ff';c.beginPath();c.moveTo(0,-5);c.lineTo(3,4);c.lineTo(0,2);c.lineTo(-3,4);c.closePath();c.fill();
 c.restore();
 if(S.scan>t){const p=clamp(1-(S.scan-t)/S.scanDuration,0,1);c.strokeStyle=`rgba(165,232,255,${1-p})`;c.lineWidth=2;c.beginPath();c.arc(cx,cy,p*r,0,TAU);c.stroke();}
}
function drawTelemetry(t){
 const v=canvases.spectrum;if(v){const{ctx:c,w,h}=v;c.clearRect(0,0,w,h);const bars=38;
  for(let i=0;i<bars;i++){const level=(Math.sin(i*1.7+t*.003)+Math.cos(i*.48-t*.002)+2)/4;c.fillStyle=i%5===0?'#c5edfa':'#5894af';const hh=(.1+level*.9)*h;c.fillRect(i*w/bars,h-hh,w/bars-1.5,hh);}
 }
 const wave=canvases.wave;if(wave){const{ctx:c,w,h}=wave;c.clearRect(0,0,w,h);c.strokeStyle='#9aeaff';c.lineWidth=1;c.beginPath();for(let x=0;x<w;x++){const y=h*.5+Math.sin(x*.11+t*.002)*h*.16+Math.sin(x*.31-t*.004)*h*.08;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
}
function tick(t){
 const dt=Math.min((t-lastFrame)/1000,1);lastFrame=t;S.frame++;
 if(!S.jump){
  const targetSpeed=S.thrust/71*28400*(.55+S.energy[0]/35*.45)*(S.toggles.stealth?.5:1);
  S.speed+=(targetSpeed-S.speed)*(1-Math.exp(-dt*1.8));if(S.thrust===0&&S.speed<.5)S.speed=0;
  S.distance+=Math.max(0,S.speed)/3600*dt;
  if(S.orbit&&!reducedMotion)S.orbit.angle+=Math.max(0,S.speed)/3600/(S.orbit.radius+S.orbit.altitude)*dt;
  flightScene.update(dt,t,S,targets,reducedMotion);
  if(S.charge<100&&S.energy[3]>0)S.charge=Math.min(100,S.charge+dt*S.energy[3]/20*(S.toggles.shields?.55:1.05));
  if(!S.toggles.autopilot)S.heading=(S.heading+S.roll*dt*.02+360)%360;
 }
 const shieldTarget=S.toggles.shields?clamp(S.energy[1]*100/15,0,100):0;S.shield+=(shieldTarget-S.shield)*dt*.8;
 // Limit painting to 30 fps without changing simulation speed.
 renderTimer+=dt;if(renderTimer>=1/30){const paintDt=renderTimer;renderTimer=0;drawSpace(t,paintDt);drawRadar(t,paintDt);drawTelemetry(t);if(S.view==='cameras')baseCameras.draw(t,reducedMotion);}
 readoutTimer+=dt;if(readoutTimer>=.2){readoutTimer=0;updateReadouts();updateReloads(t);sound.update(S.speed,S.thrust,!!S.jump,S.toggles.stealth);$('clock').textContent=new Date().toLocaleTimeString('ru-RU',{timeZone:'UTC'});}
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
 if(S.energy[4]<3)return toast('Для сканирования нужно хотя бы 3% энергии научного модуля.',true);
 const scanDuration=clamp(2500*15/S.energy[4],900,8000);S.scanDuration=scanDuration;S.scan=performance.now()+scanDuration;$('scan').textContent='СКАНИРОВАНИЕ…';$('scan').disabled=true;sound.scan(scanDuration);
 log('Сканирование сектора начато.');setTimeout(()=>{$('scan').textContent='СКАНИРОВАТЬ';$('scan').disabled=false;$('scan-id').textContent=String(Number($('scan-id').textContent)+1).padStart(2,'0');log('Сканирование завершено. Контакты и относительные скорости обновлены.',true);},scanDuration);
});
function changeRange(direction){S.range=clamp(S.range*(direction>0?2:.5),50000,800000);$('radar-range').textContent=formatNumber(S.range)+' КМ';clickSound();toast('Дальность радара: '+formatNumber(S.range)+' км.');}
$('range-down').addEventListener('click',()=>changeRange(-1));$('range-up').addEventListener('click',()=>changeRange(1));
$('cover').addEventListener('click',()=>toggleCover());$('launch').addEventListener('click',launch);
$('reload').addEventListener('click',reloadMissiles);
$('balance').addEventListener('click',()=>{S.energy=[35,15,10,20,15,5];updateEnergy();log('Восстановлено штатное распределение энергии: 35 / 20 / 15 / 10 / 15 / 5%.',true);clickSound();});
$('coordinates').addEventListener('click',openNav);$('close-nav').addEventListener('click',()=>$('nav-dialog').close());
$('set-course').addEventListener('click',()=>setCourse(S.mapSelected));
$('planet-select').addEventListener('change',e=>{const d=destinations.find(x=>x.name===e.target.value);if(d){S.mapSelected=d;renderMap();clickSound();}});
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
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();sound.setHidden(document.hidden);});
initStars();flightScene.resetTargets(targets,S.distance);initDials();renderAmmo();selectTarget(0);sizeCanvases();updateReadouts();$('clock').textContent=time();
log('Мостик готов. Командование передано вам.');log('Учебный сектор: оружие разрешено. Выберите планету или GARGANTUA для гиперперехода.');
requestAnimationFrame(tick);
})();
