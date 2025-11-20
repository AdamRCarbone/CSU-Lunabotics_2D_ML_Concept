import tkinter as tk
from tkinter import ttk
from environment import Environment
from widgets import RoundedButton


class MainWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Lunabotics 2D Simulation")
        self._create_layout()

        # Bind keyboard events to sim
        self.root.bind('<KeyPress>', self.environment.on_key_press)
        self.root.bind('<KeyRelease>', self.environment.on_key_release)

        # Start update loop
        self._loop()

    def _create_layout(self):
        # Canvas frame
        canvas_frame = tk.Frame(self.root)
        canvas_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        # Environment (child of frame)
        self.environment = Environment(canvas_frame)

        # Sidebar
        self._create_sidebar()

    def _create_sidebar(self):
        # Control sidebar
        sidebar = tk.Frame(self.root, width=200, bg='lightgray', padx=10, pady=10)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)

        # Title
        title = tk.Label(sidebar, text="Controls", font=('Arial', 14, 'bold'), bg='lightgray')
        title.pack(pady=(0, 10))

    def _toggle_pause(self):
        # Toggle environment pause
        is_running = self.environment.toggle_pause()
        self.pause_btn.config(text="Pause" if is_running else "Resume")

    def _loop(self):
        # Main update loop
        self.environment.update()
        self.root.after(20, self._loop)  # Update at ~50 FPS