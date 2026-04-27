import { ref, type Ref } from 'vue';

export interface PrinterClosable {
  close(): Promise<void>;
}

export type StatusType = 'idle' | 'ok' | 'error';

export interface UseUsbPairingOptions<P extends PrinterClosable> {
  importPrinter: () => Promise<P>;
  getPrinterName: (printer: P) => string;
  onConnect?: (printer: P) => void;
  onDisconnect?: () => void;
}

export interface UseUsbPairingReturn<P extends PrinterClosable> {
  printer: Ref<P | null>;
  printerName: Ref<string>;
  isConnecting: Ref<boolean>;
  isPrinting: Ref<boolean>;
  statusMessage: Ref<string>;
  statusType: Ref<StatusType>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  runPrint: (job: () => Promise<void>) => Promise<void>;
}

export function useUsbPairing<P extends PrinterClosable>(
  options: UseUsbPairingOptions<P>,
): UseUsbPairingReturn<P> {
  const printer = ref(null) as Ref<P | null>;
  const printerName = ref('');
  const isConnecting = ref(false);
  const isPrinting = ref(false);
  const statusMessage = ref('');
  const statusType = ref<StatusType>('idle');

  async function connect(): Promise<void> {
    isConnecting.value = true;
    statusMessage.value = '';
    statusType.value = 'idle';
    try {
      const p = await options.importPrinter();
      printer.value = p;
      printerName.value = options.getPrinterName(p);
      options.onConnect?.(p);
      statusType.value = 'ok';
      statusMessage.value = 'Ready to print.';
    } catch (err) {
      statusType.value = 'error';
      statusMessage.value = err instanceof Error ? err.message : 'Connection failed.';
    } finally {
      isConnecting.value = false;
    }
  }

  async function disconnect(): Promise<void> {
    if (!printer.value) return;
    try {
      await printer.value.close();
    } catch {
      // ignore
    }
    printer.value = null;
    printerName.value = '';
    statusMessage.value = '';
    statusType.value = 'idle';
    options.onDisconnect?.();
  }

  async function runPrint(job: () => Promise<void>): Promise<void> {
    if (!printer.value) return;
    isPrinting.value = true;
    statusMessage.value = 'Sending to printer…';
    statusType.value = 'idle';
    try {
      await job();
      statusType.value = 'ok';
      statusMessage.value = 'Label sent ✓';
    } catch (err) {
      statusType.value = 'error';
      statusMessage.value = err instanceof Error ? err.message : 'Print failed.';
    } finally {
      isPrinting.value = false;
    }
  }

  return {
    printer,
    printerName,
    isConnecting,
    isPrinting,
    statusMessage,
    statusType,
    connect,
    disconnect,
    runPrint,
  };
}
