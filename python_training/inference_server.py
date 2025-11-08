"""
Inference server that loads a trained model and provides predictions.
Angular app connects to this to visualize the trained agent.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import numpy as np
from stable_baselines3 import PPO
from pathlib import Path
import argparse

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Global model
model = None
model_name = None


@app.route('/health', methods=['GET'])
def health():
    """Check if server is running and model is loaded"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'model_name': model_name
    })


@app.route('/load_model', methods=['POST'])
def load_model():
    """Load a model from a .zip file"""
    global model, model_name

    data = request.json
    model_path = data.get('model_path')

    if not model_path:
        return jsonify({'error': 'No model_path provided'}), 400

    try:
        print(f"Loading model from: {model_path}")
        model = PPO.load(model_path)
        model_name = Path(model_path).stem
        print(f"Model loaded successfully: {model_name}")

        return jsonify({
            'status': 'success',
            'model_name': model_name
        })
    except Exception as e:
        print(f"Error loading model: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/predict', methods=['POST'])
def predict():
    """Get action prediction from the model"""
    global model

    if model is None:
        return jsonify({'error': 'No model loaded'}), 400

    try:
        data = request.json
        observation = np.array(data['observation'], dtype=np.float32)

        # Get prediction from model
        action, _states = model.predict(observation, deterministic=True)

        return jsonify({
            'action': action.tolist()
        })
    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/models', methods=['GET'])
def list_models():
    """List available model checkpoints"""
    checkpoint_dir = Path('checkpoints')

    if not checkpoint_dir.exists():
        return jsonify({'models': []})

    models = []
    for model_file in checkpoint_dir.glob('*.zip'):
        models.append({
            'name': model_file.stem,
            'path': str(model_file.with_suffix('')),  # Remove .zip extension
            'size': model_file.stat().st_size
        })

    # Sort by name
    models.sort(key=lambda x: x['name'])

    return jsonify({'models': models})


@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    emit('server_status', {
        'model_loaded': model is not None,
        'model_name': model_name
    })


@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")


def main():
    parser = argparse.ArgumentParser(description='Model inference server')
    parser.add_argument('--port', type=int, default=5001, help='Port to run server on')
    parser.add_argument('--model', type=str, help='Model to load on startup')

    args = parser.parse_args()

    # Load model if provided
    if args.model:
        global model, model_name
        try:
            print(f"Loading model: {args.model}")
            model = PPO.load(args.model)
            model_name = Path(args.model).stem
            print(f"Model loaded: {model_name}")
        except Exception as e:
            print(f"Error loading model: {e}")

    print(f"\n{'='*60}")
    print(f"Inference Server Starting on port {args.port}")
    print(f"{'='*60}\n")
    print(f"Angular app can connect to: http://localhost:{args.port}")
    print(f"Available endpoints:")
    print(f"  GET  /health        - Check server status")
    print(f"  GET  /models        - List available models")
    print(f"  POST /load_model    - Load a model")
    print(f"  POST /predict       - Get action prediction")
    print(f"\nPress Ctrl+C to stop\n")

    socketio.run(app, host='localhost', port=args.port, debug=False, allow_unsafe_werkzeug=True)


if __name__ == '__main__':
    main()
