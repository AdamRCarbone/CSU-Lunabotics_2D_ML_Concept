from __future__ import annotations
from abc import ABC, abstractmethod
from PIL import Image, ImageTk
import math
import random

ARENA_WIDTH = 6.88  # meters
ARENA_HEIGHT = 5    # meters
SCALE = 100  # pixels per meter (dynamically set by window.py based on screen size)


class Shape(ABC):
    scale = SCALE

    def __init__(self, canvas, color, outline_color):
        self.color = color
        self.outline_color = outline_color
        self._canvas = canvas

    def arena_to_canvas(self, x, y):
        return (self.scale * x, self.scale * (ARENA_HEIGHT - y))

    def meters_to_pixels(self, val):
        return self.scale * val

    def delete(self):
        self._canvas.delete(self._obj)

    @abstractmethod
    def redraw(self):
        """Redraw the shape at its current position with current scale"""
        pass


class Rectangle(Shape):
    '''
    A class for a rectangle centered at point (x, y)
    the rectangle can be rotated by any amount
    '''

    def __init__(self, canvas, width, height, x, y, angle=0, color='white', outline_color='black', outline_width=None, **kwargs):
        super().__init__(canvas, color, outline_color)

        # set class variables
        self._width = width
        self._height = height
        self._x = x
        self._y = y
        self._angle = angle

        from styles import Sim
        # Use provided outline_width or default to rover width
        if outline_width is None:
            outline_width = Sim.rover_outline_width()

        self._obj = self._canvas.create_polygon(
            [0]*8,
            fill=self.color,
            outline=self.outline_color,
            width=outline_width
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

    def contains(self, point):
        "Check if point  is inside the rectangle"
        inside = False
        n = len(self.corners)
        for i in range(n):
            x1, y1 = self.corners[i]
            x2, y2 = self.corners[(i + 1) % n]
            if ((y1 > point[1]) != (y2 > point[1])) and \
               (point[0] < (x2 - x1) * (point[1] - y1) / (y2 - y1 + 1e-12) + x1):
                inside = not inside
        return inside

    def is_in_bounds(self):
        """Check if rectangle is within arena bounds"""
        for corner in self.corners:
            x, y = corner
            if x < 0 or x > ARENA_WIDTH or y < 0 or y > ARENA_HEIGHT:
                return False
        return True

    def rectangle_overlap(self, other):
        """Check if two rotated rectangles overlap using SAT.

        rect1, rect2: lists of 4 vertices [(x1,y1), ..., (x4,y4)]
        """
        def get_axes(rect):
            # Get perpendicular (normal) vectors of rectangle edges
            return [(-(y2-y1), x2-x1)
                    for (x1, y1), (x2, y2) in zip(rect, rect[1:] + rect[:1])]

        def project(rect, axis):
            # Project rectangle onto axis
            dots = [x*axis[0] + y*axis[1] for x, y in rect]
            return min(dots), max(dots)

        for axis in get_axes(self.corners) + get_axes(other.corners):
            length = math.hypot(*axis)
            if length == 0:
                continue
            axis = (axis[0]/length, axis[1]/length)  # normalize
            min1, max1 = project(self.corners, axis)
            min2, max2 = project(other.corners, axis)
            if max1 < min2 or max2 < min1:  # separating axis found
                return False
        return True  # no separating axis found

    def circle_overlap(self, other):

        def distance_point_to_segment(px, py, x1, y1, x2, y2):
            """Compute the minimum distance from point (px, py)
            to line segment (x1,y1)-(x2,y2)"""
            # Vector from segment start to end
            vx, vy = x2 - x1, y2 - y1
            # Vector from segment start to point
            wx, wy = px - x1, py - y1
            # Project point onto line, clamped to [0,1] for segment
            t = max(0, min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy + 1e-12)))
            closest_x = x1 + t * vx
            closest_y = y1 + t * vy
            # Distance squared
            dx = px - closest_x
            dy = py - closest_y
            return math.hypot(dx, dy)

        # 1. Check if circle center is inside rectangle
        if self.contains((other.x, other.y)):
            return True

        # 2. Check if circle intersects any rectangle edge
        for i in range(4):
            x1, y1 = self.corners[i]
            x2, y2 = self.corners[(i + 1) % 4]
            if distance_point_to_segment(other.x, other.y, x1, y1, x2, y2) <= other.radius:
                return True

        # 3. No overlap
        return False

    def collides(self, other):
        if isinstance(other, Circle):
            return self.circle_overlap(other)
        elif isinstance(other, Rectangle):
            return self.rectangle_overlap(other)

    def redraw(self):
        """Redraw rectangle at current position with current scale"""
        self.calculate_corners()


class Circle(Shape):
    def __init__(self, canvas, radius, x, y, color='white', outline_color='black'):
        super().__init__(canvas, color, outline_color)
        self.radius = radius
        self.x = x
        self.y = y
        from styles import Sim
        radius = self.meters_to_pixels(radius)
        x, y = self.arena_to_canvas(x, y)
        self._obj = self._canvas.create_oval(
            x-radius,
            y-radius,
            x+radius,
            y+radius,
            fill=self.color,
            outline=self.outline_color,
            width=Sim.object_outline_width()  # Dynamic width for obstacles
        )

    def set_x(self, x):
        self._canvas.move(self._obj, x-self.x, 0)
        self.x = x

    def set_y(self, y):
        self._canvas.move(self._obj, 0, y-self.y)
        self.y = y

    def contains(self, point):
        return ((point[0] - self.x)**2 + (point[1] - self.y)**2)**.5 <= self.radius

    def collides(self, other):
        if isinstance(other, Circle):
            return ((other.x - self.x)**2 + (other.y - self.y)**2)**.5 <= self.radius + other.radius
        elif isinstance(other, Rectangle):
            return other.collides(self)

    def redraw(self):
        """Redraw circle at current position with current scale"""
        from styles import Sim
        radius_px = self.meters_to_pixels(self.radius)
        x, y = self.arena_to_canvas(self.x, self.y)
        self._obj = self._canvas.create_oval(
            x - radius_px,
            y - radius_px,
            x + radius_px,
            y + radius_px,
            fill=self.color,
            outline=self.outline_color,
            width=Sim.object_outline_width()  # Dynamic width for obstacles
        )


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


class Boulder(Obstacle, Circle):
    def __init__(self, canvas, x=None, y=None, radius=None, color='light gray', outline_color='black'):
        if not radius:
            # assign a random radius from 30-40cm
            radius = (random.random() * .1 + .3)/2

        # Fill in x and y if they are not already. Cut off a radius
        # from each side so half the rock isnt off the screen
        if not x:
            x = random.random() * (ARENA_WIDTH - 2*radius) + radius
        if not y:
            y = random.random() * (ARENA_HEIGHT - 2*radius) + radius

        super().__init__(
            canvas=canvas,
            radius=radius,
            x=x,
            y=y,
            color=color,
            outline_color=outline_color
        )


class Crater(Obstacle, Circle):
    def __init__(self, canvas, x=None, y=None, radius=None, color='gray', outline_color='black'):
        if not radius:
            # assign a random radius from 30-40cm
            radius = (random.random() * .1 + .4)/2

        # Fill in x and y if they are not already. Cut off a radius
        # from each side so half the rock isnt off the screen
        if not x:
            x = random.random() * (ARENA_WIDTH - 2*radius) + radius
        if not y:
            y = random.random() * (ARENA_HEIGHT - 2*radius) + radius

        super().__init__(
            canvas=canvas,
            radius=radius,
            x=x,
            y=y,
            color=color,
            outline_color=outline_color
        )


class Rover(PhysicsRectangle):
    def __init__(self, canvas):
        super().__init__(canvas, .75, 1.5, 1, 1, '', '', mass=80)
        self.img_path = 'resources/rover.png'
        img = Image.open(self.img_path)
        self.img_tk = ImageTk.PhotoImage(img)
        self.image_obj = canvas.create_image(0, 0, image=self.img_tk)

    def draw_image(self):
        scale = SCALE

        img = Image.open(self.img_path)
        w, h = img.size
        img_scale = .75 / (w / self.scale)
        img = img.rotate(-self._angle, expand=True)
        # get the width and height again because the
        # bounding box changes for a bigger picture
        w, h = img.size
        img_w = round(w * img_scale)
        img_h = round(h * img_scale)

        img_x = self.scale * self._x
        img_y = (ARENA_HEIGHT * SCALE) - self.scale * self._y
        img = img.resize((img_w, img_h), Image.Resampling.LANCZOS)
        self.img_tk = ImageTk.PhotoImage(img)
        self._canvas.itemconfig(self.image_obj, image=self.img_tk)
        self._canvas.coords(self.image_obj, img_x, img_y)

    def update(self):
        super().update()
        self.draw_image()

    def redraw(self):
        """Redraw rover rectangle and image at current position with current scale"""
        # Redraw the rectangle shape
        super().redraw()
        # Recreate the image object (since canvas.delete("all") removed it)
        self.image_obj = self._canvas.create_image(0, 0, image=self.img_tk)


class Zone(MapObject, Rectangle):
    def __init__(self, canvas, top_left, bottom_right, color, outline_color='black'):
        from styles import Sim
        width = bottom_right[0]-top_left[0]
        height = top_left[1]-bottom_right[1]
        super().__init__(
            canvas=canvas,
            width=width,
            height=height,
            x=top_left[0] + width/2,
            y=bottom_right[1] + height/2,
            color=color,
            outline_color=outline_color,
            outline_width=Sim.zone_outline_width()  # Use zone-specific width
        )
