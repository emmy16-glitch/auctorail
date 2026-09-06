// Minimal typing for the browser ESM build of tesseract.js (the package's
// main field is CJS, which cannot run in the browser bundle; the ESM dist
// build re-exports the namespace as its default export).
declare module "tesseract.js/dist/tesseract.esm.min.js" {
  namespace tesseract {
    interface LoggerMessage {
      status?: string;
      progress?: number;
    }
    interface WorkerOptions {
      workerPath?: string;
      corePath?: string;
      langPath?: string;
      logger?: (m: LoggerMessage) => void;
      [key: string]: unknown;
    }
    interface Worker {
      recognize: (image: File | string) => Promise<{ data: { text?: string } }>;
      terminate: () => Promise<void>;
    }
    function createWorker(langs?: string | string[], oem?: number, options?: WorkerOptions): Promise<Worker>;
  }
  export default tesseract;
}
