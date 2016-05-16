# Deployment

The app is currently deployed on the Google Cloud using the Google Container Engine, [Kubernetes](http://kubernetes.io/).

The deployment of the elasticsearch container to the deployment pod is heavily inspired by the following guide
https://github.com/kubernetes/kubernetes/tree/release-1.2/examples/elasticsearch

Creating the cluster on the Google Cloud requires the following components:

- An elasticsearch [service](http://kubernetes.io/docs/user-guide/services/), running `kubectl create -f deployment/es-svc.yaml`

- A frontend [service](http://kubernetes.io/docs/user-guide/services/), running `kubectl create -f deployment/frontend-svc.yaml`

- A [deployment](http://kubernetes.io/docs/user-guide/deployments/#what-is-a-deployment) of the frontend and elasticsearch containers , running `kubectl create -f deployment/deployment.yaml`

## Updating the deployment

Make changes to the deployment/deployment.yaml or another .yaml file in the directory and use `kubectl update -f deployment/deployment.yaml` to push the update to the Google cloud infrastructure.
