import time
import random
from shapes import Rectangle, Circle, Zone, Obstacle, Rover, Boulder, Crater
import tkinter as tk
from PIL import Image, ImageTk


keys_pressed = []


def on_key_press(event):
    global keys_pressed
    keys_pressed.append(event.keysym)


def on_key_release(event):
    global keys_pressed
    keys_pressed.remove(event.keysym)


angle = 10


def loop():
    global keys_pressed
    global root
    global rover
    global boulders
    global start_zone
    global img, img_tk
    global canvas_img, angle

    # img = Image.open("resources/rover.png")
    # print(img.size)
    # img = img.rotate(angle, expand=True)
    # angle += 10
    # w, h = img.size
    # w = round(w*.75)
    # h = round(h*.75)
    # img = img.resize((w, h), Image.Resampling.LANCZOS)
    # img_tk = ImageTk.PhotoImage(img)
    # canvas.itemconfig(canvas_img, image=img_tk)
    # canvas.coords(canvas_img, 250-w/2, 250-h/2)

    # update the speed of Rover
    # update the position of Rover
    # check collision of Rover with all other objects

    for key in keys_pressed:
        match(key):
            case('a'):
                rover.torque_right(-5)
            case('q'):
                rover.torque_right(5)
            case('d'):
                rover.torque_left(5)
            case('e'):
                rover.torque_left(-5)

    rover.update()
    collision = False
    for o in obstacles:
        if rover.collides(o):
            collision = True

    if not collision:
        if rover.collides(column):
            collision = True

    if collision:
        reset_arena()

    root.after(20, loop)


def create_obstacle(constructor):
    global start_zone
    global construction_zone
    global column
    global obstacles
    global canvas

    while True:
        obstacle = constructor(canvas)
        for o in obstacles:
            if obstacle.collides(o) or \
                    obstacle.collides(start_zone) or \
                    obstacle.collides(column) or \
                    obstacle.collides(construction_zone):
                obstacle.delete()
                break
        else:
            obstacles.append(obstacle)
            break


def reset_arena():
    global obstacles
    global rover
    global canvas

    for o in obstacles:
        o.delete()
    obstacles = []

    for _ in range(random.randint(6, 12)):
        create_obstacle(Boulder)
    for _ in range(random.randint(3, 5)):
        create_obstacle(Crater)

    rover.delete()
    rover = Rover(canvas)


root = tk.Tk()
root.title("ML Map")
canvas = tk.Canvas(root, width=688, height=500, bg="white")
canvas.pack()

arena = Zone(canvas, (0, 5), (6.88, 0), 'blue')
excavation_zone = Zone(canvas, (0, 5), (2.5, 0), 'light blue')
obstacle_zone = Zone(canvas, (2.5, 5), (6.88, 0), 'light yellow', 'yellow')
start_zone = Zone(canvas, (0, 2), (2, 0), 'light green', 'green')
construction_zone = Zone(
    canvas, (4.58, .8), (4.58+1.7, .1), '#FFCC99', 'orange')
column = Zone(canvas, (3.44-.25, 2.5-.25), (3.44+.25, 2.5+.25), 'gray')
obstacles = []


rover = Rover(canvas)
# img = Image.open("resources/rover.png")
# img_tk = ImageTk.PhotoImage(img)
# Add it to the canvas (x=0, y=0 or wherever you want)
# canvas_img = canvas.create_image(0, 0, image=img_tk, anchor="nw")
reset_arena()

root.bind('<KeyPress>', on_key_press)
root.bind('<KeyRelease>', on_key_release)
loop()
root.mainloop()
