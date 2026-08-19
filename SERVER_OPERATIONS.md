# Server Operations — FNB Aqua Test Instance

Day-to-day runbook for the AWS free-tier test instance: connecting,
stopping/starting the EC2 instance itself, starting/checking Docker, and
updating the running site with new code. For the one-time setup history and
the specific resource IDs (instance ID, security group, key pair), see
`AWS_DEPLOYMENT_LOG.md`.

Current instance: `fnbaqua-test-2` at **`13.50.60.19`** (Elastic IP — stays
the same across stop/start).

---

## 1. Connecting to the instance

### 1.1 Find the address (if you've forgotten it)

The instance is always reachable at the same address because it uses an
Elastic IP, which doesn't change across stop/start:
```
13.50.60.19
```
To confirm this in the console (e.g. if you're not sure it's still
correct): **AWS Console → EC2 → Elastic IPs** — the single entry listed
there is it, and its "Associated instance" column shows which instance it's
currently attached to.

### 1.2 Normal SSH connection (the everyday way in)

The private key file is `fnbaqua-key-clean.pem`. From **PowerShell**, on
whichever machine has that file (default location assumed: Downloads):
```powershell
ssh -i "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" ubuntu@13.50.60.19
```
- Username is always `ubuntu` (this is a Canonical Ubuntu AMI).
- First-ever connection from a given machine will ask to confirm the host
  fingerprint — type `yes`.
- You should land at a prompt like `ubuntu@ip-172-31-25-101:~$`.

To disconnect cleanly:
```bash
exit
```

### 1.3 If SSH says `Permission denied (publickey)` or `bad permissions`

The key file's Windows ACL has gotten reset or corrupted (e.g. copied to a
new machine, re-downloaded, or a previous `icacls` command was mistyped).
Fix it with these three commands, in order:
```powershell
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" /inheritance:r
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" /remove "NT AUTHORITY\SYSTEM"
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" /remove "BUILTIN\Administrators"
```
Then verify — this should print **only** your own Windows username with
`(R)` and nothing else:
```powershell
icacls "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem"
```
If some other unremovable entry (e.g. a stray `BUILTIN\BUILTIN`) still
shows up and won't clear with `/remove`, don't keep fighting that specific
file — copy the key's contents into a brand-new file instead (a fresh file
gets a clean ACL with nothing to fix), then repeat the three commands above
against the new file and use it for `-i` going forward:
```powershell
Get-Content "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" | Set-Content "$env:USERPROFILE\Downloads\fnbaqua-key-clean-2.pem"
```

### 1.4 If SSH says `Connection timed out`

Almost always means either your current public IP no longer matches the
security group's SSH rule, or the instance is stopped. Check, in order:

1. **Is the instance actually running?** AWS Console → EC2 → Instances —
   confirm `fnbaqua-test-2` shows **Running**, not **Stopped**.
2. **Has your IP changed?** Check your current public IP:
   ```powershell
   Test-NetConnection -ComputerName 13.50.60.19 -Port 22
   ```
   If `TcpTestSucceeded: False`, get your current IP by opening
   `https://checkip.amazonaws.com` in a browser, then go to **EC2 → Security
   Groups → launch-wizard-1 → Inbound rules → Edit inbound rules**, and
   update the SSH rule's source to your current IP (select **My IP** from
   the dropdown to auto-fill it — don't type it by hand).

### 1.5 Fallback: browser-based connection (no SSH key needed)

If SSH is broken for some reason unrelated to the above (e.g. you're on a
machine without the key file), you can connect through the browser instead:

1. AWS Console → EC2 → Instances → select `fnbaqua-test-2` → **Connect**
   button.
2. **EC2 Instance Connect** tab → Username: `ubuntu` → **Connect**.
3. This opens a terminal directly in the browser, authenticated via your
   AWS login instead of the `.pem` key.

Note: this method's traffic comes from an AWS-managed IP range, not your
own IP — if the security group's SSH rule is currently locked to a specific
IP that isn't yours, this fallback can also fail with "Error establishing
SSH connection." If so, temporarily add a second SSH inbound rule for
`0.0.0.0/0`, use EC2 Instance Connect, then remove that temporary rule
again afterward.

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
