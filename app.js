function getDestinationPage() {
  const fallback = '/success.html';
  try {
    const params = new URLSearchParams(window.location.search);
    const qp = (params.get('destination_page') || '').trim();
    const candidate = qp || (typeof window.destination_page === 'string' ? window.destination_page.trim() : '');
    if (!candidate) return fallback;

    // Aceitar apenas caminhos internos (mesma origem)
    // - Se começar com '/', consideramos caminho interno
    // - Se for URL absoluta, deve ter mesma origem; caso contrário, ignorar
    if (candidate.startsWith('/')) return candidate;
    try {
      const url = new URL(candidate, window.location.origin);
      if (url.origin === window.location.origin) {
        return url.pathname + url.search + url.hash;
      }
    } catch (_) {}
    return fallback;
  } catch (_) {
    return fallback;
  }
}

function attachFreePlanRedirect() {
  const btn = document.getElementById('freePlanBtn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    const attr = (btn.getAttribute('data-destination_page') || '').trim();
    let dest = attr || getDestinationPage();
    // Sanitizar novamente por segurança
    if (!dest.startsWith('/')) dest = '/success.html';
    window.location.href = dest;
  });
}

function askEmail(label) {
  const fallback = '';
  return new Promise((resolve) => {
    // Tentar usar prompt se suportado
    try {
      if (typeof window.prompt === 'function') {
        const v = window.prompt(label || 'Digite seu e-mail:') || fallback;
        return resolve(v);
      }
    } catch (_) {}

    // Criar diálogo leve
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'rgba(0,0,0,0.35)';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.zIndex = '9999';

    const box = document.createElement('div');
    box.style.background = 'var(--surface, #fff)';
    box.style.color = 'var(--text, #111)';
    box.style.borderRadius = '12px';
    box.style.padding = '16px';
    box.style.boxShadow = '0 4px 18px rgba(0,0,0,0.15)';
    box.style.maxWidth = '420px';
    box.style.width = '90%';

    const title = document.createElement('h3');
    title.textContent = label || 'Digite seu e-mail para receber a licença:';
    title.style.margin = '0 0 8px';

    const input = document.createElement('input');
    input.type = 'email';
    input.placeholder = 'seu@email.com';
    input.style.width = '100%';
    input.style.padding = '10px';
    input.style.border = '1px solid var(--border, #ddd)';
    input.style.borderRadius = '8px';
    input.setAttribute('aria-label', 'E-mail do comprador');

    // Pré-preencher com e-mail salvo
    try {
      const saved = (localStorage.getItem('user:email') || '').trim();
      if (saved) input.value = saved;
    } catch (_) {}

    const error = document.createElement('p');
    error.className = 'muted';
    error.style.color = 'var(--danger, #b00020)';
    error.style.margin = '6px 0 0';
    error.style.fontSize = '0.9rem';
    error.style.display = 'none';
    error.textContent = 'Por favor, informe um e-mail válido.';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.marginTop = '12px';

    const ok = document.createElement('button');
    ok.textContent = 'Continuar';
    ok.className = 'btn';

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancelar';
    cancel.className = 'btn btn-outline';

    function isValidEmail(v) {
      if (!v) return false;
      const s = v.trim();
      if (s.length < 5) return false;
      // Validação simples: precisa ter @ e . após
      const at = s.indexOf('@');
      const dot = s.lastIndexOf('.');
      return at > 0 && dot > at + 1 && dot < s.length - 1;
    }

    function submit() {
      const v = (input.value || '').trim();
      if (!isValidEmail(v)) {
        error.style.display = '';
        return;
      }
      try { localStorage.setItem('user:email', v); } catch (_) {}
      document.body.removeChild(backdrop);
      resolve(v);
    }

    ok.addEventListener('click', submit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submit();
      }
    });
    cancel.addEventListener('click', () => {
      document.body.removeChild(backdrop);
      resolve(fallback);
    });

    box.appendChild(title);
    box.appendChild(input);
    box.appendChild(error);
    actions.appendChild(ok);
    actions.appendChild(cancel);
    box.appendChild(actions);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    setTimeout(() => input.focus(), 0);
  });
}

async function startPurchaseFlow(emailInputPromptLabel, options) {
  const email = await askEmail(emailInputPromptLabel || 'Digite seu e-mail para receber a licença:');
  const payload = {
    title: (options && options.title) || 'Sistema Controle Financeiro - Versão Premium',
    unit_price: (options && options.unit_price) != null ? options.unit_price : 39.90,
    quantity: 1,
    external_reference: 'hiden_order_' + Date.now(),
    payer: { email }
  };

  // Guardar informações básicas para páginas de retorno (pending/success/failure)
  try {
    const checkoutInfo = {
      plan: (options && options.title) || 'Premium',
      amount: (options && options.unit_price) != null ? options.unit_price : 39.90,
      external_reference: payload.external_reference,
      email,
      startedAt: Date.now()
    };
    localStorage.setItem('checkout:last', JSON.stringify(checkoutInfo));
    if (email) localStorage.setItem('user:email', email);
  } catch (_) {}

  const resp = await fetch('/create_preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await resp.json();
  if (json && (json.init_point || json.sandbox_init_point)) {
    const url = json.init_point || json.sandbox_init_point;
    window.location.href = url;
  } else {
    alert('Erro ao iniciar pagamento: ' + (json.error || 'resposta inválida'));
    console.error(json);
  }
}

function attachPremiumPurchase() {
  const buyButtons = [
    document.getElementById('buyBtn'),
    document.getElementById('premiumBuyBtn')
  ].filter(Boolean);
  buyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await startPurchaseFlow('Digite seu e-mail para receber a licença:', {
          title: 'Sistema Controle Financeiro - Versão Premium',
          unit_price: 39.90
        });
      } catch (err) {
        console.error(err);
        alert('Erro inesperado ao criar preferência: ' + err.message);
      }
    });
  });
}

function attachBusinessPurchase() {
  const buttons = [
    document.getElementById('businessBuyBtn'),
    document.getElementById('empresarialBuyBtn')
  ].filter(Boolean);
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await startPurchaseFlow('Digite seu e-mail para receber o pacote Empresarial:', {
          title: 'Sistema Controle Financeiro - Versão Empresarial (Personalizada)',
          unit_price: 149.90
        });
      } catch (err) {
        console.error(err);
        alert('Erro inesperado ao criar preferência: ' + err.message);
      }
    });
  });
}

function activateNav() {
  const links = document.querySelectorAll('.nav a');
  const path = window.location.pathname || '';
  links.forEach((a) => {
    try {
      const href = a.getAttribute('href') || '';
      if (href && path.endsWith(href)) {
        a.classList.add('active');
      }
    } catch (_) {}
  });
}

function initProgressBars() {
  try {
    const bars = document.querySelectorAll('.progress');
    if (!bars.length) return;

    const parseNumber = (v) => {
      if (typeof v === 'number') return v;
      if (!v) return 0;
      const s = String(v).trim()
        .replace(/R\$\s?/gi, '')
        .replace(/\./g, '')
        .replace(/,/g, '.');
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    };

    const formatPct = (n) => {
      const v = Math.max(0, Math.min(100, Number(n) || 0));
      const rounded1 = Math.round(v * 10) / 10; // uma casa decimal
      const isInt = Math.abs(rounded1 - Math.round(rounded1)) < 1e-9;
      return isInt
        ? Math.round(rounded1) + '%'
        : rounded1.toFixed(1).replace('.', ',') + '%';
    };

    const animateTo = (el, target) => {
      const valueEl = el.querySelector('.progress__value');
      const textEl = el.querySelector('.progress__text');
      if (!valueEl) return;
      const clamped = Math.max(0, Math.min(100, Number(target) || 0));
      valueEl.style.width = clamped + '%';
      if (textEl) textEl.textContent = formatPct(clamped);
      const track = el.querySelector('.progress__track');
      if (track) {
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(clamped));
      }
    };

    const getTarget = (el) => {
      // Preferir cálculo automático por current/target quando disponível
      const currentAttr = el.getAttribute('data-current');
      const targetAttr = el.getAttribute('data-target');
      if (currentAttr != null && targetAttr != null) {
        const current = parseNumber(currentAttr);
        const target = parseNumber(targetAttr);
        if (target > 0) return (current / target) * 100;
      }
      // Valor direto em percentual
      const attr = el.getAttribute('data-value');
      if (attr != null) return Number(attr);
      const valueEl = el.querySelector('.progress__value');
      if (valueEl) {
        const cssVar = valueEl.style.getPropertyValue('--value');
        if (cssVar) return Number(cssVar);
      }
      return 0;
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const target = getTarget(entry.target);
          animateTo(entry.target, target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    bars.forEach((bar) => {
      // inicializar com 0% e animar quando entrar na viewport
      animateTo(bar, 0);
      io.observe(bar);
    });
  } catch (err) {
    console.error('initProgressBars error', err);
  }
}

// ===== Metas (Goal Cards) =====
function parseBRNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function formatBRL(n) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
  } catch (_) {
    return `R$ ${(n || 0).toFixed(2)}`;
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff;
}

