import type { FileType } from "./types";

const WORKER_URL = "./x2t-worker.js";
const CONVERSION_TIMEOUT_MS = 10 * 60 * 1000;

type WorkerRequest = {
  id: string;
  inputName: string;
  outputName: string;
  bytes: ArrayBuffer;
};

type WorkerResponse =
  | {
      id: string;
      ok: true;
      bytes: ArrayBuffer;
    }
  | {
      id: string;
      ok: false;
      message: string;
    };

export async function convertOoxmlToBin(bytes: ArrayBuffer, fileType: FileType): Promise<ArrayBuffer> {
  return convertWithWorker(bytes, `input.${fileType}`, "output.bin");
}

export async function convertBinToOoxml(bytes: ArrayBuffer, fileType: FileType): Promise<ArrayBuffer> {
  return convertWithWorker(bytes, "input.bin", `output.${fileType}`);
}

function convertWithWorker(bytes: ArrayBuffer, inputName: string, outputName: string): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = new Worker(WORKER_URL);
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("x2t conversion timed out; the converter worker was terminated"));
    }, CONVERSION_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(`x2t worker failed: ${event.message}`));
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (!response || response.id !== id) {
        return;
      }

      cleanup();
      if (response.ok) {
        resolve(response.bytes);
      } else {
        reject(new Error(response.message));
      }
    };

    const request: WorkerRequest = {
      id,
      inputName,
      outputName,
      bytes: bytes.slice(0)
    };
    worker.postMessage(request, [request.bytes]);
  });
}
