const $ = (id) => document.getElementById(id);

const pageMeta = {
  diagnosis: { title: "หมอนทอง AI ผู้ช่วยอุปกรณ์สวน", sub: "ถ่ายรูปหรือพิมพ์อาการของเครื่องมือ/อุปกรณ์ทำสวนที่มีปัญหา แล้วให้หมอนทองช่วยวิเคราะห์และแนะนำวิธีแก้เบื้องต้น" },
  community: { title: "ชุมชนและรีวิว", sub: "อ่านรีวิวและประสบการณ์จากชาวสวนทุเรียนท่านอื่น" },
  parts: { title: "เทียบอะไหล่เกษตร", sub: "ค้นหาและเทียบอะไหล่เครื่องสูบน้ำ-อุปกรณ์ข้ามยี่ห้อ" },
  dashboard: { title: "แดชบอร์ดสวนของฉัน", sub: "ภาพรวมสถิติโรค ค่าใช้จ่าย และประวัติของสวน" },
  share: { title: "แบ่งปันข้อมูล", sub: "โพสต์อัปเดตผลการรักษา รีวิว หรือช่วยตอบคำถามเพื่อนชาวสวน" },
};

/* ===================== NAVIGATION ===================== */
document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  const view = btn.dataset.view;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(`view-${view}`).classList.add("active");
  $("pageTitle").textContent = pageMeta[view].title;
  $("pageSubtitle").textContent = pageMeta[view].sub;
  $("notifPanel").classList.remove("open");
  // Charts are built while the dashboard panel is hidden (display:none),
  // so Chart.js measures a 0x0 canvas and never draws the data. Force a
  // resize once the panel is actually visible so it re-measures correctly.
  if (view === "parts") initShopsMap();
  if (view === "dashboard") {
    requestAnimationFrame(() => {
      [chartDiseaseInstance, chartPieInstance].forEach(c => c && c.resize());
    });
  }
}));

$("notifBtn").addEventListener("click", (e) => { e.stopPropagation(); $("notifPanel").classList.toggle("open"); });
document.addEventListener("click", () => $("notifPanel").classList.remove("open"));

/* ===================== SESSION ===================== */
function updateAuthUI(user) {
  $("authBtn").textContent = `ออกจากระบบ · ${user.username}`;
  $("authBtn").classList.remove("btn-ghost"); $("authBtn").classList.add("btn-outline");
  const nameEl = document.querySelector(".user-name"); if (nameEl) nameEl.textContent = user.username;
  const subEl = document.querySelector(".user-sub"); if (subEl) subEl.textContent = user.email;
  const sessionEl = $("userSession");
  if (sessionEl) sessionEl.innerHTML = `<span class="session-dot"></span> เชื่อมต่อฐานข้อมูลแล้ว · ${user.email}`;
}
$("authBtn").addEventListener("click", logout);

