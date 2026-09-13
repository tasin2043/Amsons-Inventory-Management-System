// attendance.js - public kiosk page for staff clock-in/out, no login needed.
// Staff are identified by face or Employee ID + PIN as fallback.

// Uses the current origin when served by the backend, otherwise falls back
// to the backend's own address (e.g. when opened via Live Server or file://)
const apiUrl = (window.location.protocol === "file:" || (window.location.port && window.location.port !== "8000"))
    ? "http://127.0.0.1:8000"
    : window.location.origin;

function showAttendanceToast(message, isSuccess) {
    const toast = document.getElementById("attendanceToast");
    const textEl = document.getElementById("attendanceToastText");
    if (!toast || !textEl) return;

    clearTimeout(window._attendanceToastTimer);
    clearTimeout(window._attendanceToastHideTimer);

    textEl.innerText = message;
    textEl.className = `px-5 py-3 ${isSuccess ? "text-emerald-400" : "text-red-400"}`;

    toast.classList.remove("hidden");
    toast.style.transition = "opacity 0.5s ease-out, transform 0.5s ease-out";
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translate(-50%, 0)";
    });

    window._attendanceToastTimer = setTimeout(() => {
        toast.style.transition = "opacity 2.4s ease-in, transform 2.4s ease-in";
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%, -16px)";
        window._attendanceToastHideTimer = setTimeout(() => toast.classList.add("hidden"), 2450);
    }, 2600);
}

let attendanceWebcamInstance = null;
let attendanceScanTimeoutId = null;
let attendanceFaceScanBusy = false;
let attendanceIdentifiedStaff = null;

// Poll one frame at a time for Face ID, same as login.js
const ATTENDANCE_SCAN_POLL_INTERVAL_MS = 800;

function resetAttendanceKioskToScan() {
    shutdownAttendanceCamera();
    attendanceIdentifiedStaff = null;
    document.getElementById("attendanceResultView")?.classList.add("hidden");
    document.getElementById("attendanceManualEntryView")?.classList.add("hidden");
    document.getElementById("attendanceScanView")?.classList.remove("hidden");
    document.getElementById("attendanceManualEntryForm")?.reset();

    const canvasEl = document.getElementById("attendancePhotoCanvas");
    const videoEl = document.getElementById("attendanceWebcamStream");
    const overlayEl = document.getElementById("attendanceFaceOverlay");
    canvasEl?.classList.add("hidden");
    videoEl?.classList.add("hidden");
    overlayEl?.classList.remove("hidden");

    const statusLabel = document.getElementById("attendanceScannerStatusText");
    if (statusLabel) {
        statusLabel.innerText = "Position your face within the frame";
        statusLabel.className = "text-gray-300 text-sm sm:text-base md:text-lg mb-6";
    }
}

function showAttendanceManualEntry() {
    shutdownAttendanceCamera();
    document.getElementById("attendanceScanView")?.classList.add("hidden");
    document.getElementById("attendanceResultView")?.classList.add("hidden");
    document.getElementById("attendanceManualEntryView")?.classList.remove("hidden");

    const statusLabel = document.getElementById("attendanceScannerStatusText");
    if (statusLabel) {
        statusLabel.innerText = "Enter your Employee ID and PIN";
        statusLabel.className = "text-gray-300 text-sm sm:text-base md:text-lg mb-6";
    }
}

document.getElementById("attendanceManualEntryForm")?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("attendanceManualUsername").value.trim();
    const password = document.getElementById("attendanceManualPassword").value.trim();
    const statusLabel = document.getElementById("attendanceScannerStatusText");

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("password", password);

        const response = await fetch(`${apiUrl}/api/attendance/identify-credentials`, { method: "POST", body: payload });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            showAttendanceIdentifiedResult(data);
        } else if (statusLabel) {
            statusLabel.innerText = data.detail || "Invalid Employee ID or PIN.";
            statusLabel.className = "text-red-400 text-sm sm:text-base md:text-lg mb-6 font-bold";
        }
    } catch (err) {
        console.error("Attendance manual entry error:", err);
        if (statusLabel) statusLabel.innerText = "Could not verify credentials.";
    }
});

async function bootAttendanceFaceScan() {
    const videoElement = document.getElementById("attendanceWebcamStream");
    const canvasElement = document.getElementById("attendancePhotoCanvas");
    const statusLabel = document.getElementById("attendanceScannerStatusText");
    const faceOverlay = document.getElementById("attendanceFaceOverlay");

    if (!videoElement) return;

    canvasElement?.classList.add("hidden");
    faceOverlay?.classList.add("hidden");
    videoElement.classList.remove("hidden");

    if (statusLabel) {
        statusLabel.innerText = "👤 Scanning Face ID...";
        statusLabel.className = "text-amber-400 text-sm sm:text-base md:text-lg mb-6 animate-pulse font-bold";
    }

    try {
        attendanceWebcamInstance = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });
        videoElement.srcObject = attendanceWebcamInstance;

        if (attendanceScanTimeoutId) clearTimeout(attendanceScanTimeoutId);
        runAttendanceScanPollLoop();
    } catch (err) {
        console.warn("Camera blocked or missing channels:", err);
        if (statusLabel) statusLabel.innerText = "Camera Access Blocked";
    }
}

function runAttendanceScanPollLoop() {
    if (!attendanceWebcamInstance) return;
    captureAndMatchAttendanceFrame();
    attendanceScanTimeoutId = setTimeout(runAttendanceScanPollLoop, ATTENDANCE_SCAN_POLL_INTERVAL_MS);
}

async function captureAndMatchAttendanceFrame() {
    if (attendanceFaceScanBusy || !attendanceWebcamInstance) return;
    attendanceFaceScanBusy = true;

    const videoElement = document.getElementById("attendanceWebcamStream");
    const canvasElement = document.getElementById("attendancePhotoCanvas");
    const statusLabel = document.getElementById("attendanceScannerStatusText");

    const trackingContext = canvasElement.getContext("2d");
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    trackingContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    const frame = canvasElement.toDataURL("image/jpeg", 0.8);

    try {
        const biometricPayload = new FormData();
        biometricPayload.append("frame", frame);

        const apiResponse = await fetch(`${apiUrl}/api/attendance/identify-face`, {
            method: "POST",
            body: biometricPayload
        });
        const resultData = await apiResponse.json();
        attendanceFaceScanBusy = false;

        if (apiResponse.ok && resultData.status === "success") {
            clearTimeout(attendanceScanTimeoutId);
            shutdownAttendanceCamera();
            showAttendanceIdentifiedResult(resultData);
        } else if (statusLabel) {
            statusLabel.innerText = resultData.detail === "no_face"
                ? "Position your face in the frame..."
                : "Not recognized, keep looking...";
        }
    } catch (err) {
        attendanceFaceScanBusy = false;
        console.error("Attendance Face Match Error:", err);
    }
}

function shutdownAttendanceCamera() {
    if (attendanceWebcamInstance) {
        attendanceWebcamInstance.getTracks().forEach(track => track.stop());
        attendanceWebcamInstance = null;
    }
    if (attendanceScanTimeoutId) {
        clearTimeout(attendanceScanTimeoutId);
        attendanceScanTimeoutId = null;
    }
}

function showAttendanceIdentifiedResult(data) {
    attendanceIdentifiedStaff = data;

    document.getElementById("attendanceScanView")?.classList.add("hidden");
    document.getElementById("attendanceManualEntryView")?.classList.add("hidden");
    document.getElementById("attendanceResultView")?.classList.remove("hidden");

    const photoEl = document.getElementById("attendanceResultPhoto");
    if (photoEl) photoEl.src = data.face_photo || "amFace.png";

    const nameEl = document.getElementById("attendanceResultName");
    if (nameEl) nameEl.innerText = data.name || data.username;

    const isClockingIn = data.next_action === "in";
    const statusEl = document.getElementById("attendanceResultStatusText");
    if (statusEl) statusEl.innerText = isClockingIn ? "Ready to clock in for today." : "You're currently clocked in - ready to clock out?";

    const inBtn = document.getElementById("attendanceClockInBtn");
    const outBtn = document.getElementById("attendanceClockOutBtn");
    if (inBtn) inBtn.disabled = !isClockingIn;
    if (outBtn) outBtn.disabled = isClockingIn;
}

async function submitAttendanceClock(action) {
    if (!attendanceIdentifiedStaff) return;

    try {
        const payload = new FormData();
        payload.append("username", attendanceIdentifiedStaff.username);

        const response = await fetch(`${apiUrl}/api/attendance/clock`, { method: "POST", body: payload });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            showAttendanceToast(data.action === "in" ? "Clocked in successfully!" : "Clocked out successfully!", true);
        } else {
            showAttendanceToast(data.detail || "Could not record attendance.", false);
        }
    } catch (err) {
        console.error("submitAttendanceClock error:", err);
        showAttendanceToast("Could not record attendance.", false);
    }

    setTimeout(resetAttendanceKioskToScan, 1800);
}

document.addEventListener("DOMContentLoaded", resetAttendanceKioskToScan);
