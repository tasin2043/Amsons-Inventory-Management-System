// Amsonstock Extreme AI Engine Client Connectivity Control Setup Matrix Configuration
const apiUrl = window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") ? "http://127.0.0.1:8000" : window.location.origin;
let sessionToken = localStorage.getItem("access_token") || null;

// ─── 🔄 RENDER DASHBOARD DATASET LAYOUT DYNAMICALLY INSIDE INVENTORY TABLES ───
async function fetchInventoryData() {
    try {
        // Mock default dashboard preview fallback layers row data strings
        const targetTableBody = document.getElementById("inventoryTableBody");
        if (!targetTableBody) return;

        targetTableBody.innerHTML = `
            <tr class="hover:bg-neutral-900/40 border-b border-neutral-900/50 transition">
                <td class="py-2.5 font-medium text-white max-w-[120px] truncate">Premium Alumrock Ajwa Dates Packaging Box</td>
                <td class="py-2.5 text-gray-500 font-mono">5060476794228</td>
                <td class="py-2.5 text-right font-mono font-bold text-amber-400">25 Pcs</td>
            </tr>
            <tr class="hover:bg-neutral-900/40 border-b border-neutral-900/50 transition">
                <td class="py-2.5 font-medium text-white max-w-[120px] truncate">Logitech Wireless Mouse</td>
                <td class="py-2.5 text-gray-500 font-mono">42182658</td>
                <td class="py-2.5 text-right font-mono font-bold text-amber-400">5 Pcs</td>
            </tr>
        `;
    } catch (fetchError) {
        console.error("Dashboard table items rendering matrix crashed: ", fetchError);
    }
}

// ─── 👤 FETCH PROFILE DATA AFTER SUCCESSFUL SYSTEM AUTHORIZATION ───
async function loadAuthenticatedUserProfile(loggedInUserId) {
    console.log("Initializing Profile Core Pipeline Fetch for User ID:", loggedInUserId);
    if (!loggedInUserId) return;

    try {
        const response = await fetch(`${apiUrl}/api/user-profile?username=${encodeURIComponent(loggedInUserId)}`);
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            document.getElementById("profUserId").innerText = data.user_id;
            document.getElementById("profName").innerText = data.name;
            document.getElementById("profEmail").innerText = data.email;
            document.getElementById("profRole").innerText = data.role;
            
            if(data.name) {
                document.getElementById("avatarBadge").innerText = data.name.charAt(0).toUpperCase();
            }

            // 🛡️ ADMIN CLEARANCE SIDEBAR DRAWER INTERFACE LOGIC
            const adminSidebarSectionBlock = document.getElementById("adminControlsContainer");
            const adminMenuLinks = document.getElementById("sidebarAdminLinks");
            const roleBadgeElement = document.getElementById("profRole");
            
            if (String(data.role).toLowerCase() === "admin") {
                if (adminMenuLinks) adminMenuLinks.classList.remove("hidden");
                if (roleBadgeElement) {
                    roleBadgeElement.className = "text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider block mt-0.5 font-mono";
                }

                if (adminSidebarSectionBlock) {
                    adminSidebarSectionBlock.classList.remove("hidden");
                    setTimeout(() => {
                        adminSidebarSectionBlock.classList.remove("translate-y-[-20px]", "opacity-0");
                        adminSidebarSectionBlock.classList.add("translate-y-0", "opacity-100");
                    }, 50);

                    setTimeout(() => {
                        adminSidebarSectionBlock.classList.remove("translate-y-0", "opacity-100");
                        adminSidebarSectionBlock.classList.add("translate-y-[-20px]", "opacity-0");
                        setTimeout(() => { adminSidebarSectionBlock.classList.add("hidden"); }, 500);
                    }, 3500);
                }
            } else {
                if (adminSidebarSectionBlock) adminSidebarSectionBlock.classList.add("hidden");
                if (adminMenuLinks) adminMenuLinks.classList.add("hidden");
                if (roleBadgeElement) {
                    roleBadgeElement.className = "text-[9px] bg-amber-400/10 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider block mt-0.5 font-mono";
                }
            }

            const userFirstName = data.name.split(' ')[0] || "User";
            const welcomeHeadingTag = document.getElementById("welcomeHeadingText");
            if (welcomeHeadingTag) {
                welcomeHeadingTag.innerText = `Welcome to AlumRock Store, ${userFirstName}!`;
            }

            triggerVocalGreeting(`Welcome to Amsonstock Alumrock, ${userFirstName}!`);
            fetchInventoryData();
        }
    } catch (err) {
        console.error("Profile structural logic parsing tracking failed:", err);
    }
}

