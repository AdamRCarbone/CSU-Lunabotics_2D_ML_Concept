import random
import tkinter as tk
from shapes import Zone, Rover, Boulder, Crater
from styles import Sim


class Environment:
    def __init__(self, parent):
        # Canvas
        self.canvas = tk.Canvas(parent, width=688, height=500, bg=Sim.CANVAS_BG)
        self.canvas.pack()

        # State
        self.obstacles = []
        self.rover = None
        self.keys_pressed = []
        self.running = True

        # Setup
        self._create_zones()
        self.rover = Rover(self.canvas)
        self.reset_arena()

    # Arena zones
    def _create_zones(self):
        self.arena = Zone(self.canvas, (0, 5), (6.88, 0), Sim.ARENA)
        self.excavation_zone = Zone(self.canvas, (0, 5), (2.5, 0), Sim.EXCAVATION)
        self.obstacle_zone = Zone(self.canvas, (2.5, 5), (6.88, 0), Sim.OBSTACLE, Sim.OBSTACLE_OUTLINE)
        self.start_zone = Zone(self.canvas, (0, 2), (2, 0), Sim.START, Sim.START_OUTLINE)
        self.construction_zone = Zone(
            self.canvas, (4.58, .8), (4.58+1.7, .1), Sim.CONSTRUCTION, Sim.CONSTRUCTION_OUTLINE)
        self.column = Zone(self.canvas, (3.44-.25, 2.5-.25), (3.44+.25, 2.5+.25), Sim.COLUMN)

    # Key Stuff
    def on_key_press(self, event):
        if event.keysym not in self.keys_pressed:
            self.keys_pressed.append(event.keysym)

    def on_key_release(self, event):
        if event.keysym in self.keys_pressed:
            self.keys_pressed.remove(event.keysym)

    # Create obstacles without interference
    def create_obstacle(self, constructor):
        while True:
            obstacle = constructor(self.canvas)
            collision = False
            for o in self.obstacles:
                if obstacle.collides(o):
                    collision = True
                    break
            if (obstacle.collides(self.start_zone) or
                obstacle.collides(self.column) or
                obstacle.collides(self.construction_zone)):
                collision = True

            if collision:
                obstacle.delete()
            else:
                self.obstacles.append(obstacle)
                break

    def reset_arena(self):
        # Clear obstacles
        for o in self.obstacles:
            o.delete()
        self.obstacles = []

        # Create new obstacles
        for _ in range(random.randint(6, 12)):
            self.create_obstacle(Boulder)
        for _ in range(random.randint(3, 5)):
            self.create_obstacle(Crater)

        # Reset rover
        if self.rover:
            self.rover.delete()
        self.rover = Rover(self.canvas)

    def update(self):
        if not self.running:
            return

        # Key inputs
        for key in self.keys_pressed:
            if key == 'a':
                self.rover.torque_right(-5)
            elif key == 'q':
                self.rover.torque_right(5)
            elif key == 'd':
                self.rover.torque_left(5)
            elif key == 'e':
                self.rover.torque_left(-5)

        # Update physics
        self.rover.update()

        # Check for collision
        collision = False
        for o in self.obstacles:
            if self.rover.collides(o):
                collision = True
                break

        if not collision:
            if self.rover.collides(self.column):
                collision = True

        if collision:
            self.reset_arena()

    # Start sim
    def start(self):
        self.running = True

    # Stop sim
    def stop(self):
        self.running = False

    def toggle_pause(self):
        self.running = not self.running
        return self.running
