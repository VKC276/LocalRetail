import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, mediaUrl, type CartItem, type Catalog, type CheckoutResult, type Product } from "../api";
import CartPanel from "../components/CartPanel";
import ProductTile from "../components/ProductTile";
import VirtualKeyboard from "../components/VirtualKeyboard";
import { formatSek } from "../format";

const PAYMENT_TIMEOUT_MS = 2 * 60 * 1000;
const CART_IDLE_MS = 5 * 60 * 1000;
const CART_WARN_MS = 60 * 1000;

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

export default function Kiosk() {
  const [searchParams] = useSearchParams();
  const kioskDisplay = searchParams.has("kiosk");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [category, setCategory] = useState<string>("Alla");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paying, setPaying] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [idleLeftMs, setIdleLeftMs] = useState<number | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());
  const cartRef = useRef<HTMLElement>(null);
  const flyerSeq = useRef(0);

  const bumpActivity = () => {
    lastActivity.current = Date.now();
    setIdleLeftMs(null);
  };

  useEffect(() => {
    api<Catalog>("/api/catalog")
      .then((data) =>
        setCatalog({
          ...data,
          logoUrl: mediaUrl(data.logoUrl),
          products: data.products.map((product) => ({ ...product, imageUrl: mediaUrl(product.imageUrl) })),
        }),
      )
      .catch((err: Error) => setError(err.message));
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
      const result = await api<CheckoutResult>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ items: cart.map((item) => ({ id: item.id, qty: item.qty })) }),
      });
      setCheckout(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa Swish-QR");
    } finally {
      setPaying(false);
    }
  };

  const reset = () => {
    setCart([]);
    setCheckout(null);
    setQuery("");
    setCategory("Alla");
    setKeyboardOpen(false);
    setIdleLeftMs(null);
    lastActivity.current = Date.now();
  };

  useEffect(() => {
    if (!checkout) return;
    const timer = window.setTimeout(() => {
      setCart([]);
      setCheckout(null);
      setQuery("");
      setCategory("Alla");
      setKeyboardOpen(false);
      setIdleLeftMs(null);
      lastActivity.current = Date.now();
    }, PAYMENT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
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
        setKeyboardOpen(false);
        setIdleLeftMs(null);
        return;
      }
      setIdleLeftMs(remaining <= CART_WARN_MS ? remaining : null);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [cart.length, checkout]);

  return (
    <div
      className={`kiosk ${kioskDisplay ? "kiosk-display" : ""} theme-${catalog?.theme === "dark" || catalog?.theme === "bold" || catalog?.theme === "contrast" ? catalog.theme : "light"}`}
      onPointerDown={bumpActivity}
    >
      <header className="kiosk-top">
        <div className="kiosk-head">
          <div className="brand">
            <div className="brand-mark">{catalog?.logoUrl ? <img src={catalog.logoUrl} alt="" /> : null}</div>
            <div>
              <h1>{catalog?.shopName ?? "Självbetjäning"}</h1>
              <p>Tryck på produkten. Betala med Swish när du är klar.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`search-field ${query ? "" : "empty"} ${keyboardOpen ? "active" : ""}`}
          onClick={() => setKeyboardOpen(true)}
        >
          {query || "Sök produkt"}
        </button>
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
        disabledReason={catalog && !catalog.swishConfigured ? "Swish-nummer saknas. Lägg till det under Administration." : null}
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
            <img src={checkout.qrDataUrl} alt="Swish QR-kod" />
            <p>Öppna Swish och skanna koden. Meddelande: {checkout.message}</p>
            <p className="checkout-timeout">Rutan stängs automatiskt efter 2 minuter.</p>
            <button type="button" className="primary" onClick={reset}>
              Ny kund
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
