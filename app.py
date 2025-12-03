import tkinter as tk
import customtkinter as ctk
from environment import Environment
from styles import UI, Sim
from window import Window
from shapes import Boulder, Crater
from zone_enum import ZoneType

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("green")

# Zone colors matching Angular
ZONE_COLORS = {
    ZoneType.STARTING: "#69D140",
    ZoneType.EXCAVATION: "#4099d1",
    ZoneType.OBSTACLE: "#ffcb5c",
    ZoneType.CONSTRUCTION: "#ffa43d",
    ZoneType.COLUMN: "#ff0000",
    ZoneType.NONE: "#cccccc"
}

ZONE_DESCRIPTIONS = {
    ZoneType.STARTING: "2m × 2m",
    ZoneType.EXCAVATION: "2.5m wide",
    ZoneType.OBSTACLE: "4.38m wide",
    ZoneType.CONSTRUCTION: "3m × 1.5m",
    ZoneType.COLUMN: "0.5m × 0.5m",
    ZoneType.NONE: ""
}


class MainWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Lunabotics 2D Simulation")
        self._create_layout()

        self.root.bind('<KeyPress>', self.environment.on_key_press)
        self.root.bind('<KeyRelease>', self.environment.on_key_release)
        self._loop()

    def _create_layout(self):
        self.root.configure(bg=UI.WINDOW_BG)

        # Main container with padding
        main_container = ctk.CTkFrame(self.root, fg_color=UI.WINDOW_BG)
        main_container.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)

        # Top section: Left + Environment + Right
        top_section = ctk.CTkFrame(main_container, fg_color="transparent")
        top_section.pack(fill=tk.BOTH, expand=True)

        # Left section (Zone + Status)
        self.create_left_section(top_section)

        # Environment in center
        env_frame = tk.Frame(top_section, bg=UI.WINDOW_BG)
        env_frame.pack(side=tk.LEFT, padx=24, fill=tk.BOTH, expand=True)
        self.environment = Environment(env_frame)

        # Right section (Detection + Controls side by side)
        self.create_right_section(top_section)

    def create_left_section(self, parent):
        left_section = ctk.CTkFrame(parent, fg_color="transparent")
        left_section.pack(side=tk.LEFT, fill=tk.Y)

        # Zone Legend Card
        zone_card = self._create_card(left_section, "Zone Legend", min_width=220)
        zone_card.pack(pady=(0, 24), fill=tk.X)

        zone_content = ctk.CTkFrame(zone_card, fg_color="transparent")
        zone_content.pack(fill=tk.X, padx=20, pady=(0, 20))

        # Zone legend items (no separate current zone label like Angular)
        self.zone_indicators = {}
        for zone_type in [ZoneType.STARTING, ZoneType.EXCAVATION, ZoneType.OBSTACLE,
                          ZoneType.CONSTRUCTION, ZoneType.COLUMN]:
            zone_item = self._create_zone_item(zone_content, zone_type)
            zone_item.pack(fill=tk.X, pady=2)
            self.zone_indicators[zone_type] = zone_item

        # Rover Status Card
        status_card = self._create_card(left_section, "Rover Status")
        status_card.pack(fill=tk.X)

        status_content = ctk.CTkFrame(status_card, fg_color="transparent")
        status_content.pack(fill=tk.X, padx=20, pady=(0, 20))

        # Position Parameter
        position_display = self._create_parameter_display(
            status_content, "Position", UI.POSITION_COLOR
        )
        position_display.pack(fill=tk.X, pady=(0, 16))
        self.pos_x_label = self._create_param_row(position_display, "x", "—")
        self.pos_y_label = self._create_param_row(position_display, "y", "—")

        # Digging Parameter
        dig_display = self._create_parameter_display(
            status_content, "Digging", UI.DIGGING_COLOR
        )
        dig_display.pack(fill=tk.X)
        self.dig_mode_label = self._create_param_row(dig_display, "Mode", "OFF")

    def create_right_section(self, parent):
        # Right section container with row layout
        right_section = ctk.CTkFrame(parent, fg_color="transparent")
        right_section.pack(side=tk.LEFT, fill=tk.Y)

        # Get environment height for card sizing
        env_height = Environment.CANVAS_HEIGHT

        # Detection Card (left card in right section)
        detection_card = self._create_card(right_section, "Detection", width=320)
        detection_card.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 24))
        detection_card.configure(height=env_height)

        detection_content = ctk.CTkScrollableFrame(
            detection_card,
            fg_color="transparent"
        )
        detection_content.pack(fill=tk.BOTH, expand=True, padx=20, pady=(0, 20))

        # Detected Obstacles section
        self.obstacles_section = self._create_detection_section(
            detection_content, "Detected Obstacles"
        )
        self.obstacles_section.pack(fill=tk.X, pady=(0, 12))

        # Detected Diggables section
        self.diggables_section = self._create_detection_section(
            detection_content, "Detected Diggables"
        )
        self.diggables_section.pack(fill=tk.X)

        # Rover Controls Card (right card in right section)
        controls_card = self._create_card(right_section, "Rover Controls")
        controls_card.pack(side=tk.LEFT, fill=tk.Y)
        controls_card.configure(height=env_height)

        controls_content = ctk.CTkFrame(controls_card, fg_color="transparent")
        controls_content.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)

        # Centered slider container
        slider_container = ctk.CTkFrame(controls_content, fg_color="transparent")
        slider_container.pack(expand=True)

        # Two vertical sliders side by side
        self.torque_left_slider = self._create_vertical_slider(
            slider_container, "Torque Left", UI.CONTROL_COLOR_1, -10, 10
        )
        self.torque_left_slider.pack(side=tk.LEFT, padx=12)

        self.torque_right_slider = self._create_vertical_slider(
            slider_container, "Torque Right", UI.CONTROL_COLOR_2, -10, 10
        )
        self.torque_right_slider.pack(side=tk.LEFT, padx=12)

    # Helper methods
    def _create_card(self, parent, title, min_width=None, width=None):
        """Create Material 3 card"""
        card = ctk.CTkFrame(
            parent,
            fg_color=UI.CARD_BG,
            corner_radius=16,
            border_width=1,
            border_color=UI.BORDER_COLOR
        )
        if min_width:
            card.configure(width=min_width)
        if width:
            card.configure(width=width)
            card.pack_propagate(False)

        # Header
        header = ctk.CTkLabel(
            card,
            text=title,
            font=(UI.FONT_FAMILY, 16, "bold"),
            text_color=UI.TITLE_COLOR,
            anchor="w"
        )
        header.pack(pady=(16, 12), padx=20, anchor="w")

        # Separator
        sep = ctk.CTkFrame(card, height=1, fg_color=UI.BORDER_COLOR)
        sep.pack(fill=tk.X, padx=20, pady=(0, 8))

        return card

    def _create_zone_item(self, parent, zone_type):
        """Zone legend item with colored indicator"""
        item = ctk.CTkFrame(parent, fg_color="transparent", corner_radius=8)

        inner = ctk.CTkFrame(item, fg_color="transparent")
        inner.pack(fill=tk.X, padx=8, pady=4)

        # Color indicator
        indicator = ctk.CTkFrame(
            inner, width=16, height=16, corner_radius=4,
            fg_color=ZONE_COLORS[zone_type],
            border_width=2, border_color=ZONE_COLORS[zone_type]
        )
        indicator.pack(side=tk.LEFT, padx=(0, 10))
        indicator.pack_propagate(False)

        # Zone info
        info_frame = ctk.CTkFrame(inner, fg_color="transparent")
        info_frame.pack(side=tk.LEFT, fill=tk.X, expand=True)

        name = ctk.CTkLabel(
            info_frame, text=zone_type.value,
            font=(UI.FONT_FAMILY, 13), text_color=UI.TEXT_PRIMARY, anchor="w"
        )
        name.pack(anchor="w")

        if ZONE_DESCRIPTIONS[zone_type]:
            desc = ctk.CTkLabel(
                info_frame, text=ZONE_DESCRIPTIONS[zone_type],
                font=(UI.FONT_FAMILY, 11), text_color=UI.TEXT_COLOR, anchor="w"
            )
            desc.pack(anchor="w")

        return item

    def _create_parameter_display(self, parent, title, color):
        """Parameter display with pill header"""
        container = ctk.CTkFrame(parent, fg_color="transparent")

        # Title pill
        pill = ctk.CTkLabel(
            container, text=title,
            font=(UI.FONT_FAMILY, 14, "bold"),
            text_color=color,
            fg_color=self._lighten_color(color),
            corner_radius=16, padx=12, pady=6
        )
        pill.pack(anchor="w", pady=(0, 6))

        # Parameters
        params_frame = ctk.CTkFrame(container, fg_color="transparent")
        params_frame.pack(fill=tk.X, padx=8)

        return params_frame

    def _create_param_row(self, parent, name, value):
        """Parameter row"""
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill=tk.X, pady=2)

        label = ctk.CTkLabel(
            row, text=f"{name}: {value}",
            font=(UI.FONT_FAMILY, 14),
            text_color=UI.TEXT_PRIMARY, anchor="w"
        )
        label.pack(anchor="w")
        return label

    def _create_detection_section(self, parent, title):
        """Detection section with purple styling"""
        section = ctk.CTkFrame(
            parent, fg_color=UI.PRIMARY_LIGHT,
            corner_radius=12, border_width=1, border_color=UI.PRIMARY_BORDER
        )

        # Header
        header = ctk.CTkLabel(
            section, text=title,
            font=(UI.FONT_FAMILY, 14, "bold"),
            text_color=UI.PRIMARY, anchor="w"
        )
        header.pack(pady=(12, 8), padx=12, anchor="w")

        # Data box
        data_box = ctk.CTkTextbox(
            section, height=100,
            font=("Consolas", 10),
            fg_color="#fafafa",
            border_width=0, corner_radius=8, wrap="none"
        )
        data_box.pack(pady=(0, 12), padx=12, fill=tk.BOTH, expand=True)
        data_box.insert("1.0", "No data")
        data_box.configure(state="disabled")

        if "Obstacles" in title:
            self.obstacles_table = data_box
        else:
            self.diggables_table = data_box

        return section

    def _create_vertical_slider(self, parent, label, color, min_val, max_val):
        """Vertical slider with pill labels"""
        container = ctk.CTkFrame(parent, fg_color="transparent")

        # Top pill (value)
        self._slider_value_label = ctk.CTkLabel(
            container, text="0.0",
            font=(UI.FONT_FAMILY, 14, "bold"),
            text_color=color,
            fg_color=self._lighten_color(color),
            corner_radius=16, width=80, height=32
        )
        self._slider_value_label.pack(pady=(0, 8))

        # Slider
        slider_height = int(Environment.CANVAS_HEIGHT * 0.85)
        slider = ctk.CTkSlider(
            container, from_=max_val, to=min_val,
            orientation="vertical", height=slider_height, width=20,
            button_color=color, button_hover_color=color,
            progress_color=color, fg_color="#e8eaed",
            command=lambda v: self._on_slider_change(label, v)
        )
        slider.set(0)
        slider.pack(pady=8)

        # Bottom pill (label)
        label_pill = ctk.CTkLabel(
            container, text=label,
            font=(UI.FONT_FAMILY, 14, "bold"),
            text_color=color,
            fg_color=self._lighten_color(color),
            corner_radius=16, width=80, height=32
        )
        label_pill.pack(pady=(8, 0))

        if "Left" in label:
            self.torque_left_value_label = self._slider_value_label
            self.torque_left_slider_widget = slider
            self._torque_left_val = 0
        else:
            self.torque_right_value_label = self._slider_value_label
            self.torque_right_slider_widget = slider
            self._torque_right_val = 0

        return container

    def _on_slider_change(self, label, value):
        """Handle slider changes"""
        if "Left" in label:
            self._torque_left_val = value
            self.torque_left_value_label.configure(text=f"{value:.1f}")
        else:
            self._torque_right_val = value
            self.torque_right_value_label.configure(text=f"{value:.1f}")

    def _lighten_color(self, hex_color):
        """Lighten hex color for backgrounds"""
        hex_color = hex_color.lstrip('#')
        r, g, b = int(hex_color[:2], 16), int(hex_color[2:4], 16), int(hex_color[4:], 16)
        r = int(r + (255 - r) * 0.92)
        g = int(g + (255 - g) * 0.92)
        b = int(b + (255 - b) * 0.92)
        return f"#{r:02x}{g:02x}{b:02x}"

    def _update_ui_displays(self):
        """Update all UI"""
        # Highlight active zone in legend (like Angular)
        for zone_type, indicator in self.zone_indicators.items():
            if zone_type == self.environment.current_zone:
                indicator.configure(fg_color=UI.ACTIVE_ZONE_BG)  # Purple highlight
            else:
                indicator.configure(fg_color="transparent")

        # Update position
        x, y = self.environment.get_rover_position()
        self.pos_x_label.configure(text=f"x: {x:.3f}")
        self.pos_y_label.configure(text=f"y: {y:.3f}")

        # Update dig mode
        dig_status = "ON" if self.environment.dig_mode else "OFF"
        self.dig_mode_label.configure(text=f"Mode: {dig_status}")

        # Update obstacles
        self.obstacles_table.configure(state="normal")
        self.obstacles_table.delete("1.0", "end")
        if self.environment.obstacles:
            lines = []
            for i, obs in enumerate(self.environment.obstacles):
                obs_type = "Boulder" if isinstance(obs, Boulder) else "Crater"
                r = f"{obs.radius:.2f}" if hasattr(obs, 'radius') else "—"
                lines.append(f"{i+1:2}. {obs_type:8} x:{obs.x:5.2f} y:{obs.y:5.2f} r:{r}")
            self.obstacles_table.insert("1.0", "\n".join(lines))
        else:
            self.obstacles_table.insert("1.0", "No obstacles detected")
        self.obstacles_table.configure(state="disabled")

        # Update diggables
        self.diggables_table.configure(state="normal")
        self.diggables_table.delete("1.0", "end")
        self.diggables_table.insert("1.0", "No diggables detected")
        self.diggables_table.configure(state="disabled")

        # Apply torque from sliders (or reset if keyboard is used)
        if any(k in self.environment.keys_pressed for k in ['a', 'q', 'd', 'e']):
            # Keyboard is active - reset sliders to 0
            if self._torque_left_val != 0:
                self._torque_left_val = 0
                self.torque_left_slider_widget.set(0)
                self.torque_left_value_label.configure(text="0.0")
            if self._torque_right_val != 0:
                self._torque_right_val = 0
                self.torque_right_slider_widget.set(0)
                self.torque_right_value_label.configure(text="0.0")
        else:
            # No keyboard - apply slider values
            if abs(self._torque_left_val) > 0.1:
                self.environment.rover.torque_left(self._torque_left_val)
            if abs(self._torque_right_val) > 0.1:
                self.environment.rover.torque_right(self._torque_right_val)

    def _loop(self):
        self.environment.update()
        self._update_ui_displays()
        self.root.after(20, self._loop)


def main():
    root = ctk.CTk()
    root.geometry(f"{Window.width}x{Window.height}")
    app = MainWindow(root)
    root.mainloop()


if __name__ == "__main__":
    main()
