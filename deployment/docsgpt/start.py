"""Keep API and one ingestion worker on the same persistent data volume."""
import os
import pwd
from pathlib import Path
import signal
import subprocess
import sys
import time

# Railway mounts a new volume as root. Hand ownership to the image's app user
# before dropping privileges for both API and worker.
if os.geteuid()==0:
    app=pwd.getpwnam('appuser')
    Path('/data').mkdir(parents=True,exist_ok=True)
    os.chown('/data',app.pw_uid,app.pw_gid)
    os.setgroups([])
    os.setgid(app.pw_gid)
    os.setuid(app.pw_uid)

children=[]
def stop(*_):
    for child in children:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
    deadline=time.monotonic()+25
    for child in children:
        try: child.wait(timeout=max(0.1,deadline-time.monotonic()))
        except subprocess.TimeoutExpired: os.killpg(child.pid,signal.SIGKILL)
    sys.exit(0)

signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
for name in ['inputs','indexes','vectors','models']:
    Path('/data',name).mkdir(parents=True,exist_ok=True)
commands=[
    ['celery','-A','docsgpt.app.celery','worker','-l','WARNING','--concurrency=1','-Q','docsgpt,parsing,embeddings'],
    ['gunicorn','-w','1','-k','docsgpt.gunicorn_worker.BoundedDrainUvicornWorker','--bind','[::]:7091','--timeout','180','--graceful-timeout','30','--config','docsgpt/gunicorn_conf.py','docsgpt.asgi:asgi_app']
]
for command in commands:
    children.append(subprocess.Popen(command,start_new_session=True))
while all(child.poll() is None for child in children): time.sleep(1)
# Stop the other process too; Railway restarts the whole unit on failure.
for child in children:
    if child.poll() is None:
        os.killpg(child.pid,signal.SIGTERM)
sys.exit(1)
