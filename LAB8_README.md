# Web Services & SOA Laboratory — Lab 8: Kubernetes, CI/CD & Monitoring

**Course**: Web Services & SOA Laboratory  
**Project**: CampusConnect Microservices Platform  
**Lab Assignment**: Lab 8 — Kubernetes Orchestration, GitHub Actions CI/CD & Prometheus/Grafana Monitoring  
**Continuity**: Built directly upon the Lab 7 API Gateway + Microservices Architecture  

---

## 1. System Architecture & Topology

In Lab 8, the CampusConnect platform transitions from container composition into enterprise Kubernetes orchestration, automated CI/CD pipelines, and active observability.

```
+-----------------------------------------------------------------------------------------+
|                                PUBLIC CLIENT / POSTMAN                                  |
+-----------------------------------------------------------------------------------------+
                                             |
                                             | HTTP Requests (Port 3000 / NodePort 30080)
                                             v
+-----------------------------------------------------------------------------------------+
|                        KUBERNETES CLUSTER (Namespace: lab8)                             |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                       API GATEWAY SERVICE (NodePort: 30080)                     |   |
|   |   - Single client-facing entry point                                            |   |
|   |   - Dynamic service discovery routing                                           |   |
|   |   - Centralized error handling (502/503) & Health check (/health)               |   |
|   |   - Prometheus Metrics Exporter (/metrics)                                      |   |
|   +---------------------------------------------------------------------------------+   |
|                         |                       |                       |               |
|                         | (ClusterIP: 3001)     | (ClusterIP: 3002)     | (ClusterIP:   |
|                         v                       v                       |  3003)        |
|             +-----------------------+ +-----------------------+         v               |
|             |     USER SERVICE      | |    PRODUCT SERVICE    | +---------------------+ |
|             |  (Replicas: 1 -> 3)   | |     (Replicas: 1)     | |    ORDER SERVICE    | |
|             |  - Probes: /health    | |  - Probes: /health    | |     (Replicas: 1)   | |
|             |  - Metrics: /metrics  | |  - Metrics: /metrics  | |  - Probes: /health  | |
|             +-----------------------+ +-----------------------+ |  - Metrics: /metrics| |
|                         \                       |               +---------------------+ |
|                          \                      |                      /                |
|                           +---------------------+---------------------+                 |
|                                                 |                                       |
|                                                 v                                       |
|                               +-----------------------------------+                     |
|                               |     MongoDB Atlas (External)      |                     |
|                               +-----------------------------------+                     |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                            OBSERVABILITY STACK                                  |   |
|   |                                                                                 |   |
|   |     +----------------------------+             +--------------------------+     |   |
|   |     |    PROMETHEUS (Port 30090) | <---------- |   GRAFANA (Port 31000)   |     |   |
|   |     |  - Scrapes /metrics every  |   PromQL    |  - Real-time Dashboards  |     |   |
|   |     |    5s across all services  |             |  - Traffic, Errors, Lat. |     |   |
|   |     +----------------------------+             +--------------------------+     |   |
|   +---------------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Prerequisites & Environment Setup

- **Docker Desktop** (Engine v29+) OR **Minikube** (v1.36+)
- **kubectl** (v1.36+) configured and active
- **Node.js** (v18+)

### Verify Kubernetes Cluster

Run in PowerShell or Bash:
```bash
# Verify active context
kubectl config current-context

# Verify cluster node is Ready
kubectl get nodes

# Create the dedicated namespace for Lab 8
kubectl create namespace lab8
```

---

## 3. Part A — Kubernetes Deployment

### 3.1 Build Docker Images Locally

Build container images for all four services so Kubernetes can deploy them:

```bash
# 1. API Gateway
docker build -t campusconnect/api-gateway:latest ./api-gateway

# 2. User Service
docker build -t campusconnect/user-service:latest ./user-service

# 3. Product Service
docker build -t campusconnect/product-service:latest ./product-service

