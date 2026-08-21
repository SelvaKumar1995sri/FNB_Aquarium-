# AWS Free-Tier Test Deployment — FNB Aqua

Goal: get a working public link for **~3 testers** to click through, at
**$0/month**, before you buy a domain or build the full production setup.
This is deliberately the cheap/simple path — see `AWS_DEPLOYMENT.md` for the
full ECS/RDS/CloudFront production setup you'd move to later for the real
client launch.

## How this is different from `AWS_DEPLOYMENT.md`

One EC2 instance runs everything via Docker Compose — Postgres, the Django
API, and the React frontend (served by nginx, which also reverse-proxies API
calls to Django). No RDS, no S3, no CloudFront, no load balancer, no domain.
Reachable at `http://<ec2-public-ip>/`.

```
Browser ──HTTP──▶ EC2 instance (t2.micro/t3.micro, free tier)
                    ├─ frontend container (nginx: serves React build,
                    │   proxies /api/, /admin/, /static/, /media/)
                    ├─ backend container (gunicorn + Django, port 8000)
                    └─ db container (Postgres 16)
```

This trades production-readiness (no auto-scaling, no managed backups, one
point of failure) for zero cost and ~30–45 minutes of setup — the right
trade for "let 3 people click around and test payments," not for the
client's real go-live.

## What this costs

- **If your AWS account is under 12 months old**: $0/month. AWS Free Tier
  includes 750 hrs/month of a `t2.micro` or `t3.micro` instance (enough to
  run this 24/7), 30 GB EBS storage, and 100 GB outbound data transfer/month
  — all far more than 3 testers will use.
- **If your account is past the 12-month free tier window**: roughly
  $8–9/month for the instance (still no RDS/ALB/CloudFront charges, since
  this setup uses none of those). Check under **Billing → Free Tier** in the
  AWS Console to see your account's status before starting.
- An **Elastic IP** is free *only while attached to a running instance* — if
  you stop the instance, either release the Elastic IP or expect a small
  hourly charge for the unattached IP.

## 1. Launch the EC2 instance ✋

1. AWS Console → EC2 → **Launch instance**.
2. Name: `fnbaqua-test`.
3. AMI: **Ubuntu Server 22.04 LTS** (free-tier eligible).
4. Instance type: `t2.micro` or `t3.micro` — confirm the "Free tier eligible"
   badge is shown next to it.
5. Key pair: create a new one (e.g. `fnbaqua-test-key`), download the
   `.pem` file — you need it to SSH in.
6. Network settings → Edit security group rules:
   - SSH (22) — source: **My IP** (not `0.0.0.0/0` — no reason to expose SSH
     to the whole internet).
   - HTTP (80) — source: **Anywhere (0.0.0.0/0)** — this is what your
     testers hit.
   - Do **not** add a rule for 5432 (Postgres) — it stays internal to the
     Docker network, never exposed publicly.
7. Storage: default 8–30 GB gp3 is fine (free tier covers up to 30 GB).
8. Launch.

### Allocate an Elastic IP (so the address doesn't change)

By default an EC2 instance's public IP changes if you ever stop/start it.
An Elastic IP keeps it fixed — matters because you'll hand testers a link
and register a Razorpay webhook URL pointing at this address.

1. EC2 → **Elastic IPs** → **Allocate Elastic IP address** → Allocate.
2. Select it → **Actions → Associate Elastic IP address** → pick your
   `fnbaqua-test` instance → Associate.
3. Note this IP — it's `<EC2_PUBLIC_IP>` everywhere below.

## 2. Install Docker on the instance ✋

SSH in (adjust the key path/IP):
```bash
ssh -i fnbaqua-test-key.pem ubuntu@<EC2_PUBLIC_IP>
```

Install Docker Engine + Compose plugin:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# run docker without sudo
sudo usermod -aG docker $USER
# log out and back in (or `newgrp docker`) for this to take effect
```

## 3. Get the code onto the instance ✋

Easiest if the repo is on GitHub (works for private repos too, using a
Personal Access Token as the password when prompted):
```bash
git clone https://github.com/<your-org>/<your-repo>.git fnbaqua
cd fnbaqua
git checkout phase-1
```

## 4. Configure environment variables ✋

```bash
cp backend/.env.docker.example backend/.env
nano backend/.env
```

Fill in:
- `SECRET_KEY` — any long random string (e.g. `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` on your own machine).
- `ALLOWED_HOSTS=<EC2_PUBLIC_IP>`
- `CORS_ALLOWED_ORIGINS=http://<EC2_PUBLIC_IP>`
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` — real
  **test-mode** values from `backend/RAZORPAY_SETUP.md`. When creating the
  webhook in the Razorpay dashboard, the URL is:
  ```
  http://<EC2_PUBLIC_IP>/api/v1/payments/webhook/
  ```
  Note: some Razorpay dashboard versions reject a plain `http://` webhook
  URL and require `https://`. If it's rejected, see the optional free-HTTPS
  section (§7) below — you don't need to buy a domain for that either.
- Leave `DATABASE_URL` as `postgres://fnbaqua:fnbaqua@db:5432/fnbaqua`
  (`db` is the compose service name — this is fine since Postgres isn't
  exposed outside the Docker network).

## 5. Build and start everything ✋

```bash
docker compose build
docker compose up -d
docker compose logs -f backend   # watch migrations run, Ctrl+C once it's serving
```

Create an admin login:
```bash
docker compose exec backend python manage.py createsuperuser
```

