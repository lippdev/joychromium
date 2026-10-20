/** What the running app knows about its own cost: boot time, memory per process and session size, as diagnostics lines. */

/** One process as Electron reports it in `app.getAppMetrics()`, flattened so this module needs no Electron. */
export interface ProcessMetric {
  /** Electron's process type: Browser, Tab, GPU, Utility, Zygote… */
  type: string;
  /** `memory.workingSetSize`: the process's resident memory, in kilobytes. */
  memoryKb: number;
}

export interface DiagnosticsMetrics {
  /** Milliseconds from process start to the first window being shown. */
  bootMs: number;
  processes: readonly ProcessMetric[];
  tabCount: number;
}

const mib = (kb: number): string => `${(kb / 1024).toFixed(1)} MiB`;

export function formatBootLine(bootMs: number): string {
  return `Boot to first window: ${Math.max(0, Math.round(bootMs))} ms`;
}

/** One total line plus one indented line per process, so a bug report shows where the memory went. */
export function formatMemoryLines(processes: readonly ProcessMetric[]): string[] {
  const totalKb = processes.reduce((sum, process) => sum + process.memoryKb, 0);
  const count = processes.length;
  return [
    `Memory working set: ${mib(totalKb)} in ${count} ${count === 1 ? "process" : "processes"}`,
    ...processes.map((process) => `  ${process.type}: ${mib(process.memoryKb)}`),
  ];
}

export function formatTabsLine(tabCount: number): string {
  return `Tabs: ${Math.max(0, Math.trunc(tabCount))}`;
}

/** The whole `diagnostics.txt` of the zip: one fact per line, the process list under its total. */
export function diagnosticsLines(metrics: DiagnosticsMetrics): string[] {
  return [formatBootLine(metrics.bootMs), ...formatMemoryLines(metrics.processes), formatTabsLine(metrics.tabCount)];
}