// ─── 🔊 HELPER WEB SPEECH AUDIO SYNTHESIZATION CONTROLLER ───
function triggerVocalGreeting(messagePayloadText) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const speechSpeechUtteranceObject = new SpeechSynthesisUtterance(messagePayloadText);
        speechSpeechUtteranceObject.rate = 0.95; 
        speechSpeechUtteranceObject.pitch = 1.0; 
        speechSpeechUtteranceObject.lang = 'en-US'; 
        window.speechSynthesis.speak(speechSpeechUtteranceObject);
    }
}

// ─── 📝 BACKEND STOCK SYNC UPDATE CONNECTIVITY INTERFACE HOOKS (FIXED CORE ENDPOINT PATH) ───
async function updateStock(barcode, type, quantity) {
    // Exact mapping validation alignment query syntax parameter conversion matches to main.py endpoint `/scan/`
    const actionDirection = String(type).toLowerCase() === "in" ? "in" : "out";
    const requestUrl = `${apiUrl}/scan/?barcode=${encodeURIComponent(barcode)}&action_type=${actionDirection}&quantity=${parseInt(quantity)}`;
    
    try {
        const response = await fetch(requestUrl, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`
            }
        });
        
        const data = await response.json();
        if (response.ok && data.status === "success") {
            displayNotification(`Stock Update Successful! New Level: ${data.updated_stock} units`, true);
            fetchInventoryData(); 
        } else {
            displayNotification(data.detail || "Database transmission pipeline update error", false);
        }
    } catch (error) {
        console.error("Stock database communication tracking failure:", error);
    }
}

// ─── 🔄 AUTOMATED LOCAL REGISTRY CORE LOGOUT PIPELINE ───
document.getElementById("logoutBtn")?.addEventListener("click", () => {
    handleLogoutCleanExecutionPipeline();
});

function handleLogoutCleanExecutionPipeline() {
    localStorage.removeItem("access_token");
    sessionToken = null; 
    
    if (activeVideoStream) {
        activeVideoStream.getTracks().forEach(track => track.stop());
        activeVideoStream = null;
    }

    document.getElementById("dashboardSection").classList.add("hidden");
    document.getElementById("authSection").classList.remove("hidden");
    displayNotification("Logged out safely from Alumrock Core Warehouse Engine.", true);
}

// ─── 🖨️ HARDWARE USB SCANNER INPUT GLOBAL KEYBOARD EVENT LISTENERS ───
let barcodeBuffer = "";
document.addEventListener("keydown", (e) => {
    const dashboardContainer = document.getElementById("dashboardSection");
    if (dashboardContainer && dashboardContainer.classList.contains("hidden")) return;

    if (e.key === "Enter") {
        if (barcodeBuffer.length > 3) {
            console.log("USB Scanned Barcode detected:", barcodeBuffer);
            updateStock(barcodeBuffer, "in", 1); 
            barcodeBuffer = ""; 
        }
    } else {
        if (e.key.length === 1) { 
            barcodeBuffer += e.key;
        }
    }
    setTimeout(() => { barcodeBuffer = ""; }, 800);
});

// ─── 🏛️ INFINITE CUSTOM STOREROOMS SECTOR INITIALIZER FORM CONTROLLER ───
let activeStoreroomsMemoryRegistry = [
    { id: 1, name: "Storeroom 1 (Zone A)" },
    { id: 2, name: "Storeroom 2 (Zone B)" }
]; 

function populateStoreroomSelectorsDropdown() {
    const selectorDropdownElement = document.getElementById("aiFieldStoreroomSelector");
    if (!selectorDropdownElement) return;

    selectorDropdownElement.innerHTML = `<option value="">-- Choose Storeroom --</option>`;
    activeStoreroomsMemoryRegistry.forEach(roomNode => {
        const optionNode = document.createElement("option");
        optionNode.value = roomNode.id;
        optionNode.innerText = roomNode.name;
        selectorDropdownElement.appendChild(optionNode);
    });
}

// ==============================================================================================
// 🧠 ULTIMATE HIGH-ACCURACY HYBRID COGNITION SCANNER (AUTO-CLEANUP & LONG-RANGE PARSING)
// ==============================================================================================
let html5QrCodeScannerInstance = null;
let isScanningCycleLocked = false;

async function bootStockInVisualScannerPipeline() {
    console.log("🚀 Initializing Ultra-Fast High-Accuracy Client-Side Scanner...");
    const scannerContainerNode = document.getElementById("qrScannerInternalTarget") || document.getElementById("aiRealtimeVideoNode").parentElement;
    if (!scannerContainerNode) return;

    const modeBadge = document.getElementById("camProcessModeBadgeStandalone");
    if (modeBadge) {
        modeBadge.innerText = "HYBRID COGNITION ACTIVE";
        modeBadge.className = "text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono animate-pulse";
    }

    triggerVocalGreeting("Hybrid Intelligence Scanner Engaged.");

    if(html5QrCodeScannerInstance) {
        try { await html5QrCodeScannerInstance.stop(); } catch(e){}
    }

    if(!document.getElementById("discreteBarcodeSurfaceTarget")) {
        const structuralSurfaceNode = document.createElement("div");
        structuralSurfaceNode.id = "discreteBarcodeSurfaceTarget";
        structuralSurfaceNode.className = "w-full min-h-[340px] bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800";
        scannerContainerNode.appendChild(structuralSurfaceNode);
        
        const primaryVideoNode = document.getElementById("aiRealtimeVideoNode");
        if(primaryVideoNode) primaryVideoNode.style.display = "none";
    }

    html5QrCodeScannerInstance = new Html5Qrcode("discreteBarcodeSurfaceTarget");
    
    const decodingProfilesConfig = {
        fps: 30, // Frame processing frequency barano holo dynamic feedback processing speed er jonno
        qrbox: (width, height) => {
            return { width: Math.floor(width * 0.90), height: Math.floor(height * 0.70) }; // Bounding box mathematical zone size optimization
        },
        aspectRatio: 1.777778,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    try {
        await html5QrCodeScannerInstance.start(
            { facingMode: "environment" }, 
            decodingProfilesConfig,
            async (decodedTextBarcodeString) => {
                if(isScanningCycleLocked) return;
                isScanningCycleLocked = true;

                console.log("🎯 Raw Decoded Signature String Captured:", decodedTextBarcodeString);
                
                // 🚀 ADVANCED DATA CLEANUP MATRIX ENGINE: URL string logic patterns filter mapping instantly
                let absoluteSanitizedKey = decodedTextBarcodeString.trim();
                if (absoluteSanitizedKey.includes("http://") || absoluteSanitizedKey.includes("https://")) {
                    console.log("⚠️ Web URL string pattern detected. Initiating core keyword mapping pipeline extraction...");
                    // Extract alpha-numeric clean context domain or parameters strings dynamically
                    const urlParserInstance = new URL(absoluteSanitizedKey);
                    absoluteSanitizedKey = urlParserInstance.hostname.replace("www.", "") || "AMSONS-PRODUCT";
                }

                triggerVocalGreeting("Data pipeline cleanup extraction successful.");
                document.getElementById("hudDetectedObj").innerText = "Syncing Clean Identity...";
                document.getElementById("hudConfidence").innerText = "100%";

                // 🚀 TRAILING SLASH REMOVED & CLEAN PATH FORWARD TARGETED (SOLVES 404)
                const requestUrl = `${apiUrl}/scan?barcode=${encodeURIComponent(absoluteSanitizedKey)}&action_type=in&quantity=1`;
                console.log("POST Hit -> Target URL Map Location:", requestUrl);

                try {
                    const response = await fetch(requestUrl, {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`
                        }
                    });
                    
                    const responseJsonPayload = await response.json();
                    if (response.ok && responseJsonPayload.status === "success") {
                        displayNotification(`[Match Sync] ${responseJsonPayload.product_name || 'Item'} Stock Updated!`, true);
                        fetchInventoryData();
                    } else {
                        // Product missing fallback routing layer trigger container dashboard input metrics fields
                        displayNotification(`Unregistered key code: "${absoluteSanitizedKey}" synchronized to registration matrix storage map.`, false);
                        
                        const newProductDrawer = document.getElementById("aiNewProductFormDrawer");
                        if(newProductDrawer) {
                            newProductDrawer.classList.remove("hidden");
                            newProductDrawer.style.display = "block";
                            document.getElementById("aiFieldBarcode").value = absoluteSanitizedKey;
                            // Pre-fill fallback name context from sanitized keyword pattern string directly
                            document.getElementById("aiFieldName").value = absoluteSanitizedKey.toUpperCase();
                        }
                    }
                } catch(netRoutingException) {
                    console.error("Local parsing matrix backend error:", netRoutingException);
                }

                setTimeout(() => { isScanningCycleLocked = false; }, 3000); // 3 seconds scan cooldown matrix
            },
            (errorMessageLogTrace) => {}
        );
    } catch(pipelineBootException) {
        console.error("Discrete core hardware runtime registration failed:", pipelineBootException);
    }
}
// ─── 🛑 HALT STREAM ENGINE PIPELINE CONTROLLER ───
function killStockInVisualScannerPipeline() {
    console.log("🛑 Halting Realtime Vision Scanner Loop...");
    const videoNode = document.getElementById("aiRealtimeVideoNode");
    
    if (activeVideoStream) {
        activeVideoStream.getTracks().forEach(track => track.stop());
        activeVideoStream = null;
    }
    
    if (videoNode) {
        videoNode.srcObject = null;
    }

    const modeBadge = document.getElementById("camProcessModeBadgeStandalone");
    if (modeBadge) {
        modeBadge.innerText = "VISION STANDBY";
        modeBadge.className = "text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono animate-pulse";
    }
    
    document.getElementById("hudDetectedObj").innerText = "Waiting...";
    document.getElementById("hudConfidence").innerText = "0%";
    triggerVocalGreeting("Vision Engine Disengaged.");
}

