(function () {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------------------------------------------------------- */
    /* 1. Page-load stagger + REPLAY tiap keluar-masuk viewport           */
    /* ---------------------------------------------------------------- */
    (function loadIn() {
        var hero = document.getElementById('hero');
        if (!hero) return;

        var playInTimer = null;

        function playIn() {
            clearTimeout(playInTimer);
            // Pastikan transition normal nyala lagi (bukan lagi di-reset instan)
            // sebelum kita mulai animasi masuknya.
            hero.classList.remove('is-resetting');
            playInTimer = setTimeout(function () {
                hero.classList.add('is-loaded');
            }, 120);
        }

        function playOut() {
            clearTimeout(playInTimer);
            // BARU: nyalain 'is-resetting' bareng pas ngelepas 'is-loaded'.
            // '.hero.is-resetting [data-hero-in]' (lihat Hero.css) matiin
            // transition SEMENTARA, jadi elemen langsung "snap" balik ke
            // kondisi awal (opacity:0, translateY, blur) TANPA fade-out
            // pelan yang keliatan aneh pas lagi di-scroll ninggalin hero.
            hero.classList.add('is-resetting');
            hero.classList.remove('is-loaded');

            // Lepas lagi 'is-resetting' di frame berikutnya, biar transition
            // normal aktif lagi buat animasi masuk berikutnya (playIn).
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    hero.classList.remove('is-resetting');
                });
            });
        }

        function startObserving() {
            if (!('IntersectionObserver' in window)) {
                // Fallback browser lama: gak bisa replay, minimal tetep
                // main sekali kayak perilaku original dulu.
                playIn();
                return;
            }
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        playIn();
                    } else {
                        playOut();
                    }
                });
            }, { threshold: 0.25 }); // bisa diutak-atik: makin kecil, makin
                                     // cepat ke-trigger pas baru dikit yg
                                     // masuk/keluar viewport
            io.observe(hero);
        }

        // Tetep nunggu window 'load' dulu (sama kayak perilaku original),
        // biar pas pertama kali halaman dibuka, timing-nya identik kayak
        // sebelumnya. Observer baru mulai mantau abis itu -- termasuk buat
        // replay-replay berikutnya.
        window.addEventListener('load', function () {
            requestAnimationFrame(startObserving);
        });
    })();

    if (reduceMotion) return;

    /* ---------------------------------------------------------------- */
    /* 2. Mouse parallax                                                  */
    /* ---------------------------------------------------------------- */
    (function parallax() {
        var hero = document.getElementById('hero');
        var bgLayer = document.getElementById('heroBgParallax');
        var logo = document.getElementById('heroLogoParallax');
        var title = document.getElementById('heroTitleParallax');
        var device = document.getElementById('heroDeviceParallax');
        if (!hero) return;

        var targetX = 0, targetY = 0, curX = 0, curY = 0;
        var active = false;

        function onMove(e) {
            var rect = hero.getBoundingClientRect();
            if (e.clientY < rect.top || e.clientY > rect.bottom) { active = false; return; }
            active = true;
            targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            targetY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        }
        function onLeave() { active = false; targetX = 0; targetY = 0; }

        function apply(el, mx, my, extra) {
            if (!el) return;
            el.style.transform = 'translate3d(' + (curX * mx).toFixed(2) + 'px, ' + (curY * my).toFixed(2) + 'px, 0)' + (extra || '');
        }

        function tick() {
            requestAnimationFrame(tick);
            curX += (targetX - curX) * 0.06;
            curY += (targetY - curY) * 0.06;
            if (Math.abs(curX) < 0.001 && Math.abs(curY) < 0.001 && !active) return;

            apply(bgLayer, -4, -3);
            apply(logo, -9, -7);
            apply(title, -5, -4);
            apply(device, 24, 16, ' rotate(' + (-6 + curX * 2.2).toFixed(2) + 'deg)');
        }

        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('mouseleave', onLeave, { passive: true });
        requestAnimationFrame(tick);
    })();

    /* ---------------------------------------------------------------- */
    /* 3. Logo wobble (spring physics bump near cursor)                   */
    /* ---------------------------------------------------------------- */
    (function logoWobble() {
        var logo = document.getElementById('heroLogoWobble');
        if (!logo) return;

        var STIFFNESS = 140, DAMPING = 9, HIT_PADDING = 10, IMPULSE_SCALE = 0.5, MAX_IMPULSE = 30;
        var lastMouseX = null, lastMouseY = null, mouseVX = 0, mouseVY = 0;
        var lastT = performance.now();
        var offX = 0, offY = 0, velX = 0, velY = 0, rot = 0, velRot = 0;
        var wasColliding = false;

        function onMove(e) {
            if (lastMouseX !== null) { mouseVX = e.clientX - lastMouseX; mouseVY = e.clientY - lastMouseY; }
            lastMouseX = e.clientX; lastMouseY = e.clientY;
        }

        function tick() {
            requestAnimationFrame(tick);
            var now = performance.now();
            var dt = Math.min((now - lastT) / 1000, 0.05);
            lastT = now;
            if (lastMouseX === null || logo.getClientRects().length === 0) return;

            var rect = logo.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            var r = Math.max(rect.width, rect.height) / 2 + HIT_PADDING;
            var dx = lastMouseX - cx, dy = lastMouseY - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var colliding = dist < r;

            if (colliding && !wasColliding) {
                var speed = Math.sqrt(mouseVX * mouseVX + mouseVY * mouseVY);
                var impulse = Math.min(speed * IMPULSE_SCALE, MAX_IMPULSE);
                var pdx = dist > 0.001 ? dx / dist : 0;
                var pdy = dist > 0.001 ? dy / dist : -1;
                velX += -pdx * impulse * 0.6;
                velY += -pdy * impulse * 0.6;
                velRot += ((mouseVX * dy - mouseVY * dx) / (r * 6)) * 2.4;
            }
            wasColliding = colliding;

            velRot += (-STIFFNESS * rot - DAMPING * velRot) * dt; rot += velRot * dt;
            velX += (-STIFFNESS * offX - DAMPING * velX) * dt; offX += velX * dt;
            velY += (-STIFFNESS * offY - DAMPING * velY) * dt; offY += velY * dt;

            logo.style.transform = 'translate(' + offX.toFixed(2) + 'px, ' + offY.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
        }

        window.addEventListener('mousemove', onMove, { passive: true });
        requestAnimationFrame(tick);
    })();

    /* ---------------------------------------------------------------- */
    /* 4. Device CRT glitch screen                                        */
    /* ---------------------------------------------------------------- */
    (function crtGlitch() {
        var canvas = document.getElementById('deviceCrtCanvas');
        if (!canvas || !canvas.getContext) return;
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var hue = 0;
        var lastGlitch = 0;

        function rand(min, max) { return Math.random() * (max - min) + min; }

        function drawFrame(t) {
            requestAnimationFrame(drawFrame);
            hue = (hue + 0.6) % 360;

            ctx.fillStyle = '#05050a';
            ctx.fillRect(0, 0, w, h);

            // vertical gradient bands sweeping over time, RGB-shifted
            var bandCount = 7;
            for (var i = 0; i < bandCount; i++) {
                var by = ((t * 0.03) + i * (h / bandCount)) % h;
                var bh = h / bandCount * rand(0.5, 1.1);
                var bhue = (hue + i * 48) % 360;
                ctx.fillStyle = 'hsla(' + bhue + ', 90%, 55%, 0.55)';
                ctx.fillRect(0, by, w, bh);
            }

            // horizontal noise slices (rgb split glitch)
            for (var s = 0; s < 5; s++) {
                var sy = Math.floor(rand(0, h));
                var sh = Math.floor(rand(2, 6));
                var shift = rand(-14, 14);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = 'hsla(' + ((hue + s * 70) % 360) + ',95%,60%,0.4)';
                ctx.fillRect(shift, sy, w, sh);
                ctx.restore();
            }

            // static specks
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            for (var p = 0; p < 40; p++) {
                if (Math.random() > 0.5) continue;
                ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
            }

            // occasional full-frame glitch jump
            if (t - lastGlitch > rand(900, 2200)) {
                lastGlitch = t;
                var jy = Math.floor(rand(0, h * 0.7));
                var jh = Math.floor(rand(10, 30));
                var jshift = rand(-20, 20);
                var slice = ctx.getImageData(0, jy, w, jh);
                ctx.putImageData(slice, jshift, jy);
            }
        }

        requestAnimationFrame(drawFrame);
    })();

    /* ---------------------------------------------------------------- */
    /* 5. Ambient three.js particle layer                                 */
    /* ---------------------------------------------------------------- */
    (function ambientParticles() {
        try {
            if (typeof THREE === 'undefined') return;
            var holder = document.getElementById('canvas-3d-holder');
            if (!holder) return;

            var width = holder.clientWidth || window.innerWidth;
            var height = holder.clientHeight || window.innerHeight;

            var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            // FIX: `alpha:true` doang gak bikin clear-nya transparan — default
            // clear color three.js tetep #000000 alpha 1 (hitam solid) tiap
            // renderer.render() dipanggil. Karena #canvas-3d-holder nutupin
            // seluruh .hero (inset:0), ini yang bikin background body "ilang"
            // ketutup hitam solid tiap frame. setClearColor(..., 0) bikin
            // clear-nya beneran transparan biar background di baliknya nembus.
            renderer.setClearColor(0x000000, 0);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(width, height);
            holder.appendChild(renderer.domElement);

            var scene = new THREE.Scene();
            var camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
            camera.position.z = 18;

            var count = 140;
            var positions = new Float32Array(count * 3);
            for (var i = 0; i < count; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 34;
                positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
            }
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            var material = new THREE.PointsMaterial({ color: 0x1a1608, size: 0.09, transparent: true, opacity: 0.35 });
            var points = new THREE.Points(geometry, material);
            scene.add(points);

            var mx = 0, my = 0;
            window.addEventListener('mousemove', function (e) {
                mx = (e.clientX / window.innerWidth) * 2 - 1;
                my = (e.clientY / window.innerHeight) * 2 - 1;
            }, { passive: true });

            window.addEventListener('resize', function () {
                var w2 = holder.clientWidth || window.innerWidth;
                var h2 = holder.clientHeight || window.innerHeight;
                camera.aspect = w2 / h2;
                camera.updateProjectionMatrix();
                renderer.setSize(w2, h2);
            });

            function animate() {
                requestAnimationFrame(animate);
                points.rotation.y += 0.0006;
                points.rotation.x += 0.0002;
                camera.position.x += (mx * 1.2 - camera.position.x) * 0.02;
                camera.position.y += (-my * 0.8 - camera.position.y) * 0.02;
                camera.lookAt(scene.position);
                renderer.render(scene, camera);
            }
            animate();
        } catch (err) {
            console.warn('[VideoRevealEffect] Ambient particle layer skipped:', err);
        }
    })();
})();

/* ---------------------------------------------------------------- */
    /* 6. Spotlight Reveal Parallax with Long Tail                      */
    /* ---------------------------------------------------------------- */
(function revealParallax() {
    const wrap = document.getElementById('hero');
    if (!wrap) return;

    // Bikin canvas sendiri via JS -- gak butuh elemen apapun sudah ada di HTML/CSS
    const canvas = document.createElement('canvas');
    canvas.id = 'revealCanvas';
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:18;mix-blend-mode:difference;';
    wrap.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    let mouseX = -9999, mouseY = -9999, tailX = -9999, tailY = -9999;
    let velX = 0, velY = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ease = 0.08;

    function resize() {
        const rect = wrap.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    wrap.addEventListener('mousemove', function (e) {
        const rect = wrap.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    }, { passive: true });

    wrap.addEventListener('mouseleave', function () {
        mouseX = -9999; mouseY = -9999;
    }, { passive: true });

    function animateTail() {
        requestAnimationFrame(animateTail);

        const prevX = tailX, prevY = tailY;
        tailX += (mouseX - tailX) * ease;
        tailY += (mouseY - tailY) * ease;

        velX += ((tailX - prevX) - velX) * 0.15;
        velY += ((tailY - prevY) - velY) * 0.15;

        const speed = Math.min(Math.sqrt(velX * velX + velY * velY), 30);
        const stretchX = 1 + (speed / 30) * 0.55;
        const stretchY = Math.max(1 - (speed / 30) * 0.25, 0.6);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cx = tailX * dpr, cy = tailY * dpr;
        const rx = 340 * dpr * stretchX, ry = 340 * dpr * stretchY;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(rx, ry);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.42, 'rgba(255,255,255,0.6)');
        grad.addColorStop(0.62, 'rgba(255,255,255,0.3)');
        grad.addColorStop(0.82, 'rgba(255,255,255,0.08)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        window.__frameCount = (window.__frameCount || 0) + 1;
    }
    animateTail();
})();