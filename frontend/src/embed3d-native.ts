/**
 * DP-79 P5b — the 3D embed you can actually turn: a glTF, orbited in the card.
 *
 * **Why this exists next to the ATON iframe, and what changed.** `embed3d.ts`
 * argued against pulling a 3D engine into this bundle, and gave three reasons:
 * it would add *megabytes*, it would couple EMStudio to an ATON version, and it
 * would duplicate a viewer whose whole job is to be the viewer. Two of those
 * still hold and one did not survive being measured:
 *
 *   three.js + GLTFLoader + OrbitControls, minified: **381 kB (90 kB gzipped)**
 *
 * on a build that is 1.96 MB — 13% on the wire, and **only for readers who open
 * a 3D embed**, because it is imported dynamically the first time one renders.
 * It does not couple us to ATON (it is not ATON), and it does not duplicate the
 * scene viewer: it shows ONE model, which is precisely what a Shelf asset or a
 * promoted glTF is.
 *
 * So the two paths are now different jobs rather than one job done twice:
 *
 * * **a MODEL** — a `ResourceNode` with a glTF/GLB, the shape DP-76 promotion
 *   produces (reference + url + checksum). Rendered here, self-contained, and
 *   it works with no ATON deployed anywhere. This is the common case in the
 *   field and the only one that works offline on a node;
 * * **a SCENE** — a Heriverse/ATON scene, with epochs, its temporal UI and
 *   everything a published scene carries. That stays an iframe, because that IS
 *   a viewer whose whole job is to be the viewer.
 *
 * The rule the rest of the narrative obeys holds here too: **an embed is a
 * reference.** The URL is resolved at render time, nothing is copied into the
 * document, and an asset that has gone away produces a sentence rather than a
 * black rectangle.
 */

import { t } from "./i18n";
import { onFirstVisible } from "./lazy";

/** Loaded once per session, on the first 3D embed a reader actually looks at. */
let enginePromise: Promise<any> | null = null;

async function engine(): Promise<any> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [THREE, loaderMod, controlsMod] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      return { THREE, GLTFLoader: loaderMod.GLTFLoader,
               OrbitControls: controlsMod.OrbitControls };
    })();
  }
  return enginePromise;
}

export interface ViewerHandle {
  dispose(): void;
}

/**
 * Mount an orbitable view of one glTF into `host`.
 *
 * Nothing loads until the reader is looking at it (`lazy.ts`), for the same
 * reason the iframe does not: a chapter with six models must not fetch six
 * models because somebody scrolled past the title.
 */
export function mount3dViewer(host: HTMLElement, url: string,
                              opts: { label?: string } = {}): ViewerHandle {
  let disposed = false;
  let cleanup: (() => void) | null = null;

  const status = document.createElement("div");
  status.className = "nv-embed-note";
  status.textContent = "modello 3D — si carica quando lo guardi";
  host.appendChild(status);

  const fail = (why: string) => {
    // An asset that has gone away says so. A black box would let a reader
    // believe the model is loading, for ever.
    status.className = "nv-embed-note nv-implied";
    status.textContent = why;
  };

  onFirstVisible(host, () => {
    if (disposed) return;
    status.textContent = "carico il modello…";
    void (async () => {
      let THREE: any, GLTFLoader: any, OrbitControls: any;
      try {
        ({ THREE, GLTFLoader, OrbitControls } = await engine());
      } catch {
        fail(t("em3d.noEngine"));
        return;
      }
      if (disposed) return;

      const width = Math.max(240, host.clientWidth || 480);
      const height = Math.round(width * 0.62);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.domElement.className = "nv-3d-canvas";
      renderer.domElement.setAttribute(
        "aria-label", opts.label ? `modello 3D: ${opts.label}` : "modello 3D");

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
      // Two lights and no environment map: a study model is looked at, not
      // rendered for a magazine, and an HDRI would be another asset to ship.
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(2, 3, 2);
      scene.add(key);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      let frame = 0;
      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        controls.update();
        renderer.render(scene, camera);
      };

      new GLTFLoader().load(
        url,
        (gltf: any) => {
          if (disposed) return;
          scene.add(gltf.scene);
          // Frame whatever arrived: a study model may be a metre or a hillside,
          // and a fixed camera would show an empty screen for one of the two.
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const centre = box.getCenter(new THREE.Vector3());
          const span = Math.max(size.x, size.y, size.z) || 1;
          controls.target.copy(centre);
          camera.position.copy(centre).add(
            new THREE.Vector3(span * 1.4, span * 0.9, span * 1.6));
          camera.near = span / 100;
          camera.far = span * 100;
          camera.updateProjectionMatrix();
          controls.update();

          status.remove();
          host.appendChild(renderer.domElement);
          const hint = document.createElement("div");
          hint.className = "nv-embed-note";
          hint.textContent = t("em3d.dragHint");
          host.appendChild(hint);
          tick();
        },
        undefined,
        () => fail("il modello non è raggiungibile: "
                   + "il riferimento è valido, l'asset non risponde"),
      );

      cleanup = () => {
        cancelAnimationFrame(frame);
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
  });

  return {
    dispose() {
      disposed = true;
      cleanup?.();
    },
  };
}

//: The locators this viewer can actually open. A `.glb`/`.gltf` is a model;
//: anything else is somebody else's format and is left to the iframe path.
const GLTF = /\.(gltf|glb)(\?|#|$)/i;

export function isGltf(url: string | null | undefined): boolean {
  return !!url && GLTF.test(String(url));
}
