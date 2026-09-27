# SKYRA — Phase 17: AWS Foundation & Security Architecture

## 1. Overview & Principles

Phase 17 establishes the AWS cloud production foundation for SKYRA. The architecture strictly adheres to cloud security best practices:

- **Target Region:** `ap-south-1` (Asia Pacific — Mumbai, India).
  - Selected for minimal latency to Indian meteorological data sources (IMD, MOSDAC/ISRO), domestic user proximity, and local data compliance.
- **Zero Root Deployment:** The AWS root account is never used for running workloads, CI/CD, or deployment tasks.
- **Zero Committed Secrets:** No credentials, access keys, private keys, or passwords exist in source control or Docker images.
- **Keyless Runtime (Instance Profiles):** EC2 instances authenticate using an IAM Instance Profile (`SkyraEC2InstanceRole`), eliminating static AWS keys on disk.
- **Strict Least Privilege:** IAM policies explicitly scope permissions to required actions and specific ARNs. Broad wildcards (e.g. `ec2:*`, `s3:*`) are prohibited.
- **SSM Parameter Store:** Sensitive environment configuration is stored as encrypted `SecureString` parameters under `/skyra/prod/`.

---

## 2. Identity & Access Management (IAM) Strategy

```
                               ┌────────────────────────────────┐
                               │        AWS Root Account        │
                               │  - MFA Protected (Hardware/App)│
                               │  - Never used for deployments  │
                               └───────────────┬────────────────┘
                                               │ (One-time setup)
                                               ▼
                               ┌────────────────────────────────┐
                               │  IAM Administrator / Dev Group │
                               │  - Enforced MFA                │
                               │  - Provisions base infra       │
                               └───────────────┬────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
┌─────────────────────────────┐                                 ┌─────────────────────────────┐
│  CI/CD / Deployment Role    │                                 │   EC2 Runtime Instance Role │
│  (`skyra-deployer`)         │                                 │   (`SkyraEC2InstanceRole`)  │
│                             │                                 │                             │
│  Permissions:               │                                 │  Permissions:               │
│  - ECR Image Push/Pull      │                                 │  - ECR Image Pull Only      │
│  - SSM Parameter Set/Get    │                                 │  - SSM Parameter Read Only  │
│  - S3 Bucket Verification   │                                 │  - S3 Telemetry Put/Get     │
│                             │                                 │  - CloudWatch Logs Write    │
└─────────────────────────────┘                                 └─────────────────────────────┘
```

### 2.1 Deployment Roles & Policies

1. **EC2 Runtime Role:** `SkyraEC2InstanceRole`
   - **Trust Policy:** [`deploy/aws/iam/trust_policy_ec2.json`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/deploy/aws/iam/trust_policy_ec2.json)
   - **Permission Policy:** [`deploy/aws/iam/ec2_instance_policy.json`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/deploy/aws/iam/ec2_instance_policy.json)
   - **Purpose:** Attached to the EC2 host via an Instance Profile. Grants access to pull images from ECR, retrieve decrypted `/skyra/prod/*` parameters at boot, upload disaster telemetry to S3, and forward logs to CloudWatch.

2. **Deployment Identity:** `skyra-deployer`
   - **Permission Policy:** [`deploy/aws/iam/ci_cd_deployment_policy.json`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/deploy/aws/iam/ci_cd_deployment_policy.json)
   - **Purpose:** Used by CI/CD (e.g. GitHub Actions with OIDC) or the deployment operator to push built container images to ECR and update configurations.

---

## 3. Container Registry (ECR) Strategy

Three private Amazon ECR repositories in `ap-south-1`:
- `skyra-frontend`
- `skyra-backend`
- `skyra-ml`

### Tagging & Immutability Rules:
- Primary tag: Git commit SHA (e.g., `skyra-backend:f13893d`) for traceability and reproducible rollbacks.
- Secondary tag: `latest` for active deployment tracking.
- Tag mutability: Enabled for `latest`, immutable for semantic release tags.

### Lifecycle Policy (Cost Control):
Each repository must have a lifecycle policy to prevent unbounded storage costs:
- Expire untagged images older than **7 days**.
- Keep at most **5 tagged images** per repository.

---

