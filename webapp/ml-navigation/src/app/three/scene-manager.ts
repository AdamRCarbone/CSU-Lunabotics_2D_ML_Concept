import * as THREE from 'three';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;

  // Environment dimensions
  private environmentWidth: number;
  private environmentHeight: number;

  // Groups for organizing objects
  private environmentGroup: THREE.Group;
  private roverGroup: THREE.Group;
  private obstaclesGroup: THREE.Group;
  private zonesGroup: THREE.Group;

  constructor(
    container: HTMLElement,
    width: number,
    height: number,
    pixelWidth: number,
    pixelHeight: number
  ) {
    this.environmentWidth = width;
    this.environmentHeight = height;

    // Initialize Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdcdcdc); // Light gray background

    // Set up orthographic camera for 2D top-down view
    const aspect = pixelWidth / pixelHeight;
    const frustumSize = height;

    this.camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2, // left
      frustumSize * aspect / 2,  // right
      frustumSize / 2,           // top
      -frustumSize / 2,          // bottom
      0.1,                       // near
      1000                       // far
    );

    // Position camera for top-down view
    this.camera.position.set(width / 2, height / 2, 10);
    this.camera.lookAt(width / 2, height / 2, 0);

    // Set up renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(pixelWidth, pixelHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Initialize groups
    this.environmentGroup = new THREE.Group();
    this.roverGroup = new THREE.Group();
    this.obstaclesGroup = new THREE.Group();
    this.zonesGroup = new THREE.Group();

    this.scene.add(this.environmentGroup);
    this.scene.add(this.zonesGroup);
    this.scene.add(this.obstaclesGroup);
    this.scene.add(this.roverGroup);

    // Add ambient light for 2D cartoony look
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    // Create environment boundary
    this.createEnvironmentBoundary();
  }

  private createEnvironmentBoundary() {
    // Create a rounded rectangle for the environment boundary
    const shape = new THREE.Shape();
    const radius = this.environmentHeight / 50; // Border radius
    const x = 0;
    const y = 0;
    const width = this.environmentWidth;
    const height = this.environmentHeight;

    // Draw rounded rectangle
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);

    // Create geometry and mesh for filled area
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color: 0xdcdcdc,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.environmentGroup.add(mesh);

    // Create border
    const borderGeometry = new THREE.BufferGeometry().setFromPoints(shape.getPoints());
    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0x969696,
      linewidth: 3
    });
    const border = new THREE.Line(borderGeometry, borderMaterial);
    border.position.z = 0.01; // Slightly above the fill
    this.environmentGroup.add(border);
  }

  // Create rover as a group of shapes with optional bounding box offset
  createRover(x: number, y: number, width: number, height: number, rotation: number = 0,
              boundingWidth: number = 0, boundingHeight: number = 0,
              boundingOffsetX: number = 0, boundingOffsetY: number = 0): THREE.Group {
    const rover = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.PlaneGeometry(width, height);
    const bodyMaterial = new THREE.MeshBasicMaterial({
      color: 0x646464 // Dark gray
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    rover.add(body);

    // Wheels (6 wheels like in the p5 version)
    const wheelWidth = width / 4;
    const wheelHeight = height / 4;
    const wheelGeometry = new THREE.PlaneGeometry(wheelWidth, wheelHeight);
    const wheelMaterial = new THREE.MeshBasicMaterial({
      color: 0x191919 // Almost black
    });

    // Wheel positions relative to body center
    const wheelPositions = [
      { x: -width * 0.375, y: -height * 0.25 },  // Front left
      { x: -width * 0.375, y: 0 },               // Middle left
      { x: -width * 0.375, y: height * 0.25 },   // Back left
      { x: width * 0.375, y: -height * 0.25 },   // Front right
      { x: width * 0.375, y: 0 },                // Middle right
      { x: width * 0.375, y: height * 0.25 }     // Back right
    ];

    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos.x, pos.y, 0.01);
      rover.add(wheel);
    });

    // Bucket (front scoop)
    const bucketWidth = width * 1.375;
    const bucketHeight = height / 5;
    const bucketGeometry = new THREE.PlaneGeometry(bucketWidth, bucketHeight);
    const bucketMaterial = new THREE.MeshBasicMaterial({
      color: 0x969696 // Light gray
    });
    const bucket = new THREE.Mesh(bucketGeometry, bucketMaterial);
    bucket.position.set(0, -height * 0.4, 0.01);
    rover.add(bucket);

    // Bucket arms
    const armWidth = bucketHeight / 2.5;
    const armHeight = bucketHeight * 1.5;
    const armGeometry = new THREE.PlaneGeometry(armWidth, armHeight);

    const leftArm = new THREE.Mesh(armGeometry, bucketMaterial);
    leftArm.position.set(-bucketWidth / 5, -height * 0.35, 0.01);
    rover.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, bucketMaterial);
    rightArm.position.set(bucketWidth / 5, -height * 0.35, 0.01);
    rover.add(rightArm);

    // Add bounding box visualization if dimensions provided
    if (boundingWidth > 0 && boundingHeight > 0) {
      const boxGeometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        -boundingWidth/2, -boundingHeight/2, 0.02,
        boundingWidth/2, -boundingHeight/2, 0.02,
        boundingWidth/2, boundingHeight/2, 0.02,
        -boundingWidth/2, boundingHeight/2, 0.02,
        -boundingWidth/2, -boundingHeight/2, 0.02
      ]);
      boxGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

      const boxMaterial = new THREE.LineBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 1.0
      });
      const boundingBox = new THREE.Line(boxGeometry, boxMaterial);
      boundingBox.name = 'boundingBox';
      boundingBox.position.set(boundingOffsetX, boundingOffsetY, 0.02);
      rover.add(boundingBox);
    }

    // Set position and rotation
    rover.position.set(x, y, 0.1);
    rover.rotation.z = rotation;

    this.roverGroup.add(rover);
    return rover;
  }

  // Create an obstacle (rock or crater)
  createObstacle(x: number, y: number, radius: number, type: 'rock' | 'crater'): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(radius, 32);
    const color = type === 'rock' ? 0x8B7355 : 0x696969; // Brown for rocks, gray for craters
    const material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide
    });
    const obstacle = new THREE.Mesh(geometry, material);
    obstacle.position.set(x, y, 0.05);

    this.obstaclesGroup.add(obstacle);
    return obstacle;
  }

  // Create a zone (rectangular area)
  createZone(x: number, y: number, width: number, height: number, color: number, opacity: number = 0.3): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide
    });
    const zone = new THREE.Mesh(geometry, material);
    zone.position.set(x + width/2, y + height/2, 0.02);

    this.zonesGroup.add(zone);
    return zone;
  }

  // Create column post
  createColumnPost(x: number, y: number, width: number, height: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      color: 0x808080,
      side: THREE.DoubleSide
    });
    const post = new THREE.Mesh(geometry, material);
    post.position.set(x, y, 0.05);

    this.obstaclesGroup.add(post);
    return post;
  }

  // Update camera for window resizing
  updateCamera(pixelWidth: number, pixelHeight: number, envWidth: number, envHeight: number) {
    const aspect = pixelWidth / pixelHeight;
    const frustumSize = envHeight;

    this.camera.left = -frustumSize * aspect / 2;
    this.camera.right = frustumSize * aspect / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;

    this.camera.position.set(envWidth / 2, envHeight / 2, 10);
    this.camera.lookAt(envWidth / 2, envHeight / 2, 0);

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(pixelWidth, pixelHeight);
  }

  // Render the scene
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Start animation loop
  animate(callback?: () => void) {
    const animateLoop = () => {
      this.animationFrameId = requestAnimationFrame(animateLoop);

      if (callback) {
        callback();
      }

      this.render();
    };
    animateLoop();
  }

  // Stop animation loop
  stopAnimation() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Clean up resources
  dispose() {
    this.stopAnimation();

    // Dispose of geometries and materials
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // Getters for groups
  getRoverGroup(): THREE.Group {
    return this.roverGroup;
  }

  getObstaclesGroup(): THREE.Group {
    return this.obstaclesGroup;
  }

  getZonesGroup(): THREE.Group {
    return this.zonesGroup;
  }

  getEnvironmentGroup(): THREE.Group {
    return this.environmentGroup;
  }
}