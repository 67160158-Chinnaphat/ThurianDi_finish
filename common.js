// ใช้ร่วมกันทุกหน้า: token, เรียก API, เช็กล็อกอิน/role, logout
const API_BASE = "";   // same-origin (หน้าเว็บถูก serve จาก FastAPI ตัวเดียวกัน)
const TOKEN_KEY = "durian_access_token";
const USER_KEY = "durian_user";
const ROLE_HOME = { user: "/user.html", seller: "/seller.html", admin: "/admin.html" };

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }
function saveSession(data) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}
function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

function fmtDetail(d) {
  if (!Array.isArray(d)) return d;
  const names = { email: "รูปแบบอีเมลไม่ถูกต้อง", username: "ชื่อผู้ใช้ต้องมี 3-50 ตัวอักษร", password: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
  return d.map((x) => names[(x.loc || []).slice(-1)[0]] || x.msg || "ข้อมูลไม่ถูกต้อง").join(" · ");
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && token && path !== "/login") { clearSession(); location.replace("/login.html"); }
  if (!res.ok) throw new Error(fmtDetail(data?.detail) || `HTTP ${res.status}`);
  return data;
}

// เรียกตอนโหลดทุกหน้าที่ต้องล็อกอิน: ไม่มี token/token เสีย -> หน้า login, role ไม่ตรงหน้านี้ -> หน้าของ role ตัวเอง
async function requireAuth(allowedRoles) {
  if (!getToken()) { location.replace("/login.html"); return new Promise(() => {}); }
  let me;
  try { me = await api("/me"); } catch { clearSession(); location.replace("/login.html"); return new Promise(() => {}); }
  localStorage.setItem(USER_KEY, JSON.stringify(me));   // ใช้ role ล่าสุดจาก server ไม่เชื่อค่าเก่าในเครื่อง
  if (!allowedRoles.includes(me.role)) { location.replace(ROLE_HOME[me.role] || "/login.html"); return new Promise(() => {}); }
  document.documentElement.classList.remove("auth-pending");
  return me;
}

async function logout() {
  try { await api("/logout", { method: "POST" }); } catch {}
  clearSession();
  location.replace("/login.html");
}

// escape ข้อมูลที่ผู้ใช้กรอกก่อนใส่ลง innerHTML (กัน XSS)
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
