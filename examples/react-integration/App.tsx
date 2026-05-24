import { useEffect, useMemo, useState } from "react";

type Props = {
  editorOrigin: string;
  fileUrl: string;
  fileKey: string;
  fileType: "docx" | "xlsx" | "pptx";
  onSave(bytes: ArrayBuffer): void;
  onExit(): void;
};

export function CrypteeEditor({ editorOrigin, fileUrl, fileKey, fileType, onSave, onExit }: Props) {
  const [ready, setReady] = useState(false);
  const src = useMemo(() => {
    const url = new URL(editorOrigin);
    url.hash = new URLSearchParams({
      fileUrl,
      fileKey,
      fileType,
      callbackOrigin: location.origin,
      displayName: "example.docx"
    }).toString();
    return url.toString();
  }, [editorOrigin, fileKey, fileType, fileUrl]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== new URL(editorOrigin).origin) return;
      if (event.data?.type === "editor:ready") setReady(true);
      if (event.data?.type === "editor:saved") onSave(event.data.encryptedBytes);
      if (event.data?.type === "editor:exit") onExit();
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [editorOrigin, onExit, onSave]);

  return (
    <section>
      <p>{ready ? "Editor ready" : "Loading editor"}</p>
      <iframe title="cryptee-editor" src={src} style={{ width: "100%", height: "70vh", border: "1px solid #ccc" }} />
    </section>
  );
}

export default function App() {
  const [saved, setSaved] = useState<ArrayBuffer | null>(null);
  return (
    <>
      <CrypteeEditor
        editorOrigin="http://127.0.0.1:5173/"
        fileUrl="https://mystorage.example.com/mock.enc"
        fileKey="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        fileType="docx"
        onSave={setSaved}
        onExit={() => console.log("exit requested")}
      />
      <p>{saved ? `Saved ${saved.byteLength} encrypted bytes` : "No save yet"}</p>
    </>
  );
}
