const state = {
  settings: null,
  services: [],
  teamSpecialists: [],
  selectedService: null,
  specialists: [],
  selectedSpecialist: null,
  availabilityDays: [],
  selectedDay: null,
  selectedSlot: null,
  customerForm: null,
  confirmedBooking: null,
  bookings: [],
  bookingEditor: null,
  deviceId: getDeviceId()
};

const refs = {
  introSplash: document.querySelector('#intro-splash'),
  introLogo: document.querySelector('#intro-logo'),
  introShopName: document.querySelector('#intro-shop-name'),
  shopLogo: document.querySelector('#shop-logo'),
  shopName: document.querySelector('#shop-name'),
  shopTagline: document.querySelector('#shop-tagline'),
  footerHome: document.querySelector('#footer-home'),
  footerSpecialists: document.querySelector('#footer-specialists'),
  footerMapTrigger: document.querySelector('#footer-map-trigger'),
  siteLink: document.querySelector('#site-link'),
  mapDialog: document.querySelector('#map-dialog'),
  closeMap: document.querySelector('#close-map'),
  mapEmbed: document.querySelector('#map-embed'),
  mapAddressText: document.querySelector('#map-address-text'),
  servicesGrid: document.querySelector('#services-grid'),
  serviceDetail: document.querySelector('#service-detail'),
  specialistsGrid: document.querySelector('#specialists-grid'),
  specialistsStatus: document.querySelector('#specialists-status'),
  daysGrid: document.querySelector('#days-grid'),
  slotsGrid: document.querySelector('#slots-grid'),
  slotsBlock: document.querySelector('#slots-block'),
  scheduleStatus: document.querySelector('#schedule-status'),
  selectionPill: document.querySelector('#selection-pill'),
  bookingForm: document.querySelector('#booking-form'),
  formStatus: document.querySelector('#form-status'),
  summaryCard: document.querySelector('#summary-card'),
  summaryStatus: document.querySelector('#summary-status'),
  successCard: document.querySelector('#success-card'),
  confirmBooking: document.querySelector('#confirm-booking'),
  successHome: document.querySelector('#success-home'),
  successBookings: document.querySelector('#success-bookings'),
  myBookingsTrigger: document.querySelector('#my-bookings-trigger'),
  bookingsDialog: document.querySelector('#bookings-dialog'),
  closeBookings: document.querySelector('#close-bookings'),
  bookingsStatus: document.querySelector('#bookings-status'),
  bookingsList: document.querySelector('#bookings-list'),
  specialistsDialog: document.querySelector('#specialists-dialog'),
  closeSpecialists: document.querySelector('#close-specialists'),
  specialistsDirectoryStatus: document.querySelector('#specialists-directory-status'),
  specialistsDirectoryList: document.querySelector('#specialists-directory-list'),
  screens: {
    home: document.querySelector('#screen-home'),
    detail: document.querySelector('#screen-detail'),
    specialist: document.querySelector('#screen-specialist'),
    schedule: document.querySelector('#screen-schedule'),
    form: document.querySelector('#screen-form'),
    summary: document.querySelector('#screen-summary'),
    success: document.querySelector('#screen-success')
  }
};

const runtimeApiBase = `${window.APP_CONFIG?.API_BASE || ''}`.trim();
const LOCAL_LOGO_SRC = '/client/assets/logo-spa.svg';
let resolvedApiBase = '';
let splashDismissed = false;

function isNativeLike() {
  return Boolean(window.Capacitor) || location.protocol === 'capacitor:' || location.protocol === 'file:';
}

async function resolveApiBase() {
  if (resolvedApiBase) return resolvedApiBase;

  // In web/desktop deploy we explicitly configure API_BASE.
  // Trust it directly instead of blocking on /healthz probing.
  if (runtimeApiBase) {
    resolvedApiBase = runtimeApiBase.replace(/\/+$/, '');
    return resolvedApiBase;
  }

  const candidates = isNativeLike()
    ? ['http://localhost:3200', 'http://10.0.2.2:3200', 'http://192.168.1.21:3200']
    : [''];

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) {
        resolvedApiBase = base;
        return resolvedApiBase;
      }
    } catch {
      // try next
    }
  }

  throw new Error('Backend non raggiungibile o risposta non valida');
}

