#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Running Prisma migrations..."
  npx prisma db push --skip-generate
fi

exec "$@"
