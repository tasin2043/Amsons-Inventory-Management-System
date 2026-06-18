import cv2
from pyzbar.pyzbar import decode
import requests
import time

API_URL = "http://127.0.0.1:8000/scan/"
LOGIN_URL = "http://127.0.0.1:8000/login"

def get_secure_token():
    try:
        # FastAPI standard OAuth2 form-data pass kora holo token generate korar jonno
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

def scan_from_camera():
    token = get_secure_token()
    if not token:
        print("❌ Cannot start scanner without valid authorization!")
        return

    # Secure Bearer Header template initialization
    headers = {"Authorization": f"Bearer {token}"}

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    print("🚀 Secure Camera Scanner Active & Authorized!")
    print("❌ Off korar jonno 'q' chapun.\n")

    last_scanned_code = None
    last_scanned_time = 0
    display_text = "Ready to Scan (Authenticated)"
    display_color = (255, 255, 255)

    while True:
        success, frame = cap.read()
        if not success:
            break

        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        for barcode in decode(gray_frame):
            barcode_data = barcode.data.decode('utf-8')
            current_time = time.time()

            if barcode_data != last_scanned_code or (current_time - last_scanned_time > 2):
                params = {
                    "barcode": barcode_data,
                    "action_type": "out",  
                    "quantity": 1
                }
                
                try:
                    # 🔐 Headers parameter-e authorization token pass kora hocche
                    response = requests.post(API_URL, params=params, headers=headers)
                    if response.status_code == 200:
                        res_data = response.json()
                        product_name = res_data['product_name']
                        new_stock = res_data['updated_stock']
                        is_low = res_data.get('low_stock_warning', False)
                        
                        if is_low:
                            display_text = f"🚨 WARNING: {product_name} LOW! Stock: {new_stock}"
                            display_color = (0, 0, 255) # Red
                        else:
                            display_text = f"{product_name} | Stock: {new_stock}"
                            display_color = (0, 255, 0) # Green
                        print(f"✅ Secure Scan: {display_text}")
                    elif response.status_code == 401:
                        display_text = "Auth Token Expired or Invalid!"
                        display_color = (0, 0, 255)
                    else:
                        display_text = "Product Not Registered!"
                        display_color = (0, 0, 255)
                except Exception as e:
                    display_text = "Server Connection Error"
                    display_color = (0, 0, 255)

                last_scanned_code = barcode_data
                last_scanned_time = current_time

            pts = barcode.rect
            cv2.rectangle(frame, (pts.left, pts.top), (pts.left + pts.width, pts.top + pts.height), display_color, 3)

        cv2.rectangle(frame, (0, 0), (640, 50), (0, 0, 0), -1)
        cv2.putText(frame, display_text, (15, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.6, display_color, 2)
        cv2.imshow('Warehouse Intelligent Camera Dashboard', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    scan_from_camera()