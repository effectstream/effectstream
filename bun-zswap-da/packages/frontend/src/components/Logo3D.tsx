import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const Logo3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const width = 80;
    const height = 80;

    const scene = new THREE.Scene();
    scene.background = null;

    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 2.5);
    frontLight.position.set(0, 0, 20);
    scene.add(frontLight);

    const frontLight2 = new THREE.DirectionalLight(0xffffff, 2.5);
    frontLight2.position.set(0, 0, -20);
    scene.add(frontLight2);

    const topFrontLight = new THREE.PointLight(0xffffff, 1.0);
    topFrontLight.position.set(0, 10, 10);
    scene.add(topFrontLight);

    const rimLight = new THREE.PointLight(0xffffff, 1.2);
    rimLight.position.set(-10, -5, -10);
    scene.add(rimLight);

    const material = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.9,
      roughness: 0.15,
    });

    const logoGroup = new THREE.Group();

    const outerRadius = 3.6;
    const innerRadius = 3.1;
    const ringWidth = outerRadius - innerRadius;

    const ringShape = new THREE.Shape();
    ringShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
    ringShape.holes.push(holePath);

    const extrudeSettings = {
      depth: 0.8,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 8,
      curveSegments: 128
    };

    const ringGeo = new THREE.ExtrudeGeometry(ringShape, extrudeSettings);
    const ring = new THREE.Mesh(ringGeo, material);
    ring.position.z = -0.4;
    logoGroup.add(ring);

    const cubeSize = ringWidth * 1.5;
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    const g = (innerRadius - (2.5 * cubeSize)) / 3;
    const yPositions = [0, cubeSize + g, cubeSize * 2 + g * 2];

    for (let i = 0; i < 3; i++) {
      const cube = new THREE.Mesh(cubeGeo, material);
      cube.position.y = yPositions[i];
      cube.position.x = 0;
      logoGroup.add(cube);
    }

    logoGroup.rotation.x = Math.PI * 0.05;
    logoGroup.rotation.y = -Math.PI * 0.1;
    logoGroup.scale.set(0.9, 0.9, 0.9);

    scene.add(logoGroup);

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let animationFrameId: number;

    const updateRotation = (currentX: number, currentY: number) => {
      const deltaMove = {
        x: currentX - previousMousePosition.x,
        y: currentY - previousMousePosition.y
      };
      const deltaRotationQuaternion = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(
          (deltaMove.y * 0.4) * (Math.PI / 180),
          (deltaMove.x * 0.4) * (Math.PI / 180),
          0,
          'XYZ'
        ));
      logoGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, logoGroup.quaternion);
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      updateRotation(e.clientX, e.clientY);
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onTouchStart = (e: TouchEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = () => { isDragging = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      updateRotation(e.touches[0].clientX, e.touches[0].clientY);
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      e.preventDefault();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    container.style.cursor = 'grab';
    container.addEventListener('mousedown', () => container.style.cursor = 'grabbing');
    window.addEventListener('mouseup', () => container.style.cursor = 'grab');

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isDragging) {
        logoGroup.rotation.y += 0.005;
      }
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchmove', onTouchMove);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      
      // Dispose geometry and materials
      ringGeo.dispose();
      cubeGeo.dispose();
      material.dispose();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      style={{ width: '80px', height: '80px', flexShrink: 0, position: 'relative', zIndex: 10 }}
    />
  );
};
