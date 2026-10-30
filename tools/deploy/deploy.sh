#!/bin/sh
# Rolls the committed state of HEAD out to the production server.
#
# Host details stay out of the public repo: copy tools/deploy/deploy.example to
# .deploy.local and fill it in. The server keeps its data/ folder and .env file.
#
#   sh tools/deploy/deploy.sh
set -eu

cd "$(dirname "$0")/../.."
. ./.deploy.local

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first: only committed code gets deployed." >&2
  exit 1
fi

commit=$(git rev-parse --short HEAD)
archive=$(mktemp -t lsg-XXXXXX.tar)
trap 'rm -f "$archive"' EXIT
git archive --format=tar -o "$archive" HEAD

echo "Uploading $commit to $LSG_DEPLOY_HOST"
"$LSG_DEPLOY_SCP" -q -batch -P "$LSG_DEPLOY_PORT" -hostkey "$LSG_DEPLOY_HOSTKEY" -i "$LSG_DEPLOY_KEY" \
  "$(cygpath -w "$archive" 2>/dev/null || echo "$archive")" "$LSG_DEPLOY_HOST:/tmp/lsg-release.tar"

"$LSG_DEPLOY_SSH" -batch -ssh -P "$LSG_DEPLOY_PORT" -hostkey "$LSG_DEPLOY_HOSTKEY" -i "$LSG_DEPLOY_KEY" \
  "$LSG_DEPLOY_HOST" "sh -s $LSG_DEPLOY_DIR $commit" <<'REMOTE'
set -eu
dir=$1
commit=$2
cd "$dir"
# Replace the code completely so removed files disappear; data/ and .env stay.
find . -mindepth 1 -maxdepth 1 ! -name data ! -name .env -exec rm -rf {} +
tar -xf /tmp/lsg-release.tar
rm /tmp/lsg-release.tar
echo "$commit" > REVISION
sed -i '/^LSG_BUILD_ID=/d' .env
echo "LSG_BUILD_ID=$commit" >> .env
docker compose build --quiet
systemctl reload docker-compose@lsg
for attempt in $(seq 1 30); do
  if [ "$(curl -s -m 3 "http://127.0.0.1:$(sed -n 's/^LSG_HTTP_PORT=//p' .env)/version.json")" != "" ] &&
     [ "$(docker compose ps --format '{{.Status}}' | grep -c '(healthy)')" = "2" ]; then
    echo "Live: $(curl -s "http://127.0.0.1:$(sed -n 's/^LSG_HTTP_PORT=//p' .env)/version.json")"
    exit 0
  fi
  sleep 2
done
echo "Stack did not become healthy" >&2
docker compose ps >&2
exit 1
REMOTE
