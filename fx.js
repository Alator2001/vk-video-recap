/* Живой фон за телефоном: мерцающие «искры» — символ пересказа — и редкие падающие звёзды.
   Рисуется на canvas, ставится на паузу, когда вкладка скрыта, и отключается при «уменьшении движения». */
(() => {
  const cvs = document.getElementById('bgfx');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, stars = [], shooters = [], nextShoot = 0, raf = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cvs.clientWidth; H = cvs.clientHeight;
    cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((W * H) / 16000);   // реже — фон не спорит с телефоном
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.6 + Math.random() * 1.4,
      big: Math.random() < 0.18,             // крупные — четырёхлучевые «искры», как иконка пересказа
      ph: Math.random() * Math.PI * 2,
      sp: 0.35 + Math.random() * 0.8,
      dx: (Math.random() - 0.5) * 3,          // очень медленный дрейф
      dy: 1 + Math.random() * 3,
    }));
  }

  function sparkle(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  function palette() {
    const light = document.body.dataset.theme === 'light';
    return light
      ? { a: 0.6, c1: '38,120,235', c2: '125,80,235', tail: '60,120,235', dot: 0.9, sz: 1.4 }   // на белом фоне нужны насыщенные цвета и почти полная непрозрачность
      : { a: 0.5, c1: '200,222,255', c2: '190,170,255', tail: '170,205,255' };
  }

  function frame(now) {
    const t = now / 1000, p = palette();
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.y += s.dy / 60; s.x += s.dx / 60;
      if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
      if (s.x < -10) s.x = W + 10; if (s.x > W + 10) s.x = -10;
      const tw = 0.5 + 0.5 * Math.sin(t * s.sp * 2 + s.ph);
      const alpha = Math.min(1, p.a * (s.big ? 0.35 + 0.75 * tw * tw : (p.dot ? 0.3 : 0.15) + 0.5 * tw));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${s.big && s.ph > 3 ? p.c2 : p.c1})`;
      if (s.big) sparkle(s.x, s.y, s.r * 3.2 * (p.sz || 1) * (0.85 + 0.15 * tw));
      else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (p.dot || 0.55), 0, Math.PI * 2); ctx.fill(); }
    }
    // падающая звезда раз в 5–9 секунд
    if (now > nextShoot) {
      nextShoot = now + 9000 + Math.random() * 7000;
      const ang = (18 + Math.random() * 14) * Math.PI / 180;
      shooters.push({ x: W * (0.2 + Math.random() * 0.7), y: -20, vx: -Math.cos(ang) * 520, vy: Math.sin(ang) * 520, born: now, life: 1300 });
    }
    shooters = shooters.filter(sh => now - sh.born < sh.life);
    for (const sh of shooters) {
      const k = (now - sh.born) / sh.life, dt = (now - sh.born) / 1000;
      const x = sh.x + sh.vx * dt, y = sh.y + sh.vy * dt;
      const fade = Math.sin(Math.PI * k);
      const tx = x - sh.vx * 0.22, ty = y - sh.vy * 0.22;
      const g = ctx.createLinearGradient(x, y, tx, ty);
      g.addColorStop(0, `rgba(${p.tail},${0.75 * fade * p.a})`);
      g.addColorStop(1, `rgba(${p.tail},0)`);
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = p.dot ? 2 : 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.globalAlpha = fade * p.a; ctx.fillStyle = `rgb(${p.c1})`;
      sparkle(x, y, 4.5);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() { cancelAnimationFrame(raf); nextShoot = performance.now() + 2500; raf = requestAnimationFrame(frame); }
  resize();
  addEventListener('resize', resize);
  if (reduce) { frame(0); cancelAnimationFrame(raf); return; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  start();
})();
