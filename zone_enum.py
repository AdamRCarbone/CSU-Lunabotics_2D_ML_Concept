"""Zone types in the arena environment"""
from enum import Enum


class ZoneType(Enum):
    STARTING = 'Starting Zone'
    EXCAVATION = 'Excavation Zone'
    OBSTACLE = 'Obstacle Zone'
    CONSTRUCTION = 'Construction Zone'
    COLUMN = 'Column'
    NONE = 'No Zone'
