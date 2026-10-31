"""
สร้างข้อมูลตัวอย่าง (ร้านค้าพร้อมพิกัด + สินค้า + รีวิว) สำหรับทดสอบแผนที่และหน้าผู้ขาย
ชื่อร้าน/พิกัดเป็นข้อมูลสมมติโดยประมาณ ไม่ใช่ร้านจริง

วิธีใช้ (ตอน container durian_fastapi กำลังทำงานอยู่):
    docker exec -it durian_fastapi python seed_demo.py

รันซ้ำได้ ไม่สร้างซ้ำ (เช็กจากอีเมล/ชื่อร้าน)
รหัสผ่านบัญชีตัวอย่างทั้งหมดคือ demo1234 (เปลี่ยนได้ด้วย -e DEMO_PASSWORD=...)
ข้อมูลนี้ใช้ทดสอบเท่านั้น ก่อนใช้งานจริงให้ลบบัญชี demo ออก
"""
import os

from sqlalchemy import func

from main import Product, ProductReview, SessionLocal, Shop, User, hash_password

PASSWORD = os.getenv("DEMO_PASSWORD", "demo1234")

SELLERS = [
    {
        "username": "seller_kaset", "email": "seller.kaset@example.com",
        "shop": "ร้านเกษตรพัฒนา", "address": "ถ.สายเกษตร ต.บ้านโป่ง อ.เมืองจันทบุรี จ.จันทบุรี",
        "lat": 12.6250, "lng": 102.1150,
        "products": [
            ("ซีลกันน้ำปั๊ม Honda WB20XH", "ชิ้น", 250, 24),
            ("ใบพัดปั๊ม (Impeller) WB30XH", "ชิ้น", 520, 10),
            ("สายยางดูดน้ำ 3 นิ้ว", "เมตร", 85, 120),
        ],
    },
    {
        "username": "seller_yongyut", "email": "seller.yongyut@example.com",
        "shop": "ยงยุทธการเกษตร", "address": "หน้าตลาดสด อ.มะขาม จ.จันทบุรี",
        "lat": 12.7167, "lng": 102.1833,
        "products": [
            ("สายพานเครื่องพ่นยา", "เส้น", 120, 40),
            ("หัวฉีดพ่นยา", "ชิ้น", 65, 80),
            ("สปริงวาล์วเช็ค SIMEC SP-20", "ชิ้น", 60, 35),
        ],
    },
    {
        "username": "seller_thaicharoen", "email": "seller.thaicharoen@example.com",
        "shop": "ร้านอะไหล่ปั๊มน้ำไทยเจริญ", "address": "ถ.สุขุมวิท อ.ขลุง จ.จันทบุรี",
        "lat": 12.4900, "lng": 102.2200,
        "products": [
            ("ปั๊มน้ำ 2 นิ้ว (เครื่องยนต์เบนซิน)", "เครื่อง", 6900, 5),
            ("แหวนรองกันสั่น Kubota KWP-20", "ชิ้น", 90, 50),
            ("ท่อดูดสายยาง Mitsubishi MPD-30", "เส้น", 320, 15),
        ],
    },
    {
        "username": "seller_rayong", "email": "seller.rayong@example.com",
        "shop": "ระยองเกษตรภัณฑ์", "address": "ถ.สุขุมวิท อ.เมืองระยอง จ.ระยอง",
        "lat": 12.6814, "lng": 101.2816,
        "products": [
            ("เครื่องตัดหญ้าสะพายบ่า", "เครื่อง", 4500, 8),
            ("ใบมีดตัดหญ้า 3 แฉก", "ชิ้น", 75, 60),
        ],
    },
]

REVIEWS = [  # (ชื่อสินค้าที่ขึ้นต้นด้วย, คะแนน, ความเห็น)
    ("ซีลกันน้ำปั๊ม", 5, "ตรงรุ่น ใส่แล้วไม่รั่วเลย"),
    ("ซีลกันน้ำปั๊ม", 4, "ของดี ส่งไว"),
    ("สายพานเครื่องพ่นยา", 4, "ใช้ได้ดี ราคาไม่แพง"),
    ("ปั๊มน้ำ 2 นิ้ว", 5, "แรงดีมาก รดน้ำทั่วสวนได้สบาย"),
    ("เครื่องตัดหญ้า", 3, "ใช้ได้ แต่เสียงค่อนข้างดัง"),
]


def get_or_create_user(db, username, email, role):
    user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if user:
        return user, False
    user = User(username=username, email=email.lower(), hashed_password=hash_password(PASSWORD), role=role)
    db.add(user)
    db.flush()
    return user, True


def main():
    db = SessionLocal()
    try:
        created_shops = 0
        for s in SELLERS:
            seller, _ = get_or_create_user(db, s["username"], s["email"], "seller")
            shop = db.query(Shop).filter(Shop.seller_id == seller.id).first()
            if shop is None:
                shop = Shop(seller_id=seller.id, name=s["shop"])
                db.add(shop)
                db.flush()
                created_shops += 1
            shop.name, shop.address = s["shop"], s["address"]
            shop.latitude, shop.longitude = s["lat"], s["lng"]
            existing = {p.name for p in db.query(Product).filter(Product.shop_id == shop.id)}
            for name, unit, price, stock in s["products"]:
                if name not in existing:
                    db.add(Product(shop_id=shop.id, name=name, unit=unit, price=price, stock_quantity=stock))
        db.flush()

        farmer, _ = get_or_create_user(db, "demo_farmer", "demo.farmer@example.com", "user")
        for prefix, rating, comment in REVIEWS:
            product = db.query(Product).filter(Product.name.like(f"{prefix}%")).first()
            if product and not db.query(ProductReview).filter(
                ProductReview.product_id == product.id, ProductReview.user_id == farmer.id
            ).first():
                db.add(ProductReview(product_id=product.id, user_id=farmer.id, rating=rating, comment=comment))
                farmer = db.merge(farmer)
        db.commit()
        print(f"เรียบร้อย: ร้านค้าตัวอย่าง {len(SELLERS)} ร้าน (สร้างใหม่ {created_shops})")
        print(f"ล็อกอินผู้ขายด้วยอีเมล เช่น {SELLERS[0]['email']} / รหัสผ่าน {PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
