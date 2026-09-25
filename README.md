# Lab 7: API Gateway, Configuration-Based Service Discovery & Cloud Deployment

**Course**: Web Services & SOA Laboratory  
**Project**: CampusConnect Microservices Platform  
**Lab Assignment**: Lab 7 — API Gateway, Service Discovery & Render Cloud Deployment  

---

## 1. System Architecture & Topology

In Lab 6, the system was decomposed into three independent microservices (`User Service`, `Product Service`, `Order Service`) communicating over a private Docker network, with clients sending requests directly to individual service ports.

**Lab 7 Architecture**: Introduces a dedicated **API Gateway** as the single public entry point for all client applications. Microservice locations are externalized into environment-based configuration (Service Discovery), and internal microservices are isolated inside the private container network (`campus-network`), exposing only the API Gateway port to the outside world.

```
+-------------------------------------------------------------------------------+
|                            PUBLIC INTERNET / CLIENT                           |
|                                                                               |
|                      [ Client / Postman / Mobile App ]                        |
+-------------------------------------------------------------------------------+
                                       |
                                       | HTTP / HTTPS Requests
                                       v
+-------------------------------------------------------------------------------+
|                          API GATEWAY (Port: 3000)                             |
|  - Public Entry Point                                                         |
|  - Request Router & Logger                                                    |
|  - Centralized 502/503 Error Handler                                          |
|  - Health Check Endpoint (/health)                                            |
|  - Configuration-based Service Discovery Registry                             |
+-------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   | (Docker Bridge Network: campus-network)|
                   v                   v                   v
      +--------------------+ +--------------------+ +--------------------+
      |    User Service    | |  Product Service   | |   Order Service    |
      |    (Port 3001)     | |    (Port 3002)     | |    (Port 3003)     |
      |   (Internal Only)  | |   (Internal Only)  | |   (Internal Only)  |
      +--------------------+ +--------------------+ +--------------------+
                 \                      |                      /
                  \                     v                     /
                +-----------------------------------------------+
                |          MongoDB Database Cluster             |
                |  (Local Container or Cloud MongoDB Atlas)     |
                +-----------------------------------------------+
```

---

## 2. Part A Discussion: Why Introduce an API Gateway?

### *Question: Why introduce an API Gateway instead of letting clients call each service directly?*

1. **Single Entry Point & Decoupled Frontend**:
   Without an API Gateway, clients must keep track of individual IP addresses, hostnames, and port numbers for dozens of microservices. An API Gateway abstracts the backend topology into a single unified domain (e.g. `api.campusconnect.com`).

2. **Hiding Internal Architecture & Security Boundary**:
   Exposing backend microservices directly increases the attack surface. An API Gateway keeps microservices enclosed within a private network (`campus-network`). Only the gateway port is publicly reachable.

3. **Centralizing Cross-Cutting Concerns**:
   Instead of duplicating authorization checks, rate-limiting, CORS configuration, SSL termination, and request logging across every microservice, these concerns are managed once at the gateway level.

4. **Resilience & Unified Error Handling**:
   When a microservice crashes or experiences network failure, direct client calls hang or crash. The gateway intercepts transport errors and immediately returns structured HTTP status codes (`502 Bad Gateway` / `503 Service Unavailable`).

---

## 3. Part B Discussion: Static vs. Dynamic Service Discovery

### *Question: What would a dynamic service registry (e.g. Consul, Eureka, Kubernetes DNS) add that a static config file cannot?*

| Feature | Static / Config-Based Discovery (Lab 7) | Dynamic Service Discovery (Consul / Eureka / K8s) |
| :--- | :--- | :--- |
| **Location Source** | Environment variables (`.env`, `docker-compose.yml`, `render.yaml`) | Centralized dynamic key-value registry / DNS service |
| **Service Registration** | Manual entry at deployment time | Automated self-registration on instance startup |
| **Instance Auto-Scaling** | Requires restarting the gateway to update URLs | Automatic routing across N instances as pods spin up |
| **Health Awareness** | Gateway learns service status upon request failure | Continuous background heartbeat checks remove unhealthy instances |
| **Complexity** | Extremely lightweight, 0 extra dependencies | Requires running registry servers and client agents |

**Key Takeaway**: Static configuration-based discovery is ideal for fixed-instance count cloud deployments (e.g., Docker Compose, single-instance Render blueprints). Dynamic service discovery becomes essential in elastic cloud environments (Kubernetes, AWS ECS) where container IP addresses change dynamically during auto-scaling or rolling deployments.

---

## 4. API Gateway Routes & Specifications

