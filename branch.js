    // Choose Your Branch screen: picking a card opens the dashboard and
    // sets the header badge to that branch's short name.
    document.querySelectorAll('.branch-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var branchName = card.getAttribute('data-badge');
            var badge = document.querySelector('#dashboardScreen .alumrock-box');
            if (badge) badge.textContent = branchName;

            // Show whichever employee actually logged in, not a hardcoded name
            var adminName = 'ADMIN';
            var adminNameEl = document.querySelector('#dashboardScreen .admin-name');
            if (adminNameEl) {
                var session = getAmsonsSession();
                adminName = session ? session.name : (usernameInput.value.trim() || 'ADMIN');
                adminNameEl.textContent = adminName;
            }

            // Assign the next free till number within this branch
            var tillNumEl = document.getElementById('tillNumLabel');
            if (tillNumEl) tillNumEl.textContent = 'TILL # ' + assignTillNumber(branchName);

            document.getElementById('branchScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'flex';
            if (typeof focusScanCapture === 'function') requestAnimationFrame(focusScanCapture);
            if (typeof loadQuickAccess === 'function') loadQuickAccess();
            if (typeof loadWeatherInsight === 'function') loadWeatherInsight(branchName);

            // Voice greeting fires immediately, doesn't wait on the border light
            speakTillOpenGreeting(adminName, branchName);

            // Wait for the dashboard to lay out before drawing the border light
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    playTillOpenSequence(adminName, branchName);
                });
            });
        });
    });

    // Dashboard sidebar: BACK and LOGOUT both end the current till session,
    // freeing its till number back to the branch pool
    document.getElementById('backToBranchBtn').addEventListener('click', function () {
        releaseSessionTill(getSessionTill());
        document.getElementById('dashboardScreen').style.display = 'none';
        document.getElementById('branchScreen').style.display = 'flex';
    });

    // Logging out reloads the page so every screen resets to its starting state
    function doLogout() {
        releaseSessionTill(getSessionTill());
        window.location.reload();
    }

    document.getElementById('dashLogoutBtn').addEventListener('click', doLogout);

    var branchLogoutBtn = document.getElementById('branchLogoutBtn');
    if (branchLogoutBtn) branchLogoutBtn.addEventListener('click', doLogout);

    // Till-open border light + voice announcement, runs once after a branch is picked

    // Load speechSynthesis voices early since Chromium loads them lazily
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();

    function pickMaleVoice() {
        if (typeof speechSynthesis === 'undefined') return null;
        var voices = speechSynthesis.getVoices();
        if (!voices.length) return null;

        var english = voices.filter(function (v) { return /^en/i.test(v.lang); });
        var pool = english.length ? english : voices;

        // Known male voice names, scored so natural-sounding ones win
        var maleNames = ['Guy', 'Ryan', 'Daniel', 'David', 'Alex', 'Mark', 'James', 'Tom', 'George', 'Eric', 'Christopher', 'Male'];

        var scored = pool
            .filter(function (v) { return !/female/i.test(v.name); })
            .map(function (v) {
                var score = 0;
                if (/natural/i.test(v.name)) score += 10;
                if (maleNames.some(function (n) { return v.name.indexOf(n) !== -1; })) score += 5;
                if (v.localService) score += 1;
                return { voice: v, score: score };
            })
            .sort(function (a, b) { return b.score - a.score; });

        return scored.length ? scored[0].voice : pool[0];
    }

    function speakTillOpenGreeting(adminName, branchName) {
        if (typeof speechSynthesis === 'undefined') return;

        var text = 'Assalamu Alaikum, ' + adminName + '. Till is open for ' + branchName + ' branch now.';

        function say() {
            var utterance = new SpeechSynthesisUtterance(text);
            var voice = pickMaleVoice();
            if (voice) utterance.voice = voice;
            utterance.rate = 0.95;
            utterance.pitch = 0.85;
            speechSynthesis.speak(utterance);
        }

        // Wait for the voice list if it's not ready yet
        if (speechSynthesis.getVoices().length) {
            say();
        } else if ('onvoiceschanged' in speechSynthesis) {
            speechSynthesis.onvoiceschanged = function () {
                speechSynthesis.onvoiceschanged = null;
                say();
            };
        } else {
            say();
        }
    }
    function playTillOpenLight(topbarEl, onDone) {
        var svgNS = 'http://www.w3.org/2000/svg';
        var w = topbarEl.offsetWidth;
        var h = topbarEl.offsetHeight;

        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.classList.add('till-open-light-svg');

        // Path: right corner -> down -> across bottom -> up -> left corner
        var inset = 2;
        var path = document.createElementNS(svgNS, 'path');
        var d = 'M ' + (w - inset) + ' ' + inset +
                ' L ' + (w - inset) + ' ' + (h - inset) +
                ' L ' + inset + ' ' + (h - inset) +
                ' L ' + inset + ' ' + inset;
        path.setAttribute('d', d);
        path.setAttribute('stroke-width', '4');
        path.classList.add('till-open-light-path');
        svg.appendChild(path);
        topbarEl.appendChild(svg);

        var totalLen = path.getTotalLength();
        var dashLen = totalLen * 0.22;
        path.setAttribute('stroke-dasharray', dashLen + ' ' + totalLen);
        path.setAttribute('stroke-dashoffset', dashLen);

        var anim = path.animate(
            [
                { strokeDashoffset: dashLen, opacity: 0 },
                { strokeDashoffset: dashLen * 0.4, opacity: 1, offset: 0.08 },
                { strokeDashoffset: -(totalLen - dashLen * 0.6), opacity: 1, offset: 0.92 },
                { strokeDashoffset: -totalLen, opacity: 0 }
            ],
            { duration: 3000, easing: 'linear', fill: 'forwards' }
        );

        anim.onfinish = function () {
            svg.classList.add('fade-out');
            setTimeout(function () { svg.remove(); }, 400);
            if (onDone) onDone();
        };
    }

    function playTillOpenSequence(adminName, branchName) {
        // Runs around the full dashboard page, not just the header
        var screenEl = document.getElementById('dashboardScreen');
        if (!screenEl) return;
        playTillOpenLight(screenEl);
    }
