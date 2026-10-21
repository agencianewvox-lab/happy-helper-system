function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("newvox-meeting-audio", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("chunks", { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction(mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("chunks", mode);
      const request = work(tx.objectStore("chunks"));
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
