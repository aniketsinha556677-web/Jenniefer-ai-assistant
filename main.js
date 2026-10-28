/* ======================================
   PORTFOLIO — MAIN.JS
   Full GSAP + Motion Animation Suite
   ====================================== */

'use strict';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger, TextPlugin);

// =============================================
// SECTION 1: LOADER
// =============================================
(function initLoader() {
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loaderBar');
  const loaderText = document.getElementById('loaderText');

  const steps = [
    { pct: 20, text: 'Loading assets...' },
    { pct: 45, text: 'Preparing animations...' },
    { pct: 72, text: 'Rendering UI...' },
    { pct: 90, text: 'Almost ready...' },
    { pct: 100, text: 'Welcome!' },
  ];

  let idx = 0;
  const tick = () => {
    if (idx >= steps.length) return;
    const s = steps[idx++];
    loaderBar.style.width = s.pct + '%';
    loaderText.textContent = s.text;
    setTimeout(idx < steps.length ? tick : finish, idx === 1 ? 200 : 350);
  };

  const finish = () => {
    setTimeout(() => {
      gsap.to(loader, {
        opacity: 0,
        duration: 0.7,
        ease: 'power2.inOut',
        onComplete: () => {
          loader.style.display = 'none';
          document.body.style.overflow = '';
          initHeroAnimations();
        }
      });
    }, 300);
  };

  document.body.style.overflow = 'hidden';
  setTimeout(tick, 400);
})();

// =============================================
// SECTION 2: CUSTOM CURSOR
// =============================================
(function initCursor() {
  const cursor = document.getElementById('cursor');
  const follower = document.getElementById('cursorFollower');
  let mx = 0, my = 0;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    gsap.to(cursor, { x: mx, y: my, duration: 0.05 });
    gsap.to(follower, { x: mx, y: my, duration: 0.3, ease: 'power2.out' });
  });

  const hoverable = 'a, button, .skill-card, .project-card, .highlight-item, .contact-card, .social-link, .tab-btn';
  document.querySelectorAll(hoverable).forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('hovered');
      follower.classList.add('hovered');
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('hovered');
      follower.classList.remove('hovered');
    });
  });

  document.addEventListener('mouseleave', () => gsap.to([cursor, follower], { opacity: 0, duration: 0.2 }));
  document.addEventListener('mouseenter', () => gsap.to([cursor, follower], { opacity: 1, duration: 0.2 }));
})();

// =============================================
// SECTION 3: PARTICLE CANVAS
// =============================================
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [], mouse = { x: null, y: null };
  const COUNT = 80;

  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mouseleave', () => { mouse.x = null; mouse.y = null; });

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 2 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.alpha = Math.random() * 0.6 + 0.1;
      this.pulse = Math.random() * Math.PI * 2;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.pulse += 0.02;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();

      // Mouse repulsion
      if (mouse.x !== null) {
        const dx = this.x - mouse.x, dy = this.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          const force = (100 - dist) / 100 * 0.8;
          this.vx += (dx / dist) * force * 0.15;
          this.vy += (dy / dist) * force * 0.15;
        }
      }
      this.vx *= 0.995;
      this.vy *= 0.995;
    }
    draw() {
      const a = this.alpha * (0.7 + 0.3 * Math.sin(this.pulse));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(79,195,247,${a})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < COUNT; i++) particles.push(new Particle());

  const drawConnections = () => {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          const alpha = (1 - dist / 140) * 0.2;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(79,195,247,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  };

  const animate = () => {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    drawConnections();
    requestAnimationFrame(animate);
  };
  animate();
})();

// =============================================
// SECTION 4: NAVBAR
// =============================================
(function initNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    updateActiveNavLink();
  });

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });

  const updateActiveNavLink = () => {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.scrollY + 150;
    sections.forEach(section => {
      const link = document.querySelector(`.nav-link[data-section="${section.id}"]`);
      if (!link) return;
      const top = section.offsetTop;
      const bottom = top + section.offsetHeight;
      if (scrollY >= top && scrollY < bottom) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  };
})();

