# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying Switch in production.

## Quick Start

1. **Create the namespace**:

   ```bash
   kubectl apply -f namespace.yaml
   ```

2. **Create configuration**:

   ```bash
   kubectl apply -f configmap.yaml
   ```

3. **Create secrets** (replace with your actual values):

   ```bash
   kubectl create secret generic switch-secrets \
     --from-literal=ADMIN_API_KEY="prod-key-1,prod-key-2" \
     --from-literal=OPENAI_API_KEY="sk-your-openai-key" \
     --from-literal=ANTHROPIC_API_KEY="sk-ant-your-anthropic-key" \
     --from-literal=AWS_ACCESS_KEY_ID="AKIA1234567890ABCDEF" \
     --from-literal=AWS_SECRET_ACCESS_KEY="your-aws-secret" \
     --from-literal=MODEL_DEFINITIONS='{"credentialStores":{"openai-prod":{"type":"simple","source":"env","config":{"apiKeyVar":"OPENAI_API_KEY"}}},"models":{"gpt-4o":{"name":"gpt-4o","providers":[{"name":"openai-primary","provider":"openai","credentialsRef":"openai-prod","apiBase":"https://api.openai.com/v1","modelName":"gpt-4o","priority":1}]}}}' \
     --namespace=switch
   ```

4. **Deploy the application**:

   ```bash
   kubectl apply -f deployment.yaml
   kubectl apply -f service.yaml
   ```

5. **Optional: Enable autoscaling**:
   ```bash
   kubectl apply -f hpa.yaml
   ```

## Files Description

| File              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `namespace.yaml`  | Creates the `switch` namespace                       |
| `configmap.yaml`  | Non-sensitive configuration values                   |
| `secret.yaml`     | Template for sensitive credentials (edit before use) |
| `deployment.yaml` | Main application deployment with 3 replicas          |
| `service.yaml`    | ClusterIP service and headless service               |
| `hpa.yaml`        | Horizontal Pod Autoscaler (3-10 replicas)            |

## Configuration

### Environment Variables

The deployment uses two sources for configuration:

1. **ConfigMap** (`switch-config`) - Non-sensitive settings
2. **Secret** (`switch-secrets`) - API keys and credentials

### Resource Requirements

Default resource allocation per pod:

- **Requests**: 100m CPU, 128Mi memory
- **Limits**: 1000m CPU, 512Mi memory

Adjust based on your workload requirements.

### Scaling

- **Default**: 3 replicas
- **Autoscaling**: Scales 3-10 replicas based on CPU (70%) and memory (80%) usage
- **Rolling updates**: Max 1 surge, 0 unavailable for zero-downtime deployments

## Security Features

- **Non-root container**: Runs as user 1000
- **Read-only filesystem**: Enhanced security
- **Security headers**: Added via ingress annotations
- **TLS termination**: At ingress level
- **Rate limiting**: 100 requests/minute per IP

## Monitoring

The deployment includes:

- **Health checks**: Liveness and readiness probes
- **Prometheus metrics**: Enabled with annotations
- **Service discovery**: Headless service for monitoring

## Customization

### Resource Scaling

Adjust resources in `deployment.yaml`:

```yaml
resources:
  requests:
    cpu: 200m # Increase for higher load
    memory: 256Mi # Increase for more models
  limits:
    cpu: 2000m # Increase for higher throughput
    memory: 1Gi # Increase for complex routing
```

### Model Configuration

Update the `MODEL_DEFINITIONS` secret with your model configuration. See [configuration examples](../docs/examples/) for detailed examples.

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n switch
kubectl describe pod <pod-name> -n switch
```

### View Logs

```bash
kubectl logs -f deployment/switch -n switch
```

### Check Configuration

```bash
kubectl get configmap switch-config -n switch -o yaml
kubectl get secret switch-secrets -n switch -o yaml
```

### Test Health Endpoint

```bash
kubectl port-forward service/switch 3000:3000 -n switch
curl http://localhost:3000/health
```

## Production Considerations

1. **Load Balancer/Ingress**: Add an ingress controller or LoadBalancer service for external access
2. **TLS/HTTPS**: Configure TLS termination at the load balancer or ingress level
3. **Secrets Management**: Consider using external secret operators (e.g., External Secrets Operator)
4. **Monitoring**: Deploy Prometheus and Grafana for comprehensive monitoring
5. **Network Policies**: Add network policies for enhanced security
6. **Pod Disruption Budgets**: Add PDBs for high availability during cluster maintenance

## Example Commands

Deploy everything at once:

```bash
kubectl apply -f namespace.yaml -f configmap.yaml -f deployment.yaml -f service.yaml -f hpa.yaml
```

Clean up:

```bash
kubectl delete namespace switch
```

Check autoscaling status:

```bash
kubectl get hpa -n switch
kubectl describe hpa switch -n switch
```
