# Microservices App — Automated Deployment

## Overview

Deploys a three-microservice application (frontend, backend, auth-service) on AWS EC2 using Docker, Terraform, Ansible, Kubernetes, GitHub Actions, and ArgoCD.

## Architecture

- **Docker** — containerizes each microservice
- **Terraform** — provisions EC2, VPC, Security Groups on AWS
- **Ansible** — configures EC2 with MicroK8s + ArgoCD
- **Kubernetes** — orchestrates containers via MicroK8s
- **GitHub Actions** — CI pipeline: builds images, pushes to DockerHub, updates manifests
- **ArgoCD** — CD: watches repo and auto-syncs cluster

## Deployment Steps

### 1. Prerequisites

- Terraform, AWS CLI, Ansible (via WSL), SSH key pair

### 2. Provision Infrastructure

```bash
cd terraform/
terraform init
terraform plan
terraform apply
# Note the EC2 IP from output
```

### 3. Configure Server

```bash
# Update ansible/inventory.ini with EC2 IP
cd ansible/
ansible ec2 -m ping -i inventory.ini
ansible-playbook -i inventory.ini playbook.yml
```

### 4. Set GitHub Secrets

Go to repo → Settings → Secrets → Actions and add:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

### 5. Trigger CI Pipeline

```bash
git push origin main
# GitHub Actions builds images and updates k8s manifests
```

### 6. Configure ArgoCD

```bash
# SSH into EC2, get ArgoCD password
microk8s kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# Browser: https://YOUR_EC2_IP:30080
# Apply ArgoCD app manifest
microk8s kubectl apply -f argocd/application.yaml
```

### 7. Verify

```bash
microk8s kubectl get pods
# Frontend: http://YOUR_EC2_IP:30081
# ArgoCD:   https://YOUR_EC2_IP:30080
```

## Tear Down

```bash
cd terraform/
terraform destroy
```
