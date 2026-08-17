# AWS Deployment Guide — FNB Aqua

This document is the readiness assessment and step-by-step runbook for moving the FNB Aqua website (Django REST API backend + React/Vite SPA frontend + PostgreSQL) from local development to AWS, including an automated CI/CD pipeline that deploys on every push to `main`.

Scope note: this is Phase 1 (enquiry-only, no payments) — no PCI/payment compliance surface to worry about yet. See root `README.md` for feature scope.

**Important — what this document is:** it is a precise runbook for *you* (or whoever holds the AWS account and GitHub repo) to execute. It cannot be run by an AI agent on your behalf — provisioning real AWS resources costs real money and needs credentials that should never be pasted into a chat session. Steps marked with a computer icon (💻) are things already committed to this repo; steps marked with a hand icon (✋) are things you do yourself, in the AWS Console/CLI or GitHub UI.

---

## 1. TL;DR Readiness Verdict

**The codebase is now deployment-ready in both design and artifacts.**

Already correct, no code changes needed:
- Clean settings split (`config.settings.dev` vs `config.settings.production`), driven entirely by env vars — no hardcoded secrets or localhost values in source.
- Database access is 100% via `DATABASE_URL` (`django-environ`) — pointing it at RDS is a config change, not a code change.
- S3 storage backend is **already wired** in `production.py` via `django-storages` + `boto3`. No custom upload code to write.
- `gunicorn` and `whitenoise` are already dependencies — production-grade WSGI serving and static-file compression are one command away.

💻 Added by this revision (already committed to the repo):
- `backend/Dockerfile`, `backend/entrypoint.sh`, `backend/.dockerignore` — containerizes the backend for ECS Fargate.
- `backend/ecs-task-definition.json` — the ECS task definition template the CI/CD pipeline renders and deploys.
- `.github/workflows/deploy.yml` — the GitHub Actions pipeline: on every push to `main`, builds and pushes the backend image, runs migrations as a one-off task, updates the ECS service, then builds and deploys the frontend to S3/CloudFront.
- `backend/.env.example` now documents `AWS_STORAGE_BUCKET_NAME`/`AWS_S3_REGION_NAME`.

✋ Still needed from you — this is real AWS infrastructure that must exist *once* before the pipeline can deploy to it (§6–§9 below, in order):
- A new RDS Postgres instance (§4).
- An S3 bucket for media uploads (§5).
- The ECS Fargate cluster/service/ECR repo, the ALB, and IAM roles (§6).
- The S3 + CloudFront setup for the frontend (§7).
- The OIDC IAM role GitHub Actions assumes, and the corresponding GitHub repo secrets (§9).

---

## 2. Target Architecture

```
                         ┌─────────────────────┐
   Browser  ───HTTPS───▶ │ CloudFront (CDN)     │ ── serves React SPA (static files)
                         │ + S3 (static website) │
                         └─────────────────────┘
                                   │  API calls (VITE_API_BASE_URL)
                                   ▼
                         ┌─────────────────────┐
                         │ ALB (HTTPS)          │
                         └─────────────────────┘
                                   │
                                   ▼
                         ┌─────────────────────┐
                         │ ECS Fargate service   │
                         │ gunicorn + Django DRF │
                         │ (container from ECR)  │
                         └─────────────────────┘
                              │            │
                              ▼            ▼
                     ┌────────────┐  ┌───────────────┐
                     │ RDS Postgres│  │ S3 (media      │
                     │  (new)      │  │ bucket: product │
                     │            │  │ images etc.)    │
                     └────────────┘  └───────────────┘

   GitHub push to main ──▶ GitHub Actions (OIDC, no stored keys)
                             ├─▶ builds+pushes image to ECR, migrates, updates ECS service
                             └─▶ builds frontend, syncs to S3, invalidates CloudFront
```

