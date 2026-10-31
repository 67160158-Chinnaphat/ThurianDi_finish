# 🌿 สรุปเทคโนโลยีทั้งหมด: ทุเรียนดี

เว็บแอปผู้ช่วยชาวสวนทุเรียน รวม AI วินิจฉัยอุปกรณ์สวน (หมอนทอง) ร้านอะไหล่บนแผนที่ และชุมชนรีวิว มีสิทธิ์ผู้ใช้ 3 ระดับ รันทั้งระบบด้วย Docker Compose

---

## 1. ภาพรวมสถาปัตยกรรม

```
Browser (HTML/CSS/Vanilla JS, Chart.js, Leaflet)
        │  fetch + JWT (Authorization: Bearer)
        ▼
FastAPI (Python 3.11, port 8000)  ──►  PostgreSQL 15 (port 5432)
        │                                   ▲
        │ HTTP /api/chat                    │
        ▼                                   │
Ollama บนเครื่องโฮสต์ (qwen3-vl)       pgAdmin 4 (port 8080)
```

- FastAPI ตัวเดียวทำทั้ง REST API และ serve ไฟล์หน้าเว็บ (same-origin จึงไม่ติดปัญหา CORS ในการใช้งานปกติ)
- Docker Compose ประกอบด้วย 3 service: `postgres`, `fastapi_app`, `pgadmin`
- Ollama ไม่อยู่ใน Docker รันบนเครื่องโฮสต์ แล้ว FastAPI เรียกผ่าน `host.docker.internal:11434`

---

## 2. Backend

| หัวข้อ | เทคโนโลยี / รายละเอียด |
|---|---|
| ภาษา / Framework | Python 3.11, **FastAPI** (app version 4.0.0), Uvicorn |
| ตรวจสอบข้อมูล | **Pydantic** (`Field`, `EmailStr` ผ่าน `email-validator`) |
| ORM | **SQLAlchemy** (declarative, `sessionmaker`, `pool_pre_ping=True`) |
| DB driver | `psycopg2-binary` |
| รับไฟล์ | `python-multipart` (อัปโหลดรูปไป `/diagnose`) |
| งาน blocking | `run_in_threadpool` ครอบการเรียก Ollama ไม่ให้บล็อก event loop |
| Static files | route กำหนดเองใน `main.py` ส่ง `login.html`, `user.html`, `seller.html`, `admin.html`, `common.js`, `app.js`, `style.css` |
| Health check | `GET /api/health` |
| Auto-migration | ตอนเริ่มระบบรัน `ALTER TABLE users ADD COLUMN IF NOT EXISTS role ...` |

### Dependencies (`requirements.txt`)
`fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2-binary`, `passlib[bcrypt]`, `bcrypt==4.0.1`, `python-jose[cryptography]`, `python-multipart`, `email-validator`

---

## 3. ระบบยืนยันตัวตนและสิทธิ์ (Authentication & Authorization)

- **JWT** ด้วย `python-jose`, อัลกอริทึม **HS256**, อายุ token 24 ชั่วโมง
- payload มี `user_id`, `username`, `role`, `jti`, `iat`, `exp`
- **Logout ที่ยกเลิก token จริง:** เก็บ `jti` ลงตาราง `revoked_tokens` และทุก request ตรวจว่า `jti` ถูกยกเลิกหรือไม่
- เปลี่ยนรหัสผ่านแล้ว token ปัจจุบันถูกยกเลิกทันที
- **เข้ารหัสผ่าน:** bcrypt ผ่าน `passlib.CryptContext`
- **Role-based access control:** `require_role(...)` เป็น dependency factory (admin ผ่านได้ทุก endpoint)
  - `user` ผู้ใช้ทั่วไป
  - `seller` ผู้ขาย (สมัครเองไม่ได้ ต้องให้แอดมินสร้างผ่าน `/admin/sellers`)
  - `admin` ผู้ดูแลระบบ (คนแรกสร้างด้วย `seed_admin.py`)