/* ===================== หมอนทอง AI (ผู้ช่วยอุปกรณ์สวน) ===================== */
const chatWindow = $("chatWindow");
function addUserMsg(text, imageName = "") {
  const div = document.createElement("div"); div.className = "msg user";
  div.innerHTML = `<div class="hex msg-avatar">👨‍🌾</div><div class="bubble">${imageName ? `<div class="upload-chip">📷 ${escapeHtml(imageName)}</div>` : ""}${escapeHtml(text)}</div>`;
  chatWindow.appendChild(div); chatWindow.scrollTop = chatWindow.scrollHeight;
}
function addBotThinking() {
  $("thinkingMsg")?.remove();
  const div = document.createElement("div"); div.className = "msg bot"; div.id = "thinkingMsg";
  div.innerHTML = `<div class="hex msg-avatar">🤖</div><div class="bubble thinking"><span></span><span></span><span></span> <em id="thinkLabel" style="font-style:normal">กำลังวิเคราะห์...</em></div>`;
  chatWindow.appendChild(div); chatWindow.scrollTop = chatWindow.scrollHeight;
  const t0 = Date.now();
  const timer = setInterval(() => {
    const el = $("thinkLabel");
    if (!el) return clearInterval(timer);   // ฟองถูกลบแล้ว (ได้คำตอบหรือเกิด error)
    el.textContent = `กำลังวิเคราะห์... (${Math.round((Date.now() - t0) / 1000)} วินาที)`;
  }, 1000);
}
function addBotError(message, retry) {
  const div = document.createElement("div"); div.className = "msg bot";
  const av = document.createElement("div"); av.className = "hex msg-avatar"; av.textContent = "🤖";
  const bubble = document.createElement("div"); bubble.className = "bubble";
  bubble.append(document.createTextNode(`ขออภัยครับ วิเคราะห์ไม่สำเร็จ: ${message}`));
  if (retry) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn btn-ghost retry-btn"; btn.textContent = "🔄 ลองใหม่";
    btn.addEventListener("click", () => { btn.remove(); retry(); });
    bubble.append(document.createElement("br"), btn);
  }
  div.append(av, bubble); chatWindow.appendChild(div); chatWindow.scrollTop = chatWindow.scrollHeight;
}
function friendlyError(err) {
  const m = String(err?.message || "");
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (เซิร์ฟเวอร์อาจกำลังรีสตาร์ท) กรุณารอสักครู่แล้วลองใหม่";
  return m || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}
