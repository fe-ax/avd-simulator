/**
 * The post chain for the forward view.
 *
 * Two passes and no more. Ambient occlusion, because contact shadow is most of what makes a kerb
 * sit *on* a road rather than float above it, and antialiasing, because a world of straight edges
 * at forty metres is where aliasing shows worst. Then the output pass, which is where tone mapping
 * and the colour-space conversion actually happen once a composer is in play.
 *
 * **What is deliberately absent**: depth of field, motion blur, film grain, and bloom beyond
 * nothing. Every one of them trades distant detail for atmosphere, and distant detail is the
 * exercise — the whole exam is reading a junction eighty metres off. A prettier screenshot that
 * makes the snorfiets harder to see is a worse tool.
 *
 * **The mirrors do not come through here.** They render themselves into their own targets before
 * this runs, and they are 200 px of glass nobody studies for aliasing. Putting them through the
 * chain would double the cost of the most expensive part of the frame for pixels that do not
 * reward it.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * How far occlusion reaches, in metres.
 *
 * Small on purpose. Wide-radius AO on an open street darkens the road under the whole horizon and
 * reads as dirt; what is wanted is the half metre where a kerb meets tarmac and a wall meets a
 * pavement.
 */
const AO_DISTANCE = 0.6;

export class Composer {
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.ao = new GTAOPass(scene, camera, width, height);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.updateGtaoMaterial({
      radius: AO_DISTANCE,
      distanceExponent: 1,
      thickness: 1,
      scale: 1,
      samples: 16,
      // Screen-space AO on a fogged scene wants a hard cut-off, or the far end of the road picks up
      // occlusion from geometry that fog has already hidden.
      screenSpaceRadius: false,
    });
    this.composer.addPass(this.ao);

    // Takes its size from the composer in this version of three; passing one silently did nothing
    // useful and now does not typecheck, which is the better of the two.
    this.composer.addPass(new SMAAPass());
    // Tone mapping and sRGB conversion move here the moment a composer exists: leaving them on the
    // renderer would apply them to the render target and then again on the way out.
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
