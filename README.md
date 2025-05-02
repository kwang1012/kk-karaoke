# Karaoke App Starter

### How to Run

#### Backend (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn spleeter python-multipart
uvicorn main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
npm start
```

Ensure you have ffmpeg installed and available in your system PATH.