import type { Catalog, Product } from "./api";

const DB_NAME = "local-retail-kiosk";
const DB_VERSION = 1;
const META = "meta";
const IMAGES = "images";
const liveUrls = new Map<string, string>();

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeGet<T>(store: IDBObjectStore, key: string) {
  return new Promise<T | undefined>((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function storePut(store: IDBObjectStore, value: unknown, key: string) {
  return new Promise<void>((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function readCachedRevision() {
  const db = await openDb();
  const tx = db.transaction(META, "readonly");
  const value = await storeGet<number>(tx.objectStore(META), "revision");
  db.close();
  return value ?? null;
}

export async function readCachedCatalog() {
  const db = await openDb();
  const tx = db.transaction(META, "readonly");
  const value = await storeGet<Catalog>(tx.objectStore(META), "catalog");
  db.close();
  return value ?? null;
}

export async function writeCachedCatalog(catalog: Catalog) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, "readwrite");
    const store = tx.objectStore(META);
    store.put(catalog.revision ?? 0, "revision");
    store.put(catalog, "catalog");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function blobForHash(hash: string) {
  const db = await openDb();
  const tx = db.transaction(IMAGES, "readonly");
  const blob = await storeGet<Blob>(tx.objectStore(IMAGES), hash);
  db.close();
  return blob ?? null;
}

async function saveBlob(hash: string, blob: Blob) {
  const db = await openDb();
  const tx = db.transaction(IMAGES, "readwrite");
  await storePut(tx.objectStore(IMAGES), blob, hash);
  db.close();
}

async function urlForHash(hash: string, remoteUrl: string) {
  const existing = liveUrls.get(hash);
  if (existing) return existing;
  let blob = await blobForHash(hash);
  if (!blob) {
    const res = await fetch(remoteUrl);
    if (!res.ok) return remoteUrl;
    blob = await res.blob();
    await saveBlob(hash, blob);
  }
  const url = URL.createObjectURL(blob);
  liveUrls.set(hash, url);
  return url;
}

export async function withLocalImages(catalog: Catalog): Promise<Catalog> {
  const logoUrl =
    catalog.logoUrl && catalog.logoHash ? await urlForHash(catalog.logoHash, catalog.logoUrl) : catalog.logoUrl;
  const products: Product[] = [];
  for (const product of catalog.products) {
    if (product.imageUrl && product.imageHash) {
      products.push({ ...product, imageUrl: await urlForHash(product.imageHash, product.imageUrl) });
    } else {
      products.push(product);
    }
  }
  return { ...catalog, logoUrl, products };
}
