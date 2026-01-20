# 🛡️ TrustStrike Simulation - Full System Documentation

This documentation provides a definitive technical overview of the TrustStrike Simulation platform, from initial boot to campaign execution.

---

## 🏗️ 1. Core Architecture

TrustStrike follows a **Control Plane / Data Plane** separation model, allowing the orchestration portal to remain online while the heavy-duty simulation infrastructure is managed dynamically.

### **A. The Control Plane (Go Backend)**
- **Entry Point (`trust_strike.go`)**: The system heartbeat. It loads configuration (`config.json`), initializes the database (`models.Setup`), and spawns background workers for mail and infrastructure monitoring.
- **Admin Server (`controllers/AdminServer`)**: A high-performance Go server that serves the web UI and handles administrative logic.
- **API Registry (`controllers/api/server.go`)**: The central routing hub. Every frontend action (e.g., "Start EC2") maps to a specific handler in the `controllers/api/` module.

### **B. The Data Plane (Remote EC2)**
- **Simulation Server**: A specialized AWS EC2 instance running the simulation engine (Evilginx).
- **Communication Layer**: The portal communicates with the EC2 instance via SSH and direct API calls, orchestrated through `ec2.go` and `simulationserver.go`.

---

## 📂 2. Project Structure

### **Backend Modules**
| Directory | Responsibility |
| :--- | :--- |
| **`auth/`** | JWT/Session handling and secure key generation. |
| **`controllers/`** | Web handlers and routing logic. |
| **`models/`** | GORM database models and secondary business logic. |
| **`middleware/`** | CSRF protection, Authentication requirements, and Security headers. |
| **`worker/`** | Background task processing (Mail delivery, Campaign shutdowns). |
| **`webhook/`** | Logic for sending result data to external endpoints. |
| **`ansible-playbook/`** | Automated scripts for provisioning fresh simulation servers. |

### **Frontend Assets**
| Directory | Responsibility |
| :--- | :--- |
| **`templates/`** | Go `html/template` files for server-side rendering. |
| **`static/css/`** | Custom design system components and redesign styles. |
| **`static/js/src/app/`** | Modular JavaScript logic for portal interactions. |

---

## 🚀 3. Infrastructure Orchestration

The platform is designed to be "cost-aware" and "failsafe."

| Module | Responsibility |
| :--- | :--- |
| **`controllers/api/ec2.go`** | Direct AWS SDK integration. Manages starts, stops, and status polling. |
| **`controllers/api/simulationserver.go`** | Logic-heavy orchestration. Handles Phishlet toggling, Cloudflare DNS setup, and strike triggering. |
| **`models/ec2_scheduler.go`** | The background "poller." It checks for expired campaigns and enforces the 60-minute auto-shutdown safety window. |

### **Key Automation Flows**
- **Warm-up**: Triggered by user-intent (Campaign Wizard).
- **Auto-Stop**: Triggered by inactivity, strictly blocked by active campaigns.
- **Immediate Cleanup**: Specific to template browsing to minimize run-time.
- **Stopping-State Recovery**: If the server is in transition, the system polls until `stopped` before allowing a new start, preventing AWS API race conditions.

---

## 🛡️ 4. Security & Middleware

The portal implements layers of protection to ensure data integrity.

- **CSRF Protection**: Every state-changing request (POST/PUT/DELETE) requires a valid `csrf_token`.
- **RBAC (Role-Based Access Control)**: Enforced via `models/rbac.go`. Permissions like `models.PermissionModifySystem` are required for modifying users or webhooks.
- **Ratelimiting**: Internal protection against login-page brute-forcing and rapid API calls.

---

## 📂 5. Persistence Layer (Data Flow)

The system uses **GORM** for ORM and **Goose** for database migrations.

1. **State Persistence**: When you create a campaign, it’s saved with a `Created` status.
2. **Result Processing**: When a target interacts with a lure, the remote server sends a webhook to the portal. The `webhook/` module parses this and updates the `Results` table.
3. **Template Caching**: Phishlets and Redirectors are fetched from the EC2 once and cached in `template_cache.go`. This allows the UI to show your "available tools" even when the EC2 is powered down.

---

## 🛠️ 6. Campaign Life-Cycle

The creation of a campaign follows a logical 5-step process orchestrated between the frontend (`campaign_edit.js`) and the backend (`controllers/api/campaign.go`).

1. **Step 1: Intent**: User initiates a new campaign. The EC2 warm-up hook is triggered immediately.
2. **Step 2: Configuration**: Targets, Lures, and Sending Profiles are selected. The portal validates that the selected Phishlet is available in the local cache.
3. **Step 3: Provisioning**: The "Launch" button sends a command to the Go worker. It connects via SSH to the simulation server, initiates the Evilginx listener, and creates the required DNS records via Cloudflare API.
4. **Step 4: Active Monitoring**: The campaign moves to `In progress`. Background workers monitor for target interactions.
5. **Step 5: Completion**: Once the campaign reaches its stop time or is manually finished, the EC2 countdown resets.

---

## 🔍 7. Troubleshooting & Logs

| Issue | Likely Cause | Fix/Log Location |
| :--- | :--- | :--- |
| **Server Won't Start** | Invalid AWS Credentials | Check `config.json` and `trust_strike.log`. |
| **DNS Not Propagating** | Cloudflare API Key Expired | Verify Cloudflare settings in the **Settings** page. |
| **Emails Not Sending** | SMTP Profile Blocked | Test your sending profile in **Sending Profiles > Test**. |
| **Empty Templates** | EC2 Offline during Sync | Click **Refresh Caches** in the Templates section. |

---

## ⚙️ 8. Installation & Setup

Follow these steps to get your TrustStrike Simulation platform up and running.

### **A. Prerequisites**
- **Go**: 1.20 or newer.
- **Node.js & npm**: Required for building frontend assets.
- **Gulp CLI**: `npm install --global gulp-cli`.
- **AWS Account**: With permissions to manage EC2 instances.
- **Cloudflare Account**: For automated DNS management.

### **B. Step-by-Step Installation**

1. **Clone the Repository**
   ```bash
   git clone https://github.com/7nikhilkamboj/TrustStrike-Simulation.git
   cd TrustStrike-Simulation
   ```

2. **Install Dependencies**
   - **Backend**: `go mod download`
   - **Frontend**: `npm install`

3. **Configuration (`config.json`)**
   Copy the example configuration and fill in your details:
   - **AWS**: `aws_access_key_id`, `aws_secret_access_key`, `instance_id`.
   - **Cloudflare**: `cloudflare_token`.
   - **Server**: `listen_url`, `cert_path`, `key_path`.

4. **Generate SSL Certificates**
   The platform requires SSL for the admin server. Place your `ca.crt` and `ca.key` in the root directory as specified in `config.json`.

5. **Launch the Engine**
   ```bash
   go build -o trust_strike trust_strike.go -v
   ./trust_strike
   ```

---

## ⚙️ 9. Quick Architecture Reference

- **Language**: Go 1.2+
- **Database**: SQLite (Local) / MySQL (Remote)
- **Frontend**: Vanilla JS (ES6) + jQuery
- **CSS**: Custom Redesign Design System
- **Orchestrator**: AWS SDK for Go v2
- **Provisioning**: Ansible
