import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLOR_FINISHES } from './catalog.js';

// Reusable scratch objects to avoid GC pressure in render loop
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();

// Detect software WebGL (headless SwiftShader, llvmpipe, WARP)
export function detectSoftwareWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createProceduralTextures(maxAnisotropy) {
  // 1. Boucle / Woven Linen Texture
  const fabricCanvas = document.createElement('canvas');
  fabricCanvas.width = 256;
  fabricCanvas.height = 256;
  const fCtx = fabricCanvas.getContext('2d');
  fCtx.fillStyle = '#e8e4dc';
  fCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const n = Math.sin(x * 0.65) * Math.cos(y * 0.65) + (Math.random() - 0.5) * 0.8;
      const shade = Math.max(195, Math.min(250, Math.round(230 + n * 18)));
      fCtx.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 7})`;
      fCtx.fillRect(x, y, 2, 2);
    }
  }
  const fabricTex = new THREE.CanvasTexture(fabricCanvas);
  fabricTex.colorSpace = THREE.SRGBColorSpace;
  fabricTex.wrapS = THREE.RepeatWrapping;
  fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(4, 4);
  fabricTex.anisotropy = maxAnisotropy;

  // 2. Travertine Stone Veining Texture
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const sCtx = stoneCanvas.getContext('2d');
  sCtx.fillStyle = '#e5dccf';
  sCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const band = Math.sin(y * 0.11) * 8 + Math.cos(y * 0.29) * 5;
    const v = Math.max(190, Math.min(245, Math.round(224 + band)));
    sCtx.fillStyle = `rgb(${v}, ${v - 8}, ${v - 19})`;
    sCtx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 420; i++) {
    const rx = Math.random() * 256;
    const ry = Math.random() * 256;
    const rw = 4 + Math.random() * 22;
    sCtx.fillStyle = i % 2 === 0 ? 'rgba(155, 138, 118, 0.16)' : 'rgba(255, 252, 245, 0.18)';
    sCtx.fillRect(rx, ry, rw, 1.5);
  }
  const stoneTex = new THREE.CanvasTexture(stoneCanvas);
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.wrapS = THREE.RepeatWrapping;
  stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.repeat.set(2, 2);
  stoneTex.anisotropy = maxAnisotropy;

  // 3. Wood Grain Texture
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wCtx = woodCanvas.getContext('2d');
  wCtx.fillStyle = '#d4cabd';
  wCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x++) {
    const wave = Math.sin(x * 0.18) * 7 + Math.sin(x * 0.55) * 3;
    const tone = Math.max(178, Math.min(232, Math.round(210 + wave)));
    wCtx.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 14})`;
    wCtx.fillRect(x, 0, 1, 256);
  }
  const woodTex = new THREE.CanvasTexture(woodCanvas);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = THREE.RepeatWrapping;
  woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(2, 2);
  woodTex.anisotropy = maxAnisotropy;

  // 4. Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shCtx = shadowCanvas.getContext('2d');
  const grad = shCtx.createRadialGradient(128, 128, 12, 128, 128, 122);
  grad.addColorStop(0, 'rgba(12, 11, 10, 0.58)');
  grad.addColorStop(0.55, 'rgba(12, 11, 10, 0.22)');
  grad.addColorStop(1, 'rgba(12, 11, 10, 0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 256, 256);
  const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);

  return { fabricTex, stoneTex, woodTex, contactShadowTex };
}