**Why ECS Fargate** (over the plain-EC2 or Elastic Beanstalk alternatives): it is the backend hosting model that plugs cleanly into GitHub Actions' official AWS actions (`amazon-ecr-login`, `amazon-ecs-render-task-definition`, `amazon-ecs-deploy-task-definition`) with no SSH keys, no custom deploy scripts, and no server patching. It costs a little more setup time up front (§6) in exchange for a CI/CD pipeline that is a well-trodden, supported path rather than a bespoke script.

---

## 3. Local vs AWS Configuration — What Changes

Nothing in the application code changes between local and AWS. Only env values change (the ECS task definition, §6.6, is where these are actually set in production):

| Variable | Local value | AWS production value |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` | `config.settings.production` |
| `SECRET_KEY` | placeholder in `.env.example` | new random 50+ char value, stored in **SSM Parameter Store**, never in git |
| `DEBUG` | `True` | `False` |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | your real domain(s), e.g. `api.fnbaqua.com` |
| `DATABASE_URL` | `postgres://fnbaqua:fnbaqua@localhost:5432/fnbaqua` | `postgres://<user>:<pass>@<rds-endpoint>:5432/fnbaqua`, from the **new** RDS instance (§4), injected via SSM |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | `https://fnbaqua.com` (your deployed frontend origin) |
| `AWS_STORAGE_BUCKET_NAME` | not set (uses local filesystem) | your media bucket name, e.g. `fnbaqua-media-prod` |
| `AWS_S3_REGION_NAME` | not set | `ap-south-1` (already the code default) |
| Frontend `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | `https://api.fnbaqua.com/api/v1` (set in `.github/workflows/deploy.yml`) |

---

## 4. Database: Provisioning a New RDS Postgres Instance ✋

This is a **brand-new** database — nothing from your local dev Postgres is carried over automatically. If you want your current local/demo data in it, that's §4.4 below; otherwise you'll run `seed_data` fresh (or nothing at all, and populate it for real via the admin panel).

### 4.1 Provision RDS
1. AWS Console → RDS → **Create database**.
2. Engine: **PostgreSQL** (version 16, matching `docker-compose.yml`).
3. Templates: "Production" (Multi-AZ optional — skip it initially for a low-traffic Phase 1 site; enable later if uptime needs increase).
4. Instance class: start small — `db.t4g.micro` or `db.t3.micro`.
5. Storage: General Purpose SSD (gp3), 20 GB, enable storage autoscaling.
6. Credentials: set a master username/password — **do not reuse** the `fnbaqua`/`fnbaqua` dev placeholder. Use RDS's "Manage master credentials in AWS Secrets Manager" toggle so the password is never typed anywhere by hand.
7. Connectivity: place RDS in a **private subnet** (no public access). Security group inbound TCP 5432 **only** from the ECS tasks' security group (§6.3) — never `0.0.0.0/0`.
8. Initial database name: `fnbaqua`.

### 4.2 Build the connection string
```
postgres://<master_username>:<master_password>@<rds-endpoint>.rds.amazonaws.com:5432/fnbaqua
```
Store this whole string as the `DATABASE_URL` SSM parameter (§6.5) — don't split it into parts.

