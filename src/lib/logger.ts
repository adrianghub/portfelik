type LogLevel = "debug" | "info" | "warn" | "error";

type LogMethod = (message: string, ...args: unknown[]) => void;

const LOG_STYLES: Record<LogLevel, { service: string; message: string }> = {
  debug: {
    service: "color: #888; font-weight: normal;",
    message: "color: #888; font-weight: normal;",
  },
  info: {
    service: "color: #0066cc; font-weight: bold;",
    message: "color: #00a2ff; font-weight: normal;",
  },
  warn: {
    service: "color: #ffa500; font-weight: bold;",
    message: "color: #ffa500; font-weight: normal;",
  },
  error: {
    service: "color: #ff0000; font-weight: bold;",
    message: "color: #ff0000; font-weight: normal;",
  },
};

class Logger {
  private isDevelopment: boolean;
  private logMethods: Record<LogLevel, LogMethod>;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.logMethods = {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
  }

  private formatMessage(
    level: LogLevel,
    service: string,
    message: string,
  ): string[] {
    const styles = LOG_STYLES[level];
    return [`%c[${service}]%c ${message}`, styles.service, styles.message];
  }

  private log(
    level: LogLevel,
    service: string,
    message: string,
    ...args: unknown[]
  ): void {
    const shouldShow =
      this.isDevelopment ||
      args.some(
        (arg) =>
          typeof arg === "object" &&
          arg !== null &&
          "prod" in arg &&
          arg.prod === true,
      );

    if (shouldShow) {
      const [formattedMessage, ...styles] = this.formatMessage(
        level,
        service,
        message,
      );
      this.logMethods[level](formattedMessage, ...styles, ...args);
    }
  }

  debug(service: string, message: string, ...args: unknown[]): void {
    this.log("debug", service, message, ...args);
  }

  info(service: string, message: string, ...args: unknown[]): void {
    this.log("info", service, message, ...args);
  }

  warn(service: string, message: string, ...args: unknown[]): void {
    this.log("warn", service, message, ...args);
  }

  error(service: string, message: string, ...args: unknown[]): void {
    this.log("error", service, message, ...args);
  }
}

export const logger = new Logger();
