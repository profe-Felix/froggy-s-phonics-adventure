import { Actor } from 'base44:runtime/actors';

// Presentation room — syncs the current slide index between the teacher's
// computer (viewer) and phone (remote). The viewer sends a 'setup' message
// with the slide IDs and record ID; both devices then receive slide_changed
// broadcasts as the teacher navigates.
export default class PresentationRoom extends Actor {
  currentSlideIndex = 0;
  slideIds = [];
  presentationId = '';
  recordId = '';

  async handleStart() {
    const saved = await this.storage.get('state');
    if (saved) {
      this.currentSlideIndex = saved.currentSlideIndex || 0;
      this.slideIds = saved.slideIds || [];
      this.presentationId = saved.presentationId || '';
      this.recordId = saved.recordId || '';
    }
  }

  async handleConnect(conn) {
    conn.send({
      type: 'state',
      currentSlideIndex: this.currentSlideIndex,
      slideIds: this.slideIds,
      presentationId: this.presentationId,
      recordId: this.recordId,
      slideCount: this.slideIds.length,
    });
  }

  async handleMessage(conn, msg) {
    if (typeof msg !== 'object' || msg === null) return;

    if (msg.type === 'setup') {
      this.slideIds = Array.isArray(msg.slideIds) ? msg.slideIds : [];
      this.presentationId = String(msg.presentationId || '');
      this.recordId = String(msg.recordId || '');
      this.currentSlideIndex = 0;
      await this.saveState();
      this.broadcast({
        type: 'state',
        currentSlideIndex: this.currentSlideIndex,
        slideIds: this.slideIds,
        presentationId: this.presentationId,
        recordId: this.recordId,
        slideCount: this.slideIds.length,
      });
    } else if (msg.type === 'next') {
      if (this.currentSlideIndex < this.slideIds.length - 1) {
        this.currentSlideIndex++;
        await this.saveState();
        this.broadcast({ type: 'slide_changed', index: this.currentSlideIndex });
      }
    } else if (msg.type === 'prev') {
      if (this.currentSlideIndex > 0) {
        this.currentSlideIndex--;
        await this.saveState();
        this.broadcast({ type: 'slide_changed', index: this.currentSlideIndex });
      }
    } else if (msg.type === 'goto') {
      const idx = Number(msg.index);
      if (idx >= 0 && idx < this.slideIds.length) {
        this.currentSlideIndex = idx;
        await this.saveState();
        this.broadcast({ type: 'slide_changed', index: this.currentSlideIndex });
      }
    } else if (msg.type === 'advance_animation') {
      // Advance an animation step within the current slide (not a slide
      // change). Broadcast to all connections so the viewer can focus the
      // Google Slides iframe — cross-origin security prevents synthetic
      // clicks, but focusing the iframe's content window makes the next
      // physical key/click advance the animation.
      this.broadcast({ type: 'advance_animation' });
    }
  }

  async saveState() {
    await this.storage.put('state', {
      currentSlideIndex: this.currentSlideIndex,
      slideIds: this.slideIds,
      presentationId: this.presentationId,
      recordId: this.recordId,
    });
  }
}