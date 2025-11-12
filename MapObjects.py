from __future__ import annotations
from abc import ABC, abstractmethod
import shapes


class MapObject(ABC):
    def __init__(self, shape: shapes.Shape = None):
        self.shape = shape
        self.children: list[MapObject] = []

    def add(self, other: MapObject):
        self.children.append(other)

    @abstractmethod
    def move(self):
        pass


class Obstacle(MapObject):
    def __init__(self, shape: shapes.Shape = None):
        super().__init__(shape)

    def move(self, dx, dy):
        self.shape.move(dx, dy)


class Zone(MapObject):
    def __init__(self, area: shapes.Rectangle):
        super().__init__(area)

    def move(self):
        pass
