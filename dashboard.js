    // Till dashboard screen. Header clock is handled by updateLoginClock() below.

    // Shared backend base URL, has its own copy since this script loads before login.js
    var TILL_API_BASE = (window.location.protocol === "file:" || (window.location.port && window.location.port !== "8000"))
        ? "http://127.0.0.1:8000"
        : window.location.origin;

    // Till number, per branch: each branch has its own pool of numbers,
    // assigned in order as tills open, tracked in localStorage, released
    // back to the pool when a tab/till closes.
    var TILLS_MAP_KEY = 'amsonsActiveTills';
    var SESSION_TILL_KEY = 'amsonsSessionTill';

    // A till number pinned to this computer, set via SETTINGS > SETUP >
    // "This Till's Number" - always used instead of the shared pool below
    var FIXED_TILL_KEY = 'amsonsFixedTillNumber';

    function getFixedTillNumber() {
        var raw = localStorage.getItem(FIXED_TILL_KEY);
        var n = raw ? parseInt(raw, 10) : NaN;
        return isNaN(n) ? null : n;
    }

    function setFixedTillNumber(n) {
        localStorage.setItem(FIXED_TILL_KEY, String(n));
    }

    function clearFixedTillNumber() {
        localStorage.removeItem(FIXED_TILL_KEY);
    }

    function getActiveTillsMap() {
        try { return JSON.parse(localStorage.getItem(TILLS_MAP_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function releaseTillNumber(branchName, num) {
        if (!branchName || !num) return;
        var map = getActiveTillsMap();
        var used = map[branchName] || [];
        var idx = used.indexOf(num);
        if (idx !== -1) {
            used.splice(idx, 1);
            map[branchName] = used;
            localStorage.setItem(TILLS_MAP_KEY, JSON.stringify(map));
        }
    }

    function getSessionTill() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_TILL_KEY)); }
        catch (e) { return null; }
    }

    // Releases the till number a session was holding (no-op for a fixed number)
    function releaseSessionTill(s) {
        if (s && !s.fixed) releaseTillNumber(s.branch, s.num);
    }

    function assignTillNumber(branchName) {
        // Release whatever till number this tab was previously holding
        var prev = getSessionTill();
        releaseSessionTill(prev);

        var fixed = getFixedTillNumber();
        if (fixed) {
            sessionStorage.setItem(SESSION_TILL_KEY, JSON.stringify({ branch: branchName, num: fixed, fixed: true }));
            return fixed;
        }

        var map = getActiveTillsMap();
        var used = map[branchName] || [];
        var n = 1;
        while (used.indexOf(n) !== -1) n++;
        used.push(n);
        map[branchName] = used;
        localStorage.setItem(TILLS_MAP_KEY, JSON.stringify(map));
        sessionStorage.setItem(SESSION_TILL_KEY, JSON.stringify({ branch: branchName, num: n }));
        return n;
    }

    // Free the till number back to its branch's pool when this tab closes
    window.addEventListener('pagehide', function () {
        releaseSessionTill(getSessionTill());
    });

    // UI sounds: synthesized beeps, no audio files needed. AudioContext
    // created lazily on first tap (autoplay policy needs a user gesture).
    var uiAudioCtx = null;
    function getUiAudioCtx() {
        if (!uiAudioCtx) {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            uiAudioCtx = new Ctx();
        }
        if (uiAudioCtx.state === 'suspended') uiAudioCtx.resume();
        return uiAudioCtx;
    }

    function playTone(freq, duration, volume, type) {
        var ctx = getUiAudioCtx();
        if (!ctx) return;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    // Short, quiet beep for every button tap
    function playBeep() {
        playTone(1000, 0.07, 0.18, 'square');
    }

    // Loud buzz for a failed scan / product not found
    function playErrorSound() {
        playTone(220, 0.18, 0.5, 'sawtooth');
        setTimeout(function () { playTone(160, 0.28, 0.5, 'sawtooth'); }, 150);
    }

    // Delegated on the whole document since overlays render outside #dashboardScreen
    document.addEventListener('click', function (e) {
        if (e.target.closest('button')) playBeep();
    }, true);

    // Keypad "blink" feedback: a bright flash so even a fast tap reads clearly
    document.querySelectorAll('.key-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            btn.classList.remove('flash');
            void btn.offsetWidth; // restart animation if tapped again quickly
            btn.classList.add('flash');
        });
        btn.addEventListener('animationend', function () {
            btn.classList.remove('flash');
        });
    });

    // Right-sidebar menu: button flips to a "busy" look while its action runs
    function setBtnBusy(btn, busy) {
        if (btn) btn.classList.toggle('busy', !!busy);
    }

    // CART + CHECKOUT: scanning/typing a code looks the product up in
    // Lightspeed and adds it to the cart. CASH SALE closes directly.
    // CARD SALE hands off to Lightspeed's own screen for card payment.

    var cart = []; // [{ sku, name, price, qty, discountType, discountValue }]
    var dataInput = '';
    var pendingQty = null; // set by "5*" before a scan, to add 5 of the next item
    var selectedLineIndex = null; // cart row tapped to select it, for VOID/DISCOUNT
    var openSaleArmed = false; // set by OPEN SALE with nothing typed yet - next ENTER commits the typed price

    var scanCaptureInput = document.getElementById('scanCaptureInput');
    var dataInputCard = document.getElementById('dataInputCard');
    var dataInputValue = document.getElementById('dataInputValue');
    var priceValue = document.getElementById('priceValue');
    var totalQtyValue = document.getElementById('totalQtyValue');
    var totalItemsValue = document.getElementById('totalItemsValue');
    var cartBody = document.getElementById('cartBody');
    var totalAmountValue = document.getElementById('totalAmountValue');
    var amtPayableValue = document.getElementById('amtPayableValue');
    var cashChangeValue = document.getElementById('cashChangeValue');
    var tillToast = document.getElementById('tillToast');
    var quickPicksView = document.getElementById('quickPicksView');
    var promoPanelView = document.getElementById('promoPanelView');
    var promoPanelList = document.getElementById('promoPanelList');
    var cashSaleBtn = document.querySelector('.c-cashsale');
    var cardSaleBtn = document.querySelector('.c-cardsale');

    function money(n) {
        return '£' + (Math.round((n || 0) * 100) / 100).toFixed(2);
    }

    function round2(n) {
        return Math.round(n * 100) / 100;
    }

    // DISCOUNT support: a line keeps its unit price plus an optional discount on top
    function lineTotal(line) {
        var base = line.price * line.qty;
        if (!line.discountType || !line.discountValue) return base;
        if (line.discountType === 'percent') return Math.max(0, base * (1 - line.discountValue / 100));
        return Math.max(0, base - line.discountValue);
    }

    function discountTag(line) {
        if (!line.discountType || !line.discountValue) return '';
        var text = line.discountType === 'percent' ? ('-' + line.discountValue + '%') : ('-' + money(line.discountValue));
        return '<span class="line-discount-tag">' + text + '</span>';
    }

    // Pre-discount total: original per-unit price (falls back to the actual
    // price when there's no promo on this line) x qty - manual per-line
    // DISCOUNT (discountType/discountValue) is deliberately not subtracted here,
    // so TOTAL AMOUNT always reads as "before any discount" and AMOUNT PAYABLE
    // (lineTotal, below) as "after everything".
    function lineOriginalTotal(line) {
        return (line.originalPrice || line.price) * line.qty;
    }

    // Shows the pre-promotion price struck through, plus the promotion's name,
    // under the (already-discounted) unit price scanned in for this line
    function promoPriceTag(line) {
        if (!line.originalPrice) return '';
        return '<span class="line-was-price">was ' + money(line.originalPrice) + '</span>' +
            '<span class="line-promo-tag">' + escapeHtml(line.promotionName || 'PROMO') + '</span>';
    }

    // Cart items sent to the backend - it re-prices from Lightspeed, only trusts the discount
    function cartToItems() {
        return cart.map(function (l) {
            var item = { sku: l.sku, quantity: l.qty };
            if (l.discountType && l.discountValue) item.discount = { type: l.discountType, value: l.discountValue };
            return item;
        });
    }

    // Set via UTILITIES > Select Register, falls back to the backend's default
    function selectedRegisterId() {
        return localStorage.getItem('amsonsRegisterId') || undefined;
    }

    var toastTimer = null;
    function showToast(message, type) {
        tillToast.textContent = message;
        tillToast.className = 'till-toast show' + (type ? ' ' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { tillToast.classList.remove('show'); }, 2600);
    }

    // Takes over the QUICK PRODUCTS AND CATEGORIES block (bottom-left) with a
    // scrollable list of every cart line that has an active Promotion, showing
    // each one's discounted price - reverts back to the normal quick-picks view
    // the moment no promo line is left in the cart (see renderCart(), which
    // calls this on every cart change, including clearSale()).
    function renderPromoPanel() {
        if (!promoPanelView || !quickPicksView) return;
        var promoLines = cart.filter(function (l) { return l.originalPrice; });
        if (!promoLines.length) {
            promoPanelView.hidden = true;
            quickPicksView.hidden = false;
            return;
        }
        quickPicksView.hidden = true;
        promoPanelView.hidden = false;
        promoPanelList.innerHTML = promoLines.map(function (l) {
            return '<div class="promo-item-row">' +
                '<div class="promo-item-main">' +
                    '<div class="promo-item-name">' + escapeHtml(l.name) + '</div>' +
                    '<div class="promo-item-tag">' + escapeHtml(l.promotionName || 'PROMO') + '</div>' +
                '</div>' +
                '<div class="promo-item-prices">' +
                    '<span class="promo-item-qty">x' + l.qty + '</span>' +
                    '<span class="promo-item-was">' + money(l.originalPrice) + '</span>' +
                    '<span class="promo-item-now">' + money(l.price) + '</span>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function flashError(cardEl) {
        cardEl.classList.remove('err-flash');
        void cardEl.offsetWidth; // restart animation if triggered again quickly
        cardEl.classList.add('err-flash');
    }

    // Full-screen red blink for a declined/voided card payment
    function flashAlarm() {
        var el = document.getElementById('alarmFlash');
        if (!el) return;
        el.classList.remove('blink');
        void el.offsetWidth; // restart animation if triggered again quickly
        el.classList.add('blink');
        setTimeout(function () { el.classList.remove('blink'); }, 2000);
    }

    // Keeps the hidden capture input focused so the keypad and a USB
    // barcode scanner both land in the same input buffer
    function focusScanCapture() {
        scanCaptureInput.focus({ preventScroll: true });
    }
    document.getElementById('dashboardScreen').addEventListener('click', function (e) {
        if (e.target.tagName !== 'INPUT') focusScanCapture();
    });

    function renderDataInput() {
        dataInputValue.textContent = (pendingQty ? pendingQty + '*' : '') + dataInput;
        scanCaptureInput.value = dataInput;
    }

    function renderCart() {
        cartBody.innerHTML = '';
        var totalQty = 0;
        cart.forEach(function (line, index) {
            totalQty += line.qty;
            var tr = document.createElement('tr');
            tr.dataset.index = index;
            if (index === selectedLineIndex) tr.classList.add('selected-line');
            tr.innerHTML =
                '<td>' + line.sku + '</td>' +
                '<td>' + line.name + discountTag(line) + '</td>' +
                '<td>' + money(line.price) + promoPriceTag(line) + '</td>' +
                '<td>' + line.qty + '</td>' +
                '<td>' + money(lineTotal(line)) + '</td>' +
                '<td class="col-delete"><button type="button" class="line-delete-btn" data-action="delete-line" title="Remove item"><svg><use href="#i-trash"/></svg></button></td>';
            cartBody.appendChild(tr);
        });
        cartBody.parentElement.scrollTop = cartBody.parentElement.scrollHeight;

        var total = cart.reduce(function (sum, l) { return sum + lineTotal(l); }, 0);
        var originalTotal = cart.reduce(function (sum, l) { return sum + lineOriginalTotal(l); }, 0);
        totalQtyValue.textContent = totalQty;
        totalItemsValue.textContent = cart.length;
        totalAmountValue.textContent = money(originalTotal);
        amtPayableValue.textContent = money(total);
        cashChangeValue.textContent = money(0);
        priceValue.textContent = cart.length ? cart[cart.length - 1].price.toFixed(2) : '0.00';

        cashSaleBtn.classList.toggle('pay-attn', cart.length > 0);
        cardSaleBtn.classList.toggle('pay-attn', cart.length > 0);

        renderPromoPanel();
    }

    // Tap a cart row to select it (VOID/DISCOUNT target it), tap again to deselect.
    // The trash icon at the end of a row removes just that line outright.
    cartBody.addEventListener('click', function (e) {
        var tr = e.target.closest('tr');
        if (!tr) return;
        var idx = parseInt(tr.dataset.index, 10);

        if (e.target.closest('[data-action="delete-line"]')) {
            cart.splice(idx, 1);
            if (selectedLineIndex === idx) selectedLineIndex = null;
            else if (selectedLineIndex !== null && selectedLineIndex > idx) selectedLineIndex -= 1;
            renderCart();
            return;
        }

        selectedLineIndex = (selectedLineIndex === idx) ? null : idx;
        renderCart();
    });

    // Every scan of the same product gets its own cart row (stacked one under
    // another) instead of bumping an existing row's qty - only an explicit
    // "5*"-style quantity multiplier puts more than 1 unit on a single row.
    // Promo pricing is still threshold-based on the SKU's total quantity
    // (see cartQuantityFor()), so any earlier rows of this SKU are re-priced
    // here too - each row shows its own price/discount tag, and the totals
    // (which sum every row) come out correct once everything is counted together.
    function addToCart(product, quantity) {
        quantity = quantity || 1;
        var price = product.price || 0;
        var originalPrice = product.original_price || null;
        var promotionName = product.promotion_name || null;

        cart.forEach(function (l) {
            if (l.sku !== product.sku) return;
            l.price = price;
            l.originalPrice = originalPrice;
            l.promotionName = promotionName;
        });

        cart.push({
            sku: product.sku,
            name: product.name,
            price: price,
            qty: quantity,
            originalPrice: originalPrice,
            promotionName: promotionName
        });
        renderCart();
    }

    function clearSale() {
        cart = [];
        dataInput = '';
        pendingQty = null;
        selectedLineIndex = null;
        if (openSaleArmed) disarmOpenSale();
        renderDataInput();
        renderCart();
    }

    // CLEAR SALE now requires the currently logged-in user's own 4-digit PIN
    // (checked against the same /api/login used at sign-in) - no ID re-entry,
    // it's checked against whichever account is already signed into this till.
    var clearSalePinInput = '';
    var clearSaleBusy = false;

    function clearSaleModalHtml() {
        var digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'];
        var keys = digits.map(function (d) {
            var label = d === 'back' ? '⌫' : d;
            return '<button type="button" data-action="clear-sale-digit" data-digit="' + d + '">' + label + '</button>';
        }).join('');
        return '<div class="am-section">' +
            '<div class="am-target">Enter your PIN to clear this sale</div>' +
            '<input class="am-field" id="clearSalePinField" type="password" placeholder="PIN" readonly value="">' +
            '<div class="am-keypad">' + keys + '</div>' +
            '<div class="am-btn-row">' +
                '<button type="button" class="am-btn danger" data-action="clear-sale-confirm">CONFIRM &amp; CLEAR SALE</button>' +
            '</div>' +
        '</div>';
    }

    function renderClearSaleFields() {
        var pinEl = document.getElementById('clearSalePinField');
        if (pinEl) pinEl.value = clearSalePinInput;
    }

    function openClearSaleModal() {
        clearSalePinInput = '';
        clearSaleBusy = false;
        openActionModal('CLEAR SALE', clearSaleModalHtml(), null);
        actionModalOverlay.classList.add('clear-sale-modal');
    }

    function submitClearSalePin() {
        if (clearSaleBusy) return;
        var session = getAmsonsSession();
        if (!session || !session.username) { showToast('No logged-in user found', 'error'); return; }
        if (clearSalePinInput.length < 4) {
            showToast('Enter your 4-digit PIN', 'error');
            return;
        }

        clearSaleBusy = true;
        var confirmBtn = actionModalBody.querySelector('[data-action="clear-sale-confirm"]');
        if (confirmBtn) confirmBtn.textContent = 'CHECKING...';

        var loginFormData = new FormData();
        loginFormData.append('username', session.username);
        loginFormData.append('password', clearSalePinInput);

        fetch(TILL_API_BASE + '/api/login', { method: 'POST', body: loginFormData })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                clearSaleBusy = false;
                if (!result.ok) {
                    showToast(result.data.detail || 'Incorrect PIN', 'error');
                    clearSalePinInput = '';
                    renderClearSaleFields();
                    if (confirmBtn) confirmBtn.textContent = 'CONFIRM & CLEAR SALE';
                    return;
                }
                closeActionModal();
                clearSale();
                showToast('Sale cleared', null);
                focusScanCapture();
            })
            .catch(function () {
                clearSaleBusy = false;
                if (confirmBtn) confirmBtn.textContent = 'CONFIRM & CLEAR SALE';
                showToast('Backend unreachable - is the till server running?', 'error');
            });
    }

    // ---- Receipt printing: fills #receiptPrintArea (till_amsons.html, a
    //      58mm-wide block hidden on screen, only shown to the printer -
    //      see its @media print rules) and calls window.print(). For this
    //      to go straight to the till's thermal printer with no Print/
    //      Cancel dialog, Chrome/Edge must be launched with the
    //      --kiosk-printing flag (added once to the shortcut used to open
    //      this till) - without that flag the normal OS print dialog still
    //      opens, same as any web page. ----
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Builds a <svg class="cat-icon"><use href="#iconId"/></svg> as real DOM nodes -
    // needed when swapping an icon in after the fact, since innerHTML on an <svg>'s
    // parent doesn't reliably parse inline SVG in every browser.
    function iconEl(iconId) {
        var svgNs = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('class', 'cat-icon');
        var use = document.createElementNS(svgNs, 'use');
        use.setAttribute('href', '#' + iconId);
        svg.appendChild(use);
        return svg;
    }

    function buildReceiptHtml(opts) {
        var session = getAmsonsSession();
        var till = getSessionTill();
        var branch = (till && till.branch) || '';
        var tillNum = till ? till.num : '';

        var itemsHtml = opts.lines.map(function (line) {
            return '' +
                '<div class="rcpt-row"><span class="rcpt-item-name">' + escapeHtml(line.name) + '</span></div>' +
                '<div class="rcpt-row"><span>' + line.qty + ' x ' + money(line.price) + '</span><span>' + money(lineTotal(line)) + '</span></div>';
        }).join('');

        var payRows = '';
        if (opts.paymentMethod === 'CASH') {
            payRows += '<div class="rcpt-row"><span>Tendered</span><span>' + money(opts.tendered) + '</span></div>';
            if (opts.changeDue !== null && opts.changeDue !== undefined) {
                payRows += '<div class="rcpt-row"><span>Change</span><span>' + money(opts.changeDue) + '</span></div>';
            }
        }

        return '' +
            '<div class="rcpt-center rcpt-shop">AMSONS</div>' +
            '<div class="rcpt-center">' + escapeHtml(branch) + (tillNum ? (' &middot; TILL ' + tillNum) : '') + '</div>' +
            '<div class="rcpt-center">' + new Date().toLocaleString() + '</div>' +
            '<div class="rcpt-rule"></div>' +
            itemsHtml +
            '<div class="rcpt-rule"></div>' +
            '<div class="rcpt-row rcpt-total-row"><span>TOTAL</span><span>' + money(opts.amount) + '</span></div>' +
            '<div class="rcpt-row"><span>Payment</span><span>' + opts.paymentMethod + '</span></div>' +
            payRows +
            '<div class="rcpt-rule"></div>' +
            '<div class="rcpt-foot rcpt-center">' +
                'Cashier: ' + escapeHtml(session ? session.name : '') + '<br>' +
                (opts.saleId ? ('Sale #' + escapeHtml(opts.saleId) + '<br>') : '') +
                'Thank you for shopping with us' +
            '</div>';
    }

    function printReceipt(opts) {
        var area = document.getElementById('receiptPrintArea');
        if (!area) return;
        area.innerHTML = buildReceiptHtml(opts);
        // A couple of frames so the browser actually paints the new
        // receipt content before the print engine grabs the page.
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                window.print();
            });
        });
    }

    // TILL READINGS (X/Z) print in the same slip format as a sale receipt,
    // through the same #receiptPrintArea/window.print() path.
    function buildReadingReceiptHtml(title, reading) {
        var session = getAmsonsSession();
        var till = getSessionTill();
        var branch = (till && till.branch) || '';
        var tillNum = till ? till.num : '';

        var paymentRows = (reading.payments || []).map(function (p) {
            return '<div class="rcpt-row"><span>' + escapeHtml(p.name || '') + '</span><span>' + money(p.total) + '</span></div>';
        }).join('');

        return '' +
            '<div class="rcpt-center rcpt-shop">AMSONS</div>' +
            '<div class="rcpt-center">' + title + '</div>' +
            '<div class="rcpt-center">' + escapeHtml(branch) + (tillNum ? (' &middot; TILL ' + tillNum) : '') + '</div>' +
            '<div class="rcpt-center">' + new Date().toLocaleString() + '</div>' +
            '<div class="rcpt-rule"></div>' +
            '<div class="rcpt-row"><span>Till Opened</span><span>' + (reading.register_open_time ? new Date(reading.register_open_time).toLocaleString() : '-') + '</span></div>' +
            '<div class="rcpt-row"><span>Sales Count</span><span>' + reading.sale_count + '</span></div>' +
            '<div class="rcpt-rule"></div>' +
            paymentRows +
            '<div class="rcpt-rule"></div>' +
            '<div class="rcpt-row"><span>Tax</span><span>' + money(reading.tax_total) + '</span></div>' +
            '<div class="rcpt-row rcpt-total-row"><span>GROSS TOTAL</span><span>' + money(reading.gross_total) + '</span></div>' +
            '<div class="rcpt-rule"></div>' +
            '<div class="rcpt-foot rcpt-center">Cashier: ' + escapeHtml(session ? session.name : '') + '</div>';
    }

    function printReading(title, reading) {
        var area = document.getElementById('receiptPrintArea');
        if (!area) return;
        area.innerHTML = buildReadingReceiptHtml(title, reading);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                window.print();
            });
        });
    }

    function productLookupUrl(code, quantity) {
        var url = TILL_API_BASE + '/api/product/' + encodeURIComponent(code);
        var params = [];
        var registerId = selectedRegisterId();
        if (registerId) params.push('register_id=' + encodeURIComponent(registerId));
        if (quantity) params.push('quantity=' + encodeURIComponent(quantity));
        if (params.length) url += '?' + params.join('&');
        return url;
    }

    // Quantity-threshold promos ("Buy 2 for £15") only kick in once the cart holds
    // enough of that SKU, so the lookup must be checked against cart qty + this scan,
    // not just this scan in isolation.
    function cartQuantityFor(sku) {
        return cart.reduce(function (sum, l) { return l.sku === sku ? sum + l.qty : sum; }, 0);
    }

    function lookupAndAddProduct(code, quantity) {
        var totalQuantity = cartQuantityFor(code) + (quantity || 1);
        fetch(productLookupUrl(code, totalQuantity))
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok || !result.data.found) {
                    flashError(dataInputCard);
                    playErrorSound();
                    flashAlarm();
                    showToast('Product not found: ' + code, 'error');
                    return;
                }
                addToCart(result.data.product, quantity);
            })
            .catch(function () {
                flashError(dataInputCard);
                playErrorSound();
                flashAlarm();
                showToast('Backend unreachable - is the till server running?', 'error');
            });
    }

    // "5*" then a scan/code adds 5 of that item in one go
    function commitDataInput() {
        var code = dataInput.trim();
        if (openSaleArmed) {
            disarmOpenSale();
            var price = formatOpenSalePrice(code);
            dataInput = '';
            pendingQty = null;
            renderDataInput();
            if (price !== null) addOpenSaleItem(price);
            else showToast('Type a price first', 'error');
            return;
        }
        var quantity = pendingQty || 1;
        dataInput = '';
        pendingQty = null;
        renderDataInput();
        if (code) lookupAndAddProduct(code, quantity);
    }

    function applyMultiplier() {
        var qty = parseInt(dataInput, 10);
        if (!qty || qty < 1) {
            flashError(dataInputCard);
            return;
        }
        pendingQty = qty;
        dataInput = '';
        renderDataInput();
    }

    // On-screen keypad: digits build the input buffer, ENTER looks up
    // the barcode, £50/£20/£10 are quick cash adds, CLEAR SALE empties the cart
    document.querySelectorAll('.key-btn[data-key]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-key');
            if (/^[0-9.]$/.test(key) || key === '00') {
                dataInput += key;
            } else if (key === 'multiply') {
                applyMultiplier();
                focusScanCapture();
                return;
            } else if (key === 'backspace') {
                if (!dataInput && pendingQty !== null) {
                    // undo the "*", go back to editing the quantity digits
                    dataInput = String(pendingQty);
                    pendingQty = null;
                } else {
                    dataInput = dataInput.slice(0, -1);
                }
            } else if (key === 'enter') {
                commitDataInput();
                focusScanCapture();
                return;
            } else if (key === 'clear-sale') {
                openClearSaleModal();
                return;
            } else if (key === 'cash-50' || key === 'cash-20' || key === 'cash-10') {
                var add = key === 'cash-50' ? 50 : (key === 'cash-20' ? 20 : 10);
                dataInput = ((parseFloat(dataInput) || 0) + add).toFixed(2);
            } else if (key === 'keyboard') {
                openScanKeyboard();
                return;
            }
            renderDataInput();
            focusScanCapture();
        });
    });

    // Physical keyboard / barcode scanner: types digits then Enter
    scanCaptureInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitDataInput();
        }
    });
    scanCaptureInput.addEventListener('input', function () {
        dataInput = scanCaptureInput.value;
        renderDataInput(); // keeps the pending-qty prefix intact
    });

    // On-screen touch keyboard, reuses the login screen's shared OSK overlay
    function openScanKeyboard() {
        activeField = scanCaptureInput;
        document.getElementById('oskOverlay').classList.add('open');
    }

    // CASH SALE: closes the sale directly through the backend
    document.querySelector('.c-cashsale').addEventListener('click', function () {
        if (!cart.length) { showToast('Cart is empty', 'error'); return; }
        var btn = this;
        setBtnBusy(btn, true);

        var tendered = parseFloat(dataInput);
        var lineSnapshot = cart.slice();

        fetch(TILL_API_BASE + '/api/checkout/cash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cartToItems(),
                tendered_amount: isNaN(tendered) ? null : tendered,
                register_id: selectedRegisterId()
            })
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok || !result.data.success) {
                showToast('Cash sale failed: ' + (result.data.error || 'unknown error'), 'error');
                return;
            }
            if (result.data.change_due !== null && result.data.change_due !== undefined) {
                cashChangeValue.textContent = money(result.data.change_due);
            }
            showToast('Cash sale complete - ' + money(result.data.amount), 'ok');
            printReceipt({
                lines: lineSnapshot,
                amount: result.data.amount,
                paymentMethod: 'CASH',
                tendered: isNaN(tendered) ? result.data.amount : tendered,
                changeDue: result.data.change_due,
                saleId: result.data.sale_id
            });
            setTimeout(clearSale, 15000);
        }).catch(function () {
            showToast('Backend unreachable - is the till server running?', 'error');
        }).finally(function () {
            setBtnBusy(btn, false);
        });
    });

    // CARD SALE: parks the sale, hands off to Lightspeed's screen, polls until closed
    document.querySelector('.c-cardsale').addEventListener('click', function () {
        if (!cart.length) { showToast('Cart is empty', 'error'); return; }
        var btn = this;
        setBtnBusy(btn, true);
        var lineSnapshot = cart.slice();

        fetch(TILL_API_BASE + '/api/checkout/card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cartToItems(), register_id: selectedRegisterId() })
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok || !result.data.success) {
                showToast('Card sale failed: ' + (result.data.error || 'unknown error'), 'error');
                setBtnBusy(btn, false);
                return;
            }
            showToast('Complete the tap/insert on the Lightspeed screen...', null);
            var popupW = 480, popupH = 760;
            var popupLeft = Math.max(0, (screen.width - popupW) / 2);
            var popupTop = Math.max(0, (screen.height - popupH) / 2);
            var paymentPopup = window.open(
                result.data.redirect_url,
                'lightspeedPayment',
                'width=' + popupW + ',height=' + popupH + ',left=' + popupLeft + ',top=' + popupTop +
                ',toolbar=no,menubar=no,location=no,status=no,resizable=yes'
            );
            pollSaleStatus(result.data.sale_id, paymentPopup, btn, lineSnapshot, result.data.amount);
        }).catch(function () {
            showToast('Backend unreachable - is the till server running?', 'error');
            setBtnBusy(btn, false);
        });
    });

    function pollSaleStatus(saleId, paymentPopup, btn, lineSnapshot, amount) {
        var attempts = 0;
        var timer = setInterval(function () {
            attempts++;
            fetch(TILL_API_BASE + '/api/sale/' + saleId)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.state === 'closed') {
                        clearInterval(timer);
                        if (paymentPopup && !paymentPopup.closed) paymentPopup.close();
                        showToast('Card payment approved', 'ok');
                        // Prints from this till too, as a fallback in case the register isn't
                        // configured to print from Lightspeed's own payment screen - if it is,
                        // the customer gets two receipts. Turn off printing there (or drop this
                        // call) if that becomes a problem.
                        printReceipt({
                            lines: lineSnapshot,
                            amount: amount,
                            paymentMethod: 'CARD',
                            saleId: saleId
                        });
                        clearSale();
                        setBtnBusy(btn, false);
                    } else if (data.state === 'voided') {
                        clearInterval(timer);
                        if (paymentPopup && !paymentPopup.closed) paymentPopup.close();
                        showToast('Card sale was voided', 'error');
                        flashAlarm();
                        setBtnBusy(btn, false);
                    } else if (attempts > 90) { // ~3 minutes
                        clearInterval(timer);
                        setBtnBusy(btn, false);
                    }
                })
                .catch(function () { /* keep polling */ });
        }, 2000);
    }

    // VOID/DISCOUNT act on the in-memory cart directly. The rest share
    // one generic modal whose body swaps per feature.

    // VOID: removes the selected cart line, nothing to undo on Lightspeed yet
    document.querySelector('.c-void').addEventListener('click', function () {
        if (selectedLineIndex === null || !cart[selectedLineIndex]) {
            showToast('Select an item to void first', 'error');
            return;
        }
        var btn = this;
        setBtnBusy(btn, true);
        cart.splice(selectedLineIndex, 1);
        selectedLineIndex = null;
        renderCart();
        showToast('Item voided', null);
        // Nothing to wait on, just hold the busy look long enough to be seen
        setTimeout(function () { setBtnBusy(btn, false); }, 300);
    });

    // Generic sidebar-action modal shell
    var actionModalOverlay = document.getElementById('actionModalOverlay');
    var actionModalTitle = document.getElementById('actionModalTitle');
    var actionModalBody = document.getElementById('actionModalBody');
    var actionModalBtn = null; // the sidebar button that opened the modal, if any

    function openActionModal(title, bodyHtml, triggerBtn) {
        actionModalBtn = triggerBtn || null;
        setBtnBusy(actionModalBtn, true);
        actionModalTitle.textContent = title;
        actionModalBody.innerHTML = bodyHtml;
        actionModalOverlay.classList.add('open');
    }

    function closeActionModal() {
        actionModalOverlay.classList.remove('open');
        actionModalOverlay.classList.remove('clear-sale-modal');
        actionModalBody.innerHTML = '';
        focusScanCapture();
        setBtnBusy(actionModalBtn, false);
        actionModalBtn = null;
    }

    document.getElementById('actionModalCloseBtn').addEventListener('click', closeActionModal);
    actionModalOverlay.addEventListener('click', function (e) {
        if (e.target === actionModalOverlay) closeActionModal();
    });

    // DISCOUNT: shows every Promotion currently running in Lightspeed (Setup >
    // Promotions) in its own popup - read-only, staff-facing. A product's promo
    // price is still applied automatically at scan time (see /api/product/{code}).
    var promotionsPopupOverlay = document.getElementById('promotionsPopupOverlay');
    var promotionsPopupList = document.getElementById('promotionsPopupList');
    var promotionsPopupBtn = null;

    function promotionsEmptyRow(text) {
        return '<div class="am-row-sub" style="padding:2vh 1vw; text-align:center; opacity:.65;">' + text + '</div>';
    }

    function formatPromoAction(p) {
        var value = p.discount_value;
        if (value == null) return p.description || 'Discount applies at checkout';
        var qtyNote = p.min_quantity ? (' (min qty ' + p.min_quantity + ')') : '';
        switch (p.discount_type) {
            case 'basic_percent_discount':
            case 'percent_discount':
            case 'percent_pool_discount':
                return value + '% off' + qtyNote;
            case 'fixed_discount':
                return money(value) + ' off' + qtyNote;
            case 'fixed_price_discount':
                return (p.min_quantity ? ('Buy ' + p.min_quantity + '+ for ') : '') + money(value) + ' each';
            case 'fixed_pool_discount':
                return (p.min_quantity ? ('Buy ' + p.min_quantity + ' for ') : '') + money(value);
            case 'loyalty':
                return value + 'x loyalty points';
            default:
                return p.description || 'Discount applies at checkout';
        }
    }

    function formatPromoEndDate(p) {
        if (!p.end_time) return '';
        var end = new Date(p.end_time);
        return isNaN(end) ? '' : ('Ends ' + end.toLocaleDateString());
    }

    function renderPromotionsPopup(promotions) {
        if (!promotions.length) {
            promotionsPopupList.innerHTML = promotionsEmptyRow('No active promotions right now');
            return;
        }
        promotionsPopupList.innerHTML = promotions.map(function (p) {
            var subLines = [p.description, formatPromoEndDate(p)].filter(Boolean)
                .map(function (line) { return '<span class="am-row-sub">' + line + '</span>'; }).join('');
            return '<div class="am-row" style="cursor:default;">' +
                '<span>' + (p.name || 'Promotion') + subLines + '</span>' +
                '<span class="am-row-value">' + formatPromoAction(p) + '</span>' +
                '</div>';
        }).join('');
    }

    function closePromotionsPopup() {
        promotionsPopupOverlay.classList.remove('open');
        focusScanCapture();
        setBtnBusy(promotionsPopupBtn, false);
        promotionsPopupBtn = null;
    }

    document.getElementById('promotionsPopupCloseBtn').addEventListener('click', closePromotionsPopup);
    promotionsPopupOverlay.addEventListener('click', function (e) {
        if (e.target === promotionsPopupOverlay) closePromotionsPopup();
    });

    document.querySelector('.c-discount').addEventListener('click', function () {
        promotionsPopupBtn = this;
        setBtnBusy(promotionsPopupBtn, true);
        promotionsPopupList.innerHTML = promotionsEmptyRow('Loading…');
        promotionsPopupOverlay.classList.add('open');
        fetch(TILL_API_BASE + '/api/promotions')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.error) { promotionsPopupList.innerHTML = promotionsEmptyRow('Could not load promotions'); return; }
                renderPromotionsPopup(data.promotions || []);
            })
            .catch(function () { promotionsPopupList.innerHTML = promotionsEmptyRow('Could not load promotions'); })
            .then(function () { setBtnBusy(promotionsPopupBtn, false); });
    });

    // ON HOLD / OPEN SALE: held sales live in the backend's local file,
    // not as Lightspeed parked sales. Restoring one repopulates the cart.

    // Tag each hold with which till/branch created it, for the OPEN SALE list
    function currentTillLabel() {
        var s = getSessionTill();
        if (!s) return null;
        return s.branch ? (s.branch + ' · TILL # ' + s.num) : ('TILL # ' + s.num);
    }

    // ON HOLD button is dual-purpose: with items scanned, it puts the current
    // sale on hold and empties the cart; with nothing scanned, it instead opens
    // the list of sales other tills/customers currently have on hold.
    document.querySelector('.c-hold').addEventListener('click', function () {
        if (!cart.length) { openHeldSalesModal(this, 'ON HOLD'); return; }
        openActionModal('ON HOLD', holdModalHtml(), this);
        var el = document.getElementById('holdCustomerNameInput');
        if (el) el.focus();
    });

    function holdModalHtml() {
        var total = cart.reduce(function (sum, l) { return sum + lineTotal(l); }, 0);
        return '<div class="am-section">' +
            '<div class="am-target">Amount: ' + money(total) + '</div>' +
            '<input class="am-field" id="holdCustomerNameInput" placeholder="Customer name (optional)" autocomplete="off">' +
            '<button type="button" class="am-btn primary" data-action="hold-confirm">PUT ON HOLD</button>' +
            '</div>';
    }

    function submitHold() {
        var nameEl = document.getElementById('holdCustomerNameInput');
        var customerName = nameEl ? nameEl.value.trim() : '';
        var items = cart.map(function (l) {
            var item = { sku: l.sku, name: l.name, price: l.price, quantity: l.qty };
            if (l.discountType && l.discountValue) {
                item.discountType = l.discountType;
                item.discountValue = l.discountValue;
            }
            return item;
        });
        fetch(TILL_API_BASE + '/api/holds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items, till_label: currentTillLabel(), customer_name: customerName || undefined })
        }).then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data.success) { showToast('Could not hold sale', 'error'); return; }
            showToast('Sale on hold - ticket #' + data.token, 'ok');
            closeActionModal();
            clearSale();
        }).catch(function () { showToast('Backend unreachable - is the till server running?', 'error'); });
    }

    // OPEN SALE: typed digits become a price (last 2 digits = pence, i.e.
    // split off by the decimal point) and add a generic-price line.
    function formatOpenSalePrice(raw) {
        var digits = raw.replace(/[^0-9]/g, '');
        if (!digits) return null;
        return parseInt(digits, 10) / 100;
    }

    function addOpenSaleItem(price) {
        addToCart({ sku: 'OPEN-' + price.toFixed(2), name: 'Open Sale Item', price: price }, 1);
        showToast('Open sale item added: ' + money(price), 'ok');
    }

    var openSaleBtn = document.querySelector('.c-opensale');

    function disarmOpenSale() {
        openSaleArmed = false;
        openSaleBtn.classList.remove('selected');
    }

    // No popup: with a price already typed it's added immediately; with
    // nothing typed it just arms the till so the next digits + ENTER add
    // an open-sale line at that price.
    openSaleBtn.addEventListener('click', function () {
        if (dataInput) {
            var price = formatOpenSalePrice(dataInput);
            dataInput = '';
            renderDataInput();
            if (price !== null) addOpenSaleItem(price);
        } else {
            openSaleArmed = true;
            openSaleBtn.classList.add('selected');
            showToast('Type a price, then ENTER', null);
        }
        focusScanCapture();
    });

    // Quick-price column beside the keypad: one tap adds an open-sale line
    // at that fixed price, no typing needed.
    document.querySelectorAll('.open-sale-quick-btn[data-price]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            addOpenSaleItem(parseFloat(btn.getAttribute('data-price')));
            focusScanCapture();
        });
    });

    function openHeldSalesModal(triggerBtn, title) {
        openActionModal(title || 'OPEN SALE', '<div class="am-list" id="heldSalesList"><div class="am-empty">Loading…</div></div>', triggerBtn);
        fetch(TILL_API_BASE + '/api/holds')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var list = document.getElementById('heldSalesList');
                if (!list) return; // modal was closed before this resolved
                var holds = data.holds || [];
                if (!holds.length) { list.innerHTML = '<div class="am-empty">No held sales</div>'; return; }
                // Newest hold first, so the most recent customers on hold are the ones
                // visible without scrolling; older holds sit further down the list.
                holds.sort(function (a, b) { return (b.token || 0) - (a.token || 0); });
                list.innerHTML = holds.map(function (h) {
                    var dt = new Date(h.created_at * 1000);
                    var when = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString();
                    var from = h.till_label ? (' · ' + escapeHtml(h.till_label)) : '';
                    var who = h.customer_name ? (' &middot; ' + escapeHtml(h.customer_name)) : '';
                    return '<button type="button" class="am-row held-sale-row" data-action="hold-open" data-hold-id="' + h.id + '">' +
                        '<span><span class="am-row-ticket">Ticket #' + h.token + '</span>' + who + '<span class="am-row-sub">' + when + ' · ' + h.item_count + ' item(s)' + from + '</span></span>' +
                        '<span class="am-row-value">' + money(h.total) + '</span>' +
                        '</button>';
                }).join('');
                capHeldSalesListHeight(list);
            })
            .catch(function () {
                var list = document.getElementById('heldSalesList');
                if (list) list.innerHTML = '<div class="am-empty">Backend unreachable</div>';
            });
    }

    // Caps the held-sales list to roughly 10 rows tall so the popup opens at a
    // consistent "10 customers" size instead of growing with every extra hold;
    // anything past the 10th scrolls inside the list rather than growing the modal.
    var HELD_SALES_VISIBLE_ROWS = 10;

    function capHeldSalesListHeight(list) {
        var rows = list.querySelectorAll('.am-row');
        if (rows.length <= HELD_SALES_VISIBLE_ROWS) { list.style.maxHeight = ''; return; }
        var first = rows[0];
        var rowHeight = first.getBoundingClientRect().height;
        var gap = parseFloat(getComputedStyle(list).rowGap || getComputedStyle(list).gap || '0');
        var visibleHeight = rowHeight * HELD_SALES_VISIBLE_ROWS + gap * (HELD_SALES_VISIBLE_ROWS - 1);
        list.style.maxHeight = visibleHeight + 'px';
        list.style.overflowY = 'auto';
    }

    function openHeldSale(holdId) {
        if (cart.length) { showToast('Clear or hold the current sale first', 'error'); return; }
        fetch(TILL_API_BASE + '/api/holds/' + encodeURIComponent(holdId))
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.found) { showToast('Hold not found', 'error'); return; }
                data.hold.items.forEach(function (item) {
                    cart.push({
                        sku: item.sku, name: item.name, price: item.price, qty: item.quantity,
                        discountType: item.discountType, discountValue: item.discountValue
                    });
                });
                renderCart();
                closeActionModal();
                showToast('Held sale restored', 'ok');
                fetch(TILL_API_BASE + '/api/holds/' + encodeURIComponent(holdId), { method: 'DELETE' }).catch(function () {});
            })
            .catch(function () { showToast('Backend unreachable', 'error'); });
    }

    // GOODS RETURN: a blind return, not tied to the original receipt.
    // Uses its own scratch cart so it never touches the live sale.
    var returnCart = [];

    document.querySelector('.c-return').addEventListener('click', function () {
        returnCart = [];
        openActionModal('GOODS RETURN', returnModalHtml(), this);
        focusReturnInput();
    });

    function returnModalHtml() {
        return '<div class="am-section">' +
            '<div class="am-scan-row">' +
                '<input class="am-field" id="returnScanInput" placeholder="Scan or type code" autocomplete="off">' +
                '<button type="button" class="am-btn primary" data-action="return-scan">ADD</button>' +
            '</div>' +
            '<div class="am-list" id="returnList"><div class="am-empty">No items scanned yet</div></div>' +
            '<div class="am-btn-row">' +
                '<button type="button" class="am-btn primary" data-action="return-confirm">CONFIRM RETURN</button>' +
            '</div>' +
            '<div class="am-row-sub">Exchange only - no cash or card refund is given.</div>' +
            '</div>';
    }

    function focusReturnInput() {
        var el = document.getElementById('returnScanInput');
        if (el) el.focus();
    }

    function commitReturnScan() {
        var input = document.getElementById('returnScanInput');
        var code = input ? input.value.trim() : '';
        if (!code) return;
        input.value = '';
        fetch(TILL_API_BASE + '/api/product/' + encodeURIComponent(code))
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok || !result.data.found) { showToast('Product not found: ' + code, 'error'); return; }
                var product = result.data.product;
                var existing = returnCart.filter(function (l) { return l.sku === product.sku; })[0];
                if (existing) existing.qty += 1;
                else returnCart.push({ sku: product.sku, name: product.name, price: product.price || 0, qty: 1 });
                renderReturnList();
            })
            .catch(function () { showToast('Backend unreachable', 'error'); });
        focusReturnInput();
    }

    function renderReturnList() {
        var list = document.getElementById('returnList');
        if (!list) return;
        if (!returnCart.length) { list.innerHTML = '<div class="am-empty">No items scanned yet</div>'; return; }
        list.innerHTML = returnCart.map(function (line, index) {
            return '<button type="button" class="am-row" data-action="return-void" data-index="' + index + '">' +
                '<span>' + line.name + ' × ' + line.qty + '</span>' +
                '<span class="am-row-value">' + money(line.price * line.qty) + '</span>' +
                '</button>';
        }).join('');
    }

    function submitReturn() {
        if (!returnCart.length) { showToast('Scan at least one item', 'error'); return; }
        var items = returnCart.map(function (l) { return { sku: l.sku, quantity: l.qty }; });
        fetch(TILL_API_BASE + '/api/checkout/return', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items, register_id: selectedRegisterId() })
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok || !result.data.success) {
                showToast('Return failed: ' + (result.data.error || 'unknown error'), 'error');
                return;
            }
            showToast('Return recorded - ' + money(Math.abs(result.data.amount)), 'ok');
            closeActionModal();
        }).catch(function () { showToast('Backend unreachable', 'error'); });
    }

    // INQUIRY: price lookup only, never touches the cart
    document.querySelector('.c-inquiry').addEventListener('click', function () {
        openActionModal('INQUIRY', inquiryModalHtml(), this);
        var el = document.getElementById('inquiryCodeInput');
        if (el) el.focus();
    });

    function inquiryModalHtml() {
        return '<div class="am-section">' +
            '<div class="am-scan-row">' +
                '<input class="am-field" id="inquiryCodeInput" placeholder="Scan or type code" autocomplete="off">' +
                '<button type="button" class="am-btn primary" data-action="inquiry-lookup">LOOK UP</button>' +
            '</div>' +
            '<div class="am-empty" id="inquiryResult">Scan an item to see its price</div>' +
            '</div>';
    }

    function commitInquiry() {
        var input = document.getElementById('inquiryCodeInput');
        var code = input ? input.value.trim() : '';
        if (!code) return;
        var resultEl = document.getElementById('inquiryResult');
        fetch(productLookupUrl(code))
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!resultEl) return;
                if (!result.ok || !result.data.found) { resultEl.textContent = 'Not found: ' + code; return; }
                var p = result.data.product;
                var promoHtml = p.original_price
                    ? '<br><span class="line-was-price">was ' + money(p.original_price) + '</span>' +
                      '<span class="line-promo-tag">' + escapeHtml(p.promotion_name || 'PROMO') + '</span>'
                    : '';
                resultEl.innerHTML = '<strong>' + p.name + '</strong><br>' + money(p.price) + promoHtml;
                input.value = '';
                input.focus();
            })
            .catch(function () { if (resultEl) resultEl.textContent = 'Backend unreachable'; });
    }

    // VOUCHER: redeems a gift voucher/card as payment for the current cart
    document.querySelector('.c-voucher').addEventListener('click', function () {
        if (!cart.length) { showToast('Cart is empty', 'error'); return; }
        openActionModal('VOUCHER', voucherModalHtml(), this);
        var el = document.getElementById('voucherCodeInput');
        if (el) el.focus();
    });

    function voucherModalHtml() {
        var total = cart.reduce(function (sum, l) { return sum + lineTotal(l); }, 0);
        return '<div class="am-section">' +
            '<div class="am-target">Amount: ' + money(total) + '</div>' +
            '<input class="am-field" id="voucherCodeInput" placeholder="Voucher / gift card code" autocomplete="off">' +
            '<button type="button" class="am-btn primary" data-action="voucher-confirm">REDEEM VOUCHER</button>' +
            '<button type="button" class="am-btn ghost" data-action="voucher-add-credit">ADD CREDIT</button>' +
            '</div>';
    }

    function submitVoucher() {
        var input = document.getElementById('voucherCodeInput');
        var code = input ? input.value.trim() : '';
        fetch(TILL_API_BASE + '/api/checkout/voucher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cartToItems(), voucher_code: code || undefined, register_id: selectedRegisterId() })
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok || !result.data.success) {
                showToast('Voucher sale failed: ' + (result.data.error || 'unknown error'), 'error');
                return;
            }
            showToast('Voucher sale complete - ' + money(result.data.amount), 'ok');
            closeActionModal();
            clearSale();
        }).catch(function () { showToast('Backend unreachable', 'error'); });
    }

    // ADD CREDIT: a store-credit card visual for customers who return goods
    // without exchanging them. Purely a printable/visual card - no balance
    // is stored or redeemable in the system.
    var creditCardOverlay = document.getElementById('creditCardOverlay');

    function generateCreditSerial() {
        var digits = '';
        for (var i = 0; i < 12; i++) digits += Math.floor(Math.random() * 10);
        return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    }

    function openCreditCardPopup() {
        var total = cart.reduce(function (sum, l) { return sum + lineTotal(l); }, 0);
        var serialEl = document.getElementById('creditCardSerial');
        if (serialEl) serialEl.textContent = generateCreditSerial();
        var amountInput = document.getElementById('creditCardAmountInput');
        if (amountInput) amountInput.value = total ? total.toFixed(2) : '';
        creditCardOverlay.classList.add('open');
    }

    function closeCreditCardPopup() {
        creditCardOverlay.classList.remove('open');
    }

    document.getElementById('creditCardCloseBtn').addEventListener('click', closeCreditCardPopup);
    document.getElementById('creditCardDoneBtn').addEventListener('click', closeCreditCardPopup);
    creditCardOverlay.addEventListener('click', function (e) {
        if (e.target === creditCardOverlay) closeCreditCardPopup();
    });

    // SETTINGS: registers, payment types, connection status, and a Profile
    // card that edits the logged-in user's real account
    document.getElementById('sidebarSettingsBtn').addEventListener('click', openSettingsModal);

    // INVENTORY: opens the main inventory dashboard here as a popup iframe,
    // so the till's sale/session isn't abandoned. Hands off the operator's
    // session via postMessage (not localStorage) so the operator doesn't have
    // to log in again inside it - postMessage works even when this till page
    // and the backend's index.html are on different origins/ports (e.g. this
    // page opened through a dev live-reload server instead of the backend's
    // own static mount), where localStorage would never be shared. The popup
    // pings this window once its own message listener is ready (see
    // frontend/dashboard.js's tryInventoryHandoff), and only then is the
    // session actually sent, targeted at TILL_API_BASE specifically so it
    // can't be delivered to some other origin.
    var pendingInventoryHandoffId = null;
    var pendingInventoryHandoffPayload = null;
    var inventoryHandoffListenerAttached = false;

    function ensureInventoryHandoffListener() {
        if (inventoryHandoffListenerAttached) return;
        inventoryHandoffListenerAttached = true;
        window.addEventListener('message', function (event) {
            var iframe = document.getElementById('inventoryPopupIframe');
            if (!iframe || event.source !== iframe.contentWindow) return;
            var data = event.data;
            if (!data || data.type !== 'amsons-inventory-handoff-ready' || data.handoffId !== pendingInventoryHandoffId) return;
            if (!pendingInventoryHandoffPayload) return;
            iframe.contentWindow.postMessage({
                type: 'amsons-inventory-handoff',
                handoffId: pendingInventoryHandoffId,
                payload: pendingInventoryHandoffPayload
            }, TILL_API_BASE);
        });
    }

    function openInventoryPopup() {
        var session = getAmsonsSession();
        var handoffId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        pendingInventoryHandoffId = handoffId;
        pendingInventoryHandoffPayload = {
            username: session ? session.username : '',
            name: session ? session.name : '',
            email: session ? session.email : '',
            role: session ? session.role : 'staff',
            token: session ? session.token : null
        };
        ensureInventoryHandoffListener();

        setBtnBusy(document.getElementById('keypadInventoryBtn'), true);

        var iframe = document.getElementById('inventoryPopupIframe');
        // Always a fresh src, so a stale handoff id gets replaced with a new one
        iframe.setAttribute('src', TILL_API_BASE + '/index.html?handoff=' + encodeURIComponent(handoffId));
        document.getElementById('inventoryPopupOverlay').classList.add('open');

        // Wait a couple frames so the slide-in transition actually animates
        var panel = document.getElementById('inventoryPopupPanel');
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                panel.classList.add('slide-in');
            });
        });
    }

    function closeInventoryPopup() {
        var panel = document.getElementById('inventoryPopupPanel');
        panel.classList.remove('slide-in');
        // Wait for the slide-out transition before actually hiding the overlay
        setTimeout(function () {
            document.getElementById('inventoryPopupOverlay').classList.remove('open');
            document.getElementById('inventoryPopupIframe').removeAttribute('src');
            setBtnBusy(document.getElementById('keypadInventoryBtn'), false);
            pendingInventoryHandoffId = null;
            pendingInventoryHandoffPayload = null;
        }, 350);
    }

    document.getElementById('keypadInventoryBtn').addEventListener('click', openInventoryPopup);
    document.getElementById('inventoryPopupCloseBtn').addEventListener('click', closeInventoryPopup);

    // Reuses the logged-in session saved by login.js
    function getCurrentUser() {
        var session = getAmsonsSession();
        if (!session) return null;
        return { id: session.username, name: session.name, email: session.email, photo: null };
    }

    function avatarInnerHtml(user, editable) {
        var editCls = editable ? ' editable' : '';
        if (user && user.photo) {
            return '<div class="avatar-circle stg-avatar' + editCls + '" id="settingsAvatarBox"><img src="' + user.photo + '" alt=""></div>';
        }
        return '<div class="avatar-circle stg-avatar' + editCls + '" id="settingsAvatarBox"><svg><use href="#i-person"/></svg></div>';
    }

    function openSettingsModal() {
        renderSettingsMenu();
    }

    // SETTINGS home: a card per function, each opening its own screen (or, for
    // MAIN MENU/EXIT, acting immediately).
    function renderSettingsMenu() {
        openActionModal('SETTINGS', '' +
            '<div class="stg-card-grid stg-slide-left">' +
                '<button type="button" class="stg-card" data-action="settings-main-menu">' +
                    '<span class="stg-card-icon"><svg><use href="#i-grid"/></svg></span>MAIN MENU' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-exit">' +
                    '<span class="stg-card-icon"><svg><use href="#i-power"/></svg></span>EXIT' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-open-invoices">' +
                    '<span class="stg-card-icon"><svg><use href="#i-voucher"/></svg></span>INVOICES' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-open-utilities">' +
                    '<span class="stg-card-icon"><svg><use href="#i-wrench"/></svg></span>SYSTEM UTILITIES' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-open-readings">' +
                    '<span class="stg-card-icon"><svg><use href="#i-chart"/></svg></span>TILL READINGS' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-open-management">' +
                    '<span class="stg-card-icon"><svg><use href="#i-shield"/></svg></span>MANAGEMENT' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-coming-soon" data-title="TIME CLOCK">' +
                    '<span class="stg-card-icon"><svg><use href="#i-clock"/></svg></span>TIME CLOCK' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-coming-soon" data-title="SHELF LABEL">' +
                    '<span class="stg-card-icon"><svg><use href="#i-printer"/></svg></span>SHELF LABEL' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-coming-soon" data-title="OTHER FUNCTIONS">' +
                    '<span class="stg-card-icon"><svg><use href="#i-dots"/></svg></span>OTHER FUNCTIONS' +
                '</button>' +
                '<button type="button" class="stg-card" data-action="settings-coming-soon" data-title="PAID OUT">' +
                    '<span class="stg-card-icon"><svg><use href="#i-coins"/></svg></span>PAID OUT' +
                '</button>' +
            '</div>');
    }

    // Generic "not built yet" screen for a settings function, so every card
    // in the grid does something instead of a dead button. backAction lets a
    // sub-grid's cards (e.g. TILL READINGS) return to that sub-grid instead
    // of all the way back to the SETTINGS home.
    function renderSettingsComingSoon(title, backAction) {
        actionModalTitle.textContent = title;
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml(backAction || 'settings-back') +
                '<div class="am-empty">This feature is coming soon.</div>' +
            '</div>';
    }

    // TILL READINGS: X-Reading, Z-Reading, Z-Reprint, and a General Report -
    // a 2x2 card grid reusing the SETTINGS popup's own dark gold-ring card
    // design, just shown as its own screen inside the same popup shell.
    function renderSettingsReadings() {
        actionModalTitle.textContent = 'TILL READINGS';
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml('settings-back') +
                '<div class="stg-card-grid cols-2">' +
                    '<button type="button" class="stg-card" data-action="reading-x">' +
                        '<span class="stg-card-icon"><svg><use href="#i-receipt-x"/></svg></span>X-Reading' +
                    '</button>' +
                    '<button type="button" class="stg-card" data-action="reading-z">' +
                        '<span class="stg-card-icon"><svg><use href="#i-receipt-z"/></svg></span>Z-Reading' +
                    '</button>' +
                    '<button type="button" class="stg-card" data-action="settings-coming-soon" data-title="Z-REPRINT" data-back="settings-open-readings">' +
                        '<span class="stg-card-icon"><svg><use href="#i-receipt-z-reprint"/></svg></span>Z-Reprint' +
                    '</button>' +
                    '<button type="button" class="stg-card" data-action="settings-coming-soon" data-title="GENERAL REPORT" data-back="settings-open-readings">' +
                        '<span class="stg-card-icon"><svg><use href="#i-report"/></svg></span>General Report' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function stgBackButtonHtml(action) {
        return '<button type="button" class="stg-back-btn" data-action="' + action + '">' +
            '<svg class="stg-back-icon"><use href="#i-arrow-left"/></svg>BACK</button>';
    }

    // Renders the sale-count/tax/payment-type breakdown an X or Z reading
    // returns, as a read-only list in the same shell every other settings
    // screen uses.
    function renderReadingResult(title, reading) {
        actionModalTitle.textContent = title;
        var paymentRows = (reading.payments || []).map(function (p) {
            return '<div class="am-row" style="cursor:default;"><span>' + (p.name || '') + '</span><span class="am-row-value">' + money(p.total) + '</span></div>';
        }).join('');
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml('settings-open-readings') +
                '<div class="am-empty">Till opened ' + (reading.register_open_time ? new Date(reading.register_open_time).toLocaleString() : 'unknown') + '</div>' +
                paymentRows +
                '<div class="am-row" style="cursor:default;"><span>Tax</span><span class="am-row-value">' + money(reading.tax_total) + '</span></div>' +
                '<div class="am-row" style="cursor:default;"><span>Sales (' + reading.sale_count + ')</span><span class="am-row-value">' + money(reading.gross_total) + '</span></div>' +
            '</div>';
    }

    function renderReadingError(title, message) {
        actionModalTitle.textContent = title;
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml('settings-open-readings') +
                '<div class="am-empty">' + message + '</div>' +
            '</div>';
    }

    // X-READING: read-only, so it fires straight off the card tap - no
    // confirmation needed since nothing in Lightspeed changes.
    function openXReading() {
        actionModalTitle.textContent = 'X-READING';
        actionModalBody.innerHTML = '<div class="am-list stg-slide-right">' +
            stgBackButtonHtml('settings-open-readings') +
            '<div class="am-empty" id="xReadingLoading">Loading&hellip;</div>' +
        '</div>';
        fetch(TILL_API_BASE + '/api/till-readings/x?register_id=' + encodeURIComponent(selectedRegisterId() || ''))
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                // If the operator has already navigated elsewhere by the time this
                // resolves, the loading marker is gone - bail instead of clobbering
                // whatever screen they're on now (same guard openRegisterPicker etc. use).
                if (!document.getElementById('xReadingLoading')) return;
                if (!result.ok || !result.data.success) {
                    renderReadingError('X-READING', result.data.error || 'Unknown error');
                    return;
                }
                renderReadingResult('X-READING', result.data);
                printReading('X-READING', result.data);
            })
            .catch(function () {
                if (document.getElementById('xReadingLoading')) renderReadingError('X-READING', 'Backend unreachable');
            });
    }

    // Z-READING: closes out the trading period and zeroes the till's
    // running totals, so it asks for a confirmation first instead of firing
    // straight off the card tap like X-Reading does.
    function renderZReadingConfirm() {
        actionModalTitle.textContent = 'Z-READING';
        actionModalBody.innerHTML = '' +
            '<div class="am-section stg-slide-right">' +
                stgBackButtonHtml('settings-open-readings') +
                '<div class="am-empty">This closes out the till&rsquo;s current trading period, archives the sales figures, and resets its totals to zero for the next shift. Running it early ends the current trading period before it is finished.</div>' +
                '<div class="am-btn-row">' +
                    '<button type="button" class="am-btn ghost" data-action="settings-open-readings">CANCEL</button>' +
                    '<button type="button" class="am-btn primary" data-action="reading-z-confirm">RUN Z-READING</button>' +
                '</div>' +
            '</div>';
    }

    function runZReading() {
        actionModalTitle.textContent = 'Z-READING';
        actionModalBody.innerHTML = '<div class="am-list stg-slide-right">' +
            '<div class="am-empty">Closing till and generating Z report&hellip;</div>' +
        '</div>';
        fetch(TILL_API_BASE + '/api/till-readings/z', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ register_id: selectedRegisterId() })
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok || !result.data.success) {
                renderReadingError('Z-READING', result.data.error || 'Unknown error');
                return;
            }
            renderReadingResult('Z-READING', result.data);
            printReading('Z-READING', result.data);
            showToast('Z-Reading complete - till reset for the next shift', 'ok');
        }).catch(function () { renderReadingError('Z-READING', 'Backend unreachable'); });
    }

    function renderSettingsProfile() {
        var user = getCurrentUser();
        var session = getAmsonsSession();
        var role = (session && (session.role === 'admin' || session.role === 'management')) ? 'ADMIN' : 'STAFF';

        actionModalTitle.textContent = 'MANAGEMENT';
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml('settings-back') +
                '<div class="stg-profile-card">' +
                    avatarInnerHtml(user, false) +
                    '<div class="stg-profile-info">' +
                        '<div class="stg-profile-name">' + (user ? user.name : 'Unknown user') + '</div>' +
                        '<div class="stg-profile-sub">' + (user ? user.email : '') + '</div>' +
                        '<div class="stg-profile-sub">' + (user ? user.id : '') + ' &middot; ' + role + '</div>' +
                    '</div>' +
                    '<button type="button" class="am-btn primary" style="flex:none;" data-action="settings-edit-profile">EDIT</button>' +
                '</div>' +
            '</div>';
    }

    function renderSettingsInvoices() {
        actionModalTitle.textContent = 'INVOICES';
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml('settings-back') +
                '<div id="settingsInvoiceList"><div class="am-empty">Loading&hellip;</div></div>' +
            '</div>';
        loadRecentInvoices();
    }

    // SYSTEM UTILITIES: register/payment/till-number setup plus the
    // Lightspeed connection check, all in one screen
    function renderSettingsSetup() {
        var currentRegister = localStorage.getItem('amsonsRegisterName') || 'Default (.env)';
        var fixedTill = getFixedTillNumber();
        actionModalTitle.textContent = 'SYSTEM UTILITIES';
        actionModalBody.innerHTML = '' +
            '<div class="am-list stg-slide-right">' +
                stgBackButtonHtml('settings-back') +
                '<button type="button" class="am-row" data-action="utility-registers">' +
                    '<span>Select Register</span><span class="am-row-sub">' + currentRegister + '</span>' +
                '</button>' +
                '<button type="button" class="am-row" data-action="utility-payment-types">' +
                    '<span>Payment Types</span><span class="am-row-sub">View configured</span>' +
                '</button>' +
                '<button type="button" class="am-row" data-action="utility-till-number">' +
                    '<span>This Till&rsquo;s Number</span><span class="am-row-sub">' +
                        (fixedTill ? ('TILL # ' + fixedTill) : 'Auto (not fixed)') +
                    '</span>' +
                '</button>' +
                '<button type="button" class="am-row" data-action="utility-connection">' +
                    '<span>Lightspeed Connection</span><span class="am-row-value" id="utilConnStatus">Check</span>' +
                '</button>' +
            '</div>';
    }

    // This Till's Number: pins a till number to this computer's browser
    function openTillNumberPicker() {
        actionModalTitle.textContent = 'THIS TILL’S NUMBER';
        var fixedTill = getFixedTillNumber();
        var rows = '';
        for (var n = 1; n <= 9; n++) {
            rows += '<button type="button" class="am-row" data-action="till-number-select" data-till-number="' + n + '">' +
                '<span>TILL # ' + n + '</span>' +
                (fixedTill === n ? '<span class="am-row-sub">Current</span>' : '') +
            '</button>';
        }
        actionModalBody.innerHTML = '<div class="am-list stg-slide-right">' +
            stgBackButtonHtml('settings-back-setup') +
            '<div class="am-empty">Pin a fixed number to this computer so it always shows the same till, no matter what other tills are open.</div>' +
            rows +
            '<button type="button" class="am-row" data-action="till-number-clear"><span>Auto (release fixed number)</span></button>' +
        '</div>';
    }

    function selectTillNumber(n) {
        setFixedTillNumber(n);
        showToast('This till is now fixed to TILL # ' + n, 'ok');
        renderSettingsSetup();
    }

    function clearTillNumberSetting() {
        clearFixedTillNumber();
        showToast('This till is back to auto numbering', 'ok');
        renderSettingsSetup();
    }

    // Profile edit: name/email/picture always editable, PIN only if a new one is typed
    var pendingPhotoDataUrl = null;

    function renderSettingsEdit() {
        var user = getCurrentUser();
        if (!user) { showToast('No logged-in user found', 'error'); renderSettingsProfile(); return; }
        pendingPhotoDataUrl = null;

        actionModalTitle.textContent = 'EDIT PROFILE';
        actionModalBody.innerHTML = '' +
            '<div class="am-section">' +
                '<div style="display:flex;justify-content:center;">' + avatarInnerHtml(user, true) + '</div>' +
                '<input type="file" accept="image/*" id="settingsPhotoInput" style="display:none;">' +

                '<div class="stg-field-label">NAME</div>' +
                '<input type="text" class="am-field" id="settingsNameField" value="' + user.name + '">' +

                '<div class="stg-field-label">EMAIL</div>' +
                '<input type="email" class="am-field" id="settingsEmailField" value="' + user.email + '">' +

                '<div class="stg-field-label">NEW PIN (leave blank to keep current)</div>' +
                '<input type="password" class="am-field" id="settingsPinField" maxlength="4" inputmode="numeric" placeholder="&bull;&bull;&bull;&bull;">' +

                '<div class="stg-field-label">CONFIRM NEW PIN</div>' +
                '<input type="password" class="am-field" id="settingsPinConfirmField" maxlength="4" inputmode="numeric" placeholder="&bull;&bull;&bull;&bull;">' +

                '<div class="stg-field-label">CURRENT PIN (required only if changing PIN)</div>' +
                '<input type="password" class="am-field" id="settingsCurrentPinField" maxlength="4" inputmode="numeric" placeholder="&bull;&bull;&bull;&bull;">' +

                '<div class="am-btn-row">' +
                    '<button type="button" class="am-btn ghost" data-action="settings-cancel-edit">CANCEL</button>' +
                    '<button type="button" class="am-btn primary" data-action="settings-save-profile">SAVE</button>' +
                '</div>' +
            '</div>';
    }

    function saveProfileEdit() {
        var session = getAmsonsSession();
        if (!session) { showToast('No logged-in user found', 'error'); return; }

        var name = (document.getElementById('settingsNameField').value || '').trim();
        var email = (document.getElementById('settingsEmailField').value || '').trim();
        var pin = (document.getElementById('settingsPinField').value || '').trim();
        var pinConfirm = (document.getElementById('settingsPinConfirmField').value || '').trim();
        var currentPin = (document.getElementById('settingsCurrentPinField').value || '').trim();

        if (!name) { showToast('Enter a name', 'error'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Enter a valid email', 'error'); return; }
        if (pin || pinConfirm) {
            if (!/^\d{4}$/.test(pin)) { showToast('PIN must be exactly 4 digits', 'error'); return; }
            if (pin !== pinConfirm) { showToast('PINs do not match', 'error'); return; }
            if (!/^\d{4}$/.test(currentPin)) { showToast('Enter your current PIN to change it', 'error'); return; }
        }

        // Same account as the main app's login: name/email, PIN, and photo each
        // go through their own backend endpoint
        var profileFormData = new FormData();
        profileFormData.append('username', session.username);
        profileFormData.append('name', name);
        profileFormData.append('email', email);

        fetch(MAIN_API_BASE + '/api/update-profile', { method: 'POST', body: profileFormData })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok) { showToast(result.data.detail || 'Update failed', 'error'); return; }

                session.name = name;
                session.email = email;
                saveAmsonsSession(session);
                var adminNameEl = document.querySelector('#dashboardScreen .admin-name');
                if (adminNameEl) adminNameEl.textContent = name;

                var pinPromise = pin ? (function () {
                    var pinFormData = new FormData();
                    pinFormData.append('username', session.username);
                    pinFormData.append('old_password', currentPin);
                    pinFormData.append('new_password', pin);
                    return fetch(MAIN_API_BASE + '/api/change-password', { method: 'POST', body: pinFormData })
                        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
                        .then(function (result) { if (!result.ok) throw new Error(result.data.detail || 'PIN change failed'); });
                })() : Promise.resolve();

                var photoPromise = pendingPhotoDataUrl ? (function () {
                    var photoFormData = new FormData();
                    photoFormData.append('username', session.username);
                    photoFormData.append('facePhoto', pendingPhotoDataUrl);
                    return fetch(MAIN_API_BASE + '/api/update-face-photo', { method: 'POST', body: photoFormData })
                        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
                        .then(function (result) { if (!result.ok) throw new Error(result.data.detail || 'Photo update failed'); });
                })() : Promise.resolve();

                Promise.all([pinPromise, photoPromise]).then(function () {
                    showToast('Profile updated', 'ok');
                    renderSettingsProfile();
                }).catch(function (err) {
                    showToast(err.message || 'Profile saved, but a change failed', 'error');
                    renderSettingsProfile();
                });
            })
            .catch(function () { showToast('Backend unreachable', 'error'); });
    }

    // INVOICES: last 10 sales pulled from Lightspeed
    function loadRecentInvoices() {
        fetch(TILL_API_BASE + '/api/sales/recent?limit=10')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var list = document.getElementById('settingsInvoiceList');
                if (!list) return;
                var sales = data.sales || [];
                if (!sales.length) { list.innerHTML = '<div class="am-empty">No invoices yet</div>'; return; }
                list.innerHTML = sales.map(function (s) {
                    return '<div class="stg-invoice-row" style="margin-bottom:0.6vh;">' +
                        '<span>#' + s.id + '<span class="am-row-sub">' + (s.date || '') + '</span></span>' +
                        '<span class="am-row-value">' + money(s.total) + '</span>' +
                    '</div>';
                }).join('');
            })
            .catch(function () {
                var list = document.getElementById('settingsInvoiceList');
                if (list) list.innerHTML = '<div class="am-empty">Backend unreachable</div>';
            });
    }

    function checkLightspeedConnection() {
        var statusEl = document.getElementById('utilConnStatus');
        if (statusEl) statusEl.textContent = 'Checking…';
        fetch(TILL_API_BASE + '/api/health/lightspeed')
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!statusEl) return;
                statusEl.textContent = result.data.connected ? ('Connected: ' + result.data.retailer) : ('Error: ' + result.data.error);
            })
            .catch(function () { if (statusEl) statusEl.textContent = 'Backend unreachable'; });
    }

    function openRegisterPicker() {
        actionModalTitle.textContent = 'SELECT REGISTER';
        actionModalBody.innerHTML = '<div class="am-list stg-slide-right">' +
            stgBackButtonHtml('settings-back-setup') +
            '<div id="registerList"><div class="am-empty">Loading…</div></div>' +
        '</div>';
        fetch(TILL_API_BASE + '/api/registers')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var list = document.getElementById('registerList');
                if (!list) return;
                var registers = data.registers || [];
                if (!registers.length) { list.innerHTML = '<div class="am-empty">No registers found</div>'; return; }
                list.innerHTML = registers.map(function (r) {
                    return '<button type="button" class="am-row" data-action="register-select" data-register-id="' + r.id +
                        '" data-register-name="' + r.name + '"><span>' + r.name + '</span></button>';
                }).join('');
            })
            .catch(function () {
                var list = document.getElementById('registerList');
                if (list) list.innerHTML = '<div class="am-empty">Backend unreachable</div>';
            });
    }

    function selectRegister(id, name) {
        localStorage.setItem('amsonsRegisterId', id);
        localStorage.setItem('amsonsRegisterName', name);
        showToast('Register set to ' + name, 'ok');
        renderSettingsSetup();
    }

    function openPaymentTypesList() {
        actionModalTitle.textContent = 'PAYMENT TYPES';
        actionModalBody.innerHTML = '<div class="am-list stg-slide-right">' +
            stgBackButtonHtml('settings-back-setup') +
            '<div id="paymentTypesList"><div class="am-empty">Loading…</div></div>' +
        '</div>';
        fetch(TILL_API_BASE + '/api/payment-types')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var list = document.getElementById('paymentTypesList');
                if (!list) return;
                var types = data.payment_types || [];
                if (!types.length) { list.innerHTML = '<div class="am-empty">None configured</div>'; return; }
                list.innerHTML = types.map(function (t) {
                    return '<div class="am-row" style="cursor:default;"><span>' + t.name + '</span></div>';
                }).join('');
            })
            .catch(function () {
                var list = document.getElementById('paymentTypesList');
                if (list) list.innerHTML = '<div class="am-empty">Backend unreachable</div>';
            });
    }

    // One delegated handler for every control inside the shared modal
    actionModalBody.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');
        if (!el) return;
        var action = el.dataset.action;

        if (action === 'clear-sale-digit') {
            var cd = el.dataset.digit;
            if (cd === 'back') {
                clearSalePinInput = clearSalePinInput.slice(0, -1);
            } else if (clearSalePinInput.length < 4) {
                clearSalePinInput += cd;
                if (clearSalePinInput.length === 4) submitClearSalePin();
            }
            renderClearSaleFields();
        } else if (action === 'clear-sale-confirm') {
            submitClearSalePin();
        } else if (action === 'hold-open') {
            openHeldSale(el.dataset.holdId);
        } else if (action === 'hold-confirm') {
            submitHold();
        } else if (action === 'return-scan') {
            commitReturnScan();
        } else if (action === 'return-void') {
            returnCart.splice(parseInt(el.dataset.index, 10), 1);
            renderReturnList();
        } else if (action === 'return-confirm') {
            submitReturn();
        } else if (action === 'inquiry-lookup') {
            commitInquiry();
        } else if (action === 'voucher-confirm') {
            submitVoucher();
        } else if (action === 'voucher-add-credit') {
            openCreditCardPopup();
        } else if (action === 'utility-connection') {
            checkLightspeedConnection();
        } else if (action === 'utility-registers') {
            openRegisterPicker();
        } else if (action === 'utility-payment-types') {
            openPaymentTypesList();
        } else if (action === 'register-select') {
            selectRegister(el.dataset.registerId, el.dataset.registerName);
        } else if (action === 'utility-till-number') {
            openTillNumberPicker();
        } else if (action === 'till-number-select') {
            selectTillNumber(parseInt(el.dataset.tillNumber, 10));
        } else if (action === 'till-number-clear') {
            clearTillNumberSetting();
        } else if (action === 'settings-open-management') {
            renderSettingsProfile();
        } else if (action === 'settings-open-invoices') {
            renderSettingsInvoices();
        } else if (action === 'settings-open-utilities') {
            renderSettingsSetup();
        } else if (action === 'settings-coming-soon') {
            renderSettingsComingSoon(el.dataset.title || '', el.dataset.back);
        } else if (action === 'settings-open-readings') {
            renderSettingsReadings();
        } else if (action === 'reading-x') {
            openXReading();
        } else if (action === 'reading-z') {
            renderZReadingConfirm();
        } else if (action === 'reading-z-confirm') {
            runZReading();
        } else if (action === 'settings-main-menu') {
            closeActionModal();
            document.getElementById('backToBranchBtn').click();
        } else if (action === 'settings-exit') {
            closeActionModal();
            document.getElementById('dashLogoutBtn').click();
        } else if (action === 'settings-back') {
            renderSettingsMenu();
        } else if (action === 'settings-back-setup') {
            renderSettingsSetup();
        } else if (action === 'settings-edit-profile') {
            renderSettingsEdit();
        } else if (action === 'settings-cancel-edit') {
            renderSettingsProfile();
        } else if (action === 'settings-save-profile') {
            saveProfileEdit();
        }
    });

    // Profile picture picker: avatar tap opens the file input, picked image previews immediately
    actionModalBody.addEventListener('click', function (e) {
        var avatar = e.target.closest('#settingsAvatarBox.editable');
        if (!avatar) return;
        var input = document.getElementById('settingsPhotoInput');
        if (input) input.click();
    });

    actionModalBody.addEventListener('change', function (e) {
        if (e.target.id !== 'settingsPhotoInput') return;
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            pendingPhotoDataUrl = reader.result;
            var avatar = document.getElementById('settingsAvatarBox');
            if (avatar) avatar.innerHTML = '<img src="' + pendingPhotoDataUrl + '" alt="">';
        };
        reader.readAsDataURL(file);
    });

    // Enter key in the modal's scan/code fields acts like tapping ADD/LOOK UP
    actionModalBody.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        if (e.target.id === 'returnScanInput') { e.preventDefault(); commitReturnScan(); }
        else if (e.target.id === 'inquiryCodeInput') { e.preventDefault(); commitInquiry(); }
        else if (e.target.id === 'holdCustomerNameInput') { e.preventDefault(); submitHold(); }
    });

    // QUICK PRODUCTS + CATEGORIES: pulled live from Lightspeed on every
    // dashboard load. The 4th category slot (NO BARCODE ITEMS) is a till
    // function, not a Lightspeed category.

    var categoryList = [];

    var productsGrid = document.getElementById('productsGrid');
    var catPickerOverlay = document.getElementById('catPickerOverlay');
    var catPickerTitle = document.getElementById('catPickerTitle');
    var catPickerGrid = document.getElementById('catPickerGrid');

    // Every actual best-selling product gets a button; the grid scrolls internally
    function renderBestSellerProducts(products) {
        productsGrid.innerHTML = '';
        if (!products.length) {
            productsGrid.innerHTML = '<div class="cat-picker-empty">No sales yet to rank best sellers</div>';
            return;
        }
        products.forEach(function (product) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'prod-btn' + (product.image_url ? ' has-image' : '');
            var media = product.image_url
                ? '<img class="prod-img" src="' + escapeHtml(product.image_url) + '" alt="" loading="lazy">'
                : '<svg class="cat-icon"><use href="#i-trending"/></svg>';
            btn.innerHTML = media + '<span class="btn-label">' + escapeHtml(product.name) + '</span>';
            var img = btn.querySelector('.prod-img');
            if (img) {
                // Broken/expired Lightspeed image URL - fall back to the plain icon look
                img.addEventListener('error', function () {
                    btn.classList.remove('has-image');
                    img.replaceWith(iconEl('i-trending'));
                });
            }
            btn.addEventListener('click', function () {
                var quantity = pendingQty || 1;
                pendingQty = null;
                renderDataInput();
                addToCart(product, quantity);
            });
            productsGrid.appendChild(btn);
        });
    }

    function loadQuickAccess() {
        var registerId = selectedRegisterId();
        var bestSellersUrl = TILL_API_BASE + '/api/products/best-sellers' +
            (registerId ? '?register_id=' + encodeURIComponent(registerId) : '');
        fetch(bestSellersUrl)
            .then(function (res) { return res.json(); })
            .then(function (data) { renderBestSellerProducts(data.products || []); })
            .catch(function () { /* leave grid empty */ });

        fetch(TILL_API_BASE + '/api/categories')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                categoryList = (data.categories || []).slice(0, 9);
                var buttons = document.querySelectorAll('.cat-btn');
                var icons = ['i-menitems', 'i-womenitems', 'i-blackseed', 'i-box', 'i-box', 'i-box', 'i-box', 'i-box', 'i-box'];
                // Slots 0-8 are live Lightspeed categories (as many as there are, up
                // to 9) - hide any that come back empty rather than show a blank
                // placeholder card. Slot 9 (NO BARCODE) is a fixed till function,
                // never touched here.
                for (var i = 0; i < icons.length; i++) {
                    if (!buttons[i]) continue;
                    var category = categoryList[i];
                    if (!category) {
                        buttons[i].hidden = true;
                        continue;
                    }
                    buttons[i].hidden = false;
                    buttons[i].innerHTML = '<svg class="cat-icon"><use href="#' + icons[i] + '"/></svg>' +
                        '<span class="btn-label">' + escapeHtml(category.name) + '</span>';
                }
            })
            .catch(function () { /* leave placeholders */ });
    }

    // Daily weather -> sales-outlook bulletin shown in the small white card
    // above the categories block, for whichever branch this till session is
    // running (Small Heath / Alum Rock / Bradford). Backend caches this per
    // branch for a day, so one fetch per dashboard load is enough. Called
    // again from branch.js once the user actually picks a branch card.
    var lastWeatherData = null;
    var weatherTypewriterTimer = null;

    function stopWeatherTypewriter() {
        if (weatherTypewriterTimer) {
            clearTimeout(weatherTypewriterTimer);
            weatherTypewriterTimer = null;
        }
    }

    // The masthead already shows "BULLETIN" once, so drop a redundant
    // leading "BULLETIN:" from the headline text itself (both the AI
    // headline and the hard-coded fallbacks in weather.py use that prefix).
    function stripBulletinPrefix(headline) {
        return (headline || '').replace(/^\s*BULLETIN:\s*/i, '');
    }

    // Types the headline into tickerEl/textEl one letter at a time (like
    // someone live-typing the bulletin) while pushing the ticker's scroll
    // position to follow the last letter typed - so the line is typed
    // letter by letter AND slowly slides left as it grows (words forming as
    // their letters land), like a wire-service ticker, rather than freezing
    // once it outgrows the box. Pauses once fully typed, then clears and
    // retypes - an endless loop.
    function typeWeatherHeadline(tickerEl, textEl, headline) {
        stopWeatherTypewriter();
        var chars = (headline || '').split('');

        function runCycle() {
            textEl.textContent = '';
            tickerEl.scrollLeft = 0;
            var i = 0;
            function typeNext() {
                if (i >= chars.length) {
                    weatherTypewriterTimer = setTimeout(function () {
                        weatherTypewriterTimer = setTimeout(runCycle, 600);
                    }, 4500);
                    return;
                }
                var ch = chars[i];
                textEl.textContent += ch;
                tickerEl.scrollLeft = tickerEl.scrollWidth;
                i++;
                // Slow, slightly uneven pacing (with a little extra pause after
                // each word) so it reads like a person actually writing it,
                // not a fixed-speed animation.
                var delay = 110 + Math.random() * 70;
                if (ch === ' ') delay += 120;
                weatherTypewriterTimer = setTimeout(typeNext, delay);
            }
            typeNext();
        }
        runCycle();
    }

    function loadWeatherInsight(branchName) {
        var cardEl = document.getElementById('weatherCard');
        var tickerEl = document.getElementById('weatherTicker');
        var textEl = document.getElementById('weatherTickerText');
        if (!cardEl || !tickerEl || !textEl) return;

        if (!branchName) {
            var till = getSessionTill();
            branchName = till && till.branch;
        }
        var url = TILL_API_BASE + '/api/weather/insight' +
            (branchName ? '?branch=' + encodeURIComponent(branchName) : '');

        fetch(url)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                lastWeatherData = data;
                cardEl.className = 'weather-card ' + (data.signal || '') + (data.rain_alert ? ' rain-alert' : '');
                typeWeatherHeadline(tickerEl, textEl, stripBulletinPrefix(data.headline));
            })
            .catch(function () {
                lastWeatherData = null;
                cardEl.className = 'weather-card red';
                typeWeatherHeadline(tickerEl, textEl, 'Weather insight unavailable right now.');
            });
    }

    // Clicking the bulletin opens a popup with the full day's forecast and
    // the sales-outlook/rain-chance numbers behind today's headline.
    var weatherPopupOverlay = document.getElementById('weatherPopupOverlay');
    var weatherPopupBody = document.getElementById('weatherPopupBody');

    function salesOutlookInfo(pct) {
        if (pct >= 70) return { cls: 'good', label: 'Good' };
        if (pct >= 45) return { cls: 'fair', label: 'Fair' };
        return { cls: 'poor', label: 'Poor' };
    }

    function renderWeatherPopup(data) {
        if (!weatherPopupBody) return;
        if (!data) {
            weatherPopupBody.innerHTML = '<div class="weather-popup-empty">Weather insight unavailable right now.</div>';
            return;
        }
        var salesPct = data.sales_probability != null ? data.sales_probability : 50;
        var sales = salesOutlookInfo(salesPct);
        var rainPct = data.rain_probability != null ? data.rain_probability + '%' : '—';

        var forecastRows = (data.forecast || []).map(function (block) {
            return '<div class="weather-popup-forecast-row">' +
                '<span class="wf-time">' + escapeHtml(block.time) + '</span>' +
                '<span class="wf-cond">' + escapeHtml(block.condition) + '</span>' +
                '<span class="wf-temp">' + block.temp_c + '°C</span>' +
                '<span class="wf-pop">' + block.pop + '% rain</span>' +
                '</div>';
        }).join('');

        weatherPopupBody.innerHTML =
            '<div class="weather-popup-summary">' +
                '<div class="weather-popup-temp">' + (data.temp_c != null ? data.temp_c + '°C' : '—') + '</div>' +
                '<div class="weather-popup-condition">' + escapeHtml(data.condition || 'Unknown') + '</div>' +
            '</div>' +
            '<div class="weather-popup-gauge-row">' +
                '<div class="weather-popup-gauge">' +
                    '<div class="weather-popup-gauge-value ' + sales.cls + '">' + salesPct + '%</div>' +
                    '<div class="weather-popup-gauge-label">Sales Outlook &ndash; ' + sales.label + '</div>' +
                '</div>' +
                '<div class="weather-popup-gauge">' +
                    '<div class="weather-popup-gauge-value fair">' + rainPct + '</div>' +
                    '<div class="weather-popup-gauge-label">Rain Chance Today</div>' +
                '</div>' +
            '</div>' +
            '<div class="weather-popup-forecast-title">Full-Day Forecast</div>' +
            (forecastRows || '<div class="weather-popup-empty">No hourly forecast available.</div>');
    }

    function closeWeatherPopup() {
        weatherPopupOverlay.classList.remove('open');
    }

    if (weatherPopupOverlay && weatherPopupBody) {
        document.getElementById('weatherCard').addEventListener('click', function () {
            renderWeatherPopup(lastWeatherData);
            weatherPopupOverlay.classList.add('open');
        });
        document.getElementById('weatherPopupCloseBtn').addEventListener('click', closeWeatherPopup);
        weatherPopupOverlay.addEventListener('click', function (e) {
            if (e.target === weatherPopupOverlay) closeWeatherPopup();
        });
    }

    function openCategoryPicker(category) {
        catPickerTitle.textContent = category.name;
        catPickerGrid.innerHTML = '<div class="cat-picker-empty">Loading…</div>';
        catPickerOverlay.classList.add('open');

        var registerId = selectedRegisterId();
        var categoryProductsUrl = TILL_API_BASE + '/api/categories/' + encodeURIComponent(category.id) + '/products' +
            (registerId ? '?register_id=' + encodeURIComponent(registerId) : '');
        fetch(categoryProductsUrl)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var products = data.products || [];
                if (!products.length) {
                    catPickerGrid.innerHTML = '<div class="cat-picker-empty">No products in this category</div>';
                    return;
                }
                catPickerGrid.innerHTML = '';
                products.forEach(function (product) {
                    var item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'cat-pick-item';
                    var priceHtml = '<span class="cat-pick-price">' + money(product.price) + '</span>';
                    if (product.original_price) {
                        priceHtml = '<span class="cat-pick-price">' +
                            '<span class="line-was-price">was ' + money(product.original_price) + '</span> ' +
                            money(product.price) +
                            '<span class="line-promo-tag">' + escapeHtml(product.promotion_name || 'PROMO') + '</span>' +
                            '</span>';
                    }
                    item.innerHTML = '<span>' + product.name + '</span>' + priceHtml;
                    item.addEventListener('click', function () {
                        var quantity = pendingQty || 1;
                        pendingQty = null;
                        renderDataInput();
                        addToCart(product, quantity);
                        showToast('Added: ' + product.name, 'ok');
                    });
                    catPickerGrid.appendChild(item);
                });
            })
            .catch(function () {
                catPickerGrid.innerHTML = '<div class="cat-picker-empty">Backend unreachable</div>';
            });
    }

    document.querySelectorAll('.cat-btn').forEach(function (btn, i) {
        btn.addEventListener('click', function () {
            var category = categoryList[i];
            if (!category) return; // slot 4 or not yet loaded
            openCategoryPicker(category);
        });
    });

    document.getElementById('catPickerCloseBtn').addEventListener('click', function () {
        catPickerOverlay.classList.remove('open');
    });
    catPickerOverlay.addEventListener('click', function (e) {
        if (e.target === catPickerOverlay) catPickerOverlay.classList.remove('open');
    });

    loadQuickAccess();
    loadWeatherInsight();

    renderCart();
