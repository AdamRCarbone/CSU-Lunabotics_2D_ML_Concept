from __future__ import annotations
from abc import ABC, abstractmethod
import math


class Shape(ABC):
    scale = 100

    def __init__(self, canvas, color, outline_color):
        self.color = color
        self.outline_color = outline_color
        self._canvas = canvas

    def arena_to_canvas(self, x, y):
        return (self.scale * x, self.scale * (5-y))

    def meters_to_pixels(self, val):
        return self.scale * val


class Rectangle(Shape):
    '''
    A class for a rectangle centered at point (x, y)
    the rectangle can be rotated by any amount
    '''

    def __init__(self, canvas, width, height, x, y, angle=0, color='white', outline_color='black', **kwargs):
        super().__init__(canvas, color, outline_color)
        print('here')

        # set class variables
        self._width = width
        self._height = height
        self._x = x
        self._y = y
        self._angle = angle

        self._obj = self._canvas.create_polygon(
            [0]*8,
            fill=self.color,
            outline=self.outline_color,
            width=3
        )
        self.calculate_corners()

    def calculate_corners(self):
        unrotated = [
            (-self._width/2, -self._height/2),
            (self._width/2, -self._height/2),
            (self._width/2, self._height/2),
            (-self._width/2, self._height/2),
        ]
        c = math.cos(math.radians(self._angle))
        s = math.sin(math.radians(self._angle))

        # apply rotation matrix
        rotated = [(x*c+y*s, -x*s+y*c) for x, y in unrotated]
        self.corners = [(x+self._x, y+self._y) for x, y in rotated]
        _corners = [self.arena_to_canvas(x, y) for x, y in self.corners]

        points_1d = [coord for point in _corners for coord in point]
        self._canvas.coords(
            self._obj,
            *points_1d
        )

    def set_pos(self, x=None, y=None, angle=None):
        if x:
            self._x = x
        if y:
            self._y = y
        if angle:
            self._angle = angle
        self.calculate_corners()

    def rotate_about(self, x, y, da):
        # move s and y to have the point as the origin
        tmp_x = self._x - x
        tmp_y = self._y - y

        # Apply rotation matrix
        c = math.cos(math.radians(da))
        s = math.sin(math.radians(da))
        rot_x = tmp_x * c + tmp_y * s
        rot_y = -tmp_x * s + tmp_y * c

        # Shift the coordinates back and update new angle
        self._x = rot_x + x
        self._y = rot_y + y
        self._angle += da


class Circle(Shape):
    def __init__(self, canvas, radius, x, y, color='white', outline_color='black'):
        super().__init__(canvas, color, outline_color)
        self._radius = radius
        self._x = x
        self._y = y
        self._obj = self._canvas.create_oval(
            self._x-self._radius,
            self._y-self._radius,
            self._x+self._radius,
            self._y+self._radius,
            fill=self.color,
            outline=self.outline_color,
            width=1
        )

    def set_x(self, x):
        self.move(x-self._x, 0)
        self._lock.acquire()
        self._x = x
        self._lock.release()

    def set_y(self, y):
        self.move(0, y-self._y)
        self._lock.acquire()
        self._y = y
        self._lock.release()

    def move(self, dx, dy):
        self._lock.acquire()
        self._canvas.move(self._obj, dx, dy)
        self._lock.release()


class PhysicsObject(ABC):
    def __init__(self, mass, **kwargs):
        super().__init__(**kwargs)
        self._mass = mass
        self._vx = 0
        self._vy = 0

    def force(self, mag, dir):
        fx = mag * math.cos(math.radians(dir))
        fy = mag * math.sin(math.radians(dir))

        self._vx += fx / self._mass
        self._vy += fy / self._mass
        if (r := abs(self._vx/20)) > 1:
            self._vx /= r
        if (r := abs(self._vy/20)) > 1:
            self._vy /= r


class PhysicsRectangle(PhysicsObject, Rectangle):
    def __init__(self, canvas, width, height, x, y, color, outline_color, mass):
        super().__init__(
            mass=mass,
            canvas=canvas,
            width=width,
            height=height,
            x=x,
            y=y,
            color=color,
            outline_color=outline_color
        )

        self._I_CM = mass * \
            (self._width/12 + self._height/12)
        # Apply parallel axis theorem
        self._I_Corner = self._I_CM + mass * \
            ((self._width/2)**2 + (self._height/2)**2)

        self._I_Edge = self._I_CM + mass * (self._width/2)**2

        self._angle = 0

        # tank drive means that the bot will rotate around the left side
        # when the right is driving and vice versa, so make vars for each
        self.omega_right = 0
        self.omega_left = 0

    def torque_right(self, t):
        self.omega_right += t / self._I_Edge

    def torque_left(self, t):
        self.omega_left += t / self._I_Edge

    def drag(self):
        self.omega_right -= self.omega_right * .2
        self.omega_left -= self.omega_left * .2

    def update(self):
        self.drag()
        tl, tr, br, bl = self.corners
        right_midpoint = ((tr[0]+br[0])/2, (tr[1]+br[1])/2)
        left_midpoint = ((tl[0]+bl[0])/2, (tl[1]+bl[1])/2)
        self.rotate_about(*right_midpoint, self.omega_right)
        self.rotate_about(*left_midpoint, self.omega_left)
        self._x += self._vx
        self._y += self._vy
        self.calculate_corners()


class MapObject(ABC):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.children: list[MapObject] = []

    def add(self, other: MapObject):
        self.children.append(other)


class Obstacle(MapObject):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Rover(PhysicsRectangle):
    def __init__(self, canvas):
        super().__init__(canvas, .75, 1.5, 1, 1, 'black', 'black', mass=80)

    def drive_left(self, magnitude):
        if magnitude > 0:
            self.torque_right(magnitude)
        else:
            self.torque(magnitude, 0)
        # self.force(5, self._angle + 90)

    def drive_right(self, magnitude):
        if magnitude > 0:
            self.torque(magnitude, 1)
        else:
            self.torque(magnitude, 2)
        # self.force(5, self._angle + 90)


class Zone(MapObject, Rectangle):
    def __init__(self, canvas, top_left, bottom_right, color):
        width = bottom_right[0]-top_left[0]
        height = top_left[1]-bottom_right[1]
        print(width, height)
        super().__init__(
            canvas=canvas,
            width=width,
            height=height,
            x=top_left[0] + width/2,
            y=bottom_right[1] + height/2,
            color=color
        )