// ─── ⚙️ MANUAL STOCK IN/OUT DIRECT OVERRIDE MANAGEMENT CONTROLLER ───
async function executeManualBackdoorOverridePipeline() {
    const targetBarcodeString = document.getElementById("manOverrideBarcode").value.trim();
    const targetQuantityValue = parseInt(document.getElementById("manOverrideQty").value) || 1;
    const coreVectorDirectionType = document.getElementById("manOverrideType").value; 

    if (!targetBarcodeString) {
        displayNotification("🚨 Valid barcode tag key signature required.", false);
        return;
    }
    updateStock(targetBarcodeString, coreVectorDirectionType, targetQuantityValue);
}

// Centralized dynamic screen injection layout mapping for system notification tracking
function displayNotification(msg, isSuccess) {
    console.log(`[Notification] Status: ${isSuccess ? 'Success' : 'Alert'} -> ${msg}`);
    
    const displayDiv = document.getElementById("authMessage");
    if (displayDiv) {
        displayDiv.innerText = msg;
        displayDiv.className = isSuccess 
            ? "bg-emerald-500/20 text-emerald-400 p-4 rounded-lg mb-4 text-base border-2 border-emerald-500/40 text-center font-bold"
            : "bg-red-500/20 text-red-400 p-4 rounded-lg mb-4 text-base border-2 border-red-500/40 text-center font-bold";
        displayDiv.classList.remove("hidden");
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        alert(msg);
    }
}

