/**
 * The instrument on the tank cowl: speed and gear, drawn to a canvas and mapped onto the display.
 *
 * Diegetic rather than an overlay, and that is the point. It sits low in the frame, roughly 21°
 * below the eyeline, so reading it is a glance down at the machine — the same small cost it is on
 * the road. A number in the corner of the screen is free of that; this one is not.
 */
import * as THREE from 'three';

const WIDTH = 0.24;
const HEIGHT = 0.12;
/** Texture resolution. At about 0.85 m from the eye the display is some 240 px across on screen. */
const TEXTURE = { width: 320, height: 160 };

const COLOURS = {
  face: '#14171e',
  major: '#f2f4f8',
  minor: '#8892a4',
  rule: '#2d323e',
  over: '#ff8d84',
  telltale: '#3fbf76',
  telltaleOff: '#232833',
};

/** Blinks per second, matched to the machine's own indicator so the two agree. */
const BLINK_HZ = 1.3;

export class Instrument {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private shownSpeed = -1;
  private shownGear = -1;
  private shownTelltale = '';

  constructor(
    position: THREE.Vector3,
    private readonly speedLimitKmh: number,
  ) {
    this.canvas.width = TEXTURE.width;
    this.canvas.height = TEXTURE.height;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, HEIGHT),
      // Unlit: an instrument is backlit, and shading it with the sun would leave it unreadable
      // exactly when the rider is in shadow.
      new THREE.MeshBasicMaterial({ map: this.texture }),
    );
    this.mesh.name = 'instrument';
    this.mesh.position.copy(position);
    // The face tilts back toward the rider's eyes rather than standing upright, the way a real
    // binnacle does.
    this.mesh.rotation.x = -0.45;

    this.draw(0, 1, 'off');
  }

  /** Redraws only when something shown actually changes; this runs every frame. */
  update(speedKmh: number, gear: number, indicator: 'left' | 'right' | 'off', time: number) {
    const speed = Math.round(speedKmh);
    // A blinking telltale is part of what is shown, so the blink phase joins the dirty check.
    const lit = indicator !== 'off' && Math.floor(time * BLINK_HZ * 2) % 2 === 0;
    const telltale = lit ? indicator : 'off';
    if (speed === this.shownSpeed && gear === this.shownGear && telltale === this.shownTelltale) {
      return;
    }
    this.shownSpeed = speed;
    this.shownGear = gear;
    this.shownTelltale = telltale;
    this.draw(speed, gear, telltale);
    this.texture.needsUpdate = true;
  }

  /** The arrow telltales, which are the only way to know your own indicator is on: from the
   * saddle you cannot see either lamp. */
  private drawTelltale(side: 'left' | 'right', lit: boolean) {
    const { ctx } = this;
    const { width: w } = TEXTURE;
    const cx = side === 'left' ? 34 : w - 34;
    const dir = side === 'left' ? -1 : 1;
    const cy = 26;

    ctx.fillStyle = lit ? COLOURS.telltale : COLOURS.telltaleOff;
    ctx.beginPath();
    ctx.moveTo(cx + dir * 15, cy);
    ctx.lineTo(cx - dir * 4, cy - 15);
    ctx.lineTo(cx - dir * 4, cy - 6);
    ctx.lineTo(cx - dir * 16, cy - 6);
    ctx.lineTo(cx - dir * 16, cy + 6);
    ctx.lineTo(cx - dir * 4, cy + 6);
    ctx.lineTo(cx - dir * 4, cy + 15);
    ctx.closePath();
    ctx.fill();
  }

  private draw(speed: number, gear: number, telltale: 'left' | 'right' | 'off') {
    const { ctx } = this;
    const { width: w, height: h } = TEXTURE;

    ctx.fillStyle = COLOURS.face;
    ctx.fillRect(0, 0, w, h);

    this.drawTelltale('left', telltale === 'left');
    this.drawTelltale('right', telltale === 'right');

    // Speed fills the left two thirds; the gear gets its own panel on the right.
    const split = Math.round(w * 0.66);
    ctx.strokeStyle = COLOURS.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(split, 50);
    ctx.lineTo(split, h - 16);
    ctx.stroke();

    // Speed above its unit rather than beside it: at two digits and this size they collide.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = speed > this.speedLimitKmh + 1 ? COLOURS.over : COLOURS.major;
    ctx.font = '700 84px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(speed), split - 16, h - 48);

    ctx.fillStyle = COLOURS.minor;
    ctx.font = '600 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('km/u', split - 16, h - 18);

    ctx.textAlign = 'center';
    ctx.fillStyle = COLOURS.major;
    ctx.font = '700 64px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(gear), (split + w) / 2, h - 48);

    ctx.fillStyle = COLOURS.minor;
    ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('VERSN.', (split + w) / 2, h - 18);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
