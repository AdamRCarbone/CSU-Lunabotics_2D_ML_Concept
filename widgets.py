import tkinter as tk
from tkinter import font as tkfont


class RoundedButton(tk.Canvas):

    def __init__(self, parent, text="", command=None, width=150, height=35,
                 bg='#464646', hover_bg='#5a5a5a', fg='white',
                 corner_radius=0.5, **kwargs):
        """
        Args:
            corner_radius: Float from 0.0 to 1.0
                          0.0 = no rounding (square corners)
                          0.5 = half-rounded (pill shape for square buttons)
                          1.0 = maximum rounding (full pill/capsule shape)
        """
        super().__init__(parent, width=width, height=height,
                        highlightthickness=0, **kwargs)

        self.command = command
        self.bg = bg
        self.hover_bg = hover_bg
        self.fg = fg
        self.corner_radius_percent = max(0.0, min(1.0, corner_radius))  # Clamp to 0-1
        self.text = text
        self.width = width
        self.height = height

        # Draw button
        self._draw_button(self.bg)

        # Bind events
        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)

    def _draw_button(self, bg_color):
        self.delete("all")

        # Set canvas background to match parent (for transparency effect)
        parent_bg = self.master.cget('bg')
        self.config(bg=parent_bg)

        # Create rounded rectangle
        x0, y0 = 2, 2
        x1, y1 = self.width - 2, self.height - 2

        # Calculate radius as percentage of smallest dimension
        # Maximum possible radius is half the smallest dimension (for perfect pill shape)
        max_radius = min((x1 - x0) / 2, (y1 - y0) / 2)
        r = self.corner_radius_percent * max_radius

        # Draw the filled rounded rectangle
        # Draw a single large rectangle for the center
        self.create_rectangle(x0, y0 + r, x1, y1 - r,
                            fill=bg_color, outline="", width=0)

        # Draw top and bottom rectangles (extend from center to edges)
        if r > 0:
            self.create_rectangle(x0 + r, y0, x1 - r, y0 + r,
                                fill=bg_color, outline="", width=0)
            self.create_rectangle(x0 + r, y1 - r, x1 - r, y1,
                                fill=bg_color, outline="", width=0)

            # Corner arcs (filled quarter circles at corners)
            # Top-left
            self.create_arc(x0, y0, x0 + 2*r, y0 + 2*r,
                           start=90, extent=90, fill=bg_color, outline="", width=0)
            # Top-right
            self.create_arc(x1 - 2*r, y0, x1, y0 + 2*r,
                           start=0, extent=90, fill=bg_color, outline="", width=0)
            # Bottom-left
            self.create_arc(x0, y1 - 2*r, x0 + 2*r, y1,
                           start=180, extent=90, fill=bg_color, outline="", width=0)
            # Bottom-right
            self.create_arc(x1 - 2*r, y1 - 2*r, x1, y1,
                           start=270, extent=90, fill=bg_color, outline="", width=0)

        # Add text on top
        self.create_text(self.width/2, self.height/2,
                        text=self.text, fill=self.fg,
                        font=('Arial', 10))

    def _on_click(self, event):
        if self.command:
            self.command()

    def _on_enter(self, event):
        self._draw_button(self.hover_bg)
        self.config(cursor="hand2")

    def _on_leave(self, event):
        self._draw_button(self.bg)
        self.config(cursor="")

    def configure(self, **kwargs):
        if 'text' in kwargs:
            self.text = kwargs['text']
            self._draw_button(self.bg)


# Alternative: Simple styled button (no rounded corners, but stable)
class StyledButton(tk.Button):
    """Standard button with nice styling - no size issues"""

    def __init__(self, parent, text="", command=None, width=15, **kwargs):
        super().__init__(
            parent,
            text=text,
            command=command,
            width=width,
            font=('Arial', 10),
            bg='#464646',
            fg='white',
            activebackground='#5a5a5a',
            activeforeground='white',
            bd=0,
            highlightthickness=0,
            relief=tk.FLAT,
            cursor='hand2',
            **kwargs
        )