// ย่อรูปก่อนส่ง: รูปจากมือถือใหญ่มาก ทำให้โมเดลช้าและกินหน่วยความจำ
async function downscaleImage(file, maxSide = 768) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close?.(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height); bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
function addBotDiagnosis(result) {
  $("thinkingMsg")?.remove();
  const div = document.createElement("div"); div.className = "msg bot";
  const recs = (result.recommendations || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
  const yt = (result.youtube_keywords || []).length
    ? `<div style="margin-top:10px;font-size:.92em">🎬 ลองค้นหาคลิปซ่อมเบื้องต้นใน YouTube ด้วยคำว่า:<ul>${result.youtube_keywords.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : "";
  div.innerHTML = `<div class="hex msg-avatar">🤖</div><div class="bubble">จากข้อมูลที่ส่งมา หมอนทองพบปัญหาที่เป็นไปได้ดังนี้ครับ<div class="diag-card"><div class="diag-card-title">🔧 ${escapeHtml(result.problem)} <span class="diag-scientific">(${escapeHtml(result.likely_cause)})</span></div><div class="diag-conf">ความมั่นใจของระบบ: ${Number(result.confidence) || 0}%</div><ul>${recs}</ul>${yt}<button class="btn btn-ghost" type="button" onclick="alert('ฟังก์ชันส่งต่อช่างซ่อมพร้อมเชื่อมต่อได้เมื่อมีบัญชีช่างในระบบ')">ส่งต่อช่างซ่อมอุปกรณ์การเกษตร</button></div><div class="diag-note">${escapeHtml(result.disclaimer || "")}</div></div>`;
  chatWindow.appendChild(div); chatWindow.scrollTop = chatWindow.scrollHeight;
}
let pendingImage = null, sendingChat = false;
const uploadBtn = $("uploadPhotoBtn"), uploadBtnHtml = uploadBtn.innerHTML;
function resetPendingImage() { pendingImage = null; $("photoInput").value = ""; uploadBtn.innerHTML = uploadBtnHtml; }
async function runDiagnosis(text, file) {
  if (sendingChat) return;
  sendingChat = true; $("sendChatBtn").disabled = true; addBotThinking();
  try {
    const fd = new FormData();
    if (file) fd.append("image", await downscaleImage(file));
    fd.append("symptom", text);
    addBotDiagnosis(await api("/diagnose", { method: "POST", body: fd }));
  } catch (err) {
    $("thinkingMsg")?.remove();
    addBotError(friendlyError(err), () => runDiagnosis(text, file));
  } finally { sendingChat = false; $("sendChatBtn").disabled = false; }
}
async function sendChat() {
  if (sendingChat) return;
  const text = $("chatText").value.trim();
  if (!text && !pendingImage) return;
  const file = pendingImage;
  addUserMsg(text || "ส่งรูปเพื่อวิเคราะห์ปัญหาอุปกรณ์", file ? file.name : "");
  $("chatText").value = ""; resetPendingImage();
  await runDiagnosis(text, file);
}
$("sendChatBtn").addEventListener("click", sendChat);
$("chatText").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); sendChat(); } });
uploadBtn.addEventListener("click", () => $("photoInput").click());
$("photoInput").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  pendingImage = f; uploadBtn.textContent = `📷 ${f.name}`;
});

/* ===================== COMMUNITY ===================== */
const demoPosts = [
  { author:"สมหญิง สวนดี", region:"south", regionLabel:"ภาคใต้", category:"disease", rating:5, time:"2 ชม.ที่แล้ว", title:"ใบไหม้ช่วงฝนตก", text:"ปีนี้เจอใบไหม้เยอะมากช่วงฝนตกต่อเนื่อง ลองพ่นสารตามคำแนะนำ 2 รอบ อาการเริ่มดีขึ้นแล้วครับ", image:true },
  { author:"ประเสริฐ ทุเรียนทอง", region:"east", regionLabel:"ภาคตะวันออก", category:"fertilizer", rating:4, time:"5 ชม.ที่แล้ว", title:"รีวิวปุ๋ย 8-24-24", text:"รีวิวปุ๋ยสูตร 8-24-24 ที่บอทแนะนำ ใช้แล้วดอกติดดีขึ้นเยอะ แต่ราคาสูงกว่าปุ๋ยทั่วไปนิดหน่อย" },
  { author:"มานพ ใจเกษตร", region:"south", regionLabel:"ภาคใต้", category:"general", rating:0, time:"1 วันที่แล้ว", title:"ถามสูตรปุ๋ย", text:"มือใหม่ปลูกทุเรียนปีแรก อยากถามว่าช่วงนี้ควรใส่ปุ๋ยสูตรไหนดีครับ พื้นที่ดินร่วนปนทราย" },
  { author:"วิภา สวนเขาใหญ่", region:"east", regionLabel:"ภาคตะวันออก", category:"disease", rating:5, time:"1 วันที่แล้ว", title:"ก่อน-หลังรักษารากเน่า", text:"แชร์ภาพก่อน-หลังรักษาโรครากเน่าโคนเน่า ใช้เวลาประมาณ 3 สัปดาห์ต้นฟื้นตัวชัดเจน", image:true },
  { author:"อรุณ ทองสวน", region:"north", regionLabel:"ภาคเหนือ", category:"fertilizer", rating:3, time:"2 วันที่แล้ว", title:"ลองปุ๋ยอินทรีย์", text:"ลองปุ๋ยอินทรีย์ยี่ห้อที่ชุมชนแนะนำ ผลลัพธ์กลางๆ ต้นโตช้ากว่าที่คาด อาจเพราะอากาศเย็นกว่าภาคอื่น" },
];
function renderStars(n) { return n ? `<span class="stars">${"★".repeat(n)}${"☆".repeat(5-n)}</span>` : ""; }
function categoryLabel(c) { return ({disease:"โรคพืช", fertilizer:"ปุ๋ย/ยา", general:"ถาม-ตอบทั่วไป", update:"อัปเดตผลการรักษา", review:"รีวิวปุ๋ย/อะไหล่", qa:"ถามคำถาม"}[c] || c); }
function buildPostCard(p) {
  const div = document.createElement("article"); div.className = "post-card";
  const when = p.time || formatTime(p.created_at);
  div.innerHTML = `<div class="post-head"><div class="post-author"><div class="hex post-author-avatar">👤</div><div><div class="post-author-name">${escapeHtml(p.author || p.username)}</div><div class="post-meta">${escapeHtml(categoryLabel(p.category))} · ${escapeHtml(when)}</div></div></div>${renderStars(p.rating)}</div><div class="post-title">${escapeHtml(p.title || "โพสต์จากชุมชน")}</div><div class="post-body">${escapeHtml(p.text || p.content)}</div>${p.image ? '<div class="post-imgs"><div class="img-placeholder">ภาพก่อน</div><div class="img-placeholder">ภาพหลัง</div></div>' : ''}<div class="post-footer"><span class="region-tag">${escapeHtml(p.regionLabel || "ชุมชนทุเรียน")}</span>${p.comment_count !== undefined ? `<span class="comment-count">💬 ${p.comment_count}</span>` : ""}</div>`;
  return div;
}
async function loadCommunityFeed() {
  const feed = $("communityFeed"); feed.innerHTML = `<div class="panel loading-card">กำลังโหลดข้อมูลชุมชน...</div>`;
  const search = $("communitySearch").value.trim(); const cat = document.querySelector("#categoryPills .pill.active")?.dataset.cat || "all";
  try {
    const posts = await api(`/posts?q=${encodeURIComponent(search)}&category=${encodeURIComponent(cat)}&limit=50`);
    if (!posts.length) throw new Error("empty");
    feed.innerHTML = ""; posts.forEach(p => feed.appendChild(buildPostCard(p)));
  } catch {
    const region = $("communityRegion").value;
    const filtered = demoPosts.filter(p => (!search || `${p.author} ${p.text} ${p.title}`.toLowerCase().includes(search.toLowerCase())) && (!region || region === "all" || p.region === region) && (cat === "all" || p.category === cat));
    feed.innerHTML = "";
    if (!filtered.length) feed.innerHTML = `<div class="panel empty-state">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>`;
    else filtered.forEach(p => feed.appendChild(buildPostCard(p)));
  }
}
$("communitySearch").addEventListener("input", debounce(loadCommunityFeed, 250));
$("communityRegion").addEventListener("change", loadCommunityFeed);
document.querySelectorAll("#categoryPills .pill").forEach(pill => pill.addEventListener("click", () => { document.querySelectorAll("#categoryPills .pill").forEach(p => p.classList.remove("active")); pill.classList.add("active"); loadCommunityFeed(); }));

/* ===================== PARTS ===================== */
const partsData = [
  { model:"Honda WB20XH", part:"ซีลกันน้ำปั๊ม", alt:"SIMEC SP-20 / Kubota KWP-20", price:"180–320 บาท" },
  { model:"Honda WB30XH", part:"ใบพัดปั๊ม (Impeller)", alt:"SIMEC SP-30 / Mitsubishi MPD-30", price:"450–650 บาท" },
  { model:"Kubota KWP-20", part:"แหวนรองกันสั่น", alt:"Honda WB20XH / SIMEC SP-20", price:"60–120 บาท" },
  { model:"Mitsubishi MPD-30", part:"ท่อดูดสายยาง 3 นิ้ว", alt:"ใช้ร่วมกันได้ทุกยี่ห้อ", price:"250–400 บาท" },
  { model:"SIMEC SP-20", part:"สปริงวาล์วเช็ค", alt:"Honda WB20XH / Kubota KWP-20", price:"40–90 บาท" },
];
function renderPartsTable() {
  const q = $("partsSearch").value.toLowerCase(); const tbody = document.querySelector("#partsTable tbody"); tbody.innerHTML = "";
  const filtered = partsData.filter(r => `${r.model} ${r.part} ${r.alt}`.toLowerCase().includes(q));
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">ไม่พบรายการ</td></tr>`; return; }
  filtered.forEach(r => { const tr = document.createElement("tr"); tr.innerHTML = `<td>${escapeHtml(r.model)}</td><td>${escapeHtml(r.part)}</td><td>${escapeHtml(r.alt)}</td><td>${escapeHtml(r.price)}</td>`; tbody.appendChild(tr); });
}
$("partsSearch").addEventListener("input", renderPartsTable);
$("partsCameraBtn").addEventListener("click", () => { $("partsSearch").value = "Honda WB20XH"; renderPartsTable(); });
renderPartsTable();
/* ===================== SHOPS MAP (Leaflet + OpenStreetMap) ===================== */
const NEAR_KM = 10;
const shopsMapState = { started: false, map: null, layer: null, shops: [], products: new Map(), markers: new Map(), userPos: null, userMarker: null, filter: "all", query: "" };