All incoming client traffic enters through the API Gateway (`http://localhost:3000` or Render Cloud URL).

| Gateway Endpoint | Method | Routed Microservice | Target Endpoint | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/health` | `GET` | *API Gateway (Local)* | `/health` | Reports gateway health & active service registry URLs |
| `/users` | `GET` | User Service | `/users` | Fetches list of all registered users |
| `/users/:id` | `GET` | User Service | `/users/:id` | Fetches single user by ID |
| `/users` | `POST` | User Service | `/users` | Creates a new user profile |
| `/users/:id` | `PUT` | User Service | `/users/:id` | Updates user details |
| `/users/:id` | `DELETE` | User Service | `/users/:id` | Deletes user profile |
| `/products` | `GET` | Product Service | `/products` | Lists all catalog products |
| `/products/:id` | `GET` | Product Service | `/products/:id` | Fetches single product details |
| `/products` | `POST` | Product Service | `/products` | Adds new product to catalog |
| `/orders` | `GET` | Order Service | `/orders` | Retrieves order history |
| `/orders` | `POST` | Order Service | `/orders` | Places order (triggers inter-service checks) |

---

## 5. Local Setup & Execution Guide

### Option 1: Run with Docker Compose (Recommended)

1. Clone or navigate to the `lab7` directory:
   ```bash
   cd lab7
   ```

2. Build and start all 4 services and MongoDB with Docker Compose:
   ```bash
   docker compose up --build
   ```

3. Confirm Gateway status:
   ```bash
   curl http://localhost:3000/health
   ```

### Option 2: Run Locally without Docker

1. Install dependencies across microservices:
   ```bash
   cd api-gateway && npm install
   cd ../user-service && npm install
   cd ../product-service && npm install
   cd ../order-service && npm install
   cd ..
   ```

2. Start all 4 microservices concurrently using `start-all.js`:
   ```bash
   node start-all.js
   ```

---

## 6. Cloud Deployment Guide (Render)

This repository includes a pre-configured `render.yaml` (Render Blueprint) to deploy the API Gateway and microservices onto Render Cloud.

### Step-by-Step Render Blueprint Deployment

1. **Push Repository to GitHub / GitLab**.
2. **Log into Render Dashboard** ([render.com](https://render.com)).
3. Click **New +** -> **Blueprint**.
4. Connect your Git repository containing `lab7/render.yaml`.
5. Render auto-detects `render.yaml` and provisions:
   - **`api-gateway`** (Public Web Service)
   - **`user-service`** (Private Internal Service)
   - **`product-service`** (Private Internal Service)
   - **`order-service`** (Private Internal Service)
6. Configure environment variables in Render (e.g. `MONGO_URI` pointing to MongoDB Atlas).
7. Click **Apply**. Once deployed, Render provides your public Gateway URL:
   `https://api-gateway-lab7.onrender.com`

---

## 7. Verification & Testing Evidence

### 1. Gateway Health Check (`GET /health`)
```json
{
  "status": "UP",
  "service": "api-gateway",
  "port": 3000,
  "timestamp": "2026-09-25T14:35:00.000Z",
  "uptimeSeconds": 142,
  "serviceRegistry": {
    "userService": "http://user-service:3001",
    "productService": "http://product-service:3002",
    "orderService": "http://order-service:3003"
  }
}
```

### 2. Unreachable Service Test (`503 Service Unavailable`)
If `user-service` is stopped, requesting `GET /users` via the gateway cleanly returns:
```json
{
  "error": "Service Unavailable",
  "statusCode": 503,
  "message": "The downstream microservice 'user-service' is currently unreachable or stopped.",
  "service": "user-service",
  "targetUrl": "http://user-service:3001/users",
  "timestamp": "2026-09-25T14:35:10.000Z",
  "details": "connect ECONNREFUSED 127.0.0.1:3001"
}
```

---

## 8. Reflection: Operational Impact of API Gateway & Cloud Deployment

Compared to Lab 6, introducing the API Gateway and cloud deployment fundamentally shifted how the system is operated:

> *In Lab 6, clients interacted directly with disparate microservices exposed on host ports (3001, 3002, 3003), requiring clients to manage internal service locations and handling connection crashes locally. In Lab 7, introducing the API Gateway established a single, secure ingress point that encapsulates the backend microservice network and standardizes cross-cutting concerns like logging and error handling. Transitioning service discovery to configuration variables enabled seamless deployment to cloud platforms like Render without altering application source code. Operations became significantly more resilient, as target service failures are intercepted at the gateway level with structured 503 responses rather than client-side connection drops.*
