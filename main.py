import time
from shapes import Rectangle, Circle, Zone, Obstacle, Rover
import tkinter as tk


keys_pressed = []


def on_key_press(event):
    global keys_pressed
    keys_pressed.append(event.keysym)


def on_key_release(event):
    global keys_pressed
    keys_pressed.remove(event.keysym)


def worker():
    global c
    global digging_zone
    for i in range(50):
        digging_zone.shape.rotate(2)
        c.move(5, 5)
        time.sleep(.1)


def loop():
    global keys_pressed
    global root
    global bot

    # update the speed of Rover
    # update the position of Rover
    # check collision of Rover with all other objects

    for key in keys_pressed:
        match(key):
            case('a'):
                bot.torque_right(-5)
            case('q'):
                bot.torque_right(5)
            case('d'):
                bot.torque_left(5)
            case('e'):
                bot.torque_left(-5)

    bot.update()
    root.after(20, loop)


root = tk.Tk()
root.title("ML Map")
canvas = tk.Canvas(root, width=688, height=500, bg="white")
canvas.pack()

arena = Zone(canvas, (0, 5), (6.88, 0), 'blue')
excavation_zone = Zone(canvas, (0, 5), (2.5, 0), 'green')
obstacle_zone = Zone(canvas, (2.5, 5), (6.88, 0), 'red')
start_zone = Zone(canvas, (0, 2), (2, 0), 'blue')
# c = Circle(canvas, 25, 150, 500, color='purple')
print('bot vvv')
bot = Rover(canvas)

arena.add(excavation_zone)
arena.add(obstacle_zone)
arena.add(start_zone)
arena.add(bot)

# thread = threading.Thread(target=worker)
# thread.start()
# screenUpdate()

root.bind('<KeyPress>', on_key_press)
root.bind('<KeyRelease>', on_key_release)
loop()
root.mainloop()
# thread.join()