async function api(path, options = {}) {
  const base = await resolveApiBase();
  const response = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => null);
  if (!data) throw new Error('Backend non raggiungibile o risposta non valida');
  if (!response.ok) throw new Error(data.error || 'Richiesta non riuscita');
  return data;
}

function getDeviceId() {
  const key = 'aurea-beauty-device-id';
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = `device-${crypto.randomUUID()}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

function showScreen(screenName) {
  Object.entries(refs.screens).forEach(([key, node]) => {
    node.classList.toggle('is-hidden', key !== screenName);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function dismissSplash() {
  if (splashDismissed || !refs.introSplash) return;
  splashDismissed = true;
  window.setTimeout(() => {
    refs.introSplash.classList.add('is-leaving');
    window.setTimeout(() => {
      refs.introSplash.classList.add('is-hidden');
    }, 520);
  }, 1400);
}

function setStateCopy(node, message = '', mode = '') {
  if (!node) return;
  node.textContent = message;
  node.classList.remove('is-error', 'is-success');
  if (mode) node.classList.add(mode === 'error' ? 'is-error' : 'is-success');
}

function formatMoney(value) {
  return `€ ${Number(value || 0).toFixed(0)}`;
}

function formatDisplayDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

function formatLongDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function renderBootstrap() {
  if (!state.settings) return;
  if (refs.shopLogo) {
    refs.shopLogo.src = state.settings.logo_url || LOCAL_LOGO_SRC;
    refs.shopLogo.onerror = () => {
      refs.shopLogo.onerror = null;
      refs.shopLogo.src = LOCAL_LOGO_SRC;
    };
  }
  refs.shopName.textContent = state.settings.shop_name;
  refs.shopTagline.textContent = state.settings.tagline;
  if (refs.mapEmbed) {
    refs.mapEmbed.src = `https://maps.google.com/maps?q=${encodeURIComponent(`${state.settings.address} ${state.settings.city}`)}&z=15&output=embed`;
  }
  if (refs.mapAddressText) {
    refs.mapAddressText.textContent = `${state.settings.address}, ${state.settings.city}`;
  }
  if (refs.siteLink && state.settings.website_url) {
    refs.siteLink.href = state.settings.website_url;
  }
  refs.introLogo.src = state.settings.logo_url || LOCAL_LOGO_SRC;
  refs.introLogo.onerror = () => {
    refs.introLogo.onerror = null;
    refs.introLogo.src = LOCAL_LOGO_SRC;
  };
  refs.introShopName.textContent = state.settings.shop_name;
}

function renderServices(error = '') {
  refs.servicesGrid.innerHTML = '';
  if (error) {
    refs.servicesGrid.innerHTML = `<p class="empty-state is-error">${error}</p>`;
    return;
  }
  if (!state.services.length) {
    refs.servicesGrid.innerHTML = '<p class="empty-state">Nessun trattamento disponibile al momento.</p>';
    return;
  }

  state.services.forEach((service, index) => {
    const card = document.createElement('button');
    card.className = `service-card service-card-${(index % 6) + 1}`;
    card.type = 'button';
    card.innerHTML = `
      <div class="service-media">
        <img src="${service.image_url}" alt="${service.name}">
      </div>
      <div class="service-content">
        <p class="service-category">${service.category}</p>
        <h3>${service.name}</h3>
        <p class="service-description">${service.description}</p>
        <div class="service-meta">
          <span>${service.duration_minutes} min</span>
          <span>${formatMoney(service.price)}</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openService(service.id));
    refs.servicesGrid.appendChild(card);
  });
}

async function openService(serviceId) {
  try {
    const data = await api(`/api/client/services/${serviceId}`);
    state.selectedService = data.service;
    state.specialists = data.specialists || [];
    state.selectedSpecialist = null;
    state.selectedDay = null;
    state.selectedSlot = null;
    state.customerForm = null;
    refs.serviceDetail.innerHTML = renderServiceDetailMarkup(data.service);
    refs.serviceDetail.querySelector('[data-book-now]')?.addEventListener('click', async () => {
      renderSpecialists();
      showScreen('specialist');
    });
    showScreen('detail');
  } catch (error) {
    renderServices(error.message);
  }
}

function renderServiceDetailMarkup(service) {
  const benefits = `${service.benefits || ''}`.split('\n').map((item) => item.trim()).filter(Boolean);
  return `
    <div class="detail-media">
      <img src="${service.image_url}" alt="${service.name}">
    </div>
    <div class="detail-body">
      <p class="section-kicker soft-kicker">${service.category}</p>
      <h2>${service.name}</h2>
      <p class="detail-description">${service.description}</p>
      <div class="detail-meta">
        <span>${service.duration_minutes} min</span>
        <span>${formatMoney(service.price)}</span>
      </div>
      <div class="benefits-card">
        <h3>Benefici</h3>
        <ul>
          ${benefits.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </div>
      <button class="primary-btn" data-book-now type="button">Prenota ora</button>
    </div>
  `;
}

function renderSpecialists() {
  refs.specialistsGrid.innerHTML = '';
  if (!state.specialists.length) {
    setStateCopy(refs.specialistsStatus, 'Nessuna specialista disponibile per questo trattamento al momento.', 'error');
    return;
  }

  setStateCopy(refs.specialistsStatus, 'Scegli la professionista che preferisci per continuare.');
  state.specialists.forEach((specialist) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `specialist-card${state.selectedSpecialist?.id === specialist.id ? ' is-active' : ''}`;
    button.innerHTML = `
      <div class="specialist-photo-shell">
        <img class="specialist-photo" src="${specialist.photo_url}" alt="${specialist.name}">
      </div>
      <div class="specialist-copy">
        <h3>${specialist.name}</h3>
        <p class="specialist-role">${specialist.role || 'Beauty specialist'}</p>
        <p class="specialist-bio">${specialist.bio || 'Esperta nei rituali signature del centro.'}</p>
      </div>
    `;
    button.addEventListener('click', async () => {
      state.selectedSpecialist = specialist;
      await loadAvailability();
      showScreen('schedule');
    });
    refs.specialistsGrid.appendChild(button);
  });
}

async function loadAvailability(referenceDate = '') {
  if (!state.selectedService) return;
  setStateCopy(refs.scheduleStatus, 'Sto caricando le disponibilità...');
  try {
    const params = new URLSearchParams({ serviceId: String(state.selectedService.id) });
    if (state.selectedSpecialist?.id) params.set('specialistId', String(state.selectedSpecialist.id));
    if (referenceDate) params.set('referenceDate', referenceDate);
    const data = await api(`/api/client/availability?${params.toString()}`);
    state.selectedSpecialist = data.specialist;
    state.availabilityDays = data.days || [];
    state.selectedDay = null;
    state.selectedSlot = null;
    renderAvailability();
  } catch (error) {
    refs.daysGrid.innerHTML = '';
    refs.slotsGrid.innerHTML = '';
    refs.slotsBlock.classList.add('is-hidden');
    setStateCopy(refs.scheduleStatus, error.message, 'error');
  }
}

function renderAvailability() {
  refs.daysGrid.innerHTML = '';
  refs.slotsGrid.innerHTML = '';
  refs.slotsBlock.classList.add('is-hidden');

  if (!state.availabilityDays.length) {
    setStateCopy(refs.scheduleStatus, 'Nessun giorno disponibile al momento per questo trattamento.', 'error');
    return;
  }

  setStateCopy(refs.scheduleStatus, state.selectedDay ? '' : 'Seleziona un giorno per vedere gli orari disponibili.');
  state.availabilityDays.forEach((day) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `day-card${state.selectedDay?.date === day.date ? ' is-active' : ''}`;
    const date = new Date(`${day.date}T12:00:00`);
    button.innerHTML = `
      <span class="day-name">${new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date)}</span>
      <strong>${new Intl.DateTimeFormat('it-IT', { day: '2-digit' }).format(date)}</strong>
      <span class="day-month">${new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date)}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedDay = day;
      state.selectedSlot = null;
      renderAvailability();
    });
    refs.daysGrid.appendChild(button);
  });

  if (!state.selectedDay) return;

  refs.slotsBlock.classList.remove('is-hidden');
  refs.slotsGrid.innerHTML = state.selectedDay.slots.map((slot) => `
    <button class="slot-pill${state.selectedSlot === slot ? ' is-active' : ''}" type="button" data-slot="${slot}">${slot}</button>
  `).join('');

  refs.slotsGrid.querySelectorAll('[data-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSlot = button.dataset.slot;
      renderAvailability();
      refs.selectionPill.textContent = `${state.selectedService.name} · ${formatLongDate(state.selectedDay.date)} · ${state.selectedSlot}`;
      if (state.selectedSpecialist?.name) {
        refs.selectionPill.textContent = `${state.selectedService.name} · ${state.selectedSpecialist.name} · ${formatLongDate(state.selectedDay.date)} · ${state.selectedSlot}`;
      }
      showScreen('form');
    });
  });
}

