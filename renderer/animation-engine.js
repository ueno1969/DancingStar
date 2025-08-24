/**
 * アニメーション表示エンジン (TypeScriptのAnimationEngineと同等)
 */
class AnimationEngine {
  constructor(canvas, imageManager) {
    // 速度調整用の変数を追加
    this.playbackSpeed = 1.0;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageManager = imageManager;
    this.animationState = {
      isPlaying: false,
      currentFrame: 0,
      frameTimer: 0,
      sequence: null
    };
    this.animationId = null;
    this.FPS = 60;
    this.FRAME_TIME = 1000 / this.FPS; // 16.67ms per frame
    
    // フレーム変更時のコールバック
    this.onFrameChange = null;
    
    // ズーム機能の初期化
    this.currentZoom = 2; // デフォルト倍率

    // キャンバスサイズを設定（160×100、CSSで2倍表示）
    this.canvas.width = 160;
    this.canvas.height = 100;
    
    // キャンバスのスタイル設定
    this.canvas.style.border = '2px solid #333';
    this.canvas.style.backgroundColor = '#000';
    this.canvas.style.imageRendering = 'pixelated'; // ピクセルアートらしい表示
    
    // 初期ズーム設定
    this.setZoom(this.currentZoom);
  }

  /**
   * アニメーションシーケンスを再生
   */
  playAnimation(sequence) {
    this.animationState.sequence = sequence;
    this.animationState.currentFrame = 0;
    this.animationState.frameTimer = 0;
    this.animationState.isPlaying = true;

    // 初期フレーム情報を通知
    this.notifyFrameChange('current');

    if (!this.animationId) {
      this.startAnimationLoop();
    }
  }

  /**
   * アニメーションを停止
   */
  stopAnimation() {
    this.animationState.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    // 停止時はフレーム情報を隠す
    this.notifyFrameChange(null);
  }

  /**
   * アニメーションを一時停止
   */
  pauseAnimation() {
    this.animationState.isPlaying = false;
  }

  /**
   * アニメーションを再開
   */
  resumeAnimation() {
    if (this.animationState.sequence) {
      this.animationState.isPlaying = true;
      if (!this.animationId) {
        this.startAnimationLoop();
      }
    }
  }

  /**
   * 単一フレームを表示
   */
  displayFrame(frame) {
    this.clearCanvas();
    const imageElement = this.imageManager.getImageElement(frame.imageId);
    
    // フレームの座標を2×4ドット単位のキャラクタ座標からピクセル座標に変換
    // 例：X=10, Y=2 → (20, 8)ピクセルが左上座標になる
    // X座標: 2ドット単位 (frame.x * 2)
    // Y座標: 4ドット単位 (frame.y * 4)
    const pixelX = frame.x * 2;
    const pixelY = frame.y * 4;
    
    if (imageElement) {
      this.ctx.drawImage(imageElement, pixelX, pixelY);
    } else {
      // 画像が見つからない場合のプレースホルダー
      this.drawPlaceholder(pixelX, pixelY, frame.imageId);
    }
  }

