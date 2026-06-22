let registerWebcamInstance = null;
let currentAllocatedStaffId = ""; 

// 🧠 1. ROLE BLOCKING FIREWALL PATTERNS INTEGRATION PIPELINE
if (document.getElementById("registerRole")) {
    document.getElementById("registerRole").addEventListener("change", (event) => {
        const selectedRole = event.target.value;

        if (selectedRole === "admin") {
            alert("🛡️ SYSTEM NOTICE: Accessing Restricted System Administration Role Node.");
            const authCodeInput = prompt("🔑 Enter Secure Administrative Verification Override Key:");
            
            if (authCodeInput === "0693") {
                displayNotification("✅ Admin authorization verified. Access granted to select role schema.", true);
            } else {
                alert("❌ INVALID SECURITY KEY! Access to Administrator clearance level has been rejected.");
                event.target.value = "staff"; // Downgrade mapping fallback structure reset
                displayNotification("⚠️ Security warning logs saved: Unauthorized admin upgrade attempt detected.", false);
            }
        } else if (selectedRole === "management") {
            alert("💼 MANAGEMENT NOTICE: Accessing High-Level System Corporate Clearance Nodes.");
            const authCodeInput = prompt("🔑 Enter Secure Management Verification Override Key:");
            
            if (authCodeInput === "9360") {
                displayNotification("✅ Management credentials matched. Access granted to structural role config.", true);
            } else {
                alert("❌ INVALID SECURITY KEY! Management privileges upgrade pipeline execution terminated.");
                event.target.value = "staff"; // Reset to standard fallback
                displayNotification("⚠️ System context warning logs saved: Verification mismatch on role change operation.", false);
            }
        }
    });
}

// 📸 2. SMART MODAL POPUP GATEWAY CONTROLLER ENGINE HANDLERS
function openCameraModalUI() {
    const modalFrame = document.getElementById("cameraPopupModal");
    if(modalFrame) {
        modalFrame.classList.remove("hidden");
        initializeWebcam(); 
    }
}

// Fixed camera UI modal termination triggers
function closeCameraModalUI() {
    const modalFrame = document.getElementById("cameraPopupModal");
    if(modalFrame) {
        modalFrame.classList.add("hidden");
        terminateWebcam();
    }
}

// Camera initialization routing parameters (Synced square capture limits)
async function initializeWebcam() {
    const videoElement = document.getElementById("webcamStream");
    const canvasElement = document.getElementById("photoCanvas");
    const snapBtn = document.getElementById("captureSnapBtn");

    try {
        if(canvasElement) canvasElement.classList.add("hidden");
        if(videoElement) videoElement.classList.remove("hidden");

        registerWebcamInstance = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 480, height: 480 }, 
            audio: false 
        });
        videoElement.srcObject = registerWebcamInstance;
        
        if(snapBtn) {
            snapBtn.classList.remove("hidden");
            snapBtn.innerText = "📸 CAPTURE MATRIX SNAPSHOT";
            snapBtn.disabled = false;
        }
    } catch (error) {
        console.error("Camera interface deployment error tracker log:", error);
        displayNotification("Camera connection blocked. Please grant browser physical layer permissions.", false);
        closeCameraModalUI();
    }
}

function captureSnapshot() {
    const videoElement = document.getElementById("webcamStream");
    const canvasElement = document.getElementById("photoCanvas");
    const hiddenInput = document.getElementById("capturedPhotoData");
    const snapBtn = document.getElementById("captureSnapBtn");
    const statusLabel = document.getElementById("faceStatus");

    if(!videoElement || !canvasElement) return;

    const context = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth || 480;
    canvasElement.height = videoElement.videoHeight || 480;
    
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    const base64Data = canvasElement.toDataURL("image/jpeg", 0.90);
    if(hiddenInput) hiddenInput.value = base64Data; 

    videoElement.classList.add("hidden");
    canvasElement.classList.remove("hidden");
    
    if(statusLabel) {
        statusLabel.innerText = "📸 Snapshot Template Locked in Framework State!";
        statusLabel.className = "mt-2 text-emerald-400 text-xs font-bold uppercase tracking-widest animate-pulse";
    }
    
    if(snapBtn) {
        snapBtn.innerText = "✓ TEMPLATE STORED!";
        snapBtn.disabled = true;
    }
    
    terminateWebcam();
    
    setTimeout(() => {
        closeCameraModalUI();
    }, 1200);
}

