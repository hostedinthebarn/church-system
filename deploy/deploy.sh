#!/usr/bin/env bash
# Deploy a commit of church-system to the POC server. Run from a clean checkout:
#   deploy/deploy.sh <ssh-host> [git-ref]        (ref defaults to origin/main)
# Rules (Hosted in the Barn deploy rules):
#   - Allowlist, never denylist: only APP_PATHS leave this machine, taken from git, never the working tree.
#   - Scan what ships for secret-shaped text; any unreviewed hit stops the deploy.
#   - The built public/ folder may hold only web asset types.
#   - Check afterwards: the app answers on the server, and sensitive paths don't.
# Server layout (deploy/README.md): /opt/lgc/releases/<sha>, /opt/lgc/current -> the live one,
# uploads and data in /var/lib/lgc, settings in /etc/lgc/env, service church-system.service.
set -euo pipefail
host=${1:?usage: deploy/deploy.sh <ssh-host> [git-ref]}
ref=${2:-origin/main}
APP_PATHS=(app.js package.json package-lock.json lib modules packages sites LICENSE THIRD-PARTY-NOTICES.md)
# Reviewed false positives: path<TAB>exact phrase. A row exempts only that phrase on that file.
ALLOW=$'lib/mail.js\tauthorization: `Bearer ${apiKey}`
lib/mail.js\tapiKey, from, fetchImpl
lib/mail.js\tif (!apiKey) {
lib/mail.js\tThe Resend sender needs RESEND_API_KEY
lib/mail.js\t// RESEND_API_KEY, CHURCH_MAIL_FROM: Resend only
lib/mail.js\tapiKey: env.RESEND_API_KEY,
modules/church-signin/index.js\t// Passwordless sign-in
modules/church-signin/index.js\tpassword: crypto.randomBytes(48)
modules/church-site/i18n/church/en.json\tThere is no password.
lib/signin.js\t\'?\'}token=${encodeURIComponent(token)}'
PATTERNS='client_secret|GOCSPX-|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|refresh_token|AKIA[0-9A-Z]{16}|Bearer |password|token='

git fetch -q origin
sha=$(git rev-parse --short=12 "$ref^{commit}")
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
git archive --format=tar "$sha" "${APP_PATHS[@]}" >"$work/app.tar"
mkdir "$work/x"; tar -xf "$work/app.tar" -C "$work/x"
echo "deploy $sha: $(find "$work/x" -type f | wc -l | tr -d ' ') files"

# Secret scan of exactly what ships.
fail=0
while IFS= read -r hit; do
  file=${hit%%:*}; rest=${hit#*:}; line=${rest%%:*}; text=${rest#*:}
  while IFS=$'\t' read -r path phrase; do
    [ "$file" = "$path" ] && text=${text//"$phrase"/}
  done <<<"$ALLOW"
  if printf '%s\n' "$text" | grep -qiE "$PATTERNS"; then echo "secret-shaped text in $file:$line (not printed)"; fail=1; fi
done < <(cd "$work/x" && grep -rniIE "$PATTERNS" . | sed 's|^\./||' || true)
[ "$fail" = 0 ] || { echo "ABORT: unreviewed hit. Remove it, or review it and add a row to ALLOW." >&2; exit 1; }

scp -q "$work/app.tar" "$host:/tmp/church-system-$sha.tar"
ssh "$host" "bash -s -- $sha" <<'REMOTE'
set -euo pipefail
sha=$1; rel=/opt/lgc/releases/$sha
as_lgc() { runuser -u lgc -- env HOME=/opt/lgc bash -c "set -a; . /etc/lgc/env; set +a; cd $rel; $1"; }
rm -rf "$rel"; install -d -o lgc -g lgc "$rel"
tar -xf "/tmp/church-system-$sha.tar" -C "$rel"; rm "/tmp/church-system-$sha.tar"
echo "$sha" >"$rel/release-id"   # Apostrophe needs a release id in production; there is no git here
chown -R lgc:lgc "$rel"
as_lgc "npm ci --omit=dev --no-audit --no-fund --loglevel=error"
install -d -o lgc -g lgc "$rel/public"
ln -sfn /var/lib/lgc/uploads "$rel/public/uploads"
ln -sfn /var/lib/lgc/data "$rel/data"
as_lgc "APOS_RELEASE_ID=$sha node app @apostrophecms/asset:build" >/dev/null
# The web root may hold only web asset types (uploads are checked by type at upload time).
bad=$(find -L "$rel/public" -path "$rel/public/uploads" -prune -o -type f -print \
  | grep -viE '\.(html|css|js|map|mjs|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|txt|xml|pdf)$' || true)
[ -z "$bad" ] || { echo "ABORT: non-web files in public/:"; echo "$bad" | sed "s|$rel/||" | head; exit 1; }
ln -sfn "$rel" /opt/lgc/current.new && mv -T /opt/lgc/current.new /opt/lgc/current
systemctl restart church-system
for i in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>/dev/null && break; sleep 2; done
code() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$1"; }
echo "on the server: / $(code /)  /calendar $(code /calendar)  /sign-in $(code /sign-in)"
[ "$(code /)" = 200 ] || { echo "ABORT CHECK: / did not answer 200; see journalctl -u church-system"; exit 1; }
for p in /package.json /package-lock.json /app.js /release-id /.env /.git/config /data/ /data/temp /lib/mail.js /modules/church-signin/index.js /sites/la-grange/config.js /node_modules/apostrophe/package.json /dev/outbox; do
  # Follow redirects: Apostrophe sends /x/ to /x, and what counts is the final answer.
  c=$(curl -sL -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$p"); case $c in 404|403) ;; *) echo "ABORT CHECK: $p answered $c"; exit 1 ;; esac
done
echo "sensitive paths: 404/403"
ls -1dt /opt/lgc/releases/* | tail -n +4 | xargs -r rm -rf   # keep the three newest releases
echo "live: $(readlink /opt/lgc/current)"
REMOTE
