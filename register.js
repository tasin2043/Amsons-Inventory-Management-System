let registerWebcamInstance = null;
let currentAllocatedStaffId = ""; // Generated Staff ID store korar variable

// Camera trigger for registration
async function initializeWebcam() {
    const videoElement = document.getElementById("webcamStream");
    const startBtn = document.getElementById("startCamBtn");
    const snapBtn = document.getElementById("captureSnapBtn");

    try {
        registerWebcamInstance = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoElement.srcObject = registerWebcamInstance;
        
        videoElement.classList.remove("hidden");
        startBtn.classList.add("hidden");
        snapBtn.classList.remove("hidden");
    } catch (error) {
        displayNotification("Camera connection blocked. Please grant browser physical layer permissions.", false);
    }
}

function captureSnapshot() {
    const videoElement = document.getElementById("webcamStream");
    const canvasElement = document.getElementById("photoCanvas");
    const hiddenInput = document.getElementById("capturedPhotoData");
    const snapBtn = document.getElementById("captureSnapBtn");

    const context = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // Draw and capture the static matrix frame layer
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    const base64Data = canvasElement.toDataURL("image/jpeg");
    hiddenInput.value = base64Data; // Bind base64 payload data metrics

    // Toggle viewport screens
    videoElement.classList.add("hidden");
    canvasElement.classList.remove("hidden");
    snapBtn.innerText = "📸 Snapshot Captured Successfully!";
    snapBtn.disabled = true;
    
    if (registerWebcamInstance) {
        registerWebcamInstance.getTracks().forEach(track => track.stop());
    }
}

function terminateWebcam() {
    if (registerWebcamInstance) {
        registerWebcamInstance.getTracks().forEach(track => track.stop());
        registerWebcamInstance = null;
    }
}

// 📌 PASSWORD VALIDATED SUBMIT HANDLER: Direct payload mapping with main.py endpoints
document.getElementById("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    // Mapping fields matching perfectly with updated index.html specifications IDs
    const allocatedStaffId = document.getElementById("liveAllocatedIdDisplay").innerText;
    const staffRealName = document.getElementById("regName").value.trim();
    const staffEmailAddress = document.getElementById("regEmail").value.trim();
    const rawInputPassword = document.getElementById("registerPassword").value.trim();
    const accountRolePermission = document.getElementById("registerRole").value;
    const base64FaceSnapshot = document.getElementById("capturedPhotoData").value;

    // Secure Strong Password validation verification schema rules metrics regex
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
    
    if (!strongPasswordRegex.test(rawInputPassword)) {
        displayNotification("Password matrix rule mismatch! Ensure capitalization, digits, symbols criteria are filled.", false);
        return;
    }

    try {
        // Build the correct standard multi-part payload structure to match FastAPI Form(...) parameters
        const registrationPayloadData = new FormData();
        registrationPayloadData.append("staff_id", allocatedStaffId);
        registrationPayloadData.append("name", staffRealName);
        registrationPayloadData.append("email", staffEmailAddress);
        registrationPayloadData.append("password", rawInputPassword);
        registrationPayloadData.append("role", accountRolePermission);
        
        if (base64FaceSnapshot) {
            registrationPayloadData.append("facePhoto", base64FaceSnapshot);
        }

        displayNotification("Encrypting and saving user profile configuration pipeline to database...", true);

        const networkResponse = await fetch(`${apiUrl}/api/register-staff`, {
            method: "POST",
            body: registrationPayloadData
        });

        const logDataResult = await networkResponse.json();

        if (networkResponse.ok) {
            displayNotification(`Registration Successful! Identity bound to ID: ${allocatedStaffId}. Please log in now.`, true);
            
            // Clear out form text boxes layout attributes parameters values
            document.getElementById("registerForm").reset();
            document.getElementById("capturedPhotoData").value = "";
            document.getElementById("photoCanvas").classList.add("hidden");
            document.getElementById("webcamStream").classList.add("hidden");
            document.getElementById("startCamBtn").classList.remove("hidden");
            document.getElementById("captureSnapBtn").innerText = "Take Snapshot";
            document.getElementById("captureSnapBtn").disabled = false;

            // Automatically switch view panel layer back to login block layout parameters context
            setTimeout(() => {
                toggleAuthMode(false);
            }, 3000);
        } else {
            displayNotification(logDataResult.detail || "Registration processing firewall rejected the connection request.");
        }
    } catch (apiErrorTracer) {
        console.error("Staff registration system exception tracking breakdown:", apiErrorTracer);
        displayNotification("Failed to contact centralized database access authentication mapping servers.");
    }
});

// 🔄 1. Load Next ID & Trigger Voice Guidance Automatically
async function initializeRegistrationFormUI() {
    try {
        const response = await fetch(`${apiUrl}/api/next-staff-id`);
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            // Live numeric code display setup across layout tags
            document.getElementById("liveAllocatedIdDisplay").innerText = data.next_id;
        } else {
            console.error("Failed to allocate next matrix sequence id block.");
        }
    } catch (err) {
        console.error("System staff tracking directories network connectivity issue:", err);
    }
}

// 🗣️ 2. Slow and Clear English Instruction Voice Function
function announceVoiceGuidance() {
    if ('speechSynthesis' in window) {
        const instructionText = "Please note down the User I D displayed above. You will need this I D along with your password to login to the system.";
        
        const voiceUtterance = new SpeechSynthesisUtterance(instructionText);
        voiceUtterance.lang = 'en-US';   // Standard US Accent
        voiceUtterance.rate = 0.85;      // Made it slow (1.0 is standard speed)
        voiceUtterance.pitch = 1.0;     
        
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(voiceUtterance);
    }
}

// 🚀 3. Form Open/Click event hook link handler
// Note: index.html block layout configuration functions trigger direct tracking link hook
if (document.getElementById("goToRegisterBtn")) {
    document.getElementById("goToRegisterBtn").addEventListener("click", () => {
        // Dynamic swap viewports layer system
        initializeRegistrationFormUI(); 
    });
}

// 📌 4. DYNAMIC ROLE SELECTION LISTENER: Popup prompt block alert inside registration setup
if (document.getElementById("registerRole")) {
    document.getElementById("registerRole").addEventListener("change", (event) => {
        const selectedRole = event.target.value;

        if (selectedRole === "admin") {
            // Display alert notification system context interface trigger
            alert(
                "🛡️ SYSTEM NOTICE: System Control will authorize your access.\n\n" +
                "⚠️ ATTENTION:\nIf you are a standard Staff member, please do not attempt to gain access to the Admin Panel. Unauthorized access logs are fully audited."
            );
            
            // Custom shared notification strip block configuration inside index.html for extra clean alert look
            displayNotification(
                "🛡️ Admin security verification pending approval. If you are Staff, do not proceed with Admin elevation rules.", 
                false
            );
        } else {
            // Optional: If user switches back to staff, clean previous warning notices logs
            document.getElementById("authMessage").classList.add("hidden");
        }
    });
}