- `/register` ให้ role `user` เสมอ ไม่รับค่า role จาก client
- `ensure_self()` ให้แก้/ลบได้เฉพาะบัญชีตัวเอง ยกเว้นแอดมิน
- กันลบแอดมินคนสุดท้าย และกันแอดมินเปลี่ยนสิทธิ์ของตัวเอง
- ตรวจ username ซ้ำและอีเมลซ้ำ (เทียบแบบ lowercase) พร้อมดัก `IntegrityError`
- ฝั่ง client ตรวจสิทธิ์ซ้ำกับ `/me` ทุกครั้งที่โหลดหน้า ไม่เชื่อค่าใน localStorage อย่างเดียว

---

## 4. ฐานข้อมูล (PostgreSQL 15)

ตารางหลัก (สร้างจาก SQLAlchemy `create_all` และ `init-postgres.sql`)

| ตาราง | ข้อมูลหลัก | ความสัมพันธ์ |
|---|---|---|
| `users` | username, email, hashed_password, is_active, role | 1 user : 1 shop |
| `shops` | name, address, latitude, longitude | `seller_id` UNIQUE → users (ON DELETE CASCADE) |
| `products` | name, unit, price, stock_quantity, created/updated_at | → shops |
| `product_reviews` | rating (1-5), comment | → products, users |
| `posts` | title, content, category, image_url, rating | → users |
| `comments` | content | → posts, users |
| `revoked_tokens` | jti (UNIQUE), expires_at, revoked_at | ใช้ทำ logout จริง |

- มี index ที่ username, email, category, user_id, shop_id, post_id, jti
- ใช้ `ON DELETE CASCADE` ลบข้อมูลที่เกี่ยวข้องตามอัตโนมัติ
- `init.sql` เป็น schema MySQL เวอร์ชันเก่า ไม่ได้ใช้กับ Docker และไม่มีตาราง shops/products/reviews

---

## 5. REST API Endpoints

**Authentication:** `POST /register`, `/login`, `/logout`, `/change-password`

**User Management:** `GET /me`, `GET /check-username/{name}`, `GET /users` (แอดมิน, มี pagination + ค้นหา), `GET/PUT/DELETE /users/{id}`

**Admin:** `POST /admin/sellers`, `PATCH /admin/users/{id}/role`, `GET /admin/stats`

**Shops:** `GET /shops`, `GET/PUT /shops/mine`

**Products & Reviews:** `GET /products`, `GET /products/mine`, `POST /products`, `PUT/DELETE /products/{id}`, `GET/POST /products/{id}/reviews` (1 คน 1 สินค้า ส่งซ้ำจะอัปเดตรีวิวเดิม และผู้ขายรีวิวของร้านตัวเองไม่ได้)

**Community:** `GET/POST /posts` (ค้นหา + กรองหมวด + limit), `DELETE /posts/{id}`, `GET/POST /posts/{id}/comments`

**AI:** `POST /diagnose` (multipart: `image` + `symptom`)

Swagger UI อัตโนมัติที่ `/docs`

---

## 6. หมอนทอง AI (Ollama)

- เรียก **Ollama** ผ่าน HTTP `POST /api/chat` ด้วย `urllib` (stream ปิด)
- โมเดลเริ่มต้น `qwen3-vl:4b` (vision-language อ่านรูปได้) ตั้งค่าอื่นได้ผ่านตัวแปร `OLLAMA_*`
- `OLLAMA_TEXT_MODEL` ใช้โมเดลที่เร็วกว่าเมื่อไม่มีรูป (ไม่บังคับ)
- **Structured output:** รอบแรกบังคับด้วย JSON Schema (`problem`, `likely_cause`, `confidence`, `recommendations`, `youtube_keywords`)
- **Retry:** ถ้าอ่านผลไม่ได้ ลองใหม่โหมด `json` พร้อมย้ำคีย์ที่ต้องการ
- **Fallback:** ถ้ายังได้ข้อความธรรมดา จะแสดงเนื้อหาแบบย่อแทนการขึ้น error
- ตัด `<think>...</think>`, ดึง JSON จากข้อความ, normalize ค่า confidence 0-100
- ตั้ง `think: false` และ `keep_alive: 30m` ให้เร็วและไม่ต้องโหลดโมเดลซ้ำ
- parameter: `num_ctx` 4096, `num_predict` 1000, timeout 600 วินาที (มี deadline รวมทุกรอบ)
- log เวลา/ความเร็ว `tok/s` ของโมเดลทุกครั้ง
- จัดการ error ละเอียด: โมเดลไม่พบ (503), Ollama ล่ม (503), timeout (504), ตอบผิดปกติ (502)
- ตรวจไฟล์รูป: JPG/PNG/WEBP, ไม่เกิน 10 MB
- System prompt บังคับให้ตอบไทยง่ายๆ ให้คะแนนความมั่นใจตามจริง เตือนดับเครื่อง/ถอดปลั๊กก่อน และห้ามแต่งชื่อคลิป/ลิงก์ YouTube
- **ข้อมูลไม่ออกนอกเครื่อง:** โมเดลรันในเครื่องผู้ใช้เอง

