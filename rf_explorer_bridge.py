#!/usr/bin/env python3
"""
RF Explorer WebSocket Bridge Server
===================================

This bridge allows the RF Site Assessment webapp to connect to the RF Explorer
when the Web Serial API is not available (e.g., Firefox, Safari) or when you
need more reliable serial communication.

Requirements:
    pip install pyserial websockets

Usage:
    python rf_explorer_bridge.py [--port COM3] [--ws-port 8765]
    
    On Windows: python rf_explorer_bridge.py --port COM3
    On Mac/Linux: python rf_explorer_bridge.py --port /dev/ttyUSB0

The bridge will:
1. Connect to the RF Explorer via serial port
2. Start a WebSocket server on localhost:8765
3. Forward data between the webapp and RF Explorer

Author: RF Site Assessment Tool
Version: 1.0.0
"""

import asyncio
import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, asdict
from typing import Optional, List, Set
import base64

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("Error: pyserial not installed. Run: pip install pyserial")
    sys.exit(1)

try:
    import websockets
    from websockets.server import serve
except ImportError:
    print("Error: websockets not installed. Run: pip install websockets")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class SweepConfig:
    """RF Explorer sweep configuration"""
    start_freq_mhz: float = 1990.0
    end_freq_mhz: float = 6000.0
    steps: int = 112
    rbw_khz: float = 600.0


@dataclass
class SweepData:
    """Sweep data point"""
    frequency: float  # MHz
    amplitude: float  # dBm


