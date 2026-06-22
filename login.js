// ==============================================================================================
// 🧠 AMSONSTOCK SECURE LOGISTIC GATEWAY BIOMETRIC PIPELINE LAYER (login.js)
// ==============================================================================================

function speakWelcomeMessage(accountUserName) {
    const sanitizedName = accountUserName || "Staff Member";
    const welcomeText = `Welcome ${sanitizedName}, to Amsons Inventory System`;
    
    const message = new SpeechSynthesisUtterance(welcomeText);
    message.lang = 'en-GB';
    message.pitch = 1.0;
    message.rate = 0.95; 
    window.speechSynthesis.speak(message);
}

let loginWebcamInstance = null;
let scanningCycleIntervalId = null;
let currentFailedAttemptsCount = 0;

const MAX_AUTOMATIC_SCANS_LIMIT = 5; 
const SCAN_INTERVAL_DELAY_MS = 2500; 

async function bootAutoFaceAuthentication() {
    const videoElement = document.getElementById("loginWebcamStream");
    const canvasElement = document.getElementById("loginPhotoCanvas");
    const statusLabel = document.getElementById("scannerStatusText");
    const faceOverlay = document.getElementById("aiFaceOverlay");

    if(!videoElement) return;

    if(canvasElement) canvasElement.classList.add("hidden");
    if(faceOverlay) faceOverlay.classList.add("hidden");
    videoElement.classList.remove("hidden");
    
    currentFailedAttemptsCount = 0;
    statusLabel.innerText = "👤 Scanning Face ID Automatically...";
    statusLabel.className = "text-sm text-amber-400 animate-pulse font-bold";

    try {
        loginWebcamInstance = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 640, height: 480 }, 
            audio: false 
        });
        videoElement.srcObject = loginWebcamInstance;
        
        if (scanningCycleIntervalId) clearInterval(scanningCycleIntervalId);
        scanningCycleIntervalId = setInterval(() => {
            executeBackgroundBiometricCapture();
        }, SCAN_INTERVAL_DELAY_MS);

    } catch (err) {
        console.warn("Camera blocked or missing channels:", err);
        statusLabel.innerText = "Camera Access Blocked";
    }
}

function executeManualCameraTrigger() {
    bootAutoFaceAuthentication();
}

async function executeBackgroundBiometricCapture() {
    const videoElement = document.getElementById("loginWebcamStream");
    const canvasElement = document.getElementById("loginPhotoCanvas");
    const statusLabel = document.getElementById("scannerStatusText");

    if (!loginWebcamInstance || currentFailedAttemptsCount >= MAX_AUTOMATIC_SCANS_LIMIT) {
        if(currentFailedAttemptsCount >= MAX_AUTOMATIC_SCANS_LIMIT) {
            statusLabel.innerText = "Face Scan limit reached. Use Employee ID.";
            shutdownFaceCamera();
        }
        return;
    }

    currentFailedAttemptsCount++;
    statusLabel.innerText = `👁️ Analyzing Face Matrix (${currentFailedAttemptsCount}/${MAX_AUTOMATIC_SCANS_LIMIT})...`;

    const trackingContext = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    trackingContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    const base64SnapshotPayload = canvasElement.toDataURL("image/jpeg", 0.85);

    try {
        const biometricPayload = new FormData();
        biometricPayload.append("facePhoto", base64SnapshotPayload);

        const apiResponse = await fetch(`${apiUrl}/api/login-face`, {
            method: "POST",
            body: biometricPayload
        });

        const resultData = await apiResponse.json();
        
        if (apiResponse.ok && resultData.status === "success") {
            clearInterval(scanningCycleIntervalId);
            shutdownFaceCamera();
            
            sessionToken = resultData.access_token;
            localStorage.setItem("access_token", sessionToken);
            
            displayNotification(resultData.message || "Face Verification Passed!", true);
            
           
            const decodedId = "admin"; 
            loadAuthenticatedUserProfile(decodedId);
        }
    } catch (err) {
        console.error("Face Match Routing Error:", err);
    }
}

function shutdownFaceCamera() {
    if (loginWebcamInstance) {
        loginWebcamInstance.getTracks().forEach(track => track.stop());
        loginWebcamInstance = null;
    }
    if (scanningCycleIntervalId) {
        clearInterval(scanningCycleIntervalId);
        scanningCycleIntervalId = null;
    }
}

function showManualLogin() {
    shutdownFaceCamera();

    if (document.getElementById("authLandingView")) {
        document.getElementById("authLandingView").classList.add("hidden");
    }
    
    if (document.getElementById("manualLoginContainer")) {
        document.getElementById("manualLoginContainer").classList.remove("hidden");
    }
}

function showFaceScan() {
    if (document.getElementById("manualLoginContainer")) {
        document.getElementById("manualLoginContainer").classList.add("hidden");
    }

    if (document.getElementById("authLandingView")) {
        document.getElementById("authLandingView").classList.remove("hidden");
    }
    
    if (document.getElementById("loginWebcamStream")) {
        document.getElementById("loginWebcamStream").classList.add("hidden");
    }
    if (document.getElementById("aiFaceOverlay")) {
        document.getElementById("aiFaceOverlay").classList.remove("hidden");
    }
    if (document.getElementById("scannerStatusText")) {
        document.getElementById("scannerStatusText").innerText = "Position your face within the frame";
    }
}
// ─── 📝 MANUAL CREDENTIALS FORM LOGIN HANDLER ───
document.getElementById("loginForm")?.addEventListener("submit", async function(e) {
    e.preventDefault();
    
    const uName = document.getElementById("loginUsername").value.trim();
    const pWord = document.getElementById("loginPassword").value.trim();

    try {
        const formData = new FormData();
        formData.append("username", uName);
        formData.append("password", pWord);

        const response = await fetch(`${apiUrl}/api/login`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.status === "success") {
            sessionToken = data.access_token;
            localStorage.setItem("access_token", sessionToken);
            
            displayNotification("Authentication Successful! Loading Hub...", true);
            
           
            loadAuthenticatedUserProfile(uName);
        } else {
            displayNotification(data.detail || "Invalid login credentials match trace.", false);
        }
    } catch (err) {
        console.error("Login Engine Crash:", err);
        displayNotification("Failed to reach core API database servers.", false);
    }
});