---

## 7. Frontend

| ส่วน | เทคโนโลยี |
|---|---|
| ภาษา | HTML5, CSS3, **Vanilla JavaScript** (ไม่ใช้ framework) |
| ฟอนต์ | Google Fonts: Kanit, Sarabun, Chonburi (หน้าผู้ใช้/login), Noto Sans/Serif Thai (admin/seller) |
| กราฟ | **Chart.js 4.4.1** (กราฟแท่งแนวโน้มโรค + โดนัทสัดส่วนโรค) |
| แผนที่ | **Leaflet 1.9.4 + OpenStreetMap tiles** |
| การนำทาง | ลิงก์ Google Maps Directions |
| ตำแหน่ง | Geolocation API ของเบราว์เซอร์ |

### ไฟล์หน้าเว็บ
- `login.html` ทางเข้าเดียว (login/สมัคร) แล้วส่งไปหน้าตาม role
- `user.html` + `app.js` หน้าผู้ใช้ 5 แท็บ: หมอนทอง AI, ชุมชนและรีวิว, เทียบอะไหล่ + แผนที่, แดชบอร์ด, แบ่งปันข้อมูล
- `seller.html` ปักหมุดร้านด้วย GPS, จัดการสินค้า/สต๊อก/ราคา, ดูรีวิว
- `admin.html` สถิติระบบ, สร้างบัญชีผู้ขาย, ค้นหาและเปลี่ยนสิทธิ์ผู้ใช้ (มี pagination)
- `common.js` ใช้ร่วมกัน: `api()`, `requireAuth()`, `logout()`, `esc()`, จัดการ token
- `style.css` ธีมเขียว-ทอง-ครีม มีลายหนามทุเรียน (`spike-divider`) และไอคอนหกเหลี่ยม (`clip-path`)

### เทคนิคที่น่าสนใจ
- **ซ่อนหน้าก่อนตรวจสิทธิ์:** คลาส `auth-pending` ซ่อน body จนกว่า `requireAuth()` ผ่าน กันหน้าวาบก่อน redirect
- **ย่อรูปก่อนส่ง:** `createImageBitmap` + Canvas ลดเหลือ 768px เป็น JPEG 0.85
- **ป้องกัน XSS:** escape ข้อมูลผู้ใช้ก่อนใส่ `innerHTML` (`esc()`, `escapeHtml()`) และ popup แผนที่สร้างด้วย DOM + `textContent`
- **ค้นหาแบบ debounce** ในชุมชนและแผนที่
- **แผนที่:** คำนวณระยะทางด้วยสูตร Haversine, กรอง "ใกล้ฉัน" (10 กม.) และ "มีสินค้าในสต๊อก", เรียงร้านตามระยะ, คลิกรายการเพื่อซูมไปหมุด
- **Retry UI:** ปุ่ม "ลองใหม่" เมื่อ AI วิเคราะห์ไม่สำเร็จ พร้อมตัวนับวินาทีระหว่างรอ
- **Responsive:** media query สำหรับมือถือ (sidebar เปลี่ยนเป็นแถบแนวนอน)
- ชุมชนมีข้อมูลสาธิต (`demoPosts`) สำรองเมื่อฐานข้อมูลยังไม่มีโพสต์

---

## 8. DevOps / Infrastructure

