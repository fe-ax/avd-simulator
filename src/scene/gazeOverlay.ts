/**
 * The dots and the reticle, as DOM rather than as geometry.
 *
 * They are an overlay, not part of the world: always on top, always the same size on screen, and
 * crisp at any resolution. Doing it in the scene would mean fighting depth and perspective for
 * something whose whole job is to sit in front of both. Updated imperatively each frame so six
 * moving elements never cost a React render.
 */
import type { GazeTargetState } from './gazeTargets';
import type { LookControl } from '../sim/types';

const LABELS: Record<LookControl, string> = {
  MIRROR_LEFT: 'spiegel links',
  MIRROR_RIGHT: 'spiegel rechts',
  SHOULDER_LEFT: 'schouder links',
  SHOULDER_RIGHT: 'schouder rechts',
  EYE_LEFT: 'links',
  EYE_RIGHT: 'rechts',
};

export class GazeOverlay {
  private readonly root: HTMLDivElement;
  private readonly dots = new Map<LookControl, HTMLDivElement>();

  constructor(parent: HTMLElement, private readonly showDots = true) {
    this.root = document.createElement('div');
    this.root.className = 'gaze-overlay';

    const reticle = document.createElement('div');
    reticle.className = 'gaze-reticle';
    this.root.appendChild(reticle);

    parent.appendChild(this.root);
  }

  update(states: readonly GazeTargetState[]) {
    if (!this.showDots) return;
    for (const state of states) {
      let dot = this.dots.get(state.control);
      if (!dot) {
        dot = document.createElement('div');
        dot.className = 'gaze-dot';
        dot.innerHTML = `<span class="gaze-ring"></span><span class="gaze-label">${
          LABELS[state.control]
        }</span>`;
        this.root.appendChild(dot);
        this.dots.set(state.control, dot);
      }

      if (!state.onScreen) {
        dot.style.display = 'none';
        continue;
      }
      dot.style.display = '';
      dot.style.transform = `translate(${state.x}px, ${state.y}px)`;
      // Dwell brightens the ring and closes it; freshness turns it green and lets it fade.
      dot.style.setProperty('--dwell', state.dwell.toFixed(3));
      dot.style.setProperty('--fresh', state.freshness.toFixed(3));
      dot.classList.toggle('under', state.under);
    }
  }

  dispose() {
    this.root.remove();
    this.dots.clear();
  }
}
