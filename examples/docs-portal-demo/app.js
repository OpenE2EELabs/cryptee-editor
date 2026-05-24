const iframe = document.querySelector("#editor");
const role = document.querySelector("#role");
const editorBaseUrl = "../../editor/dist/index.html";

document.querySelector("#open").addEventListener("click", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const encrypted = await encrypt(new TextEncoder().encode("Mock enterprise document").buffer, key);
  const url = new URL(editorBaseUrl, location.href);
  url.hash = new URLSearchParams({
    fileUrl: URL.createObjectURL(new Blob([encrypted])),
    fileKey: btoa(String.fromCharCode(...key)),
    fileType: "docx",
    callbackOrigin: location.origin,
    mode: role.value === "viewer" ? "view" : "edit",
    sessionId: crypto.randomUUID(),
    userId: "simulated-user-1",
    userDisplayName: role.value
  }).toString();
  iframe.src = url;
});

document.querySelector("#view").addEventListener("click", () => setMode("view"));
document.querySelector("#edit").addEventListener("click", () => setMode("edit"));

function setMode(mode) {
  iframe.contentWindow?.postMessage({ type: "parent:update-permissions", mode }, location.origin);
}

async function encrypt(bytes, rawKey) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, bytes));
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce);
  out.set(ciphertext, nonce.length);
  return out;
}