function terminateWebcam() {
    if (registerWebcamInstance) {
        registerWebcamInstance.getTracks().forEach(track => track.stop());
        registerWebcamInstance = null;
    }
}

// 📌 SUBMIT PIPELINE ENGINE HANDLER WITH FASTAPI ROUTING ARCHITECTURE
document.getElementById("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const allocatedStaffId = document.getElementById("liveAllocatedIdDisplay").innerText;
    const staffRealName = document.getElementById("regName").value.trim();
    const staffEmailAddress = document.getElementById("regEmail").value.trim();
    const rawInputPassword = document.getElementById("registerPassword").value.trim();
    const accountRolePermission = document.getElementById("registerRole").value;
    const base64FaceSnapshot = document.getElementById("capturedPhotoData").value;

    const exactFourDigitPinRegex = /^\d{4}$/;
    
    if (!exactFourDigitPinRegex.test(rawInputPassword)) {
        displayNotification("❌ Security rule mismatch! PIN must be exactly 4 numeric digits.", false);
        return;
    }

    if (!base64FaceSnapshot) {
        displayNotification("❌ Face verification identity trace missing! Run camera pipeline capture first.", false);
        return;
    }

    try {
        const registrationPayloadData = new FormData();
        registrationPayloadData.append("staff_id", allocatedStaffId);
        registrationPayloadData.append("name", staffRealName);
        registrationPayloadData.append("email", staffEmailAddress);
        registrationPayloadData.append("password", rawInputPassword);
        registrationPayloadData.append("role", accountRolePermission);
        registrationPayloadData.append("facePhoto", base64FaceSnapshot);

        displayNotification("Encrypting and saving user profile configuration pipeline to database...", true);

        const networkResponse = await fetch(`${apiUrl}/api/register-staff`, {
            method: "POST",
            body: registrationPayloadData
        });

        const logDataResult = await networkResponse.json();

        if (networkResponse.ok) {
            displayNotification(`Registration Successful! Identity bound to ID: ${allocatedStaffId}. Please log in now.`, true);
            
            document.getElementById("registerForm").reset();
            if(document.getElementById("capturedPhotoData")) document.getElementById("capturedPhotoData").value = "";
            
            const faceLabel = document.getElementById("faceStatus");
            if(faceLabel) {
                faceLabel.innerText = "Face Scan Required";
                faceLabel.className = "mt-2 text-gray-400 text-xs font-mono";
            }

            // 🚀 FIXED: Auto routing container mapping fallback loop initialization
            setTimeout(() => {
                if (typeof toggleAuthMode === "function") {
                    toggleAuthMode(false); 
                } else {
                    const registerView = document.getElementById("registerFormContainer");
                    const landingView = document.getElementById("authLandingView");
                    if (registerView) registerView.classList.add("hidden");
                    if (landingView) landingView.classList.remove("hidden");
                }
            }, 2500);
        } else {
            displayNotification(logDataResult.detail || "Registration processing firewall rejected the connection request.", false);
        }
    } catch (apiErrorTracer) {
        console.error("Staff registration system exception tracking breakdown:", apiErrorTracer);
        displayNotification("Failed to contact centralized database access authentication mapping servers.", false);
    }
});

// ─── INITIALIZATION PIPELINE FOR SEQUENTIAL IDS ───
async function initializeRegistrationFormUI() {
    try {
        const response = await fetch(`${apiUrl}/api/next-staff-id`);
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            document.getElementById("liveAllocatedIdDisplay").innerText = data.next_id;
            announceVoiceGuidance(); 
        }
    } catch (err) {
        console.error("System staff tracking directories network connectivity issue:", err);
    }
}

if (document.getElementById("goToRegisterBtn")) {
    document.getElementById("goToRegisterBtn").addEventListener("click", () => {
        initializeRegistrationFormUI(); 
    });
}

function announceVoiceGuidance() {
    if ('speechSynthesis' in window) {
        const instructionText = "Please note down the User I D displayed above. You will need this I D along with your password to login to the system.";
        const voiceUtterance = new SpeechSynthesisUtterance(instructionText);
        voiceUtterance.lang = 'en-US';   
        voiceUtterance.rate = 0.85;      
        voiceUtterance.pitch = 1.0;     
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(voiceUtterance);
    }
}