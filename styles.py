# Global styling constants for Lunabotics 2D Simulation
# Material 3 inspired design


class UI:
    """UI colors for CustomTkinter widgets"""
    WINDOW_BG = "#fafafa"
    SIDEBAR_BG = "#ffffff"
    TITLE_COLOR = "#1f1f1f"
    TEXT_COLOR = "#5f6368"
    BUTTON_BG = "#3db600"
    BUTTON_HOVER_BG = "#00a11e"
    BUTTON_TEXT = "#ffffff"


class Sim:
    """Simulation environment colors and styling"""
    CANVAS_BG = "white"

    # Zone colors
    ARENA = "blue"
    EXCAVATION = "light blue"
    OBSTACLE = "light yellow"
    OBSTACLE_OUTLINE = "yellow"
    START = "light green"
    START_OUTLINE = "green"
    CONSTRUCTION = "#FFCC99"
    CONSTRUCTION_OUTLINE = "orange"
    COLUMN = "gray"

    # Outline width ratios (relative to scale)
    # These multiply with SCALE to get pixel widths
    ZONE_OUTLINE_WIDTH_RATIO = 0.04      # Medium - zone boundaries
    OBJECT_OUTLINE_WIDTH_RATIO = 0.025   # Thin - obstacles (rocks, craters)
    ROVER_OUTLINE_WIDTH_RATIO = 0.015    # Rover outline

    @staticmethod
    def get_outline_width(ratio):
        """Calculate outline width based on current scale"""
        from shapes import SCALE
        return max(1, int(SCALE * ratio))  # Minimum 1px

    @staticmethod
    def zone_outline_width():
        return Sim.get_outline_width(Sim.ZONE_OUTLINE_WIDTH_RATIO)

    @staticmethod
    def object_outline_width():
        return Sim.get_outline_width(Sim.OBJECT_OUTLINE_WIDTH_RATIO)

    @staticmethod
    def rover_outline_width():
        return Sim.get_outline_width(Sim.ROVER_OUTLINE_WIDTH_RATIO)
