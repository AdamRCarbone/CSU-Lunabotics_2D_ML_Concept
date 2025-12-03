# Global styling constants for Lunabotics 2D Simulation
# Material 3 inspired design


class UI:
    """UI colors following Material 3 design system"""
    # Background colors
    WINDOW_BG = "#f5f5f7"  # Light background
    SIDEBAR_BG = "#f5f5f7"
    CARD_BG = "#ffffff"

    # Text colors (Material 3)
    TITLE_COLOR = "#1c1b1f"  # on-surface
    TEXT_COLOR = "#49454f"   # on-surface-variant
    TEXT_PRIMARY = "#1c1b1f"

    # Accent colors
    PRIMARY = "#6750a4"      # Purple primary
    PRIMARY_LIGHT = "#f3eeff"  # Light purple background
    PRIMARY_BORDER = "#e8def8"  # Purple border
    ACTIVE_ZONE_BG = "#e7d4ff"  # rgba(142, 76, 255, 0.25) blended with white - purple highlight for active zone

    # Status colors
    POSITION_COLOR = "#6eb9ff"        # Blue
    POSITION_BG = "#e3f2fd"

    DIGGING_COLOR = "#ff9800"         # Orange
    DIGGING_BG = "#fff3e0"

    CONTROL_COLOR_1 = "#008526"       # Green
    CONTROL_COLOR_2 = "#7DDA58"       # Light green

    # Button colors
    BUTTON_BG = "#3db600"
    BUTTON_HOVER_BG = "#00a11e"
    BUTTON_TEXT = "#ffffff"

    # Border and shadow
    BORDER_COLOR = "#f0f0f0"  # Light gray border
    BORDER_HOVER = "#f5f5f5"

    # Typography
    FONT_FAMILY = "Segoe UI, system-ui, -apple-system, sans-serif"
    FONT_SIZE_HEADER = 14
    FONT_SIZE_BODY = 11
    FONT_SIZE_SMALL = 10


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
