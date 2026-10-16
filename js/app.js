"use strict";
// Ереван: куда сегодня. Карта, рекомендации, план на день, маршруты, афиша.
// Данные мест и маршрутов лежат в js/data.js, афиша в data/events.json.

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const enc = encodeURIComponent;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
let toastTimer = null;
function toast(msg){ const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600); }

const DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const toMin = s => { const [h, m] = String(s).split(":").map(Number); return h*60 + (m || 0); };
const fmt = m => { m = Math.round(m); const d = Math.floor(m/1440); const mm = ((m % 1440) + 1440) % 1440; return `${Math.floor(mm/60)}:${String(mm%60).padStart(2,"0")}${d > 0 ? " (+1)" : ""}`; };
const r5 = x => Math.max(5, Math.ceil(x/5)*5);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseYmd = s => new Date(s + "T12:00:00");
const dowOf = s => (parseYmd(s).getDay() + 6) % 7;
const nowMin = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); };
const todayStr = () => ymd(new Date());
const humanDate = s => { const d = parseYmd(s); return `${DOW[dowOf(s)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function hav(a, b){ const t = Math.PI/180, dLa = (b[0]-a[0])*t, dLo = (b[1]-a[1])*t; const x = Math.sin(dLa/2)**2 + Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)**2; return 12742*Math.asin(Math.sqrt(x)); }

// ---------- state ----------
const S = {
  tab: store.get("y.tab", "now"),
  routeKind: store.get("y.rkind", "ev"),
  route: store.get("y.route", null),
  trip: store.get("y.trip", null), wk: store.get("y.wk", null), tripDir: "all", tripLen: "all", tripTag: "all", tripSort: store.get("y.tsort", "home"),
  favs: store.get("y.favs", {}),          // k -> "want" | "been"
  events: [], eventsUpdated: null,
  weather: null,
  me: null, meAcc: null, watchId: null,
  placesFilter: "all", placesQuery: "",
  afishaFilter: "all",
  nowAt: null, dish: null, nowDish: null, foodDish: null, foodOpen: true, foodSort: "near",
};
const homeSaved = store.get("y.home", null);
if (homeSaved) { P.home.ll = homeSaved; P.home.n = "Дом"; }
SKIP_PLAN.add("me");
const INDOOR = new Set(["c_lavash","c_sherep","c_dargett","c_lahmajo","c_invino","clouds","brandy","levon","mosque","echm","areni","cinema","tsits"]);
const ARARAT_VIEW = new Set(["khor","charents","casc","mother","victory","azat"]);

// Кинотеатр «Москва» (подробности подгружаются из data/cinema.json, если файл есть)
P.cinema = {n:"Кинотеатр «Москва»", ll:[40.1830,44.5146], g:"Moscow Cinema, Yerevan"};
LIGHT.cinema = "night"; CAT.food = CAT.food || [];
const DISHES = ["хаш","шашлык","лахмаджо","хинкали","хачапури","долма","армянская кухня","грузинская кухня","пицца","гирос","шаурма","бургеры","рамен","суши","азиатская","кебаб","рёбра","стейк","кофе","бабл-ти","завтраки","десерты","вино","пиво"];
const FOOD = {c_lavash:{dishes:["армянская кухня","долма"]}, c_sherep:{dishes:["армянская кухня"]}, c_dargett:{dishes:["пиво","бургеры"]}, c_lahmajo:{dishes:["лахмаджо"]}, c_invino:{dishes:["вино"]}, saryan:{dishes:["вино"]}, prosh:{dishes:["шашлык"]}, redbr:{dishes:["шашлык","лахмаджо","армянская кухня"]}};
const hostOf = u => { try { return new URL(u).hostname.replace("www.",""); } catch(e){ return "источник"; } };

// ---------- sun ----------
function sunsetMin(date, lat = 40.18, lon = 44.51, tz = 4){
  const rad = Math.PI/180, n = Math.floor((date - new Date(date.getFullYear(),0,0))/864e5);
  const lh = lon/15, t = n + ((18-lh)/24), M = 0.9856*t - 3.289;
  const L = (M + 1.916*Math.sin(M*rad) + 0.020*Math.sin(2*M*rad) + 282.634 + 360) % 360;
  let RA = (Math.atan(0.91764*Math.tan(L*rad))/rad + 360) % 360;
  RA = (RA + (Math.floor(L/90)*90 - Math.floor(RA/90)*90))/15;
  const sd = 0.39782*Math.sin(L*rad), cd = Math.cos(Math.asin(sd));
  const ch = (Math.cos(90.833*rad) - sd*Math.sin(lat*rad))/(cd*Math.cos(lat*rad));
  const H = Math.acos(ch)/rad/15, T = H + RA - 0.06571*t - 6.622;
  return Math.round((((T - lh + tz) % 24) + 24) % 24 * 60);
}

// ---------- travel ----------
const inCity = k => { const [la, lo] = P[k].ll; return la > 40.10 && la < 40.25 && lo > 44.36 && lo < 44.62; };
const visitOf = k => k === "home" || k === "me" ? 0 : k.startsWith("ev_") ? 90 : Math.min(240, (INFO[k] && INFO[k].visit) || 45);
function travel(a, b, tmin, mode){
  const d = hav(P[a].ll, P[b].ll);
  if (d < 0.08) return {mode:"walk", min:0, d};
  const ca = inCity(a), cb = inCity(b);
  if (ca && cb){
    if (mode === "walk" || (mode !== "taxi" && d <= 2.0)) return {mode:"walk", min:Math.max(2, Math.round(d*1.3/4.6*60)), d};
    const rush = tmin >= 17*60 && tmin <= 19*60+30;
    return {mode:"taxi", min:r5(7 + d*1.4/(rush ? 16 : 22)*60), d};
  }
  const far = ca ? b : cb ? a : null;
  if (far && INFO[far] && INFO[far].drive_from_yerevan){
    const cityK = ca ? a : b;
    const extra = Math.max(0, hav(P[cityK].ll, [40.1778,44.5128])*1.4/22*60 - 5);
    return {mode:"car", min:r5(INFO[far].drive_from_yerevan + extra), d};
  }
  const south = P[a].ll[0] < 39.9 || P[b].ll[0] < 39.9;
  return {mode:"car", min:r5(5 + d*(south ? 1.45 : 1.35)/(d > 40 ? 60 : 45)*60), d};
}
const durTxt = m => m >= 90 ? `${Math.floor(m/60)} ч${m%60 ? " " + m%60 + " мин" : ""}` : `${m} мин`;
const modeTxt = t => t.min === 0 ? "рядом" : t.mode === "walk" ? `пешком ${t.min} мин` : t.mode === "taxi" ? `такси ≈${t.min} мин` : `машина ≈${durTxt(t.min)}`;

// ---------- events ----------
function eventOn(e, ds){
  if (e.weekly && e.weekly.length) return ds >= (e.date || "0000") && e.weekly.includes(dowOf(ds)) && (!e.end || ds <= e.end);
  return ds >= e.date && ds <= (e.end || e.date);
}
function eventDates(e, from, days){
  const out = [], d0 = parseYmd(from);
  for (let i = 0; i < days; i++){ const d = new Date(d0); d.setDate(d0.getDate()+i); const s = ymd(d); if (eventOn(e, s)) out.push(s); }
  return out;
}

// ---------- hours ----------
function hoursFor(k, dow, ds){
  if (k === "home" || k === "me") return {always:true};
  if (k.startsWith("ev_")){
    const e = P[k].ev; if (!eventOn(e, ds)) return {closed:true, note:"в этот день события нет"};
    if (e.time){ const f = toMin(e.time); return {f: f - 20, t: f + 150, ev:true}; }
    return {f: 10*60, t: 22*60, ev:true};
  }
  const o = INFO[k] && INFO[k].open;
  if (!o || o === "unknown") return {unknown:true};
  if (o === "always") return {always:true};
  const e = o[dow];
  if (e == null) return {closed:true};
  if (e === "always") return {always:true};
  if (e === "unknown") return {unknown:true};
  const f = toMin(e[0]); let t = toMin(e[1]); if (t <= f) t += 1440;
  return {f, t};
}
const hoursTxt = h => h.always ? "всегда открыто" : h.unknown ? "часы не найдены" : h.closed ? "закрыто" : `${fmt(h.f)}–${fmt(h.t)}`;

// ---------- weather (Open-Meteo, без ключа) ----------
const WX_PTS = [["yvn",40.18,44.51],["ararat",39.70,44.30],["sevan",40.56,45.01],["aragats",40.47,44.18]];
const WMO = c => c === 0 ? "ясно" : c <= 2 ? "переменная облачность" : c === 3 ? "пасмурно" : c <= 48 ? "туман" : c <= 57 ? "морось" : c <= 67 ? "дождь" : c <= 77 ? "снег" : c <= 82 ? "ливни" : c <= 86 ? "снегопад" : "гроза";
async function loadWeather(){
  const cached = store.get("y.wx", null);
  if (cached && Date.now() - cached.at < 45*60*1000){ S.weather = cached.data; return; }
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + WX_PTS.map(p => p[1]).join(",") + "&longitude=" + WX_PTS.map(p => p[2]).join(",")
    + "&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,cloud_cover,visibility,precipitation_probability,wind_speed_10m,snowfall&timezone=Asia%2FYerevan&forecast_days=7";
  try {
    const r = await fetch(url); if (!r.ok) throw new Error(r.status);
    const arr = await r.json(); const data = {};
    WX_PTS.forEach((p, i) => data[p[0]] = arr[i]);
    S.weather = data; store.set("y.wx", {at: Date.now(), data});
  } catch(e){ if (cached) S.weather = cached.data; }
}
function wxAt(pt, ds, minutes){
  const w = S.weather && S.weather[pt]; if (!w || !w.hourly) return null;
  const h = Math.min(23, Math.max(0, Math.floor(minutes/60)));
  const key = `${ds}T${String(h).padStart(2,"0")}:00`;
  const i = w.hourly.time.indexOf(key); if (i < 0) return null;
  const H = w.hourly;
  return {temp: H.temperature_2m[i], code: H.weather_code[i], cloud: H.cloud_cover[i], vis: H.visibility ? H.visibility[i] : null, pp: H.precipitation_probability[i], wind: H.wind_speed_10m[i], snow: H.snowfall ? H.snowfall[i] : 0};
}
const araratVisible = w => w && w.cloud != null && w.cloud < 55 && (w.vis == null || w.vis > 20000);

// ---------- evaluation ----------
function evaluate(k, A, ctx){
  const h = hoursFor(k, ctx.dow, ctx.ds), V = visitOf(k), notes = [];
  let start = A, sev = 0, bonus = 0;
  if (h.closed){ notes.push(["bad", h.note || "сегодня закрыто"]); sev = 2; }
  else if (h.f != null){
    if (A < h.f){ start = h.f; notes.push(["warn", h.ev ? `начало в ${fmt(h.f+20)}` : `откроется в ${fmt(h.f)}`]); sev = Math.max(sev, 1); }
    if (start >= h.t - 10){ notes.push(["bad", h.ev ? "уже закончилось" : "уже закрыто"]); sev = 2; }
    else if (h.t - start < Math.min(V, 40)){ notes.push(["warn", `до закрытия ${h.t - start} мин`]); sev = Math.max(sev, 1); }
    else if (!h.ev) notes.push(["ok", `открыто до ${fmt(h.t)}`]);
    else { notes.push(["ok", "событие сегодня"]); bonus = Math.max(bonus, 25); }
  } else if (h.unknown) notes.push(["info", "часы уточните"]);
  const L = LIGHT[k] || (k.startsWith("ev_") ? "any" : "day"), ss = ctx.sunset;
  if (L === "day" && start > ss - 15){ notes.push(["bad", "уже стемнеет"]); sev = Math.max(sev, 2); }
  else if (L === "day" && start + Math.min(V, 60) > ss){ notes.push(["warn", "к концу стемнеет"]); sev = Math.max(sev, 1); }
  if (L === "sunset"){
    if (Math.abs(start - (ss - 35)) <= 40){ notes.push(["ok", "к закату"]); bonus += 30; }
    else if (start > ss + 20){ notes.push(["warn", "после заката"]); sev = Math.max(sev, 1); }
  }
  if (L === "night" && start > ss) bonus += 10;
  // погода
  const wy = wxAt("yvn", ctx.ds, start);
  if (wy && (wy.pp >= 60 || (wy.code >= 51 && wy.code <= 99))){
    if (INDOOR.has(k)){ bonus += 15; notes.push(["info", "под крышей"]); }
    else if (CAT.view.includes(k) || L === "day" || L === "sunset"){ notes.push(["warn", `дождь ${wy.pp}%`]); bonus -= 25; }
  }
  if (ARARAT_VIEW.has(k)){
    const wa = wxAt("ararat", ctx.ds, start);
    if (wa){ if (araratVisible(wa)){ notes.push(["ok", "Арарат видно"]); bonus += 10; } else notes.push(["info", "Арарат в облаках"]); }
  }
  if (k === "sevan" || k === "parz"){ const ws = wxAt("sevan", ctx.ds, start); if (ws && ws.wind >= 30) notes.push(["warn", `ветер ${Math.round(ws.wind)} км/ч`]); }
  if (k === "kari" || k === "amberd"){ const wg = wxAt("aragats", ctx.ds, start); if (wg && (wg.temp <= 0 || wg.snow > 0)) { notes.push(["warn", `на Арагаце ${Math.round(wg.temp)}°${wg.snow > 0 ? ", снег" : ""}`]); sev = Math.max(sev, 1); } }
  const dn = dayNote(k, ctx); if (dn){ notes.push(dn.note); bonus += dn.bonus; }
  if (S.favs[k] === "want"){ bonus += 20; notes.push(["fav", "хотели"]); }
  if (S.favs[k] === "been") bonus -= 15;
  const stay = ctx.stay && ctx.stay[k] != null ? ctx.stay[k] : V;
  const leave = start + stay;
  const back = travel(k, "home", leave, ctx.mode);
  if (leave + back.min > ctx.ret){ notes.push(["bad", `домой к ${fmt(ctx.ret)} не успеть`]); sev = 2; }
  return {start, leave, notes, sev, bonus, wait: start - A, back};
}
// поправки по дню недели: где в будни пусто, где что-то только по выходным
const DAYNOTE = {
  verni: {weekday: ["warn", "в будни мало продавцов"], weekend: ["ok", "по выходным полный рынок"], wdPen: 25, weBonus: 20},
  cafs: {weekday: ["info", "галереи центра только пт–вс"], fri: true},
  x_gum: {weekend: ["ok", "по выходным оживлённо"], weBonus: 5},
};
function dayNote(k, ctx){
  const d = DAYNOTE[k]; if (!d) return null;
  const we = ctx.dow >= 5;
  if (we && d.weekend) return {note: d.weekend, bonus: d.weBonus || 0};
  if (!we && d.weekday && !(d.fri && ctx.dow === 4)) return {note: d.weekday, bonus: -(d.wdPen || 0)};
  return null;
}
function rank(origin, t, ctx, keys){
  return keys.filter(k => P[k] && k !== origin && !SKIP_PLAN.has(k)).map(k => {
    const tr = travel(origin, k, t, ctx.mode); const ev = evaluate(k, t + tr.min, ctx);
    return {k, tr, ev, score: ev.sev*1000 + tr.min + ev.wait*0.6 - ev.bonus};
  }).sort((a, b) => a.score - b.score);
}

// ---------- plan state ----------
const plan = Object.assign({t:"17:00", start:"home", ret:"23:00", mode:"auto", chain:[], stay:{}, filt:"all"}, store.get("y.plan", {}));
plan.date = todayStr();
const savePlan = () => store.set("y.plan", {t:plan.t, start:plan.start, ret:plan.ret, mode:plan.mode, chain:plan.chain, stay:plan.stay, filt:plan.filt});
function mkCtx(ds, tStart, ret, mode, stay){
  const d = parseYmd(ds); const r = toMin(ret);
  return {ds, dow: dowOf(ds), sunset: sunsetMin(d), ret: r + (r < tStart ? 1440 : 0), mode, stay: stay || {}};
}
function computeChain(){
  const t0 = toMin(plan.t);
  const ctx = mkCtx(plan.date, t0, plan.ret, plan.mode, plan.stay);
  const rows = []; let cur = plan.start, tcur = t0;
  if (!P[cur]) cur = plan.start = "home";
  if (cur !== "home" && cur !== "me"){ const ev = evaluate(cur, tcur, ctx); rows.push({k:cur, tr:null, arrive:tcur, ...ev}); tcur = ev.leave; }
  for (const k of plan.chain.filter(k => P[k])){ const tr = travel(cur, k, tcur, plan.mode); const A = tcur + tr.min; const ev = evaluate(k, A, ctx); rows.push({k, tr, arrive:A, ...ev}); cur = k; tcur = ev.leave; }
  return {ctx, rows, cur, tcur};
}
function addToPlan(k, opts = {}){
  if (opts.date) plan.date = opts.date;
  if (opts.fromHere && !plan.chain.length){ plan.start = S.me ? "me" : "home"; plan.t = fmt(Math.ceil(nowMin()/15)*15); }
  if (plan.start !== k && !plan.chain.includes(k)) plan.chain.push(k);
  savePlan(); toast(`«${P[k].n}» в плане`);
}

// ---------- map ----------
let map, tiles, placeLayer, routeLayer, evLayer, meLayer;
const darkQ = matchMedia("(prefers-color-scheme: dark)");
function setTiles(){
  if (tiles) return;
  tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
}
function initMap(){
  map = L.map("map", {zoomControl: true, attributionControl: true}).setView([40.183, 44.512], 13);
  setTiles();
  placeLayer = L.layerGroup().addTo(map); evLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map); meLayer = L.layerGroup().addTo(map);
  drawPlaces();
}
function drawPlaces(){
  placeLayer.clearLayers();
  const css = getComputedStyle(document.documentElement);
  for (const k in P){
    if (k === "home" || k === "me" || k.startsWith("ev_")) continue;
    if (k.startsWith("f_") && S.favs[k] !== "want") continue;
    const f = S.favs[k];
    const m = L.circleMarker(P[k].ll, {radius: f === "want" ? 6 : 4, weight: f === "want" ? 2 : 1, color: f === "want" ? css.getPropertyValue("--accent").trim() : "#fff", fillColor: f === "been" ? css.getPropertyValue("--ok").trim() : css.getPropertyValue("--muted").trim(), fillOpacity: .6});
    m.bindTooltip(P[k].n, {direction: "top"}); m.on("click", () => openPlace(k));
    placeLayer.addLayer(m);
  }
}
const numIcon = (txt, hl) => L.divIcon({className: "", html: `<div class="mk${hl ? " hl" : ""}">${txt}</div>`, iconSize: [26,26], iconAnchor: [13,13]});
const roadCache = new Map();
async function roadGeometry(pts, foot){
  const key = (foot ? "f" : "c") + pts.map(p => p.join(",")).join(";");
  if (roadCache.has(key)) return roadCache.get(key);
  const coords = pts.map(p => `${p[1]},${p[0]}`).join(";");
  const url = foot ? `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`
                   : `https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`;
  try { const r = await fetch(url); const j = await r.json(); const g = j.routes && j.routes[0] ? j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]) : null; roadCache.set(key, g); return g; }
  catch(e){ return null; }
}
let drawToken = 0;
function drawStops(keys, opts = {}){
  routeLayer.clearLayers(); const tok = ++drawToken;
  const pts = keys.filter(k => P[k]).map(k => P[k].ll);
  const css = getComputedStyle(document.documentElement); const accent = css.getPropertyValue("--accent").trim();
  const seen = {};
  keys.forEach((k, i) => { if (!P[k]) return; (seen[k] = seen[k] || []).push(i + (opts.offset ?? 1)); });
  Object.entries(seen).forEach(([k, ns]) => {
    if (k === "home" || k === "me" || k === opts.start){ if (k !== "me") routeLayer.addLayer(L.marker(P[k].ll, {icon: numIcon(k === "home" ? "Д" : "С"), title: P[k].n})); return; }
    const m = L.marker(P[k].ll, {icon: numIcon(opts.noNumbers ? "•" : ns.join("·"), opts.hl === k), title: P[k].n, riseOnHover: true});
    m.bindTooltip(P[k].n, {direction: "top", offset: [0,-12]}); m.on("click", () => openPlace(k)); routeLayer.addLayer(m);
  });
  if (opts.line !== false && pts.length > 1){
    const dashed = L.polyline(pts, {color: accent, weight: 3, opacity: .7, dashArray: "6 8"}).addTo(routeLayer);
    if (pts.length <= 12) roadGeometry(pts, opts.foot).then(g => { if (g && tok === drawToken){ routeLayer.removeLayer(dashed); L.polyline(g, {color: accent, weight: 4, opacity: .85}).addTo(routeLayer); } });
  }
  if (opts.fit !== false){
    const all = pts.concat(opts.extra || []).concat(S.me && opts.withMe ? [S.me] : []);
    if (all.length === 1) map.setView(all[0], 14);
    else if (all.length) map.fitBounds(L.latLngBounds(all), {padding: [30, 30], maxZoom: 15});
  }
}
function drawEvents(list){
  evLayer.clearLayers();
  list.forEach(e => { if (!e.ll) return; const m = L.marker(e.ll, {icon: L.divIcon({className: "", html: '<div class="mk-ev"></div>', iconSize: [18,18], iconAnchor: [9,9]})});
    m.bindTooltip(`${e.time ? e.time + " · " : ""}${e.title}`, {direction: "top"}); m.on("click", () => openPlace("ev_" + e.id)); evLayer.addLayer(m); });
}
function drawMe(){
  meLayer.clearLayers(); if (!S.me) return;
  if (S.meAcc && S.meAcc < 1500) L.circle(S.me, {radius: S.meAcc, weight: 0, fillOpacity: .12, fillColor: "#1a73e8"}).addTo(meLayer);
  L.marker(S.me, {icon: L.divIcon({className: "", html: '<div class="mk-me"></div>', iconSize: [18,18], iconAnchor: [9,9]}), zIndexOffset: 1000, title: "Я здесь"}).addTo(meLayer);
}

// ---------- geolocation ----------
function startGeo(manual){
  if (!("geolocation" in navigator)){ toast("Браузер не умеет определять местоположение"); return; }
  if (S.watchId != null){ if (manual && S.me) map.setView(S.me, 15); return; }
  let first = true;
  S.watchId = navigator.geolocation.watchPosition(pos => {
    S.me = [pos.coords.latitude, pos.coords.longitude]; S.meAcc = pos.coords.accuracy;
    P.me = {n: "Я здесь", ll: S.me, g: S.me.join(",")};
    store.set("y.geoOn", true); $("locBtn").classList.add("on"); drawMe();
    if (first){ first = false; if (manual) map.setView(S.me, 15); if (["now","plan","places","afisha"].includes(S.tab)) renderView(); }
  }, err => {
    S.watchId = null; $("locBtn").classList.remove("on");
    toast(err.code === 1 ? "Доступ к геопозиции запрещён. Разрешите его в настройках браузера." : "Не удалось определить местоположение");
  }, {enableHighAccuracy: true, maximumAge: 30000, timeout: 20000});
}
const originKey = () => S.me ? "me" : "home";
const originName = () => S.me ? "от вас" : (homeSaved ? "от дома" : "от центра");

// ---------- links ----------
const gplace = p => `https://www.google.com/maps/search/?api=1&query=${enc(p.g || p.ll.join(","))}`;
const gdir = (ll, walk) => `https://www.google.com/maps/dir/?api=1&destination=${ll.join(",")}&travelmode=${walk ? "walking" : "driving"}`;
const taxiLink = ll => `https://3.redirect.appmetrica.yandex.com/route?${S.me ? `start-lat=${S.me[0]}&start-lon=${S.me[1]}&` : ""}end-lat=${ll[0]}&end-lon=${ll[1]}&level=50&ref=yerevan-app&appmetrica_tracking_id=1178268795219780156`;
const inYvnLL = ll => ll[0] > 40.08 && ll[0] < 40.26 && ll[1] > 44.36 && ll[1] < 44.65;
function placeLinks(k){
  const p = P[k], f = FOOD[k] || {}, L0 = f.links || {}, q = p.g || p.n, city = inYvnLL(p.ll);
  return {
    google: L0.google || `https://www.google.com/maps/search/?api=1&query=${enc(q)}`,
    yandex: L0.yandex || (city ? `https://yandex.ru/maps/10262/yerevan/search/${enc(p.n)}/?ll=${p.ll[1]},${p.ll[0]}&z=16` : `https://yandex.ru/maps/?text=${enc(p.n + " Армения")}&ll=${p.ll[1]},${p.ll[0]}&z=14`),
    gis: L0.gis || `https://2gis.am/yerevan/search/${enc(p.n)}`,
    site: L0.site || null,
  };
}
const yandexPt = ll => `https://yandex.ru/maps/?pt=${ll[1]},${ll[0]}&z=16&l=map`;

// ---------- tabs ----------
const TABS = [["now","Сейчас"],["food","Еда"],["plan","План"],["routes","Маршруты"],["trips","Выходной"],["afisha","Афиша"],["places","Места"],["info","Полезно"]];
const ICONS = {
  now: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2.5 5-2.5 8h3V21M16.5 3v8"/>',
  plan: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  routes: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  wk: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2 2 4-4"/>',
  trips: '<path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h18"/><circle cx="7.5" cy="15.5" r=".8"/><circle cx="16.5" cy="15.5" r=".8"/>',
  afisha: '<path d="M4 8V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v0a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V12a2 2 0 0 0 0-4z"/><path d="M10 5v14" stroke-dasharray="2 2"/>',
  places: '<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ""}</svg>`;
function goTab(k){ S.tab = k; store.set("y.tab", k); render(); window.scrollTo({top: Math.min(window.scrollY, Math.max(0, $("tabs").offsetTop - 4)), behavior: "smooth"}); }
function renderTabs(){
  const nav = $("tabs"); nav.innerHTML = "";
  const tabs = wkActive() ? [["wk", (TRIPS_META.featured.tab || "Выходные")], ...TABS] : TABS;
  if (S.tab === "wk" && !wkActive() && TRIPS_META.loaded) S.tab = "trips";
  tabs.forEach(([k, l]) => { const b = document.createElement("button"); b.setAttribute("role","tab"); b.setAttribute("aria-selected", S.tab === k); b.innerHTML = `${icon(k)}<span>${l}</span>`;
    b.onclick = () => goTab(k); nav.appendChild(b); });
}
function renderStrip(){
  const ds = todayStr(), ss = sunsetMin(parseYmd(ds)), n = nowMin();
  const w = S.weather && S.weather.yvn && S.weather.yvn.current;
  const left = ss - n;
  $("strip").innerHTML = `<span>${humanDate(ds)}</span><span>закат <b>${fmt(ss)}</b>${left > 0 && left < 360 ? ` (через ${durTxt(left)})` : ""}</span>`
    + (w ? `<span><b>${Math.round(w.temperature_2m)}°</b> ${WMO(w.weather_code)}</span>` : "")
    + `<span>${S.me ? "геопозиция включена" : ""}</span>`;
}
function render(){ renderTabs(); renderStrip(); renderView(); }
function renderView(){
  evLayer.clearLayers();
  ({now: renderNow, food: renderFood, plan: renderPlan, routes: renderRoutes, trips: renderTrips, wk: renderWeekend, afisha: renderAfisha, places: renderPlaces, info: renderInfo}[S.tab] || renderNow)();
}
const view = () => $("view");
const thumb = k => { const ph = (PHOTOS[k] || [])[0]; return ph ? `<img class="thumb" src="${ph.src}" alt="" loading="lazy">` : `<span class="thumb"></span>`; };
const chipsHtml = notes => notes.map(n => `<span class="st ${n[0]}">${esc(n[1])}</span>`).join("");
const firstSentence = s => { if (!s) return ""; const m = String(s).match(/^.*?[.!?](\s|$)/); return (m ? m[0] : s).trim(); };

// ---------- "Сейчас" ----------
function renderNow(){
  const ds = todayStr(); const n = nowMin();
  const dow = dowOf(ds), weekday = dow < 5;
  if (!S.nowAt) S.nowAt = (weekday && n >= 8*60 && n < 17*60) ? "17" : "now";
  if (weekday && S.nowAt === "10") S.nowAt = "now";
  if (!weekday && S.nowAt === "17") S.nowAt = "now";
  const tStart = S.nowAt === "17" ? 17*60 : S.nowAt === "10" ? 10*60 : Math.ceil(n/5)*5;
  const atLabel = S.nowAt === "17" ? "после работы" : S.nowAt === "10" ? "с утра" : "сейчас";
  const trips = weekday ? [] : dayTrips(ds, Math.max(tStart, S.nowAt === "now" ? 0 : tStart));
  const ctx = mkCtx(ds, tStart, plan.ret, plan.mode, {});
  const origin = originKey();
  const ss = ctx.sunset;
  const wy = wxAt("yvn", ds, tStart), wa = wxAt("ararat", ds, Math.min(Math.max(tStart, 9*60), ss - 30));
  const cur = S.weather && S.weather.yvn && S.weather.yvn.current;
  const keys = Object.keys(P).filter(k => !k.startsWith("ev_") && !(FOOD[k] && k.startsWith("f_")));
  const recs = rank(origin, tStart, ctx, keys).filter(r => r.ev.sev < 2).slice(0, 8);
  const evToday = S.events.filter(e => eventOn(e, ds) && P["ev_" + e.id]).map(e => {
    const k = "ev_" + e.id; const tr = travel(origin, k, tStart, ctx.mode); return {e, k, tr, ev: evaluate(k, tStart + tr.min, ctx)};
  }).filter(x => x.ev.sev < 2).sort((a, b) => (a.e.time || "99").localeCompare(b.e.time || "99"));
  const soon = S.events.filter(e => !eventOn(e, ds)).map(e => ({e, d: eventDates(e, ds, 8)[0]})).filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 5);
  const wants = Object.keys(S.favs).filter(k => S.favs[k] === "want" && P[k]);
  const wantRows = rank(origin, tStart, ctx, wants);
  const foodKeys = Object.keys(FOOD).filter(k => P[k] && (!S.nowDish || (FOOD[k].dishes || []).includes(S.nowDish)));
  const foodRows = rank(origin, tStart, ctx, foodKeys).filter(r => r.ev.sev < 2).slice(0, S.nowDish ? 8 : 5);

  view().innerHTML = `
    <div class="wx">
      <div class="card"><span class="lab">Сейчас в Ереване</span><span class="big">${cur ? Math.round(cur.temperature_2m) + "°" : "—"}</span><span class="small">${cur ? WMO(cur.weather_code) + `, ветер ${Math.round(cur.wind_speed_10m)} км/ч` : "погода загружается"}</span></div>
      <div class="card"><span class="lab">Закат</span><span class="big">${fmt(ss)}</span><span class="small">${ss - n > 0 ? `через ${durTxt(ss - n)}` : "уже стемнело"}</span></div>
      <div class="card"><span class="lab">Арарат сегодня</span><span class="big">${wa ? (araratVisible(wa) ? "видно" : "в облаках") : "—"}</span><span class="small">${wa ? `облачность ${wa.cloud}%` : "нет прогноза"}</span></div>
      ${wy && wy.pp >= 40 ? `<div class="card"><span class="lab">Дождь</span><span class="big">${wy.pp}%</span><span class="small">ближайшие часы, выбирайте места под крышей</span></div>` : ""}
    </div>
    <div class="quick">
      <button data-goto="food">${icon("food")}<span>Поесть</span></button>
      <button data-goto="afisha" data-af="today">${icon("afisha")}<span>Сегодня в афише</span></button>
      <button data-goto="${weekday ? "routes" : "trips"}" ${weekday ? 'data-rk="ev"' : ""}>${icon(weekday ? "routes" : "trips")}<span>${weekday ? "Маршрут на вечер" : "Выезд на день"}</span></button>
      <button data-goto="plan">${icon("plan")}<span>Мой план${plan.chain.length ? ` (${plan.chain.length})` : ""}</span></button>
    </div>
    <div class="summary">
      <span class="muted small">Считаю ${originName()}, ${S.nowAt === "now" ? "с текущего времени" : "с " + fmt(tStart)}, домой к ${plan.ret}.</span>
      ${!S.me ? `<button class="btn sm ghost" id="geoNow">Включить геопозицию</button>` : ""}
      <span class="filt" style="margin:0"><button data-at="now" aria-pressed="${S.nowAt === "now"}">Сейчас</button>${weekday ? `<button data-at="17" aria-pressed="${S.nowAt === "17"}">После работы, 17:00</button>` : `<button data-at="10" aria-pressed="${S.nowAt === "10"}">С утра, 10:00</button>`}</span>
    </div>

    ${evToday.length ? `<div class="sect">Сегодня в городе</div><div class="evrow">${evToday.slice(0,10).map(x => eventItem(x.e, x.tr, x.ev)).join("")}</div>` : ""}

    ${trips.length ? `<div class="sect">Выезд на день</div><div class="list">${trips.map(tripItem).join("")}</div>` : ""}
    <div class="sect">${weekday ? "Куда сходить " + atLabel : "В городе " + atLabel}</div>
    <div class="list">${recs.length ? recs.map((r, i) => recItem(r, i + 1)).join("") : `<p class="muted">Сейчас ничего не успевается. Попробуйте другое время или поменяйте «Дома к» во вкладке «План».</p>`}</div>

    ${wantRows.length ? `<div class="sect">Вы хотели посетить</div><div class="list">${wantRows.slice(0,6).map(r => recItem(r)).join("")}</div>` : ""}
    <div class="sect">Поесть рядом</div>${dishTiles(S.nowDish, "data-ndish", true)}
    <div class="fgrid">${foodRows.length ? foodRows.map(foodCard).join("") : `<p class="muted">Ничего подходящего открытого рядом не нашлось.</p>`}</div>
    ${soon.length ? `<div class="sect">Скоро в афише</div><div class="evrow">${soon.map(x => eventItem(x.e, null, null, x.d)).join("")}</div>` : ""}
  `;
  $("geoNow")?.addEventListener("click", () => startGeo(true));
  view().querySelectorAll("[data-at]").forEach(b => b.onclick = () => { S.nowAt = b.dataset.at; renderNow(); });
  view().querySelectorAll("[data-trip]").forEach(b => b.onclick = () => openRouteInPlan(R.find(r => r.id === b.dataset.trip), ds, b.dataset.t));
  view().querySelectorAll("[data-ndish]").forEach(b => b.onclick = () => { S.nowDish = S.nowDish === b.dataset.ndish ? null : b.dataset.ndish; renderNow(); });
  bindCommon();
  drawStops([origin, ...recs.map(r => r.k)], {line: false, offset: 0, withMe: true});
  drawEvents(evToday.map(x => x.e));
}
// выезды на день: прогоняем маршрут от дома с заданного времени и смотрим, что закрыто и когда вернёмся
function dayTrips(ds, tStart){
  const ret = Math.max(toMin(plan.ret), 22*60);
  return R.filter(r => r.kind === "day").map(r => {
    const first = r.stops.find(s => s.t && /^\d/.test(s.t));
    const t0 = Math.max(tStart, first ? toMin(first.t) : 9*60);
    const ctx = mkCtx(ds, t0, fmt(ret), "taxi", {});
    const stops = r.stops.filter(s => s.p && P[s.p]).map(s => s.p).filter((p, i, a) => a.indexOf(p) === i);
    let cur = "home", t = t0; const issues = [];
    for (const k of stops){
      const tr = travel(cur, k, t, "auto"); const ev = evaluate(k, t + tr.min, ctx);
      ev.notes.filter(n => n[0] === "bad" && !/домой/.test(n[1])).forEach(n => issues.push(`${P[k].n}: ${n[1]}`));
      cur = k; t = ev.leave;
    }
    const home = t + travel(cur, "home", t, "auto").min;
    const late = home > ret;
    return {r, t0, home, issues, late, score: issues.length*100 + (late ? 500 : 0) + Math.max(0, home - 20*60)/10};
  }).sort((a, b) => a.score - b.score).slice(0, 5);
}
function tripItem(x){
  const k0 = x.r.stops.find(s => s.p).p;
  return `<div class="item ${x.late || x.issues.length > 1 ? "dim" : ""}">
    ${thumb(k0)}
    <div style="min-width:0"><span class="nm">${esc(x.r.title)}</span>
      <div class="mt"><span>выезд ${fmt(x.t0)}</span><span>дома ≈ ${fmt(x.home)}</span>${x.late ? `<span class="st bad">поздно</span>` : !x.issues.length ? `<span class="st ok">успеваете</span>` : ""}${x.issues.slice(0, 2).map(i => `<span class="st warn">${esc(i)}</span>`).join("")}</div>
      <div class="why muted">${esc(firstSentence(x.r.why))}</div></div>
    <div class="acts"><button class="btn sm ghost" data-trip="${x.r.id}" data-t="${fmt(x.t0)}">В план</button></div>
  </div>`;
}
function openRouteInPlan(r, ds, t){
  if (!r) return;
  const stops = r.stops.filter(s => s.p && P[s.p]).map(s => s.p).filter((p, i, a) => a.indexOf(p) === i);
  const walkStart = r.kind === "ev" && !r.stops[0].drive;
  plan.start = walkStart ? stops[0] : "home"; plan.chain = walkStart ? stops.slice(1) : stops;
  plan.t = t || (r.stops.find(s => s.t && /^\d/.test(s.t)) || {t: "17:00"}).t; plan.stay = {}; plan.date = ds || todayStr();
  if (r.kind !== "ev") plan.ret = fmt(Math.max(toMin(plan.ret), 22*60));
  savePlan(); S.tab = "plan"; store.set("y.tab", "plan"); render();
}
function recItem(r, num){
  const I = INFO[r.k] || {};
  return `<div class="item ${r.ev.sev >= 2 ? "dim" : ""}">
    ${thumb(r.k)}
    <div style="min-width:0"><button class="plink nm" data-open="${r.k}">${num ? num + ". " : ""}${esc(P[r.k].n)}</button>
      <div class="mt"><span>${modeTxt(r.tr)}</span><span>там в ${fmt(r.ev.start)}</span>${chipsHtml(r.ev.notes)}</div>
      ${I.best ? `<div class="why muted">${esc(firstSentence(I.best))}</div>` : ""}</div>
    <div class="acts"><button class="btn sm ghost" data-add="${r.k}">В план</button><a class="btn sm" href="${r.tr.mode === "walk" ? gdir(P[r.k].ll, true) : taxiLink(P[r.k].ll)}" target="_blank" rel="noopener">${r.tr.mode === "walk" ? "Идти" : "Такси"}</a></div>
  </div>`;
}
const isFree = e => e.free === true || (e.tags || []).includes("бесплатно") || /бесплат/i.test(e.price || "");
function eventItem(e, tr, ev, dateShown){
  const k = "ev_" + e.id;
  const bg = e.img ? `style="background-image:url('${esc(e.img)}')"` : "";
  return `<article class="evc">
    <button class="evimg ${e.img ? "" : "noimg"}" data-open="${P[k] ? k : ""}" ${bg} aria-label="${esc(e.title)}">
      ${e.img ? "" : `<span class="evph">${esc((e.tags || [])[0] || "событие")}</span>`}
      <span class="evtime">${e.time || "весь день"}</span>
      ${dateShown ? `<span class="evdate">${humanDate(dateShown)}</span>` : ""}
      ${isFree(e) ? `<span class="evfree">бесплатно</span>` : ""}
    </button>
    <div class="evbody">
      ${P[k] ? `<button class="plink nm" data-open="${k}">${esc(e.title)}</button>` : `<span class="nm">${esc(e.title)}</span>`}
      <div class="mt"><span>${esc(e.venue || "")}</span>${tr ? `<span>${modeTxt(tr)}</span>` : ""}${e.price && !isFree(e) ? `<span>${esc(e.price)}</span>` : ""}${ev ? chipsHtml(ev.notes.filter(n => n[0] !== "ok")) : ""}</div>
      ${e.desc ? `<p>${esc(e.desc)}</p>` : ""}
      <div class="evacts">${P[k] ? `<button class="btn sm ghost" data-add="${k}" data-date="${dateShown || ""}">В план</button>` : ""}${e.link ? `<a class="btn sm" href="${esc(e.link)}" target="_blank" rel="noopener">Источник</a>` : ""}</div>
    </div>
  </article>`;
}
// ---------- ratings ----------
let DISH_IMG = {};
function ratingsOf(k){
  const f = FOOD[k]; if (!f) return {};
  if (f.R) return f.R;
  const txt = String(f.rating || ""), out = {};
  const g = txt.match(/Google\s*([\d.,]+)\s*(?:\((\d[\d\s,]*)\))?/i), y = txt.match(/(?:Yandex|Яндекс)\s*([\d.,]+)\s*(?:\((\d[\d\s,]*)\))?/i), z = txt.match(/2\s?(?:GIS|ГИС)\s*([\d.,]+)\s*(?:\((\d[\d\s,]*)\))?/i);
  const num = m => m ? [parseFloat(m[1].replace(",", ".")), m[2] ? parseInt(m[2].replace(/[\s,]/g, "")) : null] : null;
  out.google = num(g); out.yandex = num(y); out.gis = num(z);
  return (f.R = out);
}
function rankScore(k){
  const R = ratingsOf(k); const adj = (x, prior, shift = 0) => x ? ((x[0] - shift) * (x[1] || 20) + prior * 40) / ((x[1] || 20) + 40) : null;
  const vals = [adj(R.google, 4.3), adj(R.gis, 4.3), adj(R.yandex, 4.3, 0.35)].filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 4.0;
}
const kfmt = n => n == null ? "" : n >= 1000 ? (n/1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "") + "k" : String(n);
function ratingBadges(k, withLinks){
  const R = ratingsOf(k), Lk = withLinks ? placeLinks(k) : {};
  const b = (cls, lab, x, url) => x ? (url ? `<a class="rt ${cls}" href="${url}" target="_blank" rel="noopener">` : `<span class="rt ${cls}">`) + `<b>${lab}</b> ${x[0].toFixed(1)}${x[1] ? ` <small>${kfmt(x[1])}</small>` : ""}` + (url ? "</a>" : "</span>") : "";
  return b("g", "G", R.google, Lk.google) + b("y", "Я", R.yandex, Lk.yandex) + b("z", "2ГИС", R.gis, (FOOD[k] && FOOD[k].R && FOOD[k].R.gis_url) || Lk.gis);
}
function dishTiles(sel, attr, compact){
  const counts = {}; Object.keys(FOOD).forEach(k => { if (P[k]) (FOOD[k].dishes || []).forEach(d => counts[d] = (counts[d] || 0) + 1); });
  const list = DISHES.filter(d => counts[d]);
  return `<div class="tiles ${compact ? "compact" : ""}">${list.map(d => { const im = DISH_IMG[d];
    return `<button class="tile" ${attr}="${d}" aria-pressed="${sel === d}">${im ? `<img src="${im.src}" alt="" loading="lazy">` : `<span class="tile-ph"></span>`}<span class="tl">${esc(d)}</span>${compact ? "" : `<span class="tc">${counts[d]}</span>`}</button>`; }).join("")}</div>`;
}
function foodCard(r){
  const k = r.k, f = FOOD[k] || {};
  const ph = (PHOTOS[k] || [])[0] || (f.dishes && DISH_IMG[(f.top_for && f.top_for[0]) || f.dishes[0]]);
  const openNote = r.ev.notes.find(n => /открыто|откроется|закрыт|часы/.test(n[1]));
  return `<div class="fcard">
    <button class="fimg" data-open="${k}" aria-label="${esc(P[k].n)}">${ph ? `<img src="${ph.src}" alt="" loading="lazy">` : ""}</button>
    <div class="fbody">
      <button class="plink nm" data-open="${k}">${esc(P[k].n)}</button>
      <div class="rts">${ratingBadges(k)}</div>
      <div class="mt"><span>${modeTxt(r.tr)}</span>${openNote ? chipsHtml([openNote]) : ""}${S.foodDish && (f.top_for || []).includes(S.foodDish) ? `<span class="st ok">топ по блюду</span>` : ""}${S.favs[k] === "want" ? `<span class="st fav">хотели</span>` : ""}</div>
      ${f.order ? `<div class="why">${esc(f.order)}</div>` : ""}
      <div class="facts"><button class="btn sm ghost" data-add="${k}">В план</button><a class="btn sm" href="${r.tr.mode === "walk" ? gdir(P[k].ll, true) : taxiLink(P[k].ll)}" target="_blank" rel="noopener">${r.tr.mode === "walk" ? "Идти" : "Такси"}</a></div>
    </div>
  </div>`;
}
function renderFood(){
  const ds = todayStr(); const t = Math.ceil(nowMin()/5)*5; const origin = originKey();
  const ctx = mkCtx(ds, t, "23:59", "auto", {});
  const fq = (S.foodQ || "").trim().toLowerCase();
  let keys = Object.keys(FOOD).filter(k => P[k] && (!S.foodDish || (FOOD[k].dishes || []).includes(S.foodDish)) && (!fq || (P[k].n + " " + (FOOD[k].order || "") + " " + (FOOD[k].dishes || []).join(" ")).toLowerCase().includes(fq)));
  let rows = rank(origin, t, ctx, keys);
  if (S.foodOpen) rows = rows.filter(r => !r.ev.notes.some(n => /закрыт|выходной/.test(n[1])));
  if (S.foodSort === "rating") rows.sort((a, b) => rankScore(b.k) - rankScore(a.k));
  else if (S.foodDish) rows.sort((a, b) => ((FOOD[b.k].top_for || []).includes(S.foodDish) - (FOOD[a.k].top_for || []).includes(S.foodDish)) || (a.tr.min - b.tr.min));
  else rows.sort((a, b) => a.tr.min - b.tr.min);
  view().innerHTML = `
    <input class="search" id="fq" type="search" placeholder="Найти: название, блюдо, «хинкали», «24/7»…" value="${esc(S.foodQ || "")}" aria-label="Поиск еды">
    ${dishTiles(S.foodDish, "data-fd")}
    <div class="summary">
      <span class="filt" style="margin:0"><button data-fo="1" aria-pressed="${S.foodOpen}">Открыто сейчас</button><button data-fs="near" aria-pressed="${S.foodSort === "near"}">Рядом</button><button data-fs="rating" aria-pressed="${S.foodSort === "rating"}">По рейтингу</button>${S.foodDish ? `<button data-fd="">Сбросить: ${esc(S.foodDish)}</button>` : ""}</span>
      <span class="small muted">${rows.length} мест ${originName()}</span>
    </div>
    <div class="fgrid">${rows.slice(0, 60).map(foodCard).join("") || `<p class="muted">Ничего не нашлось. Снимите «Открыто сейчас» или выберите другое блюдо.</p>`}</div>
    <p class="small muted" style="margin-top:12px">Рейтинги из Google, Яндекс Карт и 2ГИС на октябрь 2026. У Яндекса оценки обычно выше, поэтому при сортировке они учитываются с поправкой.</p>`;
  view().querySelectorAll("[data-fd]").forEach(b => b.onclick = () => { S.foodDish = (b.dataset.fd && S.foodDish !== b.dataset.fd) ? b.dataset.fd : null; renderFood(); });
  const fqi = $("fq"); fqi.addEventListener("input", () => { S.foodQ = fqi.value; const pos = fqi.selectionStart; renderFood(); const n = $("fq"); n.focus(); n.setSelectionRange(pos, pos); });
  view().querySelector("[data-fo]").onclick = () => { S.foodOpen = !S.foodOpen; renderFood(); };
  view().querySelectorAll("[data-fs]").forEach(b => b.onclick = () => { S.foodSort = b.dataset.fs; renderFood(); });
  bindCommon();
  drawStops(rows.slice(0, 20).map(r => r.k), {line: false, noNumbers: true, withMe: true});
}
function foodItem(r){
  const f = FOOD[r.k] || {};
  return `<div class="item">
    ${thumb(r.k)}
    <div style="min-width:0"><button class="plink nm" data-open="${r.k}">${esc(P[r.k].n)}</button>
      <div class="mt"><span>${modeTxt(r.tr)}</span>${f.rating ? `<span>${esc(String(f.rating).split("/")[0])}</span>` : ""}${chipsHtml(r.ev.notes.filter(n => n[0] !== "ok" || /открыто/.test(n[1])))}</div>
      ${f.order ? `<div class="why">${esc(f.order)}</div>` : ""}
      ${(f.dishes || []).length ? `<div class="mt">${f.dishes.slice(0,4).map(d => `<span class="st info">${esc(d)}</span>`).join("")}</div>` : ""}</div>
    <div class="acts"><button class="btn sm ghost" data-add="${r.k}">В план</button><a class="btn sm" href="${r.tr.mode === "walk" ? gdir(P[r.k].ll, true) : taxiLink(P[r.k].ll)}" target="_blank" rel="noopener">${r.tr.mode === "walk" ? "Идти" : "Такси"}</a></div>
  </div>`;
}
const dishChips = (sel, attr) => `<div class="filt dishes">${[null, ...DISHES.filter(d => Object.values(FOOD).some(f => (f.dishes || []).includes(d)))].map(d => `<button ${attr}="${d || ""}" aria-pressed="${(sel || null) === d}">${d || "любое"}</button>`).join("")}</div>`;

// ---------- "План" ----------
function renderPlan(){
  const {ctx, rows, cur, tcur} = computeChain();
  const back = travel(cur, "home", tcur, plan.mode); const homeAt = tcur + back.min;
  const opts = Object.keys(P).filter(k => !SKIP_PLAN.has(k) && !k.startsWith("ev_")).sort((a, b) => P[a].n.localeCompare(P[b].n, "ru"));
  view().innerHTML = `
   <div class="pctrl">
     <label for="p-date">День<input id="p-date" type="date" value="${plan.date}"></label>
     <label for="p-time">Начинаем в<input id="p-time" type="time" value="${plan.t}"></label>
     <label for="p-start">Откуда<select id="p-start"><option value="home">${homeSaved ? "Дом" : "Дом / центр"}</option>${S.me ? `<option value="me" ${plan.start === "me" ? "selected" : ""}>Я здесь</option>` : ""}${opts.map(k => `<option value="${k}" ${plan.start === k ? "selected" : ""}>${esc(P[k].n)}</option>`).join("")}</select></label>
     <label for="p-ret">Дома к<input id="p-ret" type="time" value="${plan.ret}"></label>
     <label for="p-mode">Передвигаемся<select id="p-mode"><option value="auto">рядом пешком, дальше такси</option><option value="walk">только пешком</option><option value="taxi">такси или машина</option></select></label>
   </div>
   <div class="filt">
     <button data-preset="now">С текущего места и времени</button>
     <button data-preset="casc">Каскад в 17:00</button>
     <button data-preset="mother">Мать Армения к закату</button>
     <button data-preset="azat">Азат на закат</button>
     <button data-preset="day">Выходной с 9:00</button>
   </div>
   <div class="summary">
     <span>${DOW[ctx.dow]}, закат в <b>${fmt(ctx.sunset)}</b></span>
     <span>${rows.length ? `дома ≈ <b>${fmt(homeAt)}</b> (${modeTxt(back)})` : "добавьте первую точку ниже"}</span>
     ${rows.length ? (homeAt > ctx.ret ? `<span class="st bad">не успеваете домой к ${plan.ret}</span>` : `<span class="st ok">успеваете</span>`) : ""}
   </div>
   <ol class="chain">
     ${plan.start === "home" || plan.start === "me" ? `<li><span class="tm">${fmt(toMin(plan.t))}</span><span class="nm muted">${plan.start === "me" ? "Отсюда" : "Выход из дома"}</span><span></span></li>` : ""}
     ${rows.map((r, i) => `<li>
        <span class="tm">${fmt(r.start)}–${fmt(r.leave)}</span>
        <span class="nm"><button class="plink" data-open="${r.k}">${esc(P[r.k].n)}</button></span>
        <span class="ctl"><button data-stay="${r.k}" data-d="-15" aria-label="Меньше времени">−</button><span>${Math.round(r.leave - r.start)} мин</span><button data-stay="${r.k}" data-d="15" aria-label="Больше времени">+</button>${plan.chain.includes(r.k) ? `<button data-del="${r.k}" aria-label="Убрать">×</button>` : ""}</span>
        <span class="tr">${r.tr ? `<span>${modeTxt(r.tr)}</span>` : ""}${chipsHtml(r.ev.notes)}</span>
      </li>`).join("")}
   </ol>
   <div class="actions">
     ${rows.length ? `<a class="btn primary" href="${planGmaps(rows)}" target="_blank" rel="noopener">Маршрут в Google Maps</a><button class="btn" id="p-share">Поделиться планом</button><button class="btn" id="p-clear">Начать заново</button>` : ""}
   </div>
   <div class="sect">Куда дальше${rows.length ? ` из «${esc(P[cur].n)}»` : ""} в ${fmt(tcur)}</div>
   <div class="filt">${[["all","Всё"],["near","До 20 мин"],["food","Еда и бары"],["view","Виды и природа"],["culture","Храмы и музеи"],["want","Хотели"],["events","События"]].map(([k, l]) => `<button data-filt="${k}" aria-pressed="${plan.filt === k}">${l}</button>`).join("")}</div>
   <div class="list" id="cands"></div>`;
  $("p-mode").value = plan.mode;
  const used = new Set([plan.start, ...plan.chain]);
  let keys = Object.keys(P).filter(k => !used.has(k));
  const f = plan.filt;
  if (f === "food") keys = keys.filter(k => CAT.food.includes(k));
  else if (f === "view") keys = keys.filter(k => CAT.view.includes(k));
  else if (f === "culture") keys = keys.filter(k => !CAT.food.includes(k) && !CAT.view.includes(k) && !k.startsWith("ev_"));
  else if (f === "want") keys = keys.filter(k => S.favs[k] === "want");
  else if (f === "events") keys = keys.filter(k => k.startsWith("ev_"));
  let cands = rank(cur, tcur, ctx, keys);
  if (f === "near") cands = cands.filter(c => c.tr.min <= 20);
  const shown = cands.slice(0, plan.more ? 40 : 12);
  $("cands").innerHTML = shown.map(c => `<div class="item ${c.ev.sev >= 2 ? "dim" : ""}">
      ${thumb(c.k)}
      <div style="min-width:0"><button class="plink nm" data-open="${c.k}">${esc(P[c.k].n)}</button>
        <div class="mt"><span>${modeTxt(c.tr)}</span><span>там в ${fmt(c.ev.start)}</span>${chipsHtml(c.ev.notes)}</div></div>
      <div class="acts"><button class="btn sm ghost" data-padd="${c.k}" ${c.ev.sev >= 2 ? "disabled" : ""}>Добавить</button></div>
    </div>`).join("") + (cands.length > shown.length ? `<button class="btn" id="p-more">Показать ещё ${cands.length - shown.length}</button>` : "") + (!cands.length ? `<p class="muted">По этому фильтру ничего нет.</p>` : "");
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on("p-date", "change", e => { plan.date = e.target.value || plan.date; renderPlan(); });
  on("p-time", "change", e => { plan.t = e.target.value || "17:00"; savePlan(); renderPlan(); });
  on("p-start", "change", e => { plan.start = e.target.value; plan.chain = plan.chain.filter(k => k !== plan.start); savePlan(); renderPlan(); });
  on("p-ret", "change", e => { plan.ret = e.target.value || "23:00"; savePlan(); renderPlan(); });
  on("p-mode", "change", e => { plan.mode = e.target.value; savePlan(); renderPlan(); });
  view().querySelectorAll("[data-preset]").forEach(b => b.onclick = () => {
    const p = b.dataset.preset; plan.chain = []; plan.stay = {}; plan.more = false; plan.date = todayStr();
    const ss = sunsetMin(parseYmd(plan.date));
    if (p === "now"){ plan.start = S.me ? "me" : "home"; plan.t = fmt(Math.ceil(nowMin()/15)*15); }
    if (p === "casc"){ plan.start = "casc"; plan.t = "17:00"; }
    if (p === "mother"){ plan.start = "home"; plan.t = fmt(ss - 60); plan.chain = ["mother"]; }
    if (p === "azat"){ plan.start = "home"; plan.t = "17:00"; plan.chain = ["azat"]; plan.ret = "22:30"; }
    if (p === "day"){ plan.start = "home"; plan.t = "09:00"; plan.ret = "22:00"; }
    savePlan(); renderPlan(); });
  view().querySelectorAll("[data-padd]").forEach(b => b.onclick = () => { plan.chain.push(b.dataset.padd); plan.more = false; savePlan(); renderPlan(); });
  view().querySelectorAll("[data-filt]").forEach(b => b.onclick = () => { plan.filt = b.dataset.filt; plan.more = false; savePlan(); renderPlan(); });
  view().querySelectorAll("[data-stay]").forEach(b => b.onclick = () => { const k = b.dataset.stay; const base = plan.stay[k] != null ? plan.stay[k] : visitOf(k); plan.stay[k] = Math.max(10, base + Number(b.dataset.d)); savePlan(); renderPlan(); });
  view().querySelectorAll("[data-del]").forEach(b => b.onclick = () => { plan.chain = plan.chain.filter(k => k !== b.dataset.del); savePlan(); renderPlan(); });
  $("p-share")?.addEventListener("click", () => shareLink("p", {d: plan.date, t: plan.t, s: plan.start === "me" ? "home" : plan.start, r: plan.ret, m: plan.mode, c: plan.chain, st: plan.stay}, "План на " + humanDate(plan.date)));
  $("p-clear")?.addEventListener("click", () => { plan.chain = []; plan.stay = {}; savePlan(); renderPlan(); });
  $("p-more")?.addEventListener("click", () => { plan.more = true; renderPlan(); });
  bindCommon();
  const stops = (plan.start === "home" || plan.start === "me" ? [plan.start] : []).concat(rows.map(r => r.k));
  const allWalk = rows.every(r => !r.tr || r.tr.mode === "walk");
  if (stops.length > 1) drawStops(stops, {foot: allWalk, offset: plan.start === "home" || plan.start === "me" ? 0 : 1});
  else drawStops([...stops, ...shown.slice(0, 6).map(c => c.k)], {line: false, offset: 0, noNumbers: true});
  drawEvents(S.events.filter(e => eventOn(e, plan.date)));
}
function planGmaps(rows){
  const pts = rows.map(r => P[r.k].ll.join(","));
  const allWalk = rows.every(r => !r.tr || r.tr.mode === "walk");
  const fromAnchor = plan.start === "home" || plan.start === "me";
  const origin = plan.start === "me" ? "" : plan.start === "home" ? P.home.ll.join(",") : pts[0];
  const rest = fromAnchor ? pts : pts.slice(1);
  if (!rest.length) return gplace(P[rows[0].k]);
  const dest = rest[rest.length - 1], w = rest.slice(0, -1).slice(0, 9).join("|");
  return `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${enc(origin)}` : ""}&destination=${enc(dest)}${w ? `&waypoints=${enc(w)}` : ""}&travelmode=${allWalk ? "walking" : "driving"}`;
}

// ---------- "Маршруты" ----------
const KLABEL = {ev: "вечер", day: "целый день", ovn: "с ночёвкой"};
function renderRoutes(){
  if (S.routeKind === "day") S.routeKind = "ev";
  const list = R.filter(r => r.kind === S.routeKind);
  if (!list.find(r => r.id === S.route)) S.route = list[0] && list[0].id;
  const r = R.find(x => x.id === S.route);
  view().innerHTML = `
    <div class="filt">${[["ev","Вечер после 17:00"],["ovn","С ночёвкой"]].map(([k, l]) => `<button data-kind="${k}" aria-pressed="${S.routeKind === k}">${l} <span class="muted">${R.filter(x => x.kind === k).length}</span></button>`).join("")}<button data-goto="trips" class="muted" style="border-style:dashed">Поездки на день → «Выходной»</button></div>
    <div class="rgrid">${list.map(x => {
      const n = x.stops.filter(s => s.p).length;
      const cover = routeCover(x);
      return `<button class="rcard2" data-route="${x.id}" aria-pressed="${x.id === S.route}">
        <span class="rcov" ${cover ? `style="background-image:url('${cover}')"` : ""}><span class="rchips">${x.friends ? '<span class="chip you">для гостей</span>' : ""}<span class="chip ${x.kind}">${KLABEL[x.kind]}</span></span></span>
        <span class="rbody"><b>${esc(x.title)}</b><span class="meta"><span>${x.time}</span><span>${x.km}</span><span>${n} точ${n === 1 ? "ка" : n < 5 ? "ки" : "ек"}</span></span></span></button>`; }).join("")}</div>
    ${r ? routeDetail(r) : ""}`;
  view().querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { S.routeKind = b.dataset.kind; store.set("y.rkind", S.routeKind); S.route = null; renderRoutes(); });
  view().querySelectorAll("[data-route]").forEach(b => b.onclick = () => { S.route = b.dataset.route; store.set("y.route", S.route); renderRoutes(); $("rdetail")?.scrollIntoView({behavior: "smooth", block: "start"}); });
  $("r-toplan")?.addEventListener("click", () => openRouteInPlan(r, todayStr()));
  bindCommon();
  if (r){ const keys = r.stops.filter(s => s.p && P[s.p]).map(s => s.p); drawStops(keys, {foot: keys.every(k => inCity(k))}); }
}
function routeCover(r){
  const ks = r.stops.filter(s => s.p).map(s => s.p);
  const pick = ks.find(k => (PHOTOS[k] || []).length && !["rep","north","home"].includes(k)) || ks.find(k => (PHOTOS[k] || []).length);
  return pick ? PHOTOS[pick][0].src : null;
}
function todayChip(k){
  if (!P[k]) return "";
  const ds = todayStr(), ctx = mkCtx(ds, 12*60, "23:59", "auto", {}), h = hoursFor(k, ctx.dow, ds), dn = dayNote(k, ctx);
  const out = [];
  if (h.closed) out.push(["bad", "сегодня закрыто"]);
  if (dn) out.push(dn.note);
  return out.length ? " " + chipsHtml(out) : "";
}
function routeItems(r, opts = {}){
  let i = 0;
  return r.stops.map(s => {
    if (s.drive) return `<li class="drive"><span class="t">${s.t}</span><span class="n">→</span><div><h4>${s.drive}</h4></div></li>`;
    i++; const p = P[s.p] || {n: "…"}; const pr = opts.prices ? (s.price || (INFO[s.p] || {}).price) : null;
    const pv = pr ? priceNum(pr) : null;
    const price = pr && pv !== 0 ? `<span class="price" title="${esc(pr)}">${pv ? `≈ ${amd(pv)}` : esc(pr.length > 28 ? pr.slice(0, 26).trim() + "…" : pr)}</span>` : "";
    return `<li><span class="t">${s.t}</span><span class="n">${i}</span><div><h4><button class="plink" data-open="${s.p}">${esc(p.n)}</button>${s.stay ? `<span class="stay">${s.stay}</span>` : ""}${price}${todayChip(s.p)}</h4>${s.fact ? `<p class="fact">${s.fact}</p>` : ""}${s.tip ? `<p class="tip">${s.tip}</p>` : ""}${s.acc ? `<p class="acc"><b>Александру:</b> ${s.acc}</p>` : ""}</div></li>`;
  }).join("");
}
function routeDetail(r){
  const items = routeItems(r);
  return `<div class="detail" id="rdetail"><h2>${esc(r.title)}</h2><p class="why">${r.why}</p>
    <div class="actions"><button class="btn primary" id="r-toplan">Открыть в «Плане» на сегодня</button><a class="btn" href="${routeGmaps(r)}" target="_blank" rel="noopener">Google Maps</a></div>
    <ol class="tl">${items}</ol>${(r.notes || []).map(n => `<div class="note ${n.warn ? "warn" : ""}"><b>${n.h}.</b> ${n.t}</div>`).join("")}</div>`;
}
function routeGmaps(r){
  const pts = r.stops.filter(s => s.p && P[s.p]).map(s => P[s.p].ll.join(",")).filter((p, i, a) => p !== a[i-1]);
  const walk = r.kind === "ev" && !r.stops.some(s => s.drive);
  if (walk) return `https://www.google.com/maps/dir/?api=1&origin=${pts[0]}&destination=${pts[pts.length-1]}${pts.length > 2 ? `&waypoints=${enc(pts.slice(1,-1).join("|"))}` : ""}&travelmode=walking`;
  const home = (r.start && P[r.start] ? P[r.start] : P.home).ll.join(",");
  const dest = r.kind === "ovn" ? pts[pts.length-1] : home;
  const wps = (r.kind === "ovn" ? pts.slice(0,-1) : pts).slice(0, 9).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${home}&destination=${dest}&waypoints=${enc(wps)}&travelmode=driving`;
}

// ---------- "Выходной": поездки на день на своей машине ----------
let TRIPS_META = {routes: {}, fuel: {consumption: 8, price: 560, people: 2}};
const TRIP_DIRS = [["all","Все направления"],["south","Юг"],["north","Север"],["east","Восток"],["west","Запад"]];
const TRIP_LENS = [["all","Любая длина"],["short","до 8 ч"],["mid","8–11 ч"],["long","11 ч и больше"]];
const TRIP_SORTS = [["home","домой пораньше"],["km","по километрам"],["start","по времени выезда"]];
const tripMeta = r => TRIPS_META.routes[r.id] || {};
const tripList = () => R.filter(r => r.kind === "day" && !tripMeta(r).hide && !tripMeta(r).wk && (tripMeta(r).dir || !tripStops(r).every(k => inCity(k))));
const tripKm = r => { const m = String(r.km).replace(/\s/g, "").match(/(\d+)/); return m ? +m[1] : 0; };
const tripSpan = r => { const m = String(r.time).match(/(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/); return m ? {start: m[1], end: m[2], min: toMin(m[2]) - toMin(m[1])} : {start: "", end: "", min: 0}; };
const tripStops = r => r.stops.filter(s => s.p && P[s.p]).map(s => s.p).filter((p, i, a) => a.indexOf(p) === i);
const fuelCfg = () => ({cons: +store.get("y.tcons", TRIPS_META.fuel.consumption) || 8, price: +store.get("y.tfuel", TRIPS_META.fuel.price) || 560, people: Math.max(1, +store.get("y.tppl", TRIPS_META.fuel.people) || 2), cars: Math.max(1, +store.get("y.tcars", 1) || 1)});
const amd = n => n == null ? "—" : `${Math.round(n).toLocaleString("ru-RU")} ֏`;
// "1500 драм (иностранцы)…" -> 1500; "бесплатно" -> 0; непонятно -> null
function priceNum(s){
  if (!s) return null; const t = String(s).toLowerCase();
  if (/^бесплатно/.test(t)) return 0;
  if (/[€$]|eur|usd/.test(t)) return null;
  const c = t.replace(/\s(?=\d{3}\b)/g, "");
  const rt = c.match(/(\d+)\s*(?:amd|драм|֏)?[^;.,]{0,20}туда[\s-]*(?:и\s*)?обратно/); // «9000 AMD туда-обратно» важнее цены в одну сторону
  const m = rt || c.match(/(\d[\d]*)/); if (!m) return null;
  const n = +m[1]; return n >= 100 ? n : null;
}
function tripBudget(r){
  const km = tripKm(r), f = fuelCfg(), meta = tripMeta(r);
  const fuel = meta.taxi != null ? meta.taxi : Math.round(km / 100 * f.cons * f.price * f.cars / 100) * 100;
  // цена из шага маршрута важнее цены из карточки места (например, канатка в одну сторону)
  const seen = new Set();
  const tickets = r.stops.filter(s => s.p && P[s.p] && !seen.has(s.p) && seen.add(s.p)).map(s => { const pr = s.price || (INFO[s.p] || {}).price; return {k: s.p, n: P[s.p].n, s: pr, v: priceNum(pr)}; }).filter(t => t.s && t.v !== 0);
  const unknown = tickets.some(t => t.v == null);
  const perTickets = tickets.reduce((a, t) => a + (t.v || 0), 0);
  const food = meta.food ?? 5000;
  const total = fuel + f.people * (perTickets + food);
  return {km, fuel, tickets, unknown, perTickets, food, total, people: f.people, cfg: f, taxi: meta.taxi != null, taxiNote: meta.taxi_note};
}
function tripCard(r){
  const sp = tripSpan(r), meta = tripMeta(r), cover = routeCover(r), n = tripStops(r).length;
  const dir = TRIP_DIRS.find(d => d[0] === meta.dir);
  return `<button class="rcard2 trip" data-trip="${r.id}" aria-pressed="${r.id === S.tripShown}">
    <span class="rcov" ${cover ? `style="background-image:url('${cover}')"` : ""}><span class="rchips">${dir ? `<span class="chip dir">${dir[1]}</span>` : ""}${r.friends ? '<span class="chip you">для гостей</span>' : ""}${(meta.tags || []).slice(0, 2).map(t => `<span class="chip day">${esc(t)}</span>`).join("")}</span></span>
    <span class="rbody"><b>${esc(r.title)}</b>
      <span class="meta"><span>выезд ${sp.start}</span><span class="home">дома ${sp.end}</span><span>${esc(r.km)}</span>${meta.drive_min ? `<span>за рулём ${durTxt(meta.drive_min)}</span>` : ""}<span>${n} точ${n === 1 ? "ка" : n < 5 ? "ки" : "ек"}</span></span>
      <span class="why muted" style="font-size:13px">${esc(firstSentence(r.why))}</span></span></button>`;
}
function renderTrips(){
  let list = tripList();
  const counts = k => tripList().filter(r => tripMeta(r).dir === k).length;
  if (S.tripDir !== "all") list = list.filter(r => tripMeta(r).dir === S.tripDir);
  if (S.tripLen !== "all") list = list.filter(r => { const m = tripSpan(r).min; return S.tripLen === "short" ? m <= 8*60 : S.tripLen === "mid" ? m > 8*60 && m < 11*60 : m >= 11*60; });
  if (S.tripTag !== "all") list = list.filter(r => (tripMeta(r).tags || []).includes(S.tripTag));
  const key = {home: r => toMin(tripSpan(r).end), km: tripKm, start: r => toMin(tripSpan(r).start)}[S.tripSort] || (r => 0);
  list = list.slice().sort((a, b) => key(a) - key(b));
  // не затираем выбор из ссылки, пока маршруты из JSON ещё грузятся
  const r = list.find(x => x.id === S.trip) || list[0];
  S.tripShown = r && r.id;
  const tags = [...new Set(tripList().flatMap(x => tripMeta(x).tags || []))].sort((a, b) => a.localeCompare(b, "ru"));
  view().innerHTML = `
    ${tripFeatured()}
    <p class="tintro">Поездки на своей машине на один день: выезд утром, вечером дома, без ночёвки. Время у точек примерное, цены и советы по билетам в карточке маршрута.</p>
    <div class="filt">${TRIP_DIRS.map(([k, l]) => `<button data-tdir="${k}" aria-pressed="${S.tripDir === k}">${l} <span class="muted">${k === "all" ? tripList().length : counts(k)}</span></button>`).join("")}</div>
    <div class="tfilt">
      <div class="filt">${TRIP_LENS.map(([k, l]) => `<button data-tlen="${k}" aria-pressed="${S.tripLen === k}">${l}</button>`).join("")}</div>
      <label>тема <select id="ttag"><option value="all">любая</option>${tags.map(t => `<option value="${esc(t)}" ${S.tripTag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <label>сначала <select id="tsort">${TRIP_SORTS.map(([k, l]) => `<option value="${k}" ${S.tripSort === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    ${list.length ? `<div class="rgrid">${list.map(tripCard).join("")}</div>` : `<p class="muted">Под такие условия маршрутов нет, снимите часть фильтров.</p>`}
    ${r ? tripDetail(r) : ""}`;
  view().querySelectorAll("[data-tdir]").forEach(b => b.onclick = () => { S.tripDir = b.dataset.tdir; renderTrips(); });
  view().querySelectorAll("[data-tlen]").forEach(b => b.onclick = () => { S.tripLen = b.dataset.tlen; renderTrips(); });
  $("ttag").onchange = e => { S.tripTag = e.target.value; renderTrips(); };
  $("tsort").onchange = e => { S.tripSort = e.target.value; store.set("y.tsort", S.tripSort); renderTrips(); };
  view().querySelectorAll("[data-trip]").forEach(b => b.onclick = () => { S.trip = b.dataset.trip; store.set("y.trip", S.trip); renderTrips(); $("rdetail")?.scrollIntoView({behavior: "smooth", block: "start"}); });
  if (r) bindTripDetail(r, renderTrips);
  bindCommon();
}
function bindTripDetail(r, rerender, hash){
  $("t-toplan")?.addEventListener("click", () => openRouteInPlan(r, todayStr()));
  $("t-share")?.addEventListener("click", async () => { const u = `${location.origin}${location.pathname}#${hash || "trip=" + r.id}`; try { await navigator.clipboard.writeText(u); toast("Ссылка скопирована"); } catch(e){ prompt("Ссылка", u); } });
  const keys = tripStops(r).filter(k => k !== r.start); const st = r.start && P[r.start] ? r.start : "home"; drawStops(r.walk ? keys : [st, ...keys, st], {offset: r.walk ? 1 : 0, start: st}); drawTripPois(r);
}
// ---------- отдельная вкладка под конкретные выходные ----------
const wkActive = () => { const f = TRIPS_META.featured; return !!(f && f.ids && (!f.until || f.until >= todayStr())); };
function renderWeekend(){
  const f = TRIPS_META.featured || {};
  const rs = (f.ids || []).map(id => R.find(x => x.id === id)).filter(Boolean);
  if (!rs.length){ view().innerHTML = `<p class="muted">Загружаю маршруты…</p>`; return; }
  const r = rs.find(x => x.id === S.wk) || rs[0]; S.wk = r.id;
  const lbl = (f.labels || {})[r.id];
  view().innerHTML = `<div class="wkhead"><h2>${esc(f.title)}</h2>${f.lead ? `<p>${esc(f.lead)}</p>` : ""}</div>
    <div class="wkdays" role="tablist">${rs.map(x => { const l = (f.labels || {})[x.id] || {}; return `<button role="tab" data-wk="${x.id}" aria-selected="${x.id === r.id}"><b>${esc(l.day || x.title)}</b><small>${esc(l.sub || x.time)}</small></button>`; }).join("")}</div>
    ${(f.todo || []).length ? `<details class="wktodo"><summary>Что сделать до выезда</summary><ul>${f.todo.map(t => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}
    ${tripDetail(r).replace('class="detail"', 'class="detail wkd"')}`;
  view().querySelectorAll("[data-wk]").forEach(b => b.onclick = () => { S.wk = b.dataset.wk; store.set("y.wk", S.wk); renderWeekend(); window.scrollTo({top: Math.max(0, $("tabs").offsetTop - 4), behavior: "smooth"}); });
  view().querySelectorAll(".series [data-trip]").forEach(b => b.onclick = () => { S.trip = b.dataset.trip; goTab("trips"); });
  bindTripDetail(r, renderWeekend, "wk=" + r.id);
  bindCommon();
}
function tripFeatured(){
  const f = TRIPS_META.featured; if (!wkActive()) return "";
  return `<button class="feat featlink" data-goto="wk"><b>${esc(f.title)}</b><span>Наш план на эти дни вынесен в отдельную вкладку «${esc(f.tab || "Выходные")}» →</span></button>`;
  const rs = (f.ids || []).map(id => R.find(x => x.id === id)).filter(Boolean); if (!rs.length) return "";
  return `<div class="feat"><h3>${esc(f.title)}</h3>${f.lead ? `<p>${esc(f.lead)}</p>` : ""}
    <div class="rgrid">${rs.map(tripCard).join("")}</div>
    ${(f.todo || []).length ? `<details><summary>Что сделать до выезда</summary><ul>${f.todo.map(t => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}
    ${f.backup ? `<p class="muted" style="font-size:13px">${esc(f.backup)}</p>` : ""}</div>`;
}
function tripDetail(r){
  const sp = tripSpan(r), meta = tripMeta(r), n = tripStops(r).length;
  const dir = TRIP_DIRS.find(d => d[0] === meta.dir);
  const kf = [["Выезд", sp.start], ["Дома", sp.end], ["В дороге всего", durTxt(sp.min)], ["За рулём", meta.drive_min ? durTxt(meta.drive_min) : "—"], ["Расстояние", r.km], ["Точек", n], ["Сложность", meta.diff || "—"], ["Машина", meta.car || "любая"], ["Сезон", meta.season || "—"], ["Направление", dir ? dir[1] : "—"]];
  const tour = meta.tour;
  return `<div class="detail" id="rdetail"><h2>${esc(r.title)}</h2><p class="why">${r.why}</p>
    <div class="kf">${kf.map(([h, v]) => `<div><small>${h}</small><b>${esc(v)}</b></div>`).join("")}</div>
    <div class="actions"><button class="btn primary" id="t-toplan">Открыть в «Плане» на сегодня</button><a class="btn" href="${routeGmaps(r)}" target="_blank" rel="noopener">Google Maps</a><a class="btn" href="${routeYmaps(r)}" target="_blank" rel="noopener">Яндекс Карты</a><button class="btn" id="t-share">Скопировать ссылку</button></div>
    ${tripPrices(r)}
    <ol class="tl">${routeItems(r, {prices: true})}</ol>${(r.notes || []).map(n => `<div class="note ${n.warn ? "warn" : ""}"><b>${n.h}.</b> ${n.t}</div>`).join("")}
    ${tripEat(r)}${tripFuel(r)}${tripExtras(r)}
    ${tripSeries(r)}</div>`;
}
// цены: что платно на точках + важные советы по билетам, без итоговых сумм
function tripPrices(r){
  const meta = tripMeta(r), seen = new Set();
  const rows = r.stops.filter(x => x.p && P[x.p] && !seen.has(x.p) && seen.add(x.p)).map(x => ({n: P[x.p].n, s: x.price || (INFO[x.p] || {}).price})).filter(x => x.s && priceNum(x.s) !== 0);
  const tips = r.cost_tips || [];
  const tour = meta.tour;
  if (!rows.length && !tips.length && !tour) return "";
  return `<div class="prices"><h3>Цены и билеты</h3>
    ${rows.length ? `<ul class="plist">${rows.map(x => `<li><b>${esc(x.n)}</b><span>${esc(x.s)}</span></li>`).join("")}</ul>` : `<p class="muted">Все точки бесплатные.</p>`}
    ${tips.length ? `<ul class="ptips">${tips.map(t => `<li>${t}</li>`).join("")}</ul>` : ""}
    ${tour ? `<p class="ptour">Для сравнения: <a href="${esc(tour.url)}" target="_blank" rel="noopener">${esc(tour.name)}</a> стоит ${esc(tour.price)}${tour.extra ? `, ${esc(tour.extra)}` : ""}.${tour.note ? " " + esc(tour.note) : ""}</p>` : ""}</div>`;
}
const gmapsLL = ll => `https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}`;
function tripEat(r){
  if (!(r.eat || []).length) return "";
  return `<div class="pois"><h3>Где поесть по пути</h3><ul>${r.eat.map(e => `<li><span class="pi eat">🍴</span><div><b>${e.ll ? `<a href="${gmapsLL(e.ll)}" target="_blank" rel="noopener">${esc(e.n)}</a>` : esc(e.n)}</b> <span class="muted">${esc(e.where || "")}</span><p>${esc(e.what || "")}</p></div></li>`).join("")}</ul>${r.eat_note ? `<p class="hint">${esc(r.eat_note)}</p>` : ""}</div>`;
}
function tripFuel(r){
  if (!(r.fuel || []).length) return "";
  return `<div class="pois"><h3>Заправки</h3><ul>${r.fuel.map(f => `<li><span class="pi fuel">⛽</span><div><b><a href="${gmapsLL(f.ll)}" target="_blank" rel="noopener">${esc(f.n)}</a></b> <span class="muted">${esc(f.where || "")}</span>${f.note ? `<p>${esc(f.note)}</p>` : ""}</div></li>`).join("")}</ul></div>`;
}
function tripExtras(r){
  if (!(r.extras || []).length) return "";
  return `<div class="pois extras"><h3>Если захочется ещё</h3><ul>${r.extras.map(x => `<li><span class="pi">＋</span><div><b>${x.p && P[x.p] ? `<button class="plink" data-open="${x.p}">${esc(x.h)}</button>` : esc(x.h)}</b> <span class="muted">${esc(x.cost || "")}</span><p>${x.t}</p></div></li>`).join("")}</ul></div>`;
}
const poiIcon = (txt, cls) => L.divIcon({className: "", html: `<div class="poi ${cls}">${txt}</div>`, iconSize: [22,22], iconAnchor: [11,11]});
function drawTripPois(r){
  (r.eat || []).filter(e => e.ll).forEach(e => routeLayer.addLayer(L.marker(e.ll, {icon: poiIcon("🍴", "eat"), title: e.n}).bindTooltip(`${e.n}${e.where ? ", " + e.where : ""}`, {direction: "top", offset: [0,-10]})));
  (r.fuel || []).forEach(f => routeLayer.addLayer(L.marker(f.ll, {icon: poiIcon("⛽", "fuel"), title: f.n}).bindTooltip(`${f.n}${f.where ? ", " + f.where : ""}`, {direction: "top", offset: [0,-10]})));
}
function tripSeries(r){
  const ser = (TRIPS_META.series || []).find(x => (x.ids || []).includes(r.id)); if (!ser) return "";
  const items = ser.ids.map(id => R.find(x => x.id === id)).filter(Boolean).map(x => `<li class="${x.id === r.id ? "cur" : ""}"><button class="plink" data-trip="${x.id}">${esc(x.title)}</button><span class="muted">${tripSpan(x).start}–${tripSpan(x).end}, ${esc(x.km)}</span></li>`).join("");
  return `<div class="series"><h3>${esc(ser.title)}</h3>${ser.note ? `<p class="muted">${esc(ser.note)}</p>` : ""}<ol>${items}</ol></div>`;
}
function routeYmaps(r){
  const home = (r.start && P[r.start] ? P[r.start] : P.home).ll.join(","); const pts = tripStops(r).filter(k => k !== r.start).map(k => P[k].ll.join(","));
  return `https://yandex.ru/maps/?rtext=${[home, ...pts, home].join("~")}&rtt=auto`;
}

// ---------- "Афиша" ----------
function renderAfisha(){
  const ds = todayStr(); const origin = originKey(); const t = Math.max(nowMin(), 17*60);
  const ctx = mkCtx(ds, t, plan.ret, plan.mode, {});
  const f = S.afishaFilter;
  let occ = [];
  S.events.forEach(e => eventDates(e, ds, 35).forEach(d => occ.push({e, d})));
  const dow = dowOf(ds);
  const wkStart = ymd(new Date(parseYmd(ds).getTime() + ((5 - dow + 7) % 7) * 864e5)), wkEnd = ymd(new Date(parseYmd(wkStart).getTime() + 864e5));
  if (f === "today") occ = occ.filter(x => x.d === ds);
  if (f === "weekend") occ = occ.filter(x => x.d === wkStart || x.d === wkEnd || (dow >= 5 && x.d === ds));
  if (f === "free") occ = occ.filter(x => isFree(x.e));
  if (f === "outdoor") occ = occ.filter(x => (x.e.tags || []).includes("на улице"));
  if (f === "near") occ = occ.filter(x => x.e.ll && hav(P[origin].ll, x.e.ll) < 2.5);
  occ.sort((a, b) => a.d.localeCompare(b.d) || (a.e.time || "99").localeCompare(b.e.time || "99"));
  const byDay = {}; occ.forEach(x => (byDay[x.d] = byDay[x.d] || []).push(x));
  view().innerHTML = `
    <div class="filt">${[["all","Все"],["today","Сегодня"],["weekend","Выходные"],["near","Рядом"],["free","Бесплатно"],["outdoor","На улице"]].map(([k, l]) => `<button data-af="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    <p class="small muted">${S.eventsUpdated ? `Афиша собрана из Telegram-каналов и сайтов ${humanDate(S.eventsUpdated)}.` : "Афиша загружается."} Время и цены сверяйте по ссылке на пост.</p>
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, xs]) => `<div class="evday">${d === ds ? "Сегодня" : humanDate(d)}</div><div class="evgrid">${xs.map(x => {
      const k = "ev_" + x.e.id; const tr = P[k] ? travel(origin, k, t, ctx.mode) : null; return eventItem(x.e, tr, null, d === ds ? null : d); }).join("")}</div>`).join("")
      : `<p class="muted">По этому фильтру событий нет.</p>`}`;
  view().querySelectorAll("[data-af]").forEach(b => b.onclick = () => { S.afishaFilter = b.dataset.af; renderAfisha(); });
  bindCommon();
  const evs = [...new Set(occ.map(x => x.e))];
  routeLayer.clearLayers(); drawEvents(evs);
  const pts = evs.filter(e => e.ll).map(e => e.ll).concat(S.me ? [S.me] : []);
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), {padding: [30,30], maxZoom: 15}); else if (pts.length) map.setView(pts[0], 14);
}

// ---------- "Места" ----------
function renderPlaces(){
  const origin = originKey(); const t = Math.max(nowMin(), 17*60);
  const f = S.placesFilter, q = S.placesQuery.trim().toLowerCase();
  let keys = Object.keys(P).filter(k => !["home","me"].includes(k) && !k.startsWith("ev_") && (f === "want" || f === "been" || !k.startsWith("f_")));
  if (f === "want") keys = keys.filter(k => S.favs[k] === "want");
  if (f === "been") keys = keys.filter(k => S.favs[k] === "been");
  if (f === "food") keys = keys.filter(k => CAT.food.includes(k) || FOOD[k]);
  if (f === "food" && S.dish) keys = keys.filter(k => (FOOD[k] && (FOOD[k].dishes || []).includes(S.dish)));
  if (f === "view") keys = keys.filter(k => CAT.view.includes(k));
  if (f === "culture") keys = keys.filter(k => !CAT.food.includes(k) && !CAT.view.includes(k) && !FOOD[k]);
  if (q) keys = keys.filter(k => (P[k].n + " " + (P[k].g || "")).toLowerCase().includes(q));
  keys.sort((a, b) => {
    if (S.dish){ const ta = (FOOD[a] && (FOOD[a].top_for || []).includes(S.dish)) ? 0 : 1, tb = (FOOD[b] && (FOOD[b].top_for || []).includes(S.dish)) ? 0 : 1; if (ta !== tb) return ta - tb; }
    return hav(P[origin].ll, P[a].ll) - hav(P[origin].ll, P[b].ll); });
  const extra = f === "food" || f === "all" ? CAFES.flatMap(s => s.items).filter(c => !c.p && c.q && (!q || c.n.toLowerCase().includes(q))) : [];
  view().innerHTML = `
    <input class="search" id="pq" type="search" placeholder="Найти место" value="${esc(S.placesQuery)}" aria-label="Поиск места">
    <div class="filt">${[["all","Все"],["want","Хочу"],["been","Были"],["view","Виды и природа"],["culture","Музеи и прогулки"],["food","Бары и вино"]].map(([k, l]) => `<button data-pf="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    <p class="small muted">Отсортировано по расстоянию ${originName()}. ★ куда хотите, ✓ где уже были. Еда во вкладке <button class="plink" data-goto="food">«Еда»</button>.</p>
    <div class="pgrid">${keys.map(k => { const tr = travel(origin, k, t, "auto"); const fv = S.favs[k]; const ph = (PHOTOS[k] || [])[0]; const I = INFO[k] || {};
      return `<div class="pcard">
        <button class="pimg" data-open="${k}" aria-label="${esc(P[k].n)}" ${ph ? `style="background-image:url('${ph.src}')"` : ""}><span class="pdist">${modeTxt(tr)}</span></button>
        <div class="pbody"><button class="plink nm" data-open="${k}">${esc(P[k].n)}</button>
          ${FOOD[k] && (FOOD[k].R || FOOD[k].rating) ? `<div class="rts">${ratingBadges(k)}</div>` : ""}
          <div class="why muted">${esc(firstSentence(I.fact || I.best || ""))}</div>
          <div class="pacts"><button class="btn sm toggle" data-fav="${k}" data-v="want" aria-pressed="${fv === "want"}" aria-label="Хочу">★ Хочу</button><button class="btn sm toggle" data-fav="${k}" data-v="been" aria-pressed="${fv === "been"}" aria-label="Были">✓ Были</button></div>
        </div></div>`; }).join("")}</div>
    ${extra.length ? `<div class="sect">Ещё заведения</div><div class="list">${extra.map(c => `<div class="item"><span class="thumb"></span><div style="min-width:0"><div class="nm">${esc(c.n)}</div><div class="mt"><span>${esc(c.w)}</span></div><div class="why">${esc(c.d)}</div></div><div class="acts"><a class="btn sm" href="${c.u || `https://www.google.com/maps/search/?api=1&query=${enc(c.q)}`}" target="_blank" rel="noopener">${c.u ? "Пост" : "Карта"}</a></div></div>`).join("")}</div>` : ""}`;
  const pq = $("pq"); pq.addEventListener("input", () => { S.placesQuery = pq.value; const pos = pq.selectionStart; renderPlaces(); const n = $("pq"); n.focus(); n.setSelectionRange(pos, pos); });
  view().querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { S.placesFilter = b.dataset.pf; S.dish = null; renderPlaces(); });
  view().querySelectorAll("[data-dish]").forEach(b => b.onclick = () => { S.dish = b.dataset.dish || null; renderPlaces(); });
  bindCommon();
  drawStops(keys.slice(0, 25), {line: false, noNumbers: true, withMe: true, fit: keys.length < 60});
}

// ---------- "Полезно" ----------
function renderInfo(){
  view().innerHTML = `<div class="info">
   <section><h3>Дом</h3><p>${homeSaved ? `Дом сохранён: ${homeSaved.map(x => x.toFixed(4)).join(", ")}.` : "Сейчас за дом считается площадь Республики."} От дома считается время возвращения.</p>
    <div class="actions"><button class="btn sm ghost" id="setHome">Сделать домом место, где я сейчас</button>${homeSaved ? `<button class="btn sm" id="resetHome">Сбросить</button>` : ""}</div></section>
   <section><h3>Мои отметки</h3><p>«Хочу», «были», план и дом хранятся только на этом телефоне, у каждого свои. Чтобы перенести отметки на другой телефон, отправьте себе ссылку.</p>
    <div class="actions"><button class="btn sm ghost" id="shareFavs">Перенести отметки (${Object.keys(S.favs).length})</button></div></section>
   <section><h3>Как пользоваться</h3><ul>
    <li>«Сейчас» подскажет, что успеваете прямо сейчас или после 17:00, с учётом часов работы, заката, погоды и пути домой.</li>
    <li>«План» собирает вечер или день по шагам: каждая следующая точка считается от предыдущей.</li>
    <li>В карточке места есть фото, когда лучше приходить, за что хвалят, часы по дням, такси и маршрут.</li>
    <li>Время в пути примерное: пробки и перекрытия не учитываются.</li></ul></section>
   <section><h3>Установить на телефон</h3><p>Android и Chrome: кнопка «Установить» вверху или меню браузера → «Установить приложение». iPhone: Safari → «Поделиться» → «На экран Домой». После установки работает и без интернета, кроме карты новых мест и погоды.</p></section>
   <section><h3>Дрон</h3><ul>
    <li>Общей регистрации для туристов пока нет, правила пишутся. Дроны легче 250 г, скорее всего, будут освобождены.</li>
    <li>Временные рекомендации: не выше 50 м без разрешения, не над толпой, не в темноте.</li>
    <li>Нельзя снимать границу и пограничные объекты: у Хор Вирапа, в Тавуше и у Капутана не летать. Рядом с военными частями тоже.</li>
    <li>Хорошие места: Татев с канаткой, Нораванк, Азат, Севан, Гутанасар.</li></ul></section>
   <section><h3>Транспорт и деньги</h3><ul>
    <li>Такси: Yandex Go или GG, по городу 800–1000 драм. В Яндексе есть тариф «Межгород».</li>
    <li>Пробки каждый день, 7 км могут занять 40 минут.</li>
    <li>Карты «Мир» почти не принимают, наличные снимают в банкоматах ВТБ Армения.</li>
    <li>Машину без заднего номера сразу увозят на штрафстоянку.</li></ul></section>
   <section><h3>Сезон</h3><ul>
    <li>На Арагаце снег выпал уже 4 октября 2026. Кари и Амберд проверяйте по погоде.</li>
    <li>Водопад Шаки до 15 ноября течёт только 11:00–17:00.</li>
    <li>«Крылья Татева» в понедельник не работают.</li></ul></section>
   <section><h3>Данные</h3><p>Места, часы и отзывы собраны 12 октября 2026 из сайтов, отзывов, YouTube и Telegram. Афишу Claude обновляет по просьбе.</p>
    <div class="actions"><button class="btn sm" id="refreshWx">Обновить погоду</button></div></section>
  </div>`;
  $("setHome").onclick = () => { if (!S.me){ startGeo(true); toast("Включаю геопозицию, нажмите ещё раз через пару секунд"); return; } store.set("y.home", S.me); location.reload(); };
  $("resetHome")?.addEventListener("click", () => { store.set("y.home", null); location.reload(); });
  $("shareFavs").onclick = () => shareLink("f", S.favs, "Мои отметки в «Ереван: куда сегодня»");
  $("refreshWx").onclick = async () => { store.set("y.wx", null); await loadWeather(); render(); toast("Погода обновлена"); };
  routeLayer.clearLayers();
}

// ---------- place panel ----------
const panel = $("panel"), scrim = $("scrim"); let lastFocus = null;
function openPlace(k){
  const p = P[k]; if (!p || k === "home" || k === "me") return;
  const isEv = k.startsWith("ev_"); const e = isEv ? p.ev : null;
  const I = INFO[k] || {}, ph = PHOTOS[k] || [];
  const ds = plan.date, dow = dowOf(ds); const h = hoursFor(k, dow, ds);
  const origin = originKey(); const tr = travel(origin, k, nowMin(), "auto");
  const fv = S.favs[k];
  const wk = isEv ? "" : DOW.map((d, i) => { const hh = hoursFor(k, i, ds); return `<div class="${i === dow ? "today" : ""}"><b>${d}</b>${hh.always ? "всегда" : hh.unknown ? "?" : hh.closed ? "вых." : `${fmt(hh.f)}<br>${fmt(hh.t)}`}</div>`; }).join("");
  const ops = (I.operators || []).map(o => `<li><b>${esc(o.name)}</b>${o.price ? `: ${esc(o.price)}` : ""}${o.duration ? `, ${esc(o.duration)}` : ""}</li>`).join("");
  const srcs = (I.sources || []).map(u => { let host = u; try { host = new URL(u).hostname.replace("www.", ""); } catch(err){} return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host)}</a>`; }).join(" · ");
  const evDates = isEv ? eventDates(e, todayStr(), 35).slice(0, 6).map(humanDate).join(", ") : "";
  panel.innerHTML = `<button class="close" id="pclose" aria-label="Закрыть">×</button>
   ${ph.length ? `<div class="gal">${ph.map(x => `<figure><img src="${x.src}" alt="${esc(p.n)}" loading="lazy"><figcaption>Фото: <a href="${x.page}" target="_blank" rel="noopener">${esc(x.author)}</a>, ${esc(x.license)}</figcaption></figure>`).join("")}</div>`
     : `<div class="nophoto">${isEv ? "Событие из афиши." : "Свободных фото нет."} <a href="https://www.google.com/search?tbm=isch&q=${enc(p.g || p.n)}" target="_blank" rel="noopener">Фото в Google</a></div>`}
   <div class="pb">
     <h2>${esc(p.n)}</h2>
     <div class="chips">
       ${isEv ? `<span class="st info">${e.time || "весь день"}</span><span class="st info">${esc(e.venue || "")}</span>${e.price ? `<span class="st info">${esc(e.price)}</span>` : ""}`
              : `<span class="st ${h.closed ? "bad" : h.unknown ? "info" : "ok"}">${DOW[dow]}: ${hoursTxt(h)}</span>${I.price ? `<span class="st info">${esc(I.price)}</span>` : ""}${I.visit ? `<span class="st info">≈${I.visit} мин на месте</span>` : ""}`}
       <span class="st info">${originName()}: ${modeTxt(tr)}</span>
     </div>
     ${isEv ? `<div><h5>Когда</h5><p>${evDates || "даты прошли"}</p></div>${e.desc ? `<div><h5>Что это</h5><p>${esc(e.desc)}</p></div>` : ""}` : ""}
     ${FOOD[k] && (FOOD[k].order || FOOD[k].rating || FOOD[k].verdict || FOOD[k].R) ? `<div><h5>Что заказать</h5><p>${esc(FOOD[k].order || "")}</p><div class="rts" style="margin-top:6px">${ratingBadges(k, true)}</div>${FOOD[k].verdict ? `<p style="margin-top:6px">${esc(FOOD[k].verdict)}</p>` : ""}${(FOOD[k].dishes || []).length ? `<div class="chips" style="margin-top:6px">${FOOD[k].dishes.map(d => `<span class="st info">${esc(d)}</span>`).join("")}</div>` : ""}</div>` : ""}
     ${I.fact ? `<div><h5>Интересно</h5><p>${esc(I.fact)}</p></div>` : ""}
     ${I.best ? `<div><h5>Когда лучше приходить</h5><p>${esc(I.best)}</p></div>` : ""}
     ${I.praise && I.praise.length ? `<div><h5>За что хвалят</h5><ul>${I.praise.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
     ${I.cons && I.cons.length ? `<div><h5>На что жалуются</h5><ul>${I.cons.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
     ${I.logistics ? `<div><h5>Как добраться</h5><p>${esc(I.logistics)}</p></div>` : ""}
     ${ops ? `<div><h5>Кто возит</h5><ul>${ops}</ul></div>` : ""}
     ${wk ? `<div><h5>Часы</h5><div class="wk">${wk}</div>${I.hours_note ? `<p class="src" style="margin-top:6px">${esc(I.hours_note)}</p>` : ""}</div>` : ""}
     <div class="actions" style="margin:0">
       <button class="btn primary" id="padd">В план</button>
       <a class="btn" href="${taxiLink(p.ll)}" target="_blank" rel="noopener">Такси сюда</a>
       <a class="btn" href="${gdir(p.ll, tr.mode === "walk")}" target="_blank" rel="noopener">Маршрут</a>
       ${isEv && e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener">Источник</a>` : ""}
     </div>
     ${!isEv ? (() => { const Lk = placeLinks(k); return `<div><h5>Отзывы и фото</h5><div class="actions" style="margin:4px 0 0"><a class="btn sm" href="${Lk.google}" target="_blank" rel="noopener">Google</a><a class="btn sm" href="${Lk.yandex}" target="_blank" rel="noopener">Яндекс</a><a class="btn sm" href="${Lk.gis}" target="_blank" rel="noopener">2ГИС</a>${Lk.site ? `<a class="btn sm" href="${esc(Lk.site)}" target="_blank" rel="noopener">Сайт</a>` : ""}</div></div>`; })() : ""}
     ${!isEv ? `<div class="actions" style="margin:0"><button class="btn toggle" id="fwant" aria-pressed="${fv === "want"}">★ Хочу</button><button class="btn toggle" id="fbeen" aria-pressed="${fv === "been"}">✓ Были</button></div>` : ""}
     ${nearbyHtml(k)}
     ${srcs ? `<p class="src">Источники: ${srcs}</p>` : ""}
   </div>`;
  lastFocus = document.activeElement; panel.hidden = false; scrim.hidden = false; panel.scrollTop = 0;
  $("pclose").focus(); $("pclose").onclick = closePlace;
  $("padd").onclick = () => { const evd = isEv ? eventDates(e, todayStr(), 35)[0] : null; addToPlan(k, {date: evd || undefined}); closePlace(); S.tab = "plan"; store.set("y.tab", "plan"); render(); };
  $("fwant")?.addEventListener("click", () => { setFav(k, "want"); openPlace(k); });
  $("fbeen")?.addEventListener("click", () => { setFav(k, "been"); openPlace(k); });
}
function nearbyHtml(k){
  const ll = P[k].ll;
  const near = Object.keys(P).filter(x => x !== k && !["home","me"].includes(x) && !x.startsWith("ev_")).map(x => ({x, d: hav(ll, P[x].ll)})).filter(o => o.d < 0.9).sort((a, b) => a.d - b.d);
  const food = near.filter(o => FOOD[o.x] && o.x.startsWith("f_")).slice(0, 4), sights = near.filter(o => !o.x.startsWith("f_")).slice(0, 4);
  const evs = S.events.filter(e => e.ll && hav(ll, e.ll) < 0.9 && eventDates(e, todayStr(), 7).length).slice(0, 3);
  if (!food.length && !sights.length && !evs.length) return "";
  const row = o => `<button class="nb" data-open="${o.x}">${thumbSm(o.x)}<span><b>${esc(P[o.x].n)}</b><small>${Math.round(o.d*1000/10)*10} м, ${Math.max(1, Math.round(o.d*1.3/4.6*60))} мин пешком</small></span></button>`;
  return `<div><h5>Рядом</h5><div class="nbl">${sights.map(row).join("")}${food.map(row).join("")}${evs.map(e => `<button class="nb" data-open="ev_${e.id}">${e.img ? `<img src="${e.img}" alt="">` : `<span class="nbph"></span>`}<span><b>${esc(e.title)}</b><small>${humanDate(eventDates(e, todayStr(), 7)[0])}${e.time ? ", " + e.time : ""}</small></span></button>`).join("")}</div></div>`;
}
const thumbSm = k => { const ph = (PHOTOS[k] || [])[0]; return ph ? `<img src="${ph.src}" alt="" loading="lazy">` : `<span class="nbph"></span>`; };
function closePlace(){ panel.hidden = true; scrim.hidden = true; if (lastFocus) try { lastFocus.focus(); } catch(e){} }
function setFav(k, v){ if (S.favs[k] === v) delete S.favs[k]; else S.favs[k] = v; store.set("y.favs", S.favs); drawPlaces(); if (S.tab === "places" || S.tab === "now") renderView(); }
scrim.addEventListener("click", closePlace);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) closePlace(); });
document.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b){ e.preventDefault(); openPlace(b.dataset.open); } });
document.addEventListener("click", e => { const g = e.target.closest("[data-goto]"); if (!g) return; e.preventDefault();
  if (g.dataset.af) S.afishaFilter = g.dataset.af; if (g.dataset.rk){ S.routeKind = g.dataset.rk; S.route = null; }
  closePlace(); goTab(g.dataset.goto); });
function bindCommon(){
  view().querySelectorAll("[data-add]").forEach(b => b.onclick = () => { addToPlan(b.dataset.add, {fromHere: true, date: b.dataset.date || undefined}); });
  view().querySelectorAll("[data-fav]").forEach(b => b.onclick = () => setFav(b.dataset.fav, b.dataset.v));
}

// ---------- loading data ----------
async function loadEvents(){
  try {
    const r = await fetch("data/events.json", {cache: "no-cache"}); if (!r.ok) return;
    const j = await r.json(); S.eventsUpdated = j.updated || null;
    S.events = (j.events || []).filter(e => e && e.id && e.title && e.date);
    S.events.forEach(e => { if (!e.ll) return; const k = "ev_" + e.id; P[k] = {n: e.title, ll: e.ll, g: e.venue, ev: e}; LIGHT[k] = (e.tags || []).includes("на улице") ? "any" : "any"; });
  } catch(err){}
}
function b64e(o){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function b64d(s){ s = s.replace(/-/g,"+").replace(/_/g,"/"); return JSON.parse(decodeURIComponent(escape(atob(s)))); }
async function shareLink(kind, obj, title){
  const url = location.origin + location.pathname + "#" + kind + "=" + b64e(obj);
  try { if (navigator.share){ await navigator.share({title, url}); return; } } catch(e){ if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast("Ссылка скопирована"); } catch(e){ prompt("Скопируйте ссылку", url); }
}
function importFromHash(){
  const w = location.hash.match(/^#wk(?:=([\w-]+))?$/);
  if (w){ S.tab = "wk"; if (w[1]){ S.wk = w[1]; store.set("y.wk", S.wk); } store.set("y.tab", "wk"); history.replaceState(null, "", location.pathname); return; }
  const t = location.hash.match(/^#trip=([\w-]+)$/);
  if (t){ S.tab = "trips"; S.trip = t[1]; store.set("y.tab", "trips"); store.set("y.trip", S.trip); history.replaceState(null, "", location.pathname); return; }
  const m = location.hash.match(/^#(p|f)=(.+)$/); if (!m) return;
  try {
    const o = b64d(m[2]);
    if (m[1] === "p"){ Object.assign(plan, {date: o.d || todayStr(), t: o.t || "17:00", start: o.s || "home", ret: o.r || "23:00", mode: o.m || "auto", chain: o.c || [], stay: o.st || {}}); savePlan(); S.tab = "plan"; store.set("y.tab", "plan"); setTimeout(() => toast("План открыт по ссылке"), 300); }
    if (m[1] === "f"){ let n = 0; for (const k in o){ if (o[k] === "want" || o[k] === "been"){ S.favs[k] = o[k]; n++; } } store.set("y.favs", S.favs); setTimeout(() => toast(`Перенесено отметок: ${n}`), 300); }
  } catch(e){ setTimeout(() => toast("Ссылка повреждена"), 300); }
  history.replaceState(null, "", location.pathname);
}
async function loadJson(u){ try { const r = await fetch(u, {cache: "no-cache"}); return r.ok ? await r.json() : null; } catch(e){ return null; } }
async function loadExtra(){
  const [fu, ft, cx, dj, rj] = await Promise.all([loadJson("data/food_user.json"), loadJson("data/food_top.json"), loadJson("data/city_extra.json"), loadJson("data/dishes.json"), loadJson("data/ratings.json")]);
  DISH_IMG = dj || {};
  const seen = new Set();
  [...(fu || []), ...(ft || [])].forEach(f => {
    if (!f || !f.id || !f.ll || seen.has(f.id)) return; seen.add(f.id);
    P[f.id] = {n: f.n, ll: f.ll, g: (f.n || "") + ", Ереван"};
    FOOD[f.id] = {dishes: f.dishes || [], top_for: f.top_for || [], order: f.order, rating: f.rating, verdict: f.verdict || f.why_top, links: f.links || {}};
    INFO[f.id] = {open: f.open || "unknown", visit: 60, price: f.price, praise: f.praise, cons: f.cons, sources: f.sources, hours_note: [f.addr ? `Адрес: ${f.addr}` : "", f.open_note || "", f.note || ""].filter(Boolean).join(" ")};
    PHOTOS[f.id] = (f.photos || []).filter(x => x && x.src).map(x => ({src: x.src, author: /google/.test(x.source || "") ? "Google Maps" : /yandex/.test(x.source || "") ? "Яндекс Карты" : hostOf(x.source || ""), license: "фото посетителей и заведения", page: x.source || "#"}));
    CAT.food.push(f.id); LIGHT[f.id] = "any"; INDOOR.add(f.id);
  });
  const RI = (rj && rj.items) || {};
  Object.entries(RI).forEach(([id, r]) => { if (!FOOD[id]) FOOD[id] = {dishes: []}; const base = ratingsOf(id); FOOD[id].R = {google: r.google || base.google, yandex: r.yandex || base.yandex, gis: r.gis || base.gis, gis_url: r.gis_url || null}; });
  (cx || []).forEach(x => { addPlace(x); });
  (false ? [] : []).forEach(x => {
    if (!x || !x.id || !x.ll || P[x.id]) return;
    P[x.id] = {n: x.n, ll: x.ll, g: x.n + ", Ереван"};
    INFO[x.id] = {open: x.open || "unknown", hours_note: x.hours_note, visit: x.visit, price: x.price, best: x.best, praise: x.praise, cons: x.cons, sources: x.sources, fact: x.fact};
    PHOTOS[x.id] = (x.photos || []).filter(p => p && p.src);
    if (x.links) FOOD[x.id] = Object.assign(FOOD[x.id] || {}, {links: x.links});
    LIGHT[x.id] = x.light || "any";
    if (x.cat === "food" || x.cat === "music") CAT.food.push(x.id); else if (x.cat === "view" || x.cat === "park") CAT.view.push(x.id);
    if (x.cat === "music" || x.cat === "culture") INDOOR.add(x.id);
  });
}
function addPlace(x){
  if (!x || !x.id || !x.ll || P[x.id]) return;
  P[x.id] = {n: x.n, ll: x.ll, g: x.n + (inYvnLL(x.ll) ? ", Ереван" : ", Армения")};
  INFO[x.id] = {open: x.open || "unknown", hours_note: x.hours_note, visit: x.visit, price: x.price, best: x.best, praise: x.praise, cons: x.cons, sources: x.sources, fact: x.fact, logistics: x.logistics, drive_from_yerevan: x.drive_from_yerevan};
  PHOTOS[x.id] = (x.photos || []).filter(p => p && p.src);
  if (x.links) FOOD[x.id] = Object.assign(FOOD[x.id] || {}, {links: x.links});
  LIGHT[x.id] = x.light || "any";
  if (x.cat === "food" || x.cat === "music" || x.cat === "wine") CAT.food.push(x.id); else if (["view","park","nature"].includes(x.cat)) CAT.view.push(x.id);
  if (x.cat === "music" || x.cat === "culture") INDOOR.add(x.id);
}
async function loadRoutes(){
  const files = await Promise.all(["data/routes_city.json", "data/routes_trips.json"].map(loadJson));
  loadJson("data/trips_meta.json").then(m => { if (m && m.routes){ TRIPS_META = Object.assign({}, TRIPS_META, m, {loaded: true}); renderTabs(); if (S.tab === "trips" || S.tab === "wk") renderView(); } });
  files.forEach(f => { if (!f) return; (f.places || []).forEach(addPlace);
    (f.routes || []).forEach(r => { if (r && r.id && r.stops && !R.find(x => x.id === r.id)) R.push(r); }); });
}
async function loadCinema(){
  try {
    const r = await fetch("data/cinema.json"); if (!r.ok) return; const j = await r.json();
    if (j.ll) P.cinema.ll = j.ll; if (j.info) INFO.cinema = j.info; if (j.photos) PHOTOS.cinema = j.photos;
  } catch(err){}
}

// ---------- PWA ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; $("installBtn").hidden = false; });
$("installBtn").addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("installBtn").hidden = true; });
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- boot ----------
importFromHash();
window.addEventListener("hashchange", () => { if (/^#(trip|wk)/.test(location.hash)){ importFromHash(); render(); } });
initMap();
$("locBtn").addEventListener("click", () => startGeo(true));
render();
Promise.all([loadEvents(), loadCinema(), loadWeather(), loadExtra().then(loadRoutes)]).then(() => { drawPlaces(); render(); });
if (store.get("y.geoOn", false)) startGeo(false);
setInterval(() => { renderStrip(); if (S.tab === "now" && panel.hidden && document.visibilityState === "visible" && !document.activeElement?.matches("input,select")) renderNow(); }, 5*60*1000);
