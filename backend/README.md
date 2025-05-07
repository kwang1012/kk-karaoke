#### Run celery worker (For separation tasks)
```bash
celery -A services.process_request.celery worker -l info --autoscale=5,3
```