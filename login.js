// login.js - handles login (manual PIN + Face ID)

let loginWebcamInstance = null;
let scanningCycleTimeoutId = null;
let loginFaceScanBusy = false;

// Poll one frame at a time for Face ID, same as the Till's Face ID
const FACE_SCAN_POLL_INTERVAL_MS = 800;

// AMS-0000 and AMS-Adm skip branch selection and go straight to the dashboard
const DIRECT_DASHBOARD_USERNAMES = ["AMS-0000", "AMS-ADM"];
function routeAfterLoginSuccess(username) {
    document.getElementById('authSection').classList.add('hidden');
    if (DIRECT_DASHBOARD_USERNAMES.includes((username || "").toUpperCase()) && typeof selectTerminalLocation === "function") {
        selectTerminalLocation('Amsons AlumRock');
    } else {
        document.getElementById('locationSection').classList.remove('hidden');
        if (document.getElementById('dashboardSection')) {
            document.getElementById('dashboardSection').classList.add('hidden');
        }
    }
}


async function loadAuthenticatedUserProfile(username) {
    try {
        const response = await fetch(`${apiUrl}/api/user-profile?username=${encodeURIComponent(username)}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            

            localStorage.setItem("user_role", userData.role); // sets 'staff' or 'management'
            localStorage.setItem("user_name", userData.name || "Staff Member");
            
            console.log("🔒 User Role Cached Successfully:", userData.role);
        }
    } catch (err) {
        console.error("Profile Configuration Mapping Sync Failed:", err);
    }
}

async function bootAutoFaceAuthentication() {
    const videoElement = document.getElementById("loginWebcamStream");
    const canvasElement = document.getElementById("loginPhotoCanvas");
    const statusLabel = document.getElementById("scannerStatusText");
    const faceOverlay = document.getElementById("aiFaceOverlay");

    if(!videoElement) return;

    if(canvasElement) canvasElement.classList.add("hidden");
    if(faceOverlay) faceOverlay.classList.add("hidden");
    videoElement.classList.remove("hidden");

    statusLabel.innerText = "👤 Scanning Face ID...";
    statusLabel.className = "text-sm text-amber-400 animate-pulse font-bold";

    try {
        loginWebcamInstance = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });
        videoElement.srcObject = loginWebcamInstance;

        if (scanningCycleTimeoutId) clearTimeout(scanningCycleTimeoutId);
        runFaceScanPollLoop();

    } catch (err) {
        console.warn("Camera blocked or missing channels:", err);
        statusLabel.innerText = "Camera Access Blocked";
    }
}

function executeManualCameraTrigger() {
    bootAutoFaceAuthentication();
}

function runFaceScanPollLoop() {
    if (!loginWebcamInstance) return;
    captureAndMatchFaceFrame();
    scanningCycleTimeoutId = setTimeout(runFaceScanPollLoop, FACE_SCAN_POLL_INTERVAL_MS);
}

async function captureAndMatchFaceFrame() {
    if (loginFaceScanBusy || !loginWebcamInstance) return;
    loginFaceScanBusy = true;

    const videoElement = document.getElementById("loginWebcamStream");
    const canvasElement = document.getElementById("loginPhotoCanvas");
    const statusLabel = document.getElementById("scannerStatusText");

    const trackingContext = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    trackingContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    const frame = canvasElement.toDataURL("image/jpeg", 0.8);

    try {
        const biometricPayload = new FormData();
        biometricPayload.append("frame", frame);

        const apiResponse = await fetch(`${apiUrl}/api/login-face`, {
            method: "POST",
            body: biometricPayload
        });

        const resultData = await apiResponse.json();
        loginFaceScanBusy = false;

        if (apiResponse.ok && resultData.status === "success") {
            clearTimeout(scanningCycleTimeoutId);
            shutdownFaceCamera();

            sessionToken = resultData.access_token;
            localStorage.setItem("access_token", sessionToken);

            displayNotification(resultData.message || "Face Verification Passed!", true);

            const decodedId = resultData.username || "admin";
            await loadAuthenticatedUserProfile(decodedId);

            routeAfterLoginSuccess(decodedId);
        } else if (statusLabel) {
            statusLabel.innerText = resultData.detail === "no_face"
                ? "Position your face in the frame..."
                : "Not recognized, keep looking...";
        }
    } catch (err) {
        loginFaceScanBusy = false;
        console.error("Face Match Routing Error:", err);
    }
}

function shutdownFaceCamera() {
    if (loginWebcamInstance) {
        loginWebcamInstance.getTracks().forEach(track => track.stop());
        loginWebcamInstance = null;
    }
    if (scanningCycleTimeoutId) {
        clearTimeout(scanningCycleTimeoutId);
        scanningCycleTimeoutId = null;
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

// ─── MANUAL LOGIN FORM HANDLER ───
document.getElementById("loginForm")?.addEventListener("submit", async function(e) {
    e.preventDefault();
    
    const uName = document.getElementById("loginUsername").value.trim();
    const pWord = document.getElementById("loginPassword").value.trim();

    const pinRegex = /^\d{4}$/;
    if (!pinRegex.test(pWord)) {
        displayNotification("Invalid PIN format! PIN must be exactly 4 digits long and contain only numbers.", false);
        return;
    }

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
            
            await loadAuthenticatedUserProfile(uName);

            routeAfterLoginSuccess(uName);
        } else {
            displayNotification(data.detail || "Invalid login credentials match trace.", false);
        }
    } catch (err) {
        console.error("Login Engine Crash:", err);
        displayNotification("Failed to reach core API database servers.", false);
    }
});