  /**
   * アニメーションループの開始 (正しい実装)
   */
  startAnimationLoop() {
    let lastTime = performance.now();
    
    const animate = (currentTime) => {
      if (!this.animationState.isPlaying || !this.animationState.sequence) {
        this.animationId = null;
        return;
      }

      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      this.updateAnimation(deltaTime);
      this.render();

      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * アニメーション状態を更新 (正しい実装)
   */
  updateAnimation(deltaTime) {
    if (!this.animationState.sequence) return;

    const sequence = this.animationState.sequence;
    const currentFrame = sequence.frames[this.animationState.currentFrame];
    
    if (!currentFrame) return;

    // フレームタイマーを更新（1/60秒単位） - 速度調整を適用
    this.animationState.frameTimer += deltaTime * this.playbackSpeed;
    const frameWaitTime = currentFrame.waitTime * this.FRAME_TIME;

    if (this.animationState.frameTimer >= frameWaitTime) {
      // 次のフレームに進む
      this.animationState.currentFrame++;
      this.animationState.frameTimer = 0;

      // シーケンスの終端チェック
      if (this.animationState.currentFrame >= sequence.frames.length) {
        if (sequence.loop) {
          this.animationState.currentFrame = 0;
        } else {
          this.stopAnimation();
          return;
        }
      }
      
      // フレーム変更を通知
      this.notifyFrameChange('current');
    }
  }

  /**
   * 現在の状態を描画
   */
  render() {
    if (!this.animationState.sequence) return;

    const sequence = this.animationState.sequence;
    const currentFrame = sequence.frames[this.animationState.currentFrame];
    
    if (currentFrame) {
      this.displayFrame(currentFrame);
    }
  }

  /**
   * キャンバスをクリア
   */
  clearCanvas() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * プレースホルダーを描画
   */
  drawPlaceholder(x, y, imageId) {
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x, y, 72, 88);
    
    this.ctx.strokeStyle = '#666';
    this.ctx.strokeRect(x, y, 72, 88);
    
    this.ctx.fillStyle = '#999';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('?', x + 36, y + 40);
    this.ctx.fillText(imageId, x + 36, y + 60);
  }

  /**
   * 現在の再生状態を取得
   */
  getAnimationState() {
    return { ...this.animationState };
  }

  /**
   * キャンバス要素を取得
   */
  getCanvas() {
    return this.canvas;
  }

  /**
   * アニメーション再生速度を設定
   * @param {number} speed - 再生速度 (0.25～4.0)
   */
  setPlaybackSpeed(speed) {
    this.playbackSpeed = Number(speed);
    return this.playbackSpeed;
  }

  /**
   * 現在の再生速度を取得
   * @returns {number} 現在の再生速度
   */
  getPlaybackSpeed() {
    return this.playbackSpeed;
  }

  /**
   * アニメーションを特定のフレームにジャンプ
   * @param {number} frameIndex - ジャンプ先のフレームインデックス
   */
  seekToFrame(frameIndex) {
    if (!this.animationState.sequence || !this.animationState.sequence.frames) {
      return false;
    }
    
    if (frameIndex < 0 || frameIndex >= this.animationState.sequence.frames.length) {
      return false;
    }
    
    // フレーム位置を更新
    this.animationState.currentFrame = frameIndex;
    this.animationState.frameTimer = 0; // タイマーをリセット
    
    // フレームを描画
    this.render();
    
    // フレーム変更を通知
    this.notifyFrameChange('current');
    
    return true;
  }

  /**
   * 指定したフレームまでの累計時間を計算（秒単位）
   * @param {number} frameIndex - フレームインデックス
   * @returns {number} 累計時間（秒）
   */
  calculateTimeToFrame(frameIndex) {
    if (!this.animationState.sequence || !this.animationState.sequence.frames) {
      return 0;
    }
    
    if (frameIndex < 0 || frameIndex >= this.animationState.sequence.frames.length) {
      return 0;
    }
    
    let totalTime = 0;
    for (let i = 0; i < frameIndex; i++) {
      const frame = this.animationState.sequence.frames[i];
      if (frame) {
        // waitTimeは1/60秒単位なので、FRAME_TIMEを使って実際の時間に変換してから秒に変換
        // アニメーション速度は動画側で調整されるため、ここでは基本時間のみ計算
        totalTime += (frame.waitTime * this.FRAME_TIME) / 1000;
      }
    }
    
    return totalTime;
  }

  /**
   * 特定の座標に画像を即座に描画（プレビュー用）
   */
  previewImage(imageId, x, y) {
    this.clearCanvas();
    const imageElement = this.imageManager.getImageElement(imageId);
    
    // フレームの座標を2×4ドット単位のキャラクタ座標からピクセル座標に変換
    // X座標: 2ドット単位 (x * 2)
    // Y座標: 4ドット単位 (y * 4)
    const pixelX = x * 2;
    const pixelY = y * 4;
    
    if (imageElement) {
      this.ctx.drawImage(imageElement, pixelX, pixelY);
    } else {
      this.drawPlaceholder(pixelX, pixelY, imageId);
    }
  }

  /**
   * キャンバスのズーム倍率を設定
   * @param {number} zoomLevel - ズーム倍率 (2, 3, 4)
   */
  setZoom(zoomLevel) {
    // 現在のズームクラスを削除
    this.canvas.classList.remove('zoom-2x', 'zoom-3x', 'zoom-4x');
    
    // 新しいズームクラスを追加
    this.canvas.classList.add(`zoom-${zoomLevel}x`);
    
    // ズーム倍率を保存
    this.currentZoom = zoomLevel;
    
    return zoomLevel;
  }

  /**
   * 現在のズーム倍率を取得
   * @returns {number} 現在のズーム倍率
   */
  getZoom() {
    return this.currentZoom || 2; // デフォルトは2倍
  }

  /**
   * フレーム変更時のコールバックを設定
   * @param {Function} callback - コールバック関数
   */
  setOnFrameChange(callback) {
    this.onFrameChange = callback;
  }

  /**
   * フレーム変更を通知
   * @param {Object} frameInfo - フレーム情報（nullの場合は非表示、'current'の場合は現在のフレーム情報を使用）
   */
  notifyFrameChange(frameInfo = null) {
    if (this.onFrameChange) {
      if (frameInfo === null) {
        // 明示的にnullが渡された場合は停止状態として処理
        this.onFrameChange(null);
      } else if (frameInfo === 'current' && this.animationState.sequence) {
        // 現在のフレーム情報を取得
        const currentFrame = this.animationState.sequence.frames[this.animationState.currentFrame];
        
        if (currentFrame) {
          const info = {
            frameIndex: this.animationState.currentFrame,
            totalFrames: this.animationState.sequence.frames.length,
            x: currentFrame.x,
            y: currentFrame.y,
            waitTime: currentFrame.waitTime,
            imageId: currentFrame.imageId
          };
          
          this.onFrameChange(info);
        }
      }
    }
  }
}
