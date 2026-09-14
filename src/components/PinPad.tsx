import { useState } from "react";

type Props = {
  onSubmit: (pin: string) => Promise<void>;
  error?: string | null;
};

export default function PinPad({ onSubmit, error }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    try {
      await onSubmit(pin);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin">
      <div className="pin-card">
        <h1>Administration</h1>
        <p>Ange pinkod på skärmen. Vid första start är koden 1234.</p>
        <div className="pin-display">{pin ? "•".repeat(pin.length) : " "}</div>
        {error ? <p className="error">{error}</p> : null}
        <div className="pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" disabled={busy} onClick={() => setPin((v) => (v + d).slice(0, 8))}>
              {d}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => setPin("")}>
            C
          </button>
          <button type="button" disabled={busy} onClick={() => setPin((v) => (v + "0").slice(0, 8))}>
            0
          </button>
          <button type="button" disabled={busy} onClick={() => setPin((v) => v.slice(0, -1))}>
            ⌫
          </button>
        </div>
        <button type="button" className="primary" style={{ marginTop: 12 }} disabled={pin.length < 4 || busy} onClick={() => void submit()}>
          Logga in
        </button>
      </div>
    </div>
  );
}
