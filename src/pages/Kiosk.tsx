import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CATALOG_POLL_MS, fetchCatalog, fetchCatalogRevision, recordKioskSale, type CartItem, type Catalog, type CheckoutResult, type EntryPage, type Product } from "../api";
import { readCachedCatalog, readCachedRevision, withLocalImages, writeCachedCatalog } from "../catalogCache";
import { swishQrDataUrl } from "../swishQr";
import { textQrDataUrl } from "../infoQr";
import CartPanel from "../components/CartPanel";
import ProductTile from "../components/ProductTile";
import VirtualKeyboard from "../components/VirtualKeyboard";
import { formatSek } from "../format";

const PAYMENT_TIMEOUT_MS = 2 * 60 * 1000;
const SEARCH_IDLE_MS = 2 * 60 * 1000;
const CART_IDLE_MS = 5 * 60 * 1000;
const CART_WARN_MS = 60 * 1000;
const HOME_IDLE_MS = 2 * 60 * 1000;

type KioskView = "home" | "swish";
type LinkOverlay = EntryPage | null;

type Flyer = {
  key: number;
  imageUrl: string | null;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  path: string;
};

function flyArcPath(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const lift = Math.min(160, Math.max(88, len * 0.34));
  const cx = dx / 2 + nx * lift;
  const cy = dy / 2 + ny * lift;
  const n = (value: number) => value.toFixed(1);
  return `M 0 0 Q ${n(cx)} ${n(cy)} ${n(dx)} ${n(dy)}`;
}

