const files = [
  { id: "plan", name: "Launch plan.docx", type: "docx" },
  { id: "budget", name: "Budget.xlsx", type: "xlsx" }
];

const editorBaseUrl = "../../editor/dist/index.html";
const list = document.querySelector("#files");
const iframe = document.querySelector("#editor");

list.innerHTML = files
  .map((file) => `<article><span>${file.name}</span><button data-id="${file.id}">Edit</button></article>`)
  .join("");

list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const file = files.find((item) => item.id === button.dataset.id);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const encrypted = await encrypt(new TextEncoder().encode(`Mock ${file.name}`).buffer, key);
  const signedLikeUrl = URL.createObjectURL(new Blob([encrypted]));
  const url = new URL(editorBaseUrl, location.href);
  url.hash = new URLSearchParams({
    fileUrl: signedLikeUrl,
    fileKey: btoa(String.fromCharCode(...key)),
    fileType: file.type,
    callbackOrigin: location.origin,
    displayName: file.name
  }).toString();
  iframe.src = url;
});

async function encrypt(bytes, rawKey) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, bytes));
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce);
  out.set(ciphertext, nonce.length);
  return out;
}

