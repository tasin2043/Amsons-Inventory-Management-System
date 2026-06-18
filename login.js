function speakWelcomeMessage() {
    const message = new SpeechSynthesisUtterance("Welcome to Amsonstock Alumrock!");
    message.lang = 'en-GB';
    message.pitch = 1.0;
    message.rate = 1.0;
    window.speechSynthesis.speak(message);
}

let loginWebcamInstance = null;
let scanningCycleIntervalId = null;
let currentFailedAttemptsCount = 0;

const MAX_AUTOMATIC_SCANS_LIMIT = 5; 
const SCAN_INTERVAL_DELAY_MS = 2500; 

// Auto Initialization
async function bootAutoFaceAuthentication() {
    const videoElement = document.getElementById("loginWebcamStream");
    const canvasElement = document.getElementById("loginPhotoCanvas");
    const statusLabel = document.getElementById("scannerStatusText");
    const toggleBtn = document.getElementById("toggleScanStateBtn");
    const badgeNotice = document.getElementById("fallbackNoticeBadge");

    if(!videoElement) return;

    badgeNotice.classList.add("hidden");
    canvasElement.classList.add("hidden");
    videoElement.classList.remove("hidden");
    document.getElementById("scannerOverlayLine").classList.remove("hidden");
    
    currentFailedAttemptsCount = 0;
    statusLabel.innerText = "👤 Scanning Face ID Automatically...";
    statusLabel.className = "text-xs font-semibold text-amber-400 animate-pulse uppercase tracking-wider mb-2";
    toggleBtn.innerText = "Pause Auto Scanning";

    try {
        loginWebcamInstance = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoElement.srcObject = loginWebcamInstance;
        
        clearInterval(scanningCycleIntervalId);
        scanningCycleIntervalId = setInterval(() => {
            executeBackgroundBiometricCapture();
        }, SCAN_INTERVAL_DELAY_MS);

    } catch (err) {
        console.warn("Camera blocked or missing.");
        silentShutdownScanUI("Camera Access Blocked");
    }
}

// Background snapshot processor with Active Dynamic Token Parsing
async function executeBackgroundBiometricCapture() {
    const videoElement = document.getElementById("loginWebcamStream");
    const canvasElement = document.getElementById("loginPhotoCanvas");
    const statusLabel = document.getElementById("scannerStatusText");

    if (!loginWebcamInstance || currentFailedAttemptsCount >= MAX_AUTOMATIC_SCANS_LIMIT) return;

    currentFailedAttemptsCount++;
    statusLabel.innerText = `👁️ Analyzing Face Matrix (${currentFailedAttemptsCount}/${MAX_AUTOMATIC_SCANS_LIMIT})...`;

    const trackingContext = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    trackingContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    const base64SnapshotPayload = canvasElement.toDataURL("image/jpeg");

    const biometricPayload = new FormData();
    biometricPayload.append("facePhoto", base64SnapshotPayload);

    try {
        const apiResponse = await fetch(`${apiUrl}/api/login-face`, {
            method: "POST",
            body: biometricPayload
        });

        const resultData = await apiResponse.json();
        
        if (!apiResponse.ok) {
            throw new Error(resultData.detail || "Identity mismatch.");
        }

        if (resultData.status !== "success") { 
            throw new Error(resultData.detail || "Face not recognized.");
        }

        // 🎯 ✅ UNIQUE MATRIX MATCHED & ACCESS UNLOCKED!
        statusLabel.innerText = "✅ IDENTITY MATRIX MATCHED!";
        statusLabel.className = "text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2";
        
        clearInterval(scanningCycleIntervalId);
        shutdownAutoLoginStream();
        
        // Dynamic Token Capture matching exactly with Backend Response
        sessionToken = resultData.access_token;

        // ─── 🛡️ DYNAMIC DASHBOARD ROUTING ENGINE CORE FOR FACE LOGIN ───
        const base64Url = sessionToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const userDataClaims = JSON.parse(jsonPayload);
        const userRole = userDataClaims.role; 

        // Welcome Voice Assistant Alert
        speakWelcomeMessage(); 

        setTimeout(() => {
            // Switch screen viewport layers
            document.getElementById("authSection").classList.add("hidden");
            document.getElementById("dashboardSection").classList.remove("hidden");

            // 🔥 FIX: Face recognition profile loader trigger hook
            if (typeof loadAuthenticatedUserProfile === "function") {
                loadAuthenticatedUserProfile(userDataClaims.sub); 
            }

            // Role onujayi dashboard dynamic layout view handling toggle kora
            if (userRole === "admin") {
                displayNotification("Welcome Super Admin! System Management Controls fully enabled.", true);
                if (document.getElementById("adminControlsContainer")) {
                    document.getElementById("adminControlsContainer").classList.remove("hidden");
                }
            } else {
                displayNotification(`Staff Access Granted. Assigned ID: ${userDataClaims.sub}`, true);
                if (document.getElementById("adminControlsContainer")) {
                    document.getElementById("adminControlsContainer").classList.add("hidden");
                }
            }

            if (typeof fetchInventoryData === "function") fetchInventoryData();
        }, 1000);

    } catch (error) {
        console.error("Biometric block raw error:", error.message);
        
        if (currentFailedAttemptsCount >= MAX_AUTOMATIC_SCANS_LIMIT) {
            document.getElementById("fallbackNoticeBadge").classList.remove("hidden");
            silentShutdownScanUI("Face ID Match Failed");
        }
    }
}

