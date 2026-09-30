import { forwardRef } from "react";
import { formatSek } from "../format";
import type { CartItem } from "../api";

type Props = {
  items: CartItem[];
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onClear: () => void;
  onPay: () => void;
  paying?: boolean;
  idleLeftMs?: number | null;
  onStay?: () => void;
  disabledReason?: string | null;
  pulseId?: string | null;
};

const CartPanel = forwardRef<HTMLElement, Props>(function CartPanel(
  { items, onInc, onDec, onClear, onPay, paying, idleLeftMs, onStay, disabledReason, pulseId },
  ref,
) {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <aside className="cart" ref={ref}>
      <div className="cart-head">
        <h2>Varukorg</h2>
        <button
          type="button"
          className="ghost cart-clear"
          disabled={items.length === 0 || paying}
          onClick={() => {
            if (items.length === 0 || paying) return;
            if (!window.confirm("Tömma hela varukorgen?")) return;
            onClear();
          }}
        >
          Töm
        </button>
      </div>
      <div className="cart-list">
        {items.length === 0 ? <p className="warn">Tryck på en produkt för att lägga den här.</p> : null}
        {items.map((item) => (
          <div className={`cart-row ${pulseId === item.id ? "pulse" : ""}`} key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <div>{formatSek(item.price * item.qty)}</div>
            </div>
            <div className="qty">
              <button type="button" onClick={() => onDec(item.id)}>
                −
              </button>
              <strong>{item.qty}</strong>
              <button type="button" onClick={() => onInc(item.id)}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="total">
        <span>Att betala</span>
        <span>{formatSek(total)}</span>
      </div>
      {idleLeftMs != null ? (
        <div className="idle-warn">
          <p>Ingen aktivitet. Varukorgen rensas om {Math.max(1, Math.ceil(idleLeftMs / 1000))} sekunder.</p>
          <button type="button" className="ghost" onClick={onStay}>
            Fortsätt
          </button>
        </div>
      ) : null}
      {disabledReason ? <p className="warn">{disabledReason}</p> : null}
      <div className="cart-actions">
        <button type="button" className="primary pay-btn" disabled={items.length === 0 || paying || Boolean(disabledReason)} onClick={onPay}>
          {paying ? "Skapar Swish…" : "Betala med Swish"}
        </button>
      </div>
    </aside>
  );
});

export default CartPanel;
