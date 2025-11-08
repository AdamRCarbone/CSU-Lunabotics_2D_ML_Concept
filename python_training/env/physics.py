"""
Simplified 2D physics engine for the Lunabotics rover simulation.
Replaces Matter.js with lightweight NumPy-based physics.
"""

import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class Vec2:
    """2D vector helper"""
    x: float
    y: float

    def __add__(self, other):
        return Vec2(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Vec2(self.x - other.x, self.y - other.y)

    def __mul__(self, scalar):
        return Vec2(self.x * scalar, self.y * scalar)

    def magnitude(self) -> float:
        return np.sqrt(self.x**2 + self.y**2)

    def normalize(self) -> 'Vec2':
        mag = self.magnitude()
        if mag == 0:
            return Vec2(0, 0)
        return Vec2(self.x / mag, self.y / mag)

    def to_array(self) -> np.ndarray:
        return np.array([self.x, self.y])


@dataclass
class RigidBody:
    """Simplified rigid body for 2D physics"""
    position: Vec2
    velocity: Vec2
    angle: float  # radians
    angular_velocity: float
    width: float
    height: float
    is_static: bool = False
    friction: float = 0.5
    restitution: float = 0.3  # bounciness

    def apply_force(self, force: Vec2, dt: float):
        """Apply force to body (simplified - no mass)"""
        if not self.is_static:
            # Simple Euler integration
            self.velocity = self.velocity + force * dt

    def apply_torque(self, torque: float, dt: float):
        """Apply rotational force"""
        if not self.is_static:
            self.angular_velocity += torque * dt

    def update(self, dt: float):
        """Update position based on velocity"""
        if not self.is_static:
            # Apply friction
            self.velocity = self.velocity * (1.0 - self.friction * dt)
            self.angular_velocity *= (1.0 - self.friction * dt)

            # Update position
            self.position = self.position + self.velocity * dt
            self.angle += self.angular_velocity * dt

            # Normalize angle to [-pi, pi]
            self.angle = np.arctan2(np.sin(self.angle), np.cos(self.angle))

    def get_corners(self) -> List[Vec2]:
        """Get the four corners of the rectangular body"""
        half_w = self.width / 2
        half_h = self.height / 2

        # Local corners (before rotation)
        local_corners = [
            Vec2(-half_w, -half_h),
            Vec2(half_w, -half_h),
            Vec2(half_w, half_h),
            Vec2(-half_w, half_h),
        ]

        # Rotate and translate to world coordinates
        cos_a = np.cos(self.angle)
        sin_a = np.sin(self.angle)

        world_corners = []
        for corner in local_corners:
            # Rotate
            rotated_x = corner.x * cos_a - corner.y * sin_a
            rotated_y = corner.x * sin_a + corner.y * cos_a
            # Translate
            world_corners.append(Vec2(
                rotated_x + self.position.x,
                rotated_y + self.position.y
            ))

        return world_corners


@dataclass
class Circle:
    """Circular object (obstacles, orbs)"""
    position: Vec2
    radius: float
    is_static: bool = True


class PhysicsEngine:
    """Simplified 2D physics engine"""

    def __init__(self, world_width: float, world_height: float):
        self.world_width = world_width
        self.world_height = world_height
        self.bodies: List[RigidBody] = []
        self.circles: List[Circle] = []

    def add_body(self, body: RigidBody):
        """Add a rigid body to the simulation"""
        self.bodies.append(body)

    def add_circle(self, circle: Circle):
        """Add a circle to the simulation"""
        self.circles.append(circle)

    def step(self, dt: float):
        """Advance physics simulation by dt seconds"""
        # Update all bodies
        for body in self.bodies:
            body.update(dt)

        # Check collisions
        self._check_collisions()

    def _check_collisions(self):
        """Check and resolve collisions"""
        for body in self.bodies:
            if body.is_static:
                continue

            # Wall collisions
            half_w = body.width / 2
            half_h = body.height / 2

            if body.position.x - half_w < 0:
                body.position.x = half_w
                body.velocity.x = -body.velocity.x * body.restitution
            elif body.position.x + half_w > self.world_width:
                body.position.x = self.world_width - half_w
                body.velocity.x = -body.velocity.x * body.restitution

            if body.position.y - half_h < 0:
                body.position.y = half_h
                body.velocity.y = -body.velocity.y * body.restitution
            elif body.position.y + half_h > self.world_height:
                body.position.y = self.world_height - half_h
                body.velocity.y = -body.velocity.y * body.restitution

            # Circle collisions (simplified)
            for circle in self.circles:
                if self._check_rect_circle_collision(body, circle):
                    # Push body away from circle
                    direction = (body.position - circle.position).normalize()
                    overlap = circle.radius + max(half_w, half_h) - (body.position - circle.position).magnitude()
                    if overlap > 0:
                        body.position = body.position + direction * overlap
                        # Reflect velocity
                        body.velocity = body.velocity * (-body.restitution)

    def _check_rect_circle_collision(self, rect: RigidBody, circle: Circle) -> bool:
        """Check if rectangle collides with circle (simplified)"""
        # Use AABB approximation for speed
        half_w = rect.width / 2
        half_h = rect.height / 2

        # Find closest point on rectangle to circle center
        closest_x = max(rect.position.x - half_w, min(circle.position.x, rect.position.x + half_w))
        closest_y = max(rect.position.y - half_h, min(circle.position.y, rect.position.y + half_h))

        # Calculate distance
        distance = np.sqrt((closest_x - circle.position.x)**2 + (closest_y - circle.position.y)**2)

        return distance < circle.radius

    def check_point_in_rect(self, point: Vec2, rect: RigidBody) -> bool:
        """Check if a point is inside a rectangle"""
        # Transform point to local coordinates
        relative = point - rect.position
        cos_a = np.cos(-rect.angle)
        sin_a = np.sin(-rect.angle)

        local_x = relative.x * cos_a - relative.y * sin_a
        local_y = relative.x * sin_a + relative.y * cos_a

        half_w = rect.width / 2
        half_h = rect.height / 2

        return abs(local_x) <= half_w and abs(local_y) <= half_h

    def get_circle_collisions(self, body: RigidBody) -> List[Circle]:
        """Get all circles colliding with a body"""
        collisions = []
        for circle in self.circles:
            if self._check_rect_circle_collision(body, circle):
                collisions.append(circle)
        return collisions
