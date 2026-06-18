from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from database import Base # Assuming your database session setup configuration engine link

# 🏛️ 1. DYNAMIC STOREROOM MANAGEMENT REGISTRY TABLE
class StoreroomZone(Base):
    __tablename__ = "storeroom_zones"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # e.g., "Store Room 1", "Store Room 2"
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship configuration back-populate tracking targets parameters link
    items = relationship("InventoryItem", back_populates="storeroom")


# 📦 2. SYSTEM CORE CORE INVENTORY PRODUCTS REGISTRY LAYERS SCHEMA
class InventoryItem(Base):
    __tablename__ = "inventory_items"
    
    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, unique=True, index=True) # Unique Key parameter reference identification
    name = Column(String, index=True)
    size = Column(String, nullable=True)     # Auto filled by computer vision text parameters tracking or Manual Override 
    weight = Column(String, nullable=True)   # e.g., "500g", "1 Litre", "Pack of 4"
    shelf_location = Column(String, nullable=True) # e.g., "Shelf-B | Row 2"
    available_stock = Column(Integer, default=0)
    
    # ForeignKey linking directory targets to physical customizable dynamic storerooms matrix
    storeroom_id = Column(Integer, ForeignKey("storeroom_zones.id"))
    
    storeroom = relationship("StoreroomZone", back_populates="items")