function renderSummaryCard(target, bookingLike, successMode = false) {
  const customer = bookingLike.customer_name ? `
    <div class="summary-row"><span>Cliente</span><strong>${bookingLike.customer_name}</strong></div>
    <div class="summary-row"><span>Telefono</span><strong>${bookingLike.customer_phone}</strong></div>
  ` : '';
  const note = bookingLike.customer_note ? `<div class="summary-note"><span>Nota</span><p>${bookingLike.customer_note}</p></div>` : '';
  target.innerHTML = `
    <div class="summary-grid">
      <div class="summary-row"><span>Trattamento</span><strong>${bookingLike.service_name || bookingLike.name}</strong></div>
      ${state.selectedSpecialist?.name && !successMode ? `<div class="summary-row"><span>Specialista</span><strong>${state.selectedSpecialist.name}</strong></div>` : ''}
      <div class="summary-row"><span>Data</span><strong>${formatLongDate(bookingLike.booking_date || bookingLike.date)}</strong></div>
      <div class="summary-row"><span>Orario</span><strong>${bookingLike.booking_time || bookingLike.time}</strong></div>
      <div class="summary-row"><span>Durata</span><strong>${bookingLike.duration_minutes} min</strong></div>
      <div class="summary-row"><span>Prezzo</span><strong>${formatMoney(bookingLike.price)}</strong></div>
      ${successMode && bookingLike.specialist_name ? `<div class="summary-row"><span>Operatrice</span><strong>${bookingLike.specialist_name}</strong></div>` : ''}
      ${customer}
    </div>
    ${note}
  `;
}

function collectDraftBooking() {
  return {
    name: state.selectedService.name,
    service_name: state.selectedService.name,
    duration_minutes: state.selectedService.duration_minutes,
    price: state.selectedService.price,
    date: state.selectedDay.date,
    booking_date: state.selectedDay.date,
    time: state.selectedSlot,
    booking_time: state.selectedSlot,
    ...state.customerForm
  };
}

async function submitBooking(event) {
  event.preventDefault();
  setStateCopy(refs.formStatus, '');
  const formData = new FormData(refs.bookingForm);
  const payload = {
    customer_name: `${formData.get('customer_name') || ''}`.trim(),
    customer_phone: `${formData.get('customer_phone') || ''}`.trim(),
    customer_note: `${formData.get('customer_note') || ''}`.trim(),
    privacy_consent: refs.bookingForm.elements.privacy_consent.checked
  };

  if (!payload.privacy_consent) {
    setStateCopy(refs.formStatus, 'Devi accettare il consenso privacy per procedere.', 'error');
    return;
  }

  state.customerForm = payload;
  renderSummaryCard(refs.summaryCard, collectDraftBooking());
  showScreen('summary');
}

