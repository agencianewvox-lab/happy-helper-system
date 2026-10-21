function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("newvox-meeting-audio", 2);
    r.onupgradeneeded = () => {
      for (const name of ["chunks", "captions"])
        if (!r.result.objectStoreNames.contains(name))
          r.result.createObjectStore(name, { keyPath: "key" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction(mode, work, name = "chunks") {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = work(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const putChunk = (chunk) =>
  transaction("readwrite", (store) => store.put(chunk));
export const allChunks = () =>
  transaction("readonly", (store) => store.getAll());
export const countChunks = () =>
  transaction("readonly", (store) => store.count());
export const deleteChunk = (key) =>
  transaction("readwrite", (store) => store.delete(key));
export const putCaption = (item) =>
  transaction("readwrite", (s) => s.put(item), "captions");
export const allCaptions = () =>
  transaction("readonly", (s) => s.getAll(), "captions");
export const deleteCaption = (key) =>
  transaction("readwrite", (s) => s.delete(key), "captions");
export async function ackCaption(item) {
  return transaction(
    "readwrite",
    (s) => {
      const r = s.get(item.key);
      r.onsuccess = () => {
        if (r.result?.revision === item.revision) s.delete(item.key);
      };
      return r;
    },
    "captions",
  );
}
