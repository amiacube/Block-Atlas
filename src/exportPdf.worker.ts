/// <reference lib="webworker" />
import type { ExportDataset } from './exportFormats'
import { printablePdf } from './exportPdf'

const worker = self as unknown as DedicatedWorkerGlobalScope
worker.onmessage = ({ data }: MessageEvent<ExportDataset>) => {
  try {
    const bytes = printablePdf(data)
    worker.postMessage({ bytes }, [bytes])
  } catch {
    worker.postMessage({ failed:true })
  }
}
