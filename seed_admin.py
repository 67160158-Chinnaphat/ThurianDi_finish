"""
สคริปต์สร้างบัญชี Admin คนแรก รันครั้งเดียวตอนที่ระบบยังไม่มี admin เลย
(Admin คนแรกต้องถูกสร้างแบบนี้ เพราะ /register ให้ role "user" เสมอ
 และ /admin/sellers ก็ต้องมี admin login อยู่แล้วถึงจะเรียกได้)

วิธีใช้ (รันตอน container fastapi_app กำลังทำงานอยู่) — แนะนำให้ส่งค่าผ่าน
environment variable แทนการพิมพ์ตอบสดๆ เพราะ docker exec -it บน Windows
PowerShell มักส่งตัวอักษรผิดเพี้ยน (encoding) ตอนพิมพ์โต้ตอบ:

    docker exec -it -e ADMIN_USERNAME=admin -e ADMIN_EMAIL=admin@thuriandi.com -e ADMIN_PASSWORD=yourpassword123 durian_fastapi python seed_admin.py

ถ้าไม่ตั้ง environment variable ไว้ สคริปต์จะถามแบบโต้ตอบแทน (ใช้ได้เฉพาะ
ตัวอักษร/ตัวเลขภาษาอังกฤษเท่านั้น ห้ามพิมพ์ภาษาไทยตอนตอบคำถาม)

หลังสร้างแล้ว ให้ล็อกอินด้วย "อีเมล" ที่ตั้งไว้ (ADMIN_EMAIL)
ถ้าอีเมลที่กำหนดมีอยู่แล้ว จะแค่อัปเกรด role ของบัญชีนั้นเป็น admin ให้
"""
import getpass
import os
import sys

from sqlalchemy import func

from main import SessionLocal, User, hash_password


def main():
    username = os.getenv("ADMIN_USERNAME") or input("Username สำหรับ Admin (ภาษาอังกฤษเท่านั้น): ").strip()
    email = os.getenv("ADMIN_EMAIL") or input("Email สำหรับ Admin: ").strip()
    password = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Password: ").strip()

    if not username or not email or len(password) < 6:
        print("ข้อมูลไม่ถูกต้อง: username/email ต้องไม่ว่าง และ password ต้องยาวอย่างน้อย 6 ตัวอักษร")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(func.lower(User.email) == email.lower()).first()
        if existing:
            existing.role = "admin"
            db.commit()
            print(f"อัปเกรดผู้ใช้ '{existing.email}' ที่มีอยู่แล้วให้เป็น admin เรียบร้อย")
            return

        admin = User(
            username=username,
            email=email.lower(),
            hashed_password=hash_password(password),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print(f"สร้างบัญชี admin '{username}' เรียบร้อยแล้ว")
    finally:
        db.close()


if __name__ == "__main__":
    main()
