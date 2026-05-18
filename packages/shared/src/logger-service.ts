export class LoggerService {
  private static instance: LoggerService;
  private logLevel: string;

  private constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  public log(message: string, level: string = 'info'): void {
    console.log(`[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`);
  }

  public error(message: string): void {
    this.log(message, 'error');
  }

  public warn(message: string): void {
    this.log(message, 'warn');
  }

  public info(message: string): void {
    this.log(message, 'info');
  }

  public debug(message: string): void {
    this.log(message, 'debug');
  }
}

export default LoggerService;