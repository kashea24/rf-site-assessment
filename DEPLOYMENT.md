# Deployment Guide

## Current Status
✅ Local development server running on http://localhost:3000
✅ Code pushed to GitHub: https://github.com/kashea24/rf-site-assessment

## Deploying to Railway (When Ready)

### Prerequisites
1. Railway account: https://railway.app
2. Connect your GitHub account to Railway

### Deployment Steps

1. **Login to Railway**
   - Go to https://railway.app
   - Sign in with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `kashea24/rf-site-assessment`

3. **Configure Build Settings** (Railway should auto-detect these)
   - Build Command: `npm run build`
   - Start Command: Railway will auto-serve the static files from `dist`
   - Root Directory: `/`

4. **Environment Variables**
   - None required for basic deployment
   - Railway will automatically serve the static site

5. **Deploy**
   - Click "Deploy"
   - Railway will build and deploy your app
   - You'll get a URL like `rf-site-assessment-production.up.railway.app`

### Alternative: Manual Railway Deployment

If you prefer using Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project (in your project directory)
cd "/Users/kevin/Dropbox (Personal)/Development/TestRF"
railway init

# Deploy
railway up
```

### Post-Deployment

After deployment, your app will be live with:
- ✅ Web Serial API support (Chrome/Edge only)
- ✅ WebSocket fallback via Python bridge (requires separate hosting)
- ✅ All RF testing features

### Python WebSocket Bridge Deployment

For the WebSocket fallback server (`rf_explorer_bridge.py`), you'll need to:

1. Deploy it separately (Railway, Heroku, or VPS)
2. Update the WebSocket URL in the app to point to your hosted bridge
3. Ensure the bridge server has access to the RF Explorer hardware

**Note:** The Web Serial API (direct USB connection) works client-side and doesn't require the Python bridge for Chrome/Edge users.

## Local Development

To run locally:

```bash
# Install dependencies (already done)
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing the Python Bridge Locally

If you want to test the WebSocket fallback:

```bash
# Install Python dependencies
pip install pyserial websockets

# List available serial ports
python rf_explorer_bridge.py --list

# Start the bridge (replace COM3 with your port)
python rf_explorer_bridge.py --port /dev/tty.usbserial-XXXXX
```

The bridge will run on `ws://localhost:8765` and the webapp will automatically detect it.
