    // Employee registration screen: Login <-> Register nav, employee id,
    // PIN fields, and selfie camera capture.

    // Live preview of the next employee id; re-fetched fresh on submit below
    function showNextId() {
        var idLabel = document.getElementById('regIdNumber');
        fetch(MAIN_API_BASE + '/api/next-staff-id')
            .then(function (res) { return res.json(); })
            .then(function (data) { idLabel.textContent = (data.next_id || '').replace('AMS-', ''); })
            .catch(function () { idLabel.textContent = '----'; });
    }

    // Navigation between Login <-> Register
    var loginScreenEl = document.getElementById('loginScreen');
    var registerScreenEl = document.getElementById('registerScreen');

    document.getElementById('goRegisterBtn').addEventListener('click', function () {
        showNextId();
        loginScreenEl.style.display = 'none';
        registerScreenEl.style.display = 'flex';
    });

    document.getElementById('backToLoginBtn').addEventListener('click', function () {
        stopCamera();
        registerScreenEl.style.display = 'none';
        loginScreenEl.style.display = 'flex';
        usernameInput.focus();
        activeField = usernameInput;
    });

    // Field focus tracking, shares the login screen's "activeField" variable
    var regName = document.getElementById('regName');
    var regEmail = document.getElementById('regEmail');
    var regPassword = document.getElementById('regPassword');
    var regConfirmPassword = document.getElementById('regConfirmPassword');
    [regName, regEmail, regPassword, regConfirmPassword].forEach(function (el) {
        el.addEventListener('focus', function () { activeField = el; });
    });

    // PIN visibility toggles
    function wireEye(btnId, iconId, input) {
        document.getElementById(btnId).addEventListener('click', function () {
            var isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            document.getElementById(iconId).innerHTML =
                '<use href="' + (isHidden ? '#i-eye-off' : '#i-eye') + '"/>';
        });
    }
    wireEye('regToggleEye1', 'regEyeIcon1', regPassword);
    wireEye('regToggleEye2', 'regEyeIcon2', regConfirmPassword);

    // Selfie camera capture: guided multi-angle Face ID enrollment
    var FACE_STEPS = [
        'Look straight at the camera',
        'Slowly turn your head to the LEFT',
        'Slowly turn your head to the RIGHT',
        'Tilt your head UP a little',
        'Tilt your head DOWN a little'
    ];

    var selfieVideo = document.getElementById('selfieVideo');
    var selfieImg = document.getElementById('selfieImg');
    var selfiePlaceholder = document.getElementById('selfiePlaceholder');
    var selfieStepRow = document.getElementById('selfieStepRow');
    var selfieStepText = document.getElementById('selfieStepText');
    var selfieDots = document.getElementById('selfieDots');
    var cameraStream = null;
    var selfieDataUrls = [];
    var cameraErrored = false;

    selfieDots.innerHTML = FACE_STEPS.map(function () { return '<span class="selfie-dot"></span>'; }).join('');

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(function (t) { t.stop(); });
            cameraStream = null;
        }
    }

    function updateStepUi() {
        var step = selfieDataUrls.length;
        selfieDots.querySelectorAll('.selfie-dot').forEach(function (dot, i) {
            dot.classList.toggle('done', i < step);
        });
        if (step < FACE_STEPS.length) {
            selfieStepText.textContent = 'Step ' + (step + 1) + ' of ' + FACE_STEPS.length + ': ' + FACE_STEPS[step];
            document.getElementById('captureBtn').textContent = 'CAPTURE PHOTO ' + (step + 1) + ' / ' + FACE_STEPS.length;
        }
    }

    function startCamera() {
        var status = document.getElementById('cameraStatus');
        status.textContent = 'Opening camera...';
        status.classList.remove('ok');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            cameraErrored = true;
            status.textContent = 'Camera not supported on this device/browser.';
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
            audio: false
        }).then(function (stream) {
            cameraStream = stream;
            selfieVideo.srcObject = stream;
            selfiePlaceholder.style.display = 'none';
            selfieImg.style.display = 'none';
            selfieVideo.style.display = 'block';
            selfieStepRow.style.display = 'flex';
            document.getElementById('startRow').style.display = 'none';
            document.getElementById('captureRow').style.display = 'flex';
            document.getElementById('retakeRow').style.display = 'none';
            status.textContent = '';
            updateStepUi();
        }).catch(function (err) {
            cameraErrored = true;
            status.textContent = 'Camera unavailable: ' + err.message;
        });
    }

    document.getElementById('startCameraBtn').addEventListener('click', startCamera);

    document.getElementById('captureBtn').addEventListener('click', function () {
        var canvas = document.createElement('canvas');
        canvas.width = selfieVideo.videoWidth;
        canvas.height = selfieVideo.videoHeight;
        canvas.getContext('2d').drawImage(selfieVideo, 0, 0, canvas.width, canvas.height);
        selfieDataUrls.push(canvas.toDataURL('image/jpeg', 0.92));

        var status = document.getElementById('cameraStatus');

        if (selfieDataUrls.length >= FACE_STEPS.length) {
            selfieImg.src = selfieDataUrls[0];
            selfieVideo.style.display = 'none';
            selfieImg.style.display = 'block';
            stopCamera();
            selfieStepRow.style.display = 'none';
            document.getElementById('captureRow').style.display = 'none';
            document.getElementById('retakeRow').style.display = 'flex';
            status.textContent = '✔ ' + selfieDataUrls.length + ' photos captured for Face ID';
            status.classList.add('ok');
        } else {
            updateStepUi();
            status.textContent = '✔ Photo ' + selfieDataUrls.length + ' captured';
            status.classList.add('ok');
        }
    });

    document.getElementById('retakeBtn').addEventListener('click', function () {
        selfieDataUrls = [];
        var status = document.getElementById('cameraStatus');
        status.textContent = '';
        status.classList.remove('ok');
        startCamera();
    });

    function resetSelfie() {
        stopCamera();
        selfieDataUrls = [];
        cameraErrored = false;
        selfieVideo.style.display = 'none';
        selfieImg.style.display = 'none';
        selfiePlaceholder.style.display = 'flex';
        selfieStepRow.style.display = 'none';
        document.getElementById('startRow').style.display = 'flex';
        document.getElementById('captureRow').style.display = 'none';
        document.getElementById('retakeRow').style.display = 'none';
        updateStepUi();
        var status = document.getElementById('cameraStatus');
        status.textContent = '';
        status.classList.remove('ok');
    }

    // Register form submit
    var registerForm = document.getElementById('registerForm');
    var registerBtn = document.getElementById('registerBtn');
    var registerStatus = document.getElementById('registerStatus');

    function regError(msg) {
        registerStatus.textContent = msg;
        registerStatus.classList.remove('ok');
        registerBtn.classList.add('error');
        setTimeout(function () { registerBtn.classList.remove('error'); }, 500);
    }

    registerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = regName.value.trim();
        var email = regEmail.value.trim();
        var pass = regPassword.value.trim();
        var confirm = regConfirmPassword.value.trim();

        if (!name) { regError('Please enter your full name'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { regError('Please enter a valid email'); return; }
        if (!/^\d{4}$/.test(pass)) { regError('Password must be exactly 4 digits'); return; }
        if (pass !== confirm) { regError('Passwords do not match'); return; }
        if (selfieDataUrls.length < FACE_STEPS.length && !cameraErrored) {
            regError('Please capture all ' + FACE_STEPS.length + ' Face ID photos');
            return;
        }

        registerBtn.disabled = true;
        registerStatus.classList.remove('ok');
        registerStatus.textContent = 'Creating account...';

        function finishRegistration(newId, message) {
            registerStatus.classList.add('ok');
            registerStatus.textContent = message;
            setTimeout(function () {
                registerForm.reset();
                resetSelfie();
                registerStatus.textContent = '';
                registerStatus.classList.remove('ok');
                registerBtn.disabled = false;

                registerScreenEl.style.display = 'none';
                loginScreenEl.style.display = 'flex';
                usernameInput.value = newId.replace('AMS-', '');
                passwordInput.value = '';
                passwordInput.focus();
                activeField = passwordInput;
            }, 1400);
        }

        // Registers into the main backend's real users table, so this account
        // also works to log into the inventory app
        fetch(MAIN_API_BASE + '/api/next-staff-id')
            .then(function (res) { return res.json(); })
            .then(function (idData) {
                var newId = idData.next_id;

                var registrationFormData = new FormData();
                registrationFormData.append('staff_id', newId);
                registrationFormData.append('name', name);
                registrationFormData.append('email', email);
                registrationFormData.append('password', pass);
                registrationFormData.append('role', 'staff');
                // Sends all 5 angle photos for Face ID enrollment (needs 3+ usable ones)
                selfieDataUrls.forEach(function (photo) { registrationFormData.append('facePhotos', photo); });

                return fetch(MAIN_API_BASE + '/api/register-staff', { method: 'POST', body: registrationFormData })
                    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data, newId: newId }; }); });
            })
            .then(function (result) {
                if (!result.ok) {
                    registerBtn.disabled = false;
                    regError(result.data.detail || 'Registration failed');
                    return;
                }
                var newId = result.newId;
                // Face ID already enrolled in the call above
                finishRegistration(newId, '✔ Registered as ' + newId + ' — Face ID ready. Redirecting...');
            })
            .catch(function () {
                registerBtn.disabled = false;
                regError('Server unreachable - check your connection.');
            });
    });