## 4. Configuration & Secrets Strategy (SSM Parameter Store)

Production configuration is stored in **AWS Systems Manager Parameter Store** (Standard Tier) under the path hierarchy `/skyra/prod/`:

| Parameter Name | Type | Description |
|---|---|---|
| `/skyra/prod/MONGODB_URI` | `SecureString` | Production MongoDB Atlas connection URI (`mongodb+srv://...`) |
| `/skyra/prod/OPENWEATHER_API_KEY` | `SecureString` | Optional OpenWeather API key |
| `/skyra/prod/OPENAI_API_KEY` | `SecureString` | Optional OpenAI API key (falls back to deterministic mock) |
| `/skyra/prod/PINECONE_API_KEY` | `SecureString` | Optional Pinecone API key (falls back to FAISS) |
| `/skyra/prod/BHASHINI_API_KEY` | `SecureString` | Optional Bhashini API key |
| `/skyra/prod/BHASHINI_INFERENCE_KEY` | `SecureString` | Optional Bhashini Inference key |
| `/skyra/prod/ALERT_WEBHOOK_URL` | `SecureString` | Optional webhook endpoint |
| `/skyra/prod/IMD_API_KEY` | `SecureString` | Optional IMD API key |

### Bootstrapping Flow:
On EC2 startup, the user data script queries SSM via the IAM Instance Profile:
```bash
aws ssm get-parameters-by-path \
  --path "/skyra/prod" \
  --with-decryption \
  --region ap-south-1 \
  --query "Parameters[*].[Name,Value]" \
  --output text
```
Values are written to `/opt/skyra/.env` (mode `0600`, owned by `root`), which Docker Compose loads at startup.

---

## 5. CloudWatch Logging Strategy

1. **Log Group:** `/skyra/prod/containers`
2. **Log Streams:**
   - `frontend`
   - `backend`
   - `ml`
   - `mongo`
3. **Retention Policy:** **7 days** (prevents unexpected CloudWatch log ingestion charges).
4. **Log Forwarding:** Handled via the native Docker `awslogs` log driver configured in production Compose.

---

## 6. Manual Setup Checklist for AWS Console / CLI

When you have access to your AWS account, execute these setup steps:

### Step 1: Secure Root Account
- [ ] Log in as Root at `https://console.aws.amazon.com/`.
- [ ] Enable Multi-Factor Authentication (MFA) via Authenticator App (Google Authenticator / 1Password).
- [ ] Create an IAM User (e.g., `skyra-admin`) with AdministratorAccess and enable MFA.
- [ ] Log out of Root and log in as `skyra-admin`.

### Step 2: Configure Local AWS CLI
Install AWS CLI v2 and configure default region:
```bash
aws configure set region ap-south-1
aws configure set output json
```

### Step 3: Create ECR Repositories
```bash
aws ecr create-repository --repository-name skyra-frontend --region ap-south-1
aws ecr create-repository --repository-name skyra-backend --region ap-south-1
aws ecr create-repository --repository-name skyra-ml --region ap-south-1
```

### Step 4: Create IAM Roles & Policies
```bash
# 1. Create EC2 instance policy
aws iam create-policy \
  --policy-name SkyraEC2InstancePolicy \
  --policy-document file://deploy/aws/iam/ec2_instance_policy.json

# 2. Create the EC2 role with trust policy
aws iam create-role \
  --role-name SkyraEC2InstanceRole \
  --assume-role-policy-document file://deploy/aws/iam/trust_policy_ec2.json

# 3. Attach policy to role
aws iam attach-role-policy \
  --role-name SkyraEC2InstanceRole \
  --policy-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:policy/SkyraEC2InstancePolicy

# 4. Create instance profile
aws iam create-instance-profile --instance-profile-name SkyraEC2InstanceProfile
aws iam add-role-to-instance-profile \
  --instance-profile-name SkyraEC2InstanceProfile \
  --role-name SkyraEC2InstanceRole
```

### Step 5: Create S3 Telemetry Bucket (Optional)
```bash
aws s3api create-bucket \
  --bucket skyra-telemetry-archive-ap-south-1 \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api put-public-access-block \
  --bucket skyra-telemetry-archive-ap-south-1 \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```
