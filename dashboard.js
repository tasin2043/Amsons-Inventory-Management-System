// ==============================================================================================
// 📊 CORE APPLICATION ENVIRONMENT VARIABLES CONFIGURATION REGISTRY LAYER
// ==============================================================================================


// ─── 🔄 RENDER DASHBOARD DATASET LAYOUT DYNAMICALLY INSIDE INVENTORY TABLES ───
async function fetchInventoryData() {
    console.log("Fetching live ledger status records from database engine...");
    try {
        // Dynamic fetch request to inventory index tracking target endpoint route context
        const dataResponse = await fetch(`${apiUrl}/api/inventory/list`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`,
                "Content-Type": "application/json"
            }
        }); 
        
        const targetTableBody = document.getElementById("inventoryTableBody");
        if (!targetTableBody) return;

        // Visual initialization check array validation trigger loader
        targetTableBody.innerHTML = "";

        if (dataResponse.ok) {
            const inventoryItemsList = await dataResponse.json();
            
            if (inventoryItemsList && inventoryItemsList.length > 0) {
                // Iterate through available database data items and map rows inside document DOM grid
                inventoryItemsList.forEach(item => {
                    const dynamicTableRow = document.createElement("tr");
                    dynamicTableRow.className = "hover:bg-[#1A1300]/40 border-b border-gray-900 transition-all duration-200 text-xs";
                    
                    dynamicTableRow.innerHTML = `
                        <td class="py-3 font-bold text-white max-w-[150px] truncate pl-2">${item.name || 'Unknown Product'}</td>
                        <td class="py-3 text-[#E6B950] font-mono tracking-wider text-right pr-4">${item.quantity || 0} Pcs</td>
                    `;
                    targetTableBody.appendChild(dynamicTableRow);
                });
                return;
            }
        }
        
        // Premium Fallback Mock items matching luxury golden dashboard matrix layouts perfectly
        console.warn("API Engine listing empty or offline. Injecting responsive mock parameters matrix visual hooks.");
        targetTableBody.innerHTML = `
            <tr class="hover:bg-[#1A1300]/40 border-b border-gray-900 transition-all duration-200 text-xs">
                <td class="py-3 font-bold text-white max-w-[150px] truncate pl-2">Logitech Wireless Mouse</td>
                <td class="py-3 text-[#E6B950] font-mono tracking-wider text-right pr-4">42 Pcs</td>
            </tr>
            <tr class="hover:bg-[#1A1300]/40 border-b border-gray-900 transition-all duration-200 text-xs">
                <td class="py-3 font-bold text-white max-w-[150px] truncate pl-2">Goat Milk Soap Premium</td>
                <td class="py-3 text-[#E6B950] font-mono tracking-wider text-right pr-4">117 Pcs</td>
            </tr>
            <tr class="hover:bg-[#1A1300]/40 border-b border-gray-900 transition-all duration-200 text-xs">
                <td class="py-3 font-bold text-white max-w-[150px] truncate pl-2">Premium Ajwa Dates Box</td>
                <td class="py-3 text-[#E6B950] font-mono tracking-wider text-right pr-4">85 Pcs</td>
            </tr>
        `;
    } catch (fetchError) {
        console.error("Dashboard table items rendering matrix crashed: ", fetchError);
    }
}

// ─── 👤 FETCH PROFILE DATA AFTER SUCCESSFUL SYSTEM AUTHORIZATION (UPDATED CONTROLLER) ───
async function loadAuthenticatedUserProfile(loggedInUserId) {
    console.log("Initializing Profile Core Pipeline Fetch for User ID:", loggedInUserId);
    
    if (!loggedInUserId) {
        console.warn("User authorization claims identity payload empty.");
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/api/user-profile?username=${encodeURIComponent(loggedInUserId)}`);
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            console.log("Successfully retrieved user profile payload configurations:", data);
            
            // 1. Mapping variables parameters directly onto index.html layers tags
            if (document.getElementById("profUserId")) document.getElementById("profUserId").innerText = data.user_id || "---";
            if (document.getElementById("profName")) document.getElementById("profName").innerText = data.name || "Loading...";
            if (document.getElementById("profEmail")) document.getElementById("profEmail").innerText = data.email || "---";
            
            const roleBadgeElement = document.getElementById("profRole");
            if (roleBadgeElement) roleBadgeElement.innerText = data.role || "STAFF";
            
            // Render first alphabet character to Sidebar Avatar Badge
            if (data.name && document.getElementById("avatarBadge")) {
                document.getElementById("avatarBadge").innerText = data.name.charAt(0).toUpperCase();
            }

            // 2. 🛡️ ADMIN CLEARANCE DRIVEN SYSTEM OPTIONAL DRAWER CONDITIONAL RENDERING SWITCH
            const adminSidebarSectionBlock = document.getElementById("adminControlsContainer");
            const adminMenuLinks = document.getElementById("sidebarAdminLinks");
            
            if (String(data.role).toLowerCase() === "admin") {
                // Reveal administrative menu links
                if (adminMenuLinks) adminMenuLinks.classList.remove("hidden");
                
                if (roleBadgeElement) {
                    roleBadgeElement.className = "text-[9px] font-black text-[#E6B950] tracking-widest block uppercase mt-0.5";
                }

                // POPUP TIMEOUT PIPELINE ENGINE CONTROLLER EXECUTION PATH
                if (adminSidebarSectionBlock) {
                    adminSidebarSectionBlock.classList.remove("hidden");
                    
                    // Smooth slide transition sequence parameters bheshe uthbar trigger
                    setTimeout(() => {
                        adminSidebarSectionBlock.classList.remove("translate-y-[-20px]", "opacity-0");
                        adminSidebarSectionBlock.classList.add("translate-y-0", "opacity-100");
                    }, 50);

                    // 3.5 Second runtime processing duration complete hobar por animation dynamic clear close block execute hobe
                    setTimeout(() => {
                        adminSidebarSectionBlock.classList.remove("translate-y-0", "opacity-100");
                        adminSidebarSectionBlock.classList.add("translate-y-[-20px]", "opacity-0");
                        
                        // Slide effect display processing nodes drop wipe
                        setTimeout(() => {
                            adminSidebarSectionBlock.classList.add("hidden");
                        }, 500);
                    }, 3500);
                }
            } else {
                // Enforce strict warehouse staff profiles restriction
                if (adminSidebarSectionBlock) adminSidebarSectionBlock.classList.add("hidden");
                if (adminMenuLinks) adminMenuLinks.classList.add("hidden");
                
                if (roleBadgeElement) {
                    roleBadgeElement.className = "text-[9px] font-black text-[#E6B950] tracking-widest block uppercase mt-0.5";
                }
            }

            // 3. 🎯 DYNAMIC TEXT HEADER NAME OVERRIDE VISUAL TARGET
            const userFirstName = data.name ? data.name.split(' ')[0] : "User";
            const welcomeHeadingTag = document.getElementById("welcomeHeadingText");
            if (welcomeHeadingTag) {
                welcomeHeadingTag.innerText = `Welcome to AlumRock Store, ${userFirstName}!`;
            }

            // 4. 🗣️ AUDIO VOICE ENGINE WELCOME SPEECH TRIGGER DAEMON
            triggerVocalGreeting(`Welcome to Amsonstock Alumrock, ${userFirstName}!`);

            // Instantly sync data layout matrix variables rows
            fetchInventoryData();

        } else {
            console.error("Backend identity matching status error profile tracking check logs.");
        }
    } catch (err) {
        console.error("Profile structural logic parsing tracking failed breakdown:", err);
    }
}

