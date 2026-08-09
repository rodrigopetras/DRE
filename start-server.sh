#!/bin/bash
# DRE Online - Dev server with keepalive heartbeat
cd /home/z/my-project
pkill -f 'next dev' 2>/dev/null
sleep 1

rm -f dev.log
NODE_OPTIONS='--max-old-space-size=2048' npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to start
echo "Waiting for server..."
for i in $(seq 1 60); do
  if curl -s -m 2 -o /dev/null http://localhost:3000/ 2>/dev/null; then
    echo "Server ready!"
    break
  fi
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "Server crashed during startup"
    exit 1
  fi
  sleep 1
done

# Warmup all routes
echo "Warming up routes..."
curl -s -m 120 -o /dev/null http://localhost:3000/
curl -s -m 30 -o /dev/null http://localhost:3000/api/auth/csrf
curl -s -m 30 -o /dev/null -X POST -H 'Content-Type: application/json' -d '{"name":"_warmup","email":"_warmup@test.com","password":"123456"}' http://localhost:3000/api/auth/register
curl -s -m 30 -o /dev/null http://localhost:3000/api/auth/providers
echo "Warmup complete!"

# Keepalive heartbeat to prevent inactivity timeout
while kill -0 $SERVER_PID 2>/dev/null; do
  sleep 15
  curl -s -m 5 -o /dev/null http://localhost:3000/api/auth/providers 2>/dev/null
done
echo "Server exited at $(date)"
