from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fake test data
PRODUCT_DATABASE = {
    "12345": {"name": "Thobe 101 Size 54", "location": "Zone A, Shelf A1", "stock": 9},
    "123456": {"name": "Thobe 106 Size 56", "location": "Zone A, Shelf A2", "stock": 5},
}

class ScanRequest(BaseModel):
    barcode: str
    action: str

@app.post("/scan")
def scan_product(request: ScanRequest):
    barcode = request.barcode
    if barcode in PRODUCT_DATABASE:
        if request.action == "IN":
            PRODUCT_DATABASE[barcode]["stock"] += 1
        elif request.action == "OUT" and PRODUCT_DATABASE[barcode]["stock"] > 0:
            PRODUCT_DATABASE[barcode]["stock"] -= 1
        return {"status": "success", "data": PRODUCT_DATABASE[barcode]}
    return {"status": "error", "message": "Product Not Found"}