// ─── 🛑 HALT STREAM ENGINE PIPELINE CONTROLLER ───
function killStockInVisualScannerPipeline() {
    console.log("🛑 Halting Realtime Vision Scanner Loop...");
    const videoNode = document.getElementById("aiRealtimeVideoNode");
    
    if (activeVideoStream) {
        activeVideoStream.getTracks().forEach(track => track.stop());
        activeVideoStream = null;
    }
    
    if (videoNode) {
        videoNode.srcObject = null;
    }

    const modeBadge = document.getElementById("camProcessModeBadgeStandalone");
    if (modeBadge) {
        modeBadge.innerText = "VISION STANDBY";
        modeBadge.className = "text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono animate-pulse";
    }
    
    document.getElementById("hudDetectedObj").innerText = "Waiting...";
    document.getElementById("hudConfidence").innerText = "0%";
    triggerVocalGreeting("Vision Engine Disengaged.");
}

// ─── ⚙️ MANUAL STOCK IN/OUT DIRECT OVERRIDE MANAGEMENT CONTROLLER ───
async function executeManualBackdoorOverridePipeline() {
    const targetBarcodeString = document.getElementById("manOverrideBarcode").value.trim();
    const targetQuantityValue = parseInt(document.getElementById("manOverrideQty").value) || 1;
    const coreVectorDirectionType = document.getElementById("manOverrideType").value; 

    if (!targetBarcodeString) {
        displayNotification("🚨 Valid barcode tag key signature required.", false);
        return;
    }
    updateStock(targetBarcodeString, coreVectorDirectionType, targetQuantityValue);
}

// Centralized dynamic screen injection layout mapping for system notification tracking
function displayNotification(msg, isSuccess) {
    console.log(`[Notification] Status: ${isSuccess ? 'Success' : 'Alert'} -> ${msg}`);
    
    const displayDiv = document.getElementById("authMessage");
    if (displayDiv) {
        displayDiv.innerText = msg;
        displayDiv.className = isSuccess 
            ? "bg-emerald-500/20 text-emerald-400 p-4 rounded-lg mb-4 text-base border-2 border-emerald-500/40 text-center font-bold"
            : "bg-red-500/20 text-red-400 p-4 rounded-lg mb-4 text-base border-2 border-red-500/40 text-center font-bold";
        displayDiv.classList.remove("hidden");
        
        // Auto scroll to view notification context mapping instantly
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        alert(msg);
    }
}