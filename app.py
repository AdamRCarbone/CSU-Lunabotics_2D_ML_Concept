import tkinter as tk
import customtkinter as ctk
from environment import Environment
from styles import UI, Sim

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("green")

# Layout constants
LEFT_SIDEBAR_WIDTH = 250
RIGHT_SIDEBAR_WIDTH = 500
CANVAS_WIDTH = 450
TOTAL_WIDTH = LEFT_SIDEBAR_WIDTH + CANVAS_WIDTH + RIGHT_SIDEBAR_WIDTH
CANVAS_HEIGHT = (TOTAL_WIDTH/16)*9


class MainWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Lunabotics 2D Simulation")
        self._create_layout()

        # Bind keyboard events
        self.root.bind('<KeyPress>', self.environment.on_key_press)
        self.root.bind('<KeyRelease>', self.environment.on_key_release)

        # Start loop
        self._loop()

    def _create_layout(self):
        self.root.configure(bg=UI.WINDOW_BG)

        # Create canvas frame (don't pack yet)
        canvas_frame = tk.Frame(self.root, bg=UI.WINDOW_BG)

        # Environment (tkinter) - create but don't pack yet
        self.environment = Environment(canvas_frame)

        # Sidebars (pack first so they claim their space)
        self.createLeftSidebar()
        self.createRightSidebar()

        # Canvas frame (pack last, fills remaining space)
        canvas_frame.pack(fill=tk.BOTH, expand=True)

    def createLeftSidebar(self):
        sidebar = ctk.CTkFrame(self.root, width=LEFT_SIDEBAR_WIDTH, corner_radius=0, fg_color=UI.SIDEBAR_BG)
        sidebar.pack(side=tk.LEFT, fill=tk.Y, padx=0, pady=0)
        sidebar.pack_propagate(False)

        # Title
        title = ctk.CTkLabel(
            sidebar,
            text="Controls",
            font=("Arial", 18, "bold"),
            text_color=UI.TITLE_COLOR
        )
        title.pack(pady=(20, 10), padx=20, anchor="w")

        # Instructions
        controls_label = ctk.CTkLabel(
            sidebar,
            text="Keyboard Controls:",
            font=("Arial", 13, "bold"),
            text_color=UI.TEXT_COLOR
        )
        controls_label.pack(pady=(10, 5), padx=20, anchor="w")

        controls_text = [
            "A - Torque Right (CCW)",
            "Q - Torque Right (CW)",
            "D - Torque Left (CW)",
            "E - Torque Left (CCW)",
        ]

        for text in controls_text:
            label = ctk.CTkLabel(
                sidebar,
                text=text,
                font=("Arial", 12),
                text_color=UI.TEXT_COLOR
            )
            label.pack(pady=2, padx=20, anchor="w")

        # Spacer
        spacer = ctk.CTkLabel(sidebar, text="", height=20)
        spacer.pack()

        # Reset button
        reset_btn = ctk.CTkButton(
            sidebar,
            text="Reset Arena",
            command=self.environment.reset_arena,
            width=210,
            height=40,
            corner_radius=20,
            fg_color=UI.BUTTON_BG,
            hover_color=UI.BUTTON_HOVER_BG,
            text_color=UI.BUTTON_TEXT
        )
        reset_btn.pack(pady=5, padx=20)

        # Pause button
        self.pause_btn = ctk.CTkButton(
            sidebar,
            text="Pause",
            command=self._toggle_pause,
            width=210,
            height=40,
            corner_radius=20,
            fg_color=UI.BUTTON_BG,
            hover_color=UI.BUTTON_HOVER_BG,
            text_color=UI.BUTTON_TEXT
        )
        self.pause_btn.pack(pady=5, padx=20)

    def createRightSidebar(self):
        sidebar = ctk.CTkFrame(self.root, width=RIGHT_SIDEBAR_WIDTH, corner_radius=0, fg_color=UI.SIDEBAR_BG)
        sidebar.pack(side=tk.RIGHT, fill=tk.Y, padx=0, pady=0)
        sidebar.pack_propagate(False)

        # Reset button
        reset_btn = ctk.CTkButton(
            sidebar,
            text="Reset Arena",
            command=self.environment.reset_arena,
            width=210,
            height=40,
            corner_radius=20,
            fg_color=UI.BUTTON_BG,
            hover_color=UI.BUTTON_HOVER_BG,
            text_color=UI.BUTTON_TEXT
        )
        reset_btn.pack(pady=5, padx=20)

    def _toggle_pause(self):
        is_running = self.environment.toggle_pause()
        self.pause_btn.configure(text="Pause" if is_running else "Resume")

    def _loop(self):
        self.environment.update()
        self.root.after(20, self._loop)


def main():
    root = ctk.CTk()  # Use CustomTkinter root
    # Calculate window size dynamically from layout constants
    window_width = LEFT_SIDEBAR_WIDTH + CANVAS_WIDTH + RIGHT_SIDEBAR_WIDTH + 20  # +20 for padding
    window_height = CANVAS_HEIGHT + 100  # +100 for title bar and padding
    root.geometry(f"{window_width}x{window_height}")
    app = MainWindow(root)
    root.mainloop()


if __name__ == "__main__":
    main()