function renderGoalCard(el) {
  const name = el.getAttribute('data-name') || 'Meta';
  const type = el.getAttribute('data-type') || '';
  const currentRaw = el.getAttribute('data-current') || '0';
  const targetRaw = el.getAttribute('data-target') || '0';
  const deadline = el.getAttribute('data-deadline') || '';

  const current = parseBRNumber(currentRaw);
  const target = parseBRNumber(targetRaw);
  const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
  const remaining = Math.max(0, target - current);
  const days = daysUntil(deadline);

  const statusLabel = pct >= 100 ? 'Concluída' : 'Em andamento';

  if (el.querySelector('.goal__content')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'goal__content';
  wrapper.innerHTML = `
    <div class="goal__header" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
      <strong style="font-size:1rem;">${name}</strong>
      <span style="font-size:.8rem; padding:.2rem .4rem; border-radius:.4rem; background:#173351; color:#a8d1ff;">${statusLabel}</span>
      ${type ? `<span style=\"margin-left:auto; font-size:.8rem; padding:.2rem .4rem; border-radius:.4rem; background:#2e2e2e; color:#e0e0e0;\">${type}</span>` : ''}
    </div>
    <div class="goal__amounts" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="color:#38b000; font-weight:600;">${formatBRL(current)}</span>
      <span style="opacity:.7;">/ ${formatBRL(target)}</span>
    </div>
    <div class="progress progress--thin" data-current="${current}" data-target="${target}">
      <div class="progress__track">
        <div class="progress__value"></div>
      </div>
      <div class="progress__text" style="margin-top:4px; font-size:.8rem; opacity:.8;"></div>
    </div>
    <div class="goal__foot" style="margin-top:8px; font-size:.9rem; opacity:.9;">
      ${remaining > 0 ? `Faltam ${formatBRL(remaining)} para atingir a meta` : 'Meta atingida!'}
      ${days != null ? ` — ${days} dias restantes` : ''}
    </div>
  `;

  el.appendChild(wrapper);
}

function initGoalCards() {
  try {
    const goalEls = document.querySelectorAll('[data-goal]');
    if (!goalEls.length) return;
    goalEls.forEach((el) => renderGoalCard(el));
    // Inicializar barras renderizadas dentro dos cards
    initProgressBars();
  } catch (err) {
    console.error('goal cards init error', err);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  attachFreePlanRedirect();
  attachPremiumPurchase();
  attachBusinessPurchase();
  activateNav();
  initGoalCards();
  initProgressBars();
  initHeroChips();

  // Pending page: preencher resumo do pedido e status
  try {
    if ((document.title || '').toLowerCase().includes('pendente')) {
      const params = new URLSearchParams(window.location.search);
      const planEl = document.getElementById('orderPlan');
      const amountEl = document.getElementById('orderAmount');
      const idEl = document.getElementById('orderId');

      let plan = '—';
      let amount = '—';
      let identifier = params.get('external_reference') || params.get('preference_id') || params.get('payment_id') || '—';

      try {
        const stored = JSON.parse(localStorage.getItem('checkout:last') || '{}');
        if (stored && stored.plan) plan = stored.plan.replace('Sistema Controle Financeiro - Versão ', '').trim();
        if (stored && stored.amount != null) amount = 'R$ ' + Number(stored.amount).toFixed(2).replace('.', ',');
        if (stored && stored.external_reference && identifier === '—') identifier = stored.external_reference;
      } catch (_) {}

      if (planEl) planEl.textContent = plan;
      if (amountEl) amountEl.textContent = amount;
      if (idEl) idEl.textContent = identifier;

      // Ajustar mensagem adicional conforme método
      const noteEl = document.querySelector('.note');
      const method = params.get('payment_method_id') || params.get('payment_type') || '';
      if (noteEl) {
        if ((method || '').toLowerCase().includes('bol')) {
          noteEl.textContent = 'Se o pagamento for por boleto, a confirmação pode levar até 2 dias úteis.';
        } else if ((method || '').toLowerCase().includes('pix')) {
          noteEl.textContent = 'Pagamentos via PIX costumam confirmar em poucos minutos.';
        }
      }
    }
  } catch (_) {}

  // Success page: preencher resumo e preparar próxima ação
  try {
    if (window.location && (window.location.pathname || '').endsWith('/success.html')) {
      const params = new URLSearchParams(window.location.search);
      const planEl = document.getElementById('orderPlan');
      const amountEl = document.getElementById('orderAmount');
      const idEl = document.getElementById('orderId');
      const dlBtn = document.getElementById('downloadBtn');

      let plan = '—';
      let amount = '—';
      let identifier = params.get('external_reference') || params.get('preference_id') || params.get('payment_id') || '—';

      try {
        const stored = JSON.parse(localStorage.getItem('checkout:last') || '{}');
        if (stored && stored.plan) plan = stored.plan.replace('Sistema Controle Financeiro - Versão ', '').trim();
        if (stored && stored.amount != null) amount = 'R$ ' + Number(stored.amount).toFixed(2).replace('.', ',');
        if (stored && stored.external_reference && identifier === '—') identifier = stored.external_reference;
      } catch (_) {}

      if (planEl) planEl.textContent = plan;
      if (amountEl) amountEl.textContent = amount;
      if (idEl) idEl.textContent = identifier;

      // Habilitar botão de download se houver URL válida
      try {
        const candidate = (params.get('download_url') || (typeof window.DOWNLOAD_URL === 'string' ? window.DOWNLOAD_URL : '') || '').trim();
        const isValidHttpUrl = (u) => {
          try { const url = new URL(u); return url.protocol === 'http:' || url.protocol === 'https:'; } catch(_) { return false; }
        };
        if (dlBtn) {
          dlBtn.style.display = 'none';
          if (candidate && isValidHttpUrl(candidate)) {
            dlBtn.style.display = '';
            dlBtn.addEventListener('click', function(){ window.location.href = candidate; });
          }
        }
      } catch(_){}
    }
  } catch (_) {}
});

// Animação suave dos valores nos chips do herói
function initHeroChips() {
  try {
    const items = document.querySelectorAll('.chip .value[data-value]');
    if (!items.length) return;

    items.forEach((el) => {
      const target = parseBRNumber(el.getAttribute('data-value'));
      animateCounter(el, target, 900, (n) => formatBRL(n));
    });
  } catch (err) {
    console.error('hero chips init error', err);
  }
}

function animateCounter(el, to, duration, formatter) {
  const start = performance.now();
  const from = 0;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function frame(now) {
    const progress = Math.min(1, (now - start) / (duration || 800));
    const eased = easeOutCubic(progress);
    const current = from + (to - from) * eased;
    try {
      el.textContent = typeof formatter === 'function' ? formatter(current) : String(current.toFixed(2));
    } catch (_) {
      el.textContent = String(current.toFixed(2));
    }
    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
}