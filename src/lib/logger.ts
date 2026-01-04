/**
 * Chief Engineer's Production Logger
 * 
 * Simple wrapper for logging that can be easily extended to 
 * Sentry, Axiom, or Datadog in the future.
 */
export const logger = {
  info: (message: string, context?: any) => {
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context) : "");
  },
  error: (message: string, error?: any, context?: any) => {
    console.error(`[ERROR] ${message}`, error, context ? JSON.stringify(context) : "");
    
    // FUTURE: Integrations like Sentry go here
    // Sentry.captureException(error, { extra: context });
  },
  warn: (message: string, context?: any) => {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context) : "");
  },
  audit: (action: string, actor: string, details?: any) => {
    // Specialized logging for security audits
    console.log(`[AUDIT] ${action} by ${actor}`, details ? JSON.stringify(details) : "");
  }
};

