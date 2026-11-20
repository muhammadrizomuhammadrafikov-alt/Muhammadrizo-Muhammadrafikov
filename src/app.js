import {
  CATEGORIES,
  COLOR_FINISHES,
  FURNITURE_CATALOG,
  formatPriceUZS,
} from './catalog.js';
import { FurnitureViewport } from './furniture3d.js';
import { sendOrderToTelegram } from './telegram.js';

const CART_STORAGE_KEY = 'monolit_cart_v1';

export function initApp() {
  const state = {
    category: 'barchasi',
    colorFilter: 'barchasi',
    searchQuery: '',
    selectedCardColor: {},
    studioProductId: FURNITURE_CATALOG[0].id,
    studioColorId: FURNITURE_CATALOG[0].defaultColor,
    modalProductId: FURNITURE_CATALOG[0].id,
    modalColorId: FURNITURE_CATALOG[0].defaultColor,
    cart: loadCart(),
    snapshots: {},
    isSubmittingOrder: false,
  };

  FURNITURE_CATALOG.forEach((item) => {
    state.selectedCardColor[item.id] = item.defaultColor;
  });

  // DOM References
  const el = {
    headerCartCount: document.getElementById('header-cart-count'),
    openCartBtn: document.getElementById('open-cart-btn'),
    footerOpenCartBtn: document.getElementById('footer-open-cart-btn'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileMenu: document.getElementById('mobile-menu'),
    heroInspectBtn: document.getElementById('hero-inspect-btn'),

    studioTabs: document.getElementById('studio-product-tabs'),
    studioCanvasHost: document.getElementById('studio-canvas-host'),
    studioHudTitle: document.getElementById('studio-hud-title'),
    studioDockWrapper: document.getElementById('studio-dock-wrapper'),
    studioDockToggle: document.getElementById('studio-dock-toggle'),
    studioDockToggleLabel: document.getElementById('studio-dock-toggle-label'),
    studioExplodeSlider: document.getElementById('studio-explode-slider'),
    studioAutoRotateBtn: document.getElementById('studio-autorotate-btn'),
    studioInfoCategory: document.getElementById('studio-info-category'),
    studioInfoName: document.getElementById('studio-info-name'),
    studioInfoPrice: document.getElementById('studio-info-price'),
    studioInfoDesc: document.getElementById('studio-info-desc'),
    studioInfoColorName: document.getElementById('studio-info-color-name'),
    studioColorButtons: document.getElementById('studio-color-buttons'),
    studioInfoDims: document.getElementById('studio-info-dims'),
    studioInfoMaterial: document.getElementById('studio-info-material'),
    studioAddCartBtn: document.getElementById('studio-add-cart-btn'),
    studioBuyNowBtn: document.getElementById('studio-buy-now-btn'),

    catalogSearch: document.getElementById('catalog-search'),
    categoryFilters: document.getElementById('category-filters'),
    colorFilters: document.getElementById('color-filters'),
    productGrid: document.getElementById('product-grid'),
    emptyCatalogState: document.getElementById('empty-catalog-state'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),

    modal: document.getElementById('product-3d-modal'),
    modalCanvasHost: document.getElementById('modal-canvas-host'),
    closeModalBtn: document.getElementById('close-3d-modal-btn'),
    modalExplodeSlider: document.getElementById('modal-explode-slider'),
    modalAutoRotateBtn: document.getElementById('modal-autorotate-btn'),
    modalProductCategory: document.getElementById('modal-product-category'),
    modalProductTitle: document.getElementById('modal-product-title'),
    modalProductPrice: document.getElementById('modal-product-price'),
    modalProductDesc: document.getElementById('modal-product-desc'),
    modalColorLabel: document.getElementById('modal-color-label'),
    modalColorButtons: document.getElementById('modal-color-buttons'),
    modalProductDims: document.getElementById('modal-product-dims'),
    modalProductMaterial: document.getElementById('modal-product-material'),
    modalAddCartBtn: document.getElementById('modal-add-cart-btn'),
    modalOrderNowBtn: document.getElementById('modal-order-now-btn'),

    cartBackdrop: document.getElementById('cart-drawer-backdrop'),
    cartDrawer: document.getElementById('cart-drawer'),
    closeCartBtn: document.getElementById('close-cart-btn'),
    cartSubtitle: document.getElementById('cart-subtitle'),
    cartEmptyState: document.getElementById('cart-empty-state'),
    cartBrowseBtn: document.getElementById('cart-browse-btn'),
    cartItemsList: document.getElementById('cart-items-list'),
    cartFooter: document.getElementById('cart-footer'),
    cartSubtotal: document.getElementById('cart-subtotal'),
    checkoutForm: document.getElementById('checkout-form'),
    customerName: document.getElementById('customer-name'),
    customerPhone: document.getElementById('customer-phone'),
    customerAddress: document.getElementById('customer-address'),
    customerNote: document.getElementById('customer-note'),
    checkoutFeedback: document.getElementById('checkout-feedback'),
    submitOrderBtn: document.getElementById('submit-order-btn'),
    orderSuccessPanel: document.getElementById('order-success-panel'),
    orderReceiptNumber: document.getElementById('order-receipt-number'),
    orderReceiptStatus: document.getElementById('order-receipt-status'),
    orderReceiptSummary: document.getElementById('order-receipt-summary'),
    newOrderBtn: document.getElementById('new-order-btn'),

    toastBanner: document.getElementById('toast-banner'),
  };

  // Initialize Primary 3D Studio Viewport
  const studioProduct = getProductById(state.studioProductId);
  const studioViewport = new FurnitureViewport(el.studioCanvasHost, {
    modelType: studioProduct.modelType,
    colorId: state.studioColorId,
  });

  // Capture unique 3D snapshots for products without dedicated studio photos
  try {
    state.snapshots['osiyo-fluted-komod'] = studioViewport.captureProductSnapshot('console', 'qora');
    state.snapshots['alabaster-yotoq'] = studioViewport.captureProductSnapshot('bed', 'oq');
  } catch {
    // Graceful fallback if WebGL snapshot is blocked
  }

  // Lazy Modal 3D Viewport (created once when modal first opens)
  let modalViewport = null;

  // Toast helper
  let toastTimer = 0;
  function showToast(text) {
    el.toastBanner.textContent = text;
    el.toastBanner.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.toastBanner.classList.add('hidden');
    }, 2600);
  }

  function getProductById(id) {
    return FURNITURE_CATALOG.find((item) => item.id === id) || FURNITURE_CATALOG[0];
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
    } catch {
      // Ignore storage error
    }
  }

  function addToCart(productId, colorId) {
    const product = getProductById(productId);
    const chosenColor = colorId || product.defaultColor;
    const existing = state.cart.find(
      (item) => item.productId === product.id && item.color === chosenColor
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        color: chosenColor,
        image: state.snapshots[product.id] || product.image,
        quantity: 1,
      });
    }

    saveCart();
    renderCart();
    const finishName = COLOR_FINISHES[chosenColor]?.label || chosenColor;
    showToast(`${product.name} (${finishName}) savatchaga qo‘shildi`);
  }

  function updateCartQuantity(index, delta) {
    const item = state.cart[index];
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
      state.cart.splice(index, 1);
    }
    saveCart();
    renderCart();
  }

  function removeCartItem(index) {
    state.cart.splice(index, 1);
    saveCart();
    renderCart();
  }

  // Render Studio Product Tabs & Details
  function renderStudioTabs() {
    el.studioTabs.innerHTML = FURNITURE_CATALOG.map((item) => {
      const active = item.id === state.studioProductId;
      return `
        <button
          type="button"
          role="tab"
          aria-selected="${active}"
          data-studio-product="${item.id}"
          class="studio-tab-btn ${active ? 'is-active' : ''}"
        >
          ${item.categoryLabel}
        </button>
      `;
    }).join('');

    el.studioTabs.querySelectorAll('[data-studio-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const product = getProductById(btn.dataset.studioProduct);
        state.studioProductId = product.id;
        state.studioColorId = product.defaultColor;
        el.studioExplodeSlider.value = '0';
        studioViewport.setExplode(0);
        studioViewport.setProduct(product.modelType, state.studioColorId);
        renderStudioTabs();
        renderStudioDetails();
      });
    });
  }

  function renderStudioDetails() {
    const product = getProductById(state.studioProductId);
    const finish = COLOR_FINISHES[state.studioColorId] || COLOR_FINISHES.chiqarang;

    el.studioHudTitle.textContent = product.name;
    el.studioInfoCategory.textContent = `${product.categoryLabel} · ${product.tag}`;
    el.studioInfoName.textContent = product.name;
    el.studioInfoPrice.textContent = formatPriceUZS(product.price);
    el.studioInfoDesc.textContent = product.description;
    el.studioInfoColorName.textContent = finish.label;
    el.studioInfoDims.textContent = product.dimensions;
    el.studioInfoMaterial.textContent = product.material;

    el.studioColorButtons.innerHTML = product.colors
      .map((colorId) => {
        const c = COLOR_FINISHES[colorId];
        const active = colorId === state.studioColorId;
        return `
          <button
            type="button"
            data-studio-color="${colorId}"
            class="flex items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              active
                ? 'border-[#DFD3C3] bg-[#DFD3C3] text-[#141414]'
                : 'border-white/15 bg-white/5 text-[#DFD3C3] hover:border-white/35'
            }"
          >
            <span
              class="h-3.5 w-3.5 shrink-0 rounded-full border border-black/25"
              style="background-color: ${c.swatchHex}"
            ></span>
            <span>${c.label}</span>
          </button>
        `;
      })
      .join('');

    el.studioColorButtons.querySelectorAll('[data-studio-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.studioColorId = btn.dataset.studioColor;
        studioViewport.setProduct(product.modelType, state.studioColorId);
        renderStudioDetails();
      });
    });
  }

  // Render Category & Color Filters
  function renderFilters() {
    el.categoryFilters.innerHTML = CATEGORIES.map((cat) => {
      const active = cat.id === state.category;
      return `
        <button
          type="button"
          data-category="${cat.id}"
          class="rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            active
              ? 'bg-[#141414] text-white'
              : 'text-[#4A4742] hover:bg-white/70 hover:text-[#141414]'
          }"
        >
          ${cat.label}
        </button>
      `;
    }).join('');

    el.categoryFilters.querySelectorAll('[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.category = btn.dataset.category;
        renderFilters();
        renderProductGrid();
      });
    });

    const colorOptions = [
      { id: 'barchasi', label: 'Barcha ranglar', hex: null },
      { id: 'qora', label: 'Qora', hex: COLOR_FINISHES.qora.swatchHex },
      { id: 'oq', label: 'Oq', hex: COLOR_FINISHES.oq.swatchHex },
      { id: 'chiqarang', label: 'Chiqarang', hex: COLOR_FINISHES.chiqarang.swatchHex },
    ];

    el.colorFilters.innerHTML = colorOptions
      .map((opt) => {
        const active = opt.id === state.colorFilter;
        const swatch = opt.hex
          ? `<span class="h-3.5 w-3.5 rounded-full border border-black/25 shrink-0" style="background-color: ${opt.hex}"></span>`
          : '';
        return `
          <button
            type="button"
            data-color-filter="${opt.id}"
            class="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'border-[#141414] bg-[#141414] text-white'
                : 'border-black/15 bg-white text-[#141414] hover:border-black/40'
            }"
          >
            ${swatch}
            <span>${opt.label}</span>
          </button>
        `;
      })
      .join('');

    el.colorFilters.querySelectorAll('[data-color-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.colorFilter = btn.dataset.colorFilter;
        renderFilters();
        renderProductGrid();
      });
    });
  }

  // Render Catalog Product Grid
  function renderProductGrid() {
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = FURNITURE_CATALOG.filter((item) => {
      const matchesCat = state.category === 'barchasi' || item.category === state.category;
      const matchesColor =
        state.colorFilter === 'barchasi' || item.colors.includes(state.colorFilter);
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.categoryLabel.toLowerCase().includes(query) ||
        item.material.toLowerCase().includes(query);
      return matchesCat && matchesColor && matchesSearch;
    });

    if (filtered.length === 0) {
      el.productGrid.innerHTML = '';
      el.emptyCatalogState.classList.remove('hidden');
      return;
    }

    el.emptyCatalogState.classList.add('hidden');
    el.productGrid.innerHTML = filtered
      .map((item) => {
        const activeColor =
          state.colorFilter !== 'barchasi' && item.colors.includes(state.colorFilter)
            ? state.colorFilter
            : state.selectedCardColor[item.id] || item.defaultColor;
        state.selectedCardColor[item.id] = activeColor;
        const finishLabel = COLOR_FINISHES[activeColor]?.label || activeColor;
        const cardImage = state.snapshots[item.id] || item.image;

        const swatchesHtml = item.colors
          .map((cId) => {
            const c = COLOR_FINISHES[cId];
            const isSel = cId === activeColor;
            return `
              <button
                type="button"
                aria-label="${item.name} — ${c.label}"
                title="${c.label}"
                data-card-swatch="${item.id}:${cId}"
                class="h-6 w-6 rounded-full border transition-transform cursor-pointer ${
                  isSel
                    ? 'scale-110 border-[#141414] ring-2 ring-[#141414]/25'
                    : 'border-black/25 hover:scale-105'
                }"
                style="background-color: ${c.swatchHex}"
              ></button>
            `;
          })
          .join('');

        return `
          <article class="product-card flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white">
            <div class="relative aspect-[4/3] w-full overflow-hidden bg-[#EAE3D7]">
              <img
                src="${cardImage}"
                alt="${item.name}"
                referrerpolicy="no-referrer"
                loading="lazy"
                class="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
              />
              <button
                type="button"
                data-open-3d="${item.id}"
                class="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-[#F7F5F0]/95 px-3 py-1.5 text-xs font-semibold text-[#141414] transition-colors hover:bg-[#141414] hover:text-white cursor-pointer whitespace-nowrap"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                <span>360° 3D</span>
              </button>
            </div>

            <div class="flex flex-1 flex-col justify-between p-5">
              <div>
                <div class="flex items-center gap-2 text-xs text-[#6E675F]">
                  <span>${item.categoryLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>${item.tag}</span>
                </div>

                <h3 class="mt-1.5 font-display text-2xl font-semibold text-[#141414]">
                  ${item.name}
                </h3>

                <p class="mt-1 text-xs text-[#6E675F]">
                  ${item.dimensions} · ${finishLabel}
                </p>

                <p class="mt-3 line-clamp-2 text-sm leading-relaxed text-[#4A4742]">
                  ${item.description}
                </p>
              </div>

              <div class="mt-5 space-y-4 border-t border-black/8 pt-4">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-mono text-base font-semibold tabular-nums text-[#141414]">
                    ${formatPriceUZS(item.price)}
                  </span>
                  <div class="flex items-center gap-2">${swatchesHtml}</div>
                </div>

                <div class="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-open-3d="${item.id}"
                    class="rounded-lg border border-black/15 px-3 py-2.5 text-xs font-medium text-[#141414] transition-colors hover:border-black/45 hover:bg-[#F7F5F0] cursor-pointer whitespace-nowrap"
                  >
                    3D ko‘rish
                  </button>
                  <button
                    type="button"
                    data-add-cart="${item.id}"
                    class="rounded-lg bg-[#141414] px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#2C2A27] cursor-pointer whitespace-nowrap"
                  >
                    Savatchaga
                  </button>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    // Wire Card Event Handlers
    el.productGrid.querySelectorAll('[data-card-swatch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [productId, colorId] = btn.dataset.cardSwatch.split(':');
        state.selectedCardColor[productId] = colorId;
        renderProductGrid();
      });
    });

    el.productGrid.querySelectorAll('[data-open-3d]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const productId = btn.getAttribute('data-open-3d');
        const chosenColor = state.selectedCardColor[productId] || getProductById(productId).defaultColor;
        openProduct3DModal(productId, chosenColor);
      });
    });

    el.productGrid.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
    });

    el.productGrid.querySelectorAll('[data-add-cart]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const productId = btn.dataset.addCart;
        const chosenColor = state.selectedCardColor[productId];
        addToCart(productId, chosenColor);
      });
    });
  }

  // Modal 3D Viewer Logic
  function openProduct3DModal(productId, colorId) {
    const product = getProductById(productId);
    state.modalProductId = product.id;
    state.modalColorId = colorId || product.defaultColor;

    el.modal.classList.remove('hidden');
    el.modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    if (!modalViewport) {
      modalViewport = new FurnitureViewport(el.modalCanvasHost, {
        modelType: product.modelType,
        colorId: state.modalColorId,
      });
    } else {
      modalViewport.setProduct(product.modelType, state.modalColorId);
      modalViewport.setCameraPreset('iso');
      modalViewport.setExplode(0);
    }

    el.modalExplodeSlider.value = '0';
    setModalCamActive('iso');
    renderModalDetails();
  }

  function closeProduct3DModal() {
    el.modal.classList.add('hidden');
    el.modal.classList.remove('flex');
    document.body.style.overflow = '';
  }

  function setModalCamActive(camName) {
    document.querySelectorAll('[data-modal-cam]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.modalCam === camName);
    });
  }

  function renderModalDetails() {
    const product = getProductById(state.modalProductId);
    const finish = COLOR_FINISHES[state.modalColorId] || COLOR_FINISHES.chiqarang;

    el.modalProductCategory.textContent = `${product.categoryLabel} · ${product.tag}`;
    el.modalProductTitle.textContent = product.name;
    el.modalProductPrice.textContent = formatPriceUZS(product.price);
    el.modalProductDesc.textContent = product.description;
    el.modalColorLabel.textContent = finish.label;
    el.modalProductDims.textContent = product.dimensions;
    el.modalProductMaterial.textContent = product.material;

    el.modalColorButtons.innerHTML = product.colors
      .map((colorId) => {
        const c = COLOR_FINISHES[colorId];
        const active = colorId === state.modalColorId;
        return `
          <button
            type="button"
            data-modal-color="${colorId}"
            class="flex items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              active
                ? 'border-[#DFD3C3] bg-[#DFD3C3] text-[#141414]'
                : 'border-white/15 bg-white/5 text-[#DFD3C3] hover:border-white/35'
            }"
          >
            <span
              class="h-3.5 w-3.5 shrink-0 rounded-full border border-black/25"
              style="background-color: ${c.swatchHex}"
            ></span>
            <span>${c.label}</span>
          </button>
        `;
      })
      .join('');

    el.modalColorButtons.querySelectorAll('[data-modal-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.modalColorId = btn.dataset.modalColor;
        modalViewport?.setProduct(product.modelType, state.modalColorId);
        renderModalDetails();
      });
    });
  }

  // Cart & Telegram Drawer Logic
  function openCartDrawer() {
    el.cartBackdrop.classList.remove('hidden');
    el.cartDrawer.classList.remove('translate-x-full');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    el.cartBackdrop.classList.add('hidden');
    el.cartDrawer.classList.add('translate-x-full');
    document.body.style.overflow = '';
  }

  function renderCart() {
    const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    el.headerCartCount.textContent = String(totalCount);
    el.cartSubtitle.textContent = `${totalCount} ta mahsulot tanlangan`;
    el.cartSubtotal.textContent = formatPriceUZS(totalAmount);

    if (state.cart.length === 0) {
      el.cartEmptyState.classList.remove('hidden');
      el.cartItemsList.innerHTML = '';
      el.checkoutForm.classList.add('hidden');
      el.cartFooter.classList.add('hidden');
      return;
    }

    el.orderSuccessPanel.classList.add('hidden');
    el.cartEmptyState.classList.add('hidden');
    el.checkoutForm.classList.remove('hidden');
    el.cartFooter.classList.remove('hidden');

    el.cartItemsList.innerHTML = state.cart
      .map((item, idx) => {
        const finish = COLOR_FINISHES[item.color] || COLOR_FINISHES.chiqarang;
        return `
          <div class="flex gap-3.5 rounded-xl border border-black/10 bg-white p-3.5">
            <img
              src="${item.image}"
              alt="${item.name}"
              referrerpolicy="no-referrer"
              class="h-20 w-20 shrink-0 rounded-lg bg-[#EAE3D7] object-cover"
            />
            <div class="flex flex-1 flex-col justify-between min-w-0">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="truncate text-sm font-semibold text-[#141414]">${item.name}</h4>
                  <p class="mt-0.5 text-xs text-[#6E675F]">Rang: ${finish.label}</p>
                </div>
                <button
                  type="button"
                  data-remove-cart="${idx}"
                  aria-label="O‘chirish"
                  class="text-xs text-[#8A837A] hover:text-[#141414] cursor-pointer shrink-0"
                >
                  O‘chirish
                </button>
              </div>

              <div class="mt-2.5 flex items-center justify-between gap-2">
                <div class="inline-flex items-center rounded-md border border-black/15 bg-[#F7F5F0]">
                  <button
                    type="button"
                    data-qty-dec="${idx}"
                    aria-label="Kamaytirish"
                    class="h-7 w-7 text-sm font-medium text-[#141414] hover:bg-black/5 cursor-pointer"
                  >−</button>
                  <span class="px-2.5 font-mono text-xs tabular-nums text-[#141414]">${item.quantity}</span>
                  <button
                    type="button"
                    data-qty-inc="${idx}"
                    aria-label="Ko‘paytirish"
                    class="h-7 w-7 text-sm font-medium text-[#141414] hover:bg-black/5 cursor-pointer"
                  >+</button>
                </div>
                <span class="font-mono text-xs font-semibold tabular-nums text-[#141414]">
                  ${formatPriceUZS(item.price * item.quantity)}
                </span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    el.cartItemsList.querySelectorAll('[data-qty-dec]').forEach((btn) => {
      btn.addEventListener('click', () => updateCartQuantity(Number(btn.dataset.qtyDec), -1));
    });
    el.cartItemsList.querySelectorAll('[data-qty-inc]').forEach((btn) => {
      btn.addEventListener('click', () => updateCartQuantity(Number(btn.dataset.qtyInc), 1));
    });
    el.cartItemsList.querySelectorAll('[data-remove-cart]').forEach((btn) => {
      btn.addEventListener('click', () => removeCartItem(Number(btn.dataset.removeCart)));
    });
  }

  // Event Bindings: Mobile Menu
  el.mobileMenuBtn.addEventListener('click', () => {
    const isHidden = el.mobileMenu.classList.toggle('hidden');
    el.mobileMenuBtn.setAttribute('aria-expanded', String(!isHidden));
  });
  document.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      el.mobileMenu.classList.add('hidden');
      el.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    });
  });

  // Hero 3D Inspect CTA
  el.heroInspectBtn.addEventListener('click', () => {
    openProduct3DModal('buxoro-egri-divan', 'chiqarang');
  });

  // Studio 3D Controls
  document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.cam;
      document.querySelectorAll('[data-cam]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.cam === preset);
      });
      studioViewport.setCameraPreset(preset);
    });
  });

  el.studioExplodeSlider.addEventListener('input', (e) => {
    studioViewport.setExplode(e.target.value);
  });

  el.studioAutoRotateBtn.addEventListener('click', () => {
    const next = !studioViewport.autoRotate;
    studioViewport.setAutoRotate(next);
    el.studioAutoRotateBtn.setAttribute('aria-pressed', String(next));
    el.studioAutoRotateBtn.textContent = next ? 'Aylanish: Yoqilgan' : 'Aylanish: O‘chiq';
  });

  el.studioDockToggle.addEventListener('click', () => {
    const collapsed = el.studioDockWrapper.classList.toggle('dock-collapsed');
    el.studioDockToggleLabel.textContent = collapsed
      ? 'Boshqaruvni ko‘rsatish'
      : 'Boshqaruvni yashirish';
  });

  el.studioAddCartBtn.addEventListener('click', () => {
    addToCart(state.studioProductId, state.studioColorId);
  });

  el.studioBuyNowBtn.addEventListener('click', () => {
    addToCart(state.studioProductId, state.studioColorId);
    openCartDrawer();
  });

  // Modal 3D Controls
  el.closeModalBtn.addEventListener('click', closeProduct3DModal);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closeProduct3DModal();
  });

  document.querySelectorAll('[data-modal-cam]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.modalCam;
      setModalCamActive(preset);
      modalViewport?.setCameraPreset(preset);
    });
  });

  el.modalExplodeSlider.addEventListener('input', (e) => {
    modalViewport?.setExplode(e.target.value);
  });

  el.modalAutoRotateBtn.addEventListener('click', () => {
    if (!modalViewport) return;
    const next = !modalViewport.autoRotate;
    modalViewport.setAutoRotate(next);
    el.modalAutoRotateBtn.setAttribute('aria-pressed', String(next));
    el.modalAutoRotateBtn.textContent = next ? 'Aylanish: Yoqilgan' : 'Aylanish: O‘chiq';
  });

  el.modalAddCartBtn.addEventListener('click', () => {
    addToCart(state.modalProductId, state.modalColorId);
  });

  el.modalOrderNowBtn.addEventListener('click', () => {
    addToCart(state.modalProductId, state.modalColorId);
    closeProduct3DModal();
    openCartDrawer();
  });

  // Catalog Search & Reset
  el.catalogSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderProductGrid();
  });

  el.resetFiltersBtn.addEventListener('click', () => {
    state.category = 'barchasi';
    state.colorFilter = 'barchasi';
    state.searchQuery = '';
    el.catalogSearch.value = '';
    renderFilters();
    renderProductGrid();
  });

  // Color Showcase Cards Jump to Catalog Filter
  document.querySelectorAll('.jump-color-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.colorFilter = btn.dataset.jumpColor;
      state.category = 'barchasi';
      renderFilters();
      renderProductGrid();
      document.getElementById('kolleksiya')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Cart Drawer Triggers
  el.openCartBtn.addEventListener('click', openCartDrawer);
  el.footerOpenCartBtn.addEventListener('click', openCartDrawer);
  el.closeCartBtn.addEventListener('click', closeCartDrawer);
  el.cartBackdrop.addEventListener('click', closeCartDrawer);
  el.cartBrowseBtn.addEventListener('click', () => {
    closeCartDrawer();
    document.getElementById('kolleksiya')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Escape Key Closes Open Overlays
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.modal.classList.contains('hidden')) closeProduct3DModal();
      if (!el.cartDrawer.classList.contains('translate-x-full')) closeCartDrawer();
    }
  });

  // Telegram Order Checkout Submission
  el.checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSubmittingOrder || state.cart.length === 0) return;

    const customer = {
      name: el.customerName.value.trim(),
      phone: el.customerPhone.value.trim(),
      address: el.customerAddress.value.trim(),
      note: el.customerNote.value.trim(),
    };

    if (!customer.name || !customer.phone || !customer.address) {
      el.checkoutFeedback.className =
        'rounded-lg border border-red-300 bg-red-50 p-3.5 text-xs text-red-900';
      el.checkoutFeedback.textContent =
        'Iltimos, ism, telefon raqam va yetkazib berish manzilini to‘ldiring.';
      el.checkoutFeedback.classList.remove('hidden');
      return;
    }

    state.isSubmittingOrder = true;
    el.submitOrderBtn.disabled = true;
    el.submitOrderBtn.textContent = 'Telegramga yuborilmoqda...';
    el.checkoutFeedback.classList.add('hidden');

    const orderNumber = Math.floor(1000 + Math.random() * 9000);
    const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderPayload = {
      orderNumber,
      customer,
      items: [...state.cart],
      total,
    };

    try {
      const result = await sendOrderToTelegram(orderPayload);

      el.orderReceiptNumber.textContent = `Buyurtma #${orderNumber} qabul qilindi`;
      el.orderReceiptStatus.textContent = result.sent
        ? 'Buyurtma tafsilotlari Telegram kanalimizga muvaffaqiyatli yuborildi. Operatorlarimiz tez orada siz bilan bog‘lanishadi.'
        : result.message;

      el.orderReceiptSummary.innerHTML = [
        `<p><strong>Mijoz:</strong> ${escapeHtml(customer.name)}</p>`,
        `<p><strong>Telefon:</strong> ${escapeHtml(customer.phone)}</p>`,
        `<p><strong>Manzil:</strong> ${escapeHtml(customer.address)}</p>`,
        `<p><strong>Jami summa:</strong> <span class="font-mono">${formatPriceUZS(total)}</span></p>`,
      ].join('');

      state.cart = [];
      saveCart();
      renderCart();

      // Show receipt inside drawer
      el.cartEmptyState.classList.add('hidden');
      el.orderSuccessPanel.classList.remove('hidden');
      el.checkoutForm.reset();
    } catch (err) {
      el.checkoutFeedback.className =
        'rounded-lg border border-red-300 bg-red-50 p-3.5 text-xs text-red-900';
      el.checkoutFeedback.textContent =
        `Tarmoq xatoligi yuz berdi: ${err?.message || 'Internet aloqasini tekshiring.'}`;
      el.checkoutFeedback.classList.remove('hidden');
    } finally {
      state.isSubmittingOrder = false;
      el.submitOrderBtn.disabled = false;
      el.submitOrderBtn.textContent = 'Telegram orqali buyurtma yuborish';
    }
  });

  el.newOrderBtn.addEventListener('click', () => {
    el.orderSuccessPanel.classList.add('hidden');
    closeCartDrawer();
    document.getElementById('kolleksiya')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Initial Renders
  renderStudioTabs();
  renderStudioDetails();
  renderFilters();
  renderProductGrid();
  renderCart();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