# 4. Order Service
docker build -t campusconnect/order-service:latest ./order-service
```

*(Note for Minikube users: If using Minikube with Docker driver, run `minikube image load campusconnect/api-gateway:latest` or point your shell to Minikube's Docker daemon via `& minikube -p minikube docker-env --shell powershell | Invoke-Expression` before building).*

---

### 3.2 Apply Kubernetes Manifests

Apply configuration, secrets, microservices, and gateway manifests into the `lab8` namespace:

```bash
# Apply ConfigMap and Secret
kubectl apply -f k8s/configmap.yaml -n lab8
kubectl apply -f k8s/secret.yaml -n lab8

# Apply Deployments and Services
kubectl apply -f k8s/ -n lab8

# Verify Deployments, Pods, and Services
kubectl get deployments -n lab8
kubectl get pods -n lab8 -o wide
kubectl get services -n lab8
```

Expected output:
```text
NAME              READY   UP-TO-DATE   AVAILABLE   AGE
api-gateway       1/1     1            1           30s
order-service     1/1     1            1           30s
product-service   1/1     1            1           30s
user-service      1/1     1            1           30s
```

---

### 3.3 Health & Readiness Probes

All deployments configure **Liveness** and **Readiness** probes hitting the native `/health` endpoints:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 3
  periodSeconds: 5
```

Inspect probes running on a pod:
```bash
kubectl describe pod -l app=api-gateway -n lab8
```

---

### 3.4 Access & Test API Gateway

The API Gateway is exposed via NodePort `30080`:

- **Docker Desktop**: Access directly via `http://localhost:30080` or `http://localhost:3000` via port-forward:
  ```bash
  kubectl port-forward service/api-gateway 3000:3000 -n lab8
  ```
- **Minikube**:
  ```bash
  minikube service api-gateway -n lab8
  ```

#### Postman / cURL Verification Tests:

1. **Gateway Health Check**:
   ```bash
   curl http://localhost:30080/health
   ```
2. **Fetch Users via Gateway**:
   ```bash
   curl http://localhost:30080/users
   ```
3. **Fetch Products via Gateway**:
   ```bash
   curl http://localhost:30080/products
   ```
4. **Fetch Orders via Gateway**:
   ```bash
   curl http://localhost:30080/orders
   ```
5. **Create an Order (Inter-Service Communication)**:
   ```bash
   curl -X POST http://localhost:30080/orders \
     -H "Content-Type: application/json" \
     -d '{"userId": 1, "productId": 101, "quantity": 1, "notes": "K8s Verification Order"}'
   ```

---

### 3.5 Scaling Demonstration

Scale the `user-service` from **1 replica to 3 replicas**:

```bash
# Scale User Service to 3 replicas
kubectl scale deployment user-service --replicas=3 -n lab8

# Observe pods scaling up
kubectl get pods -l app=user-service -n lab8 -w
```

Verify that the `user-service` Kubernetes Service continues to load balance traffic seamlessly across all 3 Pod replicas:
```bash
kubectl get endpoints user-service -n lab8
```

---

### 3.6 Self-Healing Demonstration

Delete an active `user-service` Pod to observe Kubernetes self-healing:

```bash
# List user service pods
kubectl get pods -l app=user-service -n lab8

# Delete one pod
kubectl delete pod <USER_SERVICE_POD_NAME> -n lab8

# Immediately observe Kubernetes creating a replacement
kubectl get pods -l app=user-service -n lab8
```

---

## 4. Part B — GitHub Actions CI/CD Pipeline

The automated CI/CD pipeline is located in `.github/workflows/ci.yml`.

### Workflow Stages:
1. **Trigger**: Runs on every `push` and `pull_request` to `main`/`master`.
2. **Build & Test**:
   - Matrix execution across all 4 services.
   - Installs dependencies using `npm ci`.
   - Runs unit and syntax tests (`npm test`).
3. **Docker Build & Tagging**:
   - Builds Docker images with both `:latest` and traceable commit SHA tags (`:${{ github.sha }}`).
4. **Kubernetes Validation**:
   - Performs a client dry-run validation (`kubectl apply --dry-run=client -f k8s/`) across all manifests to ensure zero schema errors before deployment.

