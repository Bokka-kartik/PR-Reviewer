export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

function write(level: string, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta })
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const consoleLogger: Logger = {
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }
