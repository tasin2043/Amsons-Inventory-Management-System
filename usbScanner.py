import requests

API_URL = "http://127.0.0.1:8000/scan/"
LOGIN_URL = "http://127.0.0.1:8000/api/login" # main.py এর রাউট অনুযায়ী ঠিক করা হলো

def get_secure_token():
    try:
        payload = {'username': 'admin', 'password': 'admin123'}
        response = requests.post(LOGIN_URL, data=payload)
        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            print("🚨 Failed to retrieve Auth Token from Server.")
            return None
    except Exception as e:
        print(f"🚨 Connection Error during token acquisition: {e}")
        return None

def start_usb_scanner():
    token = get_secure_token()
    if not token:
        print("❌ Cannot start scanner without valid authorization!")
        return

    headers = {"Authorization": f"Bearer {token}"}
    print("🚀 Handheld USB Scanner Active & Authenticated!")
    print("💡 Scanner-ti computer-e connect korun ebong barcode scan kora shuru korun.")
    print("❌ Eii scanning window bondho korte chaile Keyboard-e 'Ctrl + C' chapun.\n")

    while True:
        try:
            barcode_data = input("📥 Ready to Scan (Scan a barcode now): ").strip()
            if not barcode_data:
                continue
                
            print(f"📦 Barcode Received: {barcode_data}")
            
            params = {
                "barcode": barcode_data,
                "action_type": "in",  
                "quantity": 1
            }
            
            response = requests.post(API_URL, params=params, headers=headers)
            
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