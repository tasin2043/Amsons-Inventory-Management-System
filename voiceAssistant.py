import speech_recognition as sr
from gtts import gTTS
import pygame
import requests
import os
import time
import database as db

# Sound player ready kora
pygame.mixer.init()

def speak(text):
    """Text ke voice-e bodle speaker diye bolar function"""
    print(f"🤖 AI Assistant: {text}")
    try:
        tts = gTTS(text=text, lang='en')
        filename = "response.mp3"
        tts.save(filename)
        
        pygame.mixer.music.load(filename)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            time.sleep(0.1)
        
        pygame.mixer.music.unload()
        os.remove(filename)
    except Exception as e:
        print(f"❌ Sound Output Error: {e}")

# voiceAssistant.py er check_product_location function-ti eirkom hobe:
def check_product_location(product_name_query):
    session = db.SessionLocal()
    products = session.query(db.Product).all()
    found_product = None
    
    for prod in products:
        p_name = prod.name.lower()
        if p_name in product_name_query or any(word in product_name_query for word in p_name.split()):
            found_product = prod
            break
            
    if found_product and found_product.location:
        loc = found_product.location
        # 💡 prod.stock_quantity check kora holo
        reply = f"Yes Tasin, {found_product.name} is located in {loc.zone}, {loc.aisle}, {loc.shelf_number}. Current stock is {found_product.stock_quantity}."
        speak(reply)
    else:
        speak("I am sorry, I could not find that product in the warehouse database.")
        
    session.close()
def listen_command():
    """Mukher kotha shonar function"""
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("\n🎙️ Listening... Ask me where a product is! (e.g., 'Where is Logitech?')")
        recognizer.adjust_for_ambient_noise(source, duration=0.5)
        audio = recognizer.listen(source)

    try:
        query = recognizer.recognize_google(audio, language="en-US")
        print(f"🗣️ You said: {query}")
        return query.lower()
    except Exception:
        return None

def trigger_instant_voice_alert(item_name, stock_level):
    """Camera scanner line text trigger logic text sync processing model."""
    alert_text = f"Warning Tasin! The item {item_name} is running low on stock. Only {stock_level} units left!"
    speak(alert_text)

# ==========================================
# CORE EXECUTION ENTRY POINT (FIXED ENCAPSULATION)
# ==========================================
# wrapper-ti nishchit korbe jeno import korle uvicorn server block na hoy!
if __name__ == "__main__":
    print("⚡ Initializing Amsonstock AI Voice Assistant...")
    speak("Hello Tasin, Warehouse AI Voice Assistant is now active. How can I help you today?")

    while True:
        user_speech = listen_command()
        if user_speech:
            print(f"🔍 Processing your speech: {user_speech}")
            if "exit" in user_speech or "stop" in user_speech:
                speak("Goodbye Tasin. Closing the assistant.")
                break
            if "where is" in user_speech or "location" in user_speech or "find" in user_speech or "logitech" in user_speech or "mouse" in user_speech:
                check_product_location(user_speech)
        time.sleep(0.5)