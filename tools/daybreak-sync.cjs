// Daybreak -> ICS feed generator.
// usage: node daybreak-sync.cjs <daybreak.html> <dbDir with *.json docs> <out.ics> [weeksAhead=8]
// Needs: npm i jsdom
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const [,,htmlPath,dbDir,outPath,weeksArg]=process.argv;
const WEEKS=+weeksArg||8;
let html=fs.readFileSync(htmlPath,'utf8');
let js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
js=js.replace(/\}\)\(\);\s*$/,'window.__k={TRIAL:(typeof TRIAL!=="undefined"?TRIAL:null),isTrial:(typeof isTrial!=="undefined"?isTrial:()=>false),readyBlock,dayType,workoutStart,duration,weekGoals,dayFrame,isPrepDay,TYPES,S,weekIdx,dowIdx,longFor,isVac,isCall,isFlex,menuFor,MENUS,OPT,PREP_MIN,addDays,toMin,schedFor,weekInfo,easyMiles,START,__load:(o)=>{Object.assign(docs,o);invalidate();}};\n})();');
const dom=new JSDOM('<!doctype html><body>'+html.replace(/<script>[\s\S]*?<\/script>/,'')+'</body>',{runScripts:"outside-only",url:"https://x.test/"});
const w=dom.window; w.scrollTo=()=>{};
w.eval(js); const k=w.__k;
// load the user's saved docs (settings, day overrides, week swaps)
const loaded={};
if(dbDir&&fs.existsSync(dbDir)) for(const f of fs.readdirSync(dbDir)) if(f.endsWith('.json')){
  try{let o=JSON.parse(fs.readFileSync(path.join(dbDir,f),'utf8')); if(o&&o.data&&typeof o.data==='object'&&!Array.isArray(o.data)&&Object.keys(o).every(x=>['data','version','id','doc_id','updated_at','created_at'].includes(x))) o=o.data; loaded[f.replace(/\.json$/,'')]=o;}catch(e){}
}
k.__load(loaded);
const pad=n=>String(n).padStart(2,'0');
const loc=(ds,min)=>`${ds.replace(/-/g,'')}T${pad(Math.floor(min/60))}${pad(min%60)}00`;
const escI=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
const fmt=m=>{const h=Math.floor(m/60),hh=h%12||12;return `${hh}:${pad(m%60)}`;};
const now=new Date(); const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
const ev=[];
const add=(ds,key,a,b,title,desc,alarm)=>{ev.push(['BEGIN:VEVENT',`UID:daybreak-${ds}-${key}@daybreak.app`,`DTSTAMP:${stamp}`,`LAST-MODIFIED:${stamp}`,`DTSTART;TZID=America/Los_Angeles:${loc(ds,a)}`,`DTEND;TZID=America/Los_Angeles:${loc(ds,b)}`,`SUMMARY:${escI(title)}`,desc?`DESCRIPTION:${escI(desc)}`:null,alarm?['BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escI(title)}`,`TRIGGER:-PT${alarm}M`,'END:VALARM'].join('\r\n'):null,'END:VEVENT'].filter(Boolean).join('\r\n'));};
const st=k.S();
const today=`${now.toLocaleString('en-CA',{timeZone:'America/Los_Angeles'}).slice(0,10)}`;
let from=k.addDays(today,-7); if(from<k.START) from=(k.TRIAL&&today<=k.TRIAL[1]&&k.TRIAL[0]<k.START)?(k.TRIAL[0]>from?k.TRIAL[0]:from):k.START;
const days=Math.round((Date.parse(k.addDays(today,WEEKS*7))-Date.parse(from))/864e5);
for(let i=0;i<days;i++){
  const ds=k.addDays(from,i);
  if(ds<k.START&&!k.isTrial(ds)) continue;
  const t=k.dayType(ds), T=k.TYPES[t];
  if(!k.isVac(ds)&&t!=='rest'){
    const a=k.workoutStart(ds), dur=k.duration(t,ds);
    let title=T.name;
    if(t==='long'||t==='longz2') title=`Long run · ${k.longFor(ds)} mi`;
    if(t==='easy'){const wk=k.weekInfo(k.weekIdx(ds));title=`Easy run ${k.easyMiles(wk)} mi (or 45 min Zone 2 ride)`;}
    add(ds,'workout',a,a+dur,title,'Open Daybreak and tap Start workout.',10);
  }
  if(ds<k.START) continue; // test-drive days: workout only
  if(k.isPrepDay(ds)){const m=k.menuFor(k.weekIdx(ds)+1);add(ds,'prep',900,900+k.PREP_MIN[m],`Meal prep · Menu ${m}`,`${k.OPT[k.MENUS[m].lunch].n} + ${k.OPT[k.MENUS[m].dinner].n}. Recipes and grocery list in Daybreak.`,30);}
  const gb=k.weekGoals(k.weekIdx(ds)).days[k.dowIdx(ds)].blocks;
  gb.forEach((b,j)=>{const g=st.goals.find(x=>x.id===b.g);if(g)add(ds,`goal${j}`,b.a,b.b,g.name,g.notes||'',5);});
  k.dayFrame(ds).prot.forEach((p,j)=>{ if(p.kind==='off'||p.kind==='free') add(ds,`prot${j}`,p.a,p.b,p.label,'Protected time. Nothing scheduled on purpose.',0); });
  const sc=k.schedFor(ds);
  {const rb=k.readyBlock(ds); if(rb){const lv=sc.work?k.toMin(sc.start)-st.sched.commute:null; add(ds,'ready',rb[0],rb[1],`Shower + get ready${lv?` · leave by ${fmt(lv)}`:""}`,`Shower, dress, breakfast.${lv?` ${st.sched.commute} min drive to work.`:""}`,10);}}
  const bed=k.toMin(st.sched.bed); add(ds,'wind',bed-60,bed,`Wind down · read, meditate, lights out ${fmt(bed)}`,'Screens off. 10 pages and 10 minutes of meditation.',0);
}
const VTZ=['BEGIN:VTIMEZONE','TZID:America/Los_Angeles','BEGIN:DAYLIGHT','TZOFFSETFROM:-0800','TZOFFSETTO:-0700','TZNAME:PDT','DTSTART:19700308T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU','END:DAYLIGHT','BEGIN:STANDARD','TZOFFSETFROM:-0700','TZOFFSETTO:-0800','TZNAME:PST','DTSTART:19701101T020000','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU','END:STANDARD','END:VTIMEZONE'].join('\r\n');
const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Daybreak//Planner//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Daybreak','X-WR-TIMEZONE:America/Los_Angeles','REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H',VTZ,...ev,'END:VCALENDAR'].join('\r\n')+'\r\n';
fs.writeFileSync(outPath,ics);
console.log(`Daybreak feed: ${ev.length} events, ${from} to ${k.addDays(from,days-1)}, ${Object.keys(loaded).length} saved docs loaded`);
process.exit(0);