async function confirmBooking() {
  setStateCopy(refs.summaryStatus, 'Sto confermando la prenotazione...');
  try {
    const result = await api('/api/client/bookings', {
      method: 'POST',
      body: JSON.stringify({
        service_id: state.selectedService.id,
        specialist_id: state.selectedSpecialist?.id,
        booking_date: state.selectedDay.date,
        booking_time: state.selectedSlot,
        customer_name: state.customerForm.customer_name,
        customer_phone: state.customerForm.customer_phone,
        customer_note: state.customerForm.customer_note,
        privacy_consent: true,
        customer_device_id: state.deviceId
      })
    });
    state.confirmedBooking = result.booking;
    renderSummaryCard(refs.successCard, result.booking, true);
    refs.bookingForm.reset();
    setStateCopy(refs.summaryStatus, '');
    showScreen('success');
    await loadBookings();
  } catch (error) {
    setStateCopy(refs.summaryStatus, error.message, 'error');
  }
}

async function loadBookings() {
  setStateCopy(refs.bookingsStatus, 'Sto caricando le tue prenotazioni...');
  try {
    const data = await api(`/api/client/bookings?deviceId=${encodeURIComponent(state.deviceId)}`);
    state.bookings = data.bookings || [];
    renderBookings();
  } catch (error) {
    refs.bookingsList.innerHTML = '';
    setStateCopy(refs.bookingsStatus, error.message, 'error');
  }
}

function renderBookings() {
  const visibleBookings = state.bookings.filter((booking) => booking.status !== 'cancelled');

  if (!visibleBookings.length) {
    refs.bookingsList.innerHTML = `
      <article class="booking-empty-card">
        <h3>Nessuna prenotazione salvata.</h3>
        <p>Quando confermi un appuntamento da questa app, lo trovi qui con data, orario e stato.</p>
      </article>
    `;
    setStateCopy(refs.bookingsStatus, '');
    return;
  }

  setStateCopy(refs.bookingsStatus, '');
  refs.bookingsList.innerHTML = visibleBookings.map((booking) => `
    <article class="booking-card">
      <div class="booking-card-head">
        <div>
          <p class="section-kicker soft-kicker">${booking.service_category}</p>
          <h3>${booking.service_name}</h3>
        </div>
        <span class="booking-badge status-${booking.status}">${booking.status_label}</span>
      </div>
      <div class="booking-summary-grid">
        <div><span>Data</span><strong>${formatLongDate(booking.booking_date)}</strong></div>
        <div><span>Orario</span><strong>${booking.booking_time}</strong></div>
        <div><span>Durata</span><strong>${booking.duration_minutes} min</strong></div>
        <div><span>Prezzo</span><strong>${formatMoney(booking.price)}</strong></div>
      </div>
      ${canManageBooking(booking) ? `
        <div class="booking-actions">
          <button class="ghost-btn" type="button" data-manage-booking="${booking.booking_token}">Gestisci</button>
          <button class="ghost-btn danger-btn" type="button" data-cancel-booking="${booking.booking_token}">Annulla</button>
        </div>
      ` : ''}
      ${renderBookingEditor(booking)}
    </article>
  `).join('');

  refs.bookingsList.querySelectorAll('[data-manage-booking]').forEach((button) => {
    button.addEventListener('click', () => openBookingEditor(button.dataset.manageBooking));
  });
  refs.bookingsList.querySelectorAll('[data-cancel-booking]').forEach((button) => {
    button.addEventListener('click', () => cancelBooking(button.dataset.cancelBooking));
  });
  refs.bookingsList.querySelectorAll('[data-editor-day]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.bookingEditor) return;
      state.bookingEditor.selectedDay = state.bookingEditor.days.find((day) => day.date === button.dataset.editorDay) || null;
      state.bookingEditor.selectedSlot = null;
      renderBookings();
    });
  });
  refs.bookingsList.querySelectorAll('[data-editor-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.bookingEditor) return;
      state.bookingEditor.selectedSlot = button.dataset.editorSlot;
      renderBookings();
    });
  });
  refs.bookingsList.querySelectorAll('[data-confirm-reschedule]').forEach((button) => {
    button.addEventListener('click', () => confirmBookingEdit(button.dataset.confirmReschedule));
  });
}

function canManageBooking(booking) {
  return booking.status === 'confirmed' || booking.status === 'pending';
}

