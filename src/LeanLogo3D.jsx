// A real WebGL render of Lean's logo mark — the same two-bar "L" shape as
// LogoMark, but as an actual lit 3D object instead of a flat SVG icon.
//
// This is the honest difference from everything else in this app: every
// other "3D-ish" effect here (the orb, the waveform) is CSS or 2D canvas
// faking depth with blur and gradients. This one is real geometry, real
// physically-based material (metalness/roughness), and real lights —
// the same category of technique SharpLink uses for their footer logo,
// confirmed from their page's Three.js config.

import { useRef, useEffect } from 'react';
import * as THREE from 'three';

export function LeanLogo3D({ height = 260 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      // WebGL unavailable — fail quietly rather than break the page
      return;
    }

    const width = mount.clientWidth || 300;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();

    // Same two-bar shape as the flat LogoMark, extruded into real boxes.
    const wineMat = new THREE.MeshStandardMaterial({ color: 0xf0566e, metalness: 0.88, roughness: 0.22 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x7b9fff, metalness: 0.88, roughness: 0.22 });

    const vBarGeo = new THREE.BoxGeometry(0.85, 2.9, 0.85);
    const vBar = new THREE.Mesh(vBarGeo, wineMat);
    vBar.position.set(-0.85, 0.55, 0);
    group.add(vBar);

    const hBarGeo = new THREE.BoxGeometry(2.35, 0.8, 0.85);
    const hBar = new THREE.Mesh(hBarGeo, blueMat);
    hBar.position.set(0.15, -1.05, 0);
    group.add(hBar);

    scene.add(group);

    // Lighting is what actually sells the "real metal" look — a bright key
    // light for the main highlight, a soft fill so the shadow side isn't
    // pure black, and two colored point lights (wine + blue) for the kind
    // of tinted specular reflection flat CSS can't reproduce.
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 5, 6);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-4, -2, 3);
    scene.add(fill);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const rimWine = new THREE.PointLight(0xf0566e, 2, 20);
    rimWine.position.set(-3, 2, -3);
    scene.add(rimWine);

    const rimBlue = new THREE.PointLight(0x7b9fff, 1.6, 20);
    rimBlue.position.set(3, -2, -3);
    scene.add(rimBlue);

    let raf;
    let t = 0;
    function animate() {
      t += 0.006;
      group.rotation.y = t * 0.35 + Math.sin(t * 0.6) * 0.3;
      group.rotation.x = Math.sin(t * 0.4) * 0.12;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    function handleResize() {
      const w = mount.clientWidth || 300;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      vBarGeo.dispose();
      hBarGeo.dispose();
      wineMat.dispose();
      blueMat.dispose();
      renderer.dispose();
    };
  }, [height]);

  return <div ref={mountRef} style={{ width: '100%', height, maxWidth: 320, margin: '0 auto' }} />;
}