- **Dockerfile:** `python:3.11-slim`, ติดตั้ง dependencies, คัดลอกเฉพาะไฟล์ที่ต้องใช้, รัน `uvicorn main:app --host 0.0.0.0 --port 8000`
- **docker-compose.yml**
  - `postgres:15-alpine` + healthcheck (`pg_isready`) + volume `pgdata` + mount `init-postgres.sql`
  - `fastapi_app` รอ postgres healthy ก่อนเริ่ม และใช้ `extra_hosts: host.docker.internal:host-gateway` ให้เรียก Ollama บนโฮสต์ได้
  - `dpage/pgadmin4` พอร์ต 8080 + volume `pgadmin_data`
- **ตัวแปรสภาพแวดล้อม:** `.env` / `.env.example` (DB, SECRET_KEY, CORS, pgAdmin, OLLAMA_*)
- `.gitignore` และ `.dockerignore` กัน `.env` หลุดขึ้น Git/image
- **สคริปต์ช่วย**
  - `seed_admin.py` สร้างแอดมินคนแรก (รับค่าจาก env var หรือถามแบบโต้ตอบ ถ้าอีเมลมีอยู่แล้วจะอัปเกรดเป็น admin)
  - `seed_demo.py` สร้างร้านตัวอย่าง 4 ร้านพร้อมพิกัด สินค้า และรีวิว (รันซ้ำได้ ไม่สร้างซ้ำ)

### คำสั่งสำคัญ
```bash
docker compose up --build
docker exec -it -e ADMIN_USERNAME=admin -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=yourpassword123 durian_fastapi python seed_admin.py
docker exec -it durian_fastapi python seed_demo.py
```

### พอร์ตและ URL
| บริการ | URL |
|---|---|
| เว็บหลัก (login) | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Health check | http://localhost:8000/api/health |
| pgAdmin | http://localhost:8080 |
| PostgreSQL | localhost:5432 |
| Ollama (โฮสต์) | http://localhost:11434 |

---

## 9. สรุป Tech Stack แบบสั้น

- **Frontend:** HTML5 · CSS3 · Vanilla JS · Chart.js · Leaflet + OpenStreetMap · Google Fonts
- **Backend:** Python 3.11 · FastAPI · Pydantic · SQLAlchemy · Uvicorn
- **Auth/Security:** JWT (python-jose, HS256, jti + revoked_tokens) · bcrypt (passlib) · RBAC 3 ระดับ · escape ป้องกัน XSS
- **Database:** PostgreSQL 15
- **AI:** Ollama · qwen3-vl (vision-language) · JSON Schema structured output
- **DevOps:** Docker · Docker Compose · pgAdmin 4

---

## 10. จุดที่ควรรู้ (ข้อจำกัด / สิ่งที่ควรปรับก่อนใช้งานจริง)

- ต้องเปลี่ยน `SECRET_KEY` เป็นค่าสุ่มยาวๆ (ถ้ายังเป็นค่าเริ่มต้น ระบบจะเตือนใน log)
- `CORS_ORIGINS=*` เหมาะกับตอนพัฒนา ควรกำหนดโดเมนจริงตอนใช้งานจริง
- รหัสผ่านฐานข้อมูล/pgAdmin ใน `.env` เป็นค่าตัวอย่าง ควรเปลี่ยน
- บัญชี demo (`demo1234`) ใช้ทดสอบเท่านั้น ควรลบก่อนใช้งานจริง
- ตารางเทียบอะไหล่ แดชบอร์ดสวน และประวัติการแจ้งปัญหาในหน้าผู้ใช้ ยังเป็นข้อมูลตัวอย่างฝั่ง frontend
- ปุ่มแนบรูปในโพสต์ชุมชนและปุ่มส่งต่อช่างซ่อม ยังเป็น placeholder
- ยังไม่มี automated test และ rate limit ที่ `/login`
- Ollama ต้องให้โมเดลลง GPU ให้ครบ (ตรวจด้วย `ollama ps`) ไม่งั้นตอบช้ามาก
- โทเค็นเก็บใน localStorage (เสี่ยงต่อ XSS หากมีช่องโหว่ จึงต้อง escape ข้อมูลให้ครบทุกจุด)
