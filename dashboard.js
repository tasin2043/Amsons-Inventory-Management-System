// Inactivity auto-logout: any real interaction resets the timer
const INACTIVITY_LOGOUT_MS = 60000; // 1 minute idle
let inactivityLogoutTimer = null;

function resetInactivityLogoutTimer() {
    const dashboard = document.getElementById("dashboardSection");
    if (!dashboard || dashboard.classList.contains("hidden")) return;
    // Till is exempt: don't auto-logout a cashier mid-sale

    clearTimeout(inactivityLogoutTimer);
    inactivityLogoutTimer = setTimeout(performInactivityLogout, INACTIVITY_LOGOUT_MS);
}

function performInactivityLogout() {
    clearTimeout(inactivityLogoutTimer);
    inactivityLogoutTimer = null;
    sessionToken = "";
    localStorage.removeItem("access_token");
    localStorage.removeItem("active_storeroom_id");
    sessionStorage.removeItem("amsons_session_active");
    location.reload();
}

["mousemove", "mousedown", "keydown", "click", "touchstart", "scroll", "wheel"].forEach(evt => {
    document.addEventListener(evt, resetInactivityLogoutTimer, { passive: true });
});

// Role helpers
function isCurrentUserManager() {
    const role = (localStorage.getItem("user_role") || localStorage.getItem("role") || "staff").toLowerCase();
    return ["management", "admin", "manager"].includes(role);
}

// Inventory handoff: the Till app's "Inventory" button opens this page with a
// one-time id in the URL and hands off the operator's session over
// postMessage (see openInventoryPopup/ensureInventoryHandoffListener in
// frontend/till/js/dashboard.js) so an already-logged-in till operator
// doesn't have to log in again here. postMessage rather than a shared
// localStorage entry, deliberately - this page can be served from a
// different origin/port than the till (e.g. the till opened through a dev
// live-reload server instead of the backend's own static mount), and
// localStorage never crosses origins, while postMessage does.
async function tryInventoryHandoff() {
    let handoffId;
    try { handoffId = new URLSearchParams(window.location.search).get("handoff"); } catch (err) { handoffId = null; }
    if (!handoffId) { console.warn("[till-handoff] no ?handoff= id in URL - not a till handoff, showing normal login"); return; }

    if (!window.parent || window.parent === window) {
        console.warn("[till-handoff] not embedded in a popup (no parent window) - showing normal login");
        return;
    }

    const handoff = await new Promise((resolve) => {
        let settled = false;
        function finish(result) {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            resolve(result);
        }
        function onMessage(event) {
            if (event.source !== window.parent) return; // only trust the window that embedded us
            const data = event.data;
            if (!data || data.type !== "amsons-inventory-handoff" || data.handoffId !== handoffId) return;
            finish(data.payload || null);
        }
        window.addEventListener("message", onMessage);

        // Ping the parent to ask for the handoff - it may have started listening after this
        // page's own listener above was attached, so keep pinging briefly rather than sending once.
        let attempts = 0;
        (function ping() {
            if (settled) return;
            try { window.parent.postMessage({ type: "amsons-inventory-handoff-ready", handoffId }, "*"); } catch (err) { /* ignore */ }
            attempts += 1;
            if (attempts < 15) setTimeout(ping, 200);
        })();

        setTimeout(() => {
            if (settled) return;
            console.warn("[till-handoff] timed out waiting for the till to hand off a session for id " + handoffId);
            finish(null);
        }, 8000);
    });

    if (!handoff || !handoff.username || !handoff.token) { console.warn("[till-handoff] handoff payload missing username/token - was the till session logged in with a real token?", handoff); return; }

    console.log("[till-handoff] applying handed-off session for", handoff.username);
    sessionToken = handoff.token;
    localStorage.setItem("access_token", handoff.token);

    await loadAuthenticatedUserProfile(handoff.username);

    document.getElementById("authSection")?.classList.add("hidden");
    document.getElementById("dashboardSection")?.classList.add("hidden");
    document.getElementById("locationSection")?.classList.remove("hidden");

    // Remove the spent token from the URL only after routing is applied
    try { window.history.replaceState(null, "", window.location.pathname); } catch (err) { /* ignore */ }
}
tryInventoryHandoff();

// Generic right-side slide panel: every popup slides in from the right.
// A MutationObserver drives the animation off each wrapper's "hidden" class,
// so even old code that flips "hidden" directly still gets the slide-in for free.
function syncSlidePanelWrapper(wrapper) {
    const panel = wrapper.querySelector("[data-slide-panel]");
    if (!panel) return;
    if (wrapper.classList.contains("hidden")) {
        panel.classList.remove("translate-x-0");
        panel.classList.add("translate-x-full");
    } else if (panel.classList.contains("translate-x-full")) {
        requestAnimationFrame(() => {
            panel.classList.remove("translate-x-full");
            panel.classList.add("translate-x-0");
        });
    }
}

document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(wrapper => {
    if (!wrapper.querySelector("[data-slide-panel]")) return;
    new MutationObserver(() => syncSlidePanelWrapper(wrapper)).observe(wrapper, { attributes: true, attributeFilter: ["class"] });
    syncSlidePanelWrapper(wrapper);
});

function openRightSlidePanel(wrapperId) {
    document.getElementById(wrapperId)?.classList.remove("hidden");
}

function closeRightSlidePanel(wrapperId) {
    const modalWrapper = document.getElementById(wrapperId);
    if (!modalWrapper) return;
    const slidePanel = modalWrapper.querySelector("[data-slide-panel]");
    if (slidePanel) {
        slidePanel.classList.remove("translate-x-0");
        slidePanel.classList.add("translate-x-full");
    }
    setTimeout(() => modalWrapper.classList.add("hidden"), 300);
}

// Sidebar toggle: stays open until manually closed, except right after
// login/branch-select, where it auto-closes after 2.5s
let sidebarEntryAutoCloseTimer = null;

// Opens the sidebar and auto-closes it 2.5s later, only for the entry point above
function openMainSidebarBrieflyOnEntry() {
    openMainSidebar();
    clearTimeout(sidebarEntryAutoCloseTimer);
    sidebarEntryAutoCloseTimer = setTimeout(closeMainSidebar, 2500);
}

function openMainSidebar() {
    clearTimeout(sidebarEntryAutoCloseTimer);
    const sidebar = document.getElementById("mainSidebar");
    const main = document.getElementById("dashboardMainContent");
    const header = document.getElementById("dashboardHeader");
    const reopenBtn = document.getElementById("sidebarReopenBtn");
    const overlay = document.getElementById("sidebarOverlay");

    if (sidebar) sidebar.classList.remove("-translate-x-full");
    if (main) main.classList.add("lg:ml-[270px]");
    // Header sits above <main>, so it needs its own shift or the sidebar covers the logo
    if (header) header.classList.add("lg:ml-[270px]");
    if (overlay) overlay.classList.remove("hidden");
    if (reopenBtn) { reopenBtn.classList.add("hidden"); reopenBtn.classList.remove("flex"); }
}

function handleSidebarReopenClick() {
    openMainSidebar();
}

// "‹" button: leaves the dashboard for branch selection, stopping AI Cam
function backToBranchSelection() {
    if (typeof stopAiCamWidget === "function") stopAiCamWidget();
    document.getElementById("dashboardSection")?.classList.add("hidden");
    document.getElementById("locationSection")?.classList.remove("hidden");
}

// AMS-0000 only: steps out of the cross-branch dashboard into the normal branch picker
function enterChairmanControlMode() {
    localStorage.setItem("chairman_control_mode", "true");
    backToBranchSelection();
}

// Drops the flag and re-lands on the Chairman's own cross-branch dashboard
function exitChairmanControlMode() {
    localStorage.removeItem("chairman_control_mode");
    selectTerminalLocation("Amsons AlumRock");
}

function closeMainSidebar() {
    clearTimeout(sidebarEntryAutoCloseTimer);
    const sidebar = document.getElementById("mainSidebar");
    const main = document.getElementById("dashboardMainContent");
    const header = document.getElementById("dashboardHeader");
    const reopenBtn = document.getElementById("sidebarReopenBtn");
    const overlay = document.getElementById("sidebarOverlay");

    if (sidebar) sidebar.classList.add("-translate-x-full");
    if (main) main.classList.remove("lg:ml-[270px]");
    if (header) header.classList.remove("lg:ml-[270px]");
    if (overlay) overlay.classList.add("hidden");
    if (reopenBtn) { reopenBtn.classList.remove("hidden"); reopenBtn.classList.add("flex"); }
}

// Dashboard card grid: column count per breakpoint, varies by role
// (staff 5 cards, management 8, AMS-0000 12), via plain Tailwind classes
function layoutDashboardCardGrid() {
    const section = document.getElementById("dashboardCardGrid");
    if (!section) return;

    section.className = "grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
}

// ============================================================
// DASHBOARD CARD REORDERING: every account can drag its own cards (data-card-id in index.html)
// into whatever order it likes. Saved per-username (not global), so different logins on the same
// shared terminal each keep their own layout, and hidden cards (role-gated via the various
// .hidden classes elsewhere) just carry their position along invisibly for whenever they show up.
// Uses native HTML5 drag-and-drop rather than the pointer-based drag the storeroom map uses -
// there's no freeform x/y here, just a flat reorder, and native DnD auto-suppresses the click
// that would otherwise open the card's modal once a real drag has happened (no manual click
// disambiguation needed like the map's `moved` flag). Trade-off: needs a mouse, doesn't work via
// touch-only drag on phones/tablets without a polyfill.
// ============================================================
function dashboardCardOrderStorageKey() {
    return `dashboard_card_order_${(localStorage.getItem("username") || "").toUpperCase()}`;
}

function saveDashboardCardOrder() {
    const grid = document.getElementById("dashboardCardGrid");
    if (!grid) return;
    const order = Array.from(grid.children).map(el => el.dataset.cardId).filter(Boolean);
    localStorage.setItem(dashboardCardOrderStorageKey(), JSON.stringify(order));
}

// Re-applies this account's saved order after every render that could have reset DOM order
// (login, Control mode toggling cards on/off, etc). Cards with no saved position (new cards added
// since the account last saved, or a first-time visitor) simply stay in their existing relative
// order, since only the ones we find get moved.
function applyDashboardCardOrder() {
    const grid = document.getElementById("dashboardCardGrid");
    if (!grid) return;

    let savedOrder;
    try {
        savedOrder = JSON.parse(localStorage.getItem(dashboardCardOrderStorageKey()) || "[]");
    } catch (err) {
        savedOrder = [];
    }
    if (!Array.isArray(savedOrder) || !savedOrder.length) return;

    const byId = new Map(Array.from(grid.children).map(el => [el.dataset.cardId, el]));
    savedOrder.forEach(id => {
        const el = byId.get(id);
        if (el) grid.appendChild(el);
    });
}

let draggedDashboardCard = null;

function initDashboardCardDragReorder() {
    const grid = document.getElementById("dashboardCardGrid");
    if (!grid || grid.dataset.dragReorderBound) return;
    grid.dataset.dragReorderBound = "true";

    grid.addEventListener("dragstart", (e) => {
        const card = e.target.closest("[data-card-id]");
        if (!card || card.classList.contains("hidden")) return;
        draggedDashboardCard = card;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.cardId); // Firefox needs this to allow drag
        setTimeout(() => card.classList.add("opacity-40"), 0); // after the drag image is captured
    });

    grid.addEventListener("dragover", (e) => {
        if (!draggedDashboardCard) return;
        e.preventDefault(); // required to be a valid drop target
        const target = e.target.closest("[data-card-id]");
        if (!target || target === draggedDashboardCard) return;
        const rect = target.getBoundingClientRect();
        const insertAfter = e.clientX - rect.left > rect.width / 2;
        target.parentNode.insertBefore(draggedDashboardCard, insertAfter ? target.nextSibling : target);
    });

    grid.addEventListener("drop", (e) => e.preventDefault()); // block default drop navigation

    grid.addEventListener("dragend", () => {
        if (!draggedDashboardCard) return;
        draggedDashboardCard.classList.remove("opacity-40");
        draggedDashboardCard = null;
        saveDashboardCardOrder();
    });
}

// Global state
let modalLocalStagedBatchChecklist = [];
let activeOperationType = "IN";
let pendingScannedCodeCache = "";
let moveBarcodeDebounceTimer = null;
let barcodeScannerKeyboardInputDebounceTimerId = null;
let systemInventoryDatabase = [];
if (typeof window.mockGlobalStockHistoryLedger === 'undefined') {
    window.mockGlobalStockHistoryLedger = [];
}

// Each product has its own optional low_stock_threshold, set by management.
// "Out of stock" is qty 0 for everyone; "low stock" only applies if a threshold is set.
function isOutOfStock(item) {
    return (item.availableQty ?? item.quantity ?? 0) === 0;
}
function isLowStock(item) {
    const qty = item.availableQty ?? item.quantity ?? 0;
    const threshold = item.lowStockThreshold ?? item.low_stock_threshold;
    return qty > 0 && threshold != null && qty < threshold;
}

// Fetch inventory data (stats + local cache)
async function fetchInventoryData() {
    try {
        // Not filtered to the current branch: needed for the cross-branch search popup
        const response = await fetch(`${apiUrl}/api/inventory/list`, {
            cache: "no-store",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}`,
                "Content-Type": "application/json"
            }
        });

        if (response.ok) {
            const items = await response.json();

            const totalEl = document.getElementById("statTotalItems");
            if (totalEl) totalEl.innerText = items.length;

            // "All Products" catalog rows aren't stocked at any real branch, so exclude them -
            // a product never stocked anywhere isn't "out of stock", it just hasn't arrived yet
            const branchStockedItems = items.filter(i => i.branch !== PRODUCT_SYSTEM_CATALOG_BRANCH);
            const lowStock = branchStockedItems.filter(i => isLowStock({ quantity: i.quantity, low_stock_threshold: i.low_stock_threshold })).length;
            const outOfStock = branchStockedItems.filter(i => isOutOfStock({ quantity: i.quantity })).length;
            const lowEl = document.getElementById("statTotalLowStock");
            if (lowEl) lowEl.innerText = lowStock;
            const outEl = document.getElementById("statTotalOutOfStock");
            if (outEl) outEl.innerText = outOfStock;

            // Local cache for barcode lookup
            systemInventoryDatabase = items.map(i => ({
                productId: i.id,
                barcode: i.barcode,
                productName: i.name,
                availableQty: i.quantity,
                lowStockThreshold: i.low_stock_threshold,
                fullStockQuantity: i.full_stock_quantity,
                // No "|| 1" fallback: a product only belongs to a stockroom once Stock In assigns one
                storeroom: i.storeroom_id != null ? i.storeroom_id : null,
                shelf: i.storeroom_id != null ? (i.shelf_name || "A") : null,
                row: i.storeroom_id != null ? (i.row_number || 1) : null,
                column: i.storeroom_id != null ? (i.column_number || 1) : null,
                branch: i.branch || "",
                price: i.price != null ? i.price : null,
                photo: i.photo || null,
                shelfQuantity: i.shelf_quantity || 0,
                storeShelf: i.store_shelf_name != null ? i.store_shelf_name : null,
                storeRow: i.store_row_number != null ? i.store_row_number : null,
                storeColumn: i.store_column_number != null ? i.store_column_number : null
            }));

            refreshStockLevelNotifications(lowStock, outOfStock);
        }
    } catch (err) {
        console.error("fetchInventoryData error:", err);
    }
}

// Persistent notifications (no dismiss button), stay until stock is actually replenished
const LOW_STOCK_NOTIFICATION_ID = 9002;
const OUT_OF_STOCK_NOTIFICATION_ID = 9003;
function refreshStockLevelNotifications(lowStockCount, outOfStockCount) {
    systemNotificationsLedger = systemNotificationsLedger.filter(
        n => n.id !== LOW_STOCK_NOTIFICATION_ID && n.id !== OUT_OF_STOCK_NOTIFICATION_ID
    );

    if (outOfStockCount > 0) {
        systemNotificationsLedger.unshift({
            id: OUT_OF_STOCK_NOTIFICATION_ID,
            text: `${outOfStockCount} product${outOfStockCount === 1 ? "" : "s"} out of stock in ${getCurrentBranch()}.`,
            onClick: "openProductListModal()",
            persistent: true
        });
    }
    if (lowStockCount > 0) {
        systemNotificationsLedger.unshift({
            id: LOW_STOCK_NOTIFICATION_ID,
            text: `${lowStockCount} product${lowStockCount === 1 ? "" : "s"} running low on stock in ${getCurrentBranch()}.`,
            onClick: "openProductListModal()",
            persistent: true
        });
    }

    renderNotificationListUI();
}

async function fetchDashboardStats() {
    try {
        // AMS-0000 isn't tied to a branch, needs every branch's history. Everyone else stays scoped.
        const branchQuery = isChairmanAccount() ? "" : `?branch=${encodeURIComponent(getCurrentBranch())}`;
        const response = await fetch(`${apiUrl}/api/inventory/history-list${branchQuery}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (response.ok) {
            const logs = await response.json();
            window.mockGlobalStockHistoryLedger = logs;

            const inCount = logs.filter(l => l.type === "IN").length;
            const outCount = logs.filter(l => l.type === "OUT").length;
            const moveCount = logs.filter(l => l.type === "MOVE").length;

            if (document.getElementById("statTotalStockIn")) document.getElementById("statTotalStockIn").innerText = inCount;
            if (document.getElementById("statTotalStockOut")) document.getElementById("statTotalStockOut").innerText = outCount;
            if (document.getElementById("statTotalTransfers")) document.getElementById("statTotalTransfers").innerText = moveCount;

            // Sale card: total units sold today (approved Stock Out only)
            const todayKey = new Date().toISOString().split("T")[0];
            const soldToday = logs
                .filter(l => l.type === "OUT" && l.approved !== false && (l.date || "").startsWith(todayKey))
                .reduce((sum, l) => sum + (l.qty || 0), 0);
            if (document.getElementById("statTotalSaleToday")) document.getElementById("statTotalSaleToday").innerText = soldToday;

            // Top Selling card: how many distinct products sold at least one unit today
            const countEl = document.getElementById("statTopSellingProductCount");
            if (countEl) {
                const todaysSoldProductKeys = new Set();
                logs.forEach(l => {
                    if (l.type !== "OUT" || l.approved === false || !(l.date || "").startsWith(todayKey)) return;
                    todaysSoldProductKeys.add(l.barcode || l.item);
                });
                countEl.innerText = todaysSoldProductKeys.size;
            }

            updateMustStockNextMonthLabel();

            refreshPendingApprovalNotification(logs);
            refreshRecentActivityNotifications(logs);
        }
    } catch (err) {
        console.error("fetchDashboardStats error:", err);
    }
}

// Manager/admin notification of pending staff submissions, persistent until actually approved
const PENDING_APPROVAL_NOTIFICATION_ID = 9001;
function refreshPendingApprovalNotification(logs) {
    systemNotificationsLedger = systemNotificationsLedger.filter(n => n.id !== PENDING_APPROVAL_NOTIFICATION_ID);

    if (isCurrentUserManager()) {
        const pendingCount = logs.filter(l => l.approved === false).length;
        if (pendingCount > 0) {
            systemNotificationsLedger.unshift({
                id: PENDING_APPROVAL_NOTIFICATION_ID,
                text: `${pendingCount} stock ${pendingCount === 1 ? "entry is" : "entries are"} waiting for your approval.`,
                onClick: "loadStockHistorySection()",
                persistent: true
            });
        }
    }

    renderNotificationListUI();
}

// After login/branch-select, pops open if there are pending approvals. Closing it doesn't
// mark it "seen" - it reopens next login if anything is still unapproved.
function popupApprovalNotificationIfPending() {
    if (!isCurrentUserManager()) return;
    const hasPending = systemNotificationsLedger.some(n => n.id === PENDING_APPROVAL_NOTIFICATION_ID);
    if (!hasPending) return;
    openApprovalNeededModal();
}

function renderApprovalNeededList() {
    const listEl = document.getElementById("approvalNeededList");
    const subtitleEl = document.getElementById("approvalNeededSubtitle");
    if (!listEl) return;

    const pending = (window.mockGlobalStockHistoryLedger || []).filter(l => l.approved === false);

    if (subtitleEl) {
        subtitleEl.innerText = pending.length === 0
            ? "All caught up"
            : `${pending.length} ${pending.length === 1 ? "entry" : "entries"} waiting for your approval`;
    }

    if (pending.length === 0) {
        listEl.innerHTML = `<div class="p-6 text-center border-2 border-dashed border-[#E6B950]/20 rounded-xl font-bold text-sm text-gray-500 uppercase">Nothing pending — all caught up.</div>`;
        return;
    }

    listEl.innerHTML = pending.map(log => `
        <div class="border-2 border-[#E6B950]/15 rounded-2xl p-4 space-y-2 bg-black/30">
            <div class="flex items-start justify-between gap-2">
                <h4 class="text-sm font-black text-white uppercase truncate">${escapeHtml(log.item || "Unknown Product")}</h4>
                <span class="text-[9px] font-mono font-black border px-2 py-0.5 rounded tracking-widest shrink-0 ${log.type === "IN" ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40" : log.type === "OUT" ? "bg-red-950/40 text-red-400 border-red-500/40" : "bg-amber-950/40 text-amber-400 border-amber-500/40"}">${escapeHtml(log.type)}</span>
            </div>
            <div class="space-y-0.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                <p>Barcode: <span class="text-gray-300 font-mono">${escapeHtml(log.barcode || "---")}</span></p>
                <p>Quantity: <span class="text-white font-black">${log.qty || 0} Pcs</span></p>
                <p>By: <span class="text-gray-300">${escapeHtml(log.user || "---")}</span> &middot; <span class="text-gray-300">${escapeHtml(log.date || "")}</span></p>
            </div>
            <button type="button" onclick="approveFromApprovalNeededModal(${log.id})"
                class="w-full bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 font-black text-xs uppercase tracking-widest py-2 px-4 rounded-xl transition-all active:scale-95">
                Approve &amp; Apply Stock ⚡
            </button>
        </div>
    `).join("");
}

function openApprovalNeededModal() {
    renderApprovalNeededList();
    openRightSlidePanel("approvalNeededModal");
}

function closeApprovalNeededModal() {
    closeRightSlidePanel("approvalNeededModal");
}

async function approveFromApprovalNeededModal(transactionId) {
    await commitVerifyStatusFromCard(transactionId);
    renderApprovalNeededList();
}

// ============================================================
// SYSTEM UPDATES (AMS-Adm only): full system activity feed - every login plus every Stock
// In/Out/Move across every branch. See GET /api/system-activity-feed in main.py.
// ============================================================
async function openSystemUpdatesModal() {
    const list = document.getElementById("systemUpdatesList");
    if (list) list.innerHTML = `<p class="text-center text-gray-400 font-bold uppercase text-sm py-10">Loading...</p>`;
    openRightSlidePanel("systemUpdatesModal");

    try {
        const response = await fetch(`${apiUrl}/api/system-activity-feed`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        renderSystemUpdatesList(data.groups || []);
    } catch (err) {
        console.error("openSystemUpdatesModal error:", err);
        if (list) list.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Failed to load system updates.</p>`;
    }
}

function closeSystemUpdatesModal() {
    closeRightSlidePanel("systemUpdatesModal");
}

// Control Metrics Hub (AMS-Adm only): one card standing in for 8 separate metric cards
function openControlMetricsHub() {
    openRightSlidePanel("controlMetricsHubModal");
}

function closeControlMetricsHub() {
    closeRightSlidePanel("controlMetricsHubModal");
}

// Live Monitoring (AMS-Adm only): CCTV cameras + live activity feed, not recorded
let liveMonitoringCameras = [];
let liveMonitoringHls = null;
let activeLiveCameraId = null;
let liveActivityPollIntervalId = null;
const LIVE_ACTIVITY_POLL_MS = 4000;

async function openLiveMonitoringModal() {
    openRightSlidePanel("liveMonitoringModal");
    await renderCameraList();
    pollLiveActivityFeed();
    if (liveActivityPollIntervalId) clearInterval(liveActivityPollIntervalId);
    liveActivityPollIntervalId = setInterval(pollLiveActivityFeed, LIVE_ACTIVITY_POLL_MS);
}

function closeLiveMonitoringModal() {
    closeRightSlidePanel("liveMonitoringModal");
    stopLiveCameraStream();
    if (liveActivityPollIntervalId) {
        clearInterval(liveActivityPollIntervalId);
        liveActivityPollIntervalId = null;
    }
}

function toggleAddCameraForm() {
    document.getElementById("addCameraFormWrap")?.classList.toggle("hidden");
}

async function renderCameraList() {
    const wrap = document.getElementById("cameraListWrap");
    if (!wrap) return;
    wrap.innerHTML = `<p class="col-span-full text-center text-zinc-500 font-bold uppercase text-xs py-4">Loading cameras...</p>`;

    try {
        const response = await fetch(`${apiUrl}/api/cameras`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        liveMonitoringCameras = response.ok ? await response.json() : [];

        if (liveMonitoringCameras.length === 0) {
            wrap.innerHTML = `<p class="col-span-full text-center text-zinc-500 font-bold uppercase text-xs py-4">No cameras added yet - use "+ Add Camera" above.</p>`;
            return;
        }

        wrap.innerHTML = liveMonitoringCameras.map(cam => `
            <button type="button" onclick="selectLiveCamera(${cam.id})" class="relative bg-zinc-900 border-2 ${activeLiveCameraId === cam.id ? "border-red-500" : "border-zinc-800 hover:border-red-500/50"} rounded-xl p-3 text-left transition-all">
                <span class="block text-[10px] font-black uppercase tracking-widest text-zinc-500">${escapeHtml(cam.branch)}</span>
                <span class="block text-sm font-black text-white truncate pr-4">${escapeHtml(cam.name)}</span>
                <button type="button" onclick="event.stopPropagation(); confirmDeleteCamera(${cam.id}, '${escapeHtml(cam.name).replace(/'/g, "\\'")}')" class="absolute top-2 right-2 text-zinc-600 hover:text-red-400 text-xs" title="Delete Camera">🗑</button>
            </button>
        `).join("");
    } catch (err) {
        console.error("renderCameraList error:", err);
        wrap.innerHTML = `<p class="col-span-full text-center text-red-400 font-bold uppercase text-xs py-4">Failed to load cameras.</p>`;
    }
}

async function submitAddCamera() {
    const branch = document.getElementById("newCameraBranch")?.value;
    const name = document.getElementById("newCameraName")?.value.trim();
    const rtspUrl = document.getElementById("newCameraRtspUrl")?.value.trim();
    const statusEl = document.getElementById("addCameraFormStatus");

    if (!name || !rtspUrl) {
        if (statusEl) statusEl.innerText = "Camera name and RTSP URL are both required.";
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/api/cameras`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ branch, name, rtsp_url: rtspUrl })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to add camera.");

        document.getElementById("newCameraName").value = "";
        document.getElementById("newCameraRtspUrl").value = "";
        if (statusEl) statusEl.innerText = "";
        toggleAddCameraForm();
        await renderCameraList();
        if (typeof displayNotification === "function") displayNotification(`Camera "${name}" added.`, true);
    } catch (err) {
        console.error("submitAddCamera error:", err);
        if (statusEl) statusEl.innerText = err.message || "Failed to add camera.";
    }
}

function confirmDeleteCamera(cameraId, name) {
    if (!confirm(`Delete camera "${name}"? This stops its stream too if it's currently live.`)) return;
    deleteCameraFromList(cameraId);
}

async function deleteCameraFromList(cameraId) {
    try {
        if (activeLiveCameraId === cameraId) stopLiveCameraStream();
        const response = await fetch(`${apiUrl}/api/cameras/${cameraId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Request failed");
        await renderCameraList();
        if (typeof displayNotification === "function") displayNotification("Camera deleted.", true);
    } catch (err) {
        console.error("deleteCameraFromList error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to delete camera.", false);
    }
}

async function selectLiveCamera(cameraId) {
    if (activeLiveCameraId === cameraId) return; // already watching this camera

    const video = document.getElementById("liveMonitoringVideo");
    const statusEl = document.getElementById("liveMonitoringPlayerStatus");
    const previousCameraId = activeLiveCameraId;

    stopLiveCameraStream(); // stop whatever was playing before
    activeLiveCameraId = cameraId;
    renderCameraList(); // repaint so the new camera's border highlights

    if (video) video.classList.add("hidden");
    if (statusEl) { statusEl.classList.remove("hidden"); statusEl.innerText = "Connecting to camera…"; }

    try {
        const response = await fetch(`${apiUrl}/api/cameras/${cameraId}/start-stream`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to start camera stream.");

        // Give ffmpeg a couple seconds to produce the first HLS segments before loading
        setTimeout(() => attachHlsPlayer(`${apiUrl}${data.hls_url}`), 2500);
    } catch (err) {
        console.error("selectLiveCamera error:", err);
        activeLiveCameraId = previousCameraId;
        if (statusEl) { statusEl.classList.remove("hidden"); statusEl.innerText = err.message || "Failed to start camera stream."; }
        renderCameraList();
    }
}

function attachHlsPlayer(hlsUrl) {
    const video = document.getElementById("liveMonitoringVideo");
    const statusEl = document.getElementById("liveMonitoringPlayerStatus");
    if (!video) return;

    if (liveMonitoringHls) {
        liveMonitoringHls.destroy();
        liveMonitoringHls = null;
    }

    if (window.Hls && window.Hls.isSupported()) {
        liveMonitoringHls = new Hls();
        liveMonitoringHls.loadSource(hlsUrl);
        liveMonitoringHls.attachMedia(video);
        liveMonitoringHls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.classList.remove("hidden");
            if (statusEl) statusEl.classList.add("hidden");
            video.play().catch(() => {});
        });
        liveMonitoringHls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal && statusEl) {
                statusEl.classList.remove("hidden");
                statusEl.innerText = "Lost connection to the camera stream.";
                video.classList.add("hidden");
            }
        });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari plays HLS natively, no hls.js needed.
        video.src = hlsUrl;
        video.classList.remove("hidden");
        if (statusEl) statusEl.classList.add("hidden");
        video.play().catch(() => {});
    } else if (statusEl) {
        statusEl.classList.remove("hidden");
        statusEl.innerText = "This browser can't play the live stream.";
    }
}

function stopLiveCameraStream() {
    if (liveMonitoringHls) {
        liveMonitoringHls.destroy();
        liveMonitoringHls = null;
    }
    const video = document.getElementById("liveMonitoringVideo");
    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.classList.add("hidden");
    }
    const statusEl = document.getElementById("liveMonitoringPlayerStatus");
    if (statusEl) { statusEl.classList.remove("hidden"); statusEl.innerText = "Select a camera to start watching."; }

    if (activeLiveCameraId != null) {
        const cameraId = activeLiveCameraId;
        activeLiveCameraId = null;
        fetch(`${apiUrl}/api/cameras/${cameraId}/stop-stream`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        }).catch(err => console.error("stopLiveCameraStream error:", err));
    }
}

const LIVE_ACTIVITY_TYPE_STYLE = {
    LOGIN: "bg-violet-950/40 text-violet-300 border-violet-800",
    IN: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
    OUT: "bg-red-950/40 text-red-300 border-red-800",
    MOVE: "bg-amber-950/40 text-amber-300 border-amber-800",
};

async function pollLiveActivityFeed() {
    const list = document.getElementById("liveActivityFeedList");
    if (!list) return;

    try {
        const response = await fetch(`${apiUrl}/api/live-activity-feed?limit=20`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        const events = data.events || [];

        if (events.length === 0) {
            list.innerHTML = `<p class="text-center text-zinc-600 font-bold uppercase text-[10px] py-4">No activity yet.</p>`;
            return;
        }

        list.innerHTML = events.map(evt => `
            <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-[9px] font-mono font-black border px-1.5 py-0.5 rounded tracking-widest ${LIVE_ACTIVITY_TYPE_STYLE[evt.type] || "bg-zinc-800 text-zinc-400 border-zinc-700"}">${escapeHtml(evt.type)}</span>
                    <span class="text-[9px] font-mono text-zinc-500">${new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p class="text-[11px] font-bold text-zinc-200 truncate">${escapeHtml(evt.description)}</p>
                <p class="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">${escapeHtml(evt.username || "")}${evt.branch ? " · " + escapeHtml(evt.branch) : ""}</p>
            </div>
        `).join("");
    } catch (err) {
        console.error("pollLiveActivityFeed error:", err);
    }
}

const SYSTEM_UPDATE_TYPE_STYLE = {
    LOGIN: "bg-violet-950/40 text-violet-300 border-violet-800",
    IN: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
    OUT: "bg-red-950/40 text-red-300 border-red-800",
    MOVE: "bg-amber-950/40 text-amber-300 border-amber-800",
};

function renderSystemUpdatesList(groups) {
    const list = document.getElementById("systemUpdatesList");
    if (!list) return;

    if (groups.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-400 font-bold uppercase text-sm py-10">No activity recorded yet.</p>`;
        return;
    }

    list.innerHTML = groups.map(group => `
        <div>
            <h4 class="text-xs font-black uppercase tracking-widest text-gray-400 border-b-2 border-[#E6B950]/20 pb-2 mb-3">${escapeHtml(group.date)}</h4>
            <div class="space-y-2">
                ${group.events.map(evt => `
                    <div class="flex items-center gap-3 bg-black/30 border border-[#E6B950]/15 rounded-xl p-3">
                        <span class="w-7 h-7 rounded-full bg-black/60 text-[#E6B950] text-[10px] font-black flex items-center justify-center shrink-0">${evt.serial}</span>
                        <span class="text-[9px] font-mono font-black border px-2 py-0.5 rounded tracking-widest shrink-0 ${SYSTEM_UPDATE_TYPE_STYLE[evt.type] || "bg-zinc-800 text-gray-400 border-zinc-700"}">${escapeHtml(evt.type)}</span>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-bold text-white truncate">${escapeHtml(evt.description)}</p>
                            <p class="text-[10px] font-bold text-gray-500 uppercase mt-0.5">${escapeHtml(evt.username || "")}${evt.branch ? " · " + escapeHtml(evt.branch) : ""}</p>
                        </div>
                        <span class="text-[10px] font-mono font-bold text-gray-500 shrink-0">${escapeHtml(evt.time)}</span>
                    </div>
                `).join("")}
            </div>
        </div>
    `).join("");
}

// Turns recent Stock IN/OUT/MOVE activity into dismissible notifications, keyed by transaction id
const RECENT_ACTIVITY_NOTIFICATION_ID_BASE = 10000;
const RECENT_ACTIVITY_NOTIFICATION_LIMIT = 3;
function refreshRecentActivityNotifications(logs) {
    systemNotificationsLedger = systemNotificationsLedger.filter(n => n.id < RECENT_ACTIVITY_NOTIFICATION_ID_BASE);

    const dismissed = getDismissedNotificationIds();
    const verbByType = { IN: "stocked in", OUT: "stocked out", MOVE: "moved" };

    logs
        .filter(l => l.approved !== false)
        .slice(0, RECENT_ACTIVITY_NOTIFICATION_LIMIT)
        .forEach(txn => {
            const id = RECENT_ACTIVITY_NOTIFICATION_ID_BASE + txn.id;
            if (dismissed.has(id)) return;
            systemNotificationsLedger.push({
                id,
                text: `${escapeHtml(txn.item || txn.barcode)} (x${txn.qty}) was ${verbByType[txn.type] || "updated"}.`,
                onClick: "loadStockHistorySection()"
            });
        });

    renderNotificationListUI();
}

// User profile: single source of truth, modal and header both read from here
window.currentUserProfile = null;

// Every role-dependent show/hide rule in one place, so it can re-apply when just the
// mode changes (e.g. entering/exiting Chairman Control) without a fresh profile fetch
function applyAccountVisibilityRules() {
    const role = (window.currentUserProfile?.role || localStorage.getItem("user_role") || "staff").toLowerCase();
    const username = (localStorage.getItem("username") || "").toUpperCase();

    document.querySelectorAll(".mgmt-metric-card").forEach(el => el.classList.toggle("hidden", !isCurrentUserManager()));
    document.getElementById("tillManagementBtn")?.classList.toggle("hidden", !isCurrentUserManager());

    // Your Attendance is for staff and management only, not the chairman account
    document.getElementById("yourAttendanceBtn")?.classList.toggle("hidden", !["staff", "management"].includes(role));

    // The two permanent admin accounts can never self-delete, regardless of Control mode
    const isProtectedAdminAccount = CHAIRMAN_LEVEL_USERNAMES.includes(username);
    document.getElementById("dangerZoneDeleteAccount")?.classList.toggle("hidden", isProtectedAdminAccount);

    // Both AMS-0000 and AMS-Adm have no storeroom access at all while viewing their own
    // cross-branch dashboard - they get the Staff Attendance card instead (shared, see
    // .ams0000-only-card), and only they do; not even other management/admin accounts see it.
    // Control mode drops either into one branch's normal management dashboard instead, so
    // isChairmanAccount() (mode-aware) goes false and this section flips back to the ordinary
    // Stockroom section like any manager gets.
    document.getElementById("storeroomsSection")?.classList.toggle("hidden", hasNoStockroomSection());
    document.querySelectorAll(".ams0000-only-card").forEach(el => el.classList.toggle("hidden", !isChairmanAccount()));

    // Stockrooms/Store/Till read-only browsing cards (.ams0000-exclusive-card) are true
    // AMS-0000-only now - AMS-Adm gets the same three, but editable, folded into the "Full
    // Management" card instead (.ams-adm-only-card below, see openFullManagementPicker).
    document.querySelectorAll(".ams0000-exclusive-card").forEach(el => el.classList.toggle("hidden", !(isChairmanAccount() && username === "AMS-0000")));

    // While viewing a chairman account's cross-branch dashboard, branch-scoped stock
    // actions are hidden and replaced by a single "Control" button
    const chairmanViewActive = isChairmanAccount();
    ["sidebarStockInBtn", "sidebarStockOutBtn", "sidebarStockMoveBtn", "sidebarStockHistoryBtn", "storeManagementBtn"]
        .forEach(id => document.getElementById(id)?.classList.toggle("hidden", chairmanViewActive));
    document.getElementById("chairmanControlBtn")?.classList.toggle("hidden", !chairmanViewActive);
    document.getElementById("exitControlModeBtn")?.classList.toggle("hidden", !(isProtectedAdminAccount && isChairmanControlModeActive()));

    // The back arrow has nowhere to go while on the cross-branch dashboard, so hide it
    document.getElementById("backToBranchesBtn")?.classList.toggle("hidden", chairmanViewActive);

    // AMS-Adm-only cards: Products, Updates, Full Management - not even AMS-0000 sees these
    document.querySelectorAll(".ams-adm-only-card").forEach(el => el.classList.toggle("hidden", username !== "AMS-ADM"));

    // Same shared card, own label per account
    const staffAttendanceCardLabel = document.getElementById("staffAttendanceCardLabel");
    if (staffAttendanceCardLabel) staffAttendanceCardLabel.innerText = username === "AMS-ADM" ? "Attendance" : "Staff Attendance";

    // AMS-Adm's cross-branch dashboard swaps 8 metric cards for one "Control" card
    const showControlHubInstead = username === "AMS-ADM" && chairmanViewActive;
    document.querySelectorAll(".dashboard-metric-summary-card").forEach(el => el.classList.toggle("hidden", showControlHubInstead));
    document.getElementById("controlMetricsHubCard")?.classList.toggle("hidden", !showControlHubInstead);

    // The toggle above un-hides cards that are also .mgmt-metric-card, so re-apply the role hide last
    document.querySelectorAll(".mgmt-metric-card").forEach(el => el.classList.toggle("hidden", !isCurrentUserManager()));

    // Total Items used to be staff-only, now nobody gets it - always hidden
    document.querySelectorAll(".staff-only-card").forEach(el => el.classList.add("hidden"));

    // Card visibility just changed, so re-apply the column layout and saved drag order
    layoutDashboardCardGrid();
    applyDashboardCardOrder();

    // Both get the same cross-branch layout, but keep their own distinct label
    if (document.getElementById("headerUserRole")) {
        document.getElementById("headerUserRole").innerText = chairmanViewActive
            ? (username === "AMS-ADM" ? "Admin" : "Chairman")
            : role.toUpperCase();
    }
}

async function loadAuthenticatedUserProfile(loggedInUserId) {
    if (!loggedInUserId) return;

    try {
        const response = await fetch(`${apiUrl}/api/user-profile?username=${encodeURIComponent(loggedInUserId)}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            window.currentUserProfile = data;

            localStorage.setItem("user_role", data.role || "staff");
            localStorage.setItem("user_name", data.name || loggedInUserId);
            localStorage.setItem("username", loggedInUserId);
            // Marks this browser TAB (not the whole browser) as having an active login, so a
            // same-tab reload can restore straight to the dashboard while opening the inventory
            // page fresh (new tab/window, e.g. a plain visit or VS Code "Go Live") always falls
            // back to the login screen, even if an old access_token is still sitting in
            // localStorage from a previous session - see restoreSessionIfAvailable().
            sessionStorage.setItem("amsons_session_active", "1");

            applyAccountVisibilityRules();

            if (document.getElementById("headerUserName")) document.getElementById("headerUserName").innerText = data.name || loggedInUserId;
            if (data.face_photo && document.getElementById("headerUserAvatar")) {
                document.getElementById("headerUserAvatar").src = data.face_photo;
            }

            fetchInventoryData();
            fetchDashboardStats();
            renderStoreroomCards();
            // AI Cam starts later once the dashboard is open, not here at login time
        }
    } catch (err) {
        console.error("loadAuthenticatedUserProfile error:", err);
    }
}

// AI Cam: live product recognition widget, grabs a frame every few seconds and
// prompts Stock In/Out when it recognizes something
let aiCamStream = null;
let aiCamIntervalId = null;
let aiCamActive = false;
let aiCamLastSignature = null;
let aiCamLastSignatureAt = 0;
const AI_CAM_SCAN_INTERVAL_MS = 2500;
const AI_CAM_REPEAT_COOLDOWN_MS = 20000; // don't re-popup the same item within this window

async function startAiCamWidget() {
    if (aiCamActive) return;
    const video = document.getElementById("aiCamVideoFeed");
    if (!video || !navigator.mediaDevices?.getUserMedia) return;

    try {
        aiCamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: 320, height: 240 },
            audio: false
        });
        video.srcObject = aiCamStream;
        video.classList.remove("hidden");
        document.getElementById("aiCamIdleIcon")?.classList.add("hidden");
        document.getElementById("aiCamLiveDot")?.classList.remove("hidden");
        aiCamActive = true;
        setAiCamAmbientStatus(AI_CAM_IDLE_STATUS_TEXT);

        if (aiCamIntervalId) clearInterval(aiCamIntervalId);
        aiCamIntervalId = setInterval(runAiCamDetectionCycle, AI_CAM_SCAN_INTERVAL_MS);
    } catch (err) {
        console.warn("AI Cam camera access blocked or unavailable:", err);
    }
}

function stopAiCamWidget() {
    if (aiCamStream) {
        aiCamStream.getTracks().forEach(track => track.stop());
        aiCamStream = null;
    }
    if (aiCamIntervalId) {
        clearInterval(aiCamIntervalId);
        aiCamIntervalId = null;
    }
    aiCamActive = false;
    document.getElementById("aiCamVideoFeed")?.classList.add("hidden");
    document.getElementById("aiCamIdleIcon")?.classList.remove("hidden");
    document.getElementById("aiCamLiveDot")?.classList.add("hidden");
    setAiCamAmbientStatus("");
}

function toggleAiCamWidget() {
    if (aiCamActive) stopAiCamWidget();
    else startAiCamWidget();
}

async function runAiCamDetectionCycle() {
    // Don't pile detections on top of an already-open popup/modal
    if (!document.getElementById("newProductRoutingRegistrationModal")?.classList.contains("hidden")) return;
    if (!document.getElementById("barcodeNotInSystemModal")?.classList.contains("hidden")) return;
    if (!document.getElementById("stockOperationSlidingModal")?.classList.contains("hidden")) return;
    if (!document.getElementById("storeOperationSlidingModal")?.classList.contains("hidden")) return;

    const video = document.getElementById("aiCamVideoFeed");
    const canvas = document.getElementById("aiCamCaptureCanvas");
    if (!video || !canvas || !aiCamStream || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameData = canvas.toDataURL("image/jpeg", 0.6);

    try {
        const response = await fetch(`${apiUrl}/api/inventory/realtime-vision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_data: frameData, branch: getCurrentBranch() })
        });
        if (!response.ok) {
            // Log failures so they're distinguishable from normal idle scanning
            const errBody = await response.text().catch(() => "");
            console.error(`AI Cam detection request failed (HTTP ${response.status}):`, errBody);
            return;
        }
        handleAiCamDetectionResult(await response.json());
    } catch (err) {
        console.error("AI Cam detection error:", err);
    }
}

const AI_CAM_IDLE_STATUS_TEXT = "📷 AI Cam scanning… show an Amsons product to begin.";

function setAiCamAmbientStatus(text) {
    const statusEl = document.getElementById("aiCamAmbientStatus");
    if (statusEl) statusEl.innerText = text;
}

function handleAiCamDetectionResult(data) {
    if (!data.detected || (!data.barcode && !data.suggested_name)) {
        setAiCamAmbientStatus(AI_CAM_IDLE_STATUS_TEXT);
        return;
    }

    setAiCamAmbientStatus("");

    // Dedup key: barcode if we have one, otherwise the AI's name guess
    const signature = data.barcode || data.suggested_name;
    const now = Date.now();
    if (signature === aiCamLastSignature && (now - aiCamLastSignatureAt) < AI_CAM_REPEAT_COOLDOWN_MS) return;
    aiCamLastSignature = signature;
    aiCamLastSignatureAt = now;

    // Check our own inventory across EVERY branch (not just the backend's is_registered flag,
    // which only looked at the current branch) - a product stocked at another branch should show
    // the same cross-branch "not here, but at X" popup a manual search/scan gets, not route into
    // Add Stock as if it were unknown to this system entirely.
    const matches = data.barcode ? (systemInventoryDatabase || []).filter(p => p.barcode === data.barcode) : [];
    if (matches.length > 0) {
        resolveSearchedBarcode(data.barcode, matches);
    } else if (data.in_catalog) {
        // Known to Lightspeed but not stocked at any branch yet: same "Add Stock" popup a manual scan gets
        pendingScannedCodeCache = data.barcode;
        openNewProductRegistrationPopup(data.barcode, data.product_name);
    } else {
        // Not found anywhere: not in this system, not in Lightspeed either
        openBarcodeNotInSystemModal();
    }
}

// Modal-scoped AI Camera (Stock In/Out/Move + Store In/Out barcode fields): each
// button gets its own camera instance, drops the barcode into its own field on a hit
const modalAiCamInstances = {
    stockIn: { videoId: "stockInAiCamVideo", canvasId: "stockInAiCamCanvas", btnId: "stockInAiCamBtn", iconId: "stockInAiCamIcon", liveDotId: "stockInAiCamLiveDot", barcodeFieldId: "slideBarcode", onBarcodeFilled: (barcode) => handleSlideBarcodeAutoSearch(barcode) },
    stockMove: { videoId: "stockMoveAiCamVideo", canvasId: "stockMoveAiCamCanvas", btnId: "stockMoveAiCamBtn", iconId: "stockMoveAiCamIcon", liveDotId: "stockMoveAiCamLiveDot", barcodeFieldId: "slideBarcodeMove", onBarcodeFilled: (barcode) => handleSlideBarcodeAutoSearch(barcode) },
    storeOp: { videoId: "storeOpAiCamVideo", canvasId: "storeOpAiCamCanvas", btnId: "storeOpAiCamBtn", iconId: "storeOpAiCamIcon", liveDotId: "storeOpAiCamLiveDot", barcodeFieldId: "storeSlideBarcode", onBarcodeFilled: (barcode) => handleStoreSlideBarcodeAutoSearch(barcode) },
};

function toggleModalAiCam(key) {
    const inst = modalAiCamInstances[key];
    if (!inst) return;
    if (inst.stream) stopModalAiCam(key);
    else startModalAiCam(key);
}

async function startModalAiCam(key) {
    const inst = modalAiCamInstances[key];
    const video = inst && document.getElementById(inst.videoId);
    if (!inst || inst.stream || !video || !navigator.mediaDevices?.getUserMedia) return;

    try {
        inst.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: 320, height: 240 },
            audio: false
        });
        video.srcObject = inst.stream;
        video.classList.remove("hidden");
        document.getElementById(inst.iconId)?.classList.add("hidden");
        document.getElementById(inst.liveDotId)?.classList.remove("hidden");

        if (inst.intervalId) clearInterval(inst.intervalId);
        inst.intervalId = setInterval(() => runModalAiCamCycle(key), AI_CAM_SCAN_INTERVAL_MS);
    } catch (err) {
        console.warn(`Modal AI Cam (${key}) camera access blocked or unavailable:`, err);
    }
}

function stopModalAiCam(key) {
    const inst = modalAiCamInstances[key];
    if (!inst) return;
    if (inst.stream) {
        inst.stream.getTracks().forEach(track => track.stop());
        inst.stream = null;
    }
    if (inst.intervalId) {
        clearInterval(inst.intervalId);
        inst.intervalId = null;
    }
    document.getElementById(inst.videoId)?.classList.add("hidden");
    document.getElementById(inst.iconId)?.classList.remove("hidden");
    document.getElementById(inst.liveDotId)?.classList.add("hidden");
}

async function runModalAiCamCycle(key) {
    const inst = modalAiCamInstances[key];
    const video = inst && document.getElementById(inst.videoId);
    const canvas = inst && document.getElementById(inst.canvasId);
    if (!inst || !video || !canvas || !inst.stream || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameData = canvas.toDataURL("image/jpeg", 0.6);

    try {
        const response = await fetch(`${apiUrl}/api/inventory/realtime-vision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_data: frameData, branch: getCurrentBranch() })
        });
        if (!response.ok) return;
        const data = await response.json();
        // A form field needs an actual barcode, a name-only guess isn't enough here
        if (!data.detected || !data.barcode) return;

        const now = Date.now();
        if (data.barcode === inst.lastSignature && (now - (inst.lastSignatureAt || 0)) < AI_CAM_REPEAT_COOLDOWN_MS) return;
        inst.lastSignature = data.barcode;
        inst.lastSignatureAt = now;

        const field = document.getElementById(inst.barcodeFieldId);
        if (field) field.value = data.barcode;
        inst.onBarcodeFilled(data.barcode);
    } catch (err) {
        console.error(`Modal AI Cam (${key}) detection error:`, err);
    }
}

// Product-name autocomplete: type-ahead over systemInventoryDatabase, selecting a
// suggestion is just a faster way to reach the same barcode
const PRODUCT_NAME_AUTOCOMPLETE_TARGETS = {
    slideProductNameDropdown: { barcodeFieldId: "slideBarcode", onSelect: (barcode) => handleSlideBarcodeAutoSearch(barcode) },
    storeSlideProductNameDropdown: { barcodeFieldId: "storeSlideBarcode", onSelect: (barcode) => handleStoreSlideBarcodeAutoSearch(barcode) },
};

function handleProductNameAutocompleteInput(query, dropdownId, branch) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const trimmed = (query || "").trim();
    if (trimmed.length < 2) {
        dropdown.classList.add("hidden");
        dropdown.innerHTML = "";
        return;
    }

    const lowerQuery = trimmed.toLowerCase();
    let matches = systemInventoryDatabase.filter(item => (item.productName || "").toLowerCase().includes(lowerQuery));
    if (branch) matches = matches.filter(item => (item.branch || "").trim().toLowerCase() === branch.trim().toLowerCase());

    // Same barcode can appear once per branch in the cache - de-dupe so a product doesn't show up
    // as multiple identical-looking suggestions, keeping just the first (branch-relevant) row.
    const seenBarcodes = new Set();
    const deduped = [];
    for (const item of matches) {
        if (seenBarcodes.has(item.barcode)) continue;
        seenBarcodes.add(item.barcode);
        deduped.push(item);
        if (deduped.length >= 6) break;
    }

    if (deduped.length === 0) {
        dropdown.classList.add("hidden");
        dropdown.innerHTML = "";
        return;
    }

    dropdown.innerHTML = deduped.map(item => `
        <button type="button" onmousedown="event.preventDefault(); selectProductNameAutocomplete('${dropdownId}', '${escapeHtml(item.barcode)}')" class="w-full text-left px-4 py-2.5 hover:bg-white/5 border-b border-[#E6B950]/10 last:border-0 transition-colors">
            <div class="font-black text-white text-sm truncate">${escapeHtml(item.productName)}</div>
            <div class="text-[10px] font-mono text-gray-500 truncate">${escapeHtml(item.barcode)}${item.branch ? ` &middot; ${escapeHtml(item.branch)}` : ""}</div>
        </button>
    `).join("");
    dropdown.classList.remove("hidden");
}

function selectProductNameAutocomplete(dropdownId, barcode) {
    const target = PRODUCT_NAME_AUTOCOMPLETE_TARGETS[dropdownId];
    if (!target) return;
    const barcodeField = document.getElementById(target.barcodeFieldId);
    if (barcodeField) barcodeField.value = barcode;
    document.getElementById(dropdownId)?.classList.add("hidden");
    target.onSelect(barcode);
}

document.addEventListener("click", (e) => {
    if (e.target.closest("#slideProductName, #slideProductNameDropdown")) return;
    document.getElementById("slideProductNameDropdown")?.classList.add("hidden");
});
document.addEventListener("click", (e) => {
    if (e.target.closest("#storeSlideProductName, #storeSlideProductNameDropdown")) return;
    document.getElementById("storeSlideProductNameDropdown")?.classList.add("hidden");
});

// Stock Operation Modal (IN / OUT / MOVE)
function openScannerWorkflowModal(mode) {
    stopModalAiCam("stockIn");
    stopModalAiCam("stockMove");
    activeOperationType = (mode || "IN").toUpperCase();
    modalLocalStagedBatchChecklist = [];

    const titles = {
        IN: "Stock IN",
        OUT: "Stock OUT",
        MOVE: "Stock MOVE"
    };
    const subs = {
        IN: "Scan or enter product details. Add items to checklist, then submit.",
        OUT: "Scan products to dispatch. Barcode auto-fills name and available qty.",
        MOVE: "Scan barcode — product name and available stock auto-fill."
    };

    const titleNode = document.getElementById("slideModalTitle");
    const subNode = document.getElementById("slideModalSub");
    if (titleNode) titleNode.innerText = titles[activeOperationType] || "Stock Operation Pipeline";
    if (subNode) subNode.innerText = subs[activeOperationType] || "";

    // Show / hide correct form rows based on mode
    const singleRow = document.getElementById("singleBranchRow");
    const moveRow = document.getElementById("moveBranchRow");
    const availRow = document.getElementById("availableQtyRow");
    const availQty = document.getElementById("slideAvailableQty");
    const storageLocationBox = document.getElementById("storageLocationBox");

    if (activeOperationType === "MOVE") {
        if (singleRow) singleRow.classList.add("hidden");
        if (moveRow) moveRow.classList.remove("hidden");
        if (availRow) availRow.classList.remove("hidden");
        if (storageLocationBox) storageLocationBox.classList.remove("hidden");
    } else if (activeOperationType === "OUT") {
        if (singleRow) singleRow.classList.remove("hidden");
        if (moveRow) moveRow.classList.add("hidden");
        if (availRow) availRow.classList.remove("hidden");
        // Stock Out just deducts from the total, no shelf/row/column reassignment
        if (storageLocationBox) storageLocationBox.classList.add("hidden");
    } else {
        // IN
        if (singleRow) singleRow.classList.remove("hidden");
        if (moveRow) moveRow.classList.add("hidden");
        if (availRow) availRow.classList.add("hidden");
        if (storageLocationBox) storageLocationBox.classList.remove("hidden");
    }

    if (availQty) availQty.innerText = "0";
    setSlideProductPhoto(null);

    // Reset all form fields
    const slideForm = document.getElementById("slideStockForm");
    if (slideForm) slideForm.reset();

    // Stock In/Out lock to the current branch; Move lets the user pick From/To.
    // Must run after slideForm.reset() above, or the reset wipes it back out.
    if (activeOperationType !== "MOVE") {
        const branchField = document.getElementById("slideLocationSelect");
        if (branchField) branchField.value = getCurrentBranch();
    }

    resetSlideLocationDropdowns();
    refreshSlideChecklistTableUI();
    renderSlideModalFooterActions();

    // Pre-fill barcode if we have a cached code from header search
    if (pendingScannedCodeCache) {
        if (activeOperationType === "MOVE") {
            const f = document.getElementById("slideBarcodeMove");
            if (f) { f.value = pendingScannedCodeCache; handleSlideBarcodeAutoSearch(pendingScannedCodeCache); }
        } else {
            const f = document.getElementById("slideBarcode");
            if (f) { f.value = pendingScannedCodeCache; if (activeOperationType === "OUT") handleSlideBarcodeAutoSearch(pendingScannedCodeCache); }
        }
    }

    // Open the sliding panel
    const modalWrapper = document.getElementById("stockOperationSlidingModal");
    if (!modalWrapper) return;
    modalWrapper.classList.remove("hidden");
    setTimeout(() => {
        const slideContainer = modalWrapper.querySelector("[class*='translate-x-full']");
        if (slideContainer) {
            slideContainer.classList.remove("translate-x-full");
            slideContainer.classList.add("translate-x-0");
        }
    }, 50);

    const primaryBarcode = activeOperationType === "MOVE"
        ? document.getElementById("slideBarcodeMove")
        : document.getElementById("slideBarcode");
    setTimeout(() => primaryBarcode?.focus(), 350);
}

function closeStockOperationModal() {
    stopModalAiCam("stockIn");
    stopModalAiCam("stockMove");
    const modalWrapper = document.getElementById("stockOperationSlidingModal");
    if (!modalWrapper) return;
    const slideContainer = modalWrapper.querySelector("[class*='translate-x-0']");
    if (slideContainer) {
        slideContainer.classList.remove("translate-x-0");
        slideContainer.classList.add("translate-x-full");
    }
    setTimeout(() => {
        modalWrapper.classList.add("hidden");
        pendingScannedCodeCache = "";
    }, 300);
}

// Stock-In storage location dropdowns (real Storeroom/Shelf/Row/Column data)
let stockInActiveStoreroomDetail = null;

// MOVE's storeroom picker is scoped to slideMoveTo, not the single-branch field IN/OUT use
function getSlideLocationBranchFieldId() {
    return activeOperationType === "MOVE" ? "slideMoveTo" : "slideLocationSelect";
}

function resetSlideLocationDropdowns() {
    const storeroomSelect = document.getElementById("slideStoreroom");
    if (storeroomSelect) storeroomSelect.innerHTML = `<option value="" disabled selected>Select Stockroom</option>`;
    clearSlideShelfRowColumnInputs();
    stockInActiveStoreroomDetail = null;

    // Repopulate storerooms immediately if a branch is already selected
    const branchSelect = document.getElementById(getSlideLocationBranchFieldId());
    if (branchSelect && branchSelect.value) populateSlideStoreroomOptions();
}

function clearSlideShelfRowColumnInputs() {
    const shelfInput = document.getElementById("slideShelf");
    const rowInput = document.getElementById("slideRow");
    const colInput = document.getElementById("slideColumn");
    if (shelfInput) shelfInput.value = "";
    if (rowInput) rowInput.value = "";
    if (colInput) colInput.value = "";
    document.getElementById("slideShelfOptions").innerHTML = "";
    document.getElementById("slideRowOptions").innerHTML = "";
    document.getElementById("slideColumnOptions").innerHTML = "";
}

async function populateSlideStoreroomOptions() {
    const branch = document.getElementById(getSlideLocationBranchFieldId())?.value;
    const storeroomSelect = document.getElementById("slideStoreroom");
    if (!storeroomSelect) return;
    storeroomSelect.innerHTML = `<option value="" disabled selected>Select Stockroom</option>`;
    clearSlideShelfRowColumnInputs();
    stockInActiveStoreroomDetail = null;
    if (!branch) return;

    const storerooms = await fetchStoreroomsForBranch(branch);
    storerooms.forEach(sr => storeroomSelect.add(new Option(sr.name, sr.id)));
}

async function loadStockInShelfOptions(preserveShelfName) {
    const storeroomSelect = document.getElementById("slideStoreroom");
    if (!storeroomSelect) return;

    const storeroomId = storeroomSelect.value;
    clearSlideShelfRowColumnInputs();
    stockInActiveStoreroomDetail = null;
    if (!storeroomId) return;

    try {
        const response = await fetch(`${apiUrl}/api/storerooms/${storeroomId}/detail`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) return;
        stockInActiveStoreroomDetail = sortShelfRowsAndColumns(await response.json());
    } catch (err) {
        console.error("loadStockInShelfOptions error:", err);
        return;
    }

    const shelfOptions = document.getElementById("slideShelfOptions");
    shelfOptions.innerHTML = (stockInActiveStoreroomDetail.shelves || [])
        .map(shelf => `<option value="${escapeHtml(shelf.name)}"></option>`).join("");

    if (preserveShelfName) {
        document.getElementById("slideShelf").value = preserveShelfName;
    }
    populateSlideRowColumnForShelf();
}

function populateSlideRowColumnForShelf() {
    const shelfName = document.getElementById("slideShelf")?.value.trim();
    const rowOptions = document.getElementById("slideRowOptions");
    const colOptions = document.getElementById("slideColumnOptions");
    if (!rowOptions || !colOptions) return;
    rowOptions.innerHTML = "";
    colOptions.innerHTML = "";
    if (!stockInActiveStoreroomDetail || !shelfName) return;

    const shelf = (stockInActiveStoreroomDetail.shelves || []).find(s => s.name === shelfName);
    if (!shelf) return;

    rowOptions.innerHTML = (shelf.rows || []).map(r => `<option value="${escapeHtml(r.label)}"></option>`).join("");
    colOptions.innerHTML = (shelf.columns || []).map(c => `<option value="${escapeHtml(c.label)}"></option>`).join("");
}

function handleSlideShelfInput() {
    populateSlideRowColumnForShelf();
}

// Finds or creates the Shelf the user typed, so Stock In needs no separate "add" step
async function resolveOrCreateShelf(storeroomId, shelfName) {
    const existing = (stockInActiveStoreroomDetail?.shelves || []).find(s => s.name === shelfName);
    if (existing) return existing;

    const side = ((stockInActiveStoreroomDetail?.shelves?.length || 0) % 2 === 0) ? "left" : "right";
    const response = await fetch(`${apiUrl}/api/storerooms/${storeroomId}/shelves`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ name: shelfName, color: SHELF_FIXED_COLOR, side })
    });
    if (!response.ok) throw new Error("Failed to create shelf");
    const created = await response.json();
    const shelfWithChildren = { ...created, rows: [], columns: [] };
    if (!stockInActiveStoreroomDetail) stockInActiveStoreroomDetail = { shelves: [] };
    if (!stockInActiveStoreroomDetail.shelves) stockInActiveStoreroomDetail.shelves = [];
    stockInActiveStoreroomDetail.shelves.push(shelfWithChildren);
    return shelfWithChildren;
}

async function resolveOrCreateRow(shelf, rowLabel) {
    const existing = (shelf.rows || []).find(r => r.label === rowLabel);
    if (existing) return existing;

    const response = await fetch(`${apiUrl}/api/shelves/${shelf.id}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ label: rowLabel })
    });
    if (!response.ok) {
        // Surface the backend's actual error (e.g. "must be a number") instead of a generic one
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || "Failed to create row");
    }
    const created = await response.json();
    if (!shelf.rows) shelf.rows = [];
    shelf.rows.push(created);
    return created;
}

async function resolveOrCreateColumn(shelf, columnLabel) {
    const existing = (shelf.columns || []).find(c => c.label === columnLabel);
    if (existing) return existing;

    const response = await fetch(`${apiUrl}/api/shelves/${shelf.id}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ label: columnLabel })
    });
    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || "Failed to create column");
    }
    const created = await response.json();
    if (!shelf.columns) shelf.columns = [];
    shelf.columns.push(created);
    return created;
}

// IN/OUT use the single branch picker; MOVE looks up stock at the "from" branch
function getSlideLookupBranch() {
    if (activeOperationType === "MOVE") {
        return document.getElementById("slideMoveFrom")?.value || getCurrentBranch();
    }
    return document.getElementById("slideLocationSelect")?.value || getCurrentBranch();
}

// The master catalog: a barcode existing here means "exists in the system",
// independent of whether any real branch has stocked it in yet
const PRODUCT_SYSTEM_CATALOG_BRANCH = "All Products";

// Every real stock-holding branch. Includes Warehouse (has stock, no Till sales)
const ALL_REAL_BRANCHES = ["Alum Rock", "Small Heath", "Bradford", "Warehouse", "Online"];

// Last resort when a barcode/name isn't known to this system at all (not at any branch,
// not even the "All Products" master catalog): asks the backend to check Lightspeed's own
// product catalog - the shop's actual source of truth for what products exist - so scan/
// search/AI Cam can still show the real product name and route into Add Stock instead of a
// dead-end "not found". Always resolves to an array (empty when nothing matched or the
// lookup failed) so callers don't need their own try/catch.
async function lookupLightspeedCatalog(query) {
    const token = localStorage.getItem("access_token") || "";
    const looksLikeBarcode = /^\d{4,}$/.test(query);
    try {
        if (looksLikeBarcode) {
            const response = await fetch(`${apiUrl}/api/inventory/lightspeed-catalog-lookup?barcode=${encodeURIComponent(query)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) return [];
            const data = await response.json();
            return [{ barcode: data.barcode, name: data.name, price: data.price }];
        }

        const response = await fetch(`${apiUrl}/api/inventory/lightspeed-catalog-search?query=${encodeURIComponent(query)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.results || [];
    } catch (err) {
        console.error("lookupLightspeedCatalog error:", err);
        return [];
    }
}

// Staff can't add products, so point them at their manager instead of All Products
// Loud two-tone buzz for a genuinely unknown product (not in this system, not in
// Lightspeed either) - same "failed scan" alarm pattern the Till uses.
function playProductNotFoundAlarmSound() {
    try {
        [[220, 0], [160, 150]].forEach(([freq, delay]) => {
            setTimeout(() => {
                const osc = scanAudioCtx.createOscillator();
                const gain = scanAudioCtx.createGain();
                osc.connect(gain);
                gain.connect(scanAudioCtx.destination);
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(freq, scanAudioCtx.currentTime);
                gain.gain.setValueAtTime(0.5, scanAudioCtx.currentTime);
                osc.start();
                gain.gain.exponentialRampToValueAtTime(0.0001, scanAudioCtx.currentTime + 0.25);
                osc.stop(scanAudioCtx.currentTime + 0.25);
            }, delay);
        });
    } catch (e) {
        console.log("Audio context needs a user gesture to enable audio.");
    }
}

function flashProductNotFoundAlarm() {
    const el = document.getElementById("inventoryAlarmFlash");
    if (!el) return;
    el.classList.remove("blink");
    void el.offsetWidth; // restart animation if triggered again quickly
    el.classList.add("blink");
    setTimeout(() => el.classList.remove("blink"), 2000);
}

function openBarcodeNotInSystemModal() {
    flashProductNotFoundAlarm();
    playProductNotFoundAlarmSound();
    openRightSlidePanel("barcodeNotInSystemModal");
}

function closeBarcodeNotInSystemModal() {
    closeRightSlidePanel("barcodeNotInSystemModal");
}

function setSlideProductPhoto(photo) {
    const photoImg = document.getElementById("slideProductPhoto");
    const photoPlaceholder = document.getElementById("slideProductPhotoPlaceholder");
    if (!photoImg || !photoPlaceholder) return;
    if (photo) {
        photoImg.src = photo;
        photoImg.classList.remove("hidden");
        photoPlaceholder.classList.add("hidden");
    } else {
        photoImg.classList.add("hidden");
        photoImg.src = "";
        photoPlaceholder.classList.remove("hidden");
    }
}

// Called from oninput on slideBarcode and slideBarcodeMove (also from AI Cam, the name
// autocomplete dropdown, and pending-scan handoffs). Debounced + sequence-guarded: firing a
// fresh lookup on every single keystroke meant an in-flight request for an earlier PARTIAL
// barcode could resolve after the final, complete one and clobber the correct name/quantity
// with a "not found" clear a moment later - the "shows then blinks away" symptom. Now only the
// most recent call is allowed to touch the DOM, and typing/scanning gets one lookup after input
// settles rather than one per character.
let slideBarcodeSearchTimer = null;
let slideBarcodeSearchSeq = 0;

function handleSlideBarcodeAutoSearch(barcodeVal) {
    if (slideBarcodeSearchTimer) clearTimeout(slideBarcodeSearchTimer);
    const seq = ++slideBarcodeSearchSeq;
    slideBarcodeSearchTimer = setTimeout(() => {
        performSlideBarcodeAutoSearch(barcodeVal, seq);
    }, 220);
}

async function performSlideBarcodeAutoSearch(barcodeVal, seq) {
    const cleanBarcode = (barcodeVal || "").trim();
    if (!cleanBarcode || cleanBarcode.length < 3) return;

    const availRow = document.getElementById("availableQtyRow");
    const availQty = document.getElementById("slideAvailableQty");
    const locationRow = document.getElementById("slideExistingLocationRow");
    const locationText = document.getElementById("slideExistingLocationText");
    const nameField = document.getElementById("slideProductName");
    const lookupBranch = getSlideLookupBranch();
    const token = localStorage.getItem("access_token") || "";

    try {
        const response = await fetch(`${apiUrl}/api/inventory/search-barcode?barcode=${encodeURIComponent(cleanBarcode)}&branch=${encodeURIComponent(lookupBranch)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (seq !== slideBarcodeSearchSeq) return; // superseded by a newer scan/keystroke while this was in flight

        if (response.ok) {
            // Already has its own row at this branch/stockroom - name, quantity and location all
            // come straight from there, exactly as before.
            const data = await response.json();
            if (nameField) nameField.value = data.name || "";
            if (availQty) availQty.innerText = data.stock_quantity ?? 0;
            if (availRow) availRow.classList.remove("hidden");
            setSlideProductPhoto(data.photo);

            const hasLocation = !!(data.storeroom_name || data.shelf_name);
            if (locationRow && locationText) {
                if (hasLocation) {
                    const storeroomLabel = data.storeroom_name || `Stockroom ${data.storeroom}`;
                    locationText.innerText = data.shelf_name
                        ? `${storeroomLabel} · ${buildLocationCode(data.shelf_name, data.row_number, data.column_number)}`
                        : storeroomLabel;
                    locationRow.classList.remove("hidden");
                } else {
                    locationRow.classList.add("hidden");
                }
            }

            // Restocking an existing product on Stock In: jump the location pickers to where it already lives.
            if (activeOperationType === "IN" && data.storeroom_id) {
                await preselectSlideLocation(data.storeroom_id, data.shelf_name, data.row_number, data.column_number);
            }
            return;
        }

        // Not stocked at this branch yet, check the master catalog before giving up
        const catalogResponse = await fetch(`${apiUrl}/api/inventory/search-barcode?barcode=${encodeURIComponent(cleanBarcode)}&branch=${encodeURIComponent(PRODUCT_SYSTEM_CATALOG_BRANCH)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (seq !== slideBarcodeSearchSeq) return;

        if (catalogResponse.ok) {
            // Known to the system, just not stocked in here yet
            const catalogData = await catalogResponse.json();
            if (nameField) nameField.value = catalogData.name || "";
            if (availQty) availQty.innerText = 0;
            if (availRow) availRow.classList.remove("hidden");
            if (locationRow) locationRow.classList.add("hidden");
            setSlideProductPhoto(catalogData.photo);

            if (activeOperationType !== "IN" && typeof displayNotification === "function") {
                displayNotification(`${catalogData.name || "This product"} isn't stocked in at this branch yet.`, false);
            }
            return;
        }

        // Not in this system anywhere - last resort, check Lightspeed's own catalog before
        // telling the user it needs registering from scratch.
        const [lightspeedMatch] = await lookupLightspeedCatalog(cleanBarcode);
        if (seq !== slideBarcodeSearchSeq) return;
        if (lightspeedMatch) {
            if (nameField) nameField.value = lightspeedMatch.name || "";
            if (availQty) availQty.innerText = 0;
            if (availRow) availRow.classList.remove("hidden");
            if (locationRow) locationRow.classList.add("hidden");
            setSlideProductPhoto(null);

            if (activeOperationType !== "IN" && typeof displayNotification === "function") {
                displayNotification(`${lightspeedMatch.name || "This product"} isn't stocked in at this branch yet.`, false);
            }
            return;
        }

        // Not found anywhere (not at this branch, not the master catalog, not Lightspeed) -
        // now that stale partial-barcode lookups can no longer trigger this by mistake, a real
        // miss gets the full "Product Not Found" popup + red alert flash so it's unmissable.
        if (nameField) nameField.value = "";
        if (availRow) availRow.classList.add("hidden");
        if (locationRow) locationRow.classList.add("hidden");
        setSlideProductPhoto(null);
        openBarcodeNotInSystemModal();
    } catch (err) {
        console.error("Barcode search error:", err);
    }
}

async function preselectSlideLocation(storeroomId, shelfName, rowNumber, columnNumber) {
    const storeroomSelect = document.getElementById("slideStoreroom");
    if (!storeroomSelect) return;
    if (!Array.from(storeroomSelect.options).some(o => o.value === String(storeroomId))) return;

    storeroomSelect.value = String(storeroomId);
    await loadStockInShelfOptions(shelfName ? String(shelfName) : null);

    const rowInput = document.getElementById("slideRow");
    const colInput = document.getElementById("slideColumn");
    if (rowInput && rowNumber != null) rowInput.value = String(rowNumber);
    if (colInput && columnNumber != null) colInput.value = String(columnNumber);
}

async function addSlideProductEntryToChecklist() {
    let branch, toBranch, barcode;

    if (activeOperationType === "MOVE") {
        branch = document.getElementById("slideMoveFrom")?.value || "";
        toBranch = document.getElementById("slideMoveTo")?.value || "";
        barcode = (document.getElementById("slideBarcodeMove")?.value || "").trim();
    } else {
        branch = document.getElementById("slideLocationSelect")?.value || "";
        toBranch = null;
        barcode = (document.getElementById("slideBarcode")?.value || "").trim();
    }

    const productName = (document.getElementById("slideProductName")?.value || "").trim();
    const quantity = parseInt(document.getElementById("slideProductQty")?.value) || 0;
    const needsLocation = activeOperationType !== "OUT";
    const storeroomSelect = document.getElementById("slideStoreroom");
    const storeroom = needsLocation ? (storeroomSelect?.value || "") : "";
    const storeroomName = needsLocation ? (storeroomSelect?.selectedOptions?.[0]?.text || "") : "";
    const shelfName = needsLocation ? (document.getElementById("slideShelf")?.value || "").trim() : "";
    const rowLabel = needsLocation ? (document.getElementById("slideRow")?.value || "").trim() : "";
    const columnLabel = needsLocation ? (document.getElementById("slideColumn")?.value || "").trim() : "";
    const row = rowLabel ? (parseInt(rowLabel) || null) : null;
    const column = columnLabel ? (parseInt(columnLabel) || null) : null;

    if (!branch || !barcode || !productName || quantity < 1 || (needsLocation && !storeroom)) {
        if (typeof displayNotification === "function") {
            const req = needsLocation
                ? "Branch, Barcode, Name, Quantity, Stockroom!"
                : "Branch, Barcode, Name, Quantity!";
            displayNotification(`Fill all required fields: ${req}`, false);
        }
        return;
    }

    if (activeOperationType === "MOVE" && !toBranch) {
        if (typeof displayNotification === "function") {
            displayNotification("Please select a Destination Branch for the Stock Move!", false);
        }
        return;
    }

    if (needsLocation && shelfName) {
        try {
            const shelf = await resolveOrCreateShelf(storeroom, shelfName);
            const pending = [];
            if (rowLabel) pending.push(resolveOrCreateRow(shelf, rowLabel));
            if (columnLabel) pending.push(resolveOrCreateColumn(shelf, columnLabel));
            if (pending.length) await Promise.all(pending);
            populateSlideRowColumnForShelf();
        } catch (err) {
            console.error("Shelf/Row/Column resolve error:", err);
            if (typeof displayNotification === "function") {
                displayNotification(err.message || "Failed to save the Shelf/Row/Column. Try again.", false);
            }
            return;
        }
    }

    const token = "SLD-" + Math.random().toString(36).substr(2, 9).toUpperCase();

    modalLocalStagedBatchChecklist.push({
        localTokenId: token,
        barcode, branch, to_branch: toBranch, productName,
        quantity, storeroom: storeroom || null, storeroomName: storeroomName || null,
        shelf: shelfName || null, row, column,
        type: activeOperationType
    });

    refreshSlideChecklistTableUI();

    // Clear the inputs that were just used
    if (activeOperationType === "MOVE") {
        const bm = document.getElementById("slideBarcodeMove");
        if (bm) bm.value = "";
    } else {
        const b = document.getElementById("slideBarcode");
        if (b) b.value = "";
    }

    const nameField = document.getElementById("slideProductName");
    if (nameField) nameField.value = "";
    const qtyField = document.getElementById("slideProductQty");
    if (qtyField) qtyField.value = "1";
    const availRow = document.getElementById("availableQtyRow");
    if (availRow && activeOperationType === "IN") availRow.classList.add("hidden");
    const availQty = document.getElementById("slideAvailableQty");
    if (availQty) availQty.innerText = "0";
    setSlideProductPhoto(null);

    const focusTarget = activeOperationType === "MOVE" ? "slideBarcodeMove" : "slideBarcode";
    document.getElementById(focusTarget)?.focus();

    if (typeof displayNotification === "function") {
        displayNotification(`"${productName}" added to checklist.`, true);
    }
}

function refreshSlideChecklistTableUI() {
    const tableBody = document.getElementById("slideChecklistBatchTableBody");
    const badge = document.getElementById("slideChecklistCountBadge");
    if (!tableBody) return;

    if (badge) badge.innerText = `${modalLocalStagedBatchChecklist.length} Items`;

    if (modalLocalStagedBatchChecklist.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 font-mono font-bold uppercase tracking-wide">No data packages staged in current batch sequence.</td></tr>`;
        return;
    }

    tableBody.innerHTML = "";
    modalLocalStagedBatchChecklist.forEach(item => {
        let locationText = "&mdash;";
        if (item.storeroomName) {
            const parts = [item.storeroomName];
            if (item.shelf) {
                let shelfPart = item.shelf;
                if (item.row != null || item.column != null) {
                    const r = item.row != null ? String(item.row).padStart(2, "0") : "--";
                    const c = item.column != null ? String(item.column).padStart(2, "0") : "--";
                    shelfPart += `${r}${c}`;
                }
                parts.push(shelfPart);
            }
            locationText = parts.join(" / ");
        }
        const branchDisplay = item.to_branch ? `${item.branch} &#8594; ${item.to_branch}` : item.branch;
        tableBody.insertAdjacentHTML('beforeend', `
            <tr class="hover:bg-white/5 border-b border-[#E6B950]/10 transition-colors">
                <td class="p-3 font-mono font-black text-white text-sm">${item.barcode}</td>
                <td class="p-3">
                    <div class="font-black text-white uppercase text-xs leading-tight">${item.productName}</div>
                    <div class="text-[10px] font-bold text-gray-500 uppercase mt-0.5">${item.type} | ${branchDisplay}</div>
                </td>
                <td class="p-3 text-center font-black font-mono text-xl text-white">${item.quantity}</td>
                <td class="p-3 text-center font-mono text-xs font-bold text-amber-400 bg-amber-950/20">${locationText}</td>
                <td class="p-3 text-center">
                    <button type="button" onclick="purgeTargetedLocalStagedItem('${item.localTokenId}')"
                        class="text-red-400 hover:text-red-300 font-black text-xs uppercase bg-red-950/30 border border-red-500/30 px-3 py-1.5 rounded-lg transition-all">
                        Remove
                    </button>
                </td>
            </tr>
        `);
    });
}

function purgeTargetedLocalStagedItem(token) {
    modalLocalStagedBatchChecklist = modalLocalStagedBatchChecklist.filter(i => i.localTokenId !== token);
    refreshSlideChecklistTableUI();
}

function renderSlideModalFooterActions() {
    const footer = document.getElementById("slideModalFooterContainer");
    if (!footer) return;

    const isManager = isCurrentUserManager();

    if (isManager) {
        footer.innerHTML = `
            <button type="button" onclick="closeStockOperationModal()"
                class="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-black uppercase tracking-widest py-3 px-6 rounded-xl border border-zinc-700 transition-all">
                Cancel
            </button>
            <button type="button" onclick="dispatchManagerBatch()"
                class="w-full sm:w-auto bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-xs sm:text-base font-black uppercase tracking-widest py-3.5 px-8 rounded-xl transition-all shadow-md active:scale-95">
                Stock ${activeOperationType} Directly &#9889;
            </button>
        `;
    } else {
        footer.innerHTML = `
            <button type="button" onclick="closeStockOperationModal()"
                class="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-black uppercase tracking-widest py-3 px-6 rounded-xl border border-zinc-700 transition-all">
                Cancel
            </button>
            <button type="button" onclick="dispatchStaffBatch()"
                class="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-base font-black uppercase tracking-widest py-3.5 px-8 rounded-xl transition-all shadow-md active:scale-95">
                Save for Manager Approval &#128190;
            </button>
        `;
    }
}

async function dispatchStaffBatch() {
    if (modalLocalStagedBatchChecklist.length === 0) {
        if (typeof displayNotification === "function") displayNotification("No items in checklist!", false);
        return;
    }

    const token = localStorage.getItem("access_token") || "";
    let successCount = 0;
    let total = modalLocalStagedBatchChecklist.length;

    for (const item of modalLocalStagedBatchChecklist) {
        let endpoint;
        if (activeOperationType === "OUT") endpoint = `${apiUrl}/api/inventory/stock-out-evaluate`;
        else if (activeOperationType === "MOVE") endpoint = `${apiUrl}/api/inventory/stock-move-evaluate`;
        else endpoint = `${apiUrl}/api/inventory/stock-in-evaluate`;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    barcode: item.barcode,
                    quantity: item.quantity,
                    name: item.productName,
                    branch: item.branch,
                    to_branch: item.to_branch,
                    storeroom_id: item.storeroom ? parseInt(item.storeroom) : null,
                    shelf_name: item.shelf || null,
                    row_number: item.row,
                    column_number: item.column
                })
            });
            if (response.ok) successCount++;
            else {
                const err = await response.json().catch(() => ({}));
                console.error("Staff submit error:", err.detail || response.status);
            }
        } catch (err) {
            console.error("Network error:", err);
        }
    }

    if (typeof displayNotification === "function") {
        displayNotification(`${successCount}/${total} items submitted for Manager Approval.`, successCount > 0);
    }
    // Stay on the screen after submit, just clear the checklist for the next batch
    modalLocalStagedBatchChecklist = [];
    refreshSlideChecklistTableUI();
    fetchInventoryData();
    fetchDashboardStats();
}

async function dispatchManagerBatch() {
    if (modalLocalStagedBatchChecklist.length === 0) {
        if (typeof displayNotification === "function") displayNotification("No items in checklist!", false);
        return;
    }

    const token = localStorage.getItem("access_token") || "";
    let successCount = 0;
    let total = modalLocalStagedBatchChecklist.length;

    for (const item of modalLocalStagedBatchChecklist) {
        let endpoint;
        if (activeOperationType === "OUT") endpoint = `${apiUrl}/api/inventory/stock-out`;
        else if (activeOperationType === "MOVE") endpoint = `${apiUrl}/api/inventory/stock-move`;
        else endpoint = `${apiUrl}/api/inventory/stock-in`;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    barcode: item.barcode,
                    quantity: item.quantity,
                    name: item.productName,
                    branch: item.branch,
                    to_branch: item.to_branch,
                    storeroom_id: item.storeroom ? parseInt(item.storeroom) : null,
                    shelf_name: item.shelf || null,
                    row_number: item.row,
                    column_number: item.column
                })
            });
            if (response.ok) {
                successCount++;
            } else {
                const errData = await response.json().catch(() => ({}));
                if (typeof displayNotification === "function") {
                    displayNotification(`${item.productName}: ${errData.detail || "Server error"}`, false);
                }
            }
        } catch (err) {
            console.error("Network error:", err);
        }
    }

    if (typeof displayNotification === "function") {
        displayNotification(`${successCount}/${total} items processed directly!`, successCount > 0);
    }
    // Stay on the screen after submit, just clear the checklist for the next batch
    modalLocalStagedBatchChecklist = [];
    refreshSlideChecklistTableUI();
    fetchInventoryData();
    fetchDashboardStats();
}

// ============================================================
// STOCK HISTORY PANEL
// ============================================================
async function loadStockHistorySection() {
    const modalWrapper = document.getElementById("stockHistoryCentralSection");
    if (!modalWrapper) return;

    modalWrapper.classList.remove("hidden");
    setTimeout(() => {
        const slideContainer = modalWrapper.querySelector("[class*='translate-x-full']");
        if (slideContainer) {
            slideContainer.classList.remove("translate-x-full");
            slideContainer.classList.add("translate-x-0");
        }
    }, 50);

    try {
        const response = await fetch(`${apiUrl}/api/inventory/history-list?branch=${encodeURIComponent(getCurrentBranch())}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (response.ok) {
            window.mockGlobalStockHistoryLedger = await response.json();
        }
    } catch (err) {
        console.error("History fetch error:", err);
    }

    renderStockHistoryCardsGrid();
}

function closeStockHistoryModal() {
    const modalWrapper = document.getElementById("stockHistoryCentralSection");
    if (!modalWrapper) return;
    const slideContainer = modalWrapper.querySelector("[class*='translate-x-0']");
    if (slideContainer) {
        slideContainer.classList.remove("translate-x-0");
        slideContainer.classList.add("translate-x-full");
    }
    setTimeout(() => modalWrapper.classList.add("hidden"), 300);
}

// Print List: today's stock activity, one card per entry, each individually printable
async function openPrintListSection() {
    const modalWrapper = document.getElementById("printListCentralSection");
    if (!modalWrapper) return;

    modalWrapper.classList.remove("hidden");
    setTimeout(() => {
        const slideContainer = modalWrapper.querySelector("[class*='translate-x-full']");
        if (slideContainer) {
            slideContainer.classList.remove("translate-x-full");
            slideContainer.classList.add("translate-x-0");
        }
    }, 50);

    try {
        const response = await fetch(`${apiUrl}/api/inventory/history-list?branch=${encodeURIComponent(getCurrentBranch())}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (response.ok) {
            window.mockGlobalStockHistoryLedger = await response.json();
        }
    } catch (err) {
        console.error("Print list fetch error:", err);
    }

    renderPrintListGrid();
}

function closePrintListSection() {
    const modalWrapper = document.getElementById("printListCentralSection");
    if (!modalWrapper) return;
    const slideContainer = modalWrapper.querySelector("[class*='translate-x-0']");
    if (slideContainer) {
        slideContainer.classList.remove("translate-x-0");
        slideContainer.classList.add("translate-x-full");
    }
    setTimeout(() => modalWrapper.classList.add("hidden"), 300);
}

function renderPrintListGrid() {
    const grid = document.getElementById("printListGrid");
    if (!grid) return;

    const logs = (window.mockGlobalStockHistoryLedger || []).filter(l => l.timeline === "daily");

    if (logs.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-zinc-400 font-bold uppercase text-sm py-10">No stock activity logged today yet.</p>`;
        return;
    }

    const typeColor = { IN: "bg-emerald-50 text-emerald-700 border-emerald-200", OUT: "bg-red-50 text-red-700 border-red-200", MOVE: "bg-amber-50 text-amber-700 border-amber-200" };

    grid.innerHTML = logs.map(log => `
        <div id="printListCard-${log.id}" class="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2 shadow-sm">
            <div class="flex items-start justify-between gap-2">
                <span class="text-[9px] font-mono font-black px-2 py-0.5 rounded tracking-widest border ${typeColor[log.type] || typeColor.MOVE}">${escapeHtml(log.type)}</span>
                <span class="text-[10px] font-mono font-bold text-zinc-400">${escapeHtml(log.date || "")}</span>
            </div>
            <h4 class="text-sm font-black text-zinc-900 uppercase">${escapeHtml(log.item || "Unknown Product")}</h4>
            <div class="space-y-0.5 text-[10px] font-bold text-zinc-500 uppercase">
                <p>Barcode: <span class="text-zinc-700 font-mono">${escapeHtml(log.barcode || "---")}</span></p>
                <p>Branch: <span class="text-zinc-700">${escapeHtml(log.branch || "---")}</span></p>
                <p>Quantity: <span class="text-zinc-900 font-black text-xs">${log.qty || 0} Pcs</span></p>
                <p>Location: <span class="text-zinc-700">${escapeHtml(log.location || "---")}</span></p>
                <p>By: <span class="text-zinc-700">${escapeHtml(log.user || "---")}</span></p>
            </div>
            <button type="button" onclick="printElementOnly(document.getElementById('printListCard-${log.id}'))"
                class="w-full text-center text-xs font-black uppercase tracking-widest text-[#B8862E] hover:text-[#8a6215] border-t border-zinc-100 pt-2 mt-2 print:hidden">
                Print
            </button>
        </div>
    `).join("");
}

function renderStockHistoryCardsGrid() {
    const feeds = {
        daily: document.getElementById("dailyHistoryCardFeed"),
        weekly: document.getElementById("weeklyHistoryCardFeed"),
        monthly: document.getElementById("monthlyHistoryCardFeed")
    };

    Object.values(feeds).forEach(feed => { if (feed) feed.innerHTML = ""; });

    const isManager = isCurrentUserManager();

    const logs = window.mockGlobalStockHistoryLedger || [];

    if (logs.length === 0) {
        Object.values(feeds).forEach(feed => {
            if (feed) feed.innerHTML = `<div class="p-6 text-center border-2 border-dashed border-zinc-800 rounded-xl font-mono text-[11px] text-zinc-600 uppercase font-black">No transactions logged yet.</div>`;
        });
        return;
    }

    logs.forEach(log => {
        const targetFeed = feeds[log.timeline];
        if (!targetFeed) return;

        const typeColor = log.type === "IN"
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            : log.type === "OUT"
            ? "bg-red-500/20 text-red-400 border-red-500/30"
            : "bg-amber-500/20 text-amber-400 border-amber-500/30";

        const cardBorder = log.approved
            ? "border-emerald-600/50 bg-emerald-950/10"
            : "border-zinc-800 bg-zinc-900";

        let actionMarkup;
        if (log.approved) {
            actionMarkup = `<div class="text-xs font-mono font-black text-emerald-400 uppercase tracking-widest bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/60 text-center w-full">&#10003; Approved by ${log.checkedBy || "Manager"}</div>`;
        } else if (isManager) {
            actionMarkup = `<button type="button" onclick="commitVerifyStatusFromCard(${log.id})"
                class="w-full bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 font-black text-xs uppercase tracking-widest py-2 px-4 rounded-xl transition-all active:scale-95">
                Approve &amp; Apply Stock &#9889;
            </button>`;
        } else {
            actionMarkup = `<div class="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20 text-center w-full animate-pulse">&#9203; Awaiting Manager Approval</div>`;
        }

        targetFeed.insertAdjacentHTML('beforeend', `
            <div class="border-2 ${cardBorder} rounded-2xl p-4 space-y-3 transition-all hover:border-[#E6B950]/50 group shadow-lg">
                <div class="space-y-2">
                    <div class="flex items-start justify-between gap-2">
                        <span class="text-[9px] font-mono font-black border ${typeColor} px-2 py-0.5 rounded tracking-widest">${log.type}</span>
                        <span class="text-[10px] font-mono font-bold text-zinc-500">${log.date || ""}</span>
                    </div>
                    <h4 class="text-sm font-black text-white uppercase tracking-tight group-hover:text-[#E6B950] transition-colors">${log.item || "Unknown Product"}</h4>
                    <div class="space-y-0.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                        <p>Barcode: <span class="text-zinc-300 font-mono">${log.barcode || "---"}</span></p>
                        <p>Branch: <span class="text-zinc-300">${log.branch || "---"}</span></p>
                        <p>Quantity: <span class="text-[#E6B950] font-black text-xs">${log.qty || 0} Pcs</span></p>
                        <p>Location: <span class="text-zinc-300">${log.location || "---"}</span></p>
                        <p>By: <span class="text-zinc-300">${log.user || "---"}</span></p>
                    </div>
                </div>
                <div class="border-t border-zinc-800 pt-3">
                    ${actionMarkup}
                </div>
            </div>
        `);
    });

    Object.values(feeds).forEach(feed => {
        if (feed && feed.children.length === 0) {
            feed.innerHTML = `<div class="p-6 text-center border-2 border-dashed border-zinc-800 rounded-xl font-mono text-[11px] text-zinc-600 uppercase font-black">No transactions in this period.</div>`;
        }
    });
}

async function commitVerifyStatusFromCard(transactionId) {
    const token = localStorage.getItem("access_token");
    if (!token) {
        if (typeof displayNotification === "function") displayNotification("Session expired. Please login again.", false);
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/api/inventory/approve/${transactionId}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ approve: true })
        });

        const data = await response.json();

        if (response.ok) {
            if (typeof displayNotification === "function") displayNotification(data.message || "Transaction approved! Stock updated.", true);
            await loadStockHistorySection();
            fetchInventoryData();
            fetchDashboardStats();
        } else {
            if (typeof displayNotification === "function") displayNotification(data.detail || "Failed to approve transaction.", false);
        }
    } catch (err) {
        console.error("Approval error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to reach server.", false);
    }
}

// Product List: current branch's stocked-in products with photos (delete only, no add)
function openProductListModal() {
    const modalWrapper = document.getElementById("productListCentralSection");
    if (!modalWrapper) return;

    modalWrapper.classList.remove("hidden");
    setTimeout(() => {
        const slideContainer = modalWrapper.querySelector("[class*='translate-x-full']");
        if (slideContainer) {
            slideContainer.classList.remove("translate-x-full");
            slideContainer.classList.add("translate-x-0");
        }
    }, 50);

    renderProductListGrid();
}

function closeProductListModal() {
    const modalWrapper = document.getElementById("productListCentralSection");
    if (!modalWrapper) return;
    const slideContainer = modalWrapper.querySelector("[class*='translate-x-0']");
    if (slideContainer) {
        slideContainer.classList.remove("translate-x-0");
        slideContainer.classList.add("translate-x-full");
    }
    setTimeout(() => modalWrapper.classList.add("hidden"), 300);
}

async function renderProductListGrid() {
    // AMS-0000 isn't tied to a branch, shows the All Products master catalog instead, view-only
    const isChairman = isChairmanAccount();
    const branch = isChairman ? PRODUCT_SYSTEM_CATALOG_BRANCH : getCurrentBranch();
    // From inside Store Management, show shop-floor quantity/location instead of the stockroom
    const isStoreContext = !isChairman && isStoreManagementScreenActive();
    const subtitle = document.getElementById("productListSubtitle");
    if (subtitle) subtitle.innerText = isChairman ? "All Products (Master Catalog)" : (isStoreContext ? `${branch} — Store` : branch);

    const grid = document.getElementById("productListGrid");
    if (!grid) return;
    grid.innerHTML = `<p class="col-span-full text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading products...</p>`;

    try {
        const [response, storerooms, perBranchLists] = await Promise.all([
            fetch(`${apiUrl}/api/inventory/list?branch=${encodeURIComponent(branch)}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
            }),
            isChairman ? Promise.resolve([]) : fetchStoreroomsForBranch(branch),
            // Chairman's view also fetches every real branch's stock, in parallel
            isChairman
                ? Promise.all(ALL_REAL_BRANCHES.map(b =>
                    fetch(`${apiUrl}/api/inventory/list?branch=${encodeURIComponent(b)}`, {
                        headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
                    }).then(r => r.ok ? r.json() : []).catch(() => [])
                  ))
                : Promise.resolve(null)
        ]);
        const items = response.ok ? await response.json() : [];
        const storeroomNameById = new Map(storerooms.map(sr => [sr.id, sr.name]));

        // barcode -> { "Alum Rock": 20, ... }, built once so each card is a plain lookup
        let branchQtyByBarcode = null;
        if (isChairman) {
            branchQtyByBarcode = new Map();
            ALL_REAL_BRANCHES.forEach((branchName, i) => {
                (perBranchLists[i] || []).forEach(row => {
                    if (!branchQtyByBarcode.has(row.barcode)) branchQtyByBarcode.set(row.barcode, {});
                    branchQtyByBarcode.get(row.barcode)[branchName] = (branchQtyByBarcode.get(row.barcode)[branchName] || 0) + (row.quantity || 0);
                });
            });
        }

        if (items.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-zinc-400 font-bold uppercase text-sm py-10">${isChairman ? "No products in the system yet." : "No products stocked in yet."}</p>`;
            return;
        }

        const canDelete = !isChairman && isCurrentUserManager();
        grid.innerHTML = items.map(item => {
            let quantity, storeName, locationCode;
            if (isChairman) {
                quantity = item.quantity;
            } else if (isStoreContext) {
                quantity = item.shelf_quantity || 0;
                storeName = item.store_shelf_name ? "Store" : "Unassigned";
                locationCode = item.store_shelf_name ? buildLocationCode(item.store_shelf_name, item.store_row_number, item.store_column_number) : "—";
            } else {
                quantity = item.quantity;
                storeName = item.storeroom_id != null ? (storeroomNameById.get(item.storeroom_id) || "Stockroom") : "Unassigned";
                locationCode = item.shelf_name ? buildLocationCode(item.shelf_name, item.row_number, item.column_number) : "—";
            }

            // Chairman view: one small pill per real branch instead of a location line
            const branchBreakdownHtml = isChairman
                ? `<div class="flex flex-wrap gap-1.5 mt-1.5">${ALL_REAL_BRANCHES.map(branchName => {
                      const qty = branchQtyByBarcode.get(item.barcode)?.[branchName] || 0;
                      return `<span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${qty > 0 ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400" : "bg-black/30 border-[#E6B950]/15 text-gray-500"}">${escapeHtml(branchName)} ${qty}</span>`;
                  }).join("")}</div>`
                : `<p class="text-[10px] font-bold text-gray-500 uppercase mt-0.5">${escapeHtml(storeName)} &middot; ${escapeHtml(locationCode)}</p>`;

            return `
            <div class="bg-black/30 border border-[#E6B950]/15 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                ${item.photo
                    ? `<img src="${item.photo}" alt="${escapeHtml(item.name)}" class="w-16 h-16 object-cover rounded-xl border border-[#E6B950]/20 shrink-0">`
                    : `<div class="w-16 h-16 rounded-xl border-2 border-dashed border-[#E6B950]/20 flex items-center justify-center text-2xl text-gray-500 shrink-0">📦</div>`}
                <div class="min-w-0 flex-1">
                    <h4 class="font-black text-white text-sm uppercase truncate">${escapeHtml(item.name)}</h4>
                    <p class="text-[10px] font-mono font-bold text-gray-500 mt-0.5">${escapeHtml(item.barcode)}</p>
                    <p class="text-[10px] font-bold text-gray-300 uppercase mt-0.5">${isChairman ? `${quantity} pcs remaining (company-wide)` : `${quantity} pcs`}</p>
                    ${branchBreakdownHtml}
                </div>
                ${canDelete ? `<button type="button" onclick="confirmDeleteProduct(${item.id}, '${escapeHtml(item.name)}')" class="w-8 h-8 rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-600 hover:text-white flex items-center justify-center shrink-0 transition-colors" title="Delete Product">🗑</button>` : ""}
            </div>
        `;
        }).join("");
    } catch (err) {
        console.error("renderProductListGrid error:", err);
        grid.innerHTML = `<p class="col-span-full text-center text-red-500 font-bold uppercase text-sm py-10">Failed to load products.</p>`;
    }
}

function confirmDeleteProduct(productId, name) {
    if (!confirm(`Delete "${name}"? This removes it from inventory entirely.`)) return;
    deleteProductFromList(productId);
}

async function deleteProductFromList(productId) {
    try {
        const response = await fetch(`${apiUrl}/api/products/${productId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Request failed");
        await renderProductListGrid();
        fetchInventoryData();
        fetchDashboardStats();
        if (typeof displayNotification === "function") displayNotification("Product deleted.", true);
    } catch (err) {
        console.error("deleteProductFromList error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to delete product.", false);
    }
}

// Dashboard metric cards (unified modal: Daily/Weekly/Monthly + Print). "transactions"
// mode filters the stock history ledger; "inventory" mode filters systemInventoryDatabase.
const DASHBOARD_METRIC_CARD_CONFIGS = {
    items:      { title: "Total Items — All Activity", subtitle: "Every stock movement logged in the system", mode: "transactions", typeFilter: null },
    stockIn:    { title: "Total Stock In",              subtitle: "All incoming stock entries",                 mode: "transactions", typeFilter: "IN" },
    stockOut:   { title: "Total Stock Out",             subtitle: "All outgoing stock dispatches",              mode: "transactions", typeFilter: "OUT" },
    transfers:  { title: "Total Transfers",             subtitle: "Inter-location stock moves",                 mode: "transactions", typeFilter: "MOVE" },
    lowStock:   { title: "Total Low Stock",             subtitle: "Products below their own alert level (set per-product in Stockroom)", mode: "inventory", predicate: isLowStock },
    outOfStock: { title: "Total Out of Stock",          subtitle: "Products with zero units remaining",         mode: "inventory", predicate: isOutOfStock },
    sale:       { title: "Sales",                       subtitle: "Every approved Stock Out counts as a sale — products and quantities sold", mode: "sales" },
    topSelling: { title: "Top Selling Products",        subtitle: "Best-selling products ranked by units sold",  mode: "topSelling" },
    mustStock:  { title: "Next Month Must-Stock List",  subtitle: "Products that historically sell well this time of year — restock these before next month", mode: "forecast", hideTimelineTabs: true },
};

window.activeDashboardMetricCard = "items";
window.activeDashboardMetricTimeline = "daily"; // daily=3 days, weekly=7, monthly=30

function openDashboardMetricModal(cardKey) {
    if (!DASHBOARD_METRIC_CARD_CONFIGS[cardKey]) return;

    window.activeDashboardMetricCard = cardKey;
    // Fresh card = fresh branch pick (AMS-0000 only), not carried over between cards
    window.activeChairmanBranchFilter = null;
    openRightSlidePanel("totalItemsDeepDiveModal");
    renderDashboardMetricModal();
}

function closeTotalItemsDeepDiveModal() {
    closeRightSlidePanel("totalItemsDeepDiveModal");
}

function setDashboardMetricTimeline(timeline) {
    window.activeDashboardMetricTimeline = timeline;
    renderDashboardMetricModal();
}

function getDashboardMetricWindowDays(timeline) {
    return timeline === "daily" ? 3 : timeline === "weekly" ? 7 : 30;
}

function renderDashboardMetricModal() {
    const config = DASHBOARD_METRIC_CARD_CONFIGS[window.activeDashboardMetricCard];
    const container = document.getElementById("dynamicChronologicalLogContainer");
    if (!config || !container) return;

    const titleEl = document.getElementById("dashboardMetricModalTitle");
    const subtitleEl = document.getElementById("dashboardMetricModalSubtitle");
    if (titleEl) titleEl.innerText = config.title;
    if (subtitleEl) subtitleEl.innerText = config.subtitle;

    ["daily", "weekly", "monthly"].forEach(t => {
        const tabEl = document.getElementById(`dashboardMetricTab${t.charAt(0).toUpperCase()}${t.slice(1)}`);
        if (tabEl) tabEl.classList.toggle("active", window.activeDashboardMetricTimeline === t);
    });
    document.getElementById("dashboardMetricTimelineTabs")?.classList.toggle("hidden", !!config.hideTimelineTabs);

    const windowDays = getDashboardMetricWindowDays(window.activeDashboardMetricTimeline);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);

    if (config.mode === "transactions") {
        renderTransactionMetricList(container, config, cutoff);
    } else if (config.mode === "sales") {
        renderSalesMetricList(container, cutoff);
    } else if (config.mode === "topSelling") {
        renderTopSellingMetricList(container, cutoff);
    } else if (config.mode === "forecast") {
        renderMustStockForecastList(container);
    } else {
        renderInventoryMetricList(container, config, cutoff);
    }
}

// Shared by Sale/Top Selling/Must Stock: groups a cutoff-filtered log array into daily/weekly/monthly HTML
function buildTimelineGroupedHtml(logs, renderGroupFn) {
    if (window.activeDashboardMetricTimeline === "daily") {
        const byDate = new Map();
        logs.forEach(log => {
            const dateKey = (log.date || "").split(" ")[0] || "Unknown Date";
            if (!byDate.has(dateKey)) byDate.set(dateKey, []);
            byDate.get(dateKey).push(log);
        });
        const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
        return `<div class="space-y-4">${sortedDates.map(d => renderGroupFn(d, byDate.get(d))).join("")}</div>`;
    }
    const label = window.activeDashboardMetricTimeline === "weekly" ? "Last 7 Days" : "Last 30 Days";
    return renderGroupFn(label, logs);
}

// AMS-0000 isn't tied to one branch, so these cards break down into one section per branch
const AMS0000_SALES_BRANCHES = ["Small Heath", "Alum Rock", "Bradford", "Online"];

// Both permanent admin accounts get the same cross-branch dashboard treatment.
// AMS-Adm additionally gets its own extra cards, gated separately since not shared with AMS-0000.
const CHAIRMAN_LEVEL_USERNAMES = ["AMS-0000", "AMS-ADM"];

// "Control" lets either chairman-level account step into one branch's ordinary dashboard.
// This flag is the single source of truth every special-case check below reads.
function isChairmanControlModeActive() {
    return localStorage.getItem("chairman_control_mode") === "true";
}

// True only while actually viewing a chairman account's own cross-branch dashboard
function isChairmanAccount() {
    return CHAIRMAN_LEVEL_USERNAMES.includes((localStorage.getItem("username") || "").toUpperCase()) && !isChairmanControlModeActive();
}

// Same as isChairmanAccount(), except while AMS-Adm's Full Management popup has
// borrowed the Stockrooms section for itself
function hasNoStockroomSection() {
    if (typeof fullManagementActiveArea !== "undefined" && fullManagementActiveArea === "stockrooms") return false;
    return isChairmanAccount();
}

// Picking a branch card re-renders the whole modal to show/collapse that section
window.activeChairmanBranchFilter = null;
function selectChairmanBranchCard(branch) {
    window.activeChairmanBranchFilter = (window.activeChairmanBranchFilter === branch) ? null : branch;
    renderDashboardMetricModal();
}

// 4 branch-picker cards up top, clicking one expands that branch's list below with its own print button
function wrapContentInBranchSections(logs, buildContentFn, sectionKey, summaryLabelFn) {
    const getSummaryLabel = summaryLabelFn || ((branchLogs) => `${branchLogs.reduce((sum, l) => sum + (l.qty || 0), 0)} pcs`);
    const cardsHtml = AMS0000_SALES_BRANCHES.map(branch => {
        const branchLogs = logs.filter(l => (l.branch || "").trim().toLowerCase() === branch.toLowerCase());
        const isActive = window.activeChairmanBranchFilter === branch;
        const branchSafe = escapeHtml(branch).replace(/'/g, "\\'");
        return `
            <button type="button" onclick="selectChairmanBranchCard('${branchSafe}')"
                class="p-4 rounded-xl border-2 text-center transition-all ${isActive ? "bg-[#E6B950] text-black border-[#E6B950]" : "bg-black/30 text-white border-[#E6B950]/20 hover:border-[#E6B950]/50"}">
                <div class="text-sm font-black uppercase tracking-wide">${escapeHtml(branch)}</div>
                <div class="text-[10px] font-bold uppercase mt-1 ${isActive ? "text-black/70" : "text-gray-500"}">${getSummaryLabel(branchLogs)} ${isActive ? "· Click to close" : "· Click to view"}</div>
            </button>`;
    }).join("");
    const cardsGrid = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">${cardsHtml}</div>`;

    if (!window.activeChairmanBranchFilter) {
        return cardsGrid;
    }

    const branch = window.activeChairmanBranchFilter;
    const branchLogs = logs.filter(l => (l.branch || "").trim().toLowerCase() === branch.toLowerCase());
    const innerHtml = buildContentFn(branchLogs, branch);
    const sectionId = `branchSection-${sectionKey}-active`;

    return `
        ${cardsGrid}
        <div id="${sectionId}" class="space-y-3">
            <div class="flex items-center justify-between gap-3 bg-black/60 border border-[#E6B950]/20 text-white px-4 py-2.5 rounded-xl print:hidden">
                <span class="text-sm font-black uppercase tracking-widest text-[#E6B950]">${escapeHtml(branch)}</span>
                <button type="button" onclick="printElementOnly(document.getElementById('${sectionId}'))" class="bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-95">
                    🖨 Print
                </button>
            </div>
            <h4 class="hidden print:block text-base font-black uppercase text-zinc-900">${escapeHtml(branch)}</h4>
            ${innerHtml}
        </div>`;
}

function renderBranchAwareTimelineHtml(logs, renderGroupFn, sectionKey) {
    if (!isChairmanAccount()) {
        return buildTimelineGroupedHtml(logs, renderGroupFn);
    }

    const sections = wrapContentInBranchSections(logs, (branchLogs, branch) => {
        return branchLogs.length
            ? buildTimelineGroupedHtml(branchLogs, renderGroupFn)
            : `<div class="p-6 text-center text-gray-500 font-mono text-xs uppercase font-black border-2 border-dashed border-[#E6B950]/20 rounded-xl">No activity for ${escapeHtml(branch)} in this range.</div>`;
    }, sectionKey);

    return `<div class="space-y-8">${sections}</div>`;
}

// A "sale" is every approved Stock Out. Daily view breaks it down by date; weekly/monthly total it
function renderSalesMetricList(container, cutoff) {
    const logs = (window.mockGlobalStockHistoryLedger || []).filter(log => {
        if (log.type !== "OUT" || log.approved === false) return false;
        const logDate = log.date ? new Date(log.date.replace(" ", "T")) : null;
        return logDate ? logDate >= cutoff : false;
    });

    // AMS-0000 still needs the branch-picker cards even when the global pool is empty for this window
    if (logs.length === 0 && !isChairmanAccount()) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 font-mono text-sm uppercase font-black">No sales recorded in this time range.</div>`;
        return;
    }

    // Group by barcode, not name, since two products can share a name
    function summarizeByProduct(entries) {
        const totals = new Map();
        entries.forEach(log => {
            const key = log.barcode || log.item;
            const existing = totals.get(key);
            if (existing) existing.qty += (log.qty || 0);
            else totals.set(key, { item: log.item || "Unknown", barcode: log.barcode || "---", qty: log.qty || 0 });
        });
        return Array.from(totals.values()).sort((a, b) => b.qty - a.qty);
    }

    function renderGroup(title, entries) {
        const summary = summarizeByProduct(entries);
        const rows = summary.map(p => `
            <div class="flex items-center justify-between gap-3 py-2 px-3 border-b border-white/5 last:border-0">
                <div class="min-w-0">
                    <p class="text-sm font-black text-white uppercase truncate">${escapeHtml(p.item)}</p>
                    <p class="text-[10px] font-mono text-gray-500">${escapeHtml(p.barcode)}</p>
                </div>
                <span class="text-lg font-black text-[#E6B950] shrink-0">${p.qty} <span class="text-[10px] font-bold text-gray-500 uppercase">pcs sold</span></span>
            </div>
        `).join("");
        return `
            <div class="bg-black/30 border border-[#E6B950]/15 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-black/60 text-white px-4 py-2 flex items-center justify-between border-b border-[#E6B950]/20">
                    <span class="text-xs font-black uppercase tracking-widest text-[#E6B950]">${escapeHtml(title)}</span>
                    <span class="text-[10px] font-mono font-bold text-[#F4D878]">${summary.reduce((s, p) => s + p.qty, 0)} pcs total</span>
                </div>
                ${rows}
            </div>`;
    }

    container.innerHTML = renderBranchAwareTimelineHtml(logs, renderGroup, "sales");
}

// Same data/windows as the Sales card, but ranks products and caps to the top N best sellers
const TOP_SELLING_RANK_LIMIT = 10;
const TOP_SELLING_RANK_MEDALS = ["🥇", "🥈", "🥉"];

function renderTopSellingMetricList(container, cutoff) {
    const logs = (window.mockGlobalStockHistoryLedger || []).filter(log => {
        if (log.type !== "OUT" || log.approved === false) return false;
        const logDate = log.date ? new Date(log.date.replace(" ", "T")) : null;
        return logDate ? logDate >= cutoff : false;
    });

    // AMS-0000 keeps the branch cards even when this window's global pool is empty
    if (logs.length === 0 && !isChairmanAccount()) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 font-mono text-sm uppercase font-black">No sales recorded in this time range.</div>`;
        return;
    }

    function summarizeByProduct(entries) {
        const totals = new Map();
        entries.forEach(log => {
            const key = log.barcode || log.item;
            const existing = totals.get(key);
            if (existing) existing.qty += (log.qty || 0);
            else totals.set(key, { item: log.item || "Unknown", barcode: log.barcode || "---", qty: log.qty || 0 });
        });
        return Array.from(totals.values()).sort((a, b) => b.qty - a.qty).slice(0, TOP_SELLING_RANK_LIMIT);
    }

    function renderGroup(title, entries) {
        const summary = summarizeByProduct(entries);
        const rows = summary.map((p, i) => `
            <div class="flex items-center justify-between gap-3 py-2 px-3 border-b border-white/5 last:border-0">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-lg font-black text-gray-500 w-8 text-center shrink-0">${TOP_SELLING_RANK_MEDALS[i] || `#${i + 1}`}</span>
                    <div class="min-w-0">
                        <p class="text-sm font-black text-white uppercase truncate">${escapeHtml(p.item)}</p>
                        <p class="text-[10px] font-mono text-gray-500">${escapeHtml(p.barcode)}</p>
                    </div>
                </div>
                <span class="text-lg font-black text-purple-400 shrink-0">${p.qty} <span class="text-[10px] font-bold text-gray-500 uppercase">pcs sold</span></span>
            </div>
        `).join("");
        return `
            <div class="bg-black/30 border border-[#E6B950]/15 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-purple-950/60 text-white px-4 py-2 flex items-center justify-between border-b border-purple-500/20">
                    <span class="text-xs font-black uppercase tracking-widest">${escapeHtml(title)}</span>
                    <span class="text-[10px] font-mono font-bold text-purple-300">Top ${summary.length}</span>
                </div>
                ${rows}
            </div>`;
    }

    container.innerHTML = renderBranchAwareTimelineHtml(logs, renderGroup, "topSelling");
}

// Forecast for next month: pools every approved Stock Out that historically fell in that
// calendar month across any past year, not just last year
function renderMustStockForecastList(container) {
    const now = new Date();
    const targetMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const targetMonthIndex = targetMonthDate.getMonth();
    const targetMonthName = targetMonthDate.toLocaleString("en-US", { month: "long" });

    const logs = (window.mockGlobalStockHistoryLedger || []).filter(log => {
        if (log.type !== "OUT" || log.approved === false) return false;
        const logDate = log.date ? new Date(log.date.replace(" ", "T")) : null;
        return logDate ? logDate.getMonth() === targetMonthIndex : false;
    });

    // No daily/weekly/monthly split here (this card is always "whole history for next month"),
    // so it builds its one ranked block directly rather than going through
    // buildTimelineGroupedHtml - but still gets the same per-branch wrap for AMS-0000.
    function buildForecastGroupHtml(entries) {
        if (entries.length === 0) {
            return `
                <div class="p-8 text-center text-gray-500 font-mono text-sm uppercase font-black space-y-2">
                    <div class="text-3xl">📅</div>
                    <p>Not enough historical sales data for ${escapeHtml(targetMonthName)} yet.</p>
                    <p class="text-[11px] font-bold normal-case text-gray-500">This list fills in automatically once past ${escapeHtml(targetMonthName)}s have sales on record.</p>
                </div>`;
        }

        const totals = new Map();
        entries.forEach(log => {
            const key = log.barcode || log.item;
            const logDate = new Date(log.date.replace(" ", "T"));
            const existing = totals.get(key);
            if (existing) {
                existing.qty += (log.qty || 0);
                existing.years.add(logDate.getFullYear());
            } else {
                totals.set(key, { item: log.item || "Unknown", barcode: log.barcode || "---", qty: log.qty || 0, years: new Set([logDate.getFullYear()]) });
            }
        });

        const ranked = Array.from(totals.values()).sort((a, b) => b.qty - a.qty).slice(0, TOP_SELLING_RANK_LIMIT);
        const rows = ranked.map((p, i) => `
            <div class="flex items-center justify-between gap-3 py-2 px-3 border-b border-white/5 last:border-0">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-lg font-black text-gray-500 w-8 text-center shrink-0">${TOP_SELLING_RANK_MEDALS[i] || `#${i + 1}`}</span>
                    <div class="min-w-0">
                        <p class="text-sm font-black text-white uppercase truncate">${escapeHtml(p.item)}</p>
                        <p class="text-[10px] font-mono text-gray-500">${escapeHtml(p.barcode)} · Sold in ${p.years.size} past ${p.years.size === 1 ? "year" : "years"}</p>
                    </div>
                </div>
                <span class="text-lg font-black text-teal-400 shrink-0">${p.qty} <span class="text-[10px] font-bold text-gray-500 uppercase">pcs historically</span></span>
            </div>
        `).join("");

        return `
            <div class="bg-black/30 border border-[#E6B950]/15 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-teal-950/60 text-white px-4 py-2 flex items-center justify-between border-b border-teal-500/20">
                    <span class="text-xs font-black uppercase tracking-widest">Historically Popular in ${escapeHtml(targetMonthName)}</span>
                    <span class="text-[10px] font-mono font-bold text-teal-300">Top ${ranked.length}</span>
                </div>
                ${rows}
            </div>`;
    }

    if (!isChairmanAccount()) {
        container.innerHTML = buildForecastGroupHtml(logs);
        return;
    }

    container.innerHTML = `<div class="space-y-8">${wrapContentInBranchSections(logs, (branchLogs) => buildForecastGroupHtml(branchLogs), "mustStock")}</div>`;
}

function renderTransactionMetricList(container, config, cutoff) {
    const logs = (window.mockGlobalStockHistoryLedger || []).filter(log => {
        if (config.typeFilter && log.type !== config.typeFilter) return false;
        const logDate = log.date ? new Date(log.date.replace(" ", "T")) : null;
        return logDate ? logDate >= cutoff : true; // keep undated entries visible
    });

    // AMS-0000 keeps the branch cards even when this window's global pool is empty
    if (logs.length === 0 && !isChairmanAccount()) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 font-mono text-sm uppercase font-black">No records found in this time range.</div>`;
        return;
    }

    function renderLogCards(entries) {
        return entries.map(log => {
            const typeColor = log.type === "IN"
                ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/40"
                : log.type === "OUT"
                ? "text-red-400 bg-red-950/40 border-red-500/40"
                : "text-amber-400 bg-amber-950/40 border-amber-500/40";
            return `
                <div class="flex items-start gap-4 p-4 bg-black/30 border border-[#E6B950]/15 rounded-xl shadow-sm">
                    <span class="text-xs font-black border ${typeColor} px-2 py-1 rounded shrink-0">${log.type}</span>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-black text-white text-sm uppercase truncate">${log.item || "Unknown"}</h4>
                        <p class="text-xs text-gray-400 mt-0.5">Barcode: ${log.barcode} | Qty: ${log.qty} | Branch: ${log.branch || "---"}</p>
                        <p class="text-xs text-gray-500">${log.date || ""} | By: ${log.user || "---"}</p>
                        <p class="text-xs text-gray-500">Location: ${log.location || "---"}</p>
                    </div>
                    <span class="text-[10px] font-mono font-black shrink-0 ${log.approved ? 'text-emerald-400' : 'text-amber-400'}">${log.approved ? 'APPROVED' : 'PENDING'}</span>
                </div>`;
        }).join("");
    }

    // AMS-0000 sees this broken down per-branch, everyone else keeps the flat list
    if (isChairmanAccount()) {
        container.innerHTML = wrapContentInBranchSections(logs, (branchLogs) => {
            return branchLogs.length
                ? renderLogCards(branchLogs)
                : `<div class="p-6 text-center text-gray-500 font-mono text-xs uppercase font-black border-2 border-dashed border-[#E6B950]/20 rounded-xl">No activity for this branch in this range.</div>`;
        }, `txn-${config.typeFilter || "all"}`);
    } else {
        container.innerHTML = renderLogCards(logs);
    }
}

function renderInventoryMetricList(container, config, cutoff) {
    // Most recent transaction date per barcode, so the timeline window applies to this snapshot
    const lastActivityByBarcode = {};
    (window.mockGlobalStockHistoryLedger || []).forEach(log => {
        if (!log.barcode || !log.date) return;
        const logDate = new Date(log.date.replace(" ", "T"));
        if (!lastActivityByBarcode[log.barcode] || logDate > lastActivityByBarcode[log.barcode]) {
            lastActivityByBarcode[log.barcode] = logDate;
        }
    });

    // Master catalog rows are never actually stocked at a real branch, so exclude them
    const products = (systemInventoryDatabase || []).filter(p => {
        if (p.branch === PRODUCT_SYSTEM_CATALOG_BRANCH) return false;
        if (!config.predicate(p)) return false;
        const lastActivity = lastActivityByBarcode[p.barcode];
        return lastActivity ? lastActivity >= cutoff : true; // no history yet, don't hide it
    });

    // AMS-0000 keeps the branch cards even when this window's global pool is empty
    if (products.length === 0 && !isChairmanAccount()) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 font-mono text-sm uppercase font-black">No products in this range.</div>`;
        return;
    }

    function renderProductCards(items) {
        return items.map(p => {
            const qtyColor = isOutOfStock(p) ? "text-red-400 bg-red-950/40 border-red-500/40" : "text-amber-400 bg-amber-950/40 border-amber-500/40";
            const thresholdNote = p.lowStockThreshold != null ? ` | Alert below ${p.lowStockThreshold}` : "";

            // Restock qty = full-stock target minus current qty, falls back to the alert threshold
            const restockTarget = p.fullStockQuantity != null ? p.fullStockQuantity : p.lowStockThreshold;
            const neededQty = restockTarget != null ? Math.max(0, restockTarget - p.availableQty) : null;
            const restockBadge = neededQty != null
                ? `<div class="text-center shrink-0 bg-emerald-950/30 border border-emerald-500/40 rounded-lg px-3 py-1.5">
                       <span class="block text-[9px] font-black uppercase tracking-widest text-emerald-400">Restock</span>
                       <span class="block text-sm font-black text-emerald-300">${neededQty} pcs</span>
                   </div>`
                : `<div class="text-center shrink-0 bg-black/30 border border-[#E6B950]/15 rounded-lg px-3 py-1.5" title="Set an alert level from the Stockroom location popup to see a suggested restock quantity">
                       <span class="block text-[9px] font-bold uppercase tracking-widest text-gray-500">No Alert Set</span>
                   </div>`;

            return `
                <div class="flex items-start gap-4 p-4 bg-black/30 border border-[#E6B950]/15 rounded-xl shadow-sm">
                    <span class="text-xs font-black border ${qtyColor} px-2 py-1 rounded shrink-0">QTY ${p.availableQty}</span>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-black text-white text-sm uppercase truncate">${p.productName || "Unknown"}</h4>
                        <p class="text-xs text-gray-400 mt-0.5">Barcode: ${p.barcode} | Branch: ${p.branch || "---"}${thresholdNote}</p>
                        <p class="text-xs text-gray-500">${p.shelf ? buildLocationCode(p.shelf, p.row, p.column) : "---"}</p>
                    </div>
                    ${restockBadge}
                </div>`;
        }).join("");
    }

    // AMS-0000 sees this broken down per-branch, everyone else keeps the flat list
    if (isChairmanAccount()) {
        container.innerHTML = wrapContentInBranchSections(
            products,
            (branchProducts) => branchProducts.length
                ? renderProductCards(branchProducts)
                : `<div class="p-6 text-center text-gray-500 font-mono text-xs uppercase font-black border-2 border-dashed border-[#E6B950]/20 rounded-xl">No products for this branch in this range.</div>`,
            `inv-${config.predicate === isLowStock ? "low" : "out"}`,
            (branchProducts) => `${branchProducts.length} product${branchProducts.length === 1 ? "" : "s"}`
        );
    } else {
        container.innerHTML = renderProductCards(products);
    }
}

// Profile modal
function openProfileManagementModal() {
    const profile = window.currentUserProfile || {};

    if (document.getElementById("modalDisplayId")) document.getElementById("modalDisplayId").innerText = profile.user_id || "---";
    if (document.getElementById("modalInputName")) document.getElementById("modalInputName").value = profile.name || "";
    if (document.getElementById("modalInputEmail")) document.getElementById("modalInputEmail").value = profile.email || "";
    if (document.getElementById("modalProfilePhoto")) document.getElementById("modalProfilePhoto").src = profile.face_photo || "amFace.png";
    if (document.getElementById("modalInputOldPin")) document.getElementById("modalInputOldPin").value = "";
    if (document.getElementById("modalInputNewPin")) document.getElementById("modalInputNewPin").value = "";
    if (document.getElementById("modalDeleteConfirmPin")) document.getElementById("modalDeleteConfirmPin").value = "";

    closeProfilePhotoCapture();
    openRightSlidePanel("profileSettingsModal");
}

function closeProfileManagementModal() {
    closeProfilePhotoCapture();
    closeRightSlidePanel("profileSettingsModal");
}

async function executeProfileDetailsUpdate() {
    const username = window.currentUserProfile?.user_id || localStorage.getItem("username");
    const name = document.getElementById("modalInputName")?.value.trim();
    const email = document.getElementById("modalInputEmail")?.value.trim();

    if (!name || !email) { displayNotification("Name and Email can't be empty.", false); return; }

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("name", name);
        payload.append("email", email);

        const response = await fetch(`${apiUrl}/api/update-profile`, { method: "POST", body: payload });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            if (window.currentUserProfile) {
                window.currentUserProfile.name = data.name;
                window.currentUserProfile.email = data.email;
            }
            if (document.getElementById("headerUserName")) document.getElementById("headerUserName").innerText = data.name;
            localStorage.setItem("user_name", data.name);

            // AMS-0000's header title shows their own name, keep it in sync immediately on rename
            if (isChairmanAccount() && document.getElementById("dashboardLocationTitle")) {
                document.getElementById("dashboardLocationTitle").innerText = (data.name || "").toUpperCase();
            }

            displayNotification("Profile updated successfully!", true);
        } else {
            displayNotification(data.detail || "Failed to update profile.", false);
        }
    } catch (err) {
        console.error("executeProfileDetailsUpdate error:", err);
        displayNotification("Failed to reach server to update profile.", false);
    }
}

async function executeSecurityPinUpdate() {
    const username = window.currentUserProfile?.user_id || localStorage.getItem("username");
    const oldPin = document.getElementById("modalInputOldPin")?.value.trim();
    const newPin = document.getElementById("modalInputNewPin")?.value.trim();

    if (!/^\d{4}$/.test(oldPin || "") || !/^\d{4}$/.test(newPin || "")) {
        displayNotification("Both PINs must be exactly 4 digits.", false);
        return;
    }

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("old_password", oldPin);
        payload.append("new_password", newPin);

        const response = await fetch(`${apiUrl}/api/change-password`, { method: "POST", body: payload });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            document.getElementById("modalInputOldPin").value = "";
            document.getElementById("modalInputNewPin").value = "";
            displayNotification("PIN changed successfully!", true);
        } else {
            displayNotification(data.detail || "Failed to change PIN.", false);
        }
    } catch (err) {
        console.error("executeSecurityPinUpdate error:", err);
        displayNotification("Failed to reach server to change PIN.", false);
    }
}

async function executeAccountDeletionSequence() {
    const username = window.currentUserProfile?.user_id || localStorage.getItem("username");
    const pin = document.getElementById("modalDeleteConfirmPin")?.value.trim();

    if (!/^\d{4}$/.test(pin || "")) { displayNotification("Enter your 4-digit PIN to confirm deletion.", false); return; }
    if (!confirm("DANGER: Delete this account permanently? This cannot be undone.")) return;

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("password", pin);

        const response = await fetch(`${apiUrl}/api/delete-account`, { method: "POST", body: payload });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            displayNotification("Account deleted. Logging out...", true);
            localStorage.clear();
            setTimeout(() => location.reload(), 1200);
        } else {
            displayNotification(data.detail || "Failed to delete account.", false);
        }
    } catch (err) {
        console.error("executeAccountDeletionSequence error:", err);
        displayNotification("Failed to reach server to delete account.", false);
    }
}

// Profile photo change (re-captures the face for recognition)
let profilePhotoWebcamStream = null;

async function openProfilePhotoCapture() {
    const zone = document.getElementById("profilePhotoCaptureZone");
    const video = document.getElementById("profilePhotoWebcam");
    const canvas = document.getElementById("profilePhotoCanvas");
    const status = document.getElementById("profilePhotoCaptureStatus");
    if (!zone || !video) return;

    zone.classList.remove("hidden");
    video.classList.remove("hidden");
    canvas.classList.add("hidden");
    document.getElementById("profilePhotoCaptureBtn").classList.remove("hidden");
    document.getElementById("profilePhotoRetakeBtn").classList.add("hidden");
    document.getElementById("profilePhotoSaveBtn").classList.add("hidden");

    try {
        profilePhotoWebcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = profilePhotoWebcamStream;
        status.innerText = "Position your face in frame, then press Capture.";
    } catch (err) {
        console.warn("Profile photo camera blocked:", err);
        status.innerText = "Camera access blocked.";
    }
}

function captureNewProfilePhoto() {
    const video = document.getElementById("profilePhotoWebcam");
    const canvas = document.getElementById("profilePhotoCanvas");
    const status = document.getElementById("profilePhotoCaptureStatus");

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    video.classList.add("hidden");
    canvas.classList.remove("hidden");
    document.getElementById("profilePhotoCaptureBtn").classList.add("hidden");
    document.getElementById("profilePhotoRetakeBtn").classList.remove("hidden");
    document.getElementById("profilePhotoSaveBtn").classList.remove("hidden");
    status.innerText = "Looks good? Save it, or retake.";
}

function retakeNewProfilePhoto() {
    const video = document.getElementById("profilePhotoWebcam");
    const canvas = document.getElementById("profilePhotoCanvas");
    const status = document.getElementById("profilePhotoCaptureStatus");

    video.classList.remove("hidden");
    canvas.classList.add("hidden");
    document.getElementById("profilePhotoCaptureBtn").classList.remove("hidden");
    document.getElementById("profilePhotoRetakeBtn").classList.add("hidden");
    document.getElementById("profilePhotoSaveBtn").classList.add("hidden");
    status.innerText = "Position your face in frame, then press Capture.";
}

async function saveNewProfilePhoto() {
    const canvas = document.getElementById("profilePhotoCanvas");
    const status = document.getElementById("profilePhotoCaptureStatus");
    const username = window.currentUserProfile?.user_id || localStorage.getItem("username");

    const base64Photo = canvas.toDataURL("image/jpeg", 0.85);
    status.innerText = "Saving...";

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("facePhoto", base64Photo);

        const response = await fetch(`${apiUrl}/api/update-face-photo`, { method: "POST", body: payload });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            if (window.currentUserProfile) window.currentUserProfile.face_photo = data.face_photo;
            if (document.getElementById("modalProfilePhoto")) document.getElementById("modalProfilePhoto").src = data.face_photo;
            if (document.getElementById("headerUserAvatar")) document.getElementById("headerUserAvatar").src = data.face_photo;
            displayNotification("Face photo updated successfully!", true);
            closeProfilePhotoCapture();
        } else {
            status.innerText = data.detail || "Failed to save photo.";
            displayNotification(data.detail || "Failed to save photo.", false);
        }
    } catch (err) {
        console.error("saveNewProfilePhoto error:", err);
        displayNotification("Failed to reach server to save photo.", false);
    }
}

function closeProfilePhotoCapture() {
    if (profilePhotoWebcamStream) {
        profilePhotoWebcamStream.getTracks().forEach(track => track.stop());
        profilePhotoWebcamStream = null;
    }
    document.getElementById("profilePhotoCaptureZone")?.classList.add("hidden");
}

// Notifications: fed by pending approvals, low/out-of-stock, recent activity, and local
// CRUD feedback. Dismissals persist in localStorage so they don't reappear on recompute.
let systemNotificationsLedger = [];
let localActivityNotificationCounter = 30000;

function getDismissedNotificationIds() {
    try {
        return new Set(JSON.parse(localStorage.getItem("dismissed_notification_ids") || "[]"));
    } catch (err) {
        return new Set();
    }
}

function markNotificationDismissed(id) {
    const ids = getDismissedNotificationIds();
    ids.add(id);
    localStorage.setItem("dismissed_notification_ids", JSON.stringify(Array.from(ids).slice(-200)));
}

// Instant one-off feedback for the current user's own action, not subject to dismissed-id filtering
function pushLocalActivityNotification(text, onClick) {
    localActivityNotificationCounter += 1;
    systemNotificationsLedger.unshift({ id: localActivityNotificationCounter, text, onClick: onClick || null });
    renderNotificationListUI();
}

function toggleNotificationDropdown() {
    const dropdown = document.getElementById("notificationDropdownMenu");
    if (!dropdown) return;
    dropdown.classList.toggle("hidden");
    renderNotificationListUI();
}

function renderNotificationListUI() {
    const wrapper = document.getElementById("notificationListWrapper");
    const badge = document.getElementById("notificationBadgeCount");
    if (!wrapper) return;

    wrapper.innerHTML = "";

    if (systemNotificationsLedger.length === 0) {
        wrapper.innerHTML = `<div class="p-6 text-center text-zinc-500 text-xs font-medium">No active notifications.</div>`;
        if (badge) badge.classList.add("hidden");
        return;
    }

    if (badge) { badge.classList.remove("hidden"); badge.innerText = systemNotificationsLedger.length; }

    systemNotificationsLedger.forEach(n => {
        const item = document.createElement("div");
        const clickable = !!n.onClick;
        item.className = `p-3.5 hover:bg-[#1C160B]/40 transition flex items-start gap-2.5 text-xs font-semibold text-zinc-300 leading-relaxed${clickable ? " cursor-pointer" : ""}`;
        const dismissBtn = n.persistent
            ? ""
            : `<button onclick="dismissSingleNotificationRecord(${n.id}, event)" class="text-zinc-500 hover:text-red-400 font-black pl-1 shrink-0">&#215;</button>`;
        item.innerHTML = `<div class="flex-1"${clickable ? ` onclick="${n.onClick}"` : ""}>${n.text}</div>${dismissBtn}`;
        wrapper.appendChild(item);
    });
}

function dismissSingleNotificationRecord(id, e) {
    if (e) e.stopPropagation();
    markNotificationDismissed(id);
    systemNotificationsLedger = systemNotificationsLedger.filter(n => n.id !== id);
    renderNotificationListUI();
}

function clearAllNotifications() {
    systemNotificationsLedger.filter(n => !n.persistent).forEach(n => markNotificationDismissed(n.id));
    systemNotificationsLedger = systemNotificationsLedger.filter(n => n.persistent);
    renderNotificationListUI();
}

// Live clock
function startLiveDashboardClock() {
    const clockEl = document.getElementById('liveDashboardClock');
    const dateEl = document.getElementById('liveDashboardDate');
    if (!clockEl || !dateEl) return;

    const tick = () => {
        const now = new Date();
        let h = now.getHours();
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        clockEl.innerText = `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
        const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        dateEl.innerText = now.toLocaleDateString('en-US', opts).replace(/,/g, '').toUpperCase();
    };
    tick();
    setInterval(tick, 1000);
}

// Storeroom map (dynamic)
let currentStoreroomsList = [];
let activeStoreroomDetail = null;
let activeStoreroomId = null;
let storeroomStructureModalMode = null;
let editingStructureId = null;
let storeroomActiveView = "map"; // "map" | "list"
const SHELF_FIXED_COLOR = "#0B1D51"; // navy blue - shelf color is fixed, not user-editable
let activeShelfBeepInterval = null;
let activeShelfBeepTimeout = null;

// Store (shop floor): separate state from Stockroom above, same shape, flat per branch
let activeStoreSectionDetail = null;
let storeStructureModalMode = null;
let editingStoreStructureId = null;
let storeActiveView = "map"; // "map" | "list"
const STORE_SHELF_FIXED_COLOR = "#0B1D51"; // same navy - keep visual parity with Stockroom

function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Prints just one element instead of the whole page
function printElementOnly(el) {
    if (!el) return;
    document.body.classList.add("printing-single-card");
    el.classList.add("print-card-target");
    const cleanup = () => {
        document.body.classList.remove("printing-single-card");
        el.classList.remove("print-card-target");
        window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
}

// Numeric labels get zero-padded to 2 digits ("1" -> "01"); non-numeric custom labels pass through as-is.
function formatLocationSegment(label) {
    const trimmed = String(label ?? "").trim();
    return /^\d+$/.test(trimmed) ? trimmed.padStart(2, "0") : trimmed;
}

function buildLocationCode(shelfName, rowLabel, columnLabel) {
    return `${shelfName}${formatLocationSegment(rowLabel)}${formatLocationSegment(columnLabel)}`;
}

function computeStockStatus(qty, threshold) {
    if (qty === 0) return "out";
    if (qty > 0 && threshold != null && qty < threshold) return "low";
    return "good";
}

function statusColor(status) {
    return { good: "#3b7f2a", low: "#ff9900", out: "#d60018", empty: "#d9d9d9" }[status] || "#d9d9d9";
}

function getCurrentBranch() {
    return localStorage.getItem("selected_branch") || "Alum Rock";
}

async function fetchStoreroomsForBranch(branch) {
    try {
        const response = await fetch(`${apiUrl}/api/storerooms?branch=${encodeURIComponent(branch)}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (err) {
        console.error("fetchStoreroomsForBranch error:", err);
        return [];
    }
}

async function fetchStoreDetailForBranch(branch) {
    try {
        const response = await fetch(`${apiUrl}/api/store/detail?branch=${encodeURIComponent(branch)}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) return { shelves: [], walkways: [] };
        return await response.json();
    } catch (err) {
        console.error("fetchStoreDetailForBranch error:", err);
        return { shelves: [], walkways: [] };
    }
}

// Stockrooms card (AMS-0000 only): pick a branch, drill into its stockrooms, view-only
let stockroomsBrowserBranch = null;
let stockroomsBrowserInventory = [];

function openStockroomsBranchPicker() {
    openRightSlidePanel("stockroomsBranchPickerModal");
}

function closeStockroomsBranchPicker() {
    closeRightSlidePanel("stockroomsBranchPickerModal");
}

function closeStockroomsBranchPopup() {
    closeRightSlidePanel("stockroomsBranchPopupModal");
}

async function selectStockroomsBranch(branch) {
    closeStockroomsBranchPicker();
    stockroomsBrowserBranch = branch;

    const titleEl = document.getElementById("stockroomsBranchPopupTitle");
    const grid = document.getElementById("stockroomsBranchPopupGrid");
    if (titleEl) titleEl.innerText = `${branch} — Stockrooms`;
    if (grid) grid.innerHTML = `<p class="col-span-full text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;

    openRightSlidePanel("stockroomsBranchPopupModal");

    const [storerooms, inventoryResponse] = await Promise.all([
        fetchStoreroomsForBranch(branch),
        fetch(`${apiUrl}/api/inventory/list?branch=${encodeURIComponent(branch)}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        }).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    stockroomsBrowserInventory = inventoryResponse;
    if (!grid) return;

    if (storerooms.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-zinc-400 font-bold uppercase text-sm py-10">No stockrooms set up for ${escapeHtml(branch)} yet.</p>`;
        return;
    }

    grid.innerHTML = storerooms.map(sr => `
        <button type="button" onclick="openStockroomsBranchDetail(${sr.id}, '${escapeHtml(sr.name).replace(/'/g, "\\'")}')" class="bg-black/30 hover:bg-[#E6B950]/10 border-2 border-[#E6B950]/20 hover:border-[#E6B950] rounded-xl p-4 text-center transition-all">
            <div class="text-3xl mb-2">▤</div>
            <h4 class="font-black text-white uppercase text-sm truncate">${escapeHtml(sr.name)}</h4>
            <p class="text-[10px] font-extrabold text-gray-400 uppercase mt-1">${sr.shelf_count} Shelves &middot; ${sr.row_count} Rows &middot; ${sr.column_count} Columns</p>
        </button>
    `).join("");
}

function closeStockroomsBranchDetail() {
    closeRightSlidePanel("stockroomsBranchDetailModal");
}

function backToStockroomsBranchPopup() {
    closeStockroomsBranchDetail();
    openRightSlidePanel("stockroomsBranchPopupModal");
}

async function openStockroomsBranchDetail(storeroomId, storeroomName) {
    closeStockroomsBranchPopup();

    const titleEl = document.getElementById("stockroomsBranchDetailTitle");
    const body = document.getElementById("stockroomsBranchDetailBody");
    if (titleEl) titleEl.innerText = `${stockroomsBrowserBranch} — ${storeroomName}`;
    if (body) body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;
    openRightSlidePanel("stockroomsBranchDetailModal");

    let detail;
    try {
        const response = await fetch(`${apiUrl}/api/storerooms/${storeroomId}/detail`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Stockroom not found");
        detail = sortShelfRowsAndColumns(await response.json());
    } catch (err) {
        console.error("openStockroomsBranchDetail error:", err);
        if (body) body.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Could not load this stockroom.</p>`;
        return;
    }
    if (!body) return;

    // Product lookup keyed by shelf/row/column, scoped to this one stockroom
    const productsByCell = new Map();
    stockroomsBrowserInventory.forEach(item => {
        if (item.storeroom_id !== storeroomId) return;
        const rowKey = `${item.shelf_name}|row|${item.row_number}`;
        const colKey = `${item.shelf_name}|col|${item.column_number}`;
        [rowKey, colKey].forEach(key => {
            if (!productsByCell.has(key)) productsByCell.set(key, []);
            productsByCell.get(key).push(item);
        });
    });

    const renderProductsList = (items) => {
        if (!items || items.length === 0) return `<p class="text-[10px] text-gray-500 font-bold uppercase mt-1">Empty</p>`;
        return items.map(p => `
            <p class="text-[10px] font-bold text-gray-400 mt-1 truncate flex items-center gap-1.5">
                ${p.photo
                    ? `<img src="${p.photo}" alt="${escapeHtml(p.name)}" class="w-5 h-5 object-cover rounded border border-[#E6B950]/20 shrink-0">`
                    : `<span class="w-5 h-5 rounded border border-dashed border-[#E6B950]/30 flex items-center justify-center text-[9px] text-gray-500 shrink-0">📦</span>`}
                <span class="truncate">${escapeHtml(p.name)} — <span class="${p.quantity === 0 ? 'text-red-400' : 'text-emerald-400'}">${p.quantity} pcs</span></span>
            </p>
        `).join("");
    };

    const shelves = detail.shelves || [];
    const walkways = detail.walkways || [];

    const shelvesHtml = shelves.length ? shelves.map(shelf => {
        const rowsHtml = (shelf.rows || []).length ? shelf.rows.map(row => `
            <div class="py-2 px-3 border-b border-white/5 last:border-0">
                <span class="text-xs font-bold text-gray-300">Row: ${escapeHtml(row.label)}</span>
                ${renderProductsList(productsByCell.get(`${shelf.name}|row|${row.label}`))}
            </div>
        `).join("") : `<p class="text-xs text-gray-500 uppercase font-bold px-3 py-2">No rows yet.</p>`;

        const columnsHtml = (shelf.columns || []).length ? shelf.columns.map(col => `
            <div class="py-2 px-3 border-b border-white/5 last:border-0">
                <span class="text-xs font-bold text-gray-300">Column: ${escapeHtml(col.label)}</span>
                ${renderProductsList(productsByCell.get(`${shelf.name}|col|${col.label}`))}
            </div>
        `).join("") : `<p class="text-xs text-gray-500 uppercase font-bold px-3 py-2">No columns yet.</p>`;

        return `
            <div class="border border-[#E6B950]/15 rounded-xl overflow-hidden">
                <div class="px-4 py-3 bg-black/60">
                    <span class="font-black text-[#E6B950] uppercase tracking-wide">${escapeHtml(shelf.name)}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                    <div>${rowsHtml}</div>
                    <div>${columnsHtml}</div>
                </div>
            </div>`;
    }).join("") : `<p class="text-sm text-gray-400 uppercase font-bold">No shelves in this stockroom yet.</p>`;

    const walkwaysHtml = walkways.length ? `
        <div>
            <h4 class="text-xs font-black uppercase text-gray-400 mb-2">Walkways</h4>
            ${walkways.map(w => `<div class="text-xs font-black uppercase text-gray-300 py-2 px-4 border border-[#E6B950]/15 rounded-xl mb-2">Walkway: ${escapeHtml(w.label || "WALKWAY")}</div>`).join("")}
        </div>` : "";

    body.innerHTML = `<div class="space-y-4">${shelvesHtml}</div>${walkwaysHtml}`;
}

// ============================================================
// STORE VIEWER (AMS-0000 only): pick a branch, see that branch's Store (shop-floor) list view -
// shelves/rows/columns and what's on each. View-only, entirely separate from the admin's own
// session branch/state, same as the Stockrooms viewer above. Store has no middle "which
// storeroom" tier (flattened to one flat map per branch), so picking a branch here goes straight
// to its list view instead of a middle card-grid step.
// ============================================================
let storeViewerBranch = null;
let storeViewerInventory = [];

function openStoreViewerBranchPicker() {
    openRightSlidePanel("storeBranchPickerModal");
}

function closeStoreViewerBranchPicker() {
    closeRightSlidePanel("storeBranchPickerModal");
}

function closeStoreViewerBranchDetail() {
    closeRightSlidePanel("storeBranchDetailModal");
}

function backToStoreViewerBranchPicker() {
    closeStoreViewerBranchDetail();
    openRightSlidePanel("storeBranchPickerModal");
}

async function selectStoreViewerBranch(branch) {
    closeStoreViewerBranchPicker();
    storeViewerBranch = branch;

    const titleEl = document.getElementById("storeBranchDetailTitle");
    const body = document.getElementById("storeBranchDetailBody");
    if (titleEl) titleEl.innerText = `${branch} — Store`;
    if (body) body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;
    openRightSlidePanel("storeBranchDetailModal");

    let detail;
    try {
        const [detailResponse, inventoryResponse] = await Promise.all([
            fetch(`${apiUrl}/api/store/detail?branch=${encodeURIComponent(branch)}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
            }),
            fetch(`${apiUrl}/api/inventory/list?branch=${encodeURIComponent(branch)}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
            }).then(r => r.ok ? r.json() : []).catch(() => [])
        ]);
        if (!detailResponse.ok) throw new Error("Store not found");
        detail = sortShelfRowsAndColumns(await detailResponse.json());
        storeViewerInventory = inventoryResponse;
    } catch (err) {
        console.error("selectStoreViewerBranch error:", err);
        if (body) body.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Could not load this branch's store.</p>`;
        return;
    }
    if (!body) return;

    // Product lookup keyed by Store shelf/row/column, same idea as the Stockroom viewer above
    const productsByCell = new Map();
    storeViewerInventory.forEach(item => {
        if (item.store_shelf_name == null) return;
        const rowKey = `${item.store_shelf_name}|row|${item.store_row_number}`;
        const colKey = `${item.store_shelf_name}|col|${item.store_column_number}`;
        [rowKey, colKey].forEach(key => {
            if (!productsByCell.has(key)) productsByCell.set(key, []);
            productsByCell.get(key).push(item);
        });
    });

    const renderProductsList = (items) => {
        if (!items || items.length === 0) return `<p class="text-[10px] text-gray-500 font-bold uppercase mt-1">Empty</p>`;
        return items.map(p => `
            <p class="text-[10px] font-bold text-gray-400 mt-1 truncate flex items-center gap-1.5">
                ${p.photo
                    ? `<img src="${p.photo}" alt="${escapeHtml(p.name)}" class="w-5 h-5 object-cover rounded border border-[#E6B950]/20 shrink-0">`
                    : `<span class="w-5 h-5 rounded border border-dashed border-[#E6B950]/30 flex items-center justify-center text-[9px] text-gray-500 shrink-0">📦</span>`}
                <span class="truncate">${escapeHtml(p.name)} — <span class="${(p.shelf_quantity || 0) === 0 ? 'text-red-400' : 'text-emerald-400'}">${p.shelf_quantity || 0} pcs</span></span>
            </p>
        `).join("");
    };

    const shelves = detail.shelves || [];
    const walkways = detail.walkways || [];

    const shelvesHtml = shelves.length ? shelves.map(shelf => {
        const rowsHtml = (shelf.rows || []).length ? shelf.rows.map(row => `
            <div class="py-2 px-3 border-b border-white/5 last:border-0">
                <span class="text-xs font-bold text-gray-300">Row: ${escapeHtml(row.label)}</span>
                ${renderProductsList(productsByCell.get(`${shelf.name}|row|${row.label}`))}
            </div>
        `).join("") : `<p class="text-xs text-gray-500 uppercase font-bold px-3 py-2">No rows yet.</p>`;

        const columnsHtml = (shelf.columns || []).length ? shelf.columns.map(col => `
            <div class="py-2 px-3 border-b border-white/5 last:border-0">
                <span class="text-xs font-bold text-gray-300">Column: ${escapeHtml(col.label)}</span>
                ${renderProductsList(productsByCell.get(`${shelf.name}|col|${col.label}`))}
            </div>
        `).join("") : `<p class="text-xs text-gray-500 uppercase font-bold px-3 py-2">No columns yet.</p>`;

        return `
            <div class="border border-[#E6B950]/15 rounded-xl overflow-hidden">
                <div class="px-4 py-3 bg-black/60">
                    <span class="font-black text-[#E6B950] uppercase tracking-wide">${escapeHtml(shelf.name)}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                    <div>${rowsHtml}</div>
                    <div>${columnsHtml}</div>
                </div>
            </div>`;
    }).join("") : `<p class="text-sm text-gray-400 uppercase font-bold">No shelves set up for ${escapeHtml(branch)} yet.</p>`;

    const walkwaysHtml = walkways.length ? `
        <div>
            <h4 class="text-xs font-black uppercase text-gray-400 mb-2">Walkways</h4>
            ${walkways.map(w => `<div class="text-xs font-black uppercase text-gray-300 py-2 px-4 border border-[#E6B950]/15 rounded-xl mb-2">Walkway: ${escapeHtml(w.label || "WALKWAY")}</div>`).join("")}
        </div>` : "";

    body.innerHTML = `<div class="space-y-4">${shelvesHtml}</div>${walkwaysHtml}`;
}

// Full Management (AMS-Adm): the real editable Stockroom/Store/Till screens for any branch
// it picks. Relocates the actual DOM sections into this popup's mount point while open,
// then moves them back on close. getCurrentBranch() is temporarily pointed at the picked branch.
let fullManagementPrevBranch = null;
let fullManagementActiveArea = null; // "stockrooms" | "store" | "till" | null

function openFullManagementPicker() {
    openRightSlidePanel("fullManagementPickerModal");
}
function closeFullManagementPicker() {
    closeRightSlidePanel("fullManagementPickerModal");
}

function fullManagementSelectedBranch() {
    return document.getElementById("fullManagementBranchSelect")?.value || "Alum Rock";
}

// Only snapshots the pre-popup branch once per visit, not on every card click inside it
function enterFullManagementBranch() {
    if (fullManagementPrevBranch === null) fullManagementPrevBranch = getCurrentBranch();
    localStorage.setItem("selected_branch", fullManagementSelectedBranch());
}

function exitFullManagementBranch() {
    if (fullManagementPrevBranch !== null) {
        localStorage.setItem("selected_branch", fullManagementPrevBranch);
        fullManagementPrevBranch = null;
    }
}

async function openFullManagementStockrooms() {
    enterFullManagementBranch();
    closeFullManagementPicker();
    fullManagementActiveArea = "stockrooms";

    const mount = document.getElementById("fullManagementContentMount");
    const titleEl = document.getElementById("fullManagementContentTitle");
    const storeroomsSection = document.getElementById("storeroomsSection");
    const storeroomMapSection = document.getElementById("storeroomMapSection");
    if (titleEl) titleEl.innerText = `${fullManagementSelectedBranch()} — Stockrooms`;

    if (mount && storeroomsSection && storeroomMapSection) {
        mount.appendChild(storeroomsSection);
        mount.appendChild(storeroomMapSection);
        storeroomsSection.classList.remove("hidden");
        // Always land on the list view, not whatever map was last open for a different branch
        storeroomMapSection.classList.add("hidden");
        activeStoreroomId = null;
        activeStoreroomDetail = null;
    }

    openRightSlidePanel("fullManagementContentModal");
    await renderStoreroomCards();
}

async function openFullManagementStore() {
    enterFullManagementBranch();
    closeFullManagementPicker();
    fullManagementActiveArea = "store";

    const mount = document.getElementById("fullManagementContentMount");
    const titleEl = document.getElementById("fullManagementContentTitle");
    const storeContent = document.getElementById("storeManagementContent");
    if (titleEl) titleEl.innerText = `${fullManagementSelectedBranch()} — Store`;

    if (mount && storeContent) {
        mount.appendChild(storeContent);
        storeContent.classList.remove("hidden");
        // Full Management only wants the map/list, not the 4 metric cards. Restored on close.
        document.getElementById("storeManagementMetricCardsSection")?.classList.add("hidden");
    }

    openRightSlidePanel("fullManagementContentModal");
    storeActiveView = "map";
    await loadStoreBranchMap();
    fetchStoreManagementStats();
}

function openFullManagementTill() {
    enterFullManagementBranch();
    closeFullManagementPicker();
    fullManagementActiveArea = "till";
    openTillManagementHub();
}

// Moves the borrowed section back to its normal home and restores the previous branch.
// Till never gets relocated, it opens in its own tab and closes independently.
function closeFullManagementContent() {
    const homeContent = document.getElementById("dashboardHomeContent");

    if (fullManagementActiveArea === "stockrooms") {
        const storeroomsSection = document.getElementById("storeroomsSection");
        const storeroomMapSection = document.getElementById("storeroomMapSection");
        if (homeContent && storeroomsSection) homeContent.appendChild(storeroomsSection);
        if (homeContent && storeroomMapSection) homeContent.appendChild(storeroomMapSection);
        storeroomsSection?.classList.add("hidden");
        storeroomMapSection?.classList.add("hidden");
    } else if (fullManagementActiveArea === "store") {
        const storeContent = document.getElementById("storeManagementContent");
        if (homeContent && storeContent) homeContent.appendChild(storeContent);
        storeContent?.classList.add("hidden");
        // Undo the Full Management-only hide, so the regular screen shows its metric cards again
        document.getElementById("storeManagementMetricCardsSection")?.classList.remove("hidden");
    }

    fullManagementActiveArea = null;
    closeRightSlidePanel("fullManagementContentModal");
    exitFullManagementBranch();
}

function backToFullManagementPicker() {
    closeFullManagementContent();
    openFullManagementPicker();
}

// Staff Attendance: opens attendance.html in its own browser tab, same as Till,
// sharing this app's account database (user id, password, face recognition all
// come from the same backend/users table - no separate login for attendance).
function openStaffAttendancePage() {
    // Uses apiUrl so this still works when index.html is viewed via something other than the real backend
    window.open(`${apiUrl}/attendance.html`, "_blank");
}

// Staff Attendance Admin Panel: Staff List with Attendance/Edit/Delete per row.
// "Attendance" jumps to the current week; "History" drill-downs Year -> Month -> Week.
// "Delete" only hides a staff member, they reappear on next clock in/out.
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let staffAdminCachedStaffList = [];
let staffAdminView = "list"; // "list" | "current" | "history-months" | "history-weeks" | "history-week"
let staffAdminActiveUsername = null;
let staffAdminCurrentPointer = null; // {year, month, week} - current-week fast path
let staffAdminHistoryPointer = null; // {year, month, week} - independent, for browsing History
let staffAdminAvailableYears = [];
let staffAdminMonthDetailCache = null; // { year, month, data } - last /api/attendance/month-detail fetch

function openStaffAttendanceAdminPanel() {
    openRightSlidePanel("staffAttendanceAdminModal");
    staffAdminView = "list";
    renderStaffAdminList();
}

function closeStaffAttendanceAdminPanel() {
    closeRightSlidePanel("staffAttendanceAdminModal");
}

function formatAttendanceTimestamp(raw) {
    if (!raw) return "—";
    const parts = raw.split(" ");
    return parts.length === 2 ? `${parts[0]} · ${parts[1].slice(0, 5)}` : raw;
}

// Mirrors the backend's week-range logic so the client can find today's bucket without a round trip
function weekDateRanges(daysInMonth, startDay, cycleLength) {
    const ranges = {};
    let weekNum = 1;
    if (startDay > 1) {
        ranges[weekNum] = [1, startDay - 1];
        weekNum++;
    }
    let day = startDay;
    while (day <= daysInMonth) {
        const end = Math.min(day + cycleLength - 1, daysInMonth);
        ranges[weekNum] = [day, end];
        weekNum++;
        day += cycleLength;
    }
    return ranges;
}

function customWeekOfMonth(day, daysInMonth, startDay, cycleLength) {
    const ranges = weekDateRanges(daysInMonth, startDay, cycleLength);
    for (const [weekNum, [dStart, dEnd]] of Object.entries(ranges)) {
        if (day >= dStart && day <= dEnd) return parseInt(weekNum);
    }
    return 1;
}

async function fetchMonthDetail(year, month) {
    if (staffAdminMonthDetailCache && staffAdminMonthDetailCache.year === year && staffAdminMonthDetailCache.month === month) {
        return staffAdminMonthDetailCache.data;
    }
    const response = await fetch(`${apiUrl}/api/attendance/month-detail?year=${year}&month=${month}`);
    const data = await response.json();
    staffAdminMonthDetailCache = { year, month, data };
    return data;
}

// ── Staff List (default landing view) ──
async function renderStaffAdminList() {
    const body = document.getElementById("staffAdminBody");
    if (!body) return;
    body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;

    try {
        const response = await fetch(`${apiUrl}/api/staff/list`);
        const staffData = await response.json();
        staffAdminCachedStaffList = staffData.staff || [];

        if (staffAdminCachedStaffList.length === 0) {
            body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">No staff registered yet.</p>`;
            return;
        }

        // Delete (hide-from-panel) is AMS-Adm only, AMS-0000 shares this panel but not this action
        const canDeleteStaff = (localStorage.getItem("username") || "").toUpperCase() === "AMS-ADM";

        body.innerHTML = `<div class="space-y-3">${staffAdminCachedStaffList.map(s => {
            const safeUsername = escapeHtml(s.username).replace(/'/g, "\\'");
            return `
                <div class="flex flex-wrap items-center gap-3 bg-black/30 border border-[#E6B950]/15 rounded-xl p-4">
                    <img src="${s.face_photo || 'amFace.png'}" class="w-12 h-12 rounded-full object-cover border-2 border-[#E6B950] shrink-0">
                    <div class="min-w-0 flex-1">
                        <p class="font-black text-white uppercase text-sm truncate">${escapeHtml(s.name)}</p>
                        <p class="text-[10px] font-mono text-gray-500">${escapeHtml(s.username)} &middot; ${escapeHtml((s.role || "").toUpperCase())}</p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button type="button" onclick="openStaffAttendanceCurrent('${safeUsername}')" class="px-3 py-2 rounded-lg bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-[10px] font-black uppercase tracking-wide transition-all">Attendance</button>
                        <button type="button" onclick="openSetCycleModal('${safeUsername}', '${escapeHtml(s.name).replace(/'/g, "\\'")}')" class="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-wide transition-all">Set Time</button>
                        <button type="button" onclick="openStaffEditModal('${safeUsername}')" class="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wide transition-all">Edit</button>
                        ${canDeleteStaff ? `<button type="button" onclick="hideStaffFromAttendance('${safeUsername}', '${escapeHtml(s.name).replace(/'/g, "\\'")}')" class="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wide transition-all">Delete</button>` : ""}
                    </div>
                </div>`;
        }).join("")}</div>`;
    } catch (err) {
        console.error("renderStaffAdminList error:", err);
        body.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Could not load staff list.</p>`;
    }
}

function backToStaffAdminList() {
    staffAdminView = "list";
    staffAdminActiveUsername = null;
    renderStaffAdminList();
}

// ── "Attendance" fast path: jumps straight to today's real week for one staff ──
async function openStaffAttendanceCurrent(username) {
    staffAdminActiveUsername = username;
    staffAdminView = "current";

    const body = document.getElementById("staffAdminBody");
    if (body) body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;

    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1, day = now.getDate();

    try {
        const data = await fetchMonthDetail(year, month);
        const staff = data.staff.find(s => s.username === username);
        const daysInMonth = new Date(year, month, 0).getDate();
        const week = staff ? customWeekOfMonth(day, daysInMonth, staff.cycle_start_day, staff.cycle_length) : 1;
        staffAdminCurrentPointer = { year, month, week };
        renderStaffAdminDetail();
    } catch (err) {
        console.error("openStaffAttendanceCurrent error:", err);
        if (body) body.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Could not load attendance data.</p>`;
    }
}

function findStaffInMonthDetail(username) {
    if (!staffAdminMonthDetailCache) return null;
    return staffAdminMonthDetailCache.data.staff.find(s => s.username === username) || null;
}

function renderStaffAdminDetail() {
    const body = document.getElementById("staffAdminBody");
    if (!body) return;

    const staff = findStaffInMonthDetail(staffAdminActiveUsername);
    if (!staff) { body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Staff not found.</p>`; return; }

    const pointer = staffAdminCurrentPointer;
    const weekData = staff.weeks[String(pointer.week)] || { present_days: 0, records: [], salary_paid: false, label: "" };
    const yearLabel = pointer.year;

    const headerHtml = `
        <div class="flex items-center justify-between gap-3 mb-4 print:hidden">
            <button type="button" onclick="backToStaffAdminList()" class="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-[#E6B950]">← Back to Staff List</button>
            <button type="button" onclick="openStaffAttendanceHistory()" class="text-xs font-black uppercase tracking-widest text-white hover:text-[#E6B950]">History ↑</button>
        </div>
        <div class="flex items-center gap-3 mb-4">
            <img src="${staff.face_photo || 'amFace.png'}" class="w-14 h-14 rounded-full object-cover border-2 border-[#E6B950]">
            <div class="min-w-0">
                <p class="font-black text-white uppercase text-base truncate">${escapeHtml(staff.name)}</p>
                <p class="text-[10px] font-mono text-gray-500">${escapeHtml(staff.username)}</p>
            </div>
            <div class="ml-auto text-center px-3 py-1.5 rounded-lg bg-[#E6B950]/10 border border-[#E6B950]/40">
                <p class="text-lg font-black text-white leading-none">${staff.month_present_days}</p>
                <p class="text-[9px] font-black uppercase text-gray-400">This Month</p>
            </div>
        </div>`;

    body.innerHTML = `
        <div id="staffAdminCurrentPrintArea">
            ${headerHtml}
            <div class="flex items-center justify-between gap-3 mb-3 print:hidden">
                <h4 class="text-base font-black uppercase text-white">${escapeHtml(weekData.label)}, ${yearLabel}</h4>
                <button type="button" onclick="printElementOnly(document.getElementById('staffAdminCurrentPrintArea'))" class="bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-95">🖨 Print</button>
            </div>
            ${renderStaffWeekCard(weekData, "markStaffSalaryPaidCurrent()")}
        </div>`;
}

async function markStaffSalaryPaidCurrent() {
    const pointer = staffAdminCurrentPointer;
    const ok = await submitSalaryMarkPaid(staffAdminActiveUsername, pointer.year, pointer.month, pointer.week);
    if (!ok) return;

    // Advance to the next week, rolling into next month/year if this was the last cycle
    const monthDetail = await fetchMonthDetail(pointer.year, pointer.month);
    const staff = monthDetail.staff.find(s => s.username === staffAdminActiveUsername);
    const weekCount = staff ? Object.keys(staff.weeks).length : 1;

    let { year, month, week } = pointer;
    week += 1;
    if (week > weekCount) {
        week = 1;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    staffAdminCurrentPointer = { year, month, week };

    await fetchMonthDetail(year, month);
    renderStaffAdminDetail();
}

// ── History: Year -> Month -> Week drill-down for one staff ──
async function openStaffAttendanceHistory() {
    staffAdminView = "history-months";
    const body = document.getElementById("staffAdminBody");
    if (body) body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;

    try {
        const response = await fetch(`${apiUrl}/api/attendance/years`);
        const data = await response.json();
        staffAdminAvailableYears = data.years || [new Date().getFullYear()];
        staffAdminHistoryPointer = { year: staffAdminAvailableYears[0], month: null, week: null };
        renderStaffAdminHistory();
    } catch (err) {
        console.error("openStaffAttendanceHistory error:", err);
        if (body) body.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Could not load history.</p>`;
    }
}

function selectStaffHistoryYear(year) {
    staffAdminHistoryPointer = { year, month: null, week: null };
    renderStaffAdminHistory();
}

function backStaffHistoryToMonths() {
    staffAdminHistoryPointer.month = null;
    staffAdminHistoryPointer.week = null;
    renderStaffAdminHistory();
}

function backStaffHistoryToWeeks() {
    staffAdminHistoryPointer.week = null;
    renderStaffAdminHistory();
}

async function selectStaffHistoryMonth(month) {
    staffAdminHistoryPointer.month = month;
    staffAdminHistoryPointer.week = null;

    const body = document.getElementById("staffAdminBody");
    if (body) body.innerHTML = `<p class="text-center text-zinc-400 font-bold uppercase text-sm py-10">Loading...</p>`;

    try {
        await fetchMonthDetail(staffAdminHistoryPointer.year, month);
        renderStaffAdminHistory();
    } catch (err) {
        console.error("selectStaffHistoryMonth error:", err);
        if (body) body.innerHTML = `<p class="text-center text-red-500 font-bold uppercase text-sm py-10">Could not load month data.</p>`;
    }
}

function selectStaffHistoryWeek(week) {
    staffAdminHistoryPointer.week = week;
    renderStaffAdminHistory();
}

function renderStaffWeekCard(weekData, salaryOnclickExpr) {
    const recordsHtml = weekData.records.length ? weekData.records.map(r => `
        <div class="flex items-center justify-between gap-3 py-2 px-3 border-b border-white/5 last:border-0 text-xs">
            <span class="font-bold text-gray-300">${escapeHtml(formatAttendanceTimestamp(r.clock_in))}</span>
            <span class="text-gray-500">→</span>
            <span class="font-bold ${r.clock_out ? 'text-gray-300' : 'text-emerald-400'}">${r.clock_out ? escapeHtml(formatAttendanceTimestamp(r.clock_out)) : 'Still clocked in'}</span>
        </div>`).join("") : `<p class="text-center text-gray-500 font-bold uppercase text-[10px] py-4">No attendance records this week.</p>`;

    return `
        <div class="bg-black/30 border border-[#E6B950]/15 rounded-xl overflow-hidden">
            <div class="flex flex-wrap items-center gap-3 p-4 bg-black/40 border-b border-[#E6B950]/15">
                <div class="text-center px-3 py-1.5 rounded-lg bg-[#E6B950]/10 border border-[#E6B950]/40">
                    <p class="text-lg font-black text-white leading-none">${weekData.present_days}</p>
                    <p class="text-[9px] font-black uppercase text-gray-400">This Week</p>
                </div>
                <button type="button" ${weekData.salary_paid ? "disabled" : ""} onclick="${weekData.salary_paid ? "" : salaryOnclickExpr}" class="ml-auto px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all disabled:cursor-not-allowed ${weekData.salary_paid ? 'bg-emerald-950/40 text-emerald-400' : 'bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950'}">${weekData.salary_paid ? '✓ Salary Paid' : 'Salary Done'}</button>
            </div>
            <div class="max-h-56 overflow-y-auto px-3">${recordsHtml}</div>
        </div>`;
}

function renderStaffAdminHistory() {
    const body = document.getElementById("staffAdminBody");
    if (!body) return;

    const staff = staffAdminCachedStaffList.find(s => s.username === staffAdminActiveUsername);
    const staffName = staff ? staff.name : staffAdminActiveUsername;

    const headerHtml = `
        <div class="flex items-center justify-between gap-3 mb-4 print:hidden">
            <button type="button" onclick="openStaffAttendanceCurrent('${escapeHtml(staffAdminActiveUsername).replace(/'/g, "\\'")}')" class="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-[#E6B950]">← Back to Current Week</button>
            <h4 class="text-sm font-black uppercase text-white">${escapeHtml(staffName)} — History</h4>
        </div>
        <div class="flex flex-wrap gap-2 mb-5 print:hidden">
            ${staffAdminAvailableYears.map(y => `
                <button type="button" onclick="selectStaffHistoryYear(${y})" class="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${y === staffAdminHistoryPointer.year ? 'bg-[#E6B950] text-black' : 'bg-black/30 border border-[#E6B950]/20 text-gray-400 hover:border-[#E6B950]/50'}">${y}</button>
            `).join("")}
        </div>`;

    if (staffAdminHistoryPointer.month === null) {
        body.innerHTML = `
            ${headerHtml}
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                ${MONTH_NAMES.map((name, idx) => `
                    <button type="button" onclick="selectStaffHistoryMonth(${idx + 1})" class="p-4 rounded-xl border-2 border-[#E6B950]/20 bg-black/30 hover:border-[#E6B950] text-center transition-all">
                        <div class="text-sm font-black uppercase tracking-wide text-white">${name}</div>
                        <div class="text-[10px] font-bold uppercase mt-1 text-gray-500">${staffAdminHistoryPointer.year}</div>
                    </button>
                `).join("")}
            </div>`;
        return;
    }

    const monthDetail = staffAdminMonthDetailCache?.data;
    if (!monthDetail) return;
    const historyStaff = monthDetail.staff.find(s => s.username === staffAdminActiveUsername);
    const monthLabel = `${MONTH_NAMES[staffAdminHistoryPointer.month - 1]} ${staffAdminHistoryPointer.year}`;

    if (staffAdminHistoryPointer.week === null) {
        const weekNumbers = historyStaff ? Object.keys(historyStaff.weeks).map(Number).sort((a, b) => a - b) : [];
        const weekCardsHtml = weekNumbers.map(w => {
            const wd = historyStaff.weeks[String(w)];
            return `
                <button type="button" onclick="selectStaffHistoryWeek(${w})" class="p-4 rounded-xl border-2 border-[#E6B950]/20 bg-black/30 hover:border-[#E6B950] text-center transition-all">
                    <div class="text-sm font-black uppercase tracking-wide text-white">${escapeHtml(wd.label)}</div>
                    <div class="text-[10px] font-bold uppercase mt-1 text-gray-500">${wd.present_days} present-days</div>
                </button>`;
        }).join("");

        body.innerHTML = `
            <div id="staffAdminHistoryMonthPrintArea">
                ${headerHtml}
                <div class="flex items-center justify-between gap-3 mb-4 print:hidden">
                    <button type="button" onclick="backStaffHistoryToMonths()" class="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-[#E6B950]">← Back to Months</button>
                    <button type="button" onclick="printElementOnly(document.getElementById('staffAdminHistoryMonthPrintArea'))" class="bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-95">🖨 Print Month</button>
                </div>
                <h4 class="text-lg font-black uppercase text-white mb-4">${escapeHtml(monthLabel)}</h4>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">${weekCardsHtml}</div>
            </div>`;
        return;
    }

    const week = staffAdminHistoryPointer.week;
    const weekData = historyStaff ? (historyStaff.weeks[String(week)] || { present_days: 0, records: [], salary_paid: false, label: "" }) : { present_days: 0, records: [], salary_paid: false, label: "" };

    body.innerHTML = `
        <div id="staffAdminHistoryWeekPrintArea">
            ${headerHtml}
            <div class="flex items-center justify-between gap-3 mb-4 print:hidden">
                <button type="button" onclick="backStaffHistoryToWeeks()" class="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-[#E6B950]">← Back to Weeks</button>
                <button type="button" onclick="printElementOnly(document.getElementById('staffAdminHistoryWeekPrintArea'))" class="bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-95">🖨 Print Week</button>
            </div>
            <h4 class="text-lg font-black uppercase text-white mb-4">${escapeHtml(weekData.label)}, ${staffAdminHistoryPointer.year}</h4>
            ${renderStaffWeekCard(weekData, "markStaffSalaryPaidHistory()")}
        </div>`;
}

async function markStaffSalaryPaidHistory() {
    const pointer = staffAdminHistoryPointer;
    const ok = await submitSalaryMarkPaid(staffAdminActiveUsername, pointer.year, pointer.month, pointer.week);
    if (!ok) return;
    await fetchMonthDetail(pointer.year, pointer.month);
    renderStaffAdminHistory();
}

async function submitSalaryMarkPaid(username, year, month, week) {
    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("year", year);
        payload.append("month", month);
        payload.append("week", week);

        const response = await fetch(`${apiUrl}/api/salary/mark-paid`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: payload
        });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            displayNotification("Salary marked as paid for this week.", true);
            staffAdminMonthDetailCache = null; // the just-paid month is now stale
            return true;
        }
        displayNotification(data.detail || "Could not update salary status.", false);
        return false;
    } catch (err) {
        console.error("submitSalaryMarkPaid error:", err);
        displayNotification("Could not update salary status.", false);
        return false;
    }
}

// ── Edit / Delete (from the Staff List) ──
function openStaffEditModal(username) {
    const staff = staffAdminCachedStaffList.find(s => s.username === username);
    if (!staff) return;

    document.getElementById("staffEditUsername").value = staff.username;
    document.getElementById("staffEditName").value = staff.name || "";
    document.getElementById("staffEditEmail").value = staff.email || "";
    document.getElementById("staffEditRole").value = staff.role || "staff";

    openRightSlidePanel("staffEditModal");
}

function closeStaffEditModal() {
    closeRightSlidePanel("staffEditModal");
}

async function saveStaffEdit() {
    const username = document.getElementById("staffEditUsername").value;
    const name = document.getElementById("staffEditName").value.trim();
    const email = document.getElementById("staffEditEmail").value.trim();
    const role = document.getElementById("staffEditRole").value;

    if (!name || !email) {
        displayNotification("Name and email are required.", false);
        return;
    }

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("name", name);
        payload.append("email", email);
        payload.append("role", role);

        const response = await fetch(`${apiUrl}/api/admin/update-staff`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: payload
        });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            displayNotification("Staff details updated.", true);
            closeStaffEditModal();
            renderStaffAdminList();
        } else {
            displayNotification(data.detail || "Could not update staff.", false);
        }
    } catch (err) {
        console.error("saveStaffEdit error:", err);
        displayNotification("Could not update staff.", false);
    }
}

// Uses local date fields instead of toISOString(), which shifts the date in timezones ahead of UTC
function toLocalIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ── "Set Time": custom per-staff attendance cycle (replaces the plain 1st-7th default) ──
async function openSetCycleModal(username, name) {
    document.getElementById("staffCycleUsername").value = username;
    document.getElementById("staffCycleStaffName").innerText = name;

    try {
        const response = await fetch(`${apiUrl}/api/attendance/cycle-config?username=${encodeURIComponent(username)}`);
        const cfg = await response.json();

        // Pre-fill with an example week from the saved start day/length, anchored to this month
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), cfg.start_day);
        const end = new Date(start);
        end.setDate(start.getDate() + cfg.cycle_length - 1);

        document.getElementById("staffCycleStartDate").value = toLocalIsoDate(start);
        document.getElementById("staffCycleEndDate").value = toLocalIsoDate(end);
    } catch (err) {
        console.error("openSetCycleModal error:", err);
    }

    openRightSlidePanel("staffCycleModal");
}

function closeSetCycleModal() {
    closeRightSlidePanel("staffCycleModal");
}

async function saveCycleConfig() {
    const username = document.getElementById("staffCycleUsername").value;
    const startDate = document.getElementById("staffCycleStartDate").value;
    const endDate = document.getElementById("staffCycleEndDate").value;

    if (!startDate || !endDate) {
        displayNotification("Pick both a start and end date.", false);
        return;
    }

    try {
        const payload = new FormData();
        payload.append("username", username);
        payload.append("start_date", startDate);
        payload.append("end_date", endDate);

        const response = await fetch(`${apiUrl}/api/attendance/set-cycle`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: payload
        });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            displayNotification("Attendance cycle updated - it'll repeat every month and year.", true);
            staffAdminMonthDetailCache = null; // week boundaries just changed
            closeSetCycleModal();
        } else {
            displayNotification(data.detail || "Could not update the attendance cycle.", false);
        }
    } catch (err) {
        console.error("saveCycleConfig error:", err);
        displayNotification("Could not update the attendance cycle.", false);
    }
}

async function hideStaffFromAttendance(username, name) {
    if (!confirm(`Remove ${name} (${username}) from the attendance list? Their account stays active - they'll reappear here the next time they clock in/out.`)) return;

    try {
        const payload = new FormData();
        payload.append("username", username);

        const response = await fetch(`${apiUrl}/api/attendance/hide-staff`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: payload
        });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            displayNotification("Staff removed from the attendance list.", true);
            renderStaffAdminList();
        } else {
            displayNotification(data.detail || "Could not remove staff.", false);
        }
    } catch (err) {
        console.error("hideStaffFromAttendance error:", err);
        displayNotification("Could not remove staff.", false);
    }
}

// Till Management: opens the Till app in its own browser tab, sharing this app's account
// database. Passes a one-time handoff token via localStorage so the manager skips login there.
const TILL_HANDOFF_PREFIX = "amsonsTillHandoff:";
const TILL_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000; // stale/unused handoffs older than this are swept up

function openTillManagementHub() {
    // Sweep up old unused handoff entries so they don't pile up
    try {
        const now = Date.now();
        Object.keys(localStorage)
            .filter(key => key.startsWith(TILL_HANDOFF_PREFIX))
            .forEach(key => {
                try {
                    const entry = JSON.parse(localStorage.getItem(key));
                    if (!entry || !entry.createdAt || (now - entry.createdAt) > TILL_HANDOFF_MAX_AGE_MS) {
                        localStorage.removeItem(key);
                    }
                } catch (err) {
                    localStorage.removeItem(key);
                }
            });
    } catch (err) {
        console.error("Could not sweep stale till handoffs:", err);
    }

    const username = (window.currentUserProfile?.user_id || localStorage.getItem("username") || "").toUpperCase();
    const handoff = {
        username,
        name: window.currentUserProfile?.name || localStorage.getItem("user_name") || username,
        email: window.currentUserProfile?.email || "",
        role: window.currentUserProfile?.role || localStorage.getItem("user_role") || "staff",
        token: localStorage.getItem("access_token") || "",
        createdAt: Date.now()
    };
    const handoffId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
        localStorage.setItem(`${TILL_HANDOFF_PREFIX}${handoffId}`, JSON.stringify(handoff));
    } catch (err) {
        console.error("Could not stage till handoff:", err);
    }
    // Uses apiUrl so this still works when index.html is viewed via something other than the real backend
    window.open(`${apiUrl}/till/till_amsons.html?handoff=${encodeURIComponent(handoffId)}`, "_blank");
}

// Set Price modal (kept for future reuse, the Settings tab's barcode lookup is the primary path)
let setPriceTargetProductId = null;
function openSetProductPriceModal(productId, productName, currentPrice) {
    setPriceTargetProductId = productId;
    document.getElementById("setPriceProductName").innerText = productName || "";
    document.getElementById("setPriceInput").value = currentPrice != null ? currentPrice : "";
    openRightSlidePanel("setProductPriceModal");
}

function closeSetProductPriceModal() {
    closeRightSlidePanel("setProductPriceModal");
    setPriceTargetProductId = null;
}

async function submitSetProductPrice() {
    if (!setPriceTargetProductId) return;
    const priceVal = parseFloat(document.getElementById("setPriceInput").value);
    if (isNaN(priceVal) || priceVal < 0) {
        if (typeof displayNotification === "function") displayNotification("Enter a valid price.", false);
        return;
    }
    try {
        const response = await fetch(`${apiUrl}/api/products/${setPriceTargetProductId}/price`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ price: priceVal })
        });
        if (!response.ok) throw new Error("Request failed");
        closeSetProductPriceModal();
        if (typeof displayNotification === "function") displayNotification("Price updated.", true);
        if (typeof fetchInventoryData === "function") fetchInventoryData();
    } catch (err) {
        console.error("submitSetProductPrice error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to set price.", false);
    }
}

// Click-outside handler for the Till product search dropdown
document.addEventListener("click", (e) => {
    if (e.target.closest("#tillProductSearchInput, #tillProductSearchDropdown")) return;
    document.getElementById("tillProductSearchDropdown")?.classList.add("hidden");
});

async function renderStoreroomCards() {
    const grid = document.getElementById("storeroomCardsGrid");
    if (!grid) return;
    currentStoreroomsList = await fetchStoreroomsForBranch(getCurrentBranch());

    const isManager = isCurrentUserManager();

    let html = currentStoreroomsList.map(sr => `
        <div class="storeroom-card">
            ${isManager ? `
            <div class="storeroom-card-actions">
                <button type="button" onclick="event.stopPropagation(); openEditStoreroomModal(${sr.id})" class="storeroom-icon-btn" title="Edit Stockroom">✎</button>
                <button type="button" onclick="event.stopPropagation(); confirmDeleteStoreroom(${sr.id})" class="storeroom-icon-btn" title="Delete Stockroom">🗑</button>
            </div>` : ""}
            <button type="button" onclick="openStoreroomMap(${sr.id})" class="storeroom-card-body">
                <div class="storeroom-icon">▤</div>
                <h3>${escapeHtml(sr.name)}</h3>
                <p class="text-xs text-zinc-700 font-extrabold uppercase mb-3">${sr.shelf_count} Shelves &middot; ${sr.row_count} Rows &middot; ${sr.column_count} Columns</p>
                <span class="block w-10 h-[2px] bg-[#D49A00] mx-auto mb-5"></span>
                <span class="arrow-btn">›</span>
            </button>
        </div>
    `).join("");

    if (isManager) {
        html += `
            <button type="button" onclick="openCreateStoreroomModal()" class="storeroom-create-card">
                <div class="storeroom-icon">+</div>
                <h3 class="font-black text-lg mt-2">New Stockroom</h3>
            </button>
        `;
    }

    grid.innerHTML = html || `<div class="col-span-full text-center text-gray-400 font-bold uppercase text-sm py-6">No stockrooms yet. Ask a manager to create one.</div>`;
}

let editingStoreroomId = null;

function openCreateStoreroomModal() {
    editingStoreroomId = null;
    document.getElementById("createStoreroomModalTitle").innerText = "New Stockroom";
    document.getElementById("createStoreroomSubmitBtn").innerText = "Create";
    document.getElementById("createStoreroomNameInput").value = "";
    document.getElementById("createStoreroomModal")?.classList.remove("hidden");
}

function openEditStoreroomModal(storeroomId) {
    const storeroom = currentStoreroomsList.find(sr => sr.id === storeroomId);
    if (!storeroom) return;
    editingStoreroomId = storeroomId;
    document.getElementById("createStoreroomModalTitle").innerText = "Edit Stockroom";
    document.getElementById("createStoreroomSubmitBtn").innerText = "Save";
    document.getElementById("createStoreroomNameInput").value = storeroom.name;
    document.getElementById("createStoreroomModal")?.classList.remove("hidden");
}

function closeCreateStoreroomModal() {
    closeRightSlidePanel("createStoreroomModal");
    editingStoreroomId = null;
}

async function submitCreateStoreroom() {
    const name = document.getElementById("createStoreroomNameInput").value.trim();
    if (!name) {
        if (typeof displayNotification === "function") displayNotification("Please enter a stockroom name.", false);
        return;
    }
    const isEdit = editingStoreroomId !== null;
    try {
        const response = await fetch(
            isEdit ? `${apiUrl}/api/storerooms/${editingStoreroomId}` : `${apiUrl}/api/storerooms`,
            {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
                body: JSON.stringify(isEdit ? { name } : { name, branch: getCurrentBranch() })
            }
        );
        if (!response.ok) throw new Error("Request failed");
        closeCreateStoreroomModal();
        await renderStoreroomCards();
        if (typeof displayNotification === "function") displayNotification(isEdit ? "Stockroom updated." : "Stockroom created.", true);
        pushLocalActivityNotification(isEdit ? `Stockroom "${escapeHtml(name)}" updated.` : `Stockroom "${escapeHtml(name)}" created.`);
    } catch (err) {
        console.error("submitCreateStoreroom error:", err);
        if (typeof displayNotification === "function") displayNotification(isEdit ? "Failed to update stockroom." : "Failed to create stockroom.", false);
    }
}

async function confirmDeleteStoreroom(storeroomId) {
    const storeroom = currentStoreroomsList.find(sr => sr.id === storeroomId);
    const label = storeroom ? storeroom.name : "this stockroom";
    if (!confirm(`Delete "${label}"? This also removes all its shelves, rows, columns and walkways.`)) return;

    try {
        const response = await fetch(`${apiUrl}/api/storerooms/${storeroomId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Request failed");
        await renderStoreroomCards();
        if (typeof displayNotification === "function") displayNotification("Stockroom deleted.", true);
        pushLocalActivityNotification(`Stockroom "${escapeHtml(label)}" deleted.`);
    } catch (err) {
        console.error("confirmDeleteStoreroom error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to delete stockroom.", false);
    }
}

// Sorts rows/columns by label numerically ("2" < "10"), regardless of creation order
function sortByLabelSerial(items) {
    return (items || []).sort((a, b) => (a.label || "").localeCompare(b.label || "", undefined, { numeric: true, sensitivity: "base" }));
}
function sortShelfRowsAndColumns(detail) {
    (detail?.shelves || []).forEach(shelf => {
        sortByLabelSerial(shelf.rows);
        sortByLabelSerial(shelf.columns);
    });
    return detail;
}

async function openStoreroomMap(storeroomId) {
    const storeroomsSection = document.getElementById("storeroomsSection");
    const storeroomMapSection = document.getElementById("storeroomMapSection");
    if (!storeroomsSection || !storeroomMapSection) return;

    const isFreshOpen = activeStoreroomId !== storeroomId;

    try {
        const response = await fetch(`${apiUrl}/api/storerooms/${storeroomId}/detail`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Storeroom not found");
        activeStoreroomDetail = sortShelfRowsAndColumns(await response.json());
        activeStoreroomId = storeroomId;
    } catch (err) {
        console.error("openStoreroomMap error:", err);
        if (typeof displayNotification === "function") displayNotification("Could not load stockroom.", false);
        return;
    }

    storeroomsSection.classList.add("hidden");
    storeroomMapSection.classList.remove("hidden");
    document.getElementById("storeroomStructureActionsRow")?.classList.toggle("hidden", !isCurrentUserManager());
    renderActiveStoreroomHeader();

    // Toggle visibility before building map rows, or the hidden wrapper measures a false 0 width
    if (isFreshOpen) storeroomActiveView = "map";
    if (storeroomActiveView === "list") {
        showStoreroomListView();
    } else {
        showStoreroomMapView();
    }
    buildStoreroomMapRows();

    localStorage.setItem("active_storeroom_id", String(storeroomId));
}

function renderActiveStoreroomHeader() {
    if (!activeStoreroomDetail) return;
    const title = document.getElementById("storeroomMapTitle");
    if (title) title.innerText = `${activeStoreroomDetail.name.toUpperCase()} MAP`;

    const shelves = activeStoreroomDetail.shelves || [];
    const rowCount = shelves.reduce((sum, s) => sum + s.rows.length, 0);
    const columnCount = shelves.reduce((sum, s) => sum + s.columns.length, 0);

    const shelvesEl = document.getElementById("storeroomStatShelves");
    const rowsEl = document.getElementById("storeroomStatRows");
    const columnsEl = document.getElementById("storeroomStatColumns");
    if (shelvesEl) shelvesEl.innerText = shelves.length;
    if (rowsEl) rowsEl.innerText = rowCount;
    if (columnsEl) columnsEl.innerText = columnCount;
}

async function refreshActiveStoreroomDetail() {
    if (!activeStoreroomId) return;
    await openStoreroomMap(activeStoreroomId);
}

function showStoreroomMapView() {
    storeroomActiveView = "map";
    document.getElementById("storeroomMapGridWrapper")?.classList.remove("hidden");
    document.getElementById("storeroomListViewWrapper")?.classList.add("hidden");
    updateStoreroomViewToggleButtons();
    // Re-measure now the wrapper is visible, it may have been sized wrong while still hidden
    resizeMapBoxToContent(document.getElementById("storeroomMapBox"));
}

function showStoreroomListView() {
    storeroomActiveView = "list";
    document.getElementById("storeroomMapGridWrapper")?.classList.add("hidden");
    document.getElementById("storeroomListViewWrapper")?.classList.remove("hidden");
    renderStoreroomListView();
    updateStoreroomViewToggleButtons();
}

function updateStoreroomViewToggleButtons() {
    const mapBtn = document.getElementById("storeroomMapViewToggleBtn");
    const listBtn = document.getElementById("storeroomListViewToggleBtn");
    if (!mapBtn || !listBtn) return;
    const setActive = (btn) => {
        btn.classList.remove("text-black");
        btn.classList.add("bg-black", "text-white");
    };
    const setInactive = (btn) => {
        btn.classList.remove("bg-black", "text-white");
        btn.classList.add("text-black");
    };
    if (storeroomActiveView === "map") {
        setActive(mapBtn);
        setInactive(listBtn);
    } else {
        setActive(listBtn);
        setInactive(mapBtn);
    }
}

function renderStoreroomListView() {
    const wrapper = document.getElementById("storeroomListViewWrapper");
    if (!wrapper || !activeStoreroomDetail) return;

    const isManager = isCurrentUserManager();
    const shelves = activeStoreroomDetail.shelves || [];
    const walkways = activeStoreroomDetail.walkways || [];

    const shelvesHtml = shelves.length ? shelves.map(shelf => {
        const shelfNameSafe = escapeHtml(shelf.name).replace(/'/g, "\\'");

        // Clicking a row/column entry opens the same live-stock popup as Map View's grid cells
        const rowsHtml = (shelf.rows || []).length ? shelf.rows.map(row => {
            const rowLabelSafe = escapeHtml(row.label).replace(/'/g, "\\'");
            return `
            <div onclick="selectLocation('${shelfNameSafe}', '${rowLabelSafe}', null)" class="flex items-center justify-between gap-2 py-1.5 px-3 border-b border-zinc-100 last:border-0 cursor-pointer hover:bg-zinc-50 transition-colors">
                <span class="text-xs font-bold text-zinc-700">Row: ${escapeHtml(row.label)}</span>
                ${isManager ? `
                <div class="flex gap-1.5 shrink-0 print:hidden">
                    <button type="button" onclick="event.stopPropagation(); openEditRowModal(${row.id})" class="storeroom-list-icon-btn" title="Edit Row">✎</button>
                    <button type="button" onclick="event.stopPropagation(); confirmDeleteShelfRow(${row.id})" class="storeroom-list-icon-btn" title="Delete Row">🗑</button>
                </div>` : ""}
            </div>`;
        }).join("") : `<p class="text-xs text-zinc-400 uppercase font-bold px-3 py-2">No rows yet.</p>`;

        const columnsHtml = (shelf.columns || []).length ? shelf.columns.map(col => {
            const colLabelSafe = escapeHtml(col.label).replace(/'/g, "\\'");
            return `
            <div onclick="selectLocation('${shelfNameSafe}', null, '${colLabelSafe}')" class="flex items-center justify-between gap-2 py-1.5 px-3 border-b border-zinc-100 last:border-0 cursor-pointer hover:bg-zinc-50 transition-colors">
                <span class="text-xs font-bold text-zinc-700">Column: ${escapeHtml(col.label)}</span>
                ${isManager ? `
                <div class="flex gap-1.5 shrink-0 print:hidden">
                    <button type="button" onclick="event.stopPropagation(); openEditColumnModal(${col.id})" class="storeroom-list-icon-btn" title="Edit Column">✎</button>
                    <button type="button" onclick="event.stopPropagation(); confirmDeleteShelfColumn(${col.id})" class="storeroom-list-icon-btn" title="Delete Column">🗑</button>
                </div>` : ""}
            </div>`;
        }).join("") : `<p class="text-xs text-zinc-400 uppercase font-bold px-3 py-2">No columns yet.</p>`;

        return `
            <div class="border border-zinc-200 rounded-xl overflow-hidden mb-4">
                <div class="flex items-center justify-between gap-3 px-4 py-3" style="background:${SHELF_FIXED_COLOR};">
                    <span class="font-black text-white uppercase tracking-wide">${escapeHtml(shelf.name)}</span>
                    ${isManager ? `
                    <div class="flex gap-1.5 shrink-0 print:hidden">
                        <button type="button" onclick="openEditShelfModal(${shelf.id})" class="storeroom-list-icon-btn storeroom-list-icon-btn-light" title="Edit Shelf">✎</button>
                        <button type="button" onclick="confirmDeleteShelf(${shelf.id})" class="storeroom-list-icon-btn storeroom-list-icon-btn-light" title="Delete Shelf">🗑</button>
                    </div>` : ""}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-100">
                    <div>${rowsHtml}</div>
                    <div>${columnsHtml}</div>
                </div>
            </div>`;
    }).join("") : `<p class="text-sm text-gray-400 uppercase font-bold mb-4">No shelves yet — use "+ Add Shelf" below.</p>`;

    const walkwaysHtml = walkways.length ? walkways.map(w => `
        <div class="flex items-center justify-between gap-2 py-2.5 px-4 border border-zinc-200 rounded-xl mb-2">
            <span class="text-xs font-black uppercase text-zinc-700">Walkway: ${escapeHtml(w.label || "WALKWAY")}</span>
            ${isManager ? `
            <div class="flex gap-1.5 shrink-0">
                <button type="button" onclick="openEditWalkwayModal(${w.id})" class="storeroom-list-icon-btn" title="Edit Walkway">✎</button>
                <button type="button" onclick="confirmDeleteWalkway(${w.id})" class="storeroom-list-icon-btn" title="Delete Walkway">🗑</button>
            </div>` : ""}
        </div>`).join("") : "";

    wrapper.innerHTML = `
        <div>${shelvesHtml}</div>
        ${walkwaysHtml ? `<div class="mt-4"><h4 class="text-xs font-black uppercase text-zinc-500 mb-2">Walkways</h4>${walkwaysHtml}</div>` : ""}
    `;
}

function backToStorerooms() {
    document.getElementById("storeroomMapSection")?.classList.add("hidden");
    document.getElementById("storeroomsSection")?.classList.toggle("hidden", hasNoStockroomSection());
    const overlay = document.getElementById("liveScannedProductOverlayStrip");
    if (overlay) overlay.remove();
    const banner = document.getElementById("storeroomBranchMismatchBanner");
    if (banner) { banner.classList.add("hidden"); banner.innerText = ""; }
    clearShelfSlotAlert();
    activeStoreroomId = null;
    activeStoreroomDetail = null;
    storeroomActiveView = "map";
    localStorage.removeItem("active_storeroom_id");
    renderStoreroomCards();
}

// Freeform canvas: each shelf is draggable by its label, with a rotate button for
// horizontal/vertical. A shelf with no rows/columns shows a placeholder slot, never persisted.
const SHELF_EMPTY_PLACEHOLDER_LABEL = "0";

// Keeps every shelf/walkway a real distance from the canvas border. Added at render time,
// subtracted back out before saving, so the saved position stays "logical" and doesn't creep
const MAP_CANVAS_INSET = 24;

function renderShelfHTML(shelf) {
    const rows = shelf.rows.length ? shelf.rows : [{ label: SHELF_EMPTY_PLACEHOLDER_LABEL }];
    const columns = shelf.columns.length ? shelf.columns : [{ label: SHELF_EMPTY_PLACEHOLDER_LABEL }];
    const shelfAttr = escapeHtml(shelf.name);
    const isVertical = shelf.orientation === "vertical";

    // One flat grid for label + every cell, label placed once as a single grid item
    const cellsHtml = rows.map((row, rowIdx) => {
        const rowAttr = escapeHtml(row.label);
        return columns.map((col, colIdx) => {
            const colAttr = escapeHtml(col.label);
            const code = buildLocationCode(shelfAttr, rowAttr, colAttr);
            const pos = isVertical
                ? `grid-column:${rowIdx + 1}; grid-row:${colIdx + 2};`
                : `grid-column:${colIdx + 2}; grid-row:${rowIdx + 1};`;
            return `<button type="button" class="location-cell" style="${pos}" data-shelf-name="${shelfAttr}" data-row="${rowAttr}" data-column="${colAttr}"><span>${code}</span></button>`;
        }).join("");
    }).join("");

    // Label stays a fixed single-cell square, doesn't grow as more rows/columns are added
    const labelPos = `grid-column: 1; grid-row: 1;`;
    const gridTemplate = isVertical
        ? `grid-template-columns: repeat(${rows.length}, 68px); grid-template-rows: 68px repeat(${columns.length}, 68px);`
        : `grid-template-columns: 68px repeat(${columns.length}, 68px); grid-template-rows: repeat(${rows.length}, 68px);`;

    const x = (shelf.pos_x != null ? shelf.pos_x : 40) + MAP_CANVAS_INSET;
    const y = (shelf.pos_y != null ? shelf.pos_y : 40) + MAP_CANVAS_INSET;

    return `
        <div class="shelf-wrapper" data-shelf-id="${shelf.id}" data-orientation="${shelf.orientation || "horizontal"}" style="left:${x}px; top:${y}px;">
            <button type="button" class="shelf-rotate-btn" data-shelf-id="${shelf.id}" title="Rotate horizontal/vertical">⟳</button>
            <div class="shelf-plate" style="${gridTemplate}">
                <div class="shelf-label" style="${labelPos} background:${SHELF_FIXED_COLOR}; border-color:${SHELF_FIXED_COLOR}; color:#ffffff;">${shelfAttr}</div>
                ${cellsHtml}
            </div>
        </div>`;
}

function renderWalkwayHTML(walkway) {
    const x = (walkway.pos_x != null ? walkway.pos_x : 340) + MAP_CANVAS_INSET;
    const y = (walkway.pos_y != null ? walkway.pos_y : 40) + MAP_CANVAS_INSET;
    // NULL width/height (never resized) keeps the box auto-sized to its content
    const sizeStyle = (walkway.width != null && walkway.height != null)
        ? ` width:${walkway.width}px; height:${walkway.height}px;`
        : "";
    return `
        <div class="walkway-wrapper" data-walkway-id="${walkway.id}" style="left:${x}px; top:${y}px;">
            <div class="walkway" style="${sizeStyle}">${escapeHtml(walkway.label || "WALKWAY")}</div>
            <div class="walkway-resize-handle" data-walkway-id="${walkway.id}" title="Drag to resize"></div>
        </div>`;
}

// Sizes the box to fit its shelves/walkways on both axes, floored by the wrapper's own
// visible width. Called live during drag so it grows/shrinks as shelves move.
const MAP_BOX_MIN_HEIGHT = 220;
const MAP_BOX_BOTTOM_PADDING = 60;
const MAP_BOX_RIGHT_PADDING = 60;
function resizeMapBoxToContent(box) {
    if (!box) return;
    let maxBottom = 0;
    let maxRight = 0;
    box.querySelectorAll(".shelf-wrapper, .walkway-wrapper").forEach(el => {
        const bottom = el.offsetTop + el.offsetHeight;
        const right = el.offsetLeft + el.offsetWidth;
        if (bottom > maxBottom) maxBottom = bottom;
        if (right > maxRight) maxRight = right;
    });
    box.style.height = `${Math.max(MAP_BOX_MIN_HEIGHT, maxBottom + MAP_BOX_BOTTOM_PADDING)}px`;

    const containerWidth = box.parentElement ? box.parentElement.clientWidth : 0;
    box.style.width = `${Math.max(containerWidth, maxRight + MAP_BOX_RIGHT_PADDING)}px`;
}

// Re-measure on window resize too, only whichever map box is actually visible right now
let mapBoxResizeDebounceId = null;
window.addEventListener("resize", () => {
    clearTimeout(mapBoxResizeDebounceId);
    mapBoxResizeDebounceId = setTimeout(() => {
        [document.getElementById("storeroomMapBox"), document.getElementById("storeSectionMapBox")].forEach(box => {
            if (box && box.offsetParent !== null) resizeMapBoxToContent(box);
        });
    }, 150);
});

function buildStoreroomMapRows() {
    const box = document.getElementById("storeroomMapBox");
    if (!box || !activeStoreroomDetail) return;

    const shelves = activeStoreroomDetail.shelves || [];
    const walkways = activeStoreroomDetail.walkways || [];

    const shelvesHtml = shelves.map(renderShelfHTML).join("") ||
        `<p class="text-xs text-gray-400 uppercase font-bold p-4">No shelves yet — use "+ Add Shelf" below.</p>`;
    const walkwaysHtml = walkways.map(renderWalkwayHTML).join("");

    box.innerHTML = shelvesHtml + walkwaysHtml;
    resizeMapBoxToContent(box);
}

// Any .location-cell click opens its popup; disambiguate Stockroom vs Store by which map box it's in
document.addEventListener("click", (e) => {
    const cell = e.target.closest(".location-cell");
    if (cell && cell.dataset.shelfName !== undefined) {
        if (cell.closest("#storeSectionMapBox")) {
            selectStoreLocation(cell.dataset.shelfName, cell.dataset.row, cell.dataset.column);
        } else {
            selectLocation(cell.dataset.shelfName, cell.dataset.row, cell.dataset.column);
        }
    }
});

// Freeform map drag (shelves + walkways), shared for Stockroom and Store. Visual-only until
// pointerup, which fires one PUT to persist the final position.
let mapDragState = null; // { type: "shelf"|"walkway", id, el, startPointerX/Y, startLeft/Top, moved, isStore, overTrash }

function getMapDragContext(isStore) {
    return isStore
        ? {
            detail: activeStoreSectionDetail,
            shelfEndpoint: id => `${apiUrl}/api/store-shelves/${id}`,
            walkwayEndpoint: id => `${apiUrl}/api/store-walkways/${id}`,
            rebuild: () => { if (typeof buildStoreSectionMapRows === "function") buildStoreSectionMapRows(); },
            refresh: () => { if (typeof refreshActiveStoreSectionDetail === "function") refreshActiveStoreSectionDetail(); },
            deleteWalkway: (id, label) => deleteStoreStructureItem(`${apiUrl}/api/store-walkways/${id}`, label),
        }
        : {
            detail: activeStoreroomDetail,
            shelfEndpoint: id => `${apiUrl}/api/shelves/${id}`,
            walkwayEndpoint: id => `${apiUrl}/api/walkways/${id}`,
            rebuild: () => { if (typeof buildStoreroomMapRows === "function") buildStoreroomMapRows(); },
            refresh: () => { if (typeof refreshActiveStoreroomDetail === "function") refreshActiveStoreroomDetail(); },
            deleteWalkway: (id, label) => deleteStructureItem(`${apiUrl}/api/walkways/${id}`, label),
        };
}

// True while the pointer is over the trash zone, used for hover styling and delete-vs-move
function isPointOverTrashZone(clientX, clientY) {
    const zone = document.getElementById("walkwayTrashDropZone");
    if (!zone || zone.classList.contains("hidden")) return false;
    const rect = zone.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

// Shelves/walkways can't be dragged on top of each other, always keeps a clear buffer around each
const MAP_ITEM_BUFFER = 20;
function mapItemsCollide(draggedEl, candidateLeft, candidateTop, boxContainer) {
    const candRight = candidateLeft + draggedEl.offsetWidth;
    const candBottom = candidateTop + draggedEl.offsetHeight;

    const others = boxContainer.querySelectorAll(".shelf-wrapper, .walkway-wrapper");
    for (const other of others) {
        if (other === draggedEl) continue;
        const left = parseFloat(other.style.left) || 0;
        const top = parseFloat(other.style.top) || 0;
        const right = left + other.offsetWidth;
        const bottom = top + other.offsetHeight;
        // Expand the other item's box by the buffer so a real gap is required, not zero-gap touching
        if (candidateLeft < right + MAP_ITEM_BUFFER && candRight > left - MAP_ITEM_BUFFER &&
            candidateTop < bottom + MAP_ITEM_BUFFER && candBottom > top - MAP_ITEM_BUFFER) {
            return true;
        }
    }
    return false;
}

document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".walkway-resize-handle")) return; // handled by resize handlers below

    const label = e.target.closest(".shelf-label");
    const walkwayEl = !label ? e.target.closest(".walkway-wrapper") : null;
    let wrapper = null, type = null;
    if (label) {
        wrapper = label.closest(".shelf-wrapper");
        type = "shelf";
    } else if (walkwayEl) {
        wrapper = walkwayEl;
        type = "walkway";
    }
    if (!wrapper) return;

    const isStore = !!wrapper.closest("#storeSectionMapBox");
    const id = type === "shelf" ? wrapper.dataset.shelfId : wrapper.dataset.walkwayId;

    mapDragState = {
        type, id, el: wrapper, isStore,
        startPointerX: e.clientX, startPointerY: e.clientY,
        startLeft: parseFloat(wrapper.style.left) || 0,
        startTop: parseFloat(wrapper.style.top) || 0,
        moved: false,
        overTrash: false,
    };
    wrapper.classList.add("dragging");
    try { wrapper.setPointerCapture(e.pointerId); } catch (err) {}
});

document.addEventListener("pointermove", (e) => {
    if (!mapDragState) return;
    const dx = e.clientX - mapDragState.startPointerX;
    const dy = e.clientY - mapDragState.startPointerY;
    if (!mapDragState.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) mapDragState.moved = true;
    if (!mapDragState.moved) return;

    // Walkways only get a drag-to-delete trash zone (shelves keep their own confirm-gated delete)
    if (mapDragState.type === "walkway") {
        const zone = document.getElementById("walkwayTrashDropZone");
        if (zone) {
            zone.classList.remove("hidden");
            mapDragState.overTrash = isPointOverTrashZone(e.clientX, e.clientY);
            zone.classList.toggle("walkway-trash-armed", mapDragState.overTrash);
        }
        // Over the trash zone: fade the walkway as a second signal it's about to go away
        mapDragState.el.style.opacity = mapDragState.overTrash ? "0.35" : "1";
        if (mapDragState.overTrash) return;
    }

    // Clamped to MAP_CANVAS_INSET, not 0, or a drag could push a shelf flush against the border
    const newLeft = Math.max(MAP_CANVAS_INSET, mapDragState.startLeft + dx);
    const newTop = Math.max(MAP_CANVAS_INSET, mapDragState.startTop + dy);
    const box = document.getElementById(mapDragState.isStore ? "storeSectionMapBox" : "storeroomMapBox");

    // Each axis is tried independently ("wall sliding"), so a diagonal drag can still slide along a clear axis
    let finalLeft = parseFloat(mapDragState.el.style.left) || mapDragState.startLeft;
    let finalTop = parseFloat(mapDragState.el.style.top) || mapDragState.startTop;
    if (!box || !mapItemsCollide(mapDragState.el, newLeft, finalTop, box)) finalLeft = newLeft;
    if (!box || !mapItemsCollide(mapDragState.el, finalLeft, newTop, box)) finalTop = newTop;
    mapDragState.el.style.left = `${finalLeft}px`;
    mapDragState.el.style.top = `${finalTop}px`;

    // Grow the box live as a shelf gets dragged past its edge, so it isn't clipped
    resizeMapBoxToContent(box);
});

document.addEventListener("pointerup", async (e) => {
    if (!mapDragState) return;
    const state = mapDragState;
    mapDragState = null;
    state.el.classList.remove("dragging");
    try { state.el.releasePointerCapture(e.pointerId); } catch (err) {}
    document.getElementById("walkwayTrashDropZone")?.classList.add("hidden");
    document.getElementById("walkwayTrashDropZone")?.classList.remove("walkway-trash-armed");
    // Unconditional, or a failed delete would leave the walkway stuck faded out
    state.el.style.removeProperty("opacity");

    if (!state.moved) return; // a plain click on the label/walkway, not a real drag - no write

    const ctx = getMapDragContext(state.isStore);

    if (state.type === "walkway" && state.overTrash) {
        // Dropped on the trash zone: delete instead of saving a new position
        const label = (ctx.detail?.walkways || []).find(w => String(w.id) === String(state.id))?.label || "Walkway";
        await ctx.deleteWalkway(state.id, `Walkway "${escapeHtml(label)}" deleted.`);
        return;
    }

    // Subtract the render-time inset back out, so it doesn't drift further out on every drag
    const finalX = Math.round(parseFloat(state.el.style.left) || 0) - MAP_CANVAS_INSET;
    const finalY = Math.round(parseFloat(state.el.style.top) || 0) - MAP_CANVAS_INSET;

    // Update the cached detail immediately, so an incidental re-render doesn't snap back
    if (ctx.detail) {
        const list = state.type === "shelf" ? ctx.detail.shelves : ctx.detail.walkways;
        const item = (list || []).find(x => String(x.id) === String(state.id));
        if (item) { item.pos_x = finalX; item.pos_y = finalY; }
    }

    const endpoint = state.type === "shelf" ? ctx.shelfEndpoint(state.id) : ctx.walkwayEndpoint(state.id);
    try {
        const response = await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ pos_x: finalX, pos_y: finalY })
        });
        if (!response.ok) throw new Error("Failed to save position");
    } catch (err) {
        console.error("Map drag save error:", err);
        if (typeof displayNotification === "function") displayNotification("Could not save the new position - reloading map.", false);
        ctx.refresh();
    }
});

// Walkway resize (drag the corner handle), separate pointer state from the move-drag above
let mapResizeState = null; // { id, walkwayEl, isStore, startPointerX/Y, startWidth/Height }
const WALKWAY_MIN_SIZE = 40; // matches .walkway's min-width/min-height in index.html

document.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".walkway-resize-handle");
    if (!handle) return;
    const wrapper = handle.closest(".walkway-wrapper");
    const walkwayEl = wrapper?.querySelector(".walkway");
    if (!walkwayEl) return;

    const rect = walkwayEl.getBoundingClientRect();
    mapResizeState = {
        id: handle.dataset.walkwayId,
        walkwayEl,
        isStore: !!wrapper.closest("#storeSectionMapBox"),
        startPointerX: e.clientX, startPointerY: e.clientY,
        startWidth: rect.width, startHeight: rect.height,
    };
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
});

document.addEventListener("pointermove", (e) => {
    if (!mapResizeState) return;
    const dx = e.clientX - mapResizeState.startPointerX;
    const dy = e.clientY - mapResizeState.startPointerY;
    const newWidth = Math.max(WALKWAY_MIN_SIZE, Math.round(mapResizeState.startWidth + dx));
    const newHeight = Math.max(WALKWAY_MIN_SIZE, Math.round(mapResizeState.startHeight + dy));
    mapResizeState.walkwayEl.style.width = `${newWidth}px`;
    mapResizeState.walkwayEl.style.height = `${newHeight}px`;

    const box = document.getElementById(mapResizeState.isStore ? "storeSectionMapBox" : "storeroomMapBox");
    resizeMapBoxToContent(box);
});

document.addEventListener("pointerup", async (e) => {
    if (!mapResizeState) return;
    const state = mapResizeState;
    mapResizeState = null;
    try { e.target.releasePointerCapture?.(e.pointerId); } catch (err) {}

    const finalWidth = Math.round(parseFloat(state.walkwayEl.style.width)) || WALKWAY_MIN_SIZE;
    const finalHeight = Math.round(parseFloat(state.walkwayEl.style.height)) || WALKWAY_MIN_SIZE;
    const ctx = getMapDragContext(state.isStore);

    if (ctx.detail) {
        const item = (ctx.detail.walkways || []).find(x => String(x.id) === String(state.id));
        if (item) { item.width = finalWidth; item.height = finalHeight; }
    }

    try {
        const response = await fetch(ctx.walkwayEndpoint(state.id), {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ width: finalWidth, height: finalHeight })
        });
        if (!response.ok) throw new Error("Failed to save size");
    } catch (err) {
        console.error("Walkway resize save error:", err);
        if (typeof displayNotification === "function") displayNotification("Could not save the new size - reloading map.", false);
        ctx.refresh();
    }
});

// Rotate button: toggles horizontal/vertical and persists immediately
document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".shelf-rotate-btn");
    if (!btn) return;
    const isStore = !!btn.closest("#storeSectionMapBox");
    const shelfId = btn.dataset.shelfId;
    const ctx = getMapDragContext(isStore);
    const shelf = (ctx.detail?.shelves || []).find(s => String(s.id) === String(shelfId));
    if (!shelf) return;
    const nextOrientation = shelf.orientation === "vertical" ? "horizontal" : "vertical";

    try {
        const response = await fetch(ctx.shelfEndpoint(shelfId), {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ orientation: nextOrientation })
        });
        if (!response.ok) throw new Error("Failed to rotate shelf");
        shelf.orientation = nextOrientation;
        ctx.rebuild();
    } catch (err) {
        console.error("Rotate shelf error:", err);
        if (typeof displayNotification === "function") displayNotification("Could not rotate shelf.", false);
    }
});

// Add Shelf / Row / Column / Walkway
function populateShelfPicker(selectEl) {
    selectEl.innerHTML = "";
    (activeStoreroomDetail?.shelves || []).forEach(shelf => {
        selectEl.add(new Option(shelf.name, shelf.id));
    });
}

// Row/Column labels are numeric-only and auto-serial when left blank; Shelf/Walkway keep free text
function setStoreroomStructureLabelFieldMode(isNumeric) {
    const input = document.getElementById("storeroomStructureLabelInput");
    input.type = isNumeric ? "number" : "text";
    if (isNumeric) input.min = "1";
    document.getElementById("storeroomStructureLabelHint").classList.toggle("hidden", !isNumeric);
}

function openAddShelfModal() {
    if (!activeStoreroomId) return;
    storeroomStructureModalMode = "shelf";
    editingStructureId = null;
    document.getElementById("storeroomStructureModalTitle").innerText = "Add Shelf";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Create";
    document.getElementById("storeroomStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldLabel").innerText = "Shelf Name";
    setStoreroomStructureLabelFieldMode(false);
    document.getElementById("storeroomStructureLabelInput").value = "";
    document.getElementById("storeroomStructureLabelInput").placeholder = "e.g. A";
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

function openEditShelfModal(shelfId) {
    const shelf = (activeStoreroomDetail?.shelves || []).find(s => s.id === shelfId);
    if (!shelf) return;
    storeroomStructureModalMode = "shelf";
    editingStructureId = shelfId;
    document.getElementById("storeroomStructureModalTitle").innerText = "Edit Shelf";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeroomStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldLabel").innerText = "Shelf Name";
    setStoreroomStructureLabelFieldMode(false);
    document.getElementById("storeroomStructureLabelInput").value = shelf.name;
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

// A row and column are always added together, one modal, both fields required.
// Editing an existing one is still one field at a time (see openEditRowModal/openEditColumnModal)
function openAddRowColumnModal() {
    if (!activeStoreroomId) return;
    if (!activeStoreroomDetail?.shelves?.length) {
        if (typeof displayNotification === "function") displayNotification("Add a shelf first before adding rows/columns.", false);
        return;
    }
    storeroomStructureModalMode = "row_column";
    editingStructureId = null;
    document.getElementById("storeroomStructureModalTitle").innerText = "Add Row & Column";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Create";
    document.getElementById("storeroomStructureShelfPickerRow").classList.remove("hidden");
    populateShelfPicker(document.getElementById("storeroomStructureShelfPicker"));
    document.getElementById("storeroomStructureLabelFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowInput").value = "";
    document.getElementById("storeroomStructureColumnInput").value = "";
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

function openEditRowModal(rowId) {
    const shelf = (activeStoreroomDetail?.shelves || []).find(s => (s.rows || []).some(r => r.id === rowId));
    const row = shelf?.rows.find(r => r.id === rowId);
    if (!row) return;
    storeroomStructureModalMode = "row";
    editingStructureId = rowId;
    document.getElementById("storeroomStructureModalTitle").innerText = "Edit Row";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeroomStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldLabel").innerText = "Row Number";
    setStoreroomStructureLabelFieldMode(true);
    document.getElementById("storeroomStructureLabelInput").value = row.label;
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

function openEditColumnModal(columnId) {
    const shelf = (activeStoreroomDetail?.shelves || []).find(s => (s.columns || []).some(c => c.id === columnId));
    const column = shelf?.columns.find(c => c.id === columnId);
    if (!column) return;
    storeroomStructureModalMode = "column";
    editingStructureId = columnId;
    document.getElementById("storeroomStructureModalTitle").innerText = "Edit Column";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeroomStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldLabel").innerText = "Column Number";
    setStoreroomStructureLabelFieldMode(true);
    document.getElementById("storeroomStructureLabelInput").value = column.label;
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

function openAddWalkwayModal() {
    if (!activeStoreroomId) return;
    storeroomStructureModalMode = "walkway";
    editingStructureId = null;
    document.getElementById("storeroomStructureModalTitle").innerText = "Add Walkway";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Create";
    document.getElementById("storeroomStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldLabel").innerText = "Walkway Label";
    setStoreroomStructureLabelFieldMode(false);
    document.getElementById("storeroomStructureLabelInput").value = "";
    document.getElementById("storeroomStructureLabelInput").placeholder = "e.g. MAIN WALKWAY";
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

function openEditWalkwayModal(walkwayId) {
    const walkway = (activeStoreroomDetail?.walkways || []).find(w => w.id === walkwayId);
    if (!walkway) return;
    storeroomStructureModalMode = "walkway";
    editingStructureId = walkwayId;
    document.getElementById("storeroomStructureModalTitle").innerText = "Edit Walkway";
    document.getElementById("storeroomStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeroomStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeroomStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeroomStructureLabelFieldLabel").innerText = "Walkway Label";
    setStoreroomStructureLabelFieldMode(false);
    document.getElementById("storeroomStructureLabelInput").value = walkway.label;
    document.getElementById("storeroomStructureModal").classList.remove("hidden");
}

async function deleteStructureItem(endpoint, activityLabel) {
    try {
        const response = await fetch(endpoint, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Request failed");
        await refreshActiveStoreroomDetail();
        if (storeroomActiveView === "list") renderStoreroomListView();
        if (typeof displayNotification === "function") displayNotification("Deleted successfully.", true);
        pushLocalActivityNotification(activityLabel || "Stockroom item deleted.");
    } catch (err) {
        console.error("deleteStructureItem error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to delete. Try again.", false);
    }
}

function confirmDeleteShelf(shelfId) {
    const shelf = (activeStoreroomDetail?.shelves || []).find(s => s.id === shelfId);
    const shelfName = shelf ? shelf.name : "";
    if (!confirm(`Delete shelf "${shelfName}"? This also removes its rows and columns.`)) return;
    deleteStructureItem(`${apiUrl}/api/shelves/${shelfId}`, `Shelf "${escapeHtml(shelfName)}" deleted.`);
}

function confirmDeleteShelfRow(rowId) {
    if (!confirm("Delete this row?")) return;
    deleteStructureItem(`${apiUrl}/api/shelf-rows/${rowId}`, "Row deleted.");
}

function confirmDeleteShelfColumn(columnId) {
    if (!confirm("Delete this column?")) return;
    deleteStructureItem(`${apiUrl}/api/shelf-columns/${columnId}`, "Column deleted.");
}

function confirmDeleteWalkway(walkwayId) {
    if (!confirm("Delete this walkway?")) return;
    deleteStructureItem(`${apiUrl}/api/walkways/${walkwayId}`, "Walkway deleted.");
}

function closeStoreroomStructureModal() {
    closeRightSlidePanel("storeroomStructureModal");
    storeroomStructureModalMode = null;
    editingStructureId = null;
}

// A row and column are always created together; whichever already exists on that shelf is just reused
async function submitStoreroomRowColumnModal() {
    const shelfId = document.getElementById("storeroomStructureShelfPicker").value;
    const rowLabel = document.getElementById("storeroomStructureRowInput").value.trim();
    const columnLabel = document.getElementById("storeroomStructureColumnInput").value.trim();
    if (!shelfId) {
        if (typeof displayNotification === "function") displayNotification("Select a shelf first.", false);
        return;
    }
    if (!rowLabel || !columnLabel) {
        if (typeof displayNotification === "function") displayNotification("Enter both a Row Number and a Column Number.", false);
        return;
    }

    const shelf = (activeStoreroomDetail?.shelves || []).find(s => String(s.id) === String(shelfId));
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` };

    const submitBtn = document.getElementById("storeroomStructureSubmitBtn");
    if (submitBtn) submitBtn.disabled = true;

    try {
        // Always POST both, no client-side existence check. The endpoints are idempotent,
        // returning the existing row/column instead of erroring if the number is already there.
        const rowResponse = await fetch(`${apiUrl}/api/shelves/${shelfId}/rows`, { method: "POST", headers, body: JSON.stringify({ label: rowLabel }) });
        if (!rowResponse.ok) {
            const errBody = await rowResponse.json().catch(() => ({}));
            throw new Error(errBody.detail || "Failed to add the row.");
        }
        const columnResponse = await fetch(`${apiUrl}/api/shelves/${shelfId}/columns`, { method: "POST", headers, body: JSON.stringify({ label: columnLabel }) });
        if (!columnResponse.ok) {
            const errBody = await columnResponse.json().catch(() => ({}));
            throw new Error(errBody.detail || "Failed to add the column.");
        }
        await refreshActiveStoreroomDetail();
        closeStoreroomStructureModal();
        if (storeroomActiveView === "list") renderStoreroomListView();
        if (typeof displayNotification === "function") displayNotification("Added successfully.", true);
        pushLocalActivityNotification(`Row "${escapeHtml(rowLabel)}" & Column "${escapeHtml(columnLabel)}" added to shelf "${escapeHtml(shelf?.name || "")}".`);
    } catch (err) {
        console.error("submitStoreroomRowColumnModal error:", err);
        if (typeof displayNotification === "function") displayNotification(err.message || "Failed to save. Try again.", false);
        await refreshActiveStoreroomDetail();
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function submitStoreroomStructureModal() {
    if (storeroomStructureModalMode === "row_column") {
        await submitStoreroomRowColumnModal();
        return;
    }

    const label = document.getElementById("storeroomStructureLabelInput").value.trim();
    if (!label) {
        if (typeof displayNotification === "function") displayNotification("Please enter a name/label.", false);
        return;
    }

    const isEdit = editingStructureId !== null;
    const isRowOrColumn = storeroomStructureModalMode === "row" || storeroomStructureModalMode === "column";

    let endpoint, method, body;
    if (storeroomStructureModalMode === "shelf") {
        if (isEdit) {
            endpoint = `${apiUrl}/api/shelves/${editingStructureId}`;
            method = "PUT";
            body = { name: label };
        } else {
            endpoint = `${apiUrl}/api/storerooms/${activeStoreroomId}/shelves`;
            method = "POST";
            // Stagger the starting position so new shelves don't spawn stacked on top of each other
            const count = activeStoreroomDetail?.shelves?.length || 0;
            const posX = 40 + (count % 10) * 30;
            const posY = 40 + (count % 10) * 30;
            body = { name: label, color: SHELF_FIXED_COLOR, pos_x: posX, pos_y: posY };
        }
    } else if (isRowOrColumn) {
        // Only reachable via Edit Row/Edit Column, always a rename of an existing one
        const kindPath = storeroomStructureModalMode === "row" ? "shelf-rows" : "shelf-columns";
        endpoint = `${apiUrl}/api/${kindPath}/${editingStructureId}`;
        method = "PUT";
        body = { label };
    } else if (storeroomStructureModalMode === "walkway") {
        if (isEdit) {
            endpoint = `${apiUrl}/api/walkways/${editingStructureId}`;
            method = "PUT";
            body = { label };
        } else {
            endpoint = `${apiUrl}/api/storerooms/${activeStoreroomId}/walkways`;
            method = "POST";
            body = { label };
        }
    } else {
        return;
    }

    try {
        const response = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.detail || "Request failed");
        }
        const kindName = storeroomStructureModalMode.charAt(0).toUpperCase() + storeroomStructureModalMode.slice(1);
        closeStoreroomStructureModal();
        await refreshActiveStoreroomDetail();
        if (storeroomActiveView === "list") renderStoreroomListView();
        if (typeof displayNotification === "function") displayNotification(isEdit ? "Updated successfully." : "Added successfully.", true);
        pushLocalActivityNotification(`${kindName} "${escapeHtml(label)}" ${isEdit ? "updated" : "added"}.`);
    } catch (err) {
        console.error("submitStoreroomStructureModal error:", err);
        if (typeof displayNotification === "function") displayNotification(err.message || "Failed to save. Try again.", false);
    }
}

// Storeroom cell selection & popup matrix (live stock colors)
let lastSelectedLocation = null;

// rowLabel/columnLabel are optional: Map View supplies both, List View only one at a time
function selectLocation(shelfName, rowLabel, columnLabel) {
    const modal = document.getElementById("locationProductsModal");
    const titleEl = document.getElementById("modalLocationCodeTitle");
    const titlePrintEl = document.getElementById("modalLocationCodeTitlePrint");
    const container = document.getElementById("modalProductListContainer");

    if (!modal || !container) return;

    lastSelectedLocation = { shelfName, rowLabel, columnLabel };
    const titleText = (rowLabel != null && columnLabel != null)
        ? buildLocationCode(shelfName, rowLabel, columnLabel)
        : `${shelfName}${rowLabel != null ? " · Row " + rowLabel : ""}${columnLabel != null ? " · Column " + columnLabel : ""}`;
    titleEl.innerText = titleText;
    if (titlePrintEl) titlePrintEl.innerText = titleText;

    const matchedProducts = systemInventoryDatabase.filter(item => {
        if (item.storeroom !== activeStoreroomId) return false;
        if (String(item.shelf) !== String(shelfName)) return false;
        if (rowLabel != null && String(item.row) !== String(rowLabel)) return false;
        if (columnLabel != null && String(item.column) !== String(columnLabel)) return false;
        return true;
    });
    container.innerHTML = "";

    if (matchedProducts.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-400 font-mono text-xs uppercase font-bold border-2 border-dashed border-[#E6B950]/20 rounded-xl bg-black/20 flex items-center justify-center gap-3">
                <span class="w-3 h-3 rounded-full status-blink shrink-0" style="background:${statusColor("empty")};"></span>
                Empty — No products assigned to this slot.
            </div>`;
    } else {
        const isManager = isCurrentUserManager();
        matchedProducts.forEach(product => {
            const status = computeStockStatus(product.availableQty, product.lowStockThreshold);
            const restockTarget = product.fullStockQuantity != null ? product.fullStockQuantity : product.lowStockThreshold;
            const restockNote = (status === "low" && restockTarget != null)
                ? `<p class="text-[9px] font-black text-orange-400 uppercase mt-0.5">📦 Restock: ${Math.max(0, restockTarget - product.availableQty)} pcs</p>`
                : "";
            const alertNote = product.lowStockThreshold != null
                ? `<p class="text-[9px] font-bold text-amber-400 uppercase mt-0.5">🔔 Alert below ${product.lowStockThreshold} pcs${product.fullStockQuantity != null ? ` · Full stock ${product.fullStockQuantity} pcs` : ""}</p>${restockNote}`
                : `<p class="text-[9px] font-bold text-gray-500 uppercase mt-0.5">🔕 No alert set</p>`;
            const alertBtn = isManager
                ? `<button type="button" onclick="openSetAlertThresholdModal(${product.productId}, '${escapeHtml(product.productName).replace(/'/g, "\\'")}', ${product.lowStockThreshold != null ? product.lowStockThreshold : "null"}, ${product.fullStockQuantity != null ? product.fullStockQuantity : "null"})" class="w-8 h-8 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-950/30 flex items-center justify-center shrink-0 transition-colors" title="Set Low Stock Alert">🔔</button>`
                : "";
            container.insertAdjacentHTML('beforeend', `
                <div class="flex items-center justify-between gap-4 p-4 bg-black/30 border border-[#E6B950]/15 rounded-xl hover:border-[#E6B950] transition-colors">
                    ${product.photo
                        ? `<img src="${product.photo}" alt="${escapeHtml(product.productName)}" class="w-14 h-14 object-cover rounded-xl border border-[#E6B950]/20 shrink-0">`
                        : `<div class="w-14 h-14 rounded-xl border-2 border-dashed border-[#E6B950]/20 flex items-center justify-center text-xl text-gray-500 shrink-0">📦</div>`}
                    <div class="min-w-0 flex-1">
                        <h4 class="font-black text-white text-sm uppercase truncate">${escapeHtml(product.productName)}</h4>
                        <p class="text-[10px] font-mono font-bold text-gray-500 mt-0.5 uppercase tracking-wide">
                            Barcode: <span class="text-gray-300">${escapeHtml(product.barcode)}</span>
                        </p>
                        <p class="text-[9px] font-bold text-gray-500 uppercase mt-0.5">
                            Branch: <span class="text-gray-400">${escapeHtml(product.branch || "N/A")}</span>
                        </p>
                        ${alertNote}
                    </div>
                    <div class="text-right shrink-0 flex items-center gap-3">
                        <div>
                            <span class="text-xs font-black text-gray-500 block uppercase tracking-widest">Stock</span>
                            <span class="text-xl font-black text-white font-mono">${product.availableQty} <span class="text-xs font-bold text-gray-400">Pcs</span></span>
                        </div>
                        <span class="w-4 h-4 rounded-full status-blink shrink-0" style="background:${statusColor(status)};" title="${status}"></span>
                        ${alertBtn}
                    </div>
                </div>
            `);
        });
    }

    modal.classList.remove("hidden");
}

function closeLocationProductsModal() {
    closeRightSlidePanel("locationProductsModal");
}

// STORE (shop floor): same as the Stockroom card/map/list set above, separate state/hierarchy
// Loads the current branch's flat shelf/walkway map directly, no section/aisle picker step
async function loadStoreBranchMap() {
    const storeSectionMapSection = document.getElementById("storeSectionMapSection");
    if (!storeSectionMapSection) return;

    try {
        activeStoreSectionDetail = sortShelfRowsAndColumns(await fetchStoreDetailForBranch(getCurrentBranch()));
    } catch (err) {
        console.error("loadStoreBranchMap error:", err);
        if (typeof displayNotification === "function") displayNotification("Could not load the store map.", false);
        return;
    }

    storeSectionMapSection.classList.remove("hidden");
    document.getElementById("storeSectionStructureActionsRow")?.classList.toggle("hidden", !isCurrentUserManager());
    renderActiveStoreSectionHeader();

    // Same as openStoreroomMap: toggle visibility before building map rows
    if (storeActiveView === "list") {
        showStoreSectionListView();
    } else {
        showStoreSectionMapView();
    }
    buildStoreSectionMapRows();
}

function renderActiveStoreSectionHeader() {
    if (!activeStoreSectionDetail) return;
    const title = document.getElementById("storeSectionMapTitle");
    if (title) title.innerText = "STORE MAP";

    const shelves = activeStoreSectionDetail.shelves || [];
    const rowCount = shelves.reduce((sum, s) => sum + s.rows.length, 0);
    const columnCount = shelves.reduce((sum, s) => sum + s.columns.length, 0);

    const shelvesEl = document.getElementById("storeSectionStatShelves");
    const rowsEl = document.getElementById("storeSectionStatRows");
    const columnsEl = document.getElementById("storeSectionStatColumns");
    if (shelvesEl) shelvesEl.innerText = shelves.length;
    if (rowsEl) rowsEl.innerText = rowCount;
    if (columnsEl) columnsEl.innerText = columnCount;
}

async function refreshActiveStoreSectionDetail() {
    await loadStoreBranchMap();
}

function showStoreSectionMapView() {
    storeActiveView = "map";
    document.getElementById("storeSectionMapGridWrapper")?.classList.remove("hidden");
    document.getElementById("storeSectionListViewWrapper")?.classList.add("hidden");
    updateStoreSectionViewToggleButtons();
    // Same as showStoreroomMapView: re-measure now the wrapper is visible
    resizeMapBoxToContent(document.getElementById("storeSectionMapBox"));
}

function showStoreSectionListView() {
    storeActiveView = "list";
    document.getElementById("storeSectionMapGridWrapper")?.classList.add("hidden");
    document.getElementById("storeSectionListViewWrapper")?.classList.remove("hidden");
    renderStoreSectionListView();
    updateStoreSectionViewToggleButtons();
}

function updateStoreSectionViewToggleButtons() {
    const mapBtn = document.getElementById("storeSectionMapViewToggleBtn");
    const listBtn = document.getElementById("storeSectionListViewToggleBtn");
    if (!mapBtn || !listBtn) return;
    const setActive = (btn) => {
        btn.classList.remove("text-black");
        btn.classList.add("bg-black", "text-white");
    };
    const setInactive = (btn) => {
        btn.classList.remove("bg-black", "text-white");
        btn.classList.add("text-black");
    };
    if (storeActiveView === "map") {
        setActive(mapBtn);
        setInactive(listBtn);
    } else {
        setActive(listBtn);
        setInactive(mapBtn);
    }
}

function renderStoreSectionListView() {
    const wrapper = document.getElementById("storeSectionListViewWrapper");
    if (!wrapper || !activeStoreSectionDetail) return;

    const isManager = isCurrentUserManager();
    const shelves = activeStoreSectionDetail.shelves || [];
    const walkways = activeStoreSectionDetail.walkways || [];

    const shelvesHtml = shelves.length ? shelves.map(shelf => {
        const shelfNameSafe = escapeHtml(shelf.name).replace(/'/g, "\\'");

        const rowsHtml = (shelf.rows || []).length ? shelf.rows.map(row => {
            const rowLabelSafe = escapeHtml(row.label).replace(/'/g, "\\'");
            return `
            <div onclick="selectStoreLocation('${shelfNameSafe}', '${rowLabelSafe}', null)" class="flex items-center justify-between gap-2 py-1.5 px-3 border-b border-zinc-100 last:border-0 cursor-pointer hover:bg-zinc-50 transition-colors">
                <span class="text-xs font-bold text-zinc-700">Row: ${escapeHtml(row.label)}</span>
                ${isManager ? `
                <div class="flex gap-1.5 shrink-0 print:hidden">
                    <button type="button" onclick="event.stopPropagation(); openEditStoreRowModal(${row.id})" class="storeroom-list-icon-btn" title="Edit Row">✎</button>
                    <button type="button" onclick="event.stopPropagation(); confirmDeleteStoreShelfRow(${row.id})" class="storeroom-list-icon-btn" title="Delete Row">🗑</button>
                </div>` : ""}
            </div>`;
        }).join("") : `<p class="text-xs text-zinc-400 uppercase font-bold px-3 py-2">No rows yet.</p>`;

        const columnsHtml = (shelf.columns || []).length ? shelf.columns.map(col => {
            const colLabelSafe = escapeHtml(col.label).replace(/'/g, "\\'");
            return `
            <div onclick="selectStoreLocation('${shelfNameSafe}', null, '${colLabelSafe}')" class="flex items-center justify-between gap-2 py-1.5 px-3 border-b border-zinc-100 last:border-0 cursor-pointer hover:bg-zinc-50 transition-colors">
                <span class="text-xs font-bold text-zinc-700">Column: ${escapeHtml(col.label)}</span>
                ${isManager ? `
                <div class="flex gap-1.5 shrink-0 print:hidden">
                    <button type="button" onclick="event.stopPropagation(); openEditStoreColumnModal(${col.id})" class="storeroom-list-icon-btn" title="Edit Column">✎</button>
                    <button type="button" onclick="event.stopPropagation(); confirmDeleteStoreShelfColumn(${col.id})" class="storeroom-list-icon-btn" title="Delete Column">🗑</button>
                </div>` : ""}
            </div>`;
        }).join("") : `<p class="text-xs text-zinc-400 uppercase font-bold px-3 py-2">No columns yet.</p>`;

        return `
            <div class="border border-zinc-200 rounded-xl overflow-hidden mb-4">
                <div class="flex items-center justify-between gap-3 px-4 py-3" style="background:${STORE_SHELF_FIXED_COLOR};">
                    <span class="font-black text-white uppercase tracking-wide">${escapeHtml(shelf.name)}</span>
                    ${isManager ? `
                    <div class="flex gap-1.5 shrink-0 print:hidden">
                        <button type="button" onclick="openEditStoreShelfModal(${shelf.id})" class="storeroom-list-icon-btn storeroom-list-icon-btn-light" title="Edit Shelf">✎</button>
                        <button type="button" onclick="confirmDeleteStoreShelf(${shelf.id})" class="storeroom-list-icon-btn storeroom-list-icon-btn-light" title="Delete Shelf">🗑</button>
                    </div>` : ""}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-100">
                    <div>${rowsHtml}</div>
                    <div>${columnsHtml}</div>
                </div>
            </div>`;
    }).join("") : `<p class="text-sm text-gray-400 uppercase font-bold mb-4">No shelves yet — use "+ Add Shelf" below.</p>`;

    const walkwaysHtml = walkways.length ? walkways.map(w => `
        <div class="flex items-center justify-between gap-2 py-2.5 px-4 border border-zinc-200 rounded-xl mb-2">
            <span class="text-xs font-black uppercase text-zinc-700">Walkway: ${escapeHtml(w.label || "WALKWAY")}</span>
            ${isManager ? `
            <div class="flex gap-1.5 shrink-0">
                <button type="button" onclick="openEditStoreWalkwayModal(${w.id})" class="storeroom-list-icon-btn" title="Edit Walkway">✎</button>
                <button type="button" onclick="confirmDeleteStoreWalkway(${w.id})" class="storeroom-list-icon-btn" title="Delete Walkway">🗑</button>
            </div>` : ""}
        </div>`).join("") : "";

    wrapper.innerHTML = `
        <div>${shelvesHtml}</div>
        ${walkwaysHtml ? `<div class="mt-4"><h4 class="text-xs font-black uppercase text-zinc-500 mb-2">Walkways</h4>${walkwaysHtml}</div>` : ""}
    `;
}

// Sidebar "Store Management" entry point: swaps dashboard content for the Store cards/map,
// header and sidebar stay fully usable. Covers both the regular entry and Full Management's slide-over.
function isStoreManagementActive() {
    const storeContent = document.getElementById("storeManagementContent");
    return (storeContent && !storeContent.classList.contains("hidden")) || fullManagementActiveArea === "store";
}

function openStoreManagementSection() {
    document.getElementById("dashboardHomeContent")?.classList.add("hidden");
    document.getElementById("storeManagementContent")?.classList.remove("hidden");
    document.getElementById("dashboardMainContent")?.scrollTo(0, 0);
    // Hide nav items already covered by this screen, restored on the way out
    document.getElementById("storeManagementBtn")?.classList.add("hidden");
    document.getElementById("yourAttendanceBtn")?.classList.add("hidden");
    document.getElementById("tillManagementBtn")?.classList.add("hidden");
    // No Store Move exists (only In/Out), hide the button rather than relabeling it
    document.getElementById("sidebarStockMoveBtn")?.classList.add("hidden");
    // "Stock" labels read as "Store" here, same buttons/handlers, just different wording
    const stockInLabel = document.getElementById("sidebarStockInLabel");
    if (stockInLabel) stockInLabel.innerText = "Store In";
    const stockOutLabel = document.getElementById("sidebarStockOutLabel");
    if (stockOutLabel) stockOutLabel.innerText = "Store Out";
    const stockHistoryLabel = document.getElementById("sidebarStockHistoryLabel");
    if (stockHistoryLabel) stockHistoryLabel.innerText = "Store History";
    storeActiveView = "map";
    loadStoreBranchMap();
    fetchStoreManagementStats();
}

function closeStoreManagementSection() {
    document.getElementById("storeManagementContent")?.classList.add("hidden");
    document.getElementById("dashboardHomeContent")?.classList.remove("hidden");
    document.getElementById("storeManagementBtn")?.classList.remove("hidden");
    // Restore using the same role rule loadAuthenticatedUserProfile applies, not a blanket show
    const role = (window.currentUserProfile?.role || "").toLowerCase();
    document.getElementById("yourAttendanceBtn")?.classList.toggle("hidden", !["staff", "management"].includes(role));
    document.getElementById("tillManagementBtn")?.classList.toggle("hidden", !isCurrentUserManager());
    document.getElementById("sidebarStockMoveBtn")?.classList.remove("hidden");
    // Revert labels back to "Stock" for the regular dashboard
    const stockInLabel = document.getElementById("sidebarStockInLabel");
    if (stockInLabel) stockInLabel.innerText = "Stock In";
    const stockOutLabel = document.getElementById("sidebarStockOutLabel");
    if (stockOutLabel) stockOutLabel.innerText = "Stock Out";
    const stockHistoryLabel = document.getElementById("sidebarStockHistoryLabel");
    if (stockHistoryLabel) stockHistoryLabel.innerText = "Stock History";
}

// Back button: exits to branch selection, or returns to the regular dashboard from Store Management
function handleTopBackButtonClick() {
    const storeContent = document.getElementById("storeManagementContent");
    if (storeContent && !storeContent.classList.contains("hidden")) {
        closeStoreManagementSection();
        return;
    }
    backToBranchSelection();
}

// Store Management metric cards: live same-day snapshot, no Daily/Weekly/Monthly history
let storeManagementStatsCache = null;

async function fetchStoreManagementStats() {
    try {
        const response = await fetch(`${apiUrl}/api/store-sections/dashboard-stats?branch=${encodeURIComponent(getCurrentBranch())}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) return;
        storeManagementStatsCache = await response.json();

        const allEl = document.getElementById("storeStatAllProduct");
        if (allEl) allEl.innerText = storeManagementStatsCache.all_product_count || 0;
        const fillingEl = document.getElementById("storeStatTodaysFilling");
        if (fillingEl) fillingEl.innerText = storeManagementStatsCache.todays_filling_count || 0;
        const urgentEl = document.getElementById("storeStatUrgentFilling");
        if (urgentEl) urgentEl.innerText = storeManagementStatsCache.urgent_filling_count || 0;
        const outEl = document.getElementById("storeStatOutOfStore");
        if (outEl) outEl.innerText = storeManagementStatsCache.out_of_store_count || 0;
    } catch (err) {
        console.error("fetchStoreManagementStats error:", err);
    }
}

const STORE_METRIC_CARD_CONFIGS = {
    allProducts:   { title: "All Products",    subtitle: "Currently stocked on the shop floor",                          listKey: "all_products" },
    todaysFilling: { title: "Today's Filling", subtitle: "Left the shelf today (sale or Store Out) - needs walking back from Stockroom", listKey: "todays_filling_products" },
    urgentFilling: { title: "Urgent Filling",  subtitle: "Shelf is empty, Stockroom still has stock - fillable now",     listKey: "urgent_filling_products" },
    outOfStore:    { title: "Out of Store",    subtitle: "Shelf AND Stockroom both empty - needs a real Stock In",       listKey: "out_of_store_products" },
};

async function openStoreMetricModal(kind) {
    const config = STORE_METRIC_CARD_CONFIGS[kind];
    if (!config) return;

    // Always re-fetch on open, this is a live snapshot and stock may have changed since
    await fetchStoreManagementStats();

    const todayLabel = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const titleEl = document.getElementById("storeMetricModalTitle");
    const subtitleEl = document.getElementById("storeMetricModalSubtitle");
    if (titleEl) titleEl.innerText = config.title;
    if (subtitleEl) subtitleEl.innerText = `${config.subtitle} — ${todayLabel}`;

    const list = (storeManagementStatsCache && storeManagementStatsCache[config.listKey]) || [];
    const listEl = document.getElementById("storeMetricModalList");
    if (listEl) {
        if (list.length === 0) {
            listEl.innerHTML = `<p class="text-center text-gray-400 font-bold uppercase text-sm py-10">Nothing here right now.</p>`;
        } else {
            listEl.innerHTML = list.map(item => {
                let detail = `On Shelf: <span class="text-white">${item.shelf_quantity}</span> pcs`;
                if (kind === "todaysFilling") {
                    detail = `Left Shelf Today: <span class="text-white">${item.sold_today}</span> pcs &middot; On Shelf Now: <span class="text-white">${item.shelf_quantity}</span> pcs`;
                } else if (kind === "urgentFilling") {
                    detail = `Shelf: <span class="text-red-400">0</span> &middot; Stockroom Available: <span class="text-emerald-400">${item.stock_quantity}</span> pcs`;
                } else if (kind === "outOfStore") {
                    detail = `Shelf: <span class="text-red-400">0</span> &middot; Stockroom: <span class="text-red-400">0</span>`;
                }
                return `
                <div class="flex items-center gap-4 bg-black/30 border border-[#E6B950]/15 rounded-2xl p-4 shadow-sm">
                    ${item.photo
                        ? `<img src="${item.photo}" alt="${escapeHtml(item.name)}" class="w-14 h-14 object-cover rounded-xl border border-[#E6B950]/20 shrink-0">`
                        : `<div class="w-14 h-14 rounded-xl border-2 border-dashed border-[#E6B950]/20 flex items-center justify-center text-xl text-gray-500 shrink-0">📦</div>`}
                    <div class="min-w-0 flex-1">
                        <h4 class="font-black text-white text-sm uppercase truncate">${escapeHtml(item.name)}</h4>
                        <p class="text-[10px] font-mono font-bold text-gray-500 mt-0.5">${escapeHtml(item.barcode)}</p>
                        <p class="text-[11px] font-bold text-gray-400 uppercase mt-1">${detail}</p>
                    </div>
                </div>`;
            }).join("");
        }
    }

    // Move to a direct child of <body> (a "portal") so fixed positioning covers the full screen
    const modalEl = document.getElementById("storeMetricModal");
    if (modalEl && modalEl.parentElement !== document.body) {
        document.body.appendChild(modalEl);
    }

    openRightSlidePanel("storeMetricModal");
}

function closeStoreMetricModal() {
    closeRightSlidePanel("storeMetricModal");
}

function renderStoreShelfHTML(shelf) {
    const rows = shelf.rows.length ? shelf.rows : [{ label: SHELF_EMPTY_PLACEHOLDER_LABEL }];
    const columns = shelf.columns.length ? shelf.columns : [{ label: SHELF_EMPTY_PLACEHOLDER_LABEL }];
    const shelfAttr = escapeHtml(shelf.name);
    const isVertical = shelf.orientation === "vertical";

    // One flat grid for label + every cell, label placed once as a single grid item
    const cellsHtml = rows.map((row, rowIdx) => {
        const rowAttr = escapeHtml(row.label);
        return columns.map((col, colIdx) => {
            const colAttr = escapeHtml(col.label);
            const code = buildLocationCode(shelfAttr, rowAttr, colAttr);
            const pos = isVertical
                ? `grid-column:${rowIdx + 1}; grid-row:${colIdx + 2};`
                : `grid-column:${colIdx + 2}; grid-row:${rowIdx + 1};`;
            return `<button type="button" class="location-cell" style="${pos}" data-shelf-name="${shelfAttr}" data-row="${rowAttr}" data-column="${colAttr}"><span>${code}</span></button>`;
        }).join("");
    }).join("");

    // Label stays a fixed single-cell square, doesn't grow as more rows/columns are added
    const labelPos = `grid-column: 1; grid-row: 1;`;
    const gridTemplate = isVertical
        ? `grid-template-columns: repeat(${rows.length}, 68px); grid-template-rows: 68px repeat(${columns.length}, 68px);`
        : `grid-template-columns: 68px repeat(${columns.length}, 68px); grid-template-rows: repeat(${rows.length}, 68px);`;

    const x = (shelf.pos_x != null ? shelf.pos_x : 40) + MAP_CANVAS_INSET;
    const y = (shelf.pos_y != null ? shelf.pos_y : 40) + MAP_CANVAS_INSET;

    return `
        <div class="shelf-wrapper" data-shelf-id="${shelf.id}" data-orientation="${shelf.orientation || "horizontal"}" style="left:${x}px; top:${y}px;">
            <button type="button" class="shelf-rotate-btn" data-shelf-id="${shelf.id}" title="Rotate horizontal/vertical">⟳</button>
            <div class="shelf-plate" style="${gridTemplate}">
                <div class="shelf-label" style="${labelPos} background:${STORE_SHELF_FIXED_COLOR}; border-color:${STORE_SHELF_FIXED_COLOR}; color:#ffffff;">${shelfAttr}</div>
                ${cellsHtml}
            </div>
        </div>`;
}

function renderStoreWalkwayHTML(walkway) {
    const x = (walkway.pos_x != null ? walkway.pos_x : 340) + MAP_CANVAS_INSET;
    const y = (walkway.pos_y != null ? walkway.pos_y : 40) + MAP_CANVAS_INSET;
    const sizeStyle = (walkway.width != null && walkway.height != null)
        ? ` width:${walkway.width}px; height:${walkway.height}px;`
        : "";
    return `
        <div class="walkway-wrapper" data-walkway-id="${walkway.id}" style="left:${x}px; top:${y}px;">
            <div class="walkway" style="${sizeStyle}">${escapeHtml(walkway.label || "WALKWAY")}</div>
            <div class="walkway-resize-handle" data-walkway-id="${walkway.id}" title="Drag to resize"></div>
        </div>`;
}

function buildStoreSectionMapRows() {
    const box = document.getElementById("storeSectionMapBox");
    if (!box || !activeStoreSectionDetail) return;

    const shelves = activeStoreSectionDetail.shelves || [];
    const walkways = activeStoreSectionDetail.walkways || [];

    const shelvesHtml = shelves.map(renderStoreShelfHTML).join("") ||
        `<p class="text-xs text-gray-400 uppercase font-bold p-4">No shelves yet — use "+ Add Shelf" below.</p>`;
    const walkwaysHtml = walkways.map(renderStoreWalkwayHTML).join("");

    box.innerHTML = shelvesHtml + walkwaysHtml;
    resizeMapBoxToContent(box);
}

function populateStoreShelfPicker(selectEl) {
    selectEl.innerHTML = "";
    (activeStoreSectionDetail?.shelves || []).forEach(shelf => {
        selectEl.add(new Option(shelf.name, shelf.id));
    });
}

// Mirror of setStoreroomStructureLabelFieldMode for the Store system.
function setStoreStructureLabelFieldMode(isNumeric) {
    const input = document.getElementById("storeStructureLabelInput");
    input.type = isNumeric ? "number" : "text";
    if (isNumeric) input.min = "1";
    document.getElementById("storeStructureLabelHint").classList.toggle("hidden", !isNumeric);
}

function openAddStoreShelfModal() {
    if (!activeStoreSectionDetail) return;
    storeStructureModalMode = "shelf";
    editingStoreStructureId = null;
    document.getElementById("storeStructureModalTitle").innerText = "Add Shelf";
    document.getElementById("storeStructureSubmitBtn").innerText = "Create";
    document.getElementById("storeStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldLabel").innerText = "Shelf Name";
    setStoreStructureLabelFieldMode(false);
    document.getElementById("storeStructureLabelInput").value = "";
    document.getElementById("storeStructureLabelInput").placeholder = "e.g. A";
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

function openEditStoreShelfModal(shelfId) {
    const shelf = (activeStoreSectionDetail?.shelves || []).find(s => s.id === shelfId);
    if (!shelf) return;
    storeStructureModalMode = "shelf";
    editingStoreStructureId = shelfId;
    document.getElementById("storeStructureModalTitle").innerText = "Edit Shelf";
    document.getElementById("storeStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldLabel").innerText = "Shelf Name";
    setStoreStructureLabelFieldMode(false);
    document.getElementById("storeStructureLabelInput").value = shelf.name;
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

// Mirror of openAddRowColumnModal for the Store system
function openAddStoreRowColumnModal() {
    if (!activeStoreSectionDetail) return;
    if (!activeStoreSectionDetail?.shelves?.length) {
        if (typeof displayNotification === "function") displayNotification("Add a shelf first before adding rows/columns.", false);
        return;
    }
    storeStructureModalMode = "row_column";
    editingStoreStructureId = null;
    document.getElementById("storeStructureModalTitle").innerText = "Add Row & Column";
    document.getElementById("storeStructureSubmitBtn").innerText = "Create";
    document.getElementById("storeStructureShelfPickerRow").classList.remove("hidden");
    populateStoreShelfPicker(document.getElementById("storeStructureShelfPicker"));
    document.getElementById("storeStructureLabelFieldRow").classList.add("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowInput").value = "";
    document.getElementById("storeStructureColumnInput").value = "";
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

function openEditStoreRowModal(rowId) {
    const shelf = (activeStoreSectionDetail?.shelves || []).find(s => (s.rows || []).some(r => r.id === rowId));
    const row = shelf?.rows.find(r => r.id === rowId);
    if (!row) return;
    storeStructureModalMode = "row";
    editingStoreStructureId = rowId;
    document.getElementById("storeStructureModalTitle").innerText = "Edit Row";
    document.getElementById("storeStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldLabel").innerText = "Row Number";
    setStoreStructureLabelFieldMode(true);
    document.getElementById("storeStructureLabelInput").value = row.label;
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

function openEditStoreColumnModal(columnId) {
    const shelf = (activeStoreSectionDetail?.shelves || []).find(s => (s.columns || []).some(c => c.id === columnId));
    const column = shelf?.columns.find(c => c.id === columnId);
    if (!column) return;
    storeStructureModalMode = "column";
    editingStoreStructureId = columnId;
    document.getElementById("storeStructureModalTitle").innerText = "Edit Column";
    document.getElementById("storeStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldLabel").innerText = "Column Number";
    setStoreStructureLabelFieldMode(true);
    document.getElementById("storeStructureLabelInput").value = column.label;
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

function openAddStoreWalkwayModal() {
    if (!activeStoreSectionDetail) return;
    storeStructureModalMode = "walkway";
    editingStoreStructureId = null;
    document.getElementById("storeStructureModalTitle").innerText = "Add Walkway";
    document.getElementById("storeStructureSubmitBtn").innerText = "Create";
    document.getElementById("storeStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldLabel").innerText = "Walkway Label";
    setStoreStructureLabelFieldMode(false);
    document.getElementById("storeStructureLabelInput").value = "";
    document.getElementById("storeStructureLabelInput").placeholder = "e.g. MAIN WALKWAY";
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

function openEditStoreWalkwayModal(walkwayId) {
    const walkway = (activeStoreSectionDetail?.walkways || []).find(w => w.id === walkwayId);
    if (!walkway) return;
    storeStructureModalMode = "walkway";
    editingStoreStructureId = walkwayId;
    document.getElementById("storeStructureModalTitle").innerText = "Edit Walkway";
    document.getElementById("storeStructureSubmitBtn").innerText = "Save";
    document.getElementById("storeStructureShelfPickerRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldRow").classList.remove("hidden");
    document.getElementById("storeStructureRowColumnFieldRow").classList.add("hidden");
    document.getElementById("storeStructureLabelFieldLabel").innerText = "Walkway Label";
    setStoreStructureLabelFieldMode(false);
    document.getElementById("storeStructureLabelInput").value = walkway.label;
    document.getElementById("storeStructureModal").classList.remove("hidden");
}

async function deleteStoreStructureItem(endpoint, activityLabel) {
    try {
        const response = await fetch(endpoint, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` }
        });
        if (!response.ok) throw new Error("Request failed");
        await refreshActiveStoreSectionDetail();
        if (storeActiveView === "list") renderStoreSectionListView();
        if (typeof displayNotification === "function") displayNotification("Deleted successfully.", true);
        pushLocalActivityNotification(activityLabel || "Store item deleted.");
    } catch (err) {
        console.error("deleteStoreStructureItem error:", err);
        if (typeof displayNotification === "function") displayNotification("Failed to delete. Try again.", false);
    }
}

function confirmDeleteStoreShelf(shelfId) {
    const shelf = (activeStoreSectionDetail?.shelves || []).find(s => s.id === shelfId);
    const shelfName = shelf ? shelf.name : "";
    if (!confirm(`Delete shelf "${shelfName}"? This also removes its rows and columns.`)) return;
    deleteStoreStructureItem(`${apiUrl}/api/store-shelves/${shelfId}`, `Shelf "${escapeHtml(shelfName)}" deleted.`);
}

function confirmDeleteStoreShelfRow(rowId) {
    if (!confirm("Delete this row?")) return;
    deleteStoreStructureItem(`${apiUrl}/api/store-shelf-rows/${rowId}`, "Row deleted.");
}

function confirmDeleteStoreShelfColumn(columnId) {
    if (!confirm("Delete this column?")) return;
    deleteStoreStructureItem(`${apiUrl}/api/store-shelf-columns/${columnId}`, "Column deleted.");
}

function confirmDeleteStoreWalkway(walkwayId) {
    if (!confirm("Delete this walkway?")) return;
    deleteStoreStructureItem(`${apiUrl}/api/store-walkways/${walkwayId}`, "Walkway deleted.");
}

function closeStoreStructureModal() {
    closeRightSlidePanel("storeStructureModal");
    storeStructureModalMode = null;
    editingStoreStructureId = null;
}

// Mirror of submitStoreroomRowColumnModal for the Store system.
async function submitStoreRowColumnModal() {
    const shelfId = document.getElementById("storeStructureShelfPicker").value;
    const rowLabel = document.getElementById("storeStructureRowInput").value.trim();
    const columnLabel = document.getElementById("storeStructureColumnInput").value.trim();
    if (!shelfId) {
        if (typeof displayNotification === "function") displayNotification("Select a shelf first.", false);
        return;
    }
    if (!rowLabel || !columnLabel) {
        if (typeof displayNotification === "function") displayNotification("Enter both a Row Number and a Column Number.", false);
        return;
    }

    const shelf = (activeStoreSectionDetail?.shelves || []).find(s => String(s.id) === String(shelfId));
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` };

    const submitBtn = document.getElementById("storeStructureSubmitBtn");
    if (submitBtn) submitBtn.disabled = true;

    try {
        // Always POST both, same reasoning as submitStoreroomRowColumnModal
        const rowResponse = await fetch(`${apiUrl}/api/store-shelves/${shelfId}/rows`, { method: "POST", headers, body: JSON.stringify({ label: rowLabel }) });
        if (!rowResponse.ok) {
            const errBody = await rowResponse.json().catch(() => ({}));
            throw new Error(errBody.detail || "Failed to add the row.");
        }
        const columnResponse = await fetch(`${apiUrl}/api/store-shelves/${shelfId}/columns`, { method: "POST", headers, body: JSON.stringify({ label: columnLabel }) });
        if (!columnResponse.ok) {
            const errBody = await columnResponse.json().catch(() => ({}));
            throw new Error(errBody.detail || "Failed to add the column.");
        }
        await refreshActiveStoreSectionDetail();
        closeStoreStructureModal();
        if (storeActiveView === "list") renderStoreSectionListView();
        if (typeof displayNotification === "function") displayNotification("Added successfully.", true);
        pushLocalActivityNotification(`Row "${escapeHtml(rowLabel)}" & Column "${escapeHtml(columnLabel)}" added to shelf "${escapeHtml(shelf?.name || "")}".`);
    } catch (err) {
        console.error("submitStoreRowColumnModal error:", err);
        if (typeof displayNotification === "function") displayNotification(err.message || "Failed to save. Try again.", false);
        await refreshActiveStoreSectionDetail();
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function submitStoreStructureModal() {
    if (storeStructureModalMode === "row_column") {
        await submitStoreRowColumnModal();
        return;
    }

    const label = document.getElementById("storeStructureLabelInput").value.trim();
    if (!label) {
        if (typeof displayNotification === "function") displayNotification("Please enter a name/label.", false);
        return;
    }

    const isEdit = editingStoreStructureId !== null;
    const branch = getCurrentBranch();
    const isRowOrColumn = storeStructureModalMode === "row" || storeStructureModalMode === "column";

    let endpoint, method, body;
    if (storeStructureModalMode === "shelf") {
        if (isEdit) {
            endpoint = `${apiUrl}/api/store-shelves/${editingStoreStructureId}`;
            method = "PUT";
            body = { name: label };
        } else {
            endpoint = `${apiUrl}/api/store/shelves`;
            method = "POST";
            // Stagger the starting position so new shelves don't spawn stacked on top of each other
            const count = activeStoreSectionDetail?.shelves?.length || 0;
            const posX = 40 + (count % 10) * 30;
            const posY = 40 + (count % 10) * 30;
            body = { name: label, branch, color: STORE_SHELF_FIXED_COLOR, pos_x: posX, pos_y: posY };
        }
    } else if (isRowOrColumn) {
        // Only reachable via Edit Row/Edit Column, always a rename of an existing one
        const kindPath = storeStructureModalMode === "row" ? "store-shelf-rows" : "store-shelf-columns";
        endpoint = `${apiUrl}/api/${kindPath}/${editingStoreStructureId}`;
        method = "PUT";
        body = { label };
    } else if (storeStructureModalMode === "walkway") {
        if (isEdit) {
            endpoint = `${apiUrl}/api/store-walkways/${editingStoreStructureId}`;
            method = "PUT";
            body = { label };
        } else {
            endpoint = `${apiUrl}/api/store/walkways`;
            method = "POST";
            body = { label, branch };
        }
    } else {
        return;
    }

    try {
        const response = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.detail || "Request failed");
        }
        const kindName = storeStructureModalMode.charAt(0).toUpperCase() + storeStructureModalMode.slice(1);
        closeStoreStructureModal();
        await refreshActiveStoreSectionDetail();
        if (storeActiveView === "list") renderStoreSectionListView();
        if (typeof displayNotification === "function") displayNotification(isEdit ? "Updated successfully." : "Added successfully.", true);
        pushLocalActivityNotification(`${kindName} "${escapeHtml(label)}" ${isEdit ? "updated" : "added"}.`);
    } catch (err) {
        console.error("submitStoreStructureModal error:", err);
        if (typeof displayNotification === "function") displayNotification(err.message || "Failed to save. Try again.", false);
    }
}

function selectStoreLocation(shelfName, rowLabel, columnLabel) {
    const modal = document.getElementById("storeLocationProductsModal");
    const titleEl = document.getElementById("modalStoreLocationCodeTitle");
    const titlePrintEl = document.getElementById("modalStoreLocationCodeTitlePrint");
    const container = document.getElementById("modalStoreProductListContainer");

    if (!modal || !container) return;

    const titleText = (rowLabel != null && columnLabel != null)
        ? buildLocationCode(shelfName, rowLabel, columnLabel)
        : `${shelfName}${rowLabel != null ? " · Row " + rowLabel : ""}${columnLabel != null ? " · Column " + columnLabel : ""}`;
    titleEl.innerText = titleText;
    if (titlePrintEl) titlePrintEl.innerText = titleText;

    const matchedProducts = systemInventoryDatabase.filter(item => {
        if (String(item.storeShelf) !== String(shelfName)) return false;
        if (rowLabel != null && String(item.storeRow) !== String(rowLabel)) return false;
        if (columnLabel != null && String(item.storeColumn) !== String(columnLabel)) return false;
        return true;
    });
    container.innerHTML = "";

    if (matchedProducts.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-400 font-mono text-xs uppercase font-bold border-2 border-dashed border-[#E6B950]/20 rounded-xl bg-black/20 flex items-center justify-center gap-3">
                <span class="w-3 h-3 rounded-full status-blink shrink-0" style="background:${statusColor("empty")};"></span>
                Empty — No products assigned to this slot.
            </div>`;
    } else {
        matchedProducts.forEach(product => {
            const status = computeStockStatus(product.shelfQuantity, product.lowStockThreshold);
            container.insertAdjacentHTML('beforeend', `
                <div class="flex items-center justify-between gap-4 p-4 bg-black/30 border border-[#E6B950]/15 rounded-xl hover:border-[#E6B950] transition-colors">
                    ${product.photo
                        ? `<img src="${product.photo}" alt="${escapeHtml(product.productName)}" class="w-14 h-14 object-cover rounded-xl border border-[#E6B950]/20 shrink-0">`
                        : `<div class="w-14 h-14 rounded-xl border-2 border-dashed border-[#E6B950]/20 flex items-center justify-center text-xl text-gray-500 shrink-0">📦</div>`}
                    <div class="min-w-0 flex-1">
                        <h4 class="font-black text-white text-sm uppercase truncate">${escapeHtml(product.productName)}</h4>
                        <p class="text-[10px] font-mono font-bold text-gray-500 mt-0.5 uppercase tracking-wide">
                            Barcode: <span class="text-gray-300">${escapeHtml(product.barcode)}</span>
                        </p>
                        <p class="text-[9px] font-bold text-gray-500 uppercase mt-0.5">
                            Branch: <span class="text-gray-400">${escapeHtml(product.branch || "N/A")}</span>
                        </p>
                    </div>
                    <div class="text-right shrink-0 flex items-center gap-3">
                        <div>
                            <span class="text-xs font-black text-gray-500 block uppercase tracking-widest">On Shelf</span>
                            <span class="text-xl font-black text-white font-mono">${product.shelfQuantity} <span class="text-xs font-bold text-gray-400">Pcs</span></span>
                        </div>
                        <span class="w-4 h-4 rounded-full status-blink shrink-0" style="background:${statusColor(status)};" title="${status}"></span>
                    </div>
                </div>
            `);
        });
    }

    modal.classList.remove("hidden");
}

function closeStoreLocationProductsModal() {
    closeRightSlidePanel("storeLocationProductsModal");
}

// Store Operations - Store In/Out: same slide-over/checklist/approval design as the
// Stockroom's modal, scoped to the Store hierarchy. Store In moves stock into shelf_quantity,
// the only way it increases. Store Out only touches the Store side, there's no Store Move.
let activeStoreOperationType = "STORE_IN";
let storeSlideMatchedProduct = null; // last /api/inventory/search-barcode result for the scanned code
let storeSlideStagedChecklist = [];
let storeSlideActiveSectionDetail = null;

// Sidebar Stock In/Out/Move buttons are shared with the regular dashboard, these dispatchers
// route to the Store-specific modal only while Store Management is open
function isStoreManagementScreenActive() {
    const el = document.getElementById("storeManagementContent");
    return !!el && !el.classList.contains("hidden");
}
function handleSidebarStockInClick() {
    if (isStoreManagementScreenActive()) openStoreOperationModal("STORE_IN");
    else openScannerWorkflowModal("IN");
}
function handleSidebarStockOutClick() {
    if (isStoreManagementScreenActive()) openStoreOperationModal("STORE_OUT");
    else openScannerWorkflowModal("OUT");
}
function handleSidebarStockMoveClick() {
    // No Store Move: the sidebar Move button is hidden inside Store Management, so this is Stockroom's Move
    openScannerWorkflowModal("MOVE");
}

function openStoreOperationModal(mode) {
    stopModalAiCam("storeOp");
    activeStoreOperationType = mode;
    storeSlideMatchedProduct = null;
    storeSlideStagedChecklist = [];

    const titles = {
        STORE_IN: "Store IN",
        STORE_OUT: "Store OUT"
    };
    const subs = {
        STORE_IN: "Move stock from the Stockroom reserve onto the shop floor. Add items to checklist, then submit.",
        STORE_OUT: "Remove stock directly from the shop floor (sale, waste, damage, correction)."
    };
    document.getElementById("storeSlideModalTitle").innerText = titles[mode] || "Store Operation Pipeline";
    document.getElementById("storeSlideModalSub").innerText = subs[mode] || "";

    const branchField = document.getElementById("storeSlideLocationSelect");
    if (branchField) branchField.value = getCurrentBranch();

    document.getElementById("storeSlideBarcode").value = "";
    document.getElementById("storeSlideBarcodeStatus").innerText = "";
    document.getElementById("storeSlideAvailableQtyRow").classList.add("hidden");
    document.getElementById("storeSlideExistingLocationRow").classList.add("hidden");
    document.getElementById("storeSlideProductName").value = "";
    document.getElementById("storeSlideProductQty").value = "1";
    document.getElementById("storeSlideReasonInput").value = "";
    setStoreSlideProductPhoto(null);

    document.getElementById("storeSlideAvailableLabel").innerText = mode === "STORE_IN" ? "Available in Stockroom:" : "Currently on Shelf:";
    document.getElementById("storeSlideLocationBox").classList.toggle("hidden", mode === "STORE_OUT");
    document.getElementById("storeSlideReasonRow").classList.toggle("hidden", mode !== "STORE_OUT");

    loadStoreSlideShelfOptions();
    refreshStoreSlideChecklistTableUI();
    renderStoreSlideModalFooterActions();

    const modalWrapper = document.getElementById("storeOperationSlidingModal");
    if (!modalWrapper) return;
    modalWrapper.classList.remove("hidden");
    setTimeout(() => {
        const slideContainer = modalWrapper.querySelector("[class*='translate-x-full']");
        if (slideContainer) {
            slideContainer.classList.remove("translate-x-full");
            slideContainer.classList.add("translate-x-0");
        }
    }, 50);
    setTimeout(() => document.getElementById("storeSlideBarcode")?.focus(), 350);
}

function closeStoreOperationModal() {
    stopModalAiCam("storeOp");
    const modalWrapper = document.getElementById("storeOperationSlidingModal");
    if (!modalWrapper) return;
    const slideContainer = modalWrapper.querySelector("[class*='translate-x-0']");
    if (slideContainer) {
        slideContainer.classList.remove("translate-x-0");
        slideContainer.classList.add("translate-x-full");
    }
    setTimeout(() => modalWrapper.classList.add("hidden"), 300);
}

// Store-Op storage location dropdowns: mirror of the Stockroom helpers, flat per branch
function clearStoreSlideShelfRowColumnInputs() {
    const shelfInput = document.getElementById("storeSlideShelf");
    const rowInput = document.getElementById("storeSlideRow");
    const colInput = document.getElementById("storeSlideColumn");
    if (shelfInput) shelfInput.value = "";
    if (rowInput) rowInput.value = "";
    if (colInput) colInput.value = "";
    document.getElementById("storeSlideShelfOptions").innerHTML = "";
    document.getElementById("storeSlideRowOptions").innerHTML = "";
    document.getElementById("storeSlideColumnOptions").innerHTML = "";
}

async function loadStoreSlideShelfOptions(preserveShelfName) {
    clearStoreSlideShelfRowColumnInputs();
    storeSlideActiveSectionDetail = sortShelfRowsAndColumns(await fetchStoreDetailForBranch(getCurrentBranch()));

    const shelfOptions = document.getElementById("storeSlideShelfOptions");
    shelfOptions.innerHTML = (storeSlideActiveSectionDetail.shelves || [])
        .map(shelf => `<option value="${escapeHtml(shelf.name)}"></option>`).join("");

    if (preserveShelfName) {
        document.getElementById("storeSlideShelf").value = preserveShelfName;
    }
    populateStoreSlideRowColumnForShelf();
}

function populateStoreSlideRowColumnForShelf() {
    const shelfName = document.getElementById("storeSlideShelf")?.value.trim();
    const rowOptions = document.getElementById("storeSlideRowOptions");
    const colOptions = document.getElementById("storeSlideColumnOptions");
    if (!rowOptions || !colOptions) return;
    rowOptions.innerHTML = "";
    colOptions.innerHTML = "";
    if (!storeSlideActiveSectionDetail || !shelfName) return;

    const shelf = (storeSlideActiveSectionDetail.shelves || []).find(s => s.name === shelfName);
    if (!shelf) return;

    rowOptions.innerHTML = (shelf.rows || []).map(r => `<option value="${escapeHtml(r.label)}"></option>`).join("");
    colOptions.innerHTML = (shelf.columns || []).map(c => `<option value="${escapeHtml(c.label)}"></option>`).join("");
}

function handleStoreSlideShelfInput() {
    populateStoreSlideRowColumnForShelf();
}

// Finds or creates the Store Shelf the user typed, so Store In needs no separate "add" step
async function resolveOrCreateStoreShelf(shelfName) {
    const existing = (storeSlideActiveSectionDetail?.shelves || []).find(s => s.name === shelfName);
    if (existing) return existing;

    const side = ((storeSlideActiveSectionDetail?.shelves?.length || 0) % 2 === 0) ? "left" : "right";
    const response = await fetch(`${apiUrl}/api/store/shelves`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ name: shelfName, branch: getCurrentBranch(), color: STORE_SHELF_FIXED_COLOR, side })
    });
    if (!response.ok) throw new Error("Failed to create shelf");
    const created = await response.json();
    const shelfWithChildren = { ...created, rows: [], columns: [] };
    if (!storeSlideActiveSectionDetail) storeSlideActiveSectionDetail = { shelves: [] };
    if (!storeSlideActiveSectionDetail.shelves) storeSlideActiveSectionDetail.shelves = [];
    storeSlideActiveSectionDetail.shelves.push(shelfWithChildren);
    return shelfWithChildren;
}

async function resolveOrCreateStoreRow(shelf, rowLabel) {
    const existing = (shelf.rows || []).find(r => r.label === rowLabel);
    if (existing) return existing;

    const response = await fetch(`${apiUrl}/api/store-shelves/${shelf.id}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ label: rowLabel })
    });
    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || "Failed to create row");
    }
    const created = await response.json();
    if (!shelf.rows) shelf.rows = [];
    shelf.rows.push(created);
    return created;
}

async function resolveOrCreateStoreColumn(shelf, columnLabel) {
    const existing = (shelf.columns || []).find(c => c.label === columnLabel);
    if (existing) return existing;

    const response = await fetch(`${apiUrl}/api/store-shelves/${shelf.id}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ label: columnLabel })
    });
    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || "Failed to create column");
    }
    const created = await response.json();
    if (!shelf.columns) shelf.columns = [];
    shelf.columns.push(created);
    return created;
}

function setStoreSlideProductPhoto(photo) {
    const photoImg = document.getElementById("storeSlideProductPhoto");
    const photoPlaceholder = document.getElementById("storeSlideProductPhotoPlaceholder");
    if (!photoImg || !photoPlaceholder) return;
    if (photo) {
        photoImg.src = photo;
        photoImg.classList.remove("hidden");
        photoPlaceholder.classList.add("hidden");
    } else {
        photoImg.classList.add("hidden");
        photoImg.src = "";
        photoPlaceholder.classList.remove("hidden");
    }
}

// Store only ever operates on a product that already has its own row at this branch (Store In
// pulls from the Stockroom, Out touches what's already on the shelf) - so unlike the Stockroom's
// Stock In, there's no "unknown barcode, create it" path here.
async function handleStoreSlideBarcodeAutoSearch(barcodeVal) {
    const cleanBarcode = (barcodeVal || "").trim();
    const availRow = document.getElementById("storeSlideAvailableQtyRow");
    const availQty = document.getElementById("storeSlideAvailableQty");
    const locationRow = document.getElementById("storeSlideExistingLocationRow");
    const locationText = document.getElementById("storeSlideExistingLocationText");
    const nameField = document.getElementById("storeSlideProductName");
    const statusEl = document.getElementById("storeSlideBarcodeStatus");
    const qtyInput = document.getElementById("storeSlideProductQty");

    storeSlideMatchedProduct = null;
    statusEl.innerText = "";

    if (!cleanBarcode || cleanBarcode.length < 3) {
        availRow.classList.add("hidden");
        nameField.value = "";
        setStoreSlideProductPhoto(null);
        return;
    }

    const branch = getCurrentBranch();
    const token = localStorage.getItem("access_token") || "";

    try {
        const response = await fetch(`${apiUrl}/api/inventory/search-barcode?barcode=${encodeURIComponent(cleanBarcode)}&branch=${encodeURIComponent(branch)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
            availRow.classList.add("hidden");
            nameField.value = "";
            setStoreSlideProductPhoto(null);
            statusEl.innerText = `No product with this barcode at ${branch}. Stock it in first.`;
            return;
        }

        const data = await response.json();
        storeSlideMatchedProduct = data;
        nameField.value = data.name || "";
        setStoreSlideProductPhoto(data.photo);

        if (activeStoreOperationType === "STORE_IN") {
            availQty.innerText = data.stock_quantity ?? 0;
            if (qtyInput) qtyInput.max = String(Math.max(1, data.stock_quantity || 0));
        } else {
            availQty.innerText = data.shelf_quantity ?? 0;
            if (qtyInput) qtyInput.max = String(Math.max(1, data.shelf_quantity || 0));
        }
        availRow.classList.remove("hidden");

        if (data.store_shelf_name) {
            locationText.innerText = buildLocationCode(data.store_shelf_name, data.store_row_number, data.store_column_number);
            locationRow.classList.remove("hidden");
        } else {
            locationRow.classList.add("hidden");
        }
    } catch (err) {
        console.error("handleStoreSlideBarcodeAutoSearch error:", err);
    }
}

async function addStoreSlideEntryToChecklist() {
    const branch = getCurrentBranch();
    const barcode = document.getElementById("storeSlideBarcode")?.value.trim();
    const productName = document.getElementById("storeSlideProductName")?.value.trim();
    const quantity = parseInt(document.getElementById("storeSlideProductQty")?.value) || 0;
    const needsLocation = activeStoreOperationType !== "STORE_OUT";
    const shelfName = needsLocation ? (document.getElementById("storeSlideShelf")?.value.trim() || "") : "";
    const rowLabel = needsLocation ? (document.getElementById("storeSlideRow")?.value.trim() || "") : "";
    const columnLabel = needsLocation ? (document.getElementById("storeSlideColumn")?.value.trim() || "") : "";
    const row = rowLabel ? (parseInt(rowLabel) || null) : null;
    const column = columnLabel ? (parseInt(columnLabel) || null) : null;
    const reason = activeStoreOperationType === "STORE_OUT" ? (document.getElementById("storeSlideReasonInput")?.value.trim() || "") : "";

    if (!storeSlideMatchedProduct || !barcode) {
        if (typeof displayNotification === "function") displayNotification("Scan a barcode already stocked in at this branch first.", false);
        return;
    }
    if (!productName || quantity < 1) {
        if (typeof displayNotification === "function") {
            displayNotification("Fill all required fields: Barcode, Name, Quantity!", false);
        }
        return;
    }

    // Cap against whichever pool this mode draws from, so a batch can't queue more than available
    const cap = activeStoreOperationType === "STORE_IN" ? (storeSlideMatchedProduct.stock_quantity || 0) : (storeSlideMatchedProduct.shelf_quantity || 0);
    if (quantity > cap) {
        if (typeof displayNotification === "function") displayNotification(`Only ${cap} pcs available.`, false);
        return;
    }

    if (needsLocation && shelfName) {
        try {
            const shelf = await resolveOrCreateStoreShelf(shelfName);
            const pending = [];
            if (rowLabel) pending.push(resolveOrCreateStoreRow(shelf, rowLabel));
            if (columnLabel) pending.push(resolveOrCreateStoreColumn(shelf, columnLabel));
            if (pending.length) await Promise.all(pending);
            populateStoreSlideRowColumnForShelf();
        } catch (err) {
            console.error("Store Shelf/Row/Column resolve error:", err);
            if (typeof displayNotification === "function") displayNotification(err.message || "Failed to save the Shelf/Row/Column. Try again.", false);
            return;
        }
    }

    const localTokenId = "STORE-SLD-" + Math.random().toString(36).substr(2, 9).toUpperCase();
    storeSlideStagedChecklist.push({
        localTokenId, barcode, productName, branch, quantity,
        shelf: shelfName || null, row, column,
        reason: reason || null,
    });

    refreshStoreSlideChecklistTableUI();

    // Reset just the per-item fields so the next scan starts clean
    document.getElementById("storeSlideBarcode").value = "";
    document.getElementById("storeSlideBarcodeStatus").innerText = "";
    document.getElementById("storeSlideAvailableQtyRow").classList.add("hidden");
    document.getElementById("storeSlideExistingLocationRow").classList.add("hidden");
    document.getElementById("storeSlideProductName").value = "";
    document.getElementById("storeSlideProductQty").value = "1";
    document.getElementById("storeSlideReasonInput").value = "";
    setStoreSlideProductPhoto(null);
    storeSlideMatchedProduct = null;
    document.getElementById("storeSlideBarcode")?.focus();
}

function refreshStoreSlideChecklistTableUI() {
    const tableBody = document.getElementById("storeSlideChecklistBatchTableBody");
    const badge = document.getElementById("storeSlideChecklistCountBadge");
    if (!tableBody) return;

    if (badge) badge.innerText = `${storeSlideStagedChecklist.length} Items`;

    if (storeSlideStagedChecklist.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 font-mono font-bold uppercase tracking-wide">No data packages staged in current batch sequence.</td></tr>`;
        return;
    }

    tableBody.innerHTML = "";
    storeSlideStagedChecklist.forEach(item => {
        let locationText = "&mdash;";
        if (item.shelf) {
            let shelfPart = item.shelf;
            if (item.row != null || item.column != null) {
                const r = item.row != null ? String(item.row).padStart(2, "0") : "--";
                const c = item.column != null ? String(item.column).padStart(2, "0") : "--";
                shelfPart += `${r}${c}`;
            }
            locationText = escapeHtml(shelfPart);
        } else if (item.reason) {
            locationText = escapeHtml(item.reason);
        }
        tableBody.insertAdjacentHTML('beforeend', `
            <tr class="hover:bg-white/5 border-b border-[#E6B950]/10 transition-colors">
                <td class="p-3 font-mono font-black text-white text-sm">${escapeHtml(item.barcode)}</td>
                <td class="p-3">
                    <div class="font-black text-white uppercase text-xs leading-tight">${escapeHtml(item.productName)}</div>
                    <div class="text-[10px] font-bold text-gray-500 uppercase mt-0.5">${activeStoreOperationType} | ${escapeHtml(item.branch)}</div>
                </td>
                <td class="p-3 text-center font-black font-mono text-xl text-white">${item.quantity}</td>
                <td class="p-3 text-center font-mono text-xs font-bold text-amber-400 bg-amber-950/20">${locationText}</td>
                <td class="p-3 text-center">
                    <button type="button" onclick="purgeStoreSlideStagedItem('${item.localTokenId}')"
                        class="text-red-400 hover:text-red-300 font-black text-xs uppercase bg-red-950/30 border border-red-500/30 px-3 py-1.5 rounded-lg transition-all">
                        Remove
                    </button>
                </td>
            </tr>
        `);
    });
}

function purgeStoreSlideStagedItem(token) {
    storeSlideStagedChecklist = storeSlideStagedChecklist.filter(i => i.localTokenId !== token);
    refreshStoreSlideChecklistTableUI();
}

function renderStoreSlideModalFooterActions() {
    const footer = document.getElementById("storeSlideModalFooterContainer");
    if (!footer) return;

    const isManager = isCurrentUserManager();
    const labels = { STORE_IN: "Store In", STORE_OUT: "Store Out" };
    const label = labels[activeStoreOperationType] || "Store Operation";

    if (isManager) {
        footer.innerHTML = `
            <button type="button" onclick="closeStoreOperationModal()"
                class="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-black uppercase tracking-widest py-3 px-6 rounded-xl border border-zinc-700 transition-all">
                Cancel
            </button>
            <button type="button" onclick="dispatchStoreManagerBatch()"
                class="w-full sm:w-auto bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 text-xs sm:text-base font-black uppercase tracking-widest py-3.5 px-8 rounded-xl transition-all shadow-md active:scale-95">
                ${label} Directly &#9889;
            </button>
        `;
    } else {
        footer.innerHTML = `
            <button type="button" onclick="closeStoreOperationModal()"
                class="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-black uppercase tracking-widest py-3 px-6 rounded-xl border border-zinc-700 transition-all">
                Cancel
            </button>
            <button type="button" onclick="dispatchStoreStaffBatch()"
                class="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-base font-black uppercase tracking-widest py-3.5 px-8 rounded-xl transition-all shadow-md active:scale-95">
                Save for Manager Approval &#128190;
            </button>
        `;
    }
}

// Builds the endpoint pair + payload for whichever Store mode is active, shared by staff/manager dispatch
function buildStoreOpRequest(item) {
    if (activeStoreOperationType === "STORE_IN") {
        return {
            evaluateEndpoint: "/api/inventory/store-in-evaluate", directEndpoint: "/api/inventory/store-in",
            payload: {
                barcode: item.barcode, branch: item.branch, quantity: item.quantity,
                store_shelf_name: item.shelf || null,
                store_row_number: item.row, store_column_number: item.column
            }
        };
    }
    return {
        evaluateEndpoint: "/api/inventory/store-out-evaluate", directEndpoint: "/api/inventory/store-out",
        payload: { barcode: item.barcode, branch: item.branch, quantity: item.quantity, reason: item.reason || null }
    };
}

async function dispatchStoreStaffBatch() {
    if (storeSlideStagedChecklist.length === 0) {
        if (typeof displayNotification === "function") displayNotification("No items in checklist!", false);
        return;
    }

    const token = localStorage.getItem("access_token") || "";
    let successCount = 0;
    const total = storeSlideStagedChecklist.length;

    for (const item of storeSlideStagedChecklist) {
        const { evaluateEndpoint, payload } = buildStoreOpRequest(item);
        try {
            const response = await fetch(`${apiUrl}${evaluateEndpoint}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (response.ok) successCount++;
            else {
                const err = await response.json().catch(() => ({}));
                console.error("Store staff submit error:", err.detail || response.status);
            }
        } catch (err) {
            console.error("Network error:", err);
        }
    }

    if (typeof displayNotification === "function") {
        displayNotification(`${successCount}/${total} items submitted for Manager Approval.`, successCount > 0);
    }
    // Stay on the screen after submit, just clear the checklist for the next batch
    storeSlideStagedChecklist = [];
    refreshStoreSlideChecklistTableUI();
    fetchInventoryData();
    fetchStoreManagementStats();
}

async function dispatchStoreManagerBatch() {
    if (storeSlideStagedChecklist.length === 0) {
        if (typeof displayNotification === "function") displayNotification("No items in checklist!", false);
        return;
    }

    const token = localStorage.getItem("access_token") || "";
    let successCount = 0;
    const total = storeSlideStagedChecklist.length;

    for (const item of storeSlideStagedChecklist) {
        const { directEndpoint, payload } = buildStoreOpRequest(item);
        try {
            const response = await fetch(`${apiUrl}${directEndpoint}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                successCount++;
            } else {
                const errData = await response.json().catch(() => ({}));
                if (typeof displayNotification === "function") {
                    displayNotification(`${item.productName}: ${errData.detail || "Server error"}`, false);
                }
            }
        } catch (err) {
            console.error("Network error:", err);
        }
    }

    if (typeof displayNotification === "function") {
        displayNotification(`${successCount}/${total} items processed directly!`, successCount > 0);
    }
    storeSlideStagedChecklist = [];
    refreshStoreSlideChecklistTableUI();
    fetchInventoryData();
    fetchStoreManagementStats();
    if (typeof refreshActiveStoreSectionDetail === "function") await refreshActiveStoreSectionDetail();
}

// Per-product low stock alert threshold (management only), replaces the old fixed rule everywhere
let alertThresholdTargetProductId = null;

function openSetAlertThresholdModal(productId, productName, currentThreshold, currentFullStock) {
    alertThresholdTargetProductId = productId;
    const nameEl = document.getElementById("alertThresholdProductName");
    const inputEl = document.getElementById("alertThresholdInput");
    const fullStockEl = document.getElementById("fullStockQuantityInput");
    if (nameEl) nameEl.innerText = productName;
    if (inputEl) inputEl.value = currentThreshold != null ? currentThreshold : "";
    if (fullStockEl) fullStockEl.value = currentFullStock != null ? currentFullStock : "";
    openRightSlidePanel("setAlertThresholdModal");
}

function closeSetAlertThresholdModal() {
    closeRightSlidePanel("setAlertThresholdModal");
    alertThresholdTargetProductId = null;
}

async function submitSetAlertThreshold() {
    if (!alertThresholdTargetProductId) return;

    const raw = (document.getElementById("alertThresholdInput")?.value || "").trim();
    const threshold = raw === "" ? null : parseInt(raw, 10);
    const fullStockRaw = (document.getElementById("fullStockQuantityInput")?.value || "").trim();
    const fullStockQuantity = fullStockRaw === "" ? null : parseInt(fullStockRaw, 10);

    if (raw !== "" && (isNaN(threshold) || threshold < 0)) {
        if (typeof displayNotification === "function") displayNotification("Enter a valid non-negative number, or leave it empty to turn alerts off.", false);
        return;
    }
    if (fullStockRaw !== "" && (isNaN(fullStockQuantity) || fullStockQuantity < 0)) {
        if (typeof displayNotification === "function") displayNotification("Enter a valid non-negative full stock quantity, or leave it empty.", false);
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/api/products/${alertThresholdTargetProductId}/alert-threshold`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ low_stock_threshold: threshold, full_stock_quantity: fullStockQuantity })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to save alert threshold.");
        }

        closeSetAlertThresholdModal();
        await fetchInventoryData();
        fetchDashboardStats();

        // Re-render the location popup so the badge/status dot reflects the new value immediately
        if (lastSelectedLocation) {
            selectLocation(lastSelectedLocation.shelfName, lastSelectedLocation.rowLabel, lastSelectedLocation.columnLabel);
        }

        if (typeof displayNotification === "function") displayNotification("Alert threshold saved.", true);
    } catch (err) {
        console.error("submitSetAlertThreshold error:", err);
        if (typeof displayNotification === "function") displayNotification(err.message || "Failed to save.", false);
    }
}

// Header search: live results dropdown, or jump straight to shelf on exact barcode
function getSearchDropdownId(inputId) {
    return "mobileSearchResultsDropdown";
}

function clearSearchInputs() {
    const headerSearch = document.getElementById("mobileHeaderSearchInput");
    if (headerSearch) headerSearch.value = "";
}

function hideSearchDropdowns() {
    document.getElementById("mobileSearchResultsDropdown")?.classList.add("hidden");
}

function handleBarcodeSearchStreamInput(rawInput, inputId) {
    clearTimeout(barcodeScannerKeyboardInputDebounceTimerId);
    barcodeScannerKeyboardInputDebounceTimerId = setTimeout(() => {
        executeLiveSearch(rawInput || "", inputId);
    }, 250);
}

async function executeLiveSearch(rawValue, inputId) {
    const query = (rawValue || "").trim();
    const dropdown = inputId ? document.getElementById(getSearchDropdownId(inputId)) : null;

    if (!query) {
        hideSearchDropdowns();
        return;
    }

    // An exact barcode match resolves immediately: same branch jumps to the map, other branches show the popup
    const exactBarcodeMatches = systemInventoryDatabase.filter(item => item.barcode === query);
    if (exactBarcodeMatches.length > 0) {
        pendingScannedCodeCache = query;
        resolveSearchedBarcode(query, exactBarcodeMatches);
        return;
    }

    if (!dropdown) {
        // No dropdown to render into: only act on genuine barcode-shaped input (e.g. a USB scanner)
        if (query.length >= 4) {
            pendingScannedCodeCache = query;
            // Not in this system - check Lightspeed's own catalog before deciding what to show:
            // a real hit there routes into Add Stock with the real name, nothing at all
            // (neither system) triggers the "Product Not Found" alert instead.
            const [lightspeedMatch] = await lookupLightspeedCatalog(query);
            if (lightspeedMatch) {
                openNewProductRegistrationPopup(query, lightspeedMatch.name);
            } else {
                openBarcodeNotInSystemModal();
            }
        }
        return;
    }

    const lowerQuery = query.toLowerCase();
    const currentBranch = getCurrentBranch();
    let matches = systemInventoryDatabase.filter(item =>
        item.barcode.toLowerCase().includes(lowerQuery) ||
        (item.productName || "").toLowerCase().includes(lowerQuery)
    );

    // Store Management only surfaces its own shelf's products, not Stockroom or other branches
    if (isStoreManagementActive()) {
        matches = matches.filter(item =>
            item.storeShelf != null && (item.branch || "").trim().toLowerCase() === currentBranch.trim().toLowerCase()
        );
    }

    if (matches.length > 0) {
        renderSearchResultsDropdown(dropdown, matches.slice(0, 8), query);
        return;
    }

    // Nothing in our own inventory - fall back to Lightspeed's catalog so staff still see the
    // real product name (and can Add Stock for it) instead of a dead-end "no results".
    const lightspeedMatches = await lookupLightspeedCatalog(query);
    // A newer keystroke may have already changed the input while that lookup was in flight -
    // don't clobber its (possibly already-rendered) dropdown with this stale response.
    const inputEl = inputId ? document.getElementById(inputId) : null;
    if (inputEl && inputEl.value.trim() !== query) return;
    renderSearchResultsDropdown(dropdown, [], query, lightspeedMatches);
}

// The single place that decides what "found it" means: a row at the current branch jumps to
// its shelf, a row only at other branches shows the cross-branch popup instead. AMS-0000
// isn't tied to any branch, so it always gets the cross-branch view.
function resolveSearchedBarcode(barcode, matchesForBarcode) {
    clearSearchInputs();
    hideSearchDropdowns();

    const currentBranch = getCurrentBranch();

    // Store Management only ever shows this branch's Store placement, never Stockroom or another branch
    if (isStoreManagementActive()) {
        const branchMatches = matchesForBarcode.filter(item => (item.branch || "").trim().toLowerCase() === currentBranch.trim().toLowerCase());
        const storeMatch = branchMatches.find(item => item.storeShelf != null);
        if (storeMatch) {
            routeToStoreLocation(storeMatch);
        } else if (branchMatches.length > 0) {
            promptAddToStoreForProduct(branchMatches[0]);
        } else {
            openNewProductRegistrationPopup(barcode);
        }
        return;
    }

    const isSpecialNoStoreroomAccount = isChairmanAccount();
    const hereMatch = !isSpecialNoStoreroomAccount &&
        matchesForBarcode.find(item => (item.branch || "").trim().toLowerCase() === currentBranch.trim().toLowerCase());

    if (hereMatch) {
        routeUserDirectToLocationMapGrid(hereMatch);
    } else if (matchesForBarcode.length > 0) {
        showCrossBranchAvailabilityPopup(barcode, matchesForBarcode, isSpecialNoStoreroomAccount ? null : currentBranch);
    } else {
        openNewProductRegistrationPopup(barcode);
    }
}

function renderSearchResultsDropdown(dropdown, matches, query, lightspeedMatches) {
    if (matches.length === 0) {
        if (lightspeedMatches && lightspeedMatches.length > 0) {
            // Known to Lightspeed but not stocked in this system yet - selecting one routes
            // straight into the same "Add Stock" popup a resolved local match would.
            dropdown.innerHTML = lightspeedMatches.map(item => `
                <button type="button" onclick="handleLightspeedSearchResultClick('${escapeHtml(item.barcode || "")}', '${escapeHtml(item.name || "")}')" class="w-full text-left p-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-0 flex items-center justify-between gap-3 transition-colors">
                    <div class="min-w-0">
                        <div class="font-black text-zinc-900 text-sm truncate">${escapeHtml(item.name || "")}</div>
                        <div class="text-[10px] font-mono text-zinc-400 truncate">${escapeHtml(item.barcode || "")}</div>
                    </div>
                    <div class="text-[10px] font-black text-amber-600 uppercase shrink-0">Not stocked · Add Stock</div>
                </button>
            `).join("");
            dropdown.classList.remove("hidden");
            return;
        }

        const looksLikeBarcode = /^\d{4,}$/.test(query);
        dropdown.innerHTML = looksLikeBarcode
            ? `<button type="button" onclick="handleSearchDropdownRegisterNew('${escapeHtml(query)}')" class="w-full text-left p-3 hover:bg-zinc-50 transition-colors">
                   <span class="text-amber-600 font-black text-xs uppercase">+ Register "${escapeHtml(query)}" as new product</span>
               </button>`
            : `<div class="p-3 text-xs text-zinc-400 font-bold uppercase text-center">No matching products found.</div>`;
        dropdown.classList.remove("hidden");
        return;
    }

    dropdown.innerHTML = matches.map(item => `
        <button type="button" onclick="handleSearchResultClick('${escapeHtml(item.barcode)}')" class="w-full text-left p-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-0 flex items-center justify-between gap-3 transition-colors">
            <div class="min-w-0">
                <div class="font-black text-zinc-900 text-sm truncate">${escapeHtml(item.productName)}</div>
                <div class="text-[10px] font-mono text-zinc-400 truncate">${escapeHtml(item.barcode)} &middot; ${escapeHtml(item.branch || "")}</div>
            </div>
            <div class="text-xs font-black text-zinc-600 shrink-0">${item.availableQty} pcs</div>
        </button>
    `).join("");
    dropdown.classList.remove("hidden");
}

function handleSearchResultClick(barcode) {
    const matches = systemInventoryDatabase.filter(p => p.barcode === barcode);
    if (matches.length === 0) return;
    resolveSearchedBarcode(barcode, matches);
}

function handleLightspeedSearchResultClick(barcode, name) {
    clearSearchInputs();
    hideSearchDropdowns();
    pendingScannedCodeCache = barcode;
    openNewProductRegistrationPopup(barcode, name);
}

function handleSearchDropdownRegisterNew(barcode) {
    clearSearchInputs();
    hideSearchDropdowns();
    pendingScannedCodeCache = barcode;
    openNewProductRegistrationPopup(barcode);
}

// Cross-Branch Availability popup: shown when a barcode isn't at the current branch but is at others
function showCrossBranchAvailabilityPopup(barcode, matchesForBarcode, currentBranch) {
    const subtitleEl = document.getElementById("crossBranchModalSubtitle");
    const nameEl = document.getElementById("crossBranchProductName");
    const container = document.getElementById("crossBranchCardsContainer");
    if (!container) return;

    const productName = matchesForBarcode[0]?.productName || "This product";
    if (subtitleEl) subtitleEl.innerText = currentBranch ? `Not stocked at ${currentBranch}` : "Available at the following locations";
    if (nameEl) nameEl.innerText = `${productName} (${barcode})`;

    container.innerHTML = matchesForBarcode.map(item => {
        const sourceBranch = item.branch || "";
        // Warehouse is the central stock depot (not a retail branch), so pulling from it
        // reads as a normal "Stock In" to staff - any other branch is worded as a "Move"
        // (an inter-branch transfer). Both buttons drive the exact same Stock Move
        // mechanism (there's no other way to pull existing stock from a specific branch).
        const isWarehouse = sourceBranch.trim().toLowerCase() === "warehouse";
        const actionLabel = isWarehouse ? `Stock In from ${escapeHtml(sourceBranch)}` : `Stock Move from ${escapeHtml(sourceBranch)}`;
        const actionBtn = (currentBranch && sourceBranch)
            ? `<button type="button" onclick="initiateStockMoveFromCrossBranch('${escapeHtml(barcode)}', '${escapeHtml(sourceBranch)}')" class="mt-2 w-full text-[10px] font-black uppercase tracking-widest py-2 px-3 rounded-lg bg-gradient-to-r from-[#C99A2E] via-[#D4AF37] to-[#E6B950] text-black hover:brightness-110 transition-all">${actionLabel}</button>`
            : "";
        return `
        <div class="p-4 bg-black/30 border border-[#E6B950]/15 rounded-xl">
            <div class="flex items-center justify-between gap-4">
                <div class="min-w-0">
                    <h4 class="font-black text-white text-sm uppercase truncate">${escapeHtml(sourceBranch || "Unknown Branch")}</h4>
                    <p class="text-[10px] font-bold text-gray-500 uppercase mt-0.5">
                        ${item.shelf ? escapeHtml(buildLocationCode(item.shelf, item.row, item.column)) : "-"}
                    </p>
                </div>
                <div class="text-right shrink-0">
                    <span class="text-lg font-black text-[#E6B950] font-mono">${item.availableQty}</span>
                    <span class="text-[10px] font-bold text-gray-400 uppercase block">pcs</span>
                </div>
            </div>
            ${actionBtn}
        </div>
    `;
    }).join("");

    openRightSlidePanel("crossBranchAvailabilityModal");
}

// From the cross-branch popup: jumps straight into Stock Move with From/To/barcode
// pre-filled, so the user doesn't have to re-enter what this popup already found.
function initiateStockMoveFromCrossBranch(barcode, sourceBranch) {
    const destinationBranch = getCurrentBranch();
    closeCrossBranchAvailabilityModal();

    pendingScannedCodeCache = null; // avoid racing our own prefill below with the modal's own
    openScannerWorkflowModal("MOVE");

    const fromField = document.getElementById("slideMoveFrom");
    const toField = document.getElementById("slideMoveTo");
    const barcodeField = document.getElementById("slideBarcodeMove");
    if (fromField) fromField.value = sourceBranch;
    if (toField) {
        toField.value = destinationBranch;
        if (typeof populateSlideStoreroomOptions === "function") populateSlideStoreroomOptions();
    }
    if (barcodeField) {
        barcodeField.value = barcode;
        handleSlideBarcodeAutoSearch(barcode);
    }
}

function closeCrossBranchAvailabilityModal() {
    closeRightSlidePanel("crossBranchAvailabilityModal");
}

document.addEventListener("click", (e) => {
    if (e.target.closest("#mobileHeaderSearchInput, #mobileSearchResultsDropdown")) return;
    hideSearchDropdowns();
});

// Dispatches to wherever the product is placed: a stockroom slot or a Store slot, never both
async function routeUserDirectToLocationMapGrid(product) {
    if (product.storeroom != null) {
        await routeToStockroomLocation(product);
    } else if (product.storeShelf != null) {
        await routeToStoreLocation(product);
    } else if (typeof displayNotification === "function") {
        displayNotification("Could not locate this product on the map - it isn't placed in a stockroom or on the shop floor yet.", false);
    }
}

async function routeToStockroomLocation(product) {
    const currentBranch = getCurrentBranch();
    const isSameBranch = (product.branch || "").trim().toLowerCase() === currentBranch.trim().toLowerCase();
    const banner = document.getElementById("storeroomBranchMismatchBanner");

    let storeroomsForLookup = currentStoreroomsList;
    if (!isSameBranch) {
        storeroomsForLookup = await fetchStoreroomsForBranch(product.branch || currentBranch);
    }
    const storeroom = storeroomsForLookup.find(sr => sr.id === product.storeroom);

    if (!storeroom) {
        if (typeof displayNotification === "function") {
            displayNotification("Could not locate this product's stockroom on the map.", false);
        }
        return;
    }

    await openStoreroomMap(storeroom.id);

    if (banner) {
        if (isSameBranch) {
            banner.classList.add("hidden");
            banner.innerText = "";
        } else {
            banner.innerText = `⚠ Not available at ${currentBranch} — available at ${product.branch}`;
            banner.classList.remove("hidden");
        }
    }

    injectLiveSystemProductOverlayPanel(product);
    triggerShelfSlotAlert(product.shelf, String(product.row), String(product.column), product.availableQty, product.lowStockThreshold);
}

// Store has no per-ID fetch like Stockroom's, it's always one flat map for the current branch
async function routeToStoreLocation(product) {
    openStoreManagementSection();
    await loadStoreBranchMap();
    injectLiveSystemStoreProductOverlayPanel(product);
    triggerStoreShelfSlotAlert(product.storeShelf, String(product.storeRow), String(product.storeColumn), product.shelfQuantity, product.lowStockThreshold);
}

// "Not on the shelf yet": drops the user into the Store In form with the barcode pre-filled
function promptAddToStoreForProduct(product) {
    openStoreOperationModal("STORE_IN");
    const barcodeField = document.getElementById("storeSlideBarcode");
    if (barcodeField) {
        barcodeField.value = product.barcode;
        handleStoreSlideBarcodeAutoSearch(product.barcode);
    }
    if (typeof displayNotification === "function") {
        displayNotification(`"${product.productName}" isn't on the shop floor yet - add it to Store below.`, false);
    }
}

// containerId scopes the lookup to one map, since Stockroom and Store share the same cell attributes
function findLocationCell(shelfName, rowLabel, columnLabel, containerId) {
    const scope = containerId ? document.getElementById(containerId) : document;
    if (!scope) return null;
    return scope.querySelector(
        `.location-cell[data-shelf-name="${CSS.escape(String(shelfName))}"][data-row="${CSS.escape(String(rowLabel))}"][data-column="${CSS.escape(String(columnLabel))}"]`
    );
}

function clearShelfSlotAlert() {
    // Strip the pulsing state off whichever cell has it
    document.querySelectorAll(".location-cell-found").forEach(cell => {
        cell.classList.remove("location-cell-found");
        cell.style.removeProperty("--found-glow-color");
    });
    // Clear both Stockroom's and Store's spotlight, cheap and avoids tracking which one is on
    const storeroomSection = document.getElementById("storeroomMapSection");
    storeroomSection?.classList.remove("storeroom-spotlight-active");
    storeroomSection?.style.removeProperty("--found-glow-color");
    const storeSection = document.getElementById("storeSectionMapSection");
    storeSection?.classList.remove("store-section-spotlight-active");
    storeSection?.style.removeProperty("--found-glow-color");
    if (activeShelfBeepInterval) { clearInterval(activeShelfBeepInterval); activeShelfBeepInterval = null; }
    if (activeShelfBeepTimeout) { clearTimeout(activeShelfBeepTimeout); activeShelfBeepTimeout = null; }
}

function triggerShelfSlotAlert(shelfName, rowLabel, columnLabel, quantity, lowStockThreshold) {
    clearShelfSlotAlert();
    setTimeout(() => {
        const cell = findLocationCell(shelfName, rowLabel, columnLabel, "storeroomMapBox");
        if (!cell) return;
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Pulse + glow directly on the cell, colored by its stock status
        const status = computeStockStatus(quantity, lowStockThreshold);
        const glowColor = statusColor(status);
        cell.style.setProperty("--found-glow-color", glowColor);
        cell.classList.add("location-cell-found");

        // Light up the whole stockroom to spotlight the product, cleared after 8s below
        const storeroomSection = document.getElementById("storeroomMapSection");
        storeroomSection?.style.setProperty("--found-glow-color", glowColor);
        storeroomSection?.classList.add("storeroom-spotlight-active");

        if (typeof playScannerBeep === "function") playScannerBeep();
        activeShelfBeepInterval = setInterval(() => {
            if (typeof playScannerBeep === "function") playScannerBeep();
        }, 1200);
        activeShelfBeepTimeout = setTimeout(() => clearShelfSlotAlert(), 8000);
    }, 350);
}

// Store mirror of triggerShelfSlotAlert above, scoped to the Store map/section instead
function triggerStoreShelfSlotAlert(shelfName, rowLabel, columnLabel, quantity, lowStockThreshold) {
    clearShelfSlotAlert();
    setTimeout(() => {
        const cell = findLocationCell(shelfName, rowLabel, columnLabel, "storeSectionMapBox");
        if (!cell) return;
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const status = computeStockStatus(quantity, lowStockThreshold);
        const glowColor = statusColor(status);
        cell.style.setProperty("--found-glow-color", glowColor);
        cell.classList.add("location-cell-found");

        const storeSection = document.getElementById("storeSectionMapSection");
        storeSection?.style.setProperty("--found-glow-color", glowColor);
        storeSection?.classList.add("store-section-spotlight-active");

        if (typeof playScannerBeep === "function") playScannerBeep();
        activeShelfBeepInterval = setInterval(() => {
            if (typeof playScannerBeep === "function") playScannerBeep();
        }, 1200);
        activeShelfBeepTimeout = setTimeout(() => clearShelfSlotAlert(), 8000);
    }, 350);
}

function injectLiveSystemProductOverlayPanel(product) {
    const old = document.getElementById("liveScannedProductOverlayStrip");
    if (old) old.remove();

    const mapSection = document.getElementById("storeroomMapSection");
    if (!mapSection) return;

    const storeroomLabel = activeStoreroomDetail ? activeStoreroomDetail.name : product.storeroom;

    const strip = document.createElement("div");
    strip.id = "liveScannedProductOverlayStrip";
    strip.className = "w-full bg-zinc-950 text-white p-6 rounded-2xl border-4 border-[#E6B950] shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6";
    strip.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-3xl">&#128230;</div>
            <div>
                <span class="text-[9px] font-mono font-black tracking-widest text-[#E6B950] uppercase bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 block mb-1">BARCODE: ${escapeHtml(product.barcode)}</span>
                <h2 class="text-2xl font-black uppercase tracking-tight text-white">${escapeHtml(product.productName)}</h2>
            </div>
        </div>
        <div class="flex flex-wrap gap-3">
            <div>
                <span class="text-[9px] font-black uppercase text-zinc-500 block">Available</span>
                <span class="text-3xl font-black text-[#E6B950]">${product.availableQty} <span class="text-xs text-zinc-400">Units</span></span>
            </div>
            <div class="text-xs font-mono font-black text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/60 self-center">
                ${escapeHtml(storeroomLabel)} · ${escapeHtml(buildLocationCode(product.shelf, product.row, product.column))}
            </div>
        </div>
    `;
    mapSection.insertAdjacentElement("afterbegin", strip);
}

// Store mirror of injectLiveSystemProductOverlayPanel above
function injectLiveSystemStoreProductOverlayPanel(product) {
    const old = document.getElementById("liveScannedProductOverlayStrip");
    if (old) old.remove();

    const mapSection = document.getElementById("storeSectionMapSection");
    if (!mapSection) return;

    const strip = document.createElement("div");
    strip.id = "liveScannedProductOverlayStrip";
    strip.className = "w-full bg-zinc-950 text-white p-6 rounded-2xl border-4 border-[#E6B950] shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6";
    strip.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-3xl">&#128230;</div>
            <div>
                <span class="text-[9px] font-mono font-black tracking-widest text-[#E6B950] uppercase bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 block mb-1">BARCODE: ${escapeHtml(product.barcode)}</span>
                <h2 class="text-2xl font-black uppercase tracking-tight text-white">${escapeHtml(product.productName)}</h2>
            </div>
        </div>
        <div class="flex flex-wrap gap-3">
            <div>
                <span class="text-[9px] font-black uppercase text-zinc-500 block">On Shelf</span>
                <span class="text-3xl font-black text-[#E6B950]">${product.shelfQuantity} <span class="text-xs text-zinc-400">Units</span></span>
            </div>
            <div class="text-xs font-mono font-black text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/60 self-center">
                ${escapeHtml(buildLocationCode(product.storeShelf, product.storeRow, product.storeColumn))}
            </div>
        </div>
    `;
    mapSection.insertAdjacentElement("afterbegin", strip);
}

function openNewProductRegistrationPopup(barcode, name) {
    const badge = document.getElementById("unresolvedBarcodeBadge");
    const badgeLabel = document.getElementById("unresolvedBarcodeBadgeLabel");
    if (!badge) return;
    // Show whichever the caller has (name or barcode), labeled accordingly
    if (name) {
        if (badgeLabel) badgeLabel.innerText = "AI Detected Name";
        badge.innerText = name;
    } else {
        if (badgeLabel) badgeLabel.innerText = "Scanned Code Token ID";
        badge.innerText = barcode;
    }
    openRightSlidePanel("newProductRoutingRegistrationModal");
}

function closeNewProductModal() {
    closeRightSlidePanel("newProductRoutingRegistrationModal");
}

function handleDirectStockInRoutingForwarding() {
    closeNewProductModal();
    openScannerWorkflowModal('IN');
    setTimeout(() => {
        const barcodeField = document.getElementById("slideBarcode");
        if (barcodeField && pendingScannedCodeCache) barcodeField.value = pendingScannedCodeCache;
    }, 350);
}

// Global USB scanner: catches typing outside any input
let barcodeBuffer = "";
let barcodeTimeoutId = null;

document.addEventListener("keydown", (e) => {
    const dashboard = document.getElementById("dashboardSection");
    if (!dashboard || dashboard.classList.contains("hidden")) return;

    const tag = document.activeElement ? document.activeElement.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!e.key) return;

    if (e.key === "Enter") {
        e.preventDefault();
        if (barcodeBuffer.length > 3) executeLiveSearch(barcodeBuffer);
        barcodeBuffer = "";
    } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
    }

    clearTimeout(barcodeTimeoutId);
    barcodeTimeoutId = setTimeout(() => { barcodeBuffer = ""; }, 1000);
});

// Close overlays on outside click
window.addEventListener("click", (e) => {
    const notifDropdown = document.getElementById("notificationDropdownMenu");
    if (notifDropdown && !notifDropdown.contains(e.target) && !e.target.closest('[onclick*="toggleNotificationDropdown"]')) {
        notifDropdown.classList.add("hidden");
    }
});

// Init
document.addEventListener("DOMContentLoaded", () => {
    startLiveDashboardClock();
    renderNotificationListUI();
    restoreSessionIfAvailable();
    updateMustStockNextMonthLabel();
    initDashboardCardDragReorder();
    // Primes speechSynthesis voices early, since Chromium loads them lazily
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
});

// Must Stock card's calendar icon: always the real next month, computed live
function updateMustStockNextMonthLabel() {
    const el = document.getElementById("mustStockNextMonthLabel");
    if (!el) return;
    const now = new Date();
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    el.innerText = nextMonthDate.toLocaleString("en-US", { month: "short" }).toUpperCase();
}

// Restores an already-logged-in session after a page reload, instead of dropping back to login
async function restoreSessionIfAvailable() {
    // A pending Till "Inventory" handoff already owns this load's routing, skip to avoid racing it
    if (new URLSearchParams(window.location.search).get("handoff")) return;

    const token = localStorage.getItem("access_token");
    const username = localStorage.getItem("username");
    // Only restore if THIS tab logged in (sessionStorage doesn't survive opening a new
    // tab/window). Without this check, a leftover access_token from a previous visit would
    // silently log a fresh direct visit straight into the dashboard, skipping the login screen.
    const activeInThisTab = sessionStorage.getItem("amsons_session_active");
    if (!token || !username || !activeInThisTab) {
        if (token || username) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("username");
            localStorage.removeItem("active_storeroom_id");
        }
        return;
    }

    sessionToken = token;
    await loadAuthenticatedUserProfile(username);

    const rawLocation = localStorage.getItem("selected_location_raw");
    if (rawLocation && typeof selectTerminalLocation === "function") {
        selectTerminalLocation(rawLocation);
    }

    // AMS-0000 has no storeroom access, never auto-reopen a leftover storeroom map for it
    const activeStoreroomIdRaw = localStorage.getItem("active_storeroom_id");
    if (activeStoreroomIdRaw && !isChairmanAccount()) {
        await openStoreroomMap(parseInt(activeStoreroomIdRaw, 10));
    }
}


const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playBeepSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800Hz tone
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
}

// AI Voice Assistant: backend is stateless, this array holds the conversation, resent each turn
let aiAssistantHistory = [];
let aiAssistantMuted = false;
let aiAssistantPendingAction = null;
let aiAssistantBusy = false;
let aiAssistantRecognition = null;
let aiAssistantListening = false;
// Set on first open per page load, so the welcome bubble appears only once per session
let aiAssistantWelcomed = false;
const AI_ASSISTANT_MAX_HISTORY = 12;

function toggleAiAssistantWidget() {
    const modal = document.getElementById("aiAssistantModal");
    if (!modal) return;
    if (modal.classList.contains("hidden")) {
        openRightSlidePanel("aiAssistantModal");
        const badge = document.getElementById("aiAssistantBranchBadge");
        if (badge) badge.innerText = getCurrentBranch();
        if (!aiAssistantWelcomed) {
            aiAssistantWelcomed = true;
            const greeting = buildAiAssistantWelcomeText();
            appendAiAssistantBubble("assistant", greeting);
            speakAssistantReply(greeting);
        }
    } else {
        closeAiAssistantWidget();
    }
}

function closeAiAssistantWidget() {
    stopAiAssistantMic();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setAiAssistantSpeakingVisual(false);
    closeRightSlidePanel("aiAssistantModal");
}

function appendAiAssistantBubble(role, text) {
    const transcript = document.getElementById("aiAssistantTranscript");
    if (!transcript) return;
    const bubble = document.createElement("div");
    if (role === "user") {
        bubble.className = "ml-auto max-w-[85%] bg-[#E6B950] text-zinc-950 font-bold text-sm rounded-2xl rounded-br-sm px-4 py-2.5 shadow";
    } else if (role === "error") {
        bubble.className = "max-w-[85%] bg-red-950/60 border border-red-800 text-red-200 font-semibold text-sm rounded-2xl rounded-bl-sm px-4 py-2.5";
    } else {
        bubble.className = "max-w-[85%] bg-black/40 backdrop-blur-sm border border-zinc-800 text-white font-semibold text-sm rounded-2xl rounded-bl-sm px-4 py-2.5 shadow";
    }
    bubble.innerText = text;
    transcript.appendChild(bubble);
    transcript.scrollTop = transcript.scrollHeight;
}

function setAiAssistantControlsEnabled(enabled) {
    const micBtn = document.getElementById("aiAssistantMicBtn");
    const sendBtn = document.getElementById("aiAssistantSendBtn");
    const textInput = document.getElementById("aiAssistantTextInput");
    [micBtn, sendBtn, textInput].forEach(el => { if (el) el.disabled = !enabled; });
    if (micBtn) micBtn.classList.toggle("opacity-40", !enabled);
    if (sendBtn) sendBtn.classList.toggle("opacity-40", !enabled);
}

function renderPendingActionCard(pendingAction) {
    aiAssistantPendingAction = pendingAction;
    const transcript = document.getElementById("aiAssistantTranscript");
    if (!transcript) return;
    const card = document.createElement("div");
    card.id = "aiAssistantPendingCard";
    card.className = "border-2 border-[#E6B950] bg-zinc-900 rounded-xl p-4 space-y-3 shadow-[0_0_20px_rgba(230,185,80,0.15)]";
    card.innerHTML = `
        <p class="text-sm font-bold text-white">${escapeHtml(pendingAction.confirmation_text)}</p>
        <div class="flex gap-2">
            <button type="button" onclick="cancelPendingAction()" class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-xs uppercase tracking-wider py-2.5 rounded-lg transition-all">Cancel</button>
            <button type="button" onclick="confirmPendingAction()" class="flex-1 bg-[#E6B950] hover:bg-[#F4D878] text-zinc-950 font-black text-xs uppercase tracking-wider py-2.5 rounded-lg transition-all">Confirm</button>
        </div>
    `;
    transcript.appendChild(card);
    transcript.scrollTop = transcript.scrollHeight;
    setAiAssistantControlsEnabled(false);
}

function clearPendingActionCard() {
    document.getElementById("aiAssistantPendingCard")?.remove();
    aiAssistantPendingAction = null;
    setAiAssistantControlsEnabled(true);
}

function cancelPendingAction() {
    clearPendingActionCard();
    appendAiAssistantBubble("assistant", "Okay, cancelled - nothing was changed.");
}

async function confirmPendingAction() {
    if (!aiAssistantPendingAction) return;
    const action = aiAssistantPendingAction;
    clearPendingActionCard();
    const statusEl = document.getElementById("aiAssistantStatus");
    if (statusEl) statusEl.innerText = "Working...";
    try {
        const response = await fetch(`${apiUrl}/api/ai-assistant/execute-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({ action: action.action, params: action.params })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = `Couldn't complete that: ${data.detail || "unknown error"}.`;
            appendAiAssistantBubble("error", message);
            speakAssistantReply(message);
        } else {
            const message = "Done - that's been updated.";
            appendAiAssistantBubble("assistant", message);
            speakAssistantReply(message);
        }
    } catch (err) {
        console.error("confirmPendingAction error:", err);
        appendAiAssistantBubble("error", "Couldn't reach the server to complete that action.");
    } finally {
        if (statusEl) statusEl.innerText = "";
    }
}

function handleAiAssistantSend() {
    const input = document.getElementById("aiAssistantTextInput");
    if (!input) return;
    const text = input.value.trim();
    if (!text || aiAssistantBusy) return;
    input.value = "";
    sendAiAssistantMessage(text);
}

async function sendAiAssistantMessage(text) {
    if (aiAssistantPendingAction) return; // resolve the pending confirmation first
    appendAiAssistantBubble("user", text);
    aiAssistantBusy = true;
    setAiAssistantControlsEnabled(false);
    const statusEl = document.getElementById("aiAssistantStatus");
    if (statusEl) statusEl.innerText = "Thinking...";

    try {
        const response = await fetch(`${apiUrl}/api/ai-assistant/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("access_token") || ""}` },
            body: JSON.stringify({
                message: text,
                history: aiAssistantHistory.slice(-AI_ASSISTANT_MAX_HISTORY),
                branch: getCurrentBranch()
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data.detail || "The AI Assistant hit an error.";
            appendAiAssistantBubble("error", message);
            speakAssistantReply(message);
            return;
        }

        aiAssistantHistory.push({ role: "user", content: text });
        aiAssistantHistory.push({ role: "assistant", content: data.reply || "" });

        appendAiAssistantBubble("assistant", data.reply || "");
        speakAssistantReply(data.reply || "");
        if (data.pending_action) {
            renderPendingActionCard(data.pending_action);
        }
    } catch (err) {
        console.error("sendAiAssistantMessage error:", err);
        appendAiAssistantBubble("error", "Couldn't reach the server - check your connection and try again.");
    } finally {
        aiAssistantBusy = false;
        if (statusEl) statusEl.innerText = "";
        if (!aiAssistantPendingAction) setAiAssistantControlsEnabled(true);
    }
}

function toggleAiAssistantMute() {
    aiAssistantMuted = !aiAssistantMuted;
    const btn = document.getElementById("aiAssistantMuteBtn");
    if (btn) btn.innerText = aiAssistantMuted ? "🔇" : "🔊";
    if (aiAssistantMuted && typeof speechSynthesis !== "undefined") {
        speechSynthesis.cancel();
        setAiAssistantSpeakingVisual(false);
    }
}

// Picked fresh on every reply since voice lists load asynchronously and vary by browser.
// Prefers natural/neural voices before falling back to the default English voice.
function pickBestAiAssistantVoice() {
    if (typeof speechSynthesis === "undefined") return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;

    const preferredNamePatterns = [
        /Natural/i,
        /Neural/i,
        /Google US English/i,
        /Samantha/i,
        /Aria/i,
        /Jenny/i,
    ];
    for (const pattern of preferredNamePatterns) {
        const match = voices.find(v => pattern.test(v.name) && v.lang.startsWith("en"));
        if (match) return match;
    }
    return voices.find(v => v.lang === "en-US") || voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// Shows/hides the equalizer bars over the launcher icon while the assistant is talking
function setAiAssistantSpeakingVisual(isSpeaking) {
    const icon = document.getElementById("aiAssistantLauncherIcon");
    const wave = document.getElementById("aiAssistantLauncherWave");
    if (icon) icon.classList.toggle("hidden", isSpeaking);
    if (wave) wave.classList.toggle("hidden", !isSpeaking);
}

// Same idea for the mic: a pulsing ring so the auto-listen window is visible even with the panel closed
function setAiAssistantListeningVisual(isListening) {
    const btn = document.getElementById("aiAssistantLauncherBtn");
    const icon = document.getElementById("aiAssistantLauncherIcon");
    const listeningGlyph = document.getElementById("aiAssistantLauncherListening");
    if (btn) btn.classList.toggle("ai-launcher-listening", isListening);
    if (icon) icon.classList.toggle("hidden", isListening);
    if (listeningGlyph) listeningGlyph.classList.toggle("hidden", !isListening);
}

// onSpoken (optional): fires once the reply finishes speaking, used by the auto-greeting to open the mic
function speakAssistantReply(text, onSpoken) {
    if (aiAssistantMuted || !text || typeof speechSynthesis === "undefined") return;

    const speakNow = () => {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        // Slower + slightly lower pitch than default, reads more natural, less "cartoon" TTS
        utterance.rate = 0.9;
        utterance.pitch = 0.95;
        const voice = pickBestAiAssistantVoice();
        if (voice) utterance.voice = voice;
        utterance.onstart = () => setAiAssistantSpeakingVisual(true);
        utterance.onend = () => {
            setAiAssistantSpeakingVisual(false);
            if (typeof onSpoken === "function") onSpoken();
        };
        utterance.onerror = () => setAiAssistantSpeakingVisual(false);
        speechSynthesis.speak(utterance);
    };

    // The first speak() call can get silently swallowed if voices haven't loaded yet,
    // so wait for voiceschanged once, with a fallback timeout
    if (!speechSynthesis.getVoices().length && "onvoiceschanged" in speechSynthesis) {
        let started = false;
        const fallback = setTimeout(() => { if (!started) { started = true; speakNow(); } }, 300);
        speechSynthesis.onvoiceschanged = () => {
            if (started) return;
            started = true;
            clearTimeout(fallback);
            speakNow();
        };
    } else {
        speakNow();
    }
}

// Logs to the transcript, and also pops a toast when the panel is closed (auto-listen runs hidden)
function notifyAiAssistantIssue(message) {
    appendAiAssistantBubble("error", message);
    const modal = document.getElementById("aiAssistantModal");
    if ((!modal || modal.classList.contains("hidden")) && typeof displayNotification === "function") {
        displayNotification(message, false);
    }
}

function toggleAiAssistantMic() {
    if (aiAssistantListening) { stopAiAssistantMic(); return; }
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
        notifyAiAssistantIssue("Voice input isn't supported in this browser - please type instead.");
        return;
    }
    if (aiAssistantPendingAction || aiAssistantBusy) return;

    try {
        aiAssistantRecognition = new SpeechRecognitionImpl();
        aiAssistantRecognition.lang = "en-US";
        aiAssistantRecognition.interimResults = false;
        aiAssistantRecognition.maxAlternatives = 1;

        aiAssistantRecognition.onstart = () => {
            aiAssistantListening = true;
            const micBtn = document.getElementById("aiAssistantMicBtn");
            micBtn?.classList.add("animate-pulse", "bg-red-600", "border-red-400");
            const statusEl = document.getElementById("aiAssistantStatus");
            if (statusEl) statusEl.innerText = "Listening...";
            setAiAssistantListeningVisual(true);
        };
        aiAssistantRecognition.onresult = (event) => {
            const transcriptText = event.results[0][0].transcript;
            if (transcriptText) sendAiAssistantMessage(transcriptText.trim());
        };
        aiAssistantRecognition.onerror = (event) => {
            console.warn("AI Assistant mic error:", event.error);
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                notifyAiAssistantIssue("Microphone access was blocked - please type instead, or allow mic access.");
            }
        };
        aiAssistantRecognition.onend = () => stopAiAssistantMic();
        aiAssistantRecognition.start();
    } catch (err) {
        console.warn("AI Assistant mic unavailable:", err);
        notifyAiAssistantIssue("Couldn't start voice input - please type instead.");
    }
}

function stopAiAssistantMic() {
    clearTimeout(aiAssistantAutoListenTimer);
    aiAssistantListening = false;
    const micBtn = document.getElementById("aiAssistantMicBtn");
    micBtn?.classList.remove("animate-pulse", "bg-red-600", "border-red-400");
    const statusEl = document.getElementById("aiAssistantStatus");
    if (statusEl && statusEl.innerText === "Listening...") statusEl.innerText = "";
    setAiAssistantListeningVisual(false);
    if (aiAssistantRecognition) {
        try { aiAssistantRecognition.stop(); } catch (err) { /* already stopped */ }
        aiAssistantRecognition = null;
    }
}

// How long the mic stays open after the auto-greeting
const AI_ASSISTANT_AUTO_LISTEN_MS = 8000;
let aiAssistantAutoListenTimer = null;

function startAiAssistantAutoListen() {
    if (aiAssistantListening || aiAssistantPendingAction || aiAssistantBusy) return;
    toggleAiAssistantMic();
    clearTimeout(aiAssistantAutoListenTimer);
    aiAssistantAutoListenTimer = setTimeout(() => {
        if (aiAssistantListening) stopAiAssistantMic();
    }, AI_ASSISTANT_AUTO_LISTEN_MS);
}

// Voice-only entry greeting: no panel popup, just spoken welcome + a short auto-listen window,
// fires once per page load right after the dashboard first appears
function speakAiAssistantWelcomeOnEntry() {
    if (aiAssistantWelcomed) return;
    aiAssistantWelcomed = true;

    const greeting = buildAiAssistantWelcomeText();
    appendAiAssistantBubble("assistant", greeting);
    speakAssistantReply(greeting, startAiAssistantAutoListen);
}

function buildAiAssistantWelcomeText() {
    const name = (localStorage.getItem("user_name") || "").trim();
    return `Welcome${name ? ", " + name + "," : ""} to our Amsons Inventory System. How may I help you?`;
}