function renderBookingEditor(booking) {
  if (!state.bookingEditor || state.bookingEditor.token !== booking.booking_token) return '';

  const daysMarkup = (state.bookingEditor.days || []).map((day) => {
    const date = new Date(`${day.date}T12:00:00`);
    return `
      <button class="day-card booking-edit-day${state.bookingEditor.selectedDay?.date === day.date ? ' is-active' : ''}" type="button" data-editor-day="${day.date}">
        <span class="day-name">${new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date)}</span>
        <strong>${new Intl.DateTimeFormat('it-IT', { day: '2-digit' }).format(date)}</strong>
        <span class="day-month">${new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date)}</span>
      </button>
    `;
  }).join('');

  const slots = state.bookingEditor.selectedDay?.slots || [];
  const slotsMarkup = slots.map((slot) => `
    <button class="slot-pill${state.bookingEditor.selectedSlot === slot ? ' is-active' : ''}" type="button" data-editor-slot="${slot}">${slot}</button>
  `).join('');

  return `
    <div class="booking-editor-card">
      <p class="section-kicker soft-kicker">Cambio appuntamento</p>
      <h4>Seleziona nuovo giorno e orario</h4>
      <div class="days-grid booking-edit-days">${daysMarkup}</div>
      ${state.bookingEditor.selectedDay ? `
        <div class="slots-grid booking-edit-slots">${slotsMarkup}</div>
      ` : '<p class="state-copy">Seleziona prima un giorno.</p>'}
      <p class="state-copy ${state.bookingEditor.error ? 'is-error' : ''}">${state.bookingEditor.error || ''}</p>
      <button class="primary-btn" type="button" data-confirm-reschedule="${booking.booking_token}" ${state.bookingEditor.selectedSlot ? '' : 'disabled'}>Conferma modifica</button>
    </div>
  `;
}

async function openBookingEditor(token) {
  const booking = state.bookings.find((item) => item.booking_token === token);
  if (!booking) return;

  state.bookingEditor = {
    token,
    days: [],
    selectedDay: null,
    selectedSlot: null,
    error: ''
  };
  renderBookings();

  try {
    const params = new URLSearchParams({
      serviceId: String(booking.service_id),
      specialistId: String(booking.specialist_id),
      referenceDate: booking.booking_date
    });
    const data = await api(`/api/client/availability?${params.toString()}`);
    state.bookingEditor.days = data.days || [];
    renderBookings();
  } catch (error) {
    state.bookingEditor.error = error.message;
    renderBookings();
  }
}

async function confirmBookingEdit(token) {
  if (!state.bookingEditor?.selectedDay || !state.bookingEditor?.selectedSlot) return;
  state.bookingEditor.error = 'Sto aggiornando la prenotazione...';
  renderBookings();

  try {
    await api(`/api/client/bookings/${token}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({
        customer_device_id: state.deviceId,
        booking_date: state.bookingEditor.selectedDay.date,
        booking_time: state.bookingEditor.selectedSlot
      })
    });
    state.bookingEditor = null;
    await loadBookings();
  } catch (error) {
    state.bookingEditor.error = error.message;
    renderBookings();
  }
}

async function cancelBooking(token) {
  if (!window.confirm('Sei sicuro di voler annullare questa prenotazione?')) return;
  try {
    await api(`/api/client/bookings/${token}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({
        customer_device_id: state.deviceId
      })
    });
    if (state.bookingEditor?.token === token) {
      state.bookingEditor = null;
    }
    await loadBookings();
  } catch (error) {
    setStateCopy(refs.bookingsStatus, error.message, 'error');
  }
}

function renderSpecialistsDirectory() {
  if (!state.teamSpecialists.length) {
    refs.specialistsDirectoryList.innerHTML = '';
    setStateCopy(refs.specialistsDirectoryStatus, 'Nessuna specialista disponibile al momento.', 'error');
    return;
  }

  setStateCopy(refs.specialistsDirectoryStatus, '');
  refs.specialistsDirectoryList.innerHTML = state.teamSpecialists.map((specialist) => `
    <article class="specialist-directory-card">
      <div class="specialist-directory-photo-shell">
        <img class="specialist-directory-photo" src="${specialist.photo_url}" alt="${specialist.name}">
      </div>
      <div class="specialist-directory-copy">
        <h3>${specialist.name}</h3>
        <p class="specialist-role">${specialist.role || 'Beauty specialist'}</p>
        <p class="specialist-bio">${specialist.bio || 'Esperta nei rituali beauty del centro.'}</p>
      </div>
    </article>
  `).join('');
}

