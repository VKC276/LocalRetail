import { useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
};

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "å"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

export default function VirtualKeyboard({ value, onChange, onClose }: Props) {
  const [shift, setShift] = useState(true);
  const press = (key: string) => {
    onChange(value + (shift ? key.toUpperCase() : key));
    if (/[a-zåäö]/i.test(key)) setShift(false);
  };

  return (
    <div className="keyboard" onMouseDown={(e) => e.preventDefault()}>
      {ROWS.map((row) => (
        <div className="kb-row" key={row.join("")}>
          {row.map((key) => (
            <button type="button" className="key" key={key} onClick={() => press(key)}>
              {shift && /[a-zåäö]/.test(key) ? key.toUpperCase() : key}
            </button>
          ))}
        </div>
      ))}
      <div className="kb-row">
        <button type="button" className="key action" onClick={() => setShift((v) => !v)}>
          Skift
        </button>
        <button type="button" className="key action" onClick={() => onChange(value.slice(0, -1))}>
          Radera
        </button>
        <button type="button" className="key wide" onClick={() => press(" ")}>
          Mellanslag
        </button>
        <button type="button" className="key action" onClick={() => onChange("")}>
          Rensa
        </button>
        {onClose ? (
          <button type="button" className="key action" onClick={onClose}>
            Stäng
          </button>
        ) : null}
      </div>
    </div>
  );
}