class RFExplorerSerial:
    """
    RF Explorer serial communication handler.
    
    Handles the binary protocol used by RF Explorer devices.
    Reference: https://github.com/RFExplorer/RFExplorer-for-Python
    """
    
    BAUD_RATE = 500000  # RF Explorer 6G uses 500000 baud
    
    def __init__(self, port: str):
        self.port = port
        self.serial: Optional[serial.Serial] = None
        self.config = SweepConfig()
        self.buffer = bytearray()
        self.is_connected = False
        
    def connect(self) -> bool:
        """Connect to RF Explorer"""
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.BAUD_RATE,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.1,
                write_timeout=1.0
            )
            self.is_connected = True
            logger.info(f"Connected to RF Explorer on {self.port}")
            
            # Request current configuration
            time.sleep(0.5)
            self.request_config()
            
            return True
        except serial.SerialException as e:
            logger.error(f"Failed to connect: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from RF Explorer"""
        if self.serial and self.serial.is_open:
            self.serial.close()
        self.is_connected = False
        logger.info("Disconnected from RF Explorer")
    
    def send_command(self, cmd: str):
        """Send command to RF Explorer"""
        if self.serial and self.serial.is_open:
            data = (cmd + '\r\n').encode('ascii')
            self.serial.write(data)
            logger.debug(f"Sent command: {cmd}")
    
    def request_config(self):
        """Request current configuration from device"""
        self.send_command('#0C0')
    
    def set_frequency_range(self, start_mhz: float, end_mhz: float):
        """Set frequency sweep range"""
        start_khz = int(start_mhz * 1000)
        span_khz = int((end_mhz - start_mhz) * 1000)
        cmd = f'#0C2-F:{start_khz:07d},{span_khz:07d}'
        self.send_command(cmd)
        self.config.start_freq_mhz = start_mhz
        self.config.end_freq_mhz = end_mhz
    
    def start_sweep(self):
        """Start continuous sweep mode"""
        self.send_command('#0C3')
    
    def stop_sweep(self):
        """Stop sweep (hold)"""
        self.send_command('#0CH')
    
    def read_data(self) -> List[dict]:
        """
        Read and parse data from RF Explorer.
        Returns list of parsed messages.
        """
        messages = []
        
        if not self.serial or not self.serial.is_open:
            return messages
        
        # Read available data
        try:
            if self.serial.in_waiting > 0:
                data = self.serial.read(self.serial.in_waiting)
                self.buffer.extend(data)
        except serial.SerialException as e:
            logger.error(f"Serial read error: {e}")
            return messages
        
        # Parse complete messages from buffer
        while len(self.buffer) > 0:
            # Look for message start marker '$'
            try:
                start_idx = self.buffer.index(ord('$'))
            except ValueError:
                self.buffer.clear()
                break
            
            if start_idx > 0:
                self.buffer = self.buffer[start_idx:]
            
            if len(self.buffer) < 3:
                break
            
            msg_type = chr(self.buffer[1])
            
            if msg_type == 'S':  # Sweep data
                message = self._parse_sweep()
                if message:
                    messages.append(message)
                else:
                    break
            elif msg_type == 'C':  # Configuration
                message = self._parse_config()
                if message:
                    messages.append(message)
                else:
                    break
            else:
                # Skip unknown message type
                self.buffer = self.buffer[1:]
        
        return messages
    
    def _parse_sweep(self) -> Optional[dict]:
        """Parse sweep data message"""
        if len(self.buffer) < 4:
            return None
        
        steps = self.buffer[2]
        expected_length = 3 + steps + 1  # $S + steps byte + data + EOL
        
        if len(self.buffer) < expected_length:
            return None
        
        # Extract amplitude data
        sweep_data = []
        freq_step = (self.config.end_freq_mhz - self.config.start_freq_mhz) / (steps - 1) if steps > 1 else 0
        
        for i in range(steps):
            raw_value = self.buffer[3 + i]
            amplitude_dbm = -raw_value / 2.0  # Each unit = -0.5 dBm
            frequency_mhz = self.config.start_freq_mhz + (i * freq_step)
            sweep_data.append({
                'frequency': round(frequency_mhz, 3),
                'amplitude': round(amplitude_dbm, 1)
            })
        
        # Remove processed message from buffer
        self.buffer = self.buffer[expected_length:]
        
        return {
            'type': 'sweep',
            'timestamp': int(time.time() * 1000),
            'config': asdict(self.config),
            'data': sweep_data
        }
    
    def _parse_config(self) -> Optional[dict]:
        """Parse configuration message"""
        # Find end of line
        eol_idx = -1
        for i in range(min(len(self.buffer), 100)):
            if self.buffer[i] in (0x0D, 0x0A):
                eol_idx = i
                break
        
        if eol_idx == -1:
            if len(self.buffer) < 100:
                return None
            eol_idx = 50  # Fallback
        
        try:
            config_str = self.buffer[2:eol_idx].decode('ascii')
            
            # Parse configuration (format varies by firmware)
            if len(config_str) >= 14:
                start_freq_khz = int(config_str[0:7])
                freq_span_khz = int(config_str[7:14])
                
                self.config.start_freq_mhz = start_freq_khz / 1000.0
                self.config.end_freq_mhz = self.config.start_freq_mhz + (freq_span_khz / 1000.0)
                
                logger.info(f"Config updated: {self.config.start_freq_mhz:.3f} - {self.config.end_freq_mhz:.3f} MHz")
        except (ValueError, UnicodeDecodeError) as e:
            logger.warning(f"Config parse error: {e}")
        
        self.buffer = self.buffer[eol_idx + 1:]
        
        return {
            'type': 'config',
            'config': asdict(self.config)
        }


class WebSocketBridge:
    """
    WebSocket server that bridges the webapp to RF Explorer.
    Supports delta encoding for bandwidth optimization.
    """
    
    def __init__(self, rf_explorer: RFExplorerSerial, host: str = 'localhost', port: int = 8765):
        self.rf_explorer = rf_explorer
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.client_settings = {}  # Per-client settings
        self.running = False
        self.baseline_spectrum = {}  # Per-client baseline for delta encoding
    
    async def handler(self, websocket: websockets.WebSocketServerProtocol):
        """Handle WebSocket connection"""
        self.clients.add(websocket)
        client_id = id(websocket)
        client_addr = websocket.remote_address
        
        # Initialize client settings
        self.client_settings[client_id] = {
            'use_delta_encoding': False,
            'delta_threshold_db': 1.0,  # Only send if amplitude changed >1dB
            'baseline_refresh_interval': 60,  # Refresh baseline every 60s
            'last_baseline_time': time.time()
        }
        
        logger.info(f"Client connected: {client_addr}")
        
        try:
            # Send current config on connect
            if self.rf_explorer.is_connected:
                await websocket.send(json.dumps({
                    'type': 'connected',
                    'config': asdict(self.rf_explorer.config),
                    'features': ['delta_encoding']  # Advertise capabilities
                }))
            
            async for message in websocket:
                await self.handle_client_message(websocket, message)
                
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            self.client_settings.pop(client_id, None)
            self.baseline_spectrum.pop(client_id, None)
            logger.info(f"Client disconnected: {client_addr}")
    
    async def handle_client_message(self, websocket, message: str):
        """Handle incoming message from webapp"""
        try:
            msg = json.loads(message)
            msg_type = msg.get('type')
            client_id = id(websocket)
            
            if msg_type == 'command':
                cmd = msg.get('command', '')
                self.rf_explorer.send_command(cmd)
                logger.debug(f"Forwarded command: {cmd}")
                
            elif msg_type == 'set_frequency':
                start = msg.get('start_mhz', 1990)
                end = msg.get('end_mhz', 6000)
                self.rf_explorer.set_frequency_range(start, end)
                
            elif msg_type == 'start':
                self.rf_explorer.start_sweep()
                
            elif msg_type == 'stop':
                self.rf_explorer.stop_sweep()
            
            elif msg_type == 'enable_delta_encoding':
                # Client requests delta encoding
                enabled = msg.get('enabled', True)
                self.client_settings[client_id]['use_delta_encoding'] = enabled
                logger.info(f"Delta encoding {'enabled' if enabled else 'disabled'} for client {client_id}")
                
                # Send acknowledgment
                await websocket.send(json.dumps({
                    'type': 'delta_encoding_status',
                    'enabled': enabled
                }))
            
            elif msg_type == 'request_baseline':
                # Client requests new baseline (for resync)
                self.baseline_spectrum.pop(client_id, None)
                logger.debug(f"Baseline reset requested for client {client_id}")
                
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON from client: {message}")
    
    def _generate_delta_sweep(self, client_id: int, full_sweep: dict) -> dict:
        """
        Generate delta-encoded sweep data.
        Only includes points that changed significantly from baseline.
        """
        settings = self.client_settings.get(client_id, {})
        threshold = settings.get('delta_threshold_db', 1.0)
        current_time = time.time()
        last_baseline_time = settings.get('last_baseline_time', 0)
        refresh_interval = settings.get('baseline_refresh_interval', 60)
        
        # Check if baseline refresh needed
        needs_refresh = (current_time - last_baseline_time) > refresh_interval
        
        # Get baseline for this client
        baseline = self.baseline_spectrum.get(client_id)
        
        # If no baseline or refresh needed, send full spectrum as new baseline
        if baseline is None or needs_refresh:
            self.baseline_spectrum[client_id] = full_sweep['data'][:]
            settings['last_baseline_time'] = current_time
            return {
                **full_sweep,
                'baseline': True,
                'encoding': 'full'
            }
        
        # Generate deltas
        deltas = []
        for i, point in enumerate(full_sweep['data']):
            if i >= len(baseline):
                # New point added (shouldn't happen normally)
                deltas.append({
                    'index': i,
                    'frequency': point['frequency'],
                    'amplitude': point['amplitude']
                })
            else:
                # Check if amplitude changed significantly
                amp_diff = abs(point['amplitude'] - baseline[i]['amplitude'])
                if amp_diff >= threshold:
                    deltas.append({
                        'index': i,
                        'frequency': point['frequency'],  # Include for validation
                        'amplitude': point['amplitude']
                    })
        
        # Update baseline
        for delta in deltas:
            baseline[delta['index']] = {
                'frequency': delta['frequency'],
                'amplitude': delta['amplitude']
            }
        
        # Calculate compression ratio
        original_size = len(full_sweep['data']) * 16  # rough estimate: 16 bytes per point
        delta_size = len(deltas) * 20  # rough estimate: 20 bytes per delta
        compression_ratio = (1 - delta_size / original_size) * 100 if original_size > 0 else 0
        
        logger.debug(f"Delta sweep: {len(deltas)}/{len(full_sweep['data'])} points changed ({compression_ratio:.1f}% compression)")
        
        return {
            'type': 'sweep',
            'timestamp': full_sweep['timestamp'],
            'config': full_sweep['config'],
            'encoding': 'delta',
            'deltas': deltas,
            'baseline_age': current_time - last_baseline_time,
            'compression_ratio': compression_ratio
        }
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        if self.clients:
            # Send to each client with their preferred encoding
            for client in self.clients:
                client_id = id(client)
                settings = self.client_settings.get(client_id, {})
                
                # If this is a sweep and delta encoding is enabled, encode it
                if message.get('type') == 'sweep' and settings.get('use_delta_encoding'):
                    encoded_msg = self._generate_delta_sweep(client_id, message)
                else:
                    encoded_msg = message
                
                try:
                    data = json.dumps(encoded_msg)
                    await client.send(data)
                except Exception as e:
                    logger.error(f"Broadcast error to client {client_id}: {e}")
    
    async def read_loop(self):
        """Continuously read from RF Explorer and broadcast"""
        while self.running:
            messages = self.rf_explorer.read_data()
            for msg in messages:
                await self.broadcast(msg)
            await asyncio.sleep(0.01)  # Small delay to prevent CPU spin
    
    async def run(self):
        """Start the WebSocket server"""
        self.running = True
        
        # Start the read loop
        read_task = asyncio.create_task(self.read_loop())
        
        # Start WebSocket server
        async with serve(self.handler, self.host, self.port):
            logger.info(f"WebSocket server started on ws://{self.host}:{self.port}")
            logger.info("Waiting for webapp connections...")
            
            try:
                await asyncio.Future()  # Run forever
            except asyncio.CancelledError:
                pass
        
        self.running = False
        read_task.cancel()


def list_serial_ports():
    """List available serial ports"""
    ports = serial.tools.list_ports.comports()
    
    if not ports:
        print("No serial ports found.")
        return
    
    print("\nAvailable serial ports:")
    print("-" * 60)
    
    for port in ports:
        print(f"  {port.device}")
        print(f"    Description: {port.description}")
        if port.manufacturer:
            print(f"    Manufacturer: {port.manufacturer}")
        if port.vid and port.pid:
            print(f"    VID:PID: {port.vid:04X}:{port.pid:04X}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description='RF Explorer WebSocket Bridge Server',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  List available ports:
    python rf_explorer_bridge.py --list
    
  Connect on Windows:
    python rf_explorer_bridge.py --port COM3
    
  Connect on Mac/Linux:
    python rf_explorer_bridge.py --port /dev/ttyUSB0
    
  Custom WebSocket port:
    python rf_explorer_bridge.py --port COM3 --ws-port 9000
"""
    )
    
    parser.add_argument(
        '--port', '-p',
        help='Serial port for RF Explorer (e.g., COM3, /dev/ttyUSB0)'
    )
    parser.add_argument(
        '--ws-port', '-w',
        type=int,
        default=8765,
        help='WebSocket server port (default: 8765)'
    )
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List available serial ports'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    if args.list:
        list_serial_ports()
        return
    
    if not args.port:
        print("Error: Serial port required. Use --port to specify.")
        print("       Use --list to see available ports.")
        sys.exit(1)
    
    # Create RF Explorer connection
    rf_explorer = RFExplorerSerial(args.port)
    
    if not rf_explorer.connect():
        print(f"Failed to connect to RF Explorer on {args.port}")
        sys.exit(1)
    
    # Create and run WebSocket bridge
    bridge = WebSocketBridge(rf_explorer, port=args.ws_port)
    
    print()
    print("=" * 60)
    print("RF Explorer WebSocket Bridge")
    print("=" * 60)
    print(f"  Serial Port: {args.port}")
    print(f"  WebSocket:   ws://localhost:{args.ws_port}")
    print()
    print("  In the webapp, use 'Connect via WebSocket' and enter:")
    print(f"    ws://localhost:{args.ws_port}")
    print()
    print("  Press Ctrl+C to stop the bridge")
    print("=" * 60)
    print()
    
    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        rf_explorer.disconnect()


if __name__ == '__main__':
    main()