function silentShutdownScanUI(statusTextLog) {
    clearInterval(scanningCycleIntervalId);
    shutdownAutoLoginStream();
    const statusLabel = document.getElementById("scannerStatusText");
    statusLabel.innerText = `🛑 ${statusTextLog}`;
    statusLabel.className = "text-xs font-bold text-red-500 uppercase tracking-wider mb-2";
    document.getElementById("scannerOverlayLine").classList.add("hidden");
    document.getElementById("toggleScanStateBtn").innerText = "Restart Face Scanner 🔄";
}

function handleScanStateToggle() {
    console.log("Toggle clicked. Current status:", scanningCycleIntervalId);
    
    clearInterval(scanningCycleIntervalId);
    scanningCycleIntervalId = null;
    shutdownAutoLoginStream();
    
    const statusLabel = document.getElementById("scannerStatusText");
    statusLabel.innerText = "🔄 RESTARTING...";
    statusLabel.className = "text-xs font-semibold text-amber-400 animate-pulse uppercase tracking-wider mb-2";
    
    setTimeout(() => {
        bootAutoFaceAuthentication();
    }, 500);
}

function shutdownAutoLoginStream() {
    if (loginWebcamInstance) {
        loginWebcamInstance.getTracks().forEach(track => track.stop());
        loginWebcamInstance = null;
    }
}

