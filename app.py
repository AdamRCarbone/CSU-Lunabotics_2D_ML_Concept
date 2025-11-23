import tkinter as tk
import customtkinter as ctk
from environment import Environment
from styles import UI, Sim
from window import Window

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("green")

class MainWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Lunabotics 2D Simulation")
        self._create_layout()

        # Bind keyboard events
        self.root.bind('<KeyPress>', self.environment.on_key_press)
        self.root.bind('<KeyRelease>', self.environment.on_key_release)

        # Bind window resize event
        self.root.bind('<Configure>', self._on_window_resize)

        # Start loop
        self._loop()

    # Called when window is resized - update UI proportions
    def _on_window_resize(self, event):
        # Only handle resize events for the root window, not child widgets
        if event.widget == self.root:
            new_width = event.width
            new_height = event.height

            # Recalculate sidebar widths based on new window size
            new_left_width = int(new_width * Window.LEFT_SIDEBAR_WIDTH_RATIO)
            new_right_width = int(new_width * Window.RIGHT_SIDEBAR_WIDTH_RATIO)

            # Update sidebar widths
            if hasattr(self, 'left_sidebar'):
                self.left_sidebar.configure(width=new_left_width)
            if hasattr(self, 'right_sidebar'):
                self.right_sidebar.configure(width=new_right_width)

            # Recalculate environment scale based on new window size
            Window.resize_environment(self.environment, new_width, new_height)

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
        self.left_sidebar = ctk.CTkFrame(self.root, width=Window.LEFT_SIDEBAR_WIDTH, corner_radius=0, fg_color=UI.SIDEBAR_BG)
        self.left_sidebar.pack(side=tk.LEFT, fill=tk.Y, padx=0, pady=0)
        self.left_sidebar.pack_propagate(False)
        sidebar = self.left_sidebar 

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
        self.right_sidebar = ctk.CTkFrame(self.root, width=Window.RIGHT_SIDEBAR_WIDTH, corner_radius=0, fg_color=UI.SIDEBAR_BG)
        self.right_sidebar.pack(side=tk.RIGHT, fill=tk.Y, padx=0, pady=0)
        self.right_sidebar.pack_propagate(False)
        sidebar = self.right_sidebar  # For compatibility with existing code

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
    # Use calculated window size from Window
    root.geometry(f"{Window.width}x{Window.height}")
    app = MainWindow(root)
    root.mainloop()


if __name__ == "__main__":
    main()
