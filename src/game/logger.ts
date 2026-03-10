/**
 * Logger module for configurable logging.
 * Logging is disabled by default and can be enabled through configuration.
 */

let is_logging_enabled: boolean = false;

/**
 * Initialize the logger with the specified logging state.
 * @param enabled - Whether logging should be enabled
 */
export function initialize_logger(enabled: boolean): void {
    is_logging_enabled = enabled;
}

/**
 * Check if logging is currently enabled.
 * @returns True if logging is enabled, false otherwise
 */
export function is_logging_enabled_check(): boolean {
    return is_logging_enabled;
}

/**
 * Log a message if logging is enabled.
 * @param message - The message to log
 * @param optional_params - Additional parameters to log
 */
export function log_message(message: unknown, ...optional_params: unknown[]): void {
    if (is_logging_enabled) {
        console.log(message, ...optional_params);
    }
}

/**
 * Log a warning message if logging is enabled.
 * @param message - The warning message to log
 * @param optional_params - Additional parameters to log
 */
export function log_warning(message: unknown, ...optional_params: unknown[]): void {
    if (is_logging_enabled) {
        console.warn(message, ...optional_params);
    }
}

/**
 * Log an error message (always logged regardless of logging state).
 * @param message - The error message to log
 * @param optional_params - Additional parameters to log
 */
export function log_error(message: unknown, ...optional_params: unknown[]): void {
    console.error(message, ...optional_params);
}
