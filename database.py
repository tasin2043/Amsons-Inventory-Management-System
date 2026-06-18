from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 🎲 Database File path layout mapping configuration
SQLALCHEMY_DATABASE_URL = "sqlite:///./inventory.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# 👤 1. User Table Model
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="staff")
    face_encoding = Column(Text, nullable=True)
    email = Column(String, nullable=True)
    name = Column(String, nullable=True) 


# 📦 2. Product Table Model (With Manual Shelf Location Data)
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    stock_quantity = Column(Integer, default=0)
    
    # 📍 Manual Warehouse Location Tracking Columns
    shelf_name = Column(String, default="Main Floor")  # e.g., 'Shelf-A', 'Zone-B'
    row_number = Column(Integer, default=1)            # e.g., Row 1, Row 2


# 🛠️ Auto Creation Function for Database Structure Sync
def init_db():
    Base.metadata.create_all(bind=engine)

    # database.py example query
def get_available_stock(barcode):
    # Total IN - Total OUT logic
    query = "SELECT (SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) - SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END)) as stock FROM inventory WHERE barcode = ?"