import requests

# Amader FastAPI server-er link
API_URL = "http://127.0.0.1:8000/scan/"

def start_usb_scanner():
    print("🚀 Handheld USB Scanner Active!")
    print("💡 Scanner-ti computer-e connect korun ebong barcode scan kora shuru korun.")
    print("❌ Eii scanning window bondho korte chaile Keyboard-e 'Ctrl + C' chapun.\n")

    while True:
        try:
            # System automatic input/scan text er jonno opekkha korbe
            barcode_data = input("📥 Ready to Scan (Scan a barcode now): ").strip()
            
            if not barcode_data:
                continue
                
            print(f"📦 Barcode Received: {barcode_data}")
            
            # FastAPI server-e data pathano
            params = {
                "barcode": barcode_data,
                "action_type": "in",  # Default amra stock 'in' dhore nicchi
                "quantity": 1
            }
            
            response = requests.post(API_URL, params=params)
            
            if response.status_code == 200:
                res_data = response.json()
                print(f"✅ Sync Success! Product: {res_data['product_name']} | New Stock: {res_data['updated_stock']}\n")
            else:
                print(f"⚠️ Server Error: {response.json().get('detail')}\n")
                
        except KeyboardInterrupt:
            print("\n👋 USB Scanner Stopped.")
            break
        except Exception as e:
            print(f"❌ Connection Error: {e}\n")

if __name__ == "__main__":
    start_usb_scanner()