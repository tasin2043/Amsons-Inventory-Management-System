let registerWebcamInstance = null;
let currentAllocatedStaffId = ""; 

// Admin/management roles need a security code to select
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
                event.target.value = "staff"; // reset to default role
                displayNotification("⚠️ Security warning logs saved: Unauthorized admin upgrade attempt detected.", false);
            }
        } else if (selectedRole === "management") {
            alert("💼 MANAGEMENT NOTICE: Accessing High-Level System Corporate Clearance Nodes.");
            const authCodeInput = prompt("🔑 Enter Secure Management Verification Override Key:");
            
            if (authCodeInput === "9360") {
                displayNotification("✅ Management credentials matched. Access granted to structural role config.", true);
            } else {
                alert("❌ INVALID SECURITY KEY! Management privileges upgrade pipeline execution terminated.");
                event.target.value = "staff"; // reset to default role
                displayNotification("⚠️ System context warning logs saved: Verification mismatch on role change operation.", false);
            }
        }
    });
}

// Guided multi-angle Face ID enrollment: captures several head angles so
// recognition works reliably later under different lighting/angles.
const FACE_ENROLL_STEPS = [
    "Look straight at the camera",
    "Slowly turn your head to the LEFT",
    "Slowly turn your head to the RIGHT",
    "Tilt your head UP a little",
    "Tilt your head DOWN a little"
];
let capturedFacePhotos = [];

function openCameraModalUI() {
    const modalFrame = document.getElementById("cameraPopupModal");
    if(modalFrame) {
        openRightSlidePanel("cameraPopupModal");
        initializeWebcam();
    }
}

function closeCameraModalUI() {
    const modalFrame = document.getElementById("cameraPopupModal");
    if(modalFrame) {
        closeRightSlidePanel("cameraPopupModal");
        terminateWebcam();
    }
}

function renderFaceStepUi() {
    const stepRow = document.getElementById("faceStepRow");
    const stepText = document.getElementById("faceStepText");
    const dotsRow = document.getElementById("faceStepDots");
    const snapBtn = document.getElementById("captureSnapBtn");
    if(!stepRow || !stepText || !dotsRow) return;

    const step = capturedFacePhotos.length;
    stepRow.classList.remove("hidden");
    dotsRow.innerHTML = FACE_ENROLL_STEPS.map((_, i) =>
        `<span class="w-2 h-2 rounded-full ${i < step ? 'bg-[#E6B950]' : 'bg-zinc-700'}"></span>`
    ).join("");

    if (step < FACE_ENROLL_STEPS.length) {
        stepText.innerText = `Step ${step + 1} of ${FACE_ENROLL_STEPS.length}: ${FACE_ENROLL_STEPS[step]}`;
        if (snapBtn) snapBtn.innerText = `📸 CAPTURE PHOTO ${step + 1} / ${FACE_ENROLL_STEPS.length}`;
    }
}

async function initializeWebcam() {
    const videoElement = document.getElementById("webcamStream");
    const canvasElement = document.getElementById("photoCanvas");
    const snapBtn = document.getElementById("captureSnapBtn");
    const retakeBtn = document.getElementById("retakeAllBtn");
    const statusLabel = document.getElementById("faceStatus");

    capturedFacePhotos = [];
    if (retakeBtn) retakeBtn.classList.add("hidden");
    if (statusLabel) {
        statusLabel.innerText = "Face Scan Required";
        statusLabel.className = "mt-2 text-gray-400 text-xs font-mono";
    }

    try {
        if(canvasElement) canvasElement.classList.add("hidden");
        if(videoElement) videoElement.classList.remove("hidden");

        registerWebcamInstance = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
            audio: false
        });
        videoElement.srcObject = registerWebcamInstance;

        if(snapBtn) {
            snapBtn.classList.remove("hidden");
            snapBtn.disabled = false;
        }
        renderFaceStepUi();
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
    const retakeBtn = document.getElementById("retakeAllBtn");
    const statusLabel = document.getElementById("faceStatus");

    if(!videoElement || !canvasElement) return;

    const context = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    capturedFacePhotos.push(canvasElement.toDataURL("image/jpeg", 0.92));
    if(hiddenInput) hiddenInput.value = capturedFacePhotos[0];

    if (capturedFacePhotos.length >= FACE_ENROLL_STEPS.length) {
        // All angles captured - freeze last frame as preview and stop the camera
        videoElement.classList.add("hidden");
        canvasElement.classList.remove("hidden");
        terminateWebcam();

        if (snapBtn) snapBtn.classList.add("hidden");
        if (retakeBtn) retakeBtn.classList.remove("hidden");

        if(statusLabel) {
            statusLabel.innerText = `✔ ${capturedFacePhotos.length} angles captured for Face ID`;
            statusLabel.className = "mt-2 text-emerald-400 text-xs font-bold uppercase tracking-widest";
        }

        renderFaceStepUi();
        setTimeout(() => { closeCameraModalUI(); }, 1200);
    } else {
        // Camera stays on, move to the next angle
        renderFaceStepUi();
        if(statusLabel) {
            statusLabel.innerText = `✔ Photo ${capturedFacePhotos.length} captured - keep going`;
            statusLabel.className = "mt-2 text-emerald-400 text-xs font-bold uppercase tracking-widest";
        }
    }
}

function retakeAllSnapshots() {
    const hiddenInput = document.getElementById("capturedPhotoData");
    if (hiddenInput) hiddenInput.value = "";
    initializeWebcam();
}

function terminateWebcam() {
    if (registerWebcamInstance) {
        registerWebcamInstance.getTracks().forEach(track => track.stop());
        registerWebcamInstance = null;
    }
}

// Register form submit handler
document.getElementById("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const allocatedStaffId = document.getElementById("liveAllocatedIdDisplay").innerText;
    const staffRealName = document.getElementById("regName").value.trim();
    const staffEmailAddress = document.getElementById("regEmail").value.trim();
    const rawInputPassword = document.getElementById("registerPassword").value.trim();
    const accountRolePermission = document.getElementById("registerRole").value;

    const strongPasswordRegex = /^\d{4}$/;  // PIN must be exactly 4 digits

    if (!strongPasswordRegex.test(rawInputPassword)) {
        displayNotification("PIN matrix mismatch! Ensure your PIN is exactly 4 digits long and contains only numbers.", false);
        return;
    }

    if (capturedFacePhotos.length < FACE_ENROLL_STEPS.length) {
        displayNotification(`❌ Face verification incomplete! Capture all ${FACE_ENROLL_STEPS.length} Face ID angles first.`, false);
        return;
    }

    try {
        const registrationPayloadData = new FormData();
        registrationPayloadData.append("staff_id", allocatedStaffId);
        registrationPayloadData.append("name", staffRealName);
        registrationPayloadData.append("email", staffEmailAddress);
        registrationPayloadData.append("password", rawInputPassword);
        registrationPayloadData.append("role", accountRolePermission);
        capturedFacePhotos.forEach(photo => registrationPayloadData.append("facePhotos", photo));

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
            capturedFacePhotos = [];

            const faceLabel = document.getElementById("faceStatus");
            if(faceLabel) {
                faceLabel.innerText = "Face Scan Required";
                faceLabel.className = "mt-2 text-gray-400 text-xs font-mono";
            }
            const stepRow = document.getElementById("faceStepRow");
            if (stepRow) stepRow.classList.add("hidden");
            const retakeBtn = document.getElementById("retakeAllBtn");
            if (retakeBtn) retakeBtn.classList.add("hidden");

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

async function initializeRegistrationFormUI() {
    try {
        const response = await fetch(`${apiUrl}/api/next-staff-id`);
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            document.getElementById("liveAllocatedIdDisplay").innerText = data.next_id;
        }
    } catch (err) {
        console.error("System staff tracking directories network connectivity issue:", err);
    }
}