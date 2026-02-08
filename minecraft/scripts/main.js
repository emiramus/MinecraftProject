import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from './world';
import { Player } from './player';
import { Physics } from './physics.js';
import { createUI } from './ui.js';
import { blocks } from './blocks';
import { ModelLoader } from './modelLoader';

const stats = new Stats();
document.body.append(stats.dom);

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x80a0e0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const orbitCamera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight
);
orbitCamera.position.set(-20, 20, -20);
orbitCamera.layers.enable(1);

const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.target.set(16, 16, 16);
controls.update();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x80a0e0, 500, 1000);

const world = new World();
world.generate();
scene.add(world);

const player = new Player(scene);
const physics = new Physics(scene);

const modelLoader = new ModelLoader();
modelLoader.loadModels((models) => {
  player.tool.setMesh(models.pickaxe);
});

const sun = new THREE.DirectionalLight();

function setupLights() {
  sun.intensity = 3;
  sun.position.set(20, 20, 20);
  sun.castShadow = true;

  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0005;
  sun.shadow.mapSize = new THREE.Vector2(2048, 2048);

  scene.add(sun);
  scene.add(sun.target);

  const shadowHelper = new THREE.CameraHelper(sun.shadow.camera);
  scene.add(shadowHelper);

  const ambient = new THREE.AmbientLight();
  ambient.intensity = 0.1;
  scene.add(ambient);
}

function onMouseDown() {
  if (player.controls.isLocked && player.selectedCoords) {
    if (player.activeBlockId === blocks.empty.id) {
      world.removeBlock(
        player.selectedCoords.x,
        player.selectedCoords.y,
        player.selectedCoords.z
      );
      player.tool.startAnimation();
    } else {
      world.addBlock(
        player.selectedCoords.x,
        player.selectedCoords.y,
        player.selectedCoords.z,
        player.activeBlockId
      );
    }
  }
}

document.addEventListener('mousedown', onMouseDown);

let previousTime = performance.now();

function animate() {
  const currentTime = performance.now();
  const dt = (currentTime - previousTime) / 1000;

  requestAnimationFrame(animate);

  if (player.controls.isLocked) {
    player.update(world);
    physics.update(dt, player, world);
    world.update(player);

    sun.position.copy(player.position);
    sun.position.sub(new THREE.Vector3(-50, -50, -50));
    sun.target.position.copy(player.position);
  }

  renderer.render(
    scene,
    player.controls.isLocked ? player.camera : orbitCamera
  );

  stats.update();
  previousTime = currentTime;
}

window.addEventListener('resize', () => {
  orbitCamera.aspect = window.innerWidth / window.innerHeight;
  orbitCamera.updateProjectionMatrix();

  player.camera.aspect = window.innerWidth / window.innerHeight;
  player.camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

setupLights();
createUI(scene, world, player);
animate();