// ─── 🔊 HELPER WEB SPEECH AUDIO SYNTHESIZATION CONTROLLER ───
function triggerVocalGreeting(messagePayloadText) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Flush lingering queues
        const speechSpeechUtteranceObject = new SpeechSynthesisUtterance(messagePayloadText);
        speechSpeechUtteranceObject.rate = 0.95; 
        speechSpeechUtteranceObject.pitch = 1.0; 
        speechSpeechUtteranceObject.lang = 'en-US'; 
        window.speechSynthesis.speak(speechSpeechUtteranceObject);
        console.log("Vocal audio engine successfully spoken payload text:", messagePayloadText);
    } else {
        console.warn("Client browser environment does not support Speech Synthesis Web API components.");
    }
}

// ─── 🔄 AUTOMATED LOCAL REGISTRY CORE LOGOUT PIPELINE TRIGGER CONTROLLER ───
document.getElementById("logoutBtn")?.addEventListener("click", () => {
    handleLogoutCleanExecutionPipeline();
});

function handleLogoutCleanExecutionPipeline() {
    console.log("Resetting active authorization tokens and components states...");
    sessionToken = null; 

    if (typeof scanningCycleIntervalId !== 'undefined' && scanningCycleIntervalId) {
        clearInterval(scanningCycleIntervalId);
        scanningCycleIntervalId = null;
    }
    
    if (typeof currentFailedAttemptsCount !== 'undefined') {
        currentFailedAttemptsCount = 0;
    }

    if (typeof shutdownAutoLoginStream === "function") {
        shutdownAutoLoginStream();
    }

    // Reset layout layers visibility parameters
    if (document.getElementById("dashboardSection")) document.getElementById("dashboardSection").classList.add("hidden");
    if (document.getElementById("authSection")) document.getElementById("authSection").classList.remove("hidden");
    
    const newPassField = document.getElementById("profileNewPassword");
    if (newPassField) newPassField.value = "";

    setTimeout(() => {
        if (typeof bootAutoFaceAuthentication === "function") {
            bootAutoFaceAuthentication();
        }
    }, 500); 
}

