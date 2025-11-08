"""
WebSocket server for streaming training metrics to Angular dashboard.
"""

from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import threading
import time
from typing import Dict, List
from dataclasses import dataclass, asdict
import json


@dataclass
class TrainingMetrics:
    """Training metrics snapshot"""
    episode: int
    step: int
    episode_reward: float
    avg_reward_100: float
    episode_length: int
    loss: float
    learning_rate: float
    exploration_rate: float
    orbs_collected: int
    orbs_deposited: int
    success_rate: float
    steps_per_sec: float
    timestamp: float


class MetricsServer:
    """
    WebSocket server for real-time training metrics.
    Runs in a background thread and broadcasts updates to connected clients.
    """

    def __init__(self, host: str = 'localhost', port: int = 5000):
        self.host = host
        self.port = port
        self.app = Flask(__name__)
        CORS(self.app)
        self.socketio = SocketIO(self.app, cors_allowed_origins="*", async_mode='threading')

        # Metrics storage
        self.current_metrics: Dict = {}
        self.metrics_history: List[TrainingMetrics] = []
        self.max_history = 10000  # Keep last 10k episodes

        # Training state
        self.is_training = False
        self.training_config = {}

        # Setup routes
        self._setup_routes()

        # Server thread
        self.server_thread = None

    def _setup_routes(self):
        """Setup Flask routes and SocketIO events"""

        @self.app.route('/health', methods=['GET'])
        def health():
            return {'status': 'ok', 'is_training': self.is_training}

        @self.app.route('/metrics', methods=['GET'])
        def get_metrics():
            """Get current metrics"""
            return self.current_metrics

        @self.app.route('/history', methods=['GET'])
        def get_history():
            """Get metrics history"""
            limit = request.args.get('limit', 1000, type=int)
            return {'history': [asdict(m) for m in self.metrics_history[-limit:]]}

        @self.app.route('/config', methods=['GET'])
        def get_config():
            """Get training configuration"""
            return self.training_config

        @self.app.route('/config', methods=['POST'])
        def update_config():
            """Update training configuration"""
            self.training_config.update(request.json)
            self.socketio.emit('config_updated', self.training_config)
            return {'status': 'ok', 'config': self.training_config}

        @self.app.route('/control/start', methods=['POST'])
        def start_training():
            """Start training signal"""
            self.is_training = True
            self.socketio.emit('training_started', {})
            return {'status': 'ok'}

        @self.app.route('/control/stop', methods=['POST'])
        def stop_training():
            """Stop training signal"""
            self.is_training = False
            self.socketio.emit('training_stopped', {})
            return {'status': 'ok'}

        @self.app.route('/control/save', methods=['POST'])
        def save_model():
            """Trigger model save"""
            self.socketio.emit('save_model', {})
            return {'status': 'ok'}

        @self.socketio.on('connect')
        def handle_connect():
            print(f"Client connected: {request.sid}")
            # Send current state to new client
            emit('current_metrics', self.current_metrics)
            emit('training_config', self.training_config)
            emit('training_status', {'is_training': self.is_training})

        @self.socketio.on('disconnect')
        def handle_disconnect():
            print(f"Client disconnected: {request.sid}")

        @self.socketio.on('request_history')
        def handle_history_request(data):
            limit = data.get('limit', 1000)
            history = [asdict(m) for m in self.metrics_history[-limit:]]
            emit('history_data', {'history': history})

    def start(self):
        """Start the server in a background thread"""
        if self.server_thread is None or not self.server_thread.is_alive():
            self.server_thread = threading.Thread(
                target=self._run_server,
                daemon=True
            )
            self.server_thread.start()
            print(f"Metrics server started on {self.host}:{self.port}")
            time.sleep(1)  # Give server time to start

    def _run_server(self):
        """Run the Flask-SocketIO server"""
        self.socketio.run(
            self.app,
            host=self.host,
            port=self.port,
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True
        )

    def update_metrics(self, metrics: TrainingMetrics):
        """
        Update current metrics and broadcast to clients.

        Args:
            metrics: TrainingMetrics object
        """
        self.current_metrics = asdict(metrics)
        self.metrics_history.append(metrics)

        # Trim history if too long
        if len(self.metrics_history) > self.max_history:
            self.metrics_history = self.metrics_history[-self.max_history:]

        # Broadcast to all connected clients
        self.socketio.emit('metrics_update', self.current_metrics)

    def update_config(self, config: Dict):
        """Update training configuration"""
        self.training_config = config
        self.socketio.emit('config_updated', config)

    def set_training_status(self, is_training: bool):
        """Update training status"""
        self.is_training = is_training
        self.socketio.emit('training_status', {'is_training': is_training})

    def broadcast_message(self, event: str, data: Dict):
        """Broadcast a custom message to all clients"""
        self.socketio.emit(event, data)

    def stop(self):
        """Stop the server"""
        if self.server_thread and self.server_thread.is_alive():
            self.socketio.stop()
            print("Metrics server stopped")


# Global server instance (singleton)
_server_instance = None


def get_metrics_server(host: str = 'localhost', port: int = 5000) -> MetricsServer:
    """Get or create the global metrics server instance"""
    global _server_instance
    if _server_instance is None:
        _server_instance = MetricsServer(host, port)
    return _server_instance
