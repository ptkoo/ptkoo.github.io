/* ptkoo.github.io — hero rig: a planar quadruped and a planar biped, both walked by a live 2-link IK gait generator */
(() => {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();

  // reveal-on-scroll
  if (!('IntersectionObserver' in window)) document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  const canvas = document.getElementById('rig');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // logical drawing space W×H, shown in a 900×400 card (scale K)
  const W = 720, H = 320, K = 1.25, DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * K * DPR; canvas.height = H * K * DPR; ctx.scale(DPR * K, DPR * K);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- robot geometry (screen px; 1 m ≈ 1000 px, so a 0.24 m body is 240 px) ----
  const LEG = { L1: 78, L2: 84 };      // quadruped thigh, shank
  const bodyLen = 250, bodyH = 44;
  const hipX = { front: bodyLen / 2 - 18, hind: -bodyLen / 2 + 18 };
  const standH = 128;                  // hip height above ground when standing
  const groundY = 252;

  // ---- gaits: phase offset per leg, duty factor (fraction of cycle in stance) ----
  // legs: LF, RF, LH, RH
  const GAITS = [
    { name: 'static walk', duty: .78, phase: [0, .5, .75, .25], freq: .55, stride: 74, lift: 26, bob: 3 },
    { name: 'trot',        duty: .52, phase: [0, .5, .5, 0],    freq: 1.25, stride: 96, lift: 30, bob: 5 },
    { name: 'bound',       duty: .45, phase: [0, 0, .5, .5],    freq: 1.6, stride: 118, lift: 36, bob: 9 },
  ];
  let gi = 0, gait = GAITS[gi];
  const hud = {
    gait: document.getElementById('hud-gait'), phase: document.getElementById('hud-phase'),
    v: document.getElementById('hud-v'), contact: document.getElementById('hud-contact'),
  };
  canvas.parentElement.addEventListener('click', () => { gi = (gi + 1) % GAITS.length; gait = GAITS[gi]; hud.gait.textContent = gait.name + ' · ' + BIPED[gi].name; });

  // foot target in hip frame for a leg at phase p ∈ [0,1). +x forward, +y down.
  function footTarget(p, g, h = standH) {
    const s = g.stride, d = g.duty;
    if (p < d) {                                   // stance: foot slides backward under the hip
      const u = p / d;
      return { x: s / 2 - s * u, y: h, contact: true };
    }
    const u = (p - d) / (1 - d);                   // swing: forward with a smooth lift
    const x = -s / 2 + s * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
    const y = h - g.lift * Math.sin(Math.PI * u) ** 1.4;
    return { x, y, contact: false };
  }

  // 2-link planar IK: hip at origin, returns knee point. kneeSign: +1 knee forward, -1 knee back.
  function ik(x, y, kneeSign, L1 = LEG.L1, L2 = LEG.L2) {
    let r = Math.hypot(x, y);
    const rMax = L1 + L2 - 1e-3, rMin = Math.abs(L1 - L2) + 1e-3;
    if (r > rMax) { x *= rMax / r; y *= rMax / r; r = rMax; }
    if (r < rMin) { x *= rMin / r; y *= rMin / r; r = rMin; }
    const cosK = (L1 * L1 + L2 * L2 - r * r) / (2 * L1 * L2);
    const knee = Math.acos(Math.max(-1, Math.min(1, cosK)));       // interior knee angle
    const a = Math.atan2(y, x);
    const b = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + r * r - L2 * L2) / (2 * L1 * r))));
    const hipAng = a - kneeSign * b;
    return { kx: L1 * Math.cos(hipAng), ky: L1 * Math.sin(hipAng), fx: x, fy: y, knee };
  }

  // ---- drawing ----
  const C = { line: '#d2d2d7', grid: 'rgba(0,0,0,.04)', body: '#ffffff', bodyEdge: '#86868b',
              near: '#1d1d1f', far: '#b8b8bd', accent: '#ff9f0a', cyan: '#0066cc', ok: '#34c759', ground: '#86868b' };

  function drawGround(scroll) {
    ctx.strokeStyle = C.ground; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, groundY + .5); ctx.lineTo(W, groundY + .5); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    const sp = 40; const off = ((scroll % sp) + sp) % sp;
    for (let x = -off; x < W; x += sp) {
      const major = Math.round((x + off) / sp) % 5 === 0;
      ctx.beginPath(); ctx.moveTo(x, groundY + 4); ctx.lineTo(x, groundY + (major ? 14 : 8)); ctx.stroke();
    }
    // faint hatch below
    ctx.strokeStyle = 'rgba(0,0,0,.06)';
    for (let x = -off - 60; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, groundY + 20); ctx.lineTo(x + 30, groundY + 50); ctx.stroke(); }
  }

  function drawSwingPath(hx, hy, g, color, h = standH) {
    ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = .55;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const p = g.duty + (1 - g.duty) * (i / 60); const t = footTarget(p >= 1 ? .999 : p, g, h); i ? ctx.lineTo(hx + t.x, hy + t.y) : ctx.moveTo(hx + t.x, hy + t.y); }
    ctx.stroke(); ctx.restore();
  }

  function drawLeg(hx, hy, t, kneeSign, near, L1 = LEG.L1, L2 = LEG.L2) {
    const s = ik(t.x, t.y, kneeSign, L1, L2);
    const col = near ? C.near : C.far, lw = near ? 5 : 4;
    // segments
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + s.kx, hy + s.ky); ctx.lineTo(hx + s.fx, hy + s.fy); ctx.stroke();
    // joints
    ctx.fillStyle = near ? '#ffffff' : '#f5f5f7'; ctx.strokeStyle = col; ctx.lineWidth = near ? 2 : 1.5;
    for (const [x, y, r] of [[hx, hy, 5], [hx + s.kx, hy + s.ky, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); }
    // foot
    ctx.beginPath(); ctx.arc(hx + s.fx, hy + s.fy, near ? 4.5 : 3.5, 0, 7);
    ctx.fillStyle = t.contact ? C.ok : (near ? C.accent : '#d9a066'); ctx.fill();
    if (t.contact && near) { ctx.globalAlpha = .35; ctx.beginPath(); ctx.arc(hx + s.fx, hy + s.fy, 9, 0, 7); ctx.strokeStyle = C.ok; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1; }
  }

  function drawBody(cx, cy) {
    const x = cx - bodyLen / 2, y = cy - bodyH / 2, r = 12;
    ctx.fillStyle = C.body; ctx.strokeStyle = C.bodyEdge; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, bodyLen, bodyH, r); ctx.fill(); ctx.stroke();
    // head block
    ctx.beginPath(); ctx.roundRect(cx + bodyLen / 2 - 4, cy - 14, 34, 24, 6); ctx.fill(); ctx.stroke();
    // eye/camera
    ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(cx + bodyLen / 2 + 22, cy - 4, 3, 0, 7); ctx.fill();
    // IMU tick marks
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    for (let i = 1; i < 6; i++) { const gx = x + i * bodyLen / 6; ctx.beginPath(); ctx.moveTo(gx, y + 8); ctx.lineTo(gx, y + bodyH - 8); ctx.stroke(); }
    // com marker
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx + 8, cy, 5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 8 - 8, cy); ctx.lineTo(cx + 8 + 8, cy); ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.stroke();
  }

  // ---- biped: the humanoid legs (pelvis + torso block on two legs, as trained in Isaac Lab).
  // It walks on the same ground as the quadruped, so its stride is chosen to match the quadruped's speed.
  const BIP = { L1: 66, L2: 62, hipH: 118, pelvis: [36, 22], torso: [30, 44], waist: 4 };
  // one mode per quadruped gait: walk / brisk walk / run (duty < .5 gives a flight phase)
  const BIPED = [
    { name: 'walk',       duty: .62, freq: .55, lift: 16, bob: 2.5, lean: .02, crouch: 0 },
    { name: 'brisk walk', duty: .55, freq: 1.0,  lift: 22, bob: 4,   lean: .05, crouch: 4 },
    { name: 'run',        duty: .40, freq: 1.35, lift: 36, bob: 7,   lean: .12, crouch: 12 },
  ];

  function drawFootPlate(hx, hy, t, near) {
    const s = ik(t.x, t.y, +1, BIP.L1, BIP.L2);
    const x = hx + s.fx, y = hy + s.fy;
    ctx.strokeStyle = near ? C.near : C.far; ctx.lineWidth = near ? 4 : 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 14, y + 2); ctx.stroke();
  }

  function drawPelvisTorso(cx, hy, lean) {
    const [pw, ph] = BIP.pelvis, [tw, th] = BIP.torso;
    ctx.save(); ctx.translate(cx, hy); ctx.rotate(lean);
    ctx.fillStyle = C.body; ctx.strokeStyle = C.bodyEdge; ctx.lineWidth = 1.5;
    // pelvis around the hip joints
    ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2 - 4, pw, ph, 7); ctx.fill(); ctx.stroke();
    // torso block above a short waist
    const ty = -ph / 2 - 4 - BIP.waist - th;
    ctx.beginPath(); ctx.roundRect(-tw / 2, ty, tw, th, 8); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.bodyEdge; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, ty + th); ctx.lineTo(0, -ph / 2 - 4); ctx.stroke();
    // IMU ticks + camera
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const gy = ty + i * th / 4; ctx.beginPath(); ctx.moveTo(-tw / 2 + 6, gy); ctx.lineTo(tw / 2 - 6, gy); ctx.stroke(); }
    ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(tw / 2 - 5, ty + 8, 2.6, 0, 7); ctx.fill();
    // com marker
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2;
    const cy = ty + th * .7;
    ctx.beginPath(); ctx.arc(0, cy, 4.5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, cy); ctx.lineTo(7, cy); ctx.moveTo(0, cy - 7); ctx.lineTo(0, cy + 7); ctx.stroke();
    ctx.restore();
    return hy + ty - 10;                                        // y just above the torso, for the command arrow
  }

  // velocity command arrow, as drawn over each robot in Isaac Lab
  function drawCmdArrow(cx, y, v) {
    const len = 22 + Math.min(60, v / 3);
    ctx.save(); ctx.strokeStyle = C.ok; ctx.fillStyle = C.ok; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - len / 2, y); ctx.lineTo(cx + len / 2 - 6, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + len / 2, y); ctx.lineTo(cx + len / 2 - 9, y - 5); ctx.lineTo(cx + len / 2 - 9, y + 5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .35; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx - len / 2, y, 5, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1; ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(95,102,112,.9)'; ctx.textAlign = 'center';
    ctx.fillText('v cmd', cx, y - 9);
    ctx.restore();
  }

  // returns the two foot targets (far, near) so the HUD can report contact
  function drawBiped(cx, cyc, bg, v) {
    const g = { stride: v / bg.freq, duty: bg.duty, lift: bg.lift };
    const hipH = BIP.hipH - bg.crouch;
    const bob = Math.sin(4 * Math.PI * cyc) * bg.bob;         // two steps per cycle
    const hy = groundY - hipH + bob;
    const legs = [{ near: false, ph: .5, dx: 6 }, { near: true, ph: 0, dx: 0 }];
    const targets = legs.map(l => { const t = footTarget((cyc + l.ph) % 1, g, hipH); t.y -= bob; return t; });
    // far leg, body, near leg, command arrow
    drawFootPlate(cx + legs[0].dx, hy, targets[0], false);
    drawLeg(cx + legs[0].dx, hy, targets[0], +1, false, BIP.L1, BIP.L2);
    const top = drawPelvisTorso(cx, hy, bg.lean);
    drawSwingPath(cx, hy, g, C.cyan, hipH);
    drawFootPlate(cx, hy, targets[1], true);
    drawLeg(cx, hy, targets[1], +1, true, BIP.L1, BIP.L2);
    drawCmdArrow(cx, top, v);
    return targets;
  }

  function drawAxes() {
    ctx.save(); ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(95,102,112,.8)';
    ctx.textAlign = 'right'; ctx.fillText('x', W - 14, groundY - 6);
    ctx.strokeStyle = 'rgba(95,102,112,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W - 60, groundY - 10); ctx.lineTo(W - 24, groundY - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 28, groundY - 13); ctx.lineTo(W - 24, groundY - 10); ctx.lineTo(W - 28, groundY - 7); ctx.stroke();
    ctx.restore();
  }

  let t0 = performance.now(), scroll = 0, last = t0;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const T = (now - t0) / 1000;
    const g = gait;
    const cyc = (T * g.freq) % 1;
    // body speed: stride covered per stance period → px/s, scroll ground accordingly
    const v = g.stride * g.freq;               // px/s of forward travel
    scroll += v * dt;

    ctx.clearRect(0, 0, W, H);
    drawGround(scroll);
    drawAxes();

    const bob = Math.sin(2 * Math.PI * cyc * (g.name === 'trot' ? 2 : 1)) * g.bob;
    const bodyCx = W / 2 - 80, bodyCy = groundY - standH - (bodyH / 2 - 6) + bob;
    const pitch = g.name === 'bound' ? Math.sin(2 * Math.PI * cyc) * .05 : 0;

    ctx.save(); ctx.translate(bodyCx, bodyCy); ctx.rotate(-pitch); ctx.translate(-bodyCx, -bodyCy);

    // hips in body frame
    const hips = [
      { key: 'LF', x: hipX.front, near: true,  knee: -1 },
      { key: 'RF', x: hipX.front, near: false, knee: -1 },
      { key: 'LH', x: hipX.hind,  near: true,  knee: +1 },
      { key: 'RH', x: hipX.hind,  near: false, knee: +1 },
    ];
    const contacts = [];
    // far legs first (behind body), then body, then near legs
    const order = [1, 3, 'body', 0, 2];
    const targets = hips.map((h, i) => footTarget((cyc + g.phase[i]) % 1, g));
    // compensate body bob so feet stay on the ground line during stance
    targets.forEach(tg => { tg.y = tg.y - bob; });
    for (const o of order) {
      if (o === 'body') { drawBody(bodyCx, bodyCy); continue; }
      const h = hips[o], hy = bodyCy + bodyH / 2 - 6, hx = bodyCx + h.x + (h.near ? 0 : 10);
      if (h.near) drawSwingPath(hx, hy, g, h.knee < 0 ? C.cyan : C.accent);
      drawLeg(hx, hy, targets[o], h.knee, h.near);
    }
    ctx.restore();

    const bipedCyc = (T * BIPED[gi].freq) % 1;
    const bt = drawBiped(W - 140, bipedCyc, BIPED[gi], v);

    hud.phase.textContent = cyc.toFixed(2);
    hud.v.textContent = (v / 1000).toFixed(2);
    hud.contact.textContent = [0, 1, 2, 3].map(i => targets[i].contact ? '■' : '□').join(' ') + '  ·  ' + [1, 0].map(i => bt[i].contact ? '■' : '□').join(' ');

    if (!reduced) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
