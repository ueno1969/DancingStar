/**
 * 通知システムクラス
 */
class NotificationSystem {
  constructor() {
    this.container = null;
    this.statusBar = null;
    this.init();
  }

  init() {
    this.container = document.getElementById('notification-container');
    this.statusBar = document.getElementById('status-bar');
    
    if (!this.container || !this.statusBar) {
      console.warn('通知システムのHTML要素が見つかりません');
    }
  }

  /**
   * トースト通知を表示
   * @param {string} title - タイトル
   * @param {string} message - メッセージ
   * @param {string} type - 'success'|'warning'|'error'|'info'
   * @param {number} duration - 表示時間（ミリ秒、0で自動消去なし）
   */
  showToast(title, message, type = 'info', duration = 5000) {
    if (!this.container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
      <div class="notification-title">
        ${title}
        <button class="notification-close">&times;</button>
      </div>
      <div class="notification-message">${message}</div>
    `;

    // 閉じるボタンのイベント
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.removeNotification(notification);
    });

    this.container.appendChild(notification);

    // 自動削除
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notification);
      }, duration);
    }

    return notification;
  }

  /**
   * ステータスバーに状態を表示
   * @param {string} message - メッセージ
   * @param {string} type - 'success'|'warning'|'error'|'info'|''
   * @param {number} duration - 表示時間（ミリ秒、0で永続表示）
   */
  showStatus(message, type = '', duration = 3000) {
    if (!this.statusBar) return;

    const statusText = this.statusBar.querySelector('#status-text');
    if (statusText) {
      statusText.textContent = message;
    }

    // クラスをリセットして新しい種類を適用
    this.statusBar.className = 'status-bar';
    if (type) {
      this.statusBar.classList.add(type);
    }

    // 自動リセット
    if (duration > 0) {
      setTimeout(() => {
        if (statusText) {
          statusText.textContent = '準備完了';
        }
        this.statusBar.className = 'status-bar';
      }, duration);
    }
  }

  removeNotification(notification) {
    if (!notification.parentNode) return;
    
    notification.classList.add('removing');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }

  // ショートカットメソッド
  success(title, message, duration = 3000) {
    this.showToast(title, message, 'success', duration);
    this.showStatus(`✓ ${title}`, 'success', duration);
  }

  warning(title, message, duration = 5000) {
    this.showToast(title, message, 'warning', duration);
    this.showStatus(`⚠ ${title}`, 'warning', duration);
  }

  error(title, message, duration = 0) { // エラーは手動で閉じるまで表示
    this.showToast(title, message, 'error', duration);
    this.showStatus(`✗ ${title}`, 'error', 10000);
  }

  info(title, message, duration = 4000) {
    this.showToast(title, message, 'info', duration);
    this.showStatus(`ℹ ${title}`, 'info', duration);
  }
}