// 📌 MODIFIED SECURE MANUAL PASSWORD SUBMISSION LOGISTICS WITH ROLE ROUTING
document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const userInput = document.getElementById("loginUsername").value;
    const passwordInput = document.getElementById("loginPassword").value;

    try {
        let formPayload = new URLSearchParams();
        formPayload.append("username", userInput);
        formPayload.append("password", passwordInput);

        const loginResponse = await fetch(`${apiUrl}/api/login`, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formPayload
        });

        if (loginResponse.ok) {
            const tokenData = await loginResponse.json();
            
            if (typeof faceTimeoutTimer !== 'undefined') clearTimeout(faceTimeoutTimer);
            if (typeof faceScanTimer !== 'undefined') clearInterval(faceScanTimer);
            if (typeof terminateLoginWebcam === "function") terminateLoginWebcam();

            sessionToken = tokenData.access_token;
            displayNotification("System access unlocked success!", true);
            
            // ─── 🛡️ DYNAMIC DASHBOARD ROUTING ENGINE CORE ───
            const base64Url = sessionToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            const userDataClaims = JSON.parse(jsonPayload);
            const userRole = userDataClaims.role; 

            // Switch screen viewport layers
            document.getElementById("authSection").classList.add("hidden");
            document.getElementById("dashboardSection").classList.remove("hidden");
            
            // 🔥 Manual profile loader trigger hook
            if (typeof loadAuthenticatedUserProfile === "function") {
                loadAuthenticatedUserProfile(userDataClaims.sub); 
            }
            
            // Role onujayi dashboard layout section toggle kora
            if (userRole === "admin") {
                displayNotification("Welcome Super Admin! System Management Controls fully enabled.", true);
                if (document.getElementById("adminControlsContainer")) {
                    document.getElementById("adminControlsContainer").classList.remove("hidden");
                }
            } else {
                displayNotification(`Staff Access Granted. Assigned ID: ${userDataClaims.sub}`, true);
                if (document.getElementById("adminControlsContainer")) {
                    document.getElementById("adminControlsContainer").classList.add("hidden");
                }
            }
            
            if (typeof fetchInventoryData === "function") fetchInventoryData();
        } else {
            const errorDetails = await loginResponse.json();
            displayNotification(errorDetails.detail || "Invalid authorization credentials.");
        }
    } catch (err) {
        console.error("Manual system login breakdown:", err);
        displayNotification("Failed to contact authorized security authentication servers.");
    }
});

// ─── 🔑 FORGOT PASSWORD COMPONENT DOM TOGGLER ROUTING INTERFACE CONTROLLER ───
function displayForgotPasswordUIHandler(shouldDisplay) {
    const manualFormFields = document.getElementById("loginForm");
    const resetFormBoxView = document.getElementById("forgotPasswordContainerBox");
    const biometricBoxContainer = document.getElementById("biometricScanContainer");

    if (shouldDisplay) {
        if (resetFormBoxView) resetFormBoxView.classList.remove("hidden");
        if (biometricBoxContainer) biometricBoxContainer.classList.add("hidden");
        
        if (typeof clearInterval === "function" && typeof scanningCycleIntervalId !== "undefined") {
            clearInterval(scanningCycleIntervalId);
        }
        if (typeof shutdownAutoLoginStream === "function") shutdownAutoLoginStream();
    } else {
        if (resetFormBoxView) resetFormBoxView.classList.add("hidden");
        if (biometricBoxContainer) biometricBoxContainer.classList.remove("hidden");
        
        if (typeof bootAutoFaceAuthentication === "function") bootAutoFaceAuthentication();
    }
}

// ─── 🛠️ ASYNC SECURITY FIREWALL API HANDLER FOR CREDENTIALS RE-ROUTING RESET ───
async function executeSecurePasswordResetPipeline() {
    const targetStaffId = document.getElementById("forgotStaffIdInput").value.trim();
    const targetEmailAddress = document.getElementById("forgotEmailInput").value.trim();

    if (!targetStaffId || !targetEmailAddress) {
        displayNotification("Please fill in both Staff ID and registered Email fields.", false);
        return;
    }

    try {
        const payloadDataFields = new FormData();
        payloadDataFields.append("staff_id", targetStaffId);
        payloadDataFields.append("email_address", targetEmailAddress);

        displayNotification("Auditing security directories credentials trace match...", true);

        const resetResponse = await fetch(`${apiUrl}/api/forgot-password-trigger`, {
            method: "POST",
            body: payloadDataFields
        });

        const dataResponseLogs = await resetResponse.json();

        if (resetResponse.ok) {
            displayNotification(`Security Key Verified! Temporary Password set to: ${dataResponseLogs.temporary_access_key}. Please log in manually and update credentials profiles immediately.`, true);
            
            document.getElementById("loginUsername").value = targetStaffId;
            document.getElementById("loginPassword").value = dataResponseLogs.temporary_access_key;
            
            displayForgotPasswordUIHandler(false);
        } else {
            throw new Error(dataResponseLogs.detail || "Database profile context record validation mismatched fallback failure logs.");
        }
    } catch (apiErrorLog) {
        displayNotification(apiErrorLog.message, false);
    }
}