Visit `http://<EC2_PUBLIC_IP>/` — you should see the site. Admin panel is at
`http://<EC2_PUBLIC_IP>/admin/`.

## 6. Give testers real data to look at (optional) ✋

If you want the same products/categories from your local dev database
instead of an empty shop, copy your local dump over:
```bash
# on your local machine
pg_dump -h localhost -U fnbaqua -d fnbaqua -F c -f fnbaqua_dump.pgc
scp -i fnbaqua-test-key.pem fnbaqua_dump.pgc ubuntu@<EC2_PUBLIC_IP>:~/

# on the EC2 instance
docker compose exec -T db pg_restore -U fnbaqua -d fnbaqua --no-owner --clean --if-exists < fnbaqua_dump.pgc
```
Also copy `backend/media/` (product images) the same way via `scp -r` into
the running backend container's volume, or just re-upload a few images
through the admin panel.

## 7. Optional: free HTTPS without buying a domain

If Razorpay's webhook setup insists on `https://`, you can get a real,
free TLS certificate **without owning a domain** using a wildcard DNS
service like `nip.io`, which resolves `<any-text>.<your-ip>.nip.io` straight
back to your IP. Swap the `frontend` container's nginx for
[Caddy](https://caddyserver.com/), which obtains and renews Let's Encrypt
certificates automatically given just a hostname — ask me to wire this up if
you hit the http-webhook rejection; it's a ~10-minute change (new Caddyfile,
swap one line in `frontend/Dockerfile`) and stays $0.

## 8. Share the link with testers

`http://<EC2_PUBLIC_IP>/` — that's it. For payment testing, use Razorpay's
test card `4111 1111 1111 1111` (any future expiry, any CVV) or UPI ID
`success@razorpay` (see `backend/RAZORPAY_SETUP.md`).

## 9. Making changes after testers report bugs

Manually:
```bash
git pull
docker compose build
docker compose up -d
```
`entrypoint.sh` re-runs migrations automatically on every restart, so schema
changes are picked up without a separate step.

Or set up §10 below once, and this happens automatically on every push.

## 10. CI/CD: auto-deploy on push to `main`

`.github/workflows/deploy-test.yml` (already committed) rsyncs this repo to
the EC2 instance and rebuilds the containers on every push to `main`. It
needs two GitHub repo secrets pointing at credentials that don't exist yet —
this is the one-time setup.

### 10.1 Generate a dedicated deploy key

Don't reuse `fnbaqua-test-key.pem` (your personal SSH key for manual access)
for GitHub Actions. Generate a separate key pair just for CI/CD, so it can
be revoked independently if it ever leaks:

```bash
ssh-keygen -t ed25519 -f fnbaqua-deploy-key -N "" -C "github-actions-deploy"
```
This creates `fnbaqua-deploy-key` (private) and `fnbaqua-deploy-key.pub`
(public).

### 10.2 Authorize the public key on the EC2 instance

```bash
# copy the public key up using your existing personal key
scp -i fnbaqua-test-key.pem fnbaqua-deploy-key.pub ubuntu@<EC2_PUBLIC_IP>:~/

# then, SSH in with your personal key and append it
ssh -i fnbaqua-test-key.pem ubuntu@<EC2_PUBLIC_IP> \
  "cat ~/fnbaqua-deploy-key.pub >> ~/.ssh/authorized_keys && rm ~/fnbaqua-deploy-key.pub"
```

### 10.3 Add GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Value |
|---|---|
| `EC2_HOST` | `<EC2_PUBLIC_IP>` (the Elastic IP from §1) |
| `EC2_SSH_KEY` | the full contents of the **private** key file, `fnbaqua-deploy-key` (open it in a text editor and paste everything, including the `-----BEGIN...-----`/`-----END...-----` lines) |

Never paste the private key anywhere except this GitHub secret field — not
into a commit, an issue, or a chat message. Delete the local
`fnbaqua-deploy-key` / `.pub` files once they're both in place (authorized
on EC2, pasted into the GitHub secret) if you don't need them again by hand.

### 10.4 First run

Push to `main` (or go to the repo's **Actions** tab → "Deploy to AWS test
server" → **Run workflow** to trigger it manually the first time). Watch the
Actions tab — the job syncs the repo to `~/fnbaqua` on the instance and runs
`docker compose build && docker compose up -d`.

### 10.5 What it deliberately does NOT touch

`backend/.env`, `backend/media/`, and `backend/staticfiles/` are excluded
from the sync (they're not tracked in git in the first place) so every
deploy leaves your Razorpay keys, `SECRET_KEY`, and uploaded product images
on the server untouched. If you ever need to change an env var, still SSH in
by hand and edit `backend/.env`, then `docker compose up -d` once — CI/CD
doesn't manage secrets.

## 11. When you're ready to buy a domain and go to real production

Come back to `AWS_DEPLOYMENT.md` — that's the durable, scalable setup
(RDS, S3, CloudFront, ECS Fargate, GitHub Actions CI/CD) meant for the real
client launch. This EC2 box is disposable: once you're happy with testing,
you can terminate it (release the Elastic IP too, to avoid the small
unattached-IP charge) and stand up the production stack fresh — none of the
$0 test setup needs to be preserved or migrated forward, except the
Razorpay keys and any seed data you want to carry over the same way as §6.



# remote aws connect command
## ssh -i "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" ubuntu@13.50.60.19
# To pull and update the code 
##  git pull origin phase-1 && docker compose build && docker compose up -d.

## docker compose build --no-cache frontend
## docker compose up -d frontend