function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function createFurnitureMaterials(colorId, textures) {
  const finish = COLOR_FINISHES[colorId] || COLOR_FINISHES.chiqarang;
  const isDark = colorId === 'qora';

  const upholstery = new THREE.MeshPhysicalMaterial({
    color: finish.primaryHex,
    map: textures.fabricTex,
    roughness: isDark ? 0.62 : 0.88,
    metalness: 0.02,
    sheen: isDark ? 0.25 : 0.65,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(finish.secondaryHex),
  });

  const secondaryFabric = new THREE.MeshPhysicalMaterial({
    color: finish.secondaryHex,
    map: textures.fabricTex,
    roughness: 0.84,
    metalness: 0.02,
    sheen: 0.5,
    sheenRoughness: 0.75,
  });

  const stone = new THREE.MeshStandardMaterial({
    color: isDark ? 0x2a2927 : finish.primaryHex,
    map: textures.stoneTex,
    roughness: 0.42,
    metalness: 0.05,
  });

  const wood = new THREE.MeshStandardMaterial({
    color: isDark ? 0x1e1d1b : finish.secondaryHex,
    map: textures.woodTex,
    roughness: 0.52,
    metalness: 0.04,
  });

  const frameMetal = new THREE.MeshStandardMaterial({
    color: finish.accentHex,
    roughness: 0.28,
    metalness: 0.85,
  });

  const brassAccent = new THREE.MeshStandardMaterial({
    color: isDark ? 0xc8b69e : 0x3b352e,
    roughness: 0.22,
    metalness: 0.9,
  });

  return { upholstery, secondaryFabric, stone, wood, frameMetal, brassAccent };
}

function registerPart(group, mesh, explodeX, explodeY, explodeZ) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.basePos = mesh.position.clone();
  mesh.userData.explodeOffset = new THREE.Vector3(explodeX, explodeY, explodeZ);
  group.add(mesh);
  return mesh;
}

function buildSofaModel(mats) {
  const group = new THREE.Group();

  // 1. Curved wrap-around backrest shell
  const arcShape = new THREE.Shape();
  const outerR = 1.48;
  const innerR = 1.18;
  const startA = Math.PI * 0.12;
  const endA = Math.PI * 0.88;
  arcShape.absarc(0, 0, outerR, startA, endA, false);
  arcShape.absarc(0, 0, innerR, endA, startA, true);
  arcShape.closePath();

  const backGeo = new THREE.ExtrudeGeometry(arcShape, {
    depth: 0.56,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 36,
  });
  backGeo.rotateX(-Math.PI / 2);
  const backMesh = new THREE.Mesh(backGeo, mats.upholstery);
  backMesh.position.set(0, 0.24, 0.72);
  backMesh.scale.set(1.06, 1, 0.62);
  registerPart(group, backMesh, 0, 0.34, -0.36);

  // 2. Main contoured seat cushion
  const seatShape = createRoundedRectShape(2.26, 0.9, 0.26);
  const seatGeo = new THREE.ExtrudeGeometry(seatShape, {
    depth: 0.19,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 24,
  });
  seatGeo.rotateX(-Math.PI / 2);
  const seatMesh = new THREE.Mesh(seatGeo, mats.upholstery);
  seatMesh.position.set(0, 0.34, 0.14);
  registerPart(group, seatMesh, 0, 0.24, 0.18);

  // 3. Lower upholstered chassis apron
  const baseShape = createRoundedRectShape(2.3, 0.92, 0.24);
  const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  baseGeo.rotateX(-Math.PI / 2);
  const baseMesh = new THREE.Mesh(baseGeo, mats.secondaryFabric);
  baseMesh.position.set(0, 0.18, 0.12);
  registerPart(group, baseMesh, 0, 0, 0);

  // 4 & 5. Bolster pillows
  const pillowGeo = new THREE.CapsuleGeometry(0.11, 0.26, 8, 18);
  const pillowLeft = new THREE.Mesh(pillowGeo, mats.secondaryFabric);
  pillowLeft.position.set(-0.92, 0.62, 0.06);
  pillowLeft.rotation.set(0.3, 0.2, 0.45);
  registerPart(group, pillowLeft, -0.45, 0.42, 0.16);

  const pillowRight = new THREE.Mesh(pillowGeo, mats.secondaryFabric);
  pillowRight.position.set(0.92, 0.62, 0.06);
  pillowRight.rotation.set(0.3, -0.2, -0.45);
  registerPart(group, pillowRight, 0.45, 0.42, 0.16);

  // 6. Central steel support rail
  const railGeo = new THREE.BoxGeometry(1.96, 0.035, 0.68);
  const railMesh = new THREE.Mesh(railGeo, mats.frameMetal);
  railMesh.position.set(0, 0.16, 0.1);
  registerPart(group, railMesh, 0, -0.14, 0);

  // 7. Five tapered legs + brass glides
  const legGeo = new THREE.CylinderGeometry(0.022, 0.015, 0.17, 16);
  const glideGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.018, 16);
  const legPositions = [
    [-0.95, 0.085, 0.42],
    [0.95, 0.085, 0.42],
    [-0.92, 0.085, -0.24],
    [0.92, 0.085, -0.24],
    [0, 0.085, -0.26],
  ];
  legPositions.forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, mats.frameMetal);
    leg.position.set(lx, ly, lz);
    registerPart(group, leg, lx * 0.22, -0.22, lz * 0.22);

    const glide = new THREE.Mesh(glideGeo, mats.brassAccent);
    glide.position.set(lx, 0.009, lz);
    registerPart(group, glide, lx * 0.22, -0.28, lz * 0.22);
  });

  return group;
}

