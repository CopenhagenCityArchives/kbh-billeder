# Notice!

These scripts are not run via Circle CI - they are intended for execution from your local machine.
- ath88


# Deployment

The app is currently deployed on the Google Cloud using the Google Container
Engine, [Kubernetes](http://kubernetes.io/).

The deployment of the elasticsearch container to the deployment pod is heavily
inspired by the following guide
https://github.com/kubernetes/kubernetes/tree/release-1.2/examples/elasticsearch

Creating the cluster on the Google Cloud by running one of these scripts:

- [beta/initial.sh](./beta/initial.sh)
- [production/initial.sh](./production/initial.sh)