async function ensureTeamSpecialists(forceRefresh = false) {
  if (state.teamSpecialists.length && !forceRefresh) return;
  setStateCopy(refs.specialistsDirectoryStatus, 'Sto caricando il team...');
  try {
    const data = await api('/api/client/specialists');
    state.teamSpecialists = data.specialists || [];
  } catch {
    if (state.teamSpecialists.length) return;
    const specialistMap = new Map();
    for (const service of state.services) {
      try {
        const detail = await api(`/api/client/services/${service.id}`);
        (detail.specialists || []).forEach((specialist) => {
          if (!specialistMap.has(specialist.id)) {
            specialistMap.set(specialist.id, specialist);
          }
        });
      } catch {
        // ignore single service failure and keep collecting others
      }
    }
    state.teamSpecialists = Array.from(specialistMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }
}

function resetFlow() {
  state.selectedService = null;
  state.specialists = [];
  state.selectedSpecialist = null;
  state.availabilityDays = [];
  state.selectedDay = null;
  state.selectedSlot = null;
  state.customerForm = null;
  state.confirmedBooking = null;
  state.bookingEditor = null;
  refs.bookingForm.reset();
  refs.selectionPill.textContent = '';
  refs.slotsGrid.innerHTML = '';
  refs.slotsBlock.classList.add('is-hidden');
  setStateCopy(refs.formStatus, '');
  setStateCopy(refs.summaryStatus, '');
  showScreen('home');
}

function bindEvents() {
  document.querySelectorAll('[data-screen-back]').forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.screenBack));
  });
  refs.bookingForm.addEventListener('submit', submitBooking);
  refs.confirmBooking.addEventListener('click', confirmBooking);
  refs.successHome.addEventListener('click', resetFlow);
  refs.successBookings.addEventListener('click', async () => {
    await openBookingsDialog();
  });
  refs.myBookingsTrigger.addEventListener('click', openBookingsDialog);
  refs.footerHome.addEventListener('click', resetFlow);
  refs.footerSpecialists.addEventListener('click', openSpecialistsDialog);
  refs.footerMapTrigger.addEventListener('click', () => refs.mapDialog.showModal());
  refs.closeBookings.addEventListener('click', () => refs.bookingsDialog.close());
  refs.closeSpecialists.addEventListener('click', () => refs.specialistsDialog.close());
  refs.closeMap.addEventListener('click', () => refs.mapDialog.close());
  refs.bookingsDialog.addEventListener('click', (event) => {
    const rect = refs.bookingsDialog.getBoundingClientRect();
    const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
    if (!inside) refs.bookingsDialog.close();
  });
  refs.mapDialog.addEventListener('click', (event) => {
    const rect = refs.mapDialog.getBoundingClientRect();
    const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
    if (!inside) refs.mapDialog.close();
  });
  refs.specialistsDialog.addEventListener('click', (event) => {
    const rect = refs.specialistsDialog.getBoundingClientRect();
    const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
    if (!inside) refs.specialistsDialog.close();
  });
}

async function openBookingsDialog() {
  await loadBookings();
  refs.bookingsDialog.showModal();
}

async function openSpecialistsDialog() {
  try {
    await ensureTeamSpecialists(true);
  } catch (error) {
    refs.specialistsDirectoryList.innerHTML = '';
    setStateCopy(refs.specialistsDirectoryStatus, error.message, 'error');
  }
  renderSpecialistsDirectory();
  refs.specialistsDialog.showModal();
}

async function bootstrap() {
  try {
    const data = await api('/api/client/bootstrap');
    state.settings = data.settings;
    state.services = data.services || [];
    state.teamSpecialists = data.specialists || [];
    renderBootstrap();
    renderServices();
    dismissSplash();
  } catch (error) {
    renderBootstrap();
    renderServices(error.message);
    dismissSplash();
  }
}

bindEvents();
bootstrap();