---

## 5. Part C — Monitoring with Prometheus & Grafana

### 5.1 Deploy Prometheus & Grafana

Deploy the monitoring stack in the `lab8` namespace:

```bash
kubectl apply -f k8s/monitoring/ -n lab8

# Verify monitoring pods
kubectl get pods -n lab8 -l app=prometheus
kubectl get pods -n lab8 -l app=grafana
```

---

### 5.2 Access Prometheus

Prometheus is exposed on NodePort **30090**:
- URL: `http://localhost:30090` (or `minikube service prometheus -n lab8`)

#### Verification Steps:
1. Navigate to **Status** -> **Targets**.
2. Confirm all 4 microservices report **UP**:
   - `api-gateway` (`api-gateway:3000/metrics`)
   - `user-service` (`user-service:3001/metrics`)
   - `product-service` (`product-service:3002/metrics`)
   - `order-service` (`order-service:3003/metrics`)

#### Useful PromQL Queries:
- Target Availability:
  ```promql
  up
  ```
- Request Rate over 5 minutes:
  ```promql
  rate(http_requests_total[5m])
  ```
- Total HTTP Requests by Service & Status:
  ```promql
  sum by (service, status) (http_requests_total)
  ```
- Request Latency:
  ```promql
  rate(http_request_duration_seconds[5m])
  ```

---

### 5.3 Access Grafana Dashboard

Grafana is exposed on NodePort **31000**:
- URL: `http://localhost:31000` (or `minikube service grafana -n lab8`)
- **Default Credentials**: `admin` / `admin`

#### Pre-Configured Datasource:
The Prometheus datasource (`http://prometheus:9090`) is **automatically provisioned** via ConfigMap `grafana-datasources`.

#### Create Dashboard Panels:
1. **Panel 1 — Service Availability (Stat)**:
   - Query: `sum(up)`
2. **Panel 2 — Total Request Volume (Time Series)**:
   - Query: `sum by (route) (rate(http_requests_total[1m]))`
3. **Panel 3 — Error Breakdown (Time Series)**:
   - Query: `sum by (status) (http_requests_total{status=~"4..|5.."})`
4. **Panel 4 — Request Latency (Gauge / Stat)**:
   - Query: `rate(http_request_duration_seconds[1m]) / rate(http_requests_total[1m])`

---

### 5.4 Generate Traffic & Observe

Run the automated traffic generator script to send realistic traffic bursts through the Kubernetes Gateway:

```bash
node generate-traffic.js http://localhost:30080 25
```

Observe in Grafana and Prometheus:
- Spikes in `rate(http_requests_total[1m])`
- Clean distribution of 200 OKs, 201 Createds, and intentional 404 Not Founds
- Uptime and latency metrics updating dynamically

---

## 6. Submission Evidence Checklist

| No. | Evidence Required | Verification Command / URL |
| :--- | :--- | :--- |
| **1** | Lab 7 Baseline | `curl http://localhost:30080/health` |
| **2** | K8s Context & Nodes | `kubectl config current-context` & `kubectl get nodes` |
| **3** | Manifests Created | `dir k8s\*.yaml` |
| **4** | Deployments & Pods | `kubectl get pods,deployments,services -n lab8` |
| **5** | Gateway Test Evidence | Postman / cURL requests through `http://localhost:30080` |
| **6** | User Service Scaling | `kubectl scale deployment user-service --replicas=3 -n lab8` |
| **7** | Pod Self-Healing | `kubectl delete pod <pod> -n lab8` |
| **8** | Troubleshooting Output | `kubectl describe pod` / `kubectl logs` |
| **9** | GitHub Actions Run | Screenshot of Actions tab with passing CI workflow |
| **10**| Prometheus Targets | Screenshot of `http://localhost:30090/targets` (UP state) |
| **11**| Prometheus Queries | Screenshot of `up` and `rate(http_requests_total[5m])` |
| **12**| Grafana Dashboard | Screenshot of Grafana dashboard after traffic run |
| **13**| Traffic Generation | Execution log of `node generate-traffic.js` |