### 4.3 Run migrations against the new database
The very first migration (creating all tables) happens automatically the first time the CI/CD pipeline deploys (the workflow's migration step, §9.4) — you don't need to run this by hand, **provided** the ECS cluster/service/task definition already exist (§6) and the pipeline has already been triggered once. If you want to verify the database before wiring up CI/CD, you can also run it manually from any machine that can reach the RDS endpoint (e.g. a temporary bastion, or via SSH tunnel):
```bash
cd backend
DATABASE_URL="<connection string from §4.2>" DJANGO_SETTINGS_MODULE=config.settings.production python manage.py migrate
DATABASE_URL="<connection string from §4.2>" DJANGO_SETTINGS_MODULE=config.settings.production python manage.py createsuperuser
```

### 4.4 Optional: copy existing local data instead of starting empty
```bash
# Dump from local
pg_dump -h localhost -U fnbaqua -d fnbaqua -F c -f fnbaqua_dump.pgc

# Restore into RDS (from a host that can reach the RDS endpoint)
pg_restore -h <rds-endpoint> -U <master_username> -d fnbaqua --no-owner --no-privileges fnbaqua_dump.pgc
```

### 4.5 Ongoing backups
RDS automated backups are on by default with the "Production" template (check retention days — 7 is a reasonable default).

---

## 5. File Storage: S3 Bucket for Media ✋

Uploaded images (`Category.image`, `Category.banner_image`, `ProductImage.image`, `PortfolioItem.image`, `BlogPost.cover_image`, `Video.thumbnail`) must live in S3, not on a container's local disk — Fargate tasks are ephemeral and get replaced on every deploy, so anything written to local disk is lost.

### 5.1 Create the bucket
1. S3 → **Create bucket**, name it e.g. `fnbaqua-media-prod` (must be globally unique). Region: `ap-south-1` (matches the code default).
2. Block Public Access: keep all four settings **ON** at the account/bucket level — public read is granted narrowly via the bucket policy below instead, not the account-wide toggle.
3. Enable versioning (optional, protects against accidental overwrite/delete).

### 5.2 Bucket policy for public-read images
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadMedia",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::fnbaqua-media-prod/*"
    }
  ]
}
```
When applying this, uncheck just "Block public and cross-account access to buckets and objects through any public bucket or access point policies" for this bucket — writes (uploads) still require IAM credentials; only reads are public.

### 5.3 CORS configuration
```json
[
  {
    "AllowedOrigins": ["https://fnbaqua.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

### 5.4 IAM permissions
No access keys — the ECS **task role** (§6.4, not the execution role) gets a policy scoped to just this bucket:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::fnbaqua-media-prod",
        "arn:aws:s3:::fnbaqua-media-prod/*"
      ]
    }
  ]
}
```

---

## 6. Backend Deployment: ECS Fargate ✋

This is a one-time bootstrap. After these resources exist, every future deploy is `git push` to `main` — GitHub Actions handles the rest (§9).

### 6.1 Create the ECR repository
```bash
aws ecr create-repository --repository-name fnbaqua-backend --region ap-south-1
```

### 6.2 Create the ECS cluster
```bash
aws ecs create-cluster --cluster-name fnbaqua-cluster --region ap-south-1
```

### 6.3 Networking
- Use your account's default VPC (fine for a small site) or a dedicated one.
- Two subnets in different AZs for the ECS service (public subnets are simplest if you're not using a NAT gateway).
- A security group for the ECS tasks: inbound TCP 8000 from the ALB's security group only; outbound to RDS's security group on 5432 and to the internet (for S3/ECR/CloudWatch).
- A security group for the ALB: inbound 443 (and 80, redirecting to 443) from the internet.

### 6.4 IAM roles
Two roles, both attached to the task definition (already referenced in `backend/ecs-task-definition.json` — replace the `<ACCOUNT_ID>` placeholders with your real account ID once created):
- **Execution role** (`fnbaqua-ecs-execution-role`) — lets ECS itself pull the image from ECR and write logs. Attach the AWS-managed policy `AmazonECSTaskExecutionRolePolicy`, plus permission to read the two SSM parameters from §6.5 (`ssm:GetParameters` on their ARNs).
- **Task role** (`fnbaqua-ecs-task-role`) — what the *application* can do at runtime. Attach the S3 policy from §5.4.

### 6.5 Store secrets in SSM Parameter Store
```bash
aws ssm put-parameter --name /fnbaqua/SECRET_KEY --type SecureString --value "<generate a real 50+ char random value>"
aws ssm put-parameter --name /fnbaqua/DATABASE_URL --type SecureString --value "<connection string from §4.2>"
```

### 6.6 Register the first task definition and create the ALB + service
1. Edit `backend/ecs-task-definition.json`: replace `<ACCOUNT_ID>` and `<REGION>` throughout.
2. Register it once by hand to bootstrap (subsequent updates come from the CI/CD pipeline):
   ```bash
   aws ecs register-task-definition --cli-input-json file://backend/ecs-task-definition.json
   ```
3. Create an Application Load Balancer + target group (port 8000, health check path `/api/v1/health/` — already implemented in the `core` app, no code changes needed) via the EC2 console's "Load Balancers" section, or `aws elbv2 create-load-balancer` / `create-target-group` / `create-listener`.
4. Attach an ACM certificate (for `api.fnbaqua.com`) to the ALB's HTTPS listener.
5. Create the ECS service, pointing it at the ALB's target group:
   ```bash
   aws ecs create-service \
     --cluster fnbaqua-cluster \
     --service-name fnbaqua-backend-service \
     --task-definition fnbaqua-backend \
     --desired-count 1 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[<subnet-ids>],securityGroups=[<ecs-sg-id>],assignPublicIp=ENABLED}" \
     --load-balancers "targetGroupArn=<target-group-arn>,containerName=backend,containerPort=8000"
   ```

From this point on, `.github/workflows/deploy.yml` updates this exact cluster/service on every push to `main` — you will not need to repeat this section.

---

## 7. Frontend Deployment: S3 + CloudFront ✋

### 7.1 Create the bucket
S3 → **Create bucket**, e.g. `fnbaqua-frontend-prod`. Do not make it public directly — CloudFront reads it via an **Origin Access Control (OAC)**.

### 7.2 Create the CloudFront distribution
- Origin: the S3 bucket, via OAC.
- Default root object: `index.html`.
- **SPA routing**: custom error responses for HTTP 403 and 404 → response page `/index.html`, response code 200 (so deep links like `/products/123` don't 404 at the CDN — React Router needs this).
- Attach an ACM certificate for `fnbaqua.com` (must be requested in `us-east-1` for CloudFront, regardless of your app's region).
- Note the **distribution ID** — it becomes the `CLOUDFRONT_DISTRIBUTION_ID` GitHub secret (§9.3).

### 7.3 DNS
Point `fnbaqua.com` at the CloudFront distribution, and `api.fnbaqua.com` at the ALB (§6.6), via Route 53 or your existing DNS provider.

From here, `.github/workflows/deploy.yml` builds and syncs the frontend on every push to `main` — no manual `aws s3 sync` needed going forward.

---

## 8. Secrets & Config Management

Never hand-edit `.env` files on servers, and never generate long-lived AWS access keys for this — the whole point of the OIDC setup in §9 is that none exist to leak.

- **SSM Parameter Store** (SecureString) holds `SECRET_KEY` and `DATABASE_URL` (§6.5) — pulled into the container automatically via the task definition's `secrets` block, nothing to configure at deploy time.
- Everything else (`AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`) is not sensitive and lives directly in `backend/ecs-task-definition.json`'s `environment` block, committed to git.

---

## 9. CI/CD Pipeline (GitHub Actions) ✋

The pipeline itself (💻 `.github/workflows/deploy.yml`) is already committed. What's left is granting it permission to act on your AWS account, which is a one-time setup.

### 9.1 Create the OIDC identity provider (once per AWS account)
If your account has never used GitHub Actions OIDC before:
```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```
(Most accounts already have this if any other repo has used OIDC — check IAM → Identity providers first.)

### 9.2 Create the deploy role
Trust policy — restrict this to your exact repo and branch, not `*`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:<your-github-org>/<your-repo>:ref:refs/heads/main" }
      }
    }
  ]
}
```
Name the role `fnbaqua-github-actions-deploy` (matches `deploy.yml`). Attach a permissions policy allowing: ECR push (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`), `ecs:RegisterTaskDefinition`, `ecs:RunTask`, `ecs:DescribeTasks`, `ecs:UpdateService`, `ecs:DescribeServices`, `iam:PassRole` (for the two roles from §6.4), `s3:PutObject`/`s3:DeleteObject`/`s3:ListBucket` on the frontend bucket, and `cloudfront:CreateInvalidation`.

### 9.3 Add GitHub repository secrets
Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `AWS_ACCOUNT_ID` | your 12-digit AWS account ID |
| `ECS_SUBNET_IDS` | comma-separated subnet IDs from §6.3, e.g. `subnet-abc,subnet-def` |
| `ECS_SECURITY_GROUP_ID` | the ECS tasks' security group ID from §6.3 |
| `CLOUDFRONT_DISTRIBUTION_ID` | from §7.2 |

### 9.4 How the pipeline behaves
On every push to `main`:
1. **deploy-backend**: builds the Docker image from `backend/Dockerfile`, pushes it to ECR tagged with the commit SHA, renders a new task definition with that image, runs `python manage.py migrate --noindent` as a **one-off ECS task** and waits for it to exit successfully (aborting the deploy if migrations fail), then updates the `fnbaqua-backend-service` to the new task definition and waits for it to stabilize.
2. **deploy-frontend**: builds the React app with the production API URL, syncs `frontend/dist/` to the S3 bucket, and invalidates the CloudFront cache so visitors get the new build immediately.

Both jobs run independently and in parallel — a frontend-only change still triggers a backend image rebuild (and vice versa); for a project this size that's a deliberate simplicity-over-optimization trade-off, not an oversight.

---

## 10. Pre-Launch Checklist

Infrastructure:
- [ ] RDS Postgres provisioned, in private subnet, security group locked to the ECS tasks' security group only (§4)
- [ ] S3 media bucket created, bucket policy + CORS applied (§5)
- [ ] ECR repository, ECS cluster, IAM execution/task roles created (§6.1–6.4)
- [ ] Secrets stored in SSM Parameter Store (§6.5)
- [ ] First task definition registered, ALB + target group + HTTPS listener created, ECS service created (§6.6)
- [ ] S3 frontend bucket + CloudFront distribution created, with SPA 403/404→200 error page rewrites (§7)
- [ ] DNS: `fnbaqua.com` → CloudFront, `api.fnbaqua.com` → ALB (§7.3)
- [ ] OIDC identity provider + deploy IAM role created, trust policy scoped to this exact repo/branch (§9.1–9.2)
- [ ] GitHub repo secrets set: `AWS_ACCOUNT_ID`, `ECS_SUBNET_IDS`, `ECS_SECURITY_GROUP_ID`, `CLOUDFRONT_DISTRIBUTION_ID` (§9.3)
- [ ] First push to `main` after all the above completes successfully end-to-end (watch the Actions tab)

Config/security:
- [ ] New random `SECRET_KEY` generated for production (not the placeholder) — stored only in SSM
- [ ] `DEBUG=False` confirmed (already hardcoded in `production.py`, just verify no env var overrides it)
- [ ] `ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS` set to the real domains in `backend/ecs-task-definition.json`
- [ ] `createsuperuser` run once against the production DB for admin panel access
- [ ] Confirm RDS automated backups are enabled

Not required for Phase 1 but worth flagging for later:
- [ ] A staging settings module/environment before Phase 2 (payments) work begins
- [ ] Multi-AZ RDS and a second ECS task (`desired-count: 2`) once traffic/uptime needs grow

---

## 11. Rough Cost Estimate (small-scale, ap-south-1)

For a low-traffic business site like this, expect roughly:
- RDS `db.t4g.micro` single-AZ: ~$15–20/mo
- ECS Fargate, 1 task at 0.25 vCPU / 0.5 GB: ~$9–12/mo
- ALB: ~$16/mo + traffic
- S3 + CloudFront: a few dollars/mo at low traffic (S3 storage is pennies; CloudFront has a free tier)
- ECR storage: pennies/mo for a handful of image versions

Total: roughly **$45–65/month**. This is a ballpark for planning, not a quote — confirm against current AWS pricing for your exact region/instance choices.
