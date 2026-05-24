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
      media: ConvertedMediaAsset[];
    }
  | {
      id: string;
      ok: false;
      message: string;
    };

export interface ConvertedMediaAsset {
  name: string;
  bytes: ArrayBuffer;
  mimeType: string;
}

export interface ConversionResult {
  bytes: ArrayBuffer;
  media: ConvertedMediaAsset[];
}

export async function convertOoxmlToBin(
  bytes: ArrayBuffer,
  fileType: FileType,
): Promise<ArrayBuffer> {
  return (await convertOoxmlToInternalDocument(bytes, fileType)).bytes;
}

export async function convertOoxmlToInternalDocument(
  bytes: ArrayBuffer,
  fileType: FileType,
): Promise<ConversionResult> {
  return convertWithWorker(bytes, `input.${fileType}`, "output.bin");
}

export async function convertBinToOoxml(
  bytes: ArrayBuffer,
  fileType: FileType,
): Promise<ArrayBuffer> {
  return (await convertWithWorker(bytes, "input.bin", `output.${fileType}`))
    .bytes;
}

function convertWithWorker(
  bytes: ArrayBuffer,
  inputName: string,
  outputName: string,
): Promise<ConversionResult> {
  return new Promise<ConversionResult>((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = new Worker(WORKER_URL);
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "x2t conversion timed out; the converter worker was terminated",
        ),
      );
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
        resolve({ bytes: response.bytes, media: response.media ?? [] });
      } else {
        reject(new Error(response.message));
      }
    };

    const request: WorkerRequest = {
      id,
      inputName,
      outputName,
      bytes: bytes.slice(0),
    };
    worker.postMessage(request, [request.bytes]);
  });
}
