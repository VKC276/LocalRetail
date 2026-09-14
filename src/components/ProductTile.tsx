import { formatSek } from "../format";
import type { Product } from "../api";

type Props = {
  product: Product;
  onAdd: (source: HTMLElement) => void;
};

export default function ProductTile({ product, onAdd }: Props) {
  return (
    <button type="button" className="tile" onClick={(event) => onAdd(event.currentTarget)}>
      <div className="tile-art">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : null}</div>
      <div className="tile-body">
        <strong>{product.name}</strong>
        <span>{formatSek(product.price)}</span>
      </div>
    </button>
  );
}
