import threading
import time
from shapes import Rectangle, Circle
from MapObjects import Zone, Obstacle
import tkinter as tk


def on_key_press(event):
    global c
    c.move(5, 0)


def worker():
    global c
    global digging_zone
    for i in range(50):
        digging_zone.shape.rotate(2)
        c.move(5, 5)
        time.sleep(.1)


def screenUpdate():
    global arena
    global root

    root.after(20, screenUpdate)


root = tk.Tk()
root.title("ML Map")
canvas = tk.Canvas(root, width=600, height=600, bg="white")
canvas.pack()

r = Rectangle(canvas, 600, 600, 300, 300, color='blue')
arena = Zone(r)
r = Rectangle(canvas, 300, 600, 150, 300, color='green')
digging_zone = Zone(r)
r = Rectangle(canvas, 250, 100, 150, 500, color='red')
starting_zone = Zone(r)
c = Circle(canvas, 25, 150, 500, color='purple')
obstacle = Obstacle(c)

arena.add(digging_zone)
arena.add(starting_zone)
arena.add(obstacle)

# thread = threading.Thread(target=worker)
# thread.start()
# screenUpdate()

root.bind('<KeyPress>', on_key_press)
root.mainloop()
# thread.join()