function formatPayCountdown(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export default function Kiosk() {
  const [searchParams] = useSearchParams();
  const kioskDisplay = searchParams.has("kiosk");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<KioskView>("home");
  const [linkOverlay, setLinkOverlay] = useState<LinkOverlay>(null);
  const [query, setQuery] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [category, setCategory] = useState<string>("Alla");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paying, setPaying] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [payLeftMs, setPayLeftMs] = useState<number | null>(null);
  const [idleLeftMs, setIdleLeftMs] = useState<number | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());
  const cartRef = useRef<HTMLElement>(null);
  const flyerSeq = useRef(0);
  const checkoutSettled = useRef(false);

  const bumpActivity = () => {
    lastActivity.current = Date.now();
    setIdleLeftMs(null);
  };

  useEffect(() => {
    let cancelled = false;
    const applyCatalog = async (data: Catalog) => {
      const local = await withLocalImages(data);
      await writeCachedCatalog(data);
      if (!cancelled) setCatalog(local);
    };
    const refresh = async (force: boolean) => {
      try {
        const remoteRev = await fetchCatalogRevision();
        const localRev = await readCachedRevision();
        if (!force && localRev != null && remoteRev === localRev) return;
        const data = await fetchCatalog();
        await applyCatalog(data);
        if (!cancelled) setError(null);
      } catch (err) {
        if (cancelled) return;
        const cached = await readCachedCatalog();
        if (cached) {
          setCatalog(await withLocalImages(cached));
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Kunde inte hämta katalogen");
        }
      }
    };
    void (async () => {
      const cached = await readCachedCatalog();
      if (cached && !cancelled) setCatalog(await withLocalImages(cached));
      await refresh(false);
    })();
    const timer = window.setInterval(() => void refresh(false), CATALOG_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const featured = useMemo(() => {
    if (!catalog || category !== "Alla" || query.trim()) return [];
    return catalog.products.filter((product) => product.featured);
  }, [catalog, category, query]);

  const products = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      const catOk = category === "Alla" || product.category === category;
      const searchOk = !q || product.name.toLowerCase().includes(q) || product.category.toLowerCase().includes(q);
      const hideFeaturedDup = category === "Alla" && !q && product.featured;
      return catOk && searchOk && !hideFeaturedDup;
    });
  }, [catalog, category, query]);

  const add = (product: Product, source: HTMLElement) => {
    bumpActivity();
    const cartEl = cartRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (cartEl && !reduceMotion) {
      const from = source.getBoundingClientRect();
      const to = cartEl.getBoundingClientRect();
      const endX = to.left + to.width * 0.55 - from.width / 2;
      const endY = to.top + 40 - from.height / 2;
      const flyer: Flyer = {
        key: ++flyerSeq.current,
        imageUrl: product.imageUrl,
        name: product.name,
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
        path: flyArcPath(endX - from.left, endY - from.top),
      };
      setFlyers((list) => [...list, flyer]);
      window.setTimeout(() => {
        setFlyers((list) => list.filter((item) => item.key !== flyer.key));
      }, 920);
    }
    setCart((items) => {
      const found = items.find((item) => item.id === product.id);
      if (found) return items.map((item) => (item.id === product.id ? { ...item, qty: Math.min(99, item.qty + 1) } : item));
      return [...items, { ...product, qty: 1 }];
    });
    setPulseId(product.id);
    window.setTimeout(() => setPulseId((current) => (current === product.id ? null : current)), 700);
  };

  const inc = (id: string) => {
    bumpActivity();
    setCart((items) => items.map((item) => (item.id === id ? { ...item, qty: Math.min(99, item.qty + 1) } : item)));
  };
  const dec = (id: string) => {
    bumpActivity();
    setCart((items) => items.flatMap((item) => (item.id !== id ? [item] : item.qty <= 1 ? [] : [{ ...item, qty: item.qty - 1 }])));
  };

  const clear = () => {
    bumpActivity();
    setCart([]);
    setPulseId(null);
  };

  const pay = async () => {
    bumpActivity();
    setPaying(true);
    setError(null);
    try {
      const payee = String(catalog?.swishNumber || "").replace(/\s+/g, "");
      if (!payee) throw new Error("Swish-nummer saknas. Lägg till det i WallFlow.");
      const lines = cart.map((item) => ({ id: item.id, name: item.name, price: item.price, qty: item.qty }));
      const amount = Math.round(lines.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
      if (amount < 1) throw new Error("Beloppet måste vara minst 1 kr");
      const orderId = crypto.randomUUID().slice(0, 8).toUpperCase();
      const message = orderId;
      const result = {
        orderId,
        amount,
        message,
        qrDataUrl: swishQrDataUrl(payee, amount, message),
        items: lines,
      };
      setCheckout(result);
      checkoutSettled.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa Swish-QR");
    } finally {
      setPaying(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setKeyboardOpen(false);
  };

  const goHome = () => {
    setView("home");
    setLinkOverlay(null);
    setCart([]);
    setCheckout(null);
    setPayLeftMs(null);
    clearSearch();
    setCategory("Alla");
    setIdleLeftMs(null);
    setPulseId(null);
    setFlyers([]);
    lastActivity.current = Date.now();
  };

  const openSwishCatalog = () => {
    bumpActivity();
    setLinkOverlay(null);
    setView("swish");
  };

  const openLinkOverlay = (page: EntryPage | undefined, fallbackTitle: string) => {
    bumpActivity();
    const url = String(page?.url || "").trim();
    if (!url) {
      setError(`${fallbackTitle} saknar QR-adress. Lägg till den i WallFlow under Självbetjäningskassa.`);
      return;
    }
    setError(null);
    setLinkOverlay({
      title: String(page?.title || fallbackTitle).trim() || fallbackTitle,
      body: String(page?.body || "").trim(),
      url,
      logoUrl: page?.logoUrl || null,
    });
  };

  const reset = () => {
    goHome();
  };

  const markPaid = (sale: CheckoutResult) => {
    if (checkoutSettled.current) return;
    checkoutSettled.current = true;
    void recordKioskSale(sale);
    reset();
  };

  const cancelCheckout = () => {
    if (checkoutSettled.current) return;
    checkoutSettled.current = true;
    reset();
  };

  useEffect(() => {
    if (!checkout) {
      setPayLeftMs(null);
      return;
    }
    const sale = checkout;
    const started = Date.now();
    const tick = () => {
      const remaining = PAYMENT_TIMEOUT_MS - (Date.now() - started);
      if (remaining <= 0) {
        markPaid(sale);
        return;
      }
      setPayLeftMs(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [checkout]);

  useEffect(() => {
    if (cart.length === 0 || checkout) {
      setIdleLeftMs(null);
      return;
    }
    const tick = () => {
      const remaining = CART_IDLE_MS - (Date.now() - lastActivity.current);
      if (remaining <= 0) {
        setCart([]);
        clearSearch();
        setIdleLeftMs(null);
        return;
      }
      setIdleLeftMs(remaining <= CART_WARN_MS ? remaining : null);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [cart.length, checkout]);

  useEffect(() => {
    if ((!query && !keyboardOpen) || checkout) return;
    const tick = () => {
      if (Date.now() - lastActivity.current < SEARCH_IDLE_MS) return;
      clearSearch();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [query, keyboardOpen, checkout]);

  useEffect(() => {
    if (view !== "swish" || cart.length > 0 || checkout || linkOverlay) return;
    const tick = () => {
      if (Date.now() - lastActivity.current < HOME_IDLE_MS) return;
      goHome();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [view, cart.length, checkout, linkOverlay]);

  useEffect(() => {
    if (!linkOverlay) return;
    const tick = () => {
      if (Date.now() - lastActivity.current < HOME_IDLE_MS) return;
      setLinkOverlay(null);
      setView("home");
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [linkOverlay]);

  const themeClass =
    catalog?.theme === "dark" || catalog?.theme === "bold" || catalog?.theme === "contrast" ? catalog.theme : "light";

  if (view === "home") {
    return (
      <div className={`kiosk kiosk-home ${kioskDisplay ? "kiosk-display" : ""} theme-${themeClass}`} onPointerDown={bumpActivity}>
        <div className="home-panel">
          <div className="home-brand">
            <div className="brand-mark home-logo">{catalog?.logoUrl ? <img src={catalog.logoUrl} alt="" /> : null}</div>
            <h1>{catalog?.shopName ?? "Självbetjäning"}</h1>
            <p>Välj hur du vill fortsätta</p>
          </div>
          {error ? <p className="error home-error">{error}</p> : null}
          <div className="home-actions">
            <button type="button" className="home-btn home-btn-member" onClick={() => openLinkOverlay(catalog?.memberPage, "Bli medlem")}>
              Bli medlem
            </button>
            <button type="button" className="home-btn home-btn-epassi" onClick={() => openLinkOverlay(catalog?.epassiPage, "Betala med Epassi")}>
              Betala med Epassi
            </button>
            <button type="button" className="home-btn home-btn-swish" onClick={openSwishCatalog}>
              Betala med Swish
            </button>
          </div>
        </div>
        {linkOverlay ? (
          <div className="checkout">
            <div className="checkout-card info-card">
              {linkOverlay.logoUrl ? (
                <div className="info-logo">
                  <img src={linkOverlay.logoUrl} alt="" />
                </div>
              ) : null}
              <h2>{linkOverlay.title}</h2>
              <img src={textQrDataUrl(linkOverlay.url)} alt="QR-kod" className="info-qr" />
              {linkOverlay.body ? <p className="info-body">{linkOverlay.body}</p> : null}
              <button
                type="button"
                className="primary pay-btn"
                onClick={() => {
                  bumpActivity();
                  setLinkOverlay(null);
                }}
              >
                Tillbaka
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`kiosk ${kioskDisplay ? "kiosk-display" : ""} theme-${themeClass}`} onPointerDown={bumpActivity}>
      <header className="kiosk-top">
        <div className="kiosk-head">
          <div className="brand">
            <div className="brand-mark">{catalog?.logoUrl ? <img src={catalog.logoUrl} alt="" /> : null}</div>
            <div>
              <h1>{catalog?.shopName ?? "Självbetjäning"}</h1>
              <p>Tryck på produkten. Betala med Swish när du är klar.</p>
            </div>
          </div>
          <button type="button" className="ghost home-back" onClick={goHome}>
            Start
          </button>
        </div>
        <div className={`search-field ${query ? "" : "empty"} ${keyboardOpen ? "active" : ""}`}>
          <button type="button" className="search-field-main" onClick={() => setKeyboardOpen(true)}>
            {query || "Sök produkt"}
          </button>
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Rensa sökning"
              onClick={() => {
                bumpActivity();
                clearSearch();
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="cats">
          {["Alla", ...(catalog?.categories ?? [])].map((name) => (
            <button key={name} type="button" className={`chip ${category === name ? "on" : ""}`} onClick={() => setCategory(name)}>
              {name}
            </button>
          ))}
        </div>
        {error ? <p className="error">{error}</p> : null}
      </header>

      <div className="grid-wrap">
        {featured.length > 0 ? (
          <section className="featured-block">
            <h2>Vanliga val</h2>
            <div className="product-grid featured-grid">
              {featured.map((product) => (
                <ProductTile key={product.id} product={product} onAdd={(source) => add(product, source)} />
              ))}
            </div>
          </section>
        ) : null}
        <div className="product-grid">
          {products.map((product) => (
            <ProductTile key={product.id} product={product} onAdd={(source) => add(product, source)} />
          ))}
        </div>
      </div>

      <CartPanel
        ref={cartRef}
        items={cart}
        onInc={inc}
        onDec={dec}
        onClear={clear}
        onPay={() => void pay()}
        paying={paying}
        idleLeftMs={idleLeftMs}
        onStay={bumpActivity}
        pulseId={pulseId}
        disabledReason={catalog && !catalog.swishConfigured ? "Swish-nummer saknas. Lägg till det i WallFlow under Självbetjäningskassa." : null}
      />

      <div className="fly-layer" aria-hidden="true">
        {flyers.map((flyer) => (
          <div
            key={flyer.key}
            className="fly-item"
            style={{
              left: flyer.left,
              top: flyer.top,
              width: flyer.width,
              height: flyer.height,
              offsetPath: `path("${flyer.path}")`,
            }}
          >
            {flyer.imageUrl ? <img src={flyer.imageUrl} alt="" /> : <span>{flyer.name}</span>}
          </div>
        ))}
      </div>

      {keyboardOpen ? (
        <div className="keyboard-dock">
          <VirtualKeyboard value={query} onChange={setQuery} onClose={() => setKeyboardOpen(false)} />
        </div>
      ) : null}

      {checkout ? (
        <div className="checkout">
          <div className="checkout-card">
            <h2>Betala med Swish</h2>
            <p>
              Order {checkout.orderId} · {formatSek(checkout.amount)}
            </p>
            <ul className="checkout-items">
              {checkout.items.map((item) => (
                <li key={item.id}>
                  {item.name} × {item.qty} · {formatSek(item.price * item.qty)}
                </li>
              ))}
            </ul>
            <img src={checkout.qrDataUrl} alt="Swish QR-kod" />
            <p className="checkout-prompt">Öppna Swish och skanna koden</p>
            <p className="checkout-timeout" aria-live="polite">
              {formatPayCountdown(payLeftMs ?? PAYMENT_TIMEOUT_MS)}
            </p>
            <div className="checkout-actions">
              <button type="button" className="checkout-cancel" onClick={cancelCheckout}>
                Avbryt
              </button>
              <button type="button" className="primary pay-btn" onClick={() => markPaid(checkout)}>
                Jag har betalat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
