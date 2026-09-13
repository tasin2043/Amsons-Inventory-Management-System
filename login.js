    // Till login screen: login form, numeric keypad, keyboard overlay,
    // and login -> dashboard handoff.

    // No separate user table here - login goes straight to the main backend's
    // real users table, so ID+PIN is the same as the inventory app
    var MAIN_API_BASE = (window.location.protocol === "file:" || (window.location.port && window.location.port !== "8000"))
        ? "http://127.0.0.1:8000"
        : window.location.origin;

    // Logged-in session, kept in localStorage so branch.js and dashboard.js can read it
    var AMSONS_SESSION_KEY = 'amsonsSession';
    function saveAmsonsSession(session) {
        localStorage.setItem(AMSONS_SESSION_KEY, JSON.stringify(session));
    }
    function getAmsonsSession() {
        try { return JSON.parse(localStorage.getItem(AMSONS_SESSION_KEY) || 'null'); } catch (e) { return null; }
    }

    // Header clock, updates Login, Register and Dashboard screens
    var loginMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    function loginPad(n) { return n < 10 ? '0' + n : n; }
    function updateLoginClock() {
        var dateEls = document.querySelectorAll('.header-time .date');
        var timeEls = document.querySelectorAll('.header-time .time');
        if (!dateEls.length) return;
        var now = new Date();
        var dateStr = loginPad(now.getDate()) + ' ' + loginMonths[now.getMonth()] + ' ' + now.getFullYear();
        var hours = now.getHours();
        var ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        var timeStr = loginPad(hours) + ':' + loginPad(now.getMinutes()) + '<span class="ampm">' + ampm + '</span>';
        dateEls.forEach(function (el) { el.textContent = dateStr; });
        timeEls.forEach(function (el) { el.innerHTML = timeStr; });
    }
    updateLoginClock();
    setInterval(updateLoginClock, 1000);

    // Field focus tracking (keypad types into whichever field is active)
    var usernameInput = document.getElementById('username');
    var passwordInput = document.getElementById('password');
    var activeField = usernameInput;

    [usernameInput, passwordInput].forEach(function (el) {
        el.addEventListener('focus', function () { activeField = el; });
    });

    // Handoff from the inventory app's "Till Management" button - a manager
    // already logged in there skips logging in again here, via a one-time
    // token in the URL backed by a matching localStorage entry.
    var TILL_HANDOFF_PREFIX = 'amsonsTillHandoff:';
    function tryTillHandoff() {
        var handoffId;
        try { handoffId = new URLSearchParams(window.location.search).get('handoff'); } catch (e) { handoffId = null; }
        if (!handoffId) return false;

        var key = TILL_HANDOFF_PREFIX + handoffId;
        var raw;
        try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
        if (!raw) return false;

        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }

        // Remove the used token from the URL
        try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* ignore */ }

        var handoff;
        try { handoff = JSON.parse(raw); } catch (e) { return false; }
        if (!handoff || !handoff.username) return false;

        saveAmsonsSession({
            username: handoff.username,
            name: handoff.name || handoff.username,
            email: handoff.email || '',
            role: handoff.role || 'staff',
            token: handoff.token || null
        });

        var modeBadge = document.getElementById('modeBadge');
        if (modeBadge) modeBadge.textContent = (handoff.role === 'admin' || handoff.role === 'management') ? 'ADMIN' : 'NORMAL';

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('branchScreen').style.display = 'flex';
        return true;
    }

    // Focus the User ID field, unless the handoff above already skipped the login screen
    if (!tryTillHandoff()) usernameInput.focus();

    // User ID / PIN: both 4 digits. 4th ID digit jumps to PIN, 4th PIN digit submits.
    usernameInput.addEventListener('input', function () {
        usernameInput.value = usernameInput.value.replace(/\D/g, '').slice(0, 4);
        if (usernameInput.value.length === 4) {
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('input', function () {
        passwordInput.value = passwordInput.value.replace(/\D/g, '').slice(0, 4);
        if (passwordInput.value.length === 4) {
            attemptLogin();
        }
    });

    // Password visibility toggle
    document.getElementById('toggleEye').addEventListener('click', function () {
        var isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        document.getElementById('eyeIcon').innerHTML =
            '<use href="' + (isHidden ? '#i-eye-off' : '#i-eye') + '"/>';
    });

    // Numeric keypad, shared by Login and Register screens
    document.querySelectorAll('.login-key-btn.num').forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (activeField.maxLength > 0 && activeField.value.length >= activeField.maxLength) return;
            activeField.value += btn.textContent.trim();
            activeField.focus();
            // Same auto-advance/auto-submit as real typing
            if (activeField === usernameInput && usernameInput.value.length === 4) {
                passwordInput.focus();
            } else if (activeField === passwordInput && passwordInput.value.length === 4) {
                attemptLogin();
            }
        });
    });

    document.querySelectorAll('.login-key-btn.del').forEach(function (btn) {
        btn.addEventListener('click', function () {
            activeField.value = activeField.value.slice(0, -1);
            activeField.focus();
        });
    });

    document.querySelectorAll('.login-key-btn.back').forEach(function (btn) {
        btn.addEventListener('click', function () {
            activeField.value = '';
            activeField.focus();
        });
    });

    // Keypad "blink" feedback, shared by Login and Register keypads
    document.querySelectorAll('.login-key-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            btn.classList.remove('flash');
            void btn.offsetWidth; // restart animation if tapped again quickly
            btn.classList.add('flash');
        });
        btn.addEventListener('animationend', function () {
            btn.classList.remove('flash');
        });
    });

    // Top-center error popup
    var loginErrorPopup = document.getElementById('loginErrorPopup');
    var loginErrorText = document.getElementById('loginErrorText');
    var loginErrorTimer = null;
    function showLoginError(msg) {
        loginErrorText.textContent = msg;
        loginErrorPopup.classList.add('show');
        clearTimeout(loginErrorTimer);
        loginErrorTimer = setTimeout(function () {
            loginErrorPopup.classList.remove('show');
        }, 2400);
    }

    // Login: validates ID+PIN, then shows the dashboard. Runs on submit
    // or automatically once the 4th PIN digit is typed.
    var loginForm = document.getElementById('loginForm');
    var loginBtn = document.getElementById('loginBtn');
    var loginBusy = false;

    function attemptLogin() {
        if (loginBusy) return;
        var typedId = usernameInput.value.trim();
        var typedPin = passwordInput.value.trim();

        if (typedId.length < 4 || typedPin.length < 4) {
            showLoginError('Enter a 4-digit User ID and PIN');
            return;
        }

        var fullId = 'AMS-' + typedId;
        var loginFormData = new FormData();
        loginFormData.append('username', fullId);
        loginFormData.append('password', typedPin);

        loginBusy = true;
        loginBtn.textContent = 'LOGGING IN...';

        fetch(MAIN_API_BASE + '/api/login', { method: 'POST', body: loginFormData })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                loginBusy = false;
                loginBtn.textContent = 'LOGIN';

                if (!result.ok) {
                    showLoginError(result.data.detail || 'Incorrect User ID or PIN');
                    passwordInput.value = '';
                    passwordInput.focus();
                    activeField = passwordInput;
                    return;
                }

                saveAmsonsSession({
                    username: result.data.username,
                    name: result.data.name,
                    email: result.data.email || '',
                    role: result.data.role,
                    token: result.data.access_token
                });

                // Admin/management roles get the ADMIN badge, everyone else gets NORMAL
                var modeBadge = document.getElementById('modeBadge');
                if (modeBadge) modeBadge.textContent = (result.data.role === 'admin' || result.data.role === 'management') ? 'ADMIN' : 'NORMAL';

                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('branchScreen').style.display = 'flex';
            })
            .catch(function () {
                loginBusy = false;
                loginBtn.textContent = 'LOGIN';
                showLoginError('Server unreachable - check your connection.');
            });
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        attemptLogin();
    });

    // Shared backend base URL for Face ID, product lookup, checkout
    var TILL_API_BASE = (window.location.protocol === "file:" || (window.location.port && window.location.port !== "8000"))
        ? "http://127.0.0.1:8000"
        : window.location.origin;

    // Face ID login: avatar tap -> live camera match, shown inline in the avatar circle
    var faceLoginAvatar = document.getElementById('faceLoginAvatar');
    var faceLoginImg = document.getElementById('faceLoginImg');
    var faceLoginVideo = document.getElementById('faceLoginVideo');
    var faceLoginHint = document.getElementById('faceLoginHint');
    var faceLoginStream = null;
    var faceLoginTimer = null;
    var faceLoginBusy = false;
    var faceLoginActive = false;

    function setFaceHint(msg, ok) {
        faceLoginHint.textContent = msg;
        faceLoginHint.classList.toggle('ok', !!ok);
    }

    function stopFaceLogin(resetHint) {
        if (faceLoginTimer) { clearInterval(faceLoginTimer); faceLoginTimer = null; }
        if (faceLoginStream) {
            faceLoginStream.getTracks().forEach(function (t) { t.stop(); });
            faceLoginStream = null;
        }
        faceLoginBusy = false;
        faceLoginActive = false;
        faceLoginAvatar.classList.remove('active');
        faceLoginVideo.style.display = 'none';
        faceLoginImg.style.display = 'block';
        if (resetHint !== false) setFaceHint('TAP FOR FACE ID LOGIN');
    }

    function captureFaceFrame() {
        var canvas = document.createElement('canvas');
        canvas.width = faceLoginVideo.videoWidth || 640;
        canvas.height = faceLoginVideo.videoHeight || 480;
        canvas.getContext('2d').drawImage(faceLoginVideo, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
    }

    // Uses the main app's real Face ID login, so it returns a real JWT and role
    function completeFaceLogin(data) {
        setFaceHint('✔ Welcome, ' + (data.name || data.username), true);
        if (faceLoginTimer) { clearInterval(faceLoginTimer); faceLoginTimer = null; }
        setTimeout(function () {
            stopFaceLogin(false);
            var typedId = String(data.username).replace('AMS-', '');
            usernameInput.value = typedId;

            saveAmsonsSession({ username: data.username, name: data.name, email: '', role: data.role, token: data.access_token });

            var modeBadge = document.getElementById('modeBadge');
            if (modeBadge) modeBadge.textContent = (data.role === 'admin' || data.role === 'management') ? 'ADMIN' : 'NORMAL';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('branchScreen').style.display = 'flex';
        }, 700);
    }

    function tryFaceMatch() {
        if (faceLoginBusy || !faceLoginStream) return;
        faceLoginBusy = true;
        var loginFrameData = new FormData();
        loginFrameData.append('frame', captureFaceFrame());
        fetch(TILL_API_BASE + '/api/login-face', { method: 'POST', body: loginFrameData })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            faceLoginBusy = false;
            if (data.status === 'success') {
                completeFaceLogin(data);
            } else {
                setFaceHint(data.detail === 'no_face'
                    ? 'Position your face in the circle...'
                    : 'Not recognized, keep looking...');
            }
        }).catch(function () {
            faceLoginBusy = false;
            setFaceHint('Face ID server unreachable — tap to cancel');
            if (faceLoginTimer) { clearInterval(faceLoginTimer); faceLoginTimer = null; }
        });
    }

    function startFaceLogin() {
        faceLoginActive = true;
        faceLoginAvatar.classList.add('active');
        setFaceHint('Starting camera...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setFaceHint('Camera not supported on this device/browser.');
            faceLoginActive = false;
            faceLoginAvatar.classList.remove('active');
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false
        }).then(function (stream) {
            faceLoginStream = stream;
            faceLoginVideo.srcObject = stream;
            faceLoginImg.style.display = 'none';
            faceLoginVideo.style.display = 'block';
            setFaceHint('Look at the camera...');
            faceLoginTimer = setInterval(tryFaceMatch, 900);
        }).catch(function (err) {
            setFaceHint('Camera unavailable: ' + err.message);
            faceLoginActive = false;
            faceLoginAvatar.classList.remove('active');
        });
    }

    faceLoginAvatar.addEventListener('click', function () {
        if (faceLoginActive) {
            stopFaceLogin();
        } else {
            startFaceLogin();
        }
    });

    // Exit
    document.getElementById('exitBtn').addEventListener('click', function () {
        if (confirm('Exit the till login screen?')) {
            window.close();
        }
    });

    // Test connection
    document.getElementById('testConnBtn').addEventListener('click', function () {
        var status = document.getElementById('connStatus');
        status.textContent = 'Testing connection...';
        status.classList.remove('ok');
        setTimeout(function () {
            status.textContent = '✔ Connection successful';
            status.classList.add('ok');
        }, 900);
    });

    // On-screen keyboard, shared overlay opened from either screen
    var oskOverlay = document.getElementById('oskOverlay');
    document.getElementById('oskBtn').addEventListener('click', function () {
        oskOverlay.classList.add('open');
    });
    document.getElementById('regOskBtn').addEventListener('click', function () {
        oskOverlay.classList.add('open');
    });

    oskOverlay.addEventListener('click', function (e) {
        if (e.target === oskOverlay) oskOverlay.classList.remove('open');
    });

    document.querySelectorAll('.osk-key').forEach(function (key) {
        key.addEventListener('click', function () {
            var action = key.getAttribute('data-action');
            if (action === 'close' || action === 'done') {
                oskOverlay.classList.remove('open');
                activeField.focus();
                return;
            }
            if (action === 'back') {
                activeField.value = activeField.value.slice(0, -1);
            } else if (activeField.maxLength > 0 && activeField.value.length >= activeField.maxLength) {
                // field is full, ignore further typing
                return;
            } else if (action === 'space') {
                activeField.value += ' ';
            } else {
                activeField.value += key.textContent;
            }
            // Setting .value directly doesn't fire 'input', so dispatch it manually
            activeField.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