// =============================================
// SECTION 5: HERO ANIMATIONS (GSAP)
// =============================================
function initHeroAnimations() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // Background / Social / Scroll fade
  tl.to('#heroSocial', { opacity: 1, duration: 0.6, delay: 0.1 })
    .to('#scrollIndicator', { opacity: 0.6, duration: 0.6 }, '<')

    // Badge
    .fromTo('#heroBadge',
      { opacity: 0, y: -20, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6 }, '-=0.2')

    // Greeting
    .fromTo('#heroGreeting',
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.5 }, '-=0.3')

    // Name — letter by letter
    .fromTo('#heroName',
      { opacity: 0, y: 40, skewY: 3 },
      { opacity: 1, y: 0, skewY: 0, duration: 0.8 }, '-=0.2')

    // Role
    .fromTo('.hero-role-wrap',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5 }, '-=0.4')

    // Description
    .fromTo('#heroDesc',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')

    // Actions
    .fromTo('#heroActions',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')

    // Stats
    .fromTo('#heroStats',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')

    // Avatar
    .fromTo('#heroAvatar',
      { opacity: 0, x: 60, scale: 0.95 },
      { opacity: 1, x: 0, scale: 1, duration: 0.9, ease: 'power2.out' }, '-=0.6');

  // Typewriter effect
  startTypewriter();

  // Counter animation for stats
  setTimeout(animateCounters, 1500);

  // Floating animation for avatar
  gsap.to('#heroAvatar', {
    y: -15,
    duration: 3,
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
    delay: 2
  });
}

// =============================================
// SECTION 6: TYPEWRITER
// =============================================
function startTypewriter() {
  const el = document.getElementById('typedText');
  const words = ['Full Stack Developer', 'React Specialist', 'Node.js Expert', 'Problem Solver', 'UI Craftsman'];
  let wordIdx = 0, charIdx = 0, deleting = false;

  const type = () => {
    const word = words[wordIdx];
    if (!deleting) {
      el.textContent = word.slice(0, ++charIdx);
      if (charIdx === word.length) {
        deleting = true;
        setTimeout(type, 1800);
        return;
      }
    } else {
      el.textContent = word.slice(0, --charIdx);
      if (charIdx === 0) {
        deleting = false;
        wordIdx = (wordIdx + 1) % words.length;
      }
    }
    setTimeout(type, deleting ? 55 : 90);
  };
  setTimeout(type, 1600);
}

// =============================================
// SECTION 7: COUNTER ANIMATION
// =============================================
function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    gsap.fromTo(el, { innerText: 0 }, {
      innerText: target,
      duration: 2,
      ease: 'power2.out',
      snap: { innerText: 1 },
      onUpdate() { el.textContent = Math.round(parseFloat(el.innerText)); }
    });
  });
}

// =============================================
// SECTION 8: SCROLL REVEAL
// =============================================
(function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Animate skill bars when visible
        if (entry.target.classList.contains('skill-card')) {
          const bar = entry.target.querySelector('.skill-bar');
          if (bar) {
            const w = bar.dataset.width;
            setTimeout(() => { bar.style.width = w + '%'; }, 200);
          }
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right').forEach(el => observer.observe(el));
})();

// =============================================
// SECTION 9: SKILLS TABS
// =============================================
(function initSkillsTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.skills-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      gsap.to('.skills-panel.active', {
        opacity: 0, y: 10, duration: 0.2,
        onComplete: () => {
          panels.forEach(p => p.classList.remove('active'));
          const newPanel = document.getElementById(`panel-${target}`);
          newPanel.classList.add('active');
          gsap.fromTo(newPanel, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 });

          // Re-animate bars in new panel
          newPanel.querySelectorAll('.skill-bar').forEach(bar => {
            bar.style.width = '0%';
            setTimeout(() => { bar.style.width = bar.dataset.width + '%'; }, 150);
          });
        }
      });
    });
  });
})();

// =============================================
// SECTION 10: GSAP ScrollTrigger Section Animations
// =============================================
(function initScrollAnimations() {

  // About section — image frame glow
  gsap.to('.about-img-frame', {
    boxShadow: '0 0 60px rgba(79,195,247,0.2)',
    scrollTrigger: {
      trigger: '#about',
      start: 'top 70%',
      toggleActions: 'play none none reverse'
    }
  });

  // Timeline line drawing
  gsap.utils.toArray('.marker-line').forEach((line, i) => {
    gsap.fromTo(line,
      { scaleY: 0, transformOrigin: 'top center' },
      {
        scaleY: 1,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: line,
          start: 'top 85%',
        }
      }
    );
  });

  // Marker dots pulse in
  gsap.utils.toArray('.marker-dot').forEach((dot, i) => {
    gsap.fromTo(dot,
      { scale: 0 },
      {
        scale: 1,
        duration: 0.5,
        ease: 'back.out(2)',
        scrollTrigger: { trigger: dot, start: 'top 90%' }
      }
    );
  });

  // Horizontal parallax on hero overlay
  gsap.to('.hero-overlay', {
    backgroundPosition: '55% 50%',
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1
    }
  });

  // Section tag stagger
  gsap.utils.toArray('.section-header').forEach(header => {
    const tag = header.querySelector('.section-tag');
    const title = header.querySelector('.section-title');
    const tl = gsap.timeline({
      scrollTrigger: { trigger: header, start: 'top 80%' }
    });
    tl.fromTo(tag,
      { opacity: 0, y: 20, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5 })
      .fromTo(title,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6 }, '-=0.2');
  });

  // Footer brand fade
  gsap.fromTo('.footer-brand',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.6, scrollTrigger: { trigger: '.footer', start: 'top 90%' } }
  );

  // Project cards 3D tilt on hover
  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(card, {
        rotateY: x * 8,
        rotateX: -y * 8,
        duration: 0.4,
        ease: 'power2.out',
        transformPerspective: 1000
      });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
    });
  });

})();

// =============================================
// SECTION 11: CONTACT FORM
// =============================================
(function initContactForm() {
  const form = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const formSuccess = document.getElementById('formSuccess');

  const validate = () => {
    let valid = true;
    const fields = [
      { id: 'fname', errId: 'fnameError', msg: 'First name is required.' },
      { id: 'lname', errId: 'lnameError', msg: 'Last name is required.' },
      { id: 'message', errId: 'messageError', msg: 'Message cannot be empty.' },
    ];
    fields.forEach(({ id, errId, msg }) => {
      const el = document.getElementById(id);
      const errEl = document.getElementById(errId);
      if (!el || !errEl) return;
      if (!el.value.trim()) {
        errEl.textContent = msg;
        gsap.fromTo(el, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
        valid = false;
      } else {
        errEl.textContent = '';
      }
    });

    // Email
    const emailEl = document.getElementById('email');
    const emailErr = document.getElementById('emailError');
    if (emailEl && emailErr) {
      const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRx.test(emailEl.value.trim())) {
        emailErr.textContent = 'Enter a valid email address.';
        gsap.fromTo(emailEl, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
        valid = false;
      } else {
        emailErr.textContent = '';
      }
    }
    return valid;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Loading state
    submitBtn.disabled = true;
    btnText.textContent = 'Sending...';
    gsap.to(submitBtn, { scale: 0.97, duration: 0.1 });

    // Simulate send
    setTimeout(() => {
      submitBtn.disabled = false;
      gsap.to(submitBtn, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
      btnText.textContent = 'Send Message';
      formSuccess.classList.add('show');
      form.reset();
      gsap.fromTo(formSuccess, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 });
      setTimeout(() => { formSuccess.classList.remove('show'); }, 5000);
    }, 1800);
  });
})();

// =============================================
// SECTION 12: SMOOTH SCROLL FOR ANCHOR LINKS
// =============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;
    const target = document.querySelector(targetId);
    if (!target) return;
    e.preventDefault();
    gsap.to(window, {
      duration: 1.1,
      scrollTo: { y: target, offsetY: 72 },
      ease: 'power3.inOut'
    });
  });
});

// =============================================
// SECTION 13: MISC — Back to top, page glow
// =============================================
(function initMisc() {
  // Moving glow gradient following scroll
  window.addEventListener('scroll', () => {
    const scrollPct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
    const hue = Math.round(195 + scrollPct * 30);
    document.documentElement.style.setProperty('--accent-primary', `hsl(${hue}, 90%, 70%)`);
    document.documentElement.style.setProperty('--accent-secondary', `hsl(${hue - 10}, 85%, 60%)`);
  });
})();

// Fix: gsap scrollTo plugin fallback (if not loaded, use native)
if (!gsap.plugins || !gsap.plugins.scrollTo) {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.offsetTop - 72, behavior: 'smooth' });
    });
  });
}

console.log('%c👨‍💻 Portfolio Loaded', 'color: #4fc3f7; font-size: 16px; font-weight: bold;');
console.log('%cBuilt with GSAP + Vanilla JS', 'color: #8bb5d4; font-size: 12px;');
