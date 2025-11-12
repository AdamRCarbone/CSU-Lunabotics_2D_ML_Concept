from abc import ABC, abstractmethod
import threading
import math
import tkinter as tk


class Shape(ABC):
    def __init__(self, canvas, color, outline_color):
        self.color = color
        self.outline_color = outline_color
        self._canvas = canvas
        self._lock: threading.Lock = threading.Lock()

    @abstractmethod
    def move(self):
        pass


class Polygon(Shape):
    def __init__(self, canvas, points, color='white', outline_color='black'):
        super().__init__(canvas, color, outline_color)
        self._points = points

        self._obj = self._canvas.create_polygon(
            [coord for point in self._points for coord in point],
            fill=self.color,
            outline=self.outline_color,
            width=3
        )

    def set_points(self):
        points_1d = [coord for point in self._points for coord in point]
        self._canvas.coords(
            self._obj,
            *points_1d
        )

    def move(self, dx, dy):
        for i, point in enumerate(self._points):
            self._points[i] = (point + dx, point+dy)
        self.set_points()


class Rectangle(Polygon):
    '''
    A class for a rectangle centered at point (x, y)
    the rectangle can be rotated by any amount
    '''

    def __init__(self, canvas, width, height, x, y, angle=0, color='white', outline_color='black'):
        # call polygon constructor with no points (update them later)
        super().__init__(canvas, [(0, 0)]*4, color, outline_color)

        # set class variables
        self._width = width
        self._height = height
        self._x = x
        self._y = y
        self._angle = angle

        # update the points in the polygon
        self.update_points()

    def update_points(self):
        self._lock.acquire()

        # since all corners are the same distance from the center
        # get the magnitude of x and y from the center first
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
        self._points = [(x+self._x, y+self._y) for x, y in rotated]

        self._lock.release()
        self.set_points()

    def rotate(self, da):
        self._lock.acquire()
        self._angle += da
        self._lock.release()
        self.update_points()

    def set_x(self, x):
        self.move(x-self._x)
        self._lock.acquire()
        self._x = x
        self._lock.release()

    def set_y(self, y):
        self.move(y-self._y)
        self._lock.acquire()
        self._y = y
        self._lock.release()


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
