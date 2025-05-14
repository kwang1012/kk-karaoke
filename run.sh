#!/bin/sh

# For backend
redis-server --daemonize yes

# Start FastAPI backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 7860
