# Server Operations — FNB Aqua Test Instance

Day-to-day runbook for the AWS free-tier test instance: connecting,
stopping/starting the EC2 instance itself, starting/checking Docker, and
updating the running site with new code. For the one-time setup history and
the specific resource IDs (instance ID, security group, key pair), see
`AWS_DEPLOYMENT_LOG.md`.

Current instance: `fnbaqua-test-2` at **`13.50.60.19`** (Elastic IP — stays
the same across stop/start).

---

## 1. Connecting via SSH

From PowerShell, on the machine that has the key file:
```powershell
ssh -i "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" ubuntu@13.50.60.19
```
If you ever see `Permission denied (publickey)` or `bad permissions`, the
key file's Windows ACL likely got reset (e.g. copied to a new machine or
re-downloaded). Fix it with:
```powershell
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" /inheritance:r
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" /remove "NT AUTHORITY\SYSTEM"
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" /remove "BUILTIN\Administrators"
```
Then confirm with `icacls` (no arguments) that only your own Windows
username shows, with `(R)`.

---

## 2. Stopping the instance (to avoid ongoing compute charges)

1. AWS Console → **EC2 → Instances**.
2. Select `fnbaqua-test-2` → **Instance state → Stop instance** → confirm.
3. Wait for status **Stopped**.

This is safe — the EBS volume (database, uploaded images, all files)
persists while stopped, and the Elastic IP stays reserved for this
instance. Two small charges continue even while stopped: the EBS volume
and the Elastic IP itself (AWS charges a small hourly fee for any allocated
public IPv4 address, running or not). The EC2 compute charge — the biggest
piece — stops entirely while the instance is stopped.

## 3. Starting the instance back up

1. AWS Console → **EC2 → Instances**.
2. Select `fnbaqua-test-2` → **Instance state → Start instance**.
3. Wait ~1-2 minutes for it to boot.
4. Visit `http://13.50.60.19/` — should come back automatically.

**Why no extra steps are needed:** `docker-compose.yml` sets
`restart: unless-stopped` on every container, so Docker itself restarts
`db`, `backend`, and `frontend` automatically when the instance boots — you
do not need to SSH in and run `docker compose up` again after a stop/start
cycle.

If the site doesn't come up within a minute or two of starting, SSH in and
check (see §4 below) before assuming something's wrong — first boot after a
stop can take a little longer while Docker's daemon itself starts.

---

## 4. Checking / starting Docker manually

SSH in first (§1), then from `~/fnbaqua`:

**Check what's running:**
```bash
cd ~/fnbaqua
docker compose ps
```
All three (`db`, `backend`, `frontend`) should show `Up`. If backend or
frontend isn't running.

**Start everything (if it's not already running for some reason):**
```bash
docker compose up -d
```

**Stop everything without touching the EC2 instance itself** (rarely
needed — mainly for freeing resources or troubleshooting):
```bash
docker compose down
```
This stops and removes the containers but **not** the named volumes
(`pgdata`, `media_data`) — your database and images are untouched. Bring it
back with `docker compose up -d`.

**View logs** (e.g. to debug an error):
```bash
docker compose logs -f backend    # Ctrl+C to stop following
docker compose logs -f frontend
docker compose logs -f db
```

**Restart just one service** (e.g. after changing `backend/.env`):
```bash
docker compose restart backend
```

---

## 5. Updating the server with new code

The server has its own git clone at `~/fnbaqua`, currently on branch
`phase-1`. It does **not** auto-update — `.github/workflows/deploy-test.yml`
only auto-deploys on push to `main`, and this server is running `phase-1`
(see the "Known follow-ups" note in `AWS_DEPLOYMENT_LOG.md`). Until that's
reconciled, update it manually:

```bash
cd ~/fnbaqua
git pull origin phase-1
```

If you get merge conflicts or local changes blocking the pull (shouldn't
normally happen since nothing is edited directly on the server), check
`git status` first rather than force-discarding anything.

### After pulling new code, rebuild and restart:

```bash
docker compose build
docker compose up -d
```

- `docker compose build` rebuilds the backend/frontend images with the new
  code (Docker layer caching makes this fast if only application code
  changed, not dependencies).
- `docker compose up -d` recreates any containers whose image changed and
  leaves unchanged ones alone.
- Database migrations run automatically on every backend container start
  (`entrypoint.sh`), so a new migration in your code gets applied
  automatically — no separate manual step.

### If only `docker-compose.yml`, `Dockerfile`, `nginx.conf`, or similar changed (not app code):

Same two commands (`git pull` then `docker compose build && docker compose up -d`) — Compose figures out what needs rebuilding.

### `backend/.env` is never touched by `git pull`

It's git-ignored (not committed), so pulling new code never overwrites your
live secrets/config. If you need to change an env var (e.g. real Razorpay
keys once you have them), edit it directly on the server:
```bash
nano backend/.env
docker compose up -d backend
```

---

## 6. Quick reference — "I changed code locally, now what?"

```bash
# On your local machine: commit + push as usual
git add .
git commit -m "..."
git push origin phase-1

# On the server (SSH in first):
cd ~/fnbaqua
git pull origin phase-1
docker compose build
docker compose up -d
```

That's the entire update cycle until the CI/CD workflow is pointed at
`phase-1` (or you switch to deploying from `main`), at which point a plain
`git push` would do this automatically.
