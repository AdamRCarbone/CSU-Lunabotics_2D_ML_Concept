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
    // Camera looks at origin, so we set bounds to match environment size
    this.camera = new THREE.OrthographicCamera(
      0,              // left
      width,          // right
      height,         // top
      0,              // bottom
      -10,            // near
      10              // far
    );

    // Position camera looking down at the scene
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

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

  // Helper to create rounded rectangle shape
  private createRoundedRectShape(x: number, y: number, width: number, height: number, radius: number): THREE.Shape {
    const shape = new THREE.Shape();

    // Start from bottom-left corner + radius
    shape.moveTo(x + radius, y);
    // Bottom edge
    shape.lineTo(x + width - radius, y);
    // Bottom-right corner
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    // Right edge
    shape.lineTo(x + width, y + height - radius);
    // Top-right corner
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    // Top edge
    shape.lineTo(x + radius, y + height);
    // Top-left corner
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    // Left edge
    shape.lineTo(x, y + radius);
    // Bottom-left corner
    shape.quadraticCurveTo(x, y, x + radius, y);

    return shape;
  }

  private createEnvironmentBoundary() {
    const radius = this.environmentHeight / 50; // Border radius
    const strokeWeight = this.environmentHeight / 100;

    // Create border (stroke)
    const borderShape = this.createRoundedRectShape(0, 0, this.environmentWidth, this.environmentHeight, radius);
    const borderGeometry = new THREE.ShapeGeometry(borderShape);
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0x969696,
      side: THREE.DoubleSide
    });
    const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
    borderMesh.position.z = 0.01;
    this.environmentGroup.add(borderMesh);

    // Create inner fill (slightly smaller to show border)
    const innerShape = this.createRoundedRectShape(
      strokeWeight,
      strokeWeight,
      this.environmentWidth - strokeWeight * 2,
      this.environmentHeight - strokeWeight * 2,
      radius - strokeWeight
    );
    const innerGeometry = new THREE.ShapeGeometry(innerShape);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xdcdcdc,
      side: THREE.DoubleSide
    });
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    innerMesh.position.z = 0.02;
    this.environmentGroup.add(innerMesh);
  }

  // Create rover as a group of shapes with optional bounding box offset
  createRover(x: number, y: number, width: number, height: number, rotation: number = 0,
              boundingWidth: number = 0, boundingHeight: number = 0,
              boundingOffsetX: number = 0, boundingOffsetY: number = 0): THREE.Group {
    const rover = new THREE.Group();

    const radius = height / 10; // Small radius for rover parts

    // Main body with rounded corners
    const bodyShape = this.createRoundedRectShape(-width/2, -height/2, width, height, radius);
    const bodyGeometry = new THREE.ShapeGeometry(bodyShape);
    const bodyMaterial = new THREE.MeshBasicMaterial({
      color: 0x646464 // Dark gray
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    rover.add(body);

    // Wheels (6 wheels like in the p5 version)
    const wheelWidth = width / 4;
    const wheelHeight = height / 4;
    const wheelRadius = radius / 2;

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
      const wheelShape = this.createRoundedRectShape(
        -wheelWidth/2,
        -wheelHeight/2,
        wheelWidth,
        wheelHeight,
        wheelRadius
      );
      const wheelGeometry = new THREE.ShapeGeometry(wheelShape);
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos.x, pos.y, 0.01);
      rover.add(wheel);
    });

    // Bucket (front scoop) - with different radius for top and bottom
    const bucketWidth = width * 1.375;
    const bucketHeight = height / 5;
    const bucketTopRadius = radius / 4;
    const bucketBottomRadius = radius * 1.5;

    // Custom shape for bucket with different corner radii
    const bucketShape = new THREE.Shape();
    bucketShape.moveTo(-bucketWidth/2 + bucketBottomRadius, -bucketHeight/2);
    bucketShape.lineTo(bucketWidth/2 - bucketBottomRadius, -bucketHeight/2);
    bucketShape.quadraticCurveTo(bucketWidth/2, -bucketHeight/2, bucketWidth/2, -bucketHeight/2 + bucketBottomRadius);
    bucketShape.lineTo(bucketWidth/2, bucketHeight/2 - bucketTopRadius);
    bucketShape.quadraticCurveTo(bucketWidth/2, bucketHeight/2, bucketWidth/2 - bucketTopRadius, bucketHeight/2);
    bucketShape.lineTo(-bucketWidth/2 + bucketTopRadius, bucketHeight/2);
    bucketShape.quadraticCurveTo(-bucketWidth/2, bucketHeight/2, -bucketWidth/2, bucketHeight/2 - bucketTopRadius);
    bucketShape.lineTo(-bucketWidth/2, -bucketHeight/2 + bucketBottomRadius);
    bucketShape.quadraticCurveTo(-bucketWidth/2, -bucketHeight/2, -bucketWidth/2 + bucketBottomRadius, -bucketHeight/2);

    const bucketGeometry = new THREE.ShapeGeometry(bucketShape);
    const bucketMaterial = new THREE.MeshBasicMaterial({
      color: 0x969696 // Light gray
    });
    const bucket = new THREE.Mesh(bucketGeometry, bucketMaterial);
    bucket.position.set(0, -height * 0.4, 0.01);
    rover.add(bucket);

    // Bucket arms
    const armWidth = bucketHeight / 2.5;
    const armHeight = bucketHeight * 1.5;

    const leftArmShape = this.createRoundedRectShape(-armWidth/2, -armHeight/2, armWidth, armHeight, radius/2);
    const leftArmGeometry = new THREE.ShapeGeometry(leftArmShape);
    const leftArm = new THREE.Mesh(leftArmGeometry, bucketMaterial);
    leftArm.position.set(-bucketWidth / 5, -height * 0.35, 0.01);
    rover.add(leftArm);

    const rightArmShape = this.createRoundedRectShape(-armWidth/2, -armHeight/2, armWidth, armHeight, radius/2);
    const rightArmGeometry = new THREE.ShapeGeometry(rightArmShape);
    const rightArm = new THREE.Mesh(rightArmGeometry, bucketMaterial);
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

  // Create a zone (rectangular area with rounded corners)
  createZone(x: number, y: number, width: number, height: number, color: number, opacity: number = 0.3): THREE.Mesh {
    const radius = this.environmentHeight / 50; // Same radius as environment border
    const shape = this.createRoundedRectShape(0, 0, width, height, radius);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide
    });
    const zone = new THREE.Mesh(geometry, material);
    zone.position.set(x, y, 0.02);

    this.zonesGroup.add(zone);
    return zone;
  }

  // Create column post with rounded corners
  createColumnPost(x: number, y: number, width: number, height: number): THREE.Mesh {
    const radius = this.environmentHeight / 100; // Smaller radius for column
    const shape = this.createRoundedRectShape(-width/2, -height/2, width, height, radius);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, // White like in p5 version
      side: THREE.DoubleSide
    });
    const post = new THREE.Mesh(geometry, material);
    post.position.set(x, y, 0.05);

    this.obstaclesGroup.add(post);
    return post;
  }

  // Update camera for window resizing
  updateCamera(pixelWidth: number, pixelHeight: number, envWidth: number, envHeight: number) {
    this.environmentWidth = envWidth;
    this.environmentHeight = envHeight;

    this.camera.left = 0;
    this.camera.right = envWidth;
    this.camera.top = envHeight;
    this.camera.bottom = 0;

    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

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