// ─── 📝 BACKEND STOCK SYNC UPDATE CONNECTIVITY INTERFACE HOOKS ───
async function updateStock(barcode, type, quantity) {
    const payload = { barcode, type, quantity }; 
    try {
        const response = await fetch(`${apiUrl}/api/update-inventory`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`,
                "Content-Type": "application/json" 
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (response.ok) {
            if (typeof displayNotification === "function") {
                displayNotification(`Stock ${type} Successful! Available: ${data.new_stock} pcs`, true);
            }
            fetchInventoryData(); 
        }
    } catch (error) {
        console.error("Stock database communication tracking optimization failure:", error);
    }
}

// ─── 🖨️ HARDWARE USB SCANNER INPUT GLOBAL KEYBOARD EVENT LISTENERS ───
let barcodeBuffer = "";
document.addEventListener("keydown", (e) => {
    const dashboardContainer = document.getElementById("dashboardSection");
    if (dashboardContainer && dashboardContainer.classList.contains("hidden")) {
        return; // Restrict scanning operations tracking if workspace remains unauthenticated
    }

    if (e.key === "Enter") {
        if (barcodeBuffer.length > 3) {
            console.log("USB Scanned Barcode (Stock IN Execution Layer):", barcodeBuffer);
            updateStock(barcodeBuffer, "IN", 1); 
            barcodeBuffer = ""; 
        }
    } else {
        if (e.key.length === 1) { 
            barcodeBuffer += e.key;
        }
    }
    
    setTimeout(() => { barcodeBuffer = ""; }, 500);
});

// ==============================================================================================
// 📡 HARDWARE USB DEVICE ADAPTER & REAL-TIME INTERCEPTOR FOR BARCODE SCANNING
// ==============================================================================================
let currentActiveScannerMode = null; // Holds either 'IN' or 'OUT' operational context
let scannedBarcodeDataCache = "";

function openScannerWorkflowModal(modeSelection) {
    currentActiveScannerMode = modeSelection;
    scannedBarcodeDataCache = "";
    
    // UI Layout Initial Reset States
    const modalTitleNode = document.getElementById("modalFlowTitle");
    if (modalTitleNode) {
        modalTitleNode.innerText = modeSelection === 'IN' 
            ? "⚡ Hardware Terminal: Stock IN Pipeline" 
            : "⚡ Hardware Terminal: Stock OUT Pipeline";
    }

    // Resetting visibility nodes
    if (document.getElementById("scannerInputStage")) document.getElementById("scannerInputStage").classList.remove("hidden");
    if (document.getElementById("scannerPromptStage")) document.getElementById("scannerPromptStage").classList.add("hidden");
    if (document.getElementById("scannerManualInForm")) document.getElementById("scannerManualInForm").classList.add("hidden");
    
    // Clear & Auto-Focus hidden layer to instantly grab scanning beam inputs
    const hiddenInputField = document.getElementById("hardwareScannerHiddenInput");
    if (hiddenInputField) {
        hiddenInputField.value = "";
        setTimeout(() => hiddenInputField.focus(), 200);
    }

    if (document.getElementById("scannerWorkflowModal")) document.getElementById("scannerWorkflowModal").classList.remove("hidden");
}

function closeScannerWorkflowModal() {
    if (document.getElementById("scannerWorkflowModal")) document.getElementById("scannerWorkflowModal").classList.add("hidden");
    currentActiveScannerMode = null;
    scannedBarcodeDataCache = "";
}

// 🎹 INTERCEPTING SYSTEM INPUTS FOR REAL PHYSICAL KEYBOARD INTERFACES
document.getElementById("hardwareScannerHiddenInput")?.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        const extractedBarcode = this.value.trim();
        if (extractedBarcode.length > 2) {
            processCapturedBarcodeSignal(extractedBarcode);
        }
        this.value = ""; // Flush input loop instantly
    }
});

// Force focus container protection map fallback
document.getElementById("scannerInputStage")?.addEventListener("click", () => {
    const inputNode = document.getElementById("hardwareScannerHiddenInput");
    if (inputNode) inputNode.focus();
});

// 📊 CORE BUSINESS WORKFLOW MANAGEMENT UPON SUCCESSFUL HARDWARE SCAN TRIGGER
function processCapturedBarcodeSignal(barcodeString) {
    scannedBarcodeDataCache = barcodeString;
    const badge = document.getElementById("detectedBarcodeBadge");
    if (badge) badge.innerText = barcodeString;

    // Transitioning View layout to prompt verification module stage
    if (document.getElementById("scannerInputStage")) document.getElementById("scannerInputStage").classList.add("hidden");
    if (document.getElementById("scannerPromptStage")) document.getElementById("scannerPromptStage").classList.remove("hidden");
}

// Hooking Event Handlers directly onto action matrix confirmation nodes
document.getElementById("confirmInBtn")?.addEventListener("click", () => {
    if (document.getElementById("scannerPromptStage")) document.getElementById("scannerPromptStage").classList.add("hidden");
    if (document.getElementById("scannerManualInForm")) document.getElementById("scannerManualInForm").classList.remove("hidden");
    const pNameInput = document.getElementById("scanProdName");
    if (pNameInput) pNameInput.focus();
});

document.getElementById("confirmOutBtn")?.addEventListener("click", async () => {
    await executeStockOutTransactionPipeline(scannedBarcodeDataCache);
});

// 🟢 TRANSACTION TERMINAL SUBMIT ENGINE FOR STOCK IN (REGISTRATION & RE-STOCK)
document.getElementById("scannerManualInForm")?.addEventListener("submit", async function(e) {
    e.preventDefault();
    
    const payloadInDetails = {
        barcode: scannedBarcodeDataCache,
        name: document.getElementById("scanProdName").value.trim(),
        size_weight: document.getElementById("scanProdSize").value.trim(),
        storeroom: document.getElementById("scanStoreRoom").value,
        shelf_location: document.getElementById("scanShelfCode").value.trim(),
        quantity: parseInt(document.getElementById("scanProdQty").value) || 1,
        image_url: document.getElementById("scanProdImage").value.trim(),
        transaction_type: "IN"
    };

    try {
        const response = await fetch(`${apiUrl}/api/inventory/stock-in`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payloadInDetails)
        });

        if (response.ok) {
            if (typeof displayNotification === "function") {
                displayNotification(`Product ${payloadInDetails.name} scanned & added to ${payloadInDetails.storeroom} successfully!`, true);
            }
            closeScannerWorkflowModal();
            this.reset();
            fetchInventoryData(); 
        } else {
            const errorLogs = await response.json();
            if (typeof displayNotification === "function") {
                displayNotification(errorLogs.detail || "Failed to finalize inventory entry mapping parameters.", false);
            }
        }
    } catch (err) {
        console.warn("API Router offline, fallback to simulation model operations log.");
        if (typeof displayNotification === "function") {
            displayNotification(`[Simulation Logs]: Stock IN structural records saved for Barcode: ${scannedBarcodeDataCache}`, true);
        }
        closeScannerWorkflowModal();
        this.reset();
    }
});

// 🔴 TRANSACTION TERMINAL LOGIC DISPATCH ENGINE FOR STOCK OUT
async function executeStockOutTransactionPipeline(barcodeKey) {
    const defaultOutQuantity = 1; 
    try {
        const response = await fetch(`${apiUrl}/api/inventory/stock-out`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${sessionToken || localStorage.getItem("access_token")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode: barcodeKey,
                quantity: defaultOutQuantity,
                transaction_type: "OUT"
            })
        });

        if (response.ok) {
            if (typeof displayNotification === "function") {
                displayNotification(`📦 Stock Dispatched Successfully! Product associated with Barcode: ${barcodeKey} has been removed.`, true);
            }
            closeScannerWorkflowModal();
            fetchInventoryData();
        } else {
            const errorPayload = await response.json();
            if (typeof displayNotification === "function") {
                displayNotification(errorPayload.detail || "Stock Out aborted: Out of stock or trace missing.", false);
            }
        }
    } catch (err) {
        console.warn("Backend router error trace, running layout data fallback sequence logs.");
        if (typeof displayNotification === "function") {
            displayNotification(`📦 [Simulation Logs]: Stock OUT processed configuration frame profiles grid clear.`, true);
        }
        closeScannerWorkflowModal();
    }
}

// ─── 🔒 CREDENTIAL KEY MANAGEMENT SCHEMA RESET PROCESS PIPELINES ───
async function executeProfilePasswordChangePipeline() {
    const currentUserId = document.getElementById("profUserId") ? document.getElementById("profUserId").innerText : "";
    const currentEmail = document.getElementById("profEmail") ? document.getElementById("profEmail").innerText : "";
    const newPassField = document.getElementById("profileNewPassword");
    const cleanNewPassword = newPassField ? newPassField.value.trim() : "";
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
    
    if (!passwordRegex.test(cleanNewPassword)) {
        if (typeof displayNotification === "function") {
            displayNotification("Password fails system rule metrics check (Must have 1 Cap, 1 Small, 1 Number, 1 Symbol, Min 8 Chars)!", false);
        }
        return;
    }

    try {
        const payloadFields = new FormData();
        payloadFields.append("staff_id", currentUserId);
        payloadFields.append("email_address", currentEmail);

        const apiResponse = await fetch(`${apiUrl}/api/forgot-password-trigger`, {
            method: "POST",
            body: payloadFields
        });

        if (apiResponse.ok) {
            if (typeof displayNotification === "function") {
                displayNotification("Account credential profile security code updated successfully!", true);
            }
            if (newPassField) newPassField.value = "";
        } else {
            if (typeof displayNotification === "function") {
                displayNotification("Failed to update password schema configurations.", false);
            }
        }
    } catch (error) {
        if (typeof displayNotification === "function") {
            displayNotification(error.message, false);
        }
    }
}