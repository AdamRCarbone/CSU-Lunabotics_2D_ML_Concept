# Main entry point for the Lunabotics 2D Simulation
import tkinter as tk
from app import MainWindow


def main():
    # Start the application
    root = tk.Tk()
    app = MainWindow(root)
    root.mainloop()


if __name__ == "__main__":
    main()
