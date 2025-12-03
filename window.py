"""
Global window and layout configuration.
Dynamically calculates all dimensions based on screen size.
"""
import tkinter as tk
from shapes import ARENA_WIDTH, ARENA_HEIGHT
from environment import Environment
import shapes


class LayoutConfig:
    """Global layout configuration based on screen size"""

    def __init__(self):
        # Get screen dimensions
        root_temp = tk.Tk()
        self.SCREEN_WIDTH = root_temp.winfo_screenwidth()
        self.SCREEN_HEIGHT = root_temp.winfo_screenheight()
        root_temp.destroy()

        # Layout proportions (0-1 scale)
        self.WINDOW_WIDTH_RATIO = .90  # 90% of screen width
        self.WINDOW_HEIGHT_RATIO = .90  # 90% of screen height

        self.ENVIRONMENT_WIDTH_RATIO = 0.40
        self.LEFT_SIDEBAR_WIDTH_RATIO = 0.18
        self.RIGHT_SIDEBAR_WIDTH_RATIO = 0.25

        # Calculate target window dimensions
        self.target_window_width = int(self.SCREEN_WIDTH * self.WINDOW_WIDTH_RATIO)
        self.target_window_height = int(self.SCREEN_HEIGHT * self.WINDOW_HEIGHT_RATIO)

        # Calculate available space for environment (subtract sidebars and padding)
        available_width = self.target_window_width * self.ENVIRONMENT_WIDTH_RATIO
        available_height = self.target_window_height - 100  # Reserve 100px for padding/titlebar

        # Calculate scale to fit environment (choose smaller scale to fit both dimensions)
        scale_from_width = available_width / ARENA_WIDTH
        scale_from_height = available_height / ARENA_HEIGHT
        calculated_scale = min(scale_from_width, scale_from_height)  # Fit within both constraints

        # Update global SCALE in shapes module
        shapes.SCALE = calculated_scale
        shapes.Shape.scale = calculated_scale

        # Recalculate canvas dimensions with new scale
        Environment.CANVAS_WIDTH = int(ARENA_WIDTH * calculated_scale)
        Environment.CANVAS_HEIGHT = int(ARENA_HEIGHT * calculated_scale)

        # Calculate sidebar widths based on target window width
        self.LEFT_SIDEBAR_WIDTH = int(self.target_window_width * self.LEFT_SIDEBAR_WIDTH_RATIO)
        self.RIGHT_SIDEBAR_WIDTH = int(self.target_window_width * self.RIGHT_SIDEBAR_WIDTH_RATIO)

        # Calculate final window size - use target dimensions to preserve aspect ratio
        self.WINDOW_WIDTH = self.target_window_width
        self.WINDOW_HEIGHT = self.target_window_height

        # Convenient aliases
        self.width = self.WINDOW_WIDTH
        self.height = self.WINDOW_HEIGHT


    def update_scale(self, window_width, window_height):
        """Update scale based on new window dimensions without recreating objects"""
        import shapes
        from environment import Environment

        # Calculate available space for environment
        available_width = window_width * self.ENVIRONMENT_WIDTH_RATIO
        available_height = window_height - 100

        # Calculate new scale
        scale_from_width = available_width / ARENA_WIDTH
        scale_from_height = available_height / ARENA_HEIGHT
        new_scale = min(scale_from_width, scale_from_height)

        # Update global SCALE
        shapes.SCALE = new_scale
        shapes.Shape.scale = new_scale

        # Update canvas dimensions
        Environment.CANVAS_WIDTH = int(ARENA_WIDTH * new_scale)
        Environment.CANVAS_HEIGHT = int(ARENA_HEIGHT * new_scale)

        return new_scale

    def resize_environment(self, environment, window_width, window_height):
        """
        Complete environment resize service.
        Call this with your environment instance when window resizes.
        """
        import shapes
        from environment import Environment

        # Update scale
        self.update_scale(window_width, window_height)

        # Update canvas size
        environment.canvas.configure(
            width=Environment.CANVAS_WIDTH,
            height=Environment.CANVAS_HEIGHT
        )

        # Redraw all existing objects at new scale
        environment.canvas.delete("all")

        # Redraw zones
        environment._create_zones()

        # Redraw rover at current position
        environment.rover.redraw()
        environment.rover.draw_image()

        # Redraw obstacles at current positions
        for obstacle in environment.obstacles:
            obstacle.redraw()


# Initialize global layout config - import this from other files
Window = LayoutConfig()
