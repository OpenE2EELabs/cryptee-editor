import type { FileType } from "./types";

type X2tModule = {
  FS: {
    analyzePath(path: string): { exists: boolean };
    close(stream: unknown): void;
    isDir(mode: number): boolean;
    mkdir(path: string): void;
    open(path: string, mode: string): unknown;
    readFile(path: string, options: { encoding: "binary" }): Uint8Array;
    readdir(path: string): string[];
    rmdir(path: string): void;
    stat(path: string): { mode: number };
    unlink(path: string): void;
    write(stream: unknown, data: Uint8Array, offset: number, length: number, position: number): void;
    writeFile(path: string, data: string | Uint8Array): void;
  };
  ccall(name: string, returnType: "number", argTypes: ["string"], args: [string]): number;
  locateFile?: (path: string, prefix: string) => string;
  noExitRuntime?: boolean;
  noInitialRun?: boolean;
  onRuntimeInitialized?: () => void;
};

declare global {
  interface Window {
    Module?: X2tModule;
  }
}

const X2T_BASE_URL = "./vendor/x2t/";
const WORKING_DIR = "/working";

let modulePromise: Promise<X2tModule> | undefined;

export async function convertOoxmlToBin(bytes: ArrayBuffer, fileType: FileType): Promise<ArrayBuffer> {
  return convertWithX2t(bytes, `input.${fileType}`, "output.bin");
}

export async function convertBinToOoxml(bytes: ArrayBuffer, fileType: FileType): Promise<ArrayBuffer> {
  return convertWithX2t(bytes, "input.bin", `output.${fileType}`);
}

async function convertWithX2t(bytes: ArrayBuffer, inputName: string, outputName: string): Promise<ArrayBuffer> {
  const x2t = await loadX2t();
  resetWorkDir(x2t);
  writeBytes(x2t, `${WORKING_DIR}/${inputName}`, new Uint8Array(bytes));
  x2t.FS.writeFile(`${WORKING_DIR}/params.xml`, buildParamsXml(inputName, outputName));

  const result = x2t.ccall("main1", "number", ["string"], [`${WORKING_DIR}/params.xml`]);
  if (result !== 0) {
    throw new Error(`x2t conversion failed with exit code ${result}`);
  }

  const output = x2t.FS.readFile(`${WORKING_DIR}/${outputName}`, { encoding: "binary" });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

async function loadX2t(): Promise<X2tModule> {
  modulePromise ??= new Promise<X2tModule>((resolve, reject) => {
    if (window.Module?.ccall && window.Module.FS) {
      resolve(window.Module);
      return;
    }

    window.Module = {
      noInitialRun: true,
      noExitRuntime: true,
      locateFile(path: string) {
        return `${X2T_BASE_URL}${path}`;
      },
      onRuntimeInitialized() {
        if (window.Module?.ccall && window.Module.FS) {
          resolve(window.Module);
        } else {
          reject(new Error("x2t runtime initialized without expected exports"));
        }
      }
    } as unknown as X2tModule;

    const script = document.createElement("script");
    script.src = `${X2T_BASE_URL}x2t.js`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load x2t.js"));
    document.head.append(script);
  });

  return modulePromise;
}

function buildParamsXml(inputName: string, outputName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <m_sFontDir>${WORKING_DIR}/fonts/</m_sFontDir>
  <m_sThemeDir>${WORKING_DIR}/themes</m_sThemeDir>
  <m_sFileFrom>${WORKING_DIR}/${escapeXml(inputName)}</m_sFileFrom>
  <m_sFileTo>${WORKING_DIR}/${escapeXml(outputName)}</m_sFileTo>
  <m_bIsNoBase64>false</m_bIsNoBase64>
  <m_nCsvTxtEncoding>46</m_nCsvTxtEncoding>
  <m_nCsvDelimiter>4</m_nCsvDelimiter>
</TaskQueueDataConvert>`;
}

function resetWorkDir(x2t: X2tModule): void {
  removeRecursive(x2t, WORKING_DIR);
  removeRecursive(x2t, "/tmp");
  mkdirp(x2t, "/tmp");
  mkdirp(x2t, WORKING_DIR);
  mkdirp(x2t, `${WORKING_DIR}/media`);
  mkdirp(x2t, `${WORKING_DIR}/fonts`);
  mkdirp(x2t, `${WORKING_DIR}/themes`);
}

function mkdirp(x2t: X2tModule, path: string): void {
  if (!x2t.FS.analyzePath(path).exists) {
    x2t.FS.mkdir(path);
  }
}

function writeBytes(x2t: X2tModule, path: string, bytes: Uint8Array): void {
  const stream = x2t.FS.open(path, "w");
  x2t.FS.write(stream, bytes, 0, bytes.length, 0);
  x2t.FS.close(stream);
}

function removeRecursive(x2t: X2tModule, path: string): void {
  if (!x2t.FS.analyzePath(path).exists) {
    return;
  }

  const stat = x2t.FS.stat(path);
  if (x2t.FS.isDir(stat.mode)) {
    for (const entry of x2t.FS.readdir(path)) {
      if (entry !== "." && entry !== "..") {
        removeRecursive(x2t, `${path}/${entry}`);
      }
    }
    if (path !== "/") {
      x2t.FS.rmdir(path);
    }
  } else {
    x2t.FS.unlink(path);
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return entities[char];
  });
}
