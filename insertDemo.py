from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext
import database as db

# Database connection details sync mapping
engine = create_engine("sqlite:///./inventory.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
session = SessionLocal()

# Password hashing instance (main.py er motoi same security schema)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_data():
    print("🧹 Cleaning old structural instances...")
    db.Base.metadata.drop_all(bind=engine)
    db.Base.metadata.create_all(bind=engine)
    
    print("🔑 Creating Secure User Entry...")
    # Admin entry configuration setup tracking
    admin_password_hash = pwd_context.hash("admin123") # Plain password encrypt kora holo
    demo_user = db.User(
        username="admin",
        password_hash=admin_password_hash,
        role="admin"
    )
    session.add(demo_user)
    
    print("📦 Creating Testing Product Data...")
    demo_product = db.Product(
        barcode="42182658",
        name="Goat Milk Soap",
        stock_quantity=11
    )
    session.add(demo_product)
    
    session.commit()
    print("🚀 System Data Seeded Successfully with Secure Authentication Sync!")

if __name__ == "__main__":
    seed_data()
    session.close()