function buildChairModel(mats) {
  const group = new THREE.Group();

  // 1 & 2. Left and Right Sculpted Architectural Arm Frames
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-0.4, 0);
  frameShape.lineTo(0.4, 0);
  frameShape.lineTo(0.36, 0.62);
  frameShape.lineTo(-0.34, 0.66);
  frameShape.closePath();

  const holePath = new THREE.Path();
  holePath.moveTo(-0.31, 0.07);
  holePath.lineTo(0.31, 0.07);
  holePath.lineTo(0.28, 0.55);
  holePath.lineTo(-0.27, 0.59);
  holePath.closePath();
  frameShape.holes.push(holePath);

  const armGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.014,
    bevelThickness: 0.014,
  });
  armGeo.rotateY(Math.PI / 2);

  const leftArm = new THREE.Mesh(armGeo, mats.wood);
  leftArm.position.set(-0.46, 0.015, 0);
  registerPart(group, leftArm, -0.35, 0, 0);

  const rightArm = new THREE.Mesh(armGeo, mats.wood);
  rightArm.position.set(0.4, 0.015, 0);
  registerPart(group, rightArm, 0.35, 0, 0);

  // 3 & 4. Crossbars
  const crossbarGeo = new THREE.BoxGeometry(0.84, 0.055, 0.06);
  const frontBar = new THREE.Mesh(crossbarGeo, mats.wood);
  frontBar.position.set(0, 0.27, 0.34);
  registerPart(group, frontBar, 0, -0.1, 0.18);

  const backBar = new THREE.Mesh(crossbarGeo, mats.wood);
  backBar.position.set(0, 0.22, -0.32);
  registerPart(group, backBar, 0, -0.1, -0.18);

  // 5. Thick beveled seat cushion
  const seatShape = createRoundedRectShape(0.76, 0.74, 0.09);
  const seatGeo = new THREE.ExtrudeGeometry(seatShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.032,
    bevelThickness: 0.032,
  });
  seatGeo.rotateX(-Math.PI / 2);
  const seatMesh = new THREE.Mesh(seatGeo, mats.upholstery);
  seatMesh.position.set(0, 0.3, 0.02);
  seatMesh.rotation.x = -0.06;
  registerPart(group, seatMesh, 0, 0.24, 0.14);

  // 6. Tilted ergonomic backrest cushion
  const backShape = createRoundedRectShape(0.74, 0.56, 0.09);
  const backGeo = new THREE.ExtrudeGeometry(backShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  const backMesh = new THREE.Mesh(backGeo, mats.upholstery);
  backMesh.position.set(0, 0.64, -0.29);
  backMesh.rotation.x = -0.24;
  registerPart(group, backMesh, 0, 0.35, -0.28);

  // 7. Brass accent pins on outer joinery
  const pinGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16);
  pinGeo.rotateZ(Math.PI / 2);
  [-0.47, 0.47].forEach((px) => {
    const pin = new THREE.Mesh(pinGeo, mats.brassAccent);
    pin.position.set(px, 0.57, 0.27);
    registerPart(group, pin, px * 0.75, 0, 0);
  });

  return group;
}

function buildTableModel(mats) {
  const group = new THREE.Group();

  // 1. Chamfered travertine tabletop slab
  const topShape = createRoundedRectShape(2.38, 1.08, 0.16);
  const topGeo = new THREE.ExtrudeGeometry(topShape, {
    depth: 0.065,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  topGeo.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(topGeo, mats.stone);
  topMesh.position.set(0, 0.74, 0);
  registerPart(group, topMesh, 0, 0.38, 0);

  // 2. Sculpted twin architectural pedestals (LatheGeometry)
  const lathePts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.31, 0.0),
    new THREE.Vector2(0.28, 0.14),
    new THREE.Vector2(0.18, 0.36),
    new THREE.Vector2(0.22, 0.56),
    new THREE.Vector2(0.26, 0.72),
    new THREE.Vector2(0.0, 0.72),
  ];
  const pedGeo = new THREE.LatheGeometry(lathePts, 36);
  pedGeo.scale(0.86, 1, 1.32);

  const pedLeft = new THREE.Mesh(pedGeo, mats.wood);
  pedLeft.position.set(-0.66, 0.01, 0);
  registerPart(group, pedLeft, -0.32, 0, 0);

  const pedRight = new THREE.Mesh(pedGeo, mats.wood);
  pedRight.position.set(0.66, 0.01, 0);
  registerPart(group, pedRight, 0.32, 0, 0);

  // 3. Recessed steel mounting plates & plinth rings
  const plateGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.018, 24);
  [-0.66, 0.66].forEach((px) => {
    const topPlate = new THREE.Mesh(plateGeo, mats.frameMetal);
    topPlate.position.set(px, 0.73, 0);
    registerPart(group, topPlate, px * 0.45, 0.18, 0);

    const floorRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.014, 32),
      mats.frameMetal
    );
    floorRing.scale.set(0.86, 1, 1.32);
    floorRing.position.set(px, 0.007, 0);
    registerPart(group, floorRing, px * 0.45, -0.14, 0);
  });

  // 4. Sculptural ceramic bowl & vase centerpiece for architectural scale
  const vasePts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.075, 0),
    new THREE.Vector2(0.095, 0.09),
    new THREE.Vector2(0.04, 0.22),
    new THREE.Vector2(0.048, 0.27),
    new THREE.Vector2(0, 0.27),
  ];
  const vase = new THREE.Mesh(new THREE.LatheGeometry(vasePts, 28), mats.secondaryFabric);
  vase.position.set(-0.08, 0.825, -0.04);
  registerPart(group, vase, -0.08, 0.56, 0);

  const bowlPts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.06, 0),
    new THREE.Vector2(0.11, 0.05),
    new THREE.Vector2(0.095, 0.055),
    new THREE.Vector2(0, 0.02),
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 28), mats.brassAccent);
  bowl.position.set(0.12, 0.825, 0.08);
  registerPart(group, bowl, 0.12, 0.56, 0);

  return group;
}

function buildCoffeeTableModel(mats) {
  const group = new THREE.Group();

  // 1. Upper circular beveled travertine disc
  const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.82, 0.055, 48), mats.stone);
  topDisc.position.set(0, 0.42, 0);
  registerPart(group, topDisc, 0, 0.34, 0);

  // 2. Lower floating shelf disc
  const lowerDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.036, 48), mats.wood);
  lowerDisc.position.set(0, 0.15, 0);
  registerPart(group, lowerDisc, 0, 0.08, 0);

  // 3. Three radial steel architectural fin legs at 120°
  const finShape = createRoundedRectShape(0.24, 0.41, 0.02);
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  finGeo.center();

  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const radius = 0.52;
    const fin = new THREE.Mesh(finGeo, mats.frameMetal);
    fin.position.set(Math.cos(angle) * radius, 0.21, Math.sin(angle) * radius);
    fin.rotation.y = -angle;
    registerPart(group, fin, Math.cos(angle) * 0.3, -0.14, Math.sin(angle) * 0.3);
  }

  // 4. Center brass collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 32), mats.brassAccent);
  collar.position.set(0, 0.38, 0);
  registerPart(group, collar, 0, 0.22, 0);

  // 5. Art book + stone orb on top
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.24), mats.secondaryFabric);
  book.position.set(-0.18, 0.465, 0.12);
  book.rotation.y = 0.28;
  registerPart(group, book, -0.18, 0.5, 0.12);

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 24), mats.brassAccent);
  orb.position.set(0.14, 0.51, -0.1);
  registerPart(group, orb, 0.14, 0.54, -0.1);

  return group;
}

function buildConsoleModel(mats) {
  const group = new THREE.Group();

  // 1. Main cabinet carcass
  const carcass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.44, 0.52), mats.wood);
  carcass.position.set(0, 0.42, 0);
  registerPart(group, carcass, 0, 0.06, 0);

  // 2. Top travertine / stone slab
  const slabShape = createRoundedRectShape(2.14, 0.54, 0.02);
  const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
    depth: 0.034,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  slabGeo.rotateX(-Math.PI / 2);
  const slab = new THREE.Mesh(slabGeo, mats.stone);
  slab.position.set(0, 0.655, 0);
  registerPart(group, slab, 0, 0.34, 0);

  // 3. Four fluted front door panels
  const doorWidth = 0.495;
  const ribGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.4, 10);
  const doorOffsets = [-0.77, -0.258, 0.258, 0.77];

  doorOffsets.forEach((dx, idx) => {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(dx, 0.42, 0.265);

    const backing = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, 0.41, 0.022), mats.wood);
    backing.castShadow = true;
    backing.receiveShadow = true;
    doorGroup.add(backing);

    // 7 vertical flutes per door
    for (let r = -3; r <= 3; r++) {
      const rib = new THREE.Mesh(ribGeo, mats.wood);
      rib.position.set(r * 0.064, 0, 0.012);
      rib.castShadow = true;
      rib.receiveShadow = true;
      doorGroup.add(rib);
    }

    // Minimalist handle pull
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.14, 0.022), mats.brassAccent);
    pull.position.set(idx % 2 === 0 ? 0.21 : -0.21, 0.04, 0.022);
    doorGroup.add(pull);

    doorGroup.userData.basePos = doorGroup.position.clone();
    doorGroup.userData.explodeOffset = new THREE.Vector3(dx * 0.15, 0.05, 0.36);
    group.add(doorGroup);
  });

  // 4. Lower steel plinth & 5 legs
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.032, 0.46), mats.frameMetal);
  plinth.position.set(0, 0.185, 0);
  registerPart(group, plinth, 0, -0.1, 0);

  const legGeo = new THREE.CylinderGeometry(0.02, 0.014, 0.17, 16);
  [
    [-0.94, 0.085, 0.19],
    [0.94, 0.085, 0.19],
    [-0.94, 0.085, -0.19],
    [0.94, 0.085, -0.19],
    [0, 0.085, 0],
  ].forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, mats.frameMetal);
    leg.position.set(lx, ly, lz);
    registerPart(group, leg, lx * 0.2, -0.24, lz * 0.2);
  });

  return group;
}

function buildBedModel(mats) {
  const group = new THREE.Group();

  // 1. Upholstered floating podium platform
  const podiumShape = createRoundedRectShape(2.08, 2.24, 0.08);
  const podiumGeo = new THREE.ExtrudeGeometry(podiumShape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  podiumGeo.rotateX(-Math.PI / 2);
  const podium = new THREE.Mesh(podiumGeo, mats.wood);
  podium.position.set(0, 0.12, 0.05);
  registerPart(group, podium, 0, -0.05, 0);

  // 2. Twin vertical-channel headboard panels
  const headShape = createRoundedRectShape(1.06, 0.96, 0.08);
  const headGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.026,
    bevelThickness: 0.026,
  });
  [-0.54, 0.54].forEach((hx) => {
    const panel = new THREE.Mesh(headGeo, mats.upholstery);
    panel.position.set(hx, 0.62, -1.02);
    registerPart(group, panel, hx * 0.25, 0.25, -0.35);
  });

  // 3. Plush mattress
  const matShape = createRoundedRectShape(1.82, 2.02, 0.1);
  const matGeo = new THREE.ExtrudeGeometry(matShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  matGeo.rotateX(-Math.PI / 2);
  const mattress = new THREE.Mesh(matGeo, mats.secondaryFabric);
  mattress.position.set(0, 0.34, 0.06);
  registerPart(group, mattress, 0, 0.24, 0);

  // 4. Draped duvet blanket over lower 2/3
  const duvetShape = createRoundedRectShape(1.88, 1.32, 0.12);
  const duvetGeo = new THREE.ExtrudeGeometry(duvetShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  duvetGeo.rotateX(-Math.PI / 2);
  const duvet = new THREE.Mesh(duvetGeo, mats.upholstery);
  duvet.position.set(0, 0.53, 0.42);
  registerPart(group, duvet, 0, 0.42, 0.14);

  // 5. Four sculpted sleeping & lumbar pillows
  const sleepPillowGeo = new THREE.CapsuleGeometry(0.11, 0.48, 8, 18);
  sleepPillowGeo.rotateZ(Math.PI / 2);
  [-0.44, 0.44].forEach((px) => {
    const pillow = new THREE.Mesh(sleepPillowGeo, mats.upholstery);
    pillow.position.set(px, 0.66, -0.68);
    pillow.rotation.x = 0.38;
    registerPart(group, pillow, px * 0.35, 0.54, -0.15);

    const lumbar = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 8, 16), mats.brassAccent);
    lumbar.rotation.z = Math.PI / 2;
    lumbar.position.set(px, 0.65, -0.45);
    lumbar.rotation.x = 0.25;
    registerPart(group, lumbar, px * 0.35, 0.62, 0.05);
  });

  // 6. Four recessed steel feet
  const footGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.11, 16);
  [
    [-0.86, 0.055, 0.96],
    [0.86, 0.055, 0.96],
    [-0.86, 0.055, -0.88],
    [0.86, 0.055, -0.88],
  ].forEach(([fx, fy, fz]) => {
    const foot = new THREE.Mesh(footGeo, mats.frameMetal);
    foot.position.set(fx, fy, fz);
    registerPart(group, foot, fx * 0.15, -0.22, fz * 0.15);
  });

  return group;
}

function buildModelByType(modelType, colorId, textures) {
  const mats = createFurnitureMaterials(colorId, textures);
  switch (modelType) {
    case 'chair':
      return buildChairModel(mats);
    case 'table':
      return buildTableModel(mats);
    case 'coffee_table':
      return buildCoffeeTableModel(mats);
    case 'console':
      return buildConsoleModel(mats);
    case 'bed':
      return buildBedModel(mats);
    case 'sofa':
    default:
      return buildSofaModel(mats);
  }
}

const CAMERA_PRESETS = {
  iso: new THREE.Vector3(2.85, 1.85, 3.15),
  front: new THREE.Vector3(0, 1.15, 3.7),
  side: new THREE.Vector3(3.65, 1.15, 0.15),
  back: new THREE.Vector3(-0.3, 1.25, -3.7),
  top: new THREE.Vector3(0.01, 4.15, 0.55),
};

export class FurnitureViewport {
  constructor(container, options = {}) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.currentModelType = options.modelType || 'sofa';
    this.currentColorId = options.colorId || 'chiqarang';
    this.autoRotate = options.autoRotate !== undefined ? options.autoRotate : !this.isSoftwareGl && !this.prefersReducedMotion;
    this.explodeTarget = 0;
    this.explodeCurrent = 0;

    this.targetCamPos = CAMERA_PRESETS.iso.clone();
    this.isAnimatingCamera = false;

    this.disposed = false;
    this.frameId = 0;
    this.renderBusy = false;
    this.renderDirty = false;
    this.lastTimestamp = performance.now();

    this._initScene();
    this._bindEvents();
    this.setProduct(this.currentModelType, this.currentColorId);
    this.startLoop();
  }

  _initScene() {
    const width = Math.max(200, this.container.clientWidth || 640);
    const height = Math.max(200, this.container.clientHeight || 480);

    this.scene = new THREE.Scene();
    const bgHex = 0x1b1a18;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.045);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    this.camera.position.copy(CAMERA_PRESETS.iso);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Studio Environment Map (PMREM)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmremGenerator.dispose();

    const maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 1);
    this.textures = createProceduralTextures(maxAnisotropy);

    // Three-point warm/cool Studio Lighting
    const hemi = new THREE.HemisphereLight(0xebeef2, 0x6f6152, 0.9);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.05);
    keyLight.position.set(3.8, 5.4, 3.6);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16;
    const d = 3.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xeae2d6, 1.15);
    rimLight.position.set(-3.8, 3.2, -3.4);
    this.scene.add(rimLight);

    // Studio Gallery Floor Disc & Contact Shadow
    const floorGeo = new THREE.CircleGeometry(7.5, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x22201d,
      roughness: 0.88,
      metalness: 0.06,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const shadowPlaneGeo = new THREE.PlaneGeometry(3.4, 3.4);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: this.textures.contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.82,
    });
    this.contactShadow = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    this.contactShadow.position.y = 0.004;
    this.scene.add(this.contactShadow);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 0.45, 0);
    this.controls.minDistance = 1.65;
    this.controls.maxDistance = 6.2;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minPolarAngle = 0.14;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 1.15;

    this.controls.addEventListener('start', () => {
      this.isAnimatingCamera = false;
    });
    this.controls.addEventListener('change', () => {
      if (this.isSoftwareGl || !this.autoRotate) {
        this.requestRender();
      }
    });
  }

  _bindEvents() {
    this._onResize = () => {
      if (this.disposed) return;
      const width = Math.max(200, this.container.clientWidth || 640);
      const height = Math.max(200, this.container.clientHeight || 480);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.requestRender();
    };

    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(this.container);

    this._onContextLost = (e) => {
      e.preventDefault();
      this.stopLoop();
    };
    this._onContextRestored = () => {
      this.startLoop();
      this.requestRender();
    };

    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored);
  }

  setProduct(modelType, colorId) {
    this.currentModelType = modelType;
    this.currentColorId = colorId;

    if (this.furnitureGroup) {
      this._disposeGroup(this.furnitureGroup);
      this.scene.remove(this.furnitureGroup);
    }

    this.furnitureGroup = buildModelByType(modelType, colorId, this.textures);
    this.scene.add(this.furnitureGroup);
    this._applyExplode(this.explodeCurrent);
    this.requestRender();
  }

  setCameraPreset(presetName) {
    const preset = CAMERA_PRESETS[presetName];
    if (!preset) return;
    this.targetCamPos.copy(preset);
    this.isAnimatingCamera = true;
    this.requestRender();
  }

  setExplode(amount) {
    this.explodeTarget = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
    this.requestRender();
  }

  setAutoRotate(enabled) {
    this.autoRotate = Boolean(enabled) && !this.prefersReducedMotion;
    this.controls.autoRotate = this.autoRotate && !this.isSoftwareGl;
    if (this.autoRotate) {
      this.startLoop();
    }
    this.requestRender();
  }

  captureProductSnapshot(modelType, colorId) {
    const prevType = this.currentModelType;
    const prevColor = this.currentColorId;
    const prevCam = this.camera.position.clone();
    const prevTarget = this.controls.target.clone();
    const prevExplode = this.explodeCurrent;
    const prevBg = this.scene.background.getHex();
    const prevFog = this.scene.fog ? this.scene.fog.color.getHex() : null;

    this.scene.background.setHex(0xeae3d7);
    if (this.scene.fog) this.scene.fog.color.setHex(0xeae3d7);
    this.setProduct(modelType, colorId);
    this._applyExplode(0);
    this.camera.position.copy(CAMERA_PRESETS.iso);
    this.controls.target.set(0, 0.44, 0);
    this.camera.lookAt(this.controls.target);
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/jpeg', 0.88);

    // Restore active studio state
    this.scene.background.setHex(prevBg);
    if (this.scene.fog && prevFog !== null) this.scene.fog.color.setHex(prevFog);
    this.setProduct(prevType, prevColor);
    this._applyExplode(prevExplode);
    this.camera.position.copy(prevCam);
    this.controls.target.copy(prevTarget);
    this.camera.lookAt(this.controls.target);
    this.renderer.render(this.scene, this.camera);
    return dataUrl;
  }

  _applyExplode(factor) {
    if (!this.furnitureGroup) return;
    this.furnitureGroup.children.forEach((child) => {
      if (child.userData.basePos && child.userData.explodeOffset) {
        _vecA.copy(child.userData.basePos);
        _vecB.copy(child.userData.explodeOffset).multiplyScalar(factor);
        child.position.copy(_vecA).add(_vecB);
      }
    });
  }

  _disposeGroup(group) {
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  }

  _afterDraw(cb) {
    try {
      const gl = this.renderer.getContext();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } catch {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  _stepScene(delta) {
    let needsMore = false;

    if (Math.abs(this.explodeCurrent - this.explodeTarget) > 0.002) {
      this.explodeCurrent = THREE.MathUtils.damp(this.explodeCurrent, this.explodeTarget, 8, delta);
      this._applyExplode(this.explodeCurrent);
      needsMore = true;
    } else if (this.explodeCurrent !== this.explodeTarget) {
      this.explodeCurrent = this.explodeTarget;
      this._applyExplode(this.explodeCurrent);
    }

    if (this.isAnimatingCamera) {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.targetCamPos.x, 7, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.targetCamPos.y, 7, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.targetCamPos.z, 7, delta);
      if (this.camera.position.distanceTo(this.targetCamPos) < 0.025) {
        this.camera.position.copy(this.targetCamPos);
        this.isAnimatingCamera = false;
      } else {
        needsMore = true;
      }
    }

    this.controls.update();
    return needsMore;
  }

  requestRender() {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame((now) => {
      if (this.disposed) return;
      this.renderDirty = false;
      const delta = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;

      const needsMore = this._stepScene(delta);
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty || needsMore || (this.autoRotate && !this.isSoftwareGl)) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this._afterDraw(done);
      } else {
        done();
      }
    });
  }

  startLoop() {
    this.lastTimestamp = performance.now();
    this.requestRender();
  }

  stopLoop() {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  }

  dispose() {
    this.disposed = true;
    this.stopLoop();
    this._resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);

    if (this.furnitureGroup) {
      this._disposeGroup(this.furnitureGroup);
    }
    Object.values(this.textures || {}).forEach((t) => t?.dispose());
    this.envRT?.dispose();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.container.innerHTML = '';
  }
}