function setMapStatus(msg) { $("shopsMapStatus").textContent = msg || ""; }

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180, R = 6371;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function directionsUrl(s) { return `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`; }
function shopProducts(s) { return shopsMapState.products.get(s.id) || []; }
function shopDistance(s) { const u = shopsMapState.userPos; return u ? distanceKm(u, { lat: s.latitude, lng: s.longitude }) : null; }

function visibleShops() {
  const st = shopsMapState, q = st.query.trim().toLowerCase();
  return st.shops.filter((s) => {
    if (q) {
      const hay = [s.name, s.address || "", ...shopProducts(s).map((p) => p.name)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (st.filter === "stock" && !shopProducts(s).some((p) => p.stock_quantity > 0)) return false;
    if (st.filter === "near" && st.userPos && shopDistance(s) > NEAR_KM) return false;
    return true;
  });
}

function buildPopup(s) {   // ใช้ DOM + textContent เพื่อกัน XSS จากข้อมูลที่ผู้ขายกรอก
  const box = document.createElement("div"); box.className = "map-info";
  const name = document.createElement("strong"); name.textContent = s.name;
  const addr = document.createElement("div"); addr.textContent = s.address || "ไม่ได้ระบุที่อยู่";
  const prods = shopProducts(s);
  const meta = document.createElement("div"); meta.className = "map-info-meta";
  meta.textContent = prods.length ? `สินค้า ${prods.length} รายการ` : "ยังไม่มีสินค้าในระบบ";
  box.append(name, addr, meta);
  prods.slice(0, 3).forEach((p) => {
    const row = document.createElement("div"); row.className = "map-info-row";
    row.textContent = `• ${p.name} — ${Number(p.price).toLocaleString("th-TH")} บาท/${p.unit}${p.stock_quantity > 0 ? "" : " (หมด)"}`;
    box.append(row);
  });
  const link = document.createElement("a"); link.href = directionsUrl(s); link.target = "_blank"; link.rel = "noopener"; link.textContent = "🧭 นำทาง";
  box.append(link);
  return box;
}

function focusShop(s) {
  const st = shopsMapState, m = st.markers.get(s.id);
  if (!st.map || !m) return;
  $("shopsMap").scrollIntoView({ behavior: "smooth", block: "center" });
  st.map.setView(m.getLatLng(), Math.max(st.map.getZoom(), 15));
  m.openPopup();
}

function renderShopList(shops) {
  const st = shopsMapState, list = $("shopList"); list.innerHTML = "";
  if (!shops.length) return;
  const rows = shops.map((s) => ({ s, d: shopDistance(s) }));
  if (st.userPos) rows.sort((a, b) => a.d - b.d);
  rows.forEach(({ s, d }) => {
    const item = document.createElement("div"); item.className = "shop-item clickable";
    const info = document.createElement("div"); info.className = "shop-info";
    const pin = document.createElement("div"); pin.className = "hex pin"; pin.textContent = "📍";
    const txt = document.createElement("div");
    const nm = document.createElement("div"); nm.className = "shop-name"; nm.textContent = s.name;
    const ad = document.createElement("div"); ad.className = "shop-addr"; ad.textContent = s.address || "ไม่ได้ระบุที่อยู่";
    txt.append(nm, ad);
    if (d !== null) { const dd = document.createElement("div"); dd.className = "shop-dist"; dd.textContent = `ห่างประมาณ ${d.toFixed(1)} กม. (เส้นตรง)`; txt.append(dd); }
    info.append(pin, txt);
    const nav = document.createElement("a"); nav.className = "btn btn-ghost"; nav.href = directionsUrl(s); nav.target = "_blank"; nav.rel = "noopener"; nav.textContent = "🧭 นำทาง";
    nav.addEventListener("click", (e) => e.stopPropagation());
    item.append(info, nav);
    item.addEventListener("click", () => focusShop(s));
    list.appendChild(item);
  });
}

function renderShopsMap(fit = true) {
  const st = shopsMapState, shops = visibleShops();
  if (st.map) {
    st.layer.clearLayers(); st.markers.clear();
    const icon = L.divIcon({ className: "shop-marker-wrap", html: '<div class="shop-marker">🏪</div>', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18] });
    shops.forEach((s) => {
      const m = L.marker([s.latitude, s.longitude], { icon, title: s.name }).bindPopup(() => buildPopup(s));
      m.addTo(st.layer); st.markers.set(s.id, m);
    });
    if (fit && shops.length) {
      const b = L.latLngBounds(shops.map((s) => [s.latitude, s.longitude]));
      if (st.userPos) b.extend([st.userPos.lat, st.userPos.lng]);
      st.map.fitBounds(b, { paddingTopLeft: [40, 130], paddingBottomRight: [40, 40], maxZoom: 15 });
    }
  }
  renderShopList(shops);
  if (!st.shops.length) setMapStatus("ยังไม่มีร้านค้าที่ปักหมุดตำแหน่งในระบบ");
  else if (!shops.length) setMapStatus(st.filter === "near" ? `ไม่พบร้านภายใน ${NEAR_KM} กม. จากตำแหน่งของคุณ` : "ไม่พบร้านที่ตรงกับเงื่อนไข");
  else setMapStatus("");
}

async function initShopsMap() {
  const st = shopsMapState;
  if (st.started) { st.map?.invalidateSize(); return; }
  if (!window.L) { setMapStatus("โหลดแผนที่ (Leaflet) ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วรีเฟรชหน้า"); return; }
  st.started = true;
  if (!st.map) {
    st.map = L.map("shopsMap", { zoomControl: false }).setView([13.5, 101.0], 6);
    L.control.zoom({ position: "bottomright" }).addTo(st.map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(st.map);
    st.layer = L.layerGroup().addTo(st.map);
  }
  setTimeout(() => st.map.invalidateSize(), 0);   // แผนที่ถูกสร้างตอนแท็บเพิ่งแสดง ต้องวัดขนาดใหม่
  setMapStatus("กำลังโหลดข้อมูลร้านค้า...");
  try {
    const [shops, products] = await Promise.all([api("/shops"), api("/products")]);
    st.shops = shops.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
    st.products = new Map();
    products.forEach((p) => { if (!st.products.has(p.shop_id)) st.products.set(p.shop_id, []); st.products.get(p.shop_id).push(p); });
    renderShopsMap();
  } catch (err) { st.started = false; setMapStatus(`โหลดข้อมูลร้านค้าไม่สำเร็จ: ${err.message}`); }
}

function locateUser() {
  const st = shopsMapState;
  return new Promise((resolve) => {
    if (!navigator.geolocation) { setMapStatus("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง"); return resolve(false); }
    setMapStatus("กำลังหาตำแหน่งของคุณ...");
    navigator.geolocation.getCurrentPosition((p) => {
      st.userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (st.map) {
        st.userMarker?.remove();
        st.userMarker = L.circleMarker([st.userPos.lat, st.userPos.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#4285F4", fillOpacity: 1 }).addTo(st.map).bindTooltip("ตำแหน่งของคุณ");
      }
      setMapStatus(""); resolve(true);
    }, () => { setMapStatus("ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์"); resolve(false); }, { timeout: 10000 });
  });
}

document.querySelectorAll(".map-chip").forEach((chip) => chip.addEventListener("click", async () => {
  const st = shopsMapState, f = chip.dataset.filter;
  if (f === "near" && !st.userPos && !(await locateUser())) return;
  st.filter = f;
  document.querySelectorAll(".map-chip").forEach((c) => c.classList.toggle("active", c === chip));
  renderShopsMap();
}));
$("shopSearch").addEventListener("input", debounce((e) => { shopsMapState.query = e.target.value; renderShopsMap(); }, 200));

/* ===================== DASHBOARD ===================== */
const chartCommon = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ font:{family:"Kanit"} } } } };
let chartDiseaseInstance, chartPieInstance;
if (window.Chart) {
  chartDiseaseInstance = new Chart($("chartDisease"), { type:"bar", data:{labels:["ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค."],datasets:[{label:"จำนวนครั้งที่พบโรค",data:[2,3,1,4,5,3],backgroundColor:"#E8A83C",borderRadius:7}]}, options:{...chartCommon, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1}}}} });
  chartPieInstance = new Chart($("chartPie"), { type:"doughnut", data:{labels:["ใบไหม้","รากเน่าโคนเน่า","ราดำ","ปกติดี"],datasets:[{data:[42,23,15,20],backgroundColor:["#C4562E","#1F4D36","#7FA687","#E8A83C"],borderWidth:0}]}, options:{...chartCommon, plugins:{legend:{position:"bottom",labels:{font:{family:"Kanit"}}}}} });
} else {
  document.querySelectorAll("canvas").forEach(c => { c.insertAdjacentHTML("afterend", '<p class="chart-fallback">กราฟจะโหลดเมื่อเชื่อมต่อ Chart.js ได้</p>'); });
}
const historyData=[{date:"17 ก.ค. 2569",item:"ใบไหม้ (Phytophthora)",action:"พ่นสารป้องกันเชื้อรา",cost:"฿850"},{date:"10 ก.ค. 2569",item:"ตรวจสุขภาพต้นทั่วไป",action:"ไม่พบความผิดปกติ",cost:"฿0"},{date:"2 ก.ค. 2569",item:"รากเน่าโคนเน่า",action:"ตัดแต่งรากเน่า + ใส่ปูนขาว",cost:"฿1,200"},{date:"24 มิ.ย. 2569",item:"ซื้อปุ๋ยสูตร 8-24-24",action:"ใส่ปุ๋ยรอบดอกบาน",cost:"฿2,200"}];
historyData.forEach(h=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${h.date}</td><td>${h.item}</td><td>${h.action}</td><td>${h.cost}</td>`;$("historyTableBody").appendChild(tr);});

/* ===================== SHARE ===================== */
async function submitPost() {
  const content = $("postContent").value.trim(); if (!content) return;
  const category = $("postCategory").value;
  try {
    await api("/posts", {method:"POST",body:JSON.stringify({title: content.length>60 ? content.slice(0,60)+"…" : content,content,category})});
    $("postContent").value=""; await loadCommunityFeed();
    document.querySelector('[data-view="community"]').click();
  } catch (err) { alert(err.message); }
}
$("postSubmitBtn").addEventListener("click", submitPost);
$("postImageBtn").addEventListener("click", () => alert("แนบรูปสำหรับโพสต์จะเพิ่มต่อในโมดูลอัปโหลดไฟล์ได้ ระบบ Backend สำหรับโพสต์พร้อมรองรับ image_url แล้ว"));

function formatTime(date) { try { return new Date(date).toLocaleString("th-TH", {dateStyle:"short",timeStyle:"short"}); } catch { return "ล่าสุด"; } }
function escapeHtml(str) { return String(str ?? "").replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch])); }
function debounce(fn, wait) { let t; return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait);}; }

requireAuth(["user"]).then((me) => { updateAuthUI(me); loadCommunityFeed(); });
