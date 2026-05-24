const WORKING_DIR = "/working";
const X2T_JS_URL = new URL("./vendor/x2t/x2t.js", self.location.href).href;
const X2T_BASE_URL = new URL("./vendor/x2t/", self.location.href).href;

let modulePromise;
let x2t;
let lastRuntimeError = "";

self.onmessage = async (event) => {
  const request = event.data;
  if (!request || !request.id) {
    return;
  }

  try {
    const module = await loadX2t();
    const bytes = convertWithX2t(module, request.bytes, request.inputName, request.outputName);
    self.postMessage({ id: request.id, ok: true, bytes }, [bytes]);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

async function loadX2t() {
  modulePromise ??= new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(X2T_JS_URL, { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(`Failed to fetch x2t.js: ${response.status}`);
      }

      const source = await response.text();
      self.Module = {
        noInitialRun: true,
        noExitRuntime: true,
        locateFile(path) {
          return `${X2T_BASE_URL}${path}`;
        },
        onAbort(reason) {
          reject(new Error(`x2t runtime aborted: ${String(reason)}`));
        },
        onRuntimeInitialized() {
          if (self.Module?.ccall && self.Module.FS) {
            x2t = self.Module;
            resolve(self.Module);
          } else {
            reject(new Error("x2t runtime initialized without expected exports"));
          }
        },
        printErr(text) {
          lastRuntimeError = String(text);
          console.warn("x2t:", text);
        }
      };

      runX2tSource(source);
    } catch (error) {
      reject(error);
    }
  });

  return modulePromise;
}

function runX2tSource(source) {
  const patched = source.replace(
    /Module\.locateFile=function\(path,prefix\)\{return prefix\+path\+suffix\}/,
    'Module.locateFile=function(path,prefix){return "' + X2T_BASE_URL + '"+path}'
  );
  const run = new Function("Module", patched);
  run(self.Module);
}

function convertWithX2t(module, bytes, inputName, outputName) {
  resetWorkDir(module);
  module.FS.writeFile(`${WORKING_DIR}/${inputName}`, new Uint8Array(bytes));
  module.FS.writeFile(`${WORKING_DIR}/params.xml`, buildParamsXml(inputName, outputName));

  lastRuntimeError = "";
  const result = module.ccall("main1", "number", ["string"], [`${WORKING_DIR}/params.xml`]);
  if (result !== 0) {
    throw new Error(`x2t conversion failed with exit code ${result}${lastRuntimeError ? `: ${lastRuntimeError}` : ""}`);
  }

  try {
    const output = module.FS.readFile(`${WORKING_DIR}/${outputName}`, { encoding: "binary" });
    return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  } catch (error) {
    throw new Error(`x2t did not produce ${outputName}${lastRuntimeError ? `: ${lastRuntimeError}` : ""}`);
  }
}

function buildParamsXml(inputName, outputName) {
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

function resetWorkDir(module) {
  removeRecursive(module, WORKING_DIR);
  removeRecursive(module, "/tmp");
  mkdirp(module, "/tmp");
  mkdirp(module, WORKING_DIR);
  mkdirp(module, `${WORKING_DIR}/media`);
  mkdirp(module, `${WORKING_DIR}/fonts`);
  mkdirp(module, `${WORKING_DIR}/themes`);
}

function mkdirp(module, path) {
  if (!module.FS.analyzePath(path).exists) {
    module.FS.mkdir(path);
  }
}

function removeRecursive(module, path) {
  if (!module.FS.analyzePath(path).exists) {
    return;
  }

  const stat = module.FS.stat(path);
  if (module.FS.isDir(stat.mode)) {
    for (const entry of module.FS.readdir(path)) {
      if (entry !== "." && entry !== "..") {
        removeRecursive(module, `${path}/${entry}`);
      }
    }
    if (path !== "/") {
      module.FS.rmdir(path);
    }
  } else {
    module.FS.unlink(path);
  }
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (char) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return entities[char];
  });
}
