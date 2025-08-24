/**
 * デバッグ用のロガークラス
 */
class Logger {
  static info(message, ...args) {
    console.log(`[INFO] ${message}`, ...args);
  }
  
  static warn(message, ...args) {
    console.warn(`[WARN] ${message}`, ...args);
  }
  
  static error(message, ...args) {
    console.error(`[ERROR] ${message}`, ...args);
  }
  
  static debug(message, ...args) {
    if (window.DEBUG_MODE) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
}

// デバッグモードを有効にする
window.DEBUG_MODE = true;

window.